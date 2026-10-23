'use strict';

const { parseList } = require('./lint');
const {
  getInput, getBoolean, appendFile, setOutput, github,
} = require('./runtime');
const {
  latestVersionTag, nextVersion, highestBump, renderChangelog,
} = require('./changelog');

const MERGE_SUBJECT = /^Merge (pull request|branch|remote-tracking branch) /;

async function listTags(repo, token) {
  const tags = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await github('GET', `/repos/${repo}/tags?per_page=100&page=${page}`, token);
    tags.push(...batch.map((t) => t.name));
    if (batch.length < 100) break;
  }
  return tags;
}

async function listCommits(repo, token, base, head) {
  const commits = [];
  for (let page = 1; page <= 10; page += 1) {
    if (base) {
      const data = await github('GET', `/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?per_page=100&page=${page}`, token);
      commits.push(...data.commits);
      if (data.commits.length < 100 || commits.length >= data.total_commits) break;
    } else {
      const batch = await github('GET', `/repos/${repo}/commits?sha=${encodeURIComponent(head)}&per_page=100&page=${page}`, token);
      commits.push(...batch);
      if (batch.length < 100) break;
    }
  }
  return commits;
}

async function collectEntries(repo, token, commits) {
  const entries = [];
  const seenPrs = new Set();
  for (const commit of commits) {
    const pulls = await github('GET', `/repos/${repo}/commits/${commit.sha}/pulls`, token);
    const pr = pulls.find((p) => p.merged_at);
    if (pr) {
      if (seenPrs.has(pr.number)) continue;
      seenPrs.add(pr.number);
      entries.push({
        title: pr.title,
        body: pr.body || '',
        number: pr.number,
        url: pr.html_url,
        author: pr.user && pr.user.type !== 'Bot' ? pr.user.login : '',
      });
      continue;
    }
    const message = (commit.commit && commit.commit.message) || '';
    const [subject, ...rest] = message.split('\n');
    if (!subject || MERGE_SUBJECT.test(subject)) continue;
    entries.push({
      title: subject.trim(),
      body: rest.join('\n'),
      sha: commit.sha,
      author: commit.author ? commit.author.login : '',
    });
  }
  return entries;
}

async function run() {
  const token = getInput('github-token');
  const repo = getInput('repository', process.env.GITHUB_REPOSITORY || '');
  const head = getInput('to', process.env.GITHUB_SHA || 'HEAD');
  const prefix = getInput('tag-prefix', 'v');
  if (!repo) throw new Error('No se pudo determinar el repositorio.');

  const base = getInput('from') || latestVersionTag(await listTags(repo, token), prefix);
  const commits = await listCommits(repo, token, base, head);
  const entries = await collectEntries(repo, token, commits);

  const bump = highestBump(entries);
  const previousVersion = base ? base.replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '') : '0.0.0';
  const version = nextVersion(previousVersion, bump);
  const tag = `${prefix}${version}`;
  const date = new Date().toISOString().slice(0, 10);
  const changelog = renderChangelog(entries, {
    heading: bump === 'none' ? null : `${tag} (${date})`,
    excludeTypes: parseList(getInput('exclude-types')),
  });

  setOutput('previous-tag', base || '');
  setOutput('bump', bump);
  setOutput('next-version', version);
  setOutput('next-tag', tag);
  setOutput('changelog', changelog);
  setOutput('pr-count', entries.filter((e) => e.number).length);

  appendFile('GITHUB_STEP_SUMMARY', [
    '## Changelog',
    '',
    `**Desde:** ${base ? `\`${base}\`` : 'el inicio del repositorio'} · **Bump:** ${bump} · **Siguiente versión:** ${bump === 'none' ? '—' : `\`${tag}\``}`,
    '',
    changelog,
  ].join('\n'));

  let releaseUrl = '';
  if (getBoolean('create-release', false)) {
    if (bump === 'none') {
      console.log('No hay cambios que generen una versión nueva (solo docs, chore, etc.); no se crea release.');
    } else {
      const release = await github('POST', `/repos/${repo}/releases`, token, {
        tag_name: tag,
        target_commitish: head,
        name: tag,
        body: changelog.replace(/^## .*\n\n/, ''),
        draft: getBoolean('draft', false),
      });
      releaseUrl = release.html_url;
      console.log(`Release creado: ${releaseUrl}`);
    }
  }
  setOutput('release-url', releaseUrl);

  console.log(`${entries.length} cambios desde ${base || 'el inicio'}; bump ${bump}; siguiente versión ${tag}.`);
}

module.exports = { run, collectEntries };
