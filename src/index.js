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
const {
  getInput, getBoolean, appendFile, setOutput, github,
} = require('./runtime');

const COMMENT_MARKER = '<!-- conventional-pr-check -->';

// Solo se reutilizan comentarios propios: los de una cuenta bot (GITHUB_TOKEN o una
// GitHub App) o, si el token es personal, los de esa misma cuenta.
function isOwnComment(comment, login = '') {
  if (!comment.body || !comment.body.includes(COMMENT_MARKER) || !comment.user) return false;
  return login ? comment.user.login === login : comment.user.type === 'Bot';
}

async function tokenLogin(token) {
  try {
    const user = await github('GET', '/user', token);
    return user && user.type !== 'Bot' ? user.login : '';
  } catch (err) {
    return '';
  }
}

async function findComment(repo, number, token) {
  const login = await tokenLogin(token);
  for (let page = 1; page <= 10; page += 1) {
    const comments = await github('GET', `/repos/${repo}/issues/${number}/comments?per_page=100&page=${page}`, token);
    const found = comments.find((c) => isOwnComment(c, login));
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

function failureComment(title, errors, suggestion, pending = []) {
  return [
    COMMENT_MARKER,
    '### El título del PR no sigue Conventional Commits',
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
    ...(pending.length ? ['El título sugerido todavía necesita ajustes:', '', ...pending.map((e) => `- ${e}`), ''] : []),
    'Formato: `tipo(scope opcional)!: descripción`. Usa `!` para cambios que rompen compatibilidad.',
    'Más info: https://www.conventionalcommits.org/es/v1.0.0/',
  ].join('\n');
}

function summary(title, result, bump, suggestion, pending = []) {
  const lines = ['## Conventional PR check', '', `**Título:** \`${title.replace(/`/g, "'")}\``, ''];
  if (result.valid) {
    lines.push('Título válido.', '', '| Tipo | Scope | Breaking | Bump SemVer |', '|---|---|---|---|');
    lines.push(`| \`${result.parsed.type}\` | ${result.parsed.scope ? `\`${result.parsed.scope}\`` : '—'} | ${bump === 'major' ? 'sí' : 'no'} | **${bump}** |`);
  } else {
    lines.push('Título inválido.', '', ...result.errors.map((e) => `- ${e}`), '', `**Sugerencia:** \`${suggestion}\``);
    if (pending.length) lines.push('', 'La sugerencia todavía necesita ajustes:', '', ...pending.map((e) => `- ${e}`));
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
  const pending = result.valid ? [] : validateTitle(suggestion, options).errors;

  setOutput('valid', result.valid);
  setOutput('type', result.parsed ? result.parsed.type : '');
  setOutput('scope', result.parsed && result.parsed.scope ? result.parsed.scope : '');
  setOutput('breaking', result.parsed ? result.parsed.breaking || bump === 'major' : false);
  setOutput('bump', bump);
  setOutput('suggested-title', suggestion);
  appendFile('GITHUB_STEP_SUMMARY', summary(title, result, bump, suggestion, pending));

  const token = getInput('github-token');
  const shouldComment = getBoolean('comment', true) && pr && !titleOverride && token && event.repository;
  if (shouldComment) {
    const repo = event.repository.full_name;
    try {
      if (result.valid) {
        await deleteComment(repo, pr.number, token);
      } else {
        await upsertComment(repo, pr.number, token, failureComment(title, result.errors, suggestion, pending));
      }
    } catch (err) {
      console.log(`::warning::No se pudo publicar el comentario: ${err.message}`);
    }
  }

  if (result.valid) {
    console.log(`"${title}" es válido (bump: ${bump}).`);
  } else {
    for (const e of result.errors) console.log(`::error::${e}`);
    console.log(`::error::Título sugerido: ${suggestion}`);
    for (const e of pending) console.log(`::warning::La sugerencia todavía necesita ajustes: ${e}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.log(`::error::${err.stack || err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  run, failureComment, isOwnComment, COMMENT_MARKER,
};
