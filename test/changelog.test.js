'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  latestVersionTag, nextVersion, highestBump, renderChangelog,
} = require('../src/changelog');
const { run } = require('../src/changelog-main');

test('latestVersionTag picks the highest semver tag with the prefix', () => {
  assert.equal(latestVersionTag(['v0.1.0', 'v0.10.0', 'v0.9.3', 'v0', 'latest']), 'v0.10.0');
  assert.equal(latestVersionTag(['release-1.0.0', 'v0.2.0'], 'release-'), 'release-1.0.0');
  assert.equal(latestVersionTag(['v0', 'foo']), null);
});

test('nextVersion applies the bump', () => {
  assert.equal(nextVersion('0.1.0', 'patch'), '0.1.1');
  assert.equal(nextVersion('0.1.3', 'minor'), '0.2.0');
  assert.equal(nextVersion('1.4.2', 'major'), '2.0.0');
  assert.equal(nextVersion('1.4.2', 'none'), '1.4.2');
  assert.equal(nextVersion('', 'minor'), '0.1.0');
});

test('highestBump takes the strongest change', () => {
  assert.equal(highestBump([{ title: 'docs: x' }, { title: 'fix: y' }]), 'patch');
  assert.equal(highestBump([{ title: 'fix: y' }, { title: 'feat: z' }]), 'minor');
  assert.equal(highestBump([{ title: 'feat: z' }, { title: 'chore: a', body: 'BREAKING CHANGE: b' }]), 'major');
  assert.equal(highestBump([{ title: 'docs: x' }, { title: 'Random title' }]), 'none');
});

test('renderChangelog groups entries by type', () => {
  const md = renderChangelog([
    { title: 'feat(api)!: drop v1', number: 3, url: 'https://x/3', author: 'ana' },
    { title: 'fix: crash on empty title', number: 2, url: 'https://x/2', author: 'luis' },
    { title: 'docs: update readme', number: 1, url: 'https://x/1' },
    { title: 'Random title', sha: 'abcdef1234567' },
  ], { heading: 'v1.0.0 (2026-10-23)' });

  assert.match(md, /^## v1\.0\.0 \(2026-10-23\)/);
  assert.match(md, /### Cambios incompatibles\n\n- \*\*api:\*\* drop v1 \(\[#3\]\(https:\/\/x\/3\)\) @ana/);
  assert.match(md, /### Nuevas funciones\n\n- \*\*api:\*\* drop v1/);
  assert.match(md, /### Correcciones\n\n- crash on empty title \(\[#2\]\(https:\/\/x\/2\)\) @luis/);
  assert.match(md, /### Documentación\n\n- update readme/);
  assert.match(md, /### Otros cambios\n\n- Random title \(abcdef1\)/);
  assert.ok(md.indexOf('Nuevas funciones') < md.indexOf('Correcciones'));
});

test('renderChangelog honors excluded types', () => {
  const md = renderChangelog([
    { title: 'chore: bump deps' },
    { title: 'ci: cache' },
    { title: 'fix: bug' },
    { title: 'Random' },
  ], { excludeTypes: ['chore', 'ci', 'other'] });
  assert.doesNotMatch(md, /Mantenimiento|CI|Otros/);
  assert.match(md, /Correcciones/);
  assert.equal(renderChangelog([]), 'Sin cambios.\n');
});

function mockGithub(routes) {
  const calls = [];
  global.fetch = async (url, init = {}) => {
    const { pathname, search } = new URL(url);
    const key = `${init.method || 'GET'} ${pathname}${search}`;
    calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
    const match = Object.keys(routes).find((r) => key.startsWith(r));
    if (!match) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(routes[match]), { status: 200 });
  };
  return calls;
}

function withEnv(inputs, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpc-cl-'));
  const outputPath = path.join(dir, 'output');
  fs.writeFileSync(outputPath, '');
  const saved = { ...process.env };
  Object.assign(process.env, {
    GITHUB_REPOSITORY: 'acme/app',
    GITHUB_SHA: 'headsha',
    GITHUB_API_URL: 'https://api.test',
    GITHUB_OUTPUT: outputPath,
    GITHUB_STEP_SUMMARY: path.join(dir, 'summary'),
    'INPUT_GITHUB-TOKEN': 't',
  });
  for (const [k, v] of Object.entries(inputs)) process.env[`INPUT_${k.toUpperCase()}`] = v;
  const restore = () => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  };
  return fn().then(() => {
    const outputs = {};
    const re = /^([\w-]+)<<(\S+)\n([\s\S]*?)\n\2$/gm;
    for (const m of fs.readFileSync(outputPath, 'utf8').matchAll(re)) outputs[m[1]] = m[3];
    restore();
    return outputs;
  }, (err) => {
    restore();
    throw err;
  });
}

const pr = (number, title, extra = {}) => ({
  number, title, body: '', merged_at: '2026-10-23T00:00:00Z', html_url: `https://github.com/acme/app/pull/${number}`, user: { login: 'dev', type: 'User' }, ...extra,
});

test('run builds the changelog since the latest tag and dedupes PRs', async () => {
  const calls = mockGithub({
    'GET /repos/acme/app/tags': [{ name: 'v0.1.0' }, { name: 'v0' }],
    'GET /repos/acme/app/compare/v0.1.0...headsha': {
      total_commits: 4,
      commits: [
        { sha: 'c1', commit: { message: 'fix: one' } },
        { sha: 'c2', commit: { message: 'fix: one (extra commit)' } },
        { sha: 'c3', commit: { message: 'Merge pull request #5 from x' } },
        { sha: 'c4', commit: { message: 'docs: direct push\n\nbody' }, author: { login: 'ops' } },
      ],
    },
    'GET /repos/acme/app/commits/c1/pulls': [pr(5, 'feat(ui): dark mode')],
    'GET /repos/acme/app/commits/c2/pulls': [pr(5, 'feat(ui): dark mode')],
    'GET /repos/acme/app/commits/c3/pulls': [pr(5, 'feat(ui): dark mode')],
    'GET /repos/acme/app/commits/c4/pulls': [],
  });

  const outputs = await withEnv({}, run);
  assert.equal(outputs['previous-tag'], 'v0.1.0');
  assert.equal(outputs.bump, 'minor');
  assert.equal(outputs['next-version'], '0.2.0');
  assert.equal(outputs['next-tag'], 'v0.2.0');
  assert.equal(outputs['pr-count'], '1');
  assert.match(outputs.changelog, /^## v0\.2\.0 /);
  assert.match(outputs.changelog, /- \*\*ui:\*\* dark mode \(\[#5\]/);
  assert.match(outputs.changelog, /- direct push \(c4\) @ops/);
  assert.equal(outputs['release-url'], '');
  assert.ok(!calls.some((c) => c.key.startsWith('POST')));
});

test('run creates a release when asked', async () => {
  const calls = mockGithub({
    'GET /repos/acme/app/tags': [],
    'GET /repos/acme/app/commits?sha=headsha': [{ sha: 'c1', commit: { message: 'x' } }],
    'GET /repos/acme/app/commits/c1/pulls': [pr(1, 'fix: first bug')],
    'POST /repos/acme/app/releases': { html_url: 'https://github.com/acme/app/releases/tag/v0.0.1' },
  });

  const outputs = await withEnv({ 'create-release': 'true' }, run);
  assert.equal(outputs['previous-tag'], '');
  assert.equal(outputs['next-tag'], 'v0.0.1');
  assert.equal(outputs['release-url'], 'https://github.com/acme/app/releases/tag/v0.0.1');
  const post = calls.find((c) => c.key.startsWith('POST'));
  assert.equal(post.body.tag_name, 'v0.0.1');
  assert.equal(post.body.target_commitish, 'headsha');
  assert.doesNotMatch(post.body.body, /^## /);
  assert.match(post.body.body, /first bug/);
});

test('run skips the release when nothing bumps the version', async () => {
  const calls = mockGithub({
    'GET /repos/acme/app/tags': [{ name: 'v1.2.3' }],
    'GET /repos/acme/app/compare/v1.2.3...headsha': { total_commits: 1, commits: [{ sha: 'c1', commit: { message: 'x' } }] },
    'GET /repos/acme/app/commits/c1/pulls': [pr(9, 'docs: typo')],
  });

  const outputs = await withEnv({ 'create-release': 'true' }, run);
  assert.equal(outputs.bump, 'none');
  assert.equal(outputs['next-version'], '1.2.3');
  assert.ok(!calls.some((c) => c.key.startsWith('POST')));
});
