// Resolves the theme before first paint (render-blocking on purpose; tiny). Mode lives in
// <html data-theme-mode> (server-rendered from the user's saved preference) or the "theme" cookie.
(function () {
  var r = document.documentElement;
  function mode() {
    var m = r.getAttribute("data-theme-mode");
    if (m) return m;
    var c = document.cookie.match(/(?:^|; )theme=(light|dark|system)/);
    return c ? c[1] : "system";
  }
  function apply() {
    var m = mode();
    var dark = m === "dark" || (m === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    r.setAttribute("data-theme", dark ? "dark" : "light");
  }
  apply();
  document.addEventListener("astro:after-swap", apply);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
  window.__applyTheme = apply;
})();
