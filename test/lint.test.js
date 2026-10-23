'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseTitle,
  validateTitle,
  semverBump,
  suggestTitle,
  parseLabelMap,
} = require('../src/lint');

test('parseTitle reads type, scope, breaking and subject', () => {
  assert.deepEqual(parseTitle('feat(api)!: drop v1 endpoints'), {
    type: 'feat', scope: 'api', breaking: true, subject: 'drop v1 endpoints',
  });
  assert.deepEqual(parseTitle('fix: handle empty input'), {
    type: 'fix', scope: null, breaking: false, subject: 'handle empty input',
  });
  assert.equal(parseTitle('Fix the login bug'), null);
  assert.equal(parseTitle('feat:missing space'), null);
  assert.equal(parseTitle('feat: '), null);
});

test('validateTitle accepts valid titles', () => {
  for (const title of ['feat: add login', 'fix(ui): align button', 'feat!: new config format', 'chore(deps): bump node']) {
    assert.equal(validateTitle(title).valid, true, title);
  }
});

test('validateTitle rejects bad shape and unknown types', () => {
  assert.equal(validateTitle('Add login').valid, false);
  const unknown = validateTitle('feature: add login');
  assert.equal(unknown.valid, false);
  assert.match(unknown.errors[0], /feature/);
});

test('validateTitle enforces scope rules and length', () => {
  assert.equal(validateTitle('feat: x', { requireScope: true }).valid, false);
  assert.equal(validateTitle('feat(web): x', { scopes: ['api'] }).valid, false);
  assert.equal(validateTitle('feat(api): x', { scopes: ['api'], requireScope: true }).valid, true);
  assert.equal(validateTitle('feat: a long title', { maxLength: 10 }).valid, false);
});

test('semverBump maps types to bumps', () => {
  assert.equal(semverBump(parseTitle('feat!: x')), 'major');
  assert.equal(semverBump(parseTitle('fix(core)!: x')), 'major');
  assert.equal(semverBump(parseTitle('chore: x'), 'BREAKING CHANGE: removed flag'), 'major');
  assert.equal(semverBump(parseTitle('feat: x')), 'minor');
  assert.equal(semverBump(parseTitle('fix: x')), 'patch');
  assert.equal(semverBump(parseTitle('perf: x')), 'patch');
  assert.equal(semverBump(parseTitle('docs: x')), 'none');
  assert.equal(semverBump(null), 'none');
});

test('suggestTitle fixes misspelled or loose prefixes', () => {
  assert.equal(suggestTitle('Feature: Add login page.'), 'feat: add login page');
  assert.equal(suggestTitle('[FIX] crash on startup'), 'fix: crash on startup');
  assert.equal(suggestTitle('bugfix(auth) - token refresh'), 'fix(auth): token refresh');
  assert.equal(suggestTitle('feat:add search'), 'feat: add search');
  assert.equal(suggestTitle('Feat(api)!: Drop v1'), 'feat(api)!: drop v1');
});

test('suggestTitle derives the type from labels', () => {
  assert.equal(suggestTitle('Login page crashes', { labels: ['bug'] }), 'fix: login page crashes');
  assert.equal(suggestTitle('Dark mode', { labels: ['enhancement'] }), 'feat: dark mode');
  assert.equal(suggestTitle('New config', { labels: ['enhancement', 'breaking-change'] }), 'feat!: new config');
});

test('suggestTitle falls back to keywords, then default type', () => {
  assert.equal(suggestTitle('Add dark mode'), 'feat: add dark mode');
  assert.equal(suggestTitle('Fixes crash in parser'), 'fix: fixes crash in parser');
  assert.equal(suggestTitle('Update README'), 'chore: update README');
  assert.equal(suggestTitle('Update README', { defaultType: 'docs' }), 'docs: update README');
  assert.equal(suggestTitle('API cleanup'), 'chore: API cleanup');
});

test('suggestTitle output always validates', () => {
  const samples = ['', 'wip', 'Feature: x', '[Bug] y', 'Add z', 'random words here', 'docs - readme'];
  for (const s of samples) {
    const suggestion = suggestTitle(s, { labels: ['bug'] });
    assert.equal(validateTitle(suggestion).valid, true, `${s} → ${suggestion}`);
  }
});

test('parseLabelMap parses custom maps', () => {
  assert.deepEqual(parseLabelMap('Bug:fix, type: feature:feat'), { bug: 'fix', 'type: feature': 'feat' });
  assert.equal(parseLabelMap('').bug, 'fix');
});
