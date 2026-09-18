/**
 * FIN•OS Mobile Navigation — Phase 1
 * Injects a fixed topbar + slide-out sidebar on screens <= 900px.
 */

(function () {
  'use strict';

  // Guard: run once per page
  if (window._mobNavInit) return;
  window._mobNavInit = true;

  /* ── Inject ARIA roles onto sidebar nav + main ──────────────── */
  var sidebarNav = document.querySelector('.sidebar nav');
  if (sidebarNav && !sidebarNav.getAttribute('aria-label')) {
    sidebarNav.setAttribute('role', 'navigation');
    sidebarNav.setAttribute('aria-label', 'Main navigation');
  }
  var mainContent = document.querySelector('.main, main, .page');
  if (mainContent) {
    if (!mainContent.getAttribute('role')) mainContent.setAttribute('role', 'main');
    if (!mainContent.id) mainContent.id = 'main-content';
  }

  // Always inject; CSS media queries decide visibility. (Injecting only
  // when innerWidth <= 900 left desktop loads without a topbar after a
  // rotate/resize, and inline display styles leaked into desktop widths.)

  /* ── Inject styles ─────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    /* Hidden by default — the media query below is the only thing
       that ever shows mobile chrome. Never set display inline. */
    .mob-topbar { display: none; }

    /* Reset sidebar for mobile — override any inline positioning */
    @media (max-width: 900px) {
      .sidebar {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        height: 100vh !important;
        transform: translateX(-280px);
        transition: transform 0.38s cubic-bezier(0.16, 1, 0.3, 1),
                    box-shadow 0.38s ease;
        z-index: 400 !important;
      }
      .sidebar.mob-open {
        transform: translateX(0) !important;
        box-shadow: 8px 0 60px rgba(0,0,0,0.6);
      }
      .mob-topbar {
        display: flex !important;
      }
      .mob-backdrop {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.65);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        z-index: 350;
      }
      .mob-backdrop.mob-open {
        display: block;
      }
    }
  `;
  document.head.appendChild(style);

  /* ── Build topbar ───────────────────────────────────────────── */
  const topbar = document.createElement('div');
  topbar.className = 'mob-topbar';
  topbar.setAttribute('role', 'banner');
  // Layout, background and border all come from the .mob-topbar class in
  // layout.css (incl. its [data-theme="light"] override and the media
  // query that switches it to display:flex on mobile) — no inline style
  // needed, and one here would shadow the light-theme background/border.

  const hamBtn = document.createElement('button');
  hamBtn.className = 'mob-ham';
  hamBtn.setAttribute('aria-label', 'Open navigation menu');
  hamBtn.setAttribute('aria-expanded', 'false');
  hamBtn.setAttribute('aria-controls', 'sidebar');
  hamBtn.innerHTML = '&#9776;'; // ☰
  // Styling comes from the .mob-ham class in layout.css (incl. its
  // [data-theme="light"] override) — an inline style here would shadow
  // that override with a hardcoded white color, making the icon invisible
  // on light backgrounds.

  const logo = document.createElement('span');
  logo.className = 'mob-logo-text';
  logo.textContent = 'FIN•OS';
  // No hardcoded color here — layout.css's .mob-logo-text (and its
  // [data-theme="light"] override) handles that; layout-only inline props.
  logo.style.cssText = `
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0.04em;
    flex: 1;
    text-align: center;
  `;

  // Right spacer (keeps logo visually centered)
  const spacer = document.createElement('div');
  spacer.style.cssText = 'width: 38px; flex-shrink: 0;';

  topbar.appendChild(hamBtn);
  topbar.appendChild(logo);
  topbar.appendChild(spacer);

  /* ── Build backdrop ─────────────────────────────────────────── */
  const backdrop = document.createElement('div');
  backdrop.className = 'mob-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');

  /* ── Insert into DOM ────────────────────────────────────────── */
  document.body.insertBefore(topbar, document.body.firstChild);
  document.body.insertBefore(backdrop, document.body.firstChild);

  /* ── Find sidebar ───────────────────────────────────────────── */
  const sidebar = document.querySelector('.sidebar');
  if (sidebar && !sidebar.id) {
    sidebar.id = 'sidebar';
  }

  /* ── State ──────────────────────────────────────────────────── */
  let isOpen = false;

  function openSidebar() {
    if (!sidebar) return;
    isOpen = true;
    sidebar.classList.add('mob-open');
    backdrop.classList.add('mob-open');
    hamBtn.setAttribute('aria-expanded', 'true');
    hamBtn.setAttribute('aria-label', 'Close navigation menu');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    if (!sidebar) return;
    isOpen = false;
    sidebar.classList.remove('mob-open');
    backdrop.classList.remove('mob-open');
    hamBtn.setAttribute('aria-expanded', 'false');
    hamBtn.setAttribute('aria-label', 'Open navigation menu');
    document.body.style.overflow = '';
  }

  function toggleSidebar() {
    isOpen ? closeSidebar() : openSidebar();
  }

  /* ── Event listeners ────────────────────────────────────────── */

  // Hamburger button
  hamBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    toggleSidebar();
  });

  // Backdrop click closes sidebar
  backdrop.addEventListener('click', closeSidebar);

  // Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) closeSidebar();
  });

  // Clicking any <a> in the sidebar closes it
  if (sidebar) {
    sidebar.addEventListener('click', function (e) {
      if (e.target.tagName === 'A' || e.target.closest('a')) {
        closeSidebar();
      }
    });
  }

  // Ham button hover effect
  hamBtn.addEventListener('mouseenter', function () {
    this.style.background = 'rgba(255,255,255,0.08)';
    this.style.borderColor = 'rgba(255,255,255,0.2)';
  });
  hamBtn.addEventListener('mouseleave', function () {
    this.style.background = 'none';
    this.style.borderColor = 'rgba(255,255,255,0.1)';
  });

  /* ── Touch swipe-left to close ──────────────────────────────── */
  let touchStartX = 0;
  let touchStartY = 0;

  if (sidebar) {
    sidebar.addEventListener('touchstart', function (e) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    sidebar.addEventListener('touchend', function (e) {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
      // Swipe left >= 60px and mostly horizontal
      if (dx < -60 && dy < 80 && isOpen) {
        closeSidebar();
      }
    }, { passive: true });
  }

  /* ── Resize guard: clean up if viewport grows ───────────────── */
  let resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (window.innerWidth > 900 && isOpen) {
        closeSidebar();
      }
    }, 150);
  });

})();
