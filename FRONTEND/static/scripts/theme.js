/* =========================================================================
   Kab Tak – theme.js
   Light / dark theme switching.

   Load in <head>, WITHOUT defer/async, so the saved theme is applied before
   the first paint (no white flash):
     <script src="scripts/theme.js"></script>

   - First visit: follows the OS setting (prefers-color-scheme).
   - After the user clicks the toggle, their choice is saved in localStorage
     and wins over the OS setting.
   - Any element with [data-theme-toggle] becomes a toggle button.
   - Fires a "kt:themechange" event on document so charts can re-colour.
   ========================================================================= */
(function () {
  'use strict';

  var KEY = 'kt-theme';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function save(theme) {
    try { localStorage.setItem(KEY, theme); } catch (e) { /* private mode: ignore */ }
  }
  function preferred() {
    var s = stored();
    if (s === 'dark' || s === 'light') return s;
    return media && media.matches ? 'dark' : 'light';
  }

  var ICON_MOON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792-.001 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278"/></svg>';
  var ICON_SUN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0m0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13m8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5M3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8m10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0m-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0m9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707M4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708"/></svg>';

  function syncCharts(theme) {
    if (typeof Chart === 'undefined') return;
    var dark = theme === 'dark';
    Chart.defaults.color = dark ? '#a6b4c8' : '#55677f';
    Chart.defaults.borderColor = dark ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.10)';
    if (Chart.instances) {
      Object.keys(Chart.instances).forEach(function (id) {
        var c = Chart.instances[id];
        if (c && c.options && c.options.scales) {
          Object.keys(c.options.scales).forEach(function (k) {
            var s = c.options.scales[k];
            s.ticks = s.ticks || {};
            s.grid = s.grid || {};
            s.ticks.color = Chart.defaults.color;
            s.grid.color = Chart.defaults.borderColor;
          });
        }
        if (c && c.update) c.update();
      });
    }
  }

  function syncButtons(theme) {
    var dark = theme === 'dark';
    var btns = document.querySelectorAll('[data-theme-toggle]');
    
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      b.innerHTML = dark ? ICON_SUN : ICON_MOON;
      b.setAttribute('aria-pressed', dark ? 'true' : 'false');
      b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      b.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }

  function apply(theme, animate) {
    if (animate) {
      root.classList.add('kt-theme-transition');
      setTimeout(function () { root.classList.remove('kt-theme-transition'); }, 300);
    }
    root.setAttribute('data-bs-theme', theme);
    syncButtons(theme);
    syncCharts(theme);
    document.dispatchEvent(new CustomEvent('kt:themechange', { detail: { theme: theme } }));
  }

  // 1. Apply immediately (runs in <head>, before first paint)
  root.setAttribute('data-bs-theme', preferred());

  // 2. Wire up buttons + charts once the DOM exists
  document.addEventListener('DOMContentLoaded', function () {
    syncButtons(root.getAttribute('data-bs-theme'));

    document.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-theme-toggle]') : null;
      if (!btn) return;
      var next = root.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
      save(next);
      apply(next, true);
    });

    // Charts are usually created after fetch(); recolour defaults once everything has loaded
    window.addEventListener('load', function () {
      syncCharts(root.getAttribute('data-bs-theme'));
    });
  });

  // 3. Follow the OS live, unless the user has made an explicit choice
  if (media && media.addEventListener) {
    media.addEventListener('change', function (e) {
      if (!stored()) apply(e.matches ? 'dark' : 'light', true);
    });
  }

  // Helper for chart code: window.ktTheme.isDark()
  window.ktTheme = {
    isDark: function () { return root.getAttribute('data-bs-theme') === 'dark'; },
    set: function (t) { save(t); apply(t, true); }
  };
})();
