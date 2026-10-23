'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ext = path.join(__dirname, '..', 'extension');
const { parsePrPath, evaluate } = require('../extension/content.js');

test('extension/lint.js is an exact copy of src/lint.js', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lint.js'), 'utf8');
  const copy = fs.readFileSync(path.join(ext, 'lint.js'), 'utf8');
  assert.equal(copy, src, 'Ejecuta `npm run build:extension` para actualizar la copia.');
});

test('manifest is valid and references existing files', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, pkg.version);
  const files = [
    manifest.background.service_worker,
    manifest.options_page,
    ...manifest.content_scripts.flatMap((c) => [...c.js, ...(c.css || [])]),
  ];
  for (const file of files) assert.ok(fs.existsSync(path.join(ext, file)), file);
});

test('parsePrPath recognizes pull request pages only', () => {
  assert.deepEqual(parsePrPath('/acme/app/pull/42'), { owner: 'acme', repo: 'app', number: 42 });
  assert.deepEqual(parsePrPath('/acme/app/pull/42/files'), { owner: 'acme', repo: 'app', number: 42 });
  assert.equal(parsePrPath('/acme/app/pulls'), null);
  assert.equal(parsePrPath('/acme/app/issues/42'), null);
  assert.equal(parsePrPath('/acme/app/pull/new/main'), null);
});

test('evaluate reports valid titles with their bump', () => {
  const state = evaluate({ title: 'feat(ui): dark mode', body: '', labels: [] });
  assert.equal(state.valid, true);
  assert.equal(state.bump, 'minor');
  assert.equal(evaluate({ title: 'fix: x', body: 'BREAKING CHANGE: y', labels: [] }).bump, 'major');
});

test('evaluate suggests a title from labels for invalid titles', () => {
  const state = evaluate({ title: 'Login crashes', body: '', labels: ['bug'] });
  assert.equal(state.valid, false);
  assert.equal(state.suggestion, 'fix: login crashes');
  assert.ok(state.errors.length > 0);
  assert.ok(state.errors.every((e) => !e.includes('`')));
});
