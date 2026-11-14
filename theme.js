// Wygląd strony: automatyczny (jak w systemie), jasny albo ciemny. Aplikacja na Maca zostaje jasna; ciemny wygląd
// jest tylko na stronie. Wybór zostaje w tej przeglądarce (localStorage „edunote.theme”: „light” albo „dark”;
// brak wpisu = automatyczny). Skrypt w <head> każdej strony ustawia data-theme, zanim strona się narysuje, więc nic
// nie mruga; ten plik dokłada przełącznik i pilnuje zmian (inna karta, zmiana w systemie, kolor paska przeglądarki).
(function () {
  "use strict";
  var KEY = "edunote.theme";
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  // kolor paska przeglądarki na telefonie: taki jak tło strony
  var BAR = { light: "#F7F5EE", dark: "#191A15" };
  var listeners = [];

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return v === "light" || v === "dark" ? v : "system";
    } catch (e) { return "system"; }
  }

  function resolved(pref) {
    pref = pref || stored();
    if (pref === "light" || pref === "dark") return pref;
    return media && media.matches ? "dark" : "light";
  }

  // kolor paska przeglądarki (meta theme-color) taki jak tło strony w tej chwili
  function paintBar(shown) {
    Array.prototype.forEach.call(document.querySelectorAll('meta[name="theme-color"]'), function (m) {
      m.setAttribute("content", BAR[shown]);
    });
  }

  // zmiana wyglądu bez przejść na każdym elemencie (inaczej przyciski i karty przechodzą w różnym tempie);
  // data-theme ma zawsze wygląd na teraz (także przy automatycznym), data-theme-pref to wybór osoby
  function apply(pref, animate) {
    var change = function () {
      root.classList.add("theme-switching");
      root.dataset.theme = resolved(pref);
      root.dataset.themePref = pref;
      paintBar(resolved(pref));
      // jedna klatka bez przejść, potem z powrotem
      requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove("theme-switching"); }); });
    };
    var calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (animate && !calm && document.startViewTransition) document.startViewTransition(change); else change();
    listeners.forEach(function (fn) { try { fn(pref, resolved(pref)); } catch (e) {} });
  }

  function set(pref) {
    try {
      if (pref === "light" || pref === "dark") localStorage.setItem(KEY, pref); else localStorage.removeItem(KEY);
    } catch (e) {}
    apply(pref, true);
  }

  // inna karta zmieniła wygląd albo system przełączył się na noc
  window.addEventListener("storage", function (e) { if (e.key === KEY) apply(stored(), false); });
  if (media) {
    var onSystem = function () { if (stored() === "system") apply("system", false); };
    if (media.addEventListener) media.addEventListener("change", onSystem); else if (media.addListener) media.addListener(onSystem);
  }
  // wydruk i PDF zawsze jasne (ciemne tło i jasny tusz na papierze byłyby nieczytelne)
  var printedDark = false;
  window.addEventListener("beforeprint", function () {
    if (root.dataset.theme === "dark") { printedDark = true; root.dataset.theme = "light"; }
  });
  window.addEventListener("afterprint", function () {
    if (printedDark) { printedDark = false; root.dataset.theme = resolved(); }
  });

  // skrypt w <head> ustawił już wygląd; tu tylko pasek przeglądarki i stan dla przełączników
  root.dataset.themePref = stored();
  if (root.dataset.theme !== resolved()) root.dataset.theme = resolved();
  paintBar(resolved());

  var OPTIONS = [
    { id: "system", label: "Automatyczny", hint: "Jak w systemie" },
    { id: "light", label: "Jasny" },
    { id: "dark", label: "Ciemny" }
  ];
  var ICONS = {
    light: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5L7 17M17 7l1.5-1.5"/>',
    dark: '<path d="M19.6 14.6A8 8 0 0 1 9.4 4.4a8 8 0 1 0 10.2 10.2z"/>',
    system: '<circle cx="12" cy="12" r="8.2"/><path d="M12 3.8v16.4" /><path d="M12 3.8a8.2 8.2 0 0 1 0 16.4z" fill="currentColor" stroke="none"/>'
  };
  function icon(id) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[id] + "</svg>";
  }

  // Przełącznik w trzech wariantach:
  // - "menu": ikonka w pasku, po kliknięciu lista trzech wyglądów (strona główna, notatki, aplikacja na telefonie),
  // - "segmented": trzy przyciski obok siebie (Ustawienia w aplikacji, stopka),
  // obie wersje to zwykłe przyciski z aria-pressed / role=menuitemradio, więc działają z klawiatury i czytnikiem ekranu.
  function mount(host, opts) {
    if (!host) return null;
    opts = opts || {};
    if (opts.variant === "segmented") return segmented(host, opts);
    return menu(host, opts);
  }

  function segmented(host, opts) {
    var group = document.createElement("div");
    group.className = "theme-seg" + (opts.className ? " " + opts.className : "");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", opts.label || "Wygląd");
    var buttons = OPTIONS.map(function (o) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "theme-seg-btn";
      b.innerHTML = icon(o.id) + "<span></span>";
      b.querySelector("span").textContent = o.label;
      if (o.hint) b.title = o.hint;
      b.addEventListener("click", function () { set(o.id); });
      group.appendChild(b);
      return { id: o.id, el: b };
    });
    function sync() {
      var cur = stored();
      buttons.forEach(function (b) { b.el.setAttribute("aria-pressed", String(b.id === cur)); });
    }
    sync();
    listeners.push(sync);
    host.appendChild(group);
    return group;
  }

  function menu(host, opts) {
    var wrap = document.createElement("div");
    wrap.className = "theme-menu" + (opts.className ? " " + opts.className : "");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-btn theme-menu-btn";
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    var list = document.createElement("div");
    list.className = "theme-menu-list";
    list.setAttribute("role", "menu");
    list.hidden = true;
    var title = document.createElement("p");
    title.className = "theme-menu-title";
    title.textContent = "Wygląd strony";
    list.appendChild(title);
    var items = OPTIONS.map(function (o) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitemradio");
      b.className = "theme-menu-item";
      b.innerHTML = icon(o.id) + '<span class="theme-menu-label"></span>' + (o.hint ? '<span class="theme-menu-hint"></span>' : "");
      b.querySelector(".theme-menu-label").textContent = o.label;
      if (o.hint) b.querySelector(".theme-menu-hint").textContent = o.hint;
      b.addEventListener("click", function () { set(o.id); close(true); });
      list.appendChild(b);
      return { id: o.id, el: b };
    });
    function sync() {
      var cur = stored(), shown = resolved(cur);
      btn.innerHTML = icon(cur === "system" ? "system" : shown);
      btn.setAttribute("aria-label", "Wygląd strony: " + OPTIONS.filter(function (o) { return o.id === cur; })[0].label.toLowerCase());
      items.forEach(function (i) { i.el.setAttribute("aria-checked", String(i.id === cur)); });
    }
    function open() {
      list.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      wrap.classList.add("open");
      var cur = items.filter(function (i) { return i.el.getAttribute("aria-checked") === "true"; })[0] || items[0];
      cur.el.focus();
      document.addEventListener("pointerdown", outside, true);
      document.addEventListener("keydown", keys, true);
    }
    function close(focus) {
      list.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      wrap.classList.remove("open");
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", keys, true);
      if (focus) btn.focus();
    }
    function outside(e) { if (!wrap.contains(e.target)) close(false); }
    function keys(e) {
      if (e.key === "Escape") { e.preventDefault(); close(true); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      var i = items.map(function (x) { return x.el; }).indexOf(document.activeElement);
      var n = (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[n].el.focus();
    }
    btn.addEventListener("click", function () { if (list.hidden) open(); else close(true); });
    // fokus wyszedł poza menu (Tab): menu się zamyka
    wrap.addEventListener("focusout", function (e) { if (!list.hidden && e.relatedTarget && !wrap.contains(e.relatedTarget)) close(false); });
    wrap.appendChild(btn);
    wrap.appendChild(list);
    sync();
    listeners.push(sync);
    host.appendChild(wrap);
    return wrap;
  }

  window.eduTheme = {
    get: stored,
    set: set,
    resolved: resolved,
    onChange: function (fn) { listeners.push(fn); },
    mount: mount
  };

  // Polska typografia: jednoliterowe spójniki i przyimki (a, i, o, u, w, z) nie zostają same na końcu linii, tylko
  // przechodzą do następnego słowa (twarda spacja). Działa na tekście już na stronie, bez zmiany treści.
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, CODE: 1, PRE: 1, SVG: 1 };
  function typo(node) {
    if (!node) return;
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: function (t) {
        for (var p = t.parentNode; p && p !== node.parentNode; p = p.parentNode) {
          if (SKIP[p.nodeName] || (p.classList && p.classList.contains("katex"))) return NodeFilter.FILTER_REJECT;
        }
        return /(^|\s)[aiouwzAIOUWZ] /.test(t.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var list = [];
    while (walker.nextNode()) list.push(walker.currentNode);
    list.forEach(function (t) { t.nodeValue = t.nodeValue.replace(/(^|\s)([aiouwzAIOUWZ]) /g, "$1$2\u00A0"); });
  }
  window.eduTypo = typo;

  // przełączniki zaznaczone w HTML: <div data-theme-switch="menu"></div>
  function auto() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-theme-switch]"), function (h) {
      if (h.dataset.mounted) return;
      h.dataset.mounted = "1";
      mount(h, { variant: h.getAttribute("data-theme-switch") || "menu" });
    });
  }
  function ready() { auto(); typo(document.body); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else ready();
})();
