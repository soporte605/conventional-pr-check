'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const entry = path.join(__dirname, '..', 'src', 'index.js');
const { failureComment, isOwnComment, COMMENT_MARKER } = require('../src/index');

function runAction(pullRequest, inputs = {}, extraEvent = {}, extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpc-'));
  const eventPath = path.join(dir, 'event.json');
  const outputPath = path.join(dir, 'output');
  const summaryPath = path.join(dir, 'summary');
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: pullRequest, ...extraEvent }));
  fs.writeFileSync(outputPath, '');
  const env = {
    PATH: process.env.PATH,
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_OUTPUT: outputPath,
    GITHUB_STEP_SUMMARY: summaryPath,
    INPUT_COMMENT: 'false',
    ...extraEnv,
  };
  for (const [k, v] of Object.entries(inputs)) env[`INPUT_${k.toUpperCase()}`] = v;
  const proc = spawnSync(process.execPath, [entry], { env, encoding: 'utf8' });
  const outputs = {};
  const re = /^([\w-]+)<<(\S+)\n([\s\S]*?)\n\2$/gm;
  for (const m of fs.readFileSync(outputPath, 'utf8').matchAll(re)) outputs[m[1]] = m[3];
  return { status: proc.status, stdout: proc.stdout, outputs };
}

test('valid title passes and reports the bump', () => {
  const { status, outputs } = runAction({ number: 1, title: 'feat(api): add search', labels: [], body: '' });
  assert.equal(status, 0);
  assert.equal(outputs.valid, 'true');
  assert.equal(outputs.type, 'feat');
  assert.equal(outputs.scope, 'api');
  assert.equal(outputs.bump, 'minor');
});

test('BREAKING CHANGE in the PR body means a major bump', () => {
  const { outputs } = runAction({ number: 1, title: 'fix: rename flag', labels: [], body: 'BREAKING CHANGE: --foo is now --bar' });
  assert.equal(outputs.bump, 'major');
  assert.equal(outputs.breaking, 'true');
});

test('invalid title fails with a suggestion from labels', () => {
  const { status, stdout, outputs } = runAction({ number: 1, title: 'Login crashes', labels: [{ name: 'bug' }], body: '' });
  assert.equal(status, 1);
  assert.equal(outputs.valid, 'false');
  assert.equal(outputs.bump, 'none');
  assert.equal(outputs['suggested-title'], 'fix: login crashes');
  assert.match(stdout, /::error::Título sugerido: fix: login crashes/);
});

test('custom types input is respected', () => {
  const { status } = runAction({ number: 1, title: 'docs: readme', labels: [] }, { types: 'feat,fix' });
  assert.equal(status, 1);
});

test('summary marks BREAKING CHANGE from the PR body as breaking', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpc-'));
  const summaryPath = path.join(dir, 'summary');
  const eventPath = path.join(dir, 'event.json');
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 1, title: 'fix: x', labels: [], body: 'BREAKING CHANGE: y' } }));
  spawnSync(process.execPath, [entry], {
    env: {
      PATH: process.env.PATH, GITHUB_EVENT_PATH: eventPath, GITHUB_STEP_SUMMARY: summaryPath, INPUT_COMMENT: 'false',
    },
    encoding: 'utf8',
  });
  assert.match(fs.readFileSync(summaryPath, 'utf8'), /\| `fix` \| — \| sí \| \*\*major\*\* \|/);
});

test('suggestion that still needs a scope is reported', () => {
  const { status, stdout, outputs } = runAction({ number: 1, title: 'Add search', labels: [] }, { 'require-scope': 'true' });
  assert.equal(status, 1);
  assert.equal(outputs['suggested-title'], 'feat: add search');
  assert.match(stdout, /::warning::La sugerencia todavía necesita ajustes: Se requiere un scope/);
});

test('failureComment lists pending fixes for the suggestion', () => {
  const body = failureComment('Add search', ['mal'], 'feat: add search', ['Se requiere un scope.']);
  assert.match(body, /todavía necesita ajustes:\n\n- Se requiere un scope\./);
  assert.doesNotMatch(failureComment('x', ['mal'], 'chore: x'), /todavía/);
});

test('only own comments are reused', () => {
  const body = `${COMMENT_MARKER}\nhola`;
  const bot = { login: 'github-actions[bot]', type: 'Bot' };
  const person = { login: 'someone', type: 'User' };
  assert.equal(isOwnComment({ body, user: bot }), true);
  assert.equal(isOwnComment({ body, user: person }), false);
  assert.equal(isOwnComment({ body: 'hola', user: bot }), false);
  // Con un token personal, solo los comentarios de esa cuenta.
  assert.equal(isOwnComment({ body, user: person }, 'someone'), true);
  assert.equal(isOwnComment({ body, user: { login: 'other', type: 'User' } }, 'someone'), false);
});

test('no comment is posted when the title input is used', () => {
  const event = { repository: { full_name: 'acme/app' } };
  const env = { GITHUB_API_URL: 'http://127.0.0.1:9' };
  const inputs = { comment: 'true', 'github-token': 'x' };
  const pr = { number: 1, title: 'Bad title', labels: [] };
  // Sin `title`, intenta comentar y falla contra la API inexistente.
  assert.match(runAction(pr, inputs, event, env).stdout, /No se pudo publicar el comentario/);
  // Con `title`, no intenta comentar.
  assert.doesNotMatch(runAction(pr, { ...inputs, title: 'Bad title' }, event, env).stdout, /No se pudo publicar el comentario/);
});
