(function () {
  /**
   * Which role is required to even LOAD each page. Anything not listed
   * here is public (accessible whether logged in or not, and regardless
   * of role) — e.g. /login.html and /register.html.
   *
   * This is enforced by REDIRECTING immediately if the current visitor's
   * role doesn't match — not just by hiding a nav link. Hiding a link is
   * cosmetic; a student could still reach an admin page by typing the URL,
   * a bookmark, or browser history. This blocks that directly.
   *
   * NOTE: this is a UX/defense-in-depth improvement, not the actual
   * security boundary — every real API endpoint (/api/analytics/*,
   * /api/attendance/scan, etc.) already requires the correct role on the
   * SERVER via the authenticate/requireAdmin middleware. Even if this
   * script were disabled entirely, no protected data could be fetched.
   * This just stops an unauthorized page from loading and showing an
   * empty/broken admin shell in the first place.
   */
  const PAGE_ACCESS = {
    '/dashboard.html': 'admin',
    '/scan.html': 'admin',
    '/events.html': 'admin',
    '/student-dashboard.html': 'student'
  };

  function homePageFor(role) {
    return role === 'admin' ? '/dashboard.html' : '/student-dashboard.html';
  }

  /**
   * Redirects away immediately if this page isn't allowed for the current
   * visitor. Runs BEFORE DOMContentLoaded so it fires as early as possible —
   * we don't want to wait for the whole page to render before kicking
   * someone out of a page they shouldn't be on.
   */
  function enforcePageAccess(user) {
    const requiredRole = PAGE_ACCESS[window.location.pathname];
    if (!requiredRole) return; // public page, nothing to enforce

    if (!user) {
      // Not logged in at all — send to login instead of showing a broken admin/student shell.
      window.location.replace('/login.html');
      return true;
    }

    if (user.role !== requiredRole) {
      // Logged in, but wrong role for this specific page — send them to
      // wherever THEY actually belong, instead of a dead end.
      window.location.replace(homePageFor(user.role));
      return true;
    }

    return false;
  }

  function ensureLogoutButton() {
    const nav = document.querySelector('.navbar nav');
    if (!nav || document.getElementById('logout-btn')) return;

    const button = document.createElement('button');
    button.id = 'logout-btn';
    button.type = 'button';
    button.className = 'btn secondary';
    button.textContent = 'Log out';
    button.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include'
        });
      } catch (err) {
        // Ignore logout network errors; always redirect to login for a clean sign-out.
      }
      window.location.href = '/login.html';
    });

    nav.appendChild(button);
  }

  function updateNavLinks(user) {
    const adminLinks = document.querySelectorAll('[data-role="admin"]');
    const nav = document.querySelector('.navbar nav');

    if (user) {
      ensureLogoutButton();
    } else {
      const logoutButton = document.getElementById('logout-btn');
      if (logoutButton && logoutButton.parentNode === nav) {
        logoutButton.remove();
      }
    }

    if (!user || user.role !== 'admin') {
      adminLinks.forEach((link) => link.remove());
    }

    if (user && user.role === 'student' && !document.querySelector('[data-role="student"]')) {
      const link = document.createElement('a');
      link.href = '/student-dashboard.html';
      link.dataset.role = 'student';
      link.textContent = 'My Profile';
      if (nav) nav.appendChild(link);
    }
  }

  async function init() {
    let user = null;

    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await res.json();
      if (data.success) user = data.user;
    } catch (err) {
      user = null; // treat any network failure as "not logged in" for safety
    }

    // Check access FIRST. If we're about to redirect away, don't bother
    // touching the DOM at all — the page is about to unload anyway.
    const redirected = enforcePageAccess(user);
    if (redirected) return;

    // Only reached if this visitor is actually allowed on this page.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => updateNavLinks(user));
    } else {
      updateNavLinks(user);
    }
  }

  init();
})();