'use strict';

const fs = require('node:fs');
const {
  DEFAULT_TYPES,
  validateTitle,
  semverBump,
  suggestTitle,
  parseLabelMap,
  parseList,
} = require('./lint');

const COMMENT_MARKER = '<!-- conventional-pr-check -->';

function getInput(name, fallback = '') {
  const key = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value.trim();
}

function getBoolean(name, fallback) {
  const value = getInput(name, String(fallback)).toLowerCase();
  return ['true', '1', 'yes', 'y', 'on'].includes(value);
}

function appendFile(envVar, text) {
  const file = process.env[envVar];
  if (file) fs.appendFileSync(file, text);
}

function setOutput(name, value) {
  const str = String(value);
  if (process.env.GITHUB_OUTPUT) {
    const delimiter = `EOF_${Math.random().toString(36).slice(2)}`;
    appendFile('GITHUB_OUTPUT', `${name}<<${delimiter}\n${str}\n${delimiter}\n`);
  } else {
    console.log(`${name}=${str}`);
  }
}

async function github(method, path, token, body) {
  const api = process.env.GITHUB_API_URL || 'https://api.github.com';
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'conventional-pr-check',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

async function findComment(repo, number, token) {
  for (let page = 1; page <= 10; page += 1) {
    const comments = await github('GET', `/repos/${repo}/issues/${number}/comments?per_page=100&page=${page}`, token);
    const found = comments.find((c) => c.body && c.body.includes(COMMENT_MARKER));
    if (found) return found;
    if (comments.length < 100) return null;
  }
  return null;
}

async function upsertComment(repo, number, token, body) {
  const existing = await findComment(repo, number, token);
  if (existing) {
    await github('PATCH', `/repos/${repo}/issues/comments/${existing.id}`, token, { body });
  } else {
    await github('POST', `/repos/${repo}/issues/${number}/comments`, token, { body });
  }
}

async function deleteComment(repo, number, token) {
  const existing = await findComment(repo, number, token);
  if (existing) await github('DELETE', `/repos/${repo}/issues/comments/${existing.id}`, token);
}

function failureComment(title, errors, suggestion) {
  return [
    COMMENT_MARKER,
    '### ❌ El título del PR no sigue Conventional Commits',
    '',
    `**Título actual:** \`${title.replace(/`/g, "'")}\``,
    '',
    ...errors.map((e) => `- ${e}`),
    '',
    '**Título sugerido:**',
    '',
    '```text',
    suggestion,
    '```',
    '',
    'Formato: `tipo(scope opcional)!: descripción`. Usa `!` para cambios que rompen compatibilidad.',
    'Más info: https://www.conventionalcommits.org/es/v1.0.0/',
  ].join('\n');
}

function summary(title, result, bump, suggestion) {
  const lines = ['## Conventional PR check', '', `**Título:** \`${title.replace(/`/g, "'")}\``, ''];
  if (result.valid) {
    lines.push('✅ Título válido.', '', '| Tipo | Scope | Breaking | Bump SemVer |', '|---|---|---|---|');
    lines.push(`| \`${result.parsed.type}\` | ${result.parsed.scope ? `\`${result.parsed.scope}\`` : '—'} | ${result.parsed.breaking ? 'sí' : 'no'} | **${bump}** |`);
  } else {
    lines.push('❌ Título inválido.', '', ...result.errors.map((e) => `- ${e}`), '', `**Sugerencia:** \`${suggestion}\``);
  }
  return `${lines.join('\n')}\n`;
}

async function run() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const event = eventPath && fs.existsSync(eventPath) ? JSON.parse(fs.readFileSync(eventPath, 'utf8')) : {};
  const pr = event.pull_request;

  const titleOverride = getInput('title');
  if (!pr && !titleOverride) {
    console.log('::warning::No hay pull_request en el evento y no se pasó `title`; no hay nada que validar.');
    return;
  }

  const title = titleOverride || pr.title;
  const labels = titleOverride && getInput('labels')
    ? parseList(getInput('labels'))
    : (pr ? (pr.labels || []).map((l) => l.name) : []);
  const types = parseList(getInput('types')).length ? parseList(getInput('types')) : DEFAULT_TYPES;

  const options = {
    types,
    scopes: parseList(getInput('scopes')),
    requireScope: getBoolean('require-scope', false),
    maxLength: Number.parseInt(getInput('max-length', '0'), 10) || 0,
    labelMap: parseLabelMap(getInput('label-map')),
    defaultType: getInput('default-type', 'chore'),
    labels,
  };

  const result = validateTitle(title, options);
  const bump = result.valid ? semverBump(result.parsed, !titleOverride && pr ? pr.body : '') : 'none';
  const suggestion = result.valid ? title.trim() : suggestTitle(title, options);

  setOutput('valid', result.valid);
  setOutput('type', result.parsed ? result.parsed.type : '');
  setOutput('scope', result.parsed && result.parsed.scope ? result.parsed.scope : '');
  setOutput('breaking', result.parsed ? result.parsed.breaking || bump === 'major' : false);
  setOutput('bump', bump);
  setOutput('suggested-title', suggestion);
  appendFile('GITHUB_STEP_SUMMARY', summary(title, result, bump, suggestion));

  const token = getInput('github-token');
  const shouldComment = getBoolean('comment', true) && pr && token && event.repository;
  if (shouldComment) {
    const repo = event.repository.full_name;
    try {
      if (result.valid) {
        await deleteComment(repo, pr.number, token);
      } else {
        await upsertComment(repo, pr.number, token, failureComment(title, result.errors, suggestion));
      }
    } catch (err) {
      console.log(`::warning::No se pudo publicar el comentario: ${err.message}`);
    }
  }

  if (result.valid) {
    console.log(`✅ "${title}" es válido (bump: ${bump}).`);
  } else {
    for (const e of result.errors) console.log(`::error::${e}`);
    console.log(`::error::Título sugerido: ${suggestion}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.log(`::error::${err.stack || err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { run, failureComment, COMMENT_MARKER };
