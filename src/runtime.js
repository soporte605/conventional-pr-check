'use strict';

const fs = require('node:fs');

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

module.exports = { getInput, getBoolean, appendFile, setOutput, github };
