/* set light or dark before the page draws, so it never flashes */
(function () { var t = null; try { t = JSON.parse(localStorage.getItem('db.theme')); } catch (e) { /* */ }
  document.documentElement.dataset.theme = t || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); })();
