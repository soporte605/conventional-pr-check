'use strict';

(function main(root) {
  const lint = root.ConventionalPrLint || (typeof require === 'function' ? require('./lint.js') : null);

  function parsePrPath(pathname) {
    const match = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/.exec(pathname || '');
    if (!match) return null;
    return { owner: match[1], repo: match[2], number: Number(match[3]) };
  }

  function evaluate(pr) {
    const result = lint.validateTitle(pr.title);
    if (result.valid) {
      return {
        valid: true,
        bump: lint.semverBump(result.parsed, pr.body),
        errors: [],
        suggestion: pr.title.trim(),
      };
    }
    return {
      valid: false,
      bump: 'none',
      errors: result.errors.map((e) => e.replace(/`/g, '')),
      suggestion: lint.suggestTitle(pr.title, { labels: pr.labels || [] }),
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parsePrPath, evaluate };
    return;
  }

  const PANEL_ID = 'cpc-panel';
  let currentKey = '';

  function send(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response || !response.ok) {
          const error = new Error(response ? response.error : 'Sin respuesta');
          error.status = response ? response.status : 0;
          return reject(error);
        }
        return resolve(response.data);
      });
    });
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'text') node.textContent = value;
      else if (key === 'on') Object.entries(value).forEach(([evt, fn]) => node.addEventListener(evt, fn));
      else node.setAttribute(key, value);
    }
    for (const child of children) if (child) node.appendChild(child);
    return node;
  }

  function removePanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) existing.remove();
  }

  function dismissedKey(key) {
    return `cpc-dismissed:${key}`;
  }

  function isDismissed(key) {
    try {
      return sessionStorage.getItem(dismissedKey(key)) === '1';
    } catch (err) {
      return false;
    }
  }

  function dismiss(key) {
    try {
      sessionStorage.setItem(dismissedKey(key), '1');
    } catch (err) {
      return;
    }
  }

  function renderPanel(ref, key, pr, state) {
    removePanel();
    const note = el('div', { class: 'cpc-note' });
    const close = el('button', {
      class: 'cpc-close',
      type: 'button',
      'aria-label': 'Cerrar',
      text: '×',
      on: { click: () => { dismiss(key); removePanel(); } },
    });

    if (state.valid) {
      const panel = el('div', { id: PANEL_ID, class: 'cpc-panel', 'data-state': 'valid' }, [
        el('div', { class: 'cpc-head' }, [el('span', { text: 'Título válido' }), close]),
        el('div', { text: `Próximo bump SemVer: ${state.bump}` }),
      ]);
      document.body.appendChild(panel);
      return;
    }

    const input = el('input', { class: 'cpc-suggestion', type: 'text', value: state.suggestion, 'aria-label': 'Título sugerido' });
    const apply = el('button', { class: 'cpc-button cpc-button-primary', type: 'button', text: 'Aplicar título' });
    const copy = el('button', { class: 'cpc-button', type: 'button', text: 'Copiar' });

    apply.addEventListener('click', async () => {
      const title = input.value.trim();
      const check = lint.validateTitle(title);
      if (!check.valid) {
        note.textContent = check.errors[0].replace(/`/g, '');
        return;
      }
      apply.disabled = true;
      note.textContent = 'Guardando...';
      try {
        await send({ type: 'set-title', ...ref, title });
        note.textContent = 'Título actualizado. Recargando...';
        setTimeout(() => window.location.reload(), 600);
      } catch (err) {
        apply.disabled = false;
        note.textContent = err.status === 401 || err.status === 403 || err.status === 404
          ? 'GitHub rechazó el cambio. Revisa el token en las opciones de la extensión.'
          : `No se pudo actualizar: ${err.message}`;
      }
    });

    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(input.value.trim());
        note.textContent = 'Copiado.';
      } catch (err) {
        input.select();
        note.textContent = 'Selecciona y copia el texto manualmente.';
      }
    });

    if (!pr.hasToken) {
      apply.disabled = true;
      note.textContent = 'Para aplicar el título con un clic, agrega un token de GitHub en las opciones de la extensión.';
    }

    const panel = el('div', { id: PANEL_ID, class: 'cpc-panel', 'data-state': 'invalid' }, [
      el('div', { class: 'cpc-head' }, [el('span', { text: 'El título no sigue Conventional Commits' }), close]),
      el('ul', { class: 'cpc-errors' }, state.errors.map((e) => el('li', { text: e }))),
      el('div', { text: 'Título sugerido:' }),
      input,
      el('div', { class: 'cpc-actions' }, [apply, copy]),
      note,
    ]);
    document.body.appendChild(panel);
  }

  async function refresh() {
    const ref = parsePrPath(window.location.pathname);
    if (!ref) {
      currentKey = '';
      removePanel();
      return;
    }
    const key = `${ref.owner}/${ref.repo}#${ref.number}`;
    if (key === currentKey && document.getElementById(PANEL_ID)) return;
    currentKey = key;
    if (isDismissed(key)) {
      removePanel();
      return;
    }
    try {
      const pr = await send({ type: 'get-pr', ...ref });
      if (currentKey !== key) return;
      renderPanel(ref, key, pr, evaluate(pr));
    } catch (err) {
      removePanel();
    }
  }

  let lastPath = window.location.pathname;
  const observer = new MutationObserver(() => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      refresh();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('turbo:load', refresh);
  refresh();
}(typeof globalThis !== 'undefined' ? globalThis : this));
