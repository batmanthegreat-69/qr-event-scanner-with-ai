/**
 * public/js/theme.js
 * Uses Bootstrap 5.3's built-in dark mode (data-bs-theme attribute) —
 * every Bootstrap component restyles itself automatically, no extra CSS.
 */
(function () {
  const STORAGE_KEY = 'qr-attendance-theme';

  function getPreferredTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-bs-theme', theme);
  }

  function updateToggleIcon(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;

    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    btn.setAttribute('title', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    btn.innerHTML = theme === 'dark'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"></path></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.2 15.5A8.5 8.5 0 0 1 8.5 3.8 8.6 8.6 0 1 0 20.2 15.5Z"></path></svg>';
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-bs-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    updateToggleIcon(next);
  }

  function insertToggleButton() {
    let btn = document.getElementById('theme-toggle-btn');
    if (!btn) {
      const nav = document.querySelector('.navbar nav');
      if (!nav) return;

      btn = document.createElement('button');
      btn.id = 'theme-toggle-btn';
      btn.type = 'button';
      btn.className = 'btn btn-sm btn-outline-light';
      btn.setAttribute('aria-label', 'Toggle dark mode');
      nav.appendChild(btn);
    }

    if (btn.dataset.themeToggleBound !== 'true') {
      btn.addEventListener('click', toggleTheme);
      btn.dataset.themeToggleBound = 'true';
    }
    updateToggleIcon(document.documentElement.getAttribute('data-bs-theme') || 'light');
  }

  applyTheme(getPreferredTheme());
  document.addEventListener('DOMContentLoaded', insertToggleButton);
})();
