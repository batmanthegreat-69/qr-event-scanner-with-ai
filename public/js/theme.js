/**
 * public/js/theme.js
 * Handles dark/light mode: remembers the user's choice in localStorage,
 * falls back to their OS preference on first visit, and injects a toggle
 * button into any .navbar nav on the page.
 *
 * Include this with: <script src="/js/theme.js"></script>
 * placed in <head>, right after your stylesheet <link> tag — this runs
 * the theme detection immediately so the page never "flashes" the wrong
 * theme before switching.
 */
(function () {
  const STORAGE_KEY = 'qr-attendance-theme';

  function getPreferredTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function updateToggleIcon(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    updateToggleIcon(next);
  }

  function insertToggleButton() {
    const nav = document.querySelector('.navbar nav');
    if (!nav || document.getElementById('theme-toggle-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'theme-toggle-btn';
    btn.type = 'button';
    btn.className = 'theme-toggle-btn';
    btn.setAttribute('aria-label', 'Toggle dark mode');
    btn.addEventListener('click', toggleTheme);
    nav.appendChild(btn);
    updateToggleIcon(document.documentElement.getAttribute('data-theme') || 'light');
  }

  // Apply the theme IMMEDIATELY (before the rest of the page loads) so
  // there's no flash of the wrong theme while the page is rendering.
  applyTheme(getPreferredTheme());

  // The toggle button itself has to wait until the navbar actually exists in the DOM.
  document.addEventListener('DOMContentLoaded', insertToggleButton);
})();
