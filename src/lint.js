'use strict';

const DEFAULT_TYPES = [
  'feat', 'fix', 'docs', 'style', 'refactor', 'perf',
  'test', 'build', 'ci', 'chore', 'revert',
];

const DEFAULT_LABEL_MAP = {
  bug: 'fix',
  fix: 'fix',
  enhancement: 'feat',
  feature: 'feat',
  documentation: 'docs',
  docs: 'docs',
  performance: 'perf',
  refactor: 'refactor',
  test: 'test',
  tests: 'test',
  ci: 'ci',
  build: 'build',
  dependencies: 'chore',
  chore: 'chore',
};

const TYPE_ALIASES = {
  feature: 'feat',
  features: 'feat',
  feat: 'feat',
  add: 'feat',
  bugfix: 'fix',
  hotfix: 'fix',
  bug: 'fix',
  fixes: 'fix',
  fixed: 'fix',
  doc: 'docs',
  documentation: 'docs',
  tests: 'test',
  testing: 'test',
  refactoring: 'refactor',
  performance: 'perf',
  chores: 'chore',
};

const KEYWORD_HINTS = [
  [/^(fix|fixes|fixed|bug|bugfix|hotfix|resolve|resolves|correct|corrige|arregla|soluciona)\b/i, 'fix'],
  [/^(add|adds|added|implement|implements|introduce|support|agrega|añade|implementa)\b/i, 'feat'],
  [/^(doc|docs|document|readme|documenta)\b/i, 'docs'],
  [/^(refactor|restructure|reorganize|refactoriza)\b/i, 'refactor'],
  [/^(test|tests|testing)\b/i, 'test'],
  [/^(bump|update deps|upgrade|deps)\b/i, 'chore'],
  [/^(speed up|optimi[sz]e|improve performance)\b/i, 'perf'],
  [/^(revert)\b/i, 'revert'],
];

const HEADER_RE = /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^()\r\n]+)\))?(?<breaking>!)?: (?<subject>\S.*)$/;

function parseTitle(title) {
  const match = HEADER_RE.exec(String(title || '').trim());
  if (!match) return null;
  const { type, scope, breaking, subject } = match.groups;
  return {
    type,
    scope: scope ? scope.trim() : null,
    breaking: Boolean(breaking),
    subject: subject.trim(),
  };
}

function validateTitle(title, options = {}) {
  const types = options.types || DEFAULT_TYPES;
  const requireScope = Boolean(options.requireScope);
  const scopes = options.scopes && options.scopes.length ? options.scopes : null;
  const maxLength = options.maxLength || 0;
  const errors = [];
  const trimmed = String(title || '').trim();

  const parsed = parseTitle(trimmed);
  if (!parsed) {
    errors.push('El título no sigue el formato `tipo(scope opcional): descripción`.');
    return { valid: false, errors, parsed: null };
  }
  if (!types.includes(parsed.type)) {
    errors.push(`El tipo \`${parsed.type}\` no está permitido. Tipos válidos: ${types.map((t) => `\`${t}\``).join(', ')}.`);
  }
  if (requireScope && !parsed.scope) {
    errors.push('Se requiere un scope, por ejemplo `feat(api): ...`.');
  }
  if (scopes && parsed.scope && !scopes.includes(parsed.scope)) {
    errors.push(`El scope \`${parsed.scope}\` no está permitido. Scopes válidos: ${scopes.map((s) => `\`${s}\``).join(', ')}.`);
  }
  if (maxLength > 0 && trimmed.length > maxLength) {
    errors.push(`El título tiene ${trimmed.length} caracteres; el máximo es ${maxLength}.`);
  }
  return { valid: errors.length === 0, errors, parsed };
}

function semverBump(parsed, body = '') {
  if (!parsed) return 'none';
  if (parsed.breaking || /^BREAKING[ -]CHANGE:/m.test(body || '')) return 'major';
  if (parsed.type === 'feat') return 'minor';
  if (parsed.type === 'fix' || parsed.type === 'perf') return 'patch';
  return 'none';
}

function typeFromLabels(labels, labelMap, types) {
  for (const raw of labels || []) {
    const name = String(raw).toLowerCase().trim();
    const type = labelMap[name];
    if (type && types.includes(type)) return type;
  }
  return null;
}

function cleanSubject(text) {
  let subject = String(text || '').trim().replace(/[.\s]+$/, '');
  if (/^[A-Z][a-z]/.test(subject)) subject = subject[0].toLowerCase() + subject.slice(1);
  return subject;
}

function suggestTitle(title, options = {}) {
  const types = options.types || DEFAULT_TYPES;
  const labelMap = options.labelMap || DEFAULT_LABEL_MAP;
  const fallback = options.defaultType && types.includes(options.defaultType)
    ? options.defaultType
    : (types.includes('chore') ? 'chore' : types[0]);
  let text = String(title || '').trim();

  let type = null;
  let scope = null;
  let breaking = false;

  const loose = /^\[?(?<word>[a-zA-Z]+)\]?(?:\s*\((?<scope>[^()]+)\))?(?<breaking>!)?\s*(?:[:\-–—|]\s*|\]\s*|\s+(?=\S))/.exec(text);
  if (loose) {
    const word = loose.groups.word.toLowerCase();
    const candidate = types.includes(word) ? word : TYPE_ALIASES[word];
    const hasSeparator = /[:\-–—|\]]/.test(loose[0]) || loose.groups.scope || loose.groups.breaking;
    if (candidate && types.includes(candidate) && (hasSeparator || types.includes(word))) {
      type = candidate;
      scope = loose.groups.scope ? loose.groups.scope.trim() : null;
      breaking = Boolean(loose.groups.breaking);
      text = text.slice(loose[0].length);
    }
  }

  if (!type) type = typeFromLabels(options.labels, labelMap, types);

  if (!type) {
    for (const [re, hinted] of KEYWORD_HINTS) {
      if (re.test(text) && types.includes(hinted)) {
        type = hinted;
        break;
      }
    }
  }

  if (!type) type = fallback;

  if (!breaking && (options.labels || []).some((l) => /^(breaking|breaking[- ]change)$/i.test(String(l)))) {
    breaking = true;
  }

  const subject = cleanSubject(text) || 'describe el cambio';
  return `${type}${scope ? `(${scope})` : ''}${breaking ? '!' : ''}: ${subject}`;
}

function parseLabelMap(input) {
  if (!input || !String(input).trim()) return { ...DEFAULT_LABEL_MAP };
  const map = {};
  for (const pair of String(input).split(/[,\n]/)) {
    const idx = pair.lastIndexOf(':');
    if (idx <= 0) continue;
    const label = pair.slice(0, idx).trim().toLowerCase();
    const type = pair.slice(idx + 1).trim();
    if (label && type) map[label] = type;
  }
  return map;
}

function parseList(input) {
  return String(input || '')
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = {
  DEFAULT_TYPES,
  DEFAULT_LABEL_MAP,
  parseTitle,
  validateTitle,
  semverBump,
  suggestTitle,
  parseLabelMap,
  parseList,
};
