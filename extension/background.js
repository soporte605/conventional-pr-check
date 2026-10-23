'use strict';

async function getToken() {
  const { token } = await chrome.storage.local.get('token');
  return token || '';
}

async function github(method, path, body) {
  const token = await getToken();
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || `HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

async function handle(message) {
  const { owner, repo, number } = message;
  const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${Number(number)}`;
  if (message.type === 'get-pr') {
    const pr = await github('GET', path);
    return {
      title: pr.title,
      body: pr.body || '',
      labels: (pr.labels || []).map((l) => l.name),
      hasToken: Boolean(await getToken()),
    };
  }
  if (message.type === 'set-title') {
    const pr = await github('PATCH', path, { title: message.title });
    return { title: pr.title };
  }
  throw new Error(`Mensaje desconocido: ${message.type}`);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err.message, status: err.status || 0 }));
  return true;
});
