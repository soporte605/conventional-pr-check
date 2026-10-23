'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const entry = path.join(__dirname, '..', 'src', 'index.js');

function runAction(pullRequest, inputs = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpc-'));
  const eventPath = path.join(dir, 'event.json');
  const outputPath = path.join(dir, 'output');
  const summaryPath = path.join(dir, 'summary');
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: pullRequest }));
  fs.writeFileSync(outputPath, '');
  const env = {
    PATH: process.env.PATH,
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_OUTPUT: outputPath,
    GITHUB_STEP_SUMMARY: summaryPath,
    INPUT_COMMENT: 'false',
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
