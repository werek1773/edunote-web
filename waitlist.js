// Zapis na EduNote na inne urządzenie (strona główna i strona notatki bez Maca): wybór urządzenia, z góry tego, na
// którym ktoś ogląda stronę, dobrowolny e-mail na jedną wiadomość, gdy wersja będzie gotowa, i przycisk „Zapisz mnie”.
// Pole e-mail stoi przed przyciskiem, więc nie znika, zanim ktoś zdąży je wypełnić. To, co już zapisane, zostaje
// w przeglądarce (bez adresu), więc każde miejsce na stronie pokazuje zapis jako zrobiony i nikt nie liczy się dwa razy.
// Zapisuje funkcja join_waitlist w Supabase (supabase/migrations/20261031170000_waitlist.sql). Gdy jej nie ma albo nie
// ma sieci, zostaje zwykły e-mail do autora, żeby przycisk nigdy nie był martwy.
(function () {
  "use strict";
  var SUPABASE = "https://fjpbdwsbktiylkborxvf.supabase.co";
  // klucz publiczny (publishable) – ten sam co w aplikacji, nie jest sekretem
  var KEY = "sb_publishable_XtknqXVtb-T-5Wd-oKFxEA_NINWbDsE";
  var PLATFORMS = ["android", "windows", "iphone"];
  var LABELS = { android: "Android", windows: "Windows", iphone: "iPhone" };
  var NAMES = { android: "Androida", windows: "Windowsa", iphone: "iPhone'a" };
  var STORE = "edunote.waitlist";

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === "text") e.textContent = attrs[k]; else if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function rpc(name, args) {
    return fetch(SUPABASE + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: { "apikey": KEY, "Content-Type": "application/json" },
      body: JSON.stringify(args || {})
    }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  }

  function mail(platform) {
    return "mailto:marcin@rozycki.pro?subject=" + encodeURIComponent("EduNote na " + (NAMES[platform] || "inne urządzenie"))
      + "&body=" + encodeURIComponent("Cześć, daj znać, gdy EduNote będzie na " + (NAMES[platform] || "moje urządzenie") + ".");
  }

  /** „Czekają już 3 osoby.”, „Czeka już 5 osób.” (przy 2–4 czasownik w liczbie mnogiej) */
  function waiting(n, platform) {
    var few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
    var text = (few ? "czekają już " : "czeka już ") + n + " " + (few ? "osoby" : "osób") + ".";
    return platform ? "Na " + NAMES[platform] + " " + text : text.charAt(0).toUpperCase() + text.slice(1);
  }

  /** „Androida”, „Androida i Windowsa” */
  function names(platforms) {
    var n = platforms.map(function (p) { return NAMES[p]; });
    return n.length > 1 ? n.slice(0, -1).join(", ") + " i " + n[n.length - 1] : n[0];
  }

  // co ta przeglądarka już zapisała: { platforms: ["android"], email: true }
  function saved() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE) || "null");
      if (s && Array.isArray(s.platforms)) return s;
    } catch (e) {}
    return { platforms: [], email: false };
  }

  function remember(platforms, email) {
    var s = saved();
    platforms.forEach(function (p) { if (s.platforms.indexOf(p) < 0) s.platforms.push(p); });
    s.email = s.email || email;
    try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {}
  }

  // urządzenie, na którym ktoś ogląda stronę (platform.js), zaznaczone z góry
  function guess() {
    var p = window.eduPlatform ? window.eduPlatform() : "other";
    if (p === "android" || p === "iphone") return p;
    if (p === "other" && /Windows/.test(navigator.userAgent)) return "windows";
    return null;
  }

  // jeden licznik na stronę, nawet gdy zapis jest w dwóch miejscach; po nowym zapisie pobierany od nowa
  var counts = null;
  function count() {
    if (!counts) counts = rpc("waitlist_count").catch(function () { counts = null; return []; });
    return counts;
  }

  // container: gdzie wstawić; opts.privacy: adres polityki prywatności względem strony
  function render(container, opts) {
    opts = opts || {};
    var chosen = {}, first = guess();
    if (first && saved().platforms.indexOf(first) < 0) chosen[first] = true;

    var buttons = el("div", { class: "waitlist-opts", role: "group", "aria-label": "Urządzenia" });
    var email = el("input", { type: "email", inputmode: "email", autocomplete: "email", placeholder: "Twój e-mail (opcjonalnie)" });
    var save = el("button", { class: "btn btn-primary", type: "button", text: "Zapisz mnie" });
    var form = el("div", { class: "waitlist-form" }, [
      el("label", { class: "waitlist-mail" }, [el("span", { text: "E-mail, jeśli chcesz jedną wiadomość, gdy będzie gotowe" }), email]),
      save
    ]);
    var status = el("p", { class: "waitlist-status", role: "status" });
    var box = el("div", { class: "waitlist" }, [
      el("p", { class: "waitlist-q", text: "Na czym chcesz EduNote?" }),
      buttons, form, status,
      el("p", { class: "waitlist-note" }, [document.createTextNode("Bez konta. E-mail tylko do tej jednej wiadomości. "),
        el("a", { href: opts.privacy || "prywatnosc/", text: "Prywatność" })])
    ]);
    PLATFORMS.forEach(function (p) {
      var b = el("button", { class: "btn btn-ghost btn-sm", type: "button", "aria-pressed": "false", "data-platform": p, text: LABELS[p] });
      b.addEventListener("click", function () { chosen[p] = !chosen[p]; update(); });
      buttons.appendChild(b);
    });

    // Zapisane urządzenia są zaznaczone na stałe. Formularz znika po zapisie i wraca, gdy ktoś zaznaczy kolejne.
    function update() {
      var s = saved();
      Array.prototype.forEach.call(buttons.children, function (b) {
        var p = b.getAttribute("data-platform"), done = s.platforms.indexOf(p) >= 0;
        if (done) chosen[p] = false;
        b.disabled = done;
        b.setAttribute("aria-pressed", String(done || !!chosen[p]));
      });
      var picked = PLATFORMS.some(function (p) { return chosen[p]; });
      form.hidden = s.platforms.length > 0 && !picked;
      if (!s.platforms.length) { if (picked) status.textContent = ""; return; }
      var text = "Zapisane: EduNote na " + names(s.platforms) + "." + (s.email ? " Dam znać mailem, gdy będzie gotowe." : "");
      status.textContent = text;
      count().then(function (rows) {
        var more = s.platforms.map(function (p) {
          var row = (rows || []).filter(function (r) { return r.platform === p; })[0];
          // sam zapisujący to 1, więc liczba ma sens dopiero od 2
          return row && Number(row.waiting) > 1 ? waiting(Number(row.waiting), s.platforms.length > 1 ? p : null) : "";
        }).filter(Boolean);
        if (more.length) status.textContent = text + " " + more.join(" ");
      });
    }

    save.addEventListener("click", function () {
      var platforms = PLATFORMS.filter(function (p) { return chosen[p]; });
      var address = email.value.trim();
      if (!platforms.length) { status.textContent = "Wybierz urządzenie."; return; }
      if (address && !email.checkValidity()) { status.textContent = "Sprawdź adres e-mail albo zostaw to pole puste."; email.focus(); return; }
      save.disabled = true;
      status.textContent = "Zapisuję…";
      Promise.all(platforms.map(function (p) { return rpc("join_waitlist", { p_platform: p, p_email: address || null }); }))
        .then(function () {
          remember(platforms, !!address);
          email.value = "";
          counts = null;
          // drugi zapis na tej samej stronie (np. w pytaniach) też pokazuje, że już zapisane
          window.dispatchEvent(new Event("edunote-waitlist"));
        })
        .catch(function () {
          // bez funkcji w bazie albo bez sieci: zwykły e-mail do autora
          status.textContent = "";
          status.appendChild(document.createTextNode("Nie udało się zapisać. "));
          status.appendChild(el("a", { href: mail(platforms[0]), text: "Napisz zamiast tego do autora" }));
        })
        .then(function () { save.disabled = false; });
    });
    window.addEventListener("edunote-waitlist", update);
    update();
    container.appendChild(box);
  }

  window.eduWaitlist = render;
})();
