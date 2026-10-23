'use strict';

const { parseTitle, semverBump } = require('./lint');

const SECTIONS = [
  ['feat', '✨ Nuevas funciones'],
  ['fix', '🐛 Correcciones'],
  ['perf', '⚡ Rendimiento'],
  ['revert', '⏪ Reversiones'],
  ['refactor', '♻️ Refactorización'],
  ['docs', '📝 Documentación'],
  ['test', '✅ Pruebas'],
  ['build', '📦 Build'],
  ['ci', '🔧 CI'],
  ['style', '🎨 Estilo'],
  ['chore', '🧹 Mantenimiento'],
];

const BUMP_ORDER = ['none', 'patch', 'minor', 'major'];

function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(text || '').trim());
  if (!match) return null;
  return match.slice(1, 4).map(Number);
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function latestVersionTag(tags, prefix = 'v') {
  let best = null;
  for (const tag of tags) {
    if (!String(tag).startsWith(prefix)) continue;
    const version = parseVersion(String(tag).slice(prefix.length));
    if (version && (!best || compareVersions(version, best.version) > 0)) best = { tag, version };
  }
  return best ? best.tag : null;
}

function nextVersion(previous, bump) {
  const [major, minor, patch] = parseVersion(previous) || [0, 0, 0];
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  return `${major}.${minor}.${patch}`;
}

function entryBump(entry) {
  return semverBump(parseTitle(entry.title), entry.body);
}

function highestBump(entries) {
  return entries.reduce((acc, e) => {
    const bump = entryBump(e);
    return BUMP_ORDER.indexOf(bump) > BUMP_ORDER.indexOf(acc) ? bump : acc;
  }, 'none');
}

function formatEntry(entry, parsed) {
  const subject = parsed ? parsed.subject : entry.title;
  const scope = parsed && parsed.scope ? `**${parsed.scope}:** ` : '';
  const ref = entry.number ? ` ([#${entry.number}](${entry.url}))` : (entry.sha ? ` (${entry.sha.slice(0, 7)})` : '');
  const author = entry.author ? ` @${entry.author}` : '';
  return `- ${scope}${subject}${ref}${author}`;
}

function renderChangelog(entries, options = {}) {
  const exclude = new Set(options.excludeTypes || []);
  const groups = new Map(SECTIONS.map(([type]) => [type, []]));
  const breaking = [];
  const other = [];

  for (const entry of entries) {
    const parsed = parseTitle(entry.title);
    if (parsed && entryBump(entry) === 'major') breaking.push(formatEntry(entry, parsed));
    if (!parsed) {
      if (!exclude.has('other')) other.push(formatEntry(entry, null));
    } else if (exclude.has(parsed.type)) {
      continue;
    } else if (groups.has(parsed.type)) {
      groups.get(parsed.type).push(formatEntry(entry, parsed));
    } else {
      other.push(formatEntry(entry, parsed));
    }
  }

  const lines = [];
  if (options.heading) lines.push(`## ${options.heading}`, '');
  if (breaking.length) lines.push('### ⚠️ Cambios incompatibles', '', ...breaking, '');
  for (const [type, title] of SECTIONS) {
    const items = groups.get(type);
    if (items.length) lines.push(`### ${title}`, '', ...items, '');
  }
  if (other.length) lines.push('### Otros cambios', '', ...other, '');
  if (!breaking.length && !other.length && SECTIONS.every(([t]) => !groups.get(t).length)) {
    lines.push('Sin cambios.', '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

module.exports = {
  parseVersion,
  latestVersionTag,
  nextVersion,
  entryBump,
  highestBump,
  renderChangelog,
};
