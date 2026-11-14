// Moja biblioteka: każdy link od kogoś z roku (przedmiot …/p/#KOD albo notatka …/n/#KOD), który otworzysz, sam
// trafia do biblioteki w tej przeglądarce, razem z tym, co trzeba, żeby pokazać go bez sieci: nazwa przedmiotu,
// kto udostępnia, ile zajęć, ostatni temat, do kiedy działa link. Biblioteka (…/biblioteka/) czyta tylko stąd i nie
// pyta serwera, więc nie podbija liczników otwarć u autora. Po zalogowaniu ta sama lista trafia na konto
// (biblioteka.js, tabela library_items), a usunięte pozycje zostają tu jako ślad (hidden, removed_at), żeby usunięcie
// dotarło też na inne urządzenia.
// localStorage „edunote.biblioteka”: { v: 1, items: [ { kind: "p"|"n", code, subject, topic, author, lessons, cards,
// questions, latest: { label, topic, date }, expires_at, added_at, opened_at, updated_at, hidden, removed_at } ] }
(function () {
  "use strict";
  var KEY = "edunote.biblioteka";
  var MAX = 60;
  var listeners = [];

  function read() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || "null");
      if (d && d.v === 1 && Array.isArray(d.items)) return d;
    } catch (e) {}
    return { v: 1, items: [] };
  }

  function write(d) {
    // najstarsze otwarcia odpadają, gdy lista robi się bardzo długa (limit miejsca w przeglądarce)
    d.items.sort(function (a, b) { return String(b.opened_at).localeCompare(String(a.opened_at)); });
    if (d.items.length > MAX) d.items.length = MAX;
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { return false; }
    listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
    return true;
  }

  function find(d, kind, code) {
    for (var i = 0; i < d.items.length; i++) if (d.items[i].kind === kind && d.items[i].code === code) return d.items[i];
    return null;
  }

  // Zapis po otwarciu linku: nowa pozycja albo odświeżone dane istniejącej. Zwraca true, gdy pozycja jest nowa.
  function save(entry) {
    if (!entry || !entry.code || (entry.kind !== "p" && entry.kind !== "n")) return false;
    var d = read(), now = new Date().toISOString(), item = find(d, entry.kind, entry.code), fresh = !item;
    if (!item) { item = { kind: entry.kind, code: entry.code, added_at: now }; d.items.push(item); }
    ["subject", "topic", "author", "lessons", "cards", "questions", "latest", "expires_at", "updated_at"].forEach(function (k) {
      if (entry[k] !== undefined && entry[k] !== null && entry[k] !== "") item[k] = entry[k];
    });
    item.opened_at = now;
    // ktoś, kto usunął pozycję, a potem znowu otworzył link, chce ją z powrotem
    if (item.hidden) fresh = true;
    delete item.hidden;
    delete item.removed_at;
    write(d);
    return fresh;
  }

  // usunięcie zostawia ślad (bez danych przedmiotu), żeby po zalogowaniu zniknęło też z konta i innych urządzeń
  function remove(kind, code) {
    var d = read(), item = find(d, kind, code), now = new Date().toISOString();
    if (!item) return;
    d.items = d.items.filter(function (x) { return x !== item; });
    d.items.push({ kind: kind, code: code, hidden: true, removed_at: now, opened_at: now, added_at: item.added_at });
    write(d);
  }

  // wszystkie pozycje razem ze śladami usunięć (do synchronizacji z kontem)
  function all() { return read().items.slice(); }

  // pozycje z konta: nowsza zmiana wygrywa (opened_at albo removed_at), bez wywoływania zapisu na serwer
  function merge(rows) {
    var d = read(), changed = false;
    (rows || []).forEach(function (r) {
      var item = find(d, r.kind, r.code), stamp = r.removed ? r.updated_at : r.opened_at;
      var local = item && (item.hidden ? item.removed_at : item.opened_at);
      if (item && local && stamp && String(local) >= String(stamp)) return;
      if (r.removed) {
        if (item && !item.hidden) { d.items = d.items.filter(function (x) { return x !== item; });
          d.items.push({ kind: r.kind, code: r.code, hidden: true, removed_at: r.updated_at, opened_at: r.updated_at, added_at: r.added_at }); changed = true; }
        return;
      }
      if (!item) { item = { kind: r.kind, code: r.code }; d.items.push(item); }
      var meta = r.meta || {};
      ["subject", "topic", "author", "lessons", "cards", "questions", "latest", "expires_at", "updated_at"].forEach(function (k) {
        if (meta[k] !== undefined && meta[k] !== null && meta[k] !== "") item[k] = meta[k];
      });
      item.added_at = r.added_at || item.added_at;
      item.opened_at = r.opened_at || item.opened_at;
      delete item.hidden; delete item.removed_at;
      changed = true;
    });
    if (changed) write(d);
    return changed;
  }

  // Pozycje do pokazania: najpierw ostatnio otwierane. Pojedyncze notatki z przedmiotu, który też jest w bibliotece,
  // nie dublują go (notatka z linku do przedmiotu ma kod KODPRZEDMIOTU-1a2b3c4d i w ogóle się nie zapisuje).
  function list() {
    return read().items.filter(function (x) { return !x.hidden; }).sort(function (a, b) {
      return String(b.opened_at).localeCompare(String(a.opened_at));
    });
  }

  function expired(item) {
    return !!(item && item.expires_at && new Date(item.expires_at) <= new Date());
  }

  function count() { return list().length; }

  // Adres pozycji względem strony, na której jesteśmy (prefix: "" na stronie głównej, "../" w podstronach)
  function href(item, prefix) {
    return (prefix || "") + (item.kind === "p" ? "p/#" : "n/#") + item.code;
  }

  // Wklejony link z czatu (albo sam kod) → { kind, code }; null, gdy to nie link do notatek EduNote
  function parse(text) {
    var s = String(text || "").trim();
    var m = /\/(p|n)\/?#([A-Za-z0-9]+(?:-[0-9a-f]{8})?)/.exec(s);
    if (m) return { kind: m[2].indexOf("-") > 0 ? "n" : m[1], code: m[2] };
    if (/^[A-Za-z0-9]{6,16}$/.test(s)) return { kind: "p", code: s };
    return null;
  }

  // Zgoda na bibliotekę: pierwszy zapis robi się jednym stuknięciem („Zapisz w mojej bibliotece”), a kolejne linki
  // zapisują się same. Bez stuknięcia strona niczego nie zapisuje w przeglądarce (art. 399 Prawa komunikacji
  // elektronicznej: zapis na urządzeniu bez prośby to szara strefa, więc prosimy raz, jasno i bez nacisku).
  var CONSENT = "edunote.biblioteka.zgoda";
  function consented() { try { return localStorage.getItem(CONSENT) === "1"; } catch (e) { return false; } }
  function consent() { try { localStorage.setItem(CONSENT, "1"); } catch (e) {} }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { if (k === "text") e.textContent = attrs[k]; else if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  var CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  // Pasek pod nagłówkiem przedmiotu albo notatki. Po zgodzie: zapis od razu, a przy pierwszym otwarciu tego linku
  // krótkie „Zapisano w Twojej bibliotece”. Bez zgody: przycisk „Zapisz w mojej bibliotece”.
  // opts.what: „ten przedmiot” albo „tę notatkę”; opts.hint: co tu zrobić (zdanie pod spodem)
  function offer(host, entry, opts) {
    if (!host || !entry) return;
    opts = opts || {};
    var seenKey = "edunote.zapis." + entry.kind + "." + entry.code, seen = false;
    try { seen = !!localStorage.getItem(seenKey); } catch (e) {}
    function strip(title, text, action) {
      host.innerHTML = "";
      var close = el("button", { type: "button", class: "icon-btn welcome-close", "aria-label": "Zamknij", title: "Zamknij" });
      close.innerHTML = CLOSE;
      close.addEventListener("click", function () {
        try { localStorage.setItem(seenKey, "1"); } catch (e) {}
        var M = window.eduMotion;
        if (M && M.ok()) M.leave(host, { y: -6, duration: 220 }).then(function () { host.classList.add("hidden"); }); else host.classList.add("hidden");
      });
      host.appendChild(el("div", { class: "welcome-text" }, [el("p", { class: "welcome-title" + (action ? " ask" : ""), text: title }), el("p", { text: text }), action || null]));
      host.appendChild(close);
      host.classList.remove("hidden");
    }
    // Przeglądarka w Messengerze, Instagramie albo Facebooku ma osobną, ulotną pamięć: biblioteka i postęp nauki
    // zostałyby tylko tam. Wtedy najpierw prośba o otwarcie w zwykłej przeglądarce (na Androidzie od razu w Chrome).
    if (inApp() && !seen) {
      var url = location.href;
      var go = el("button", { type: "button", class: "btn btn-primary btn-sm welcome-save", text: "Kopiuj link" });
      go.addEventListener("click", function () {
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () {
          if (window.eduToast) eduToast("Skopiowano. Wklej link w Chrome albo Safari.");
        }, function () { window.prompt("Skopiuj link:", url); });
      });
      strip("Otwórz w przeglądarce", "W aplikacji " + appName() + " biblioteka i postęp nauki znikają po zamknięciu. "
        + "Stuknij menu w rogu i wybierz „Otwórz w przeglądarce” albo skopiuj link do Chrome lub Safari.", go);
      return;
    }
    if (consented()) {
      var fresh = save(entry);
      if (fresh && !seen) strip("Zapisano w Twojej bibliotece", opts.hint || "Wrócisz tu z biblioteki, bez szukania linku na czacie.");
      return;
    }
    if (seen) return;
    var btn = el("button", { type: "button", class: "btn btn-primary btn-sm welcome-save", text: "Zapisz w mojej bibliotece" });
    btn.addEventListener("click", function () {
      consent();
      save(entry);
      try { localStorage.setItem(seenKey, "1"); } catch (e) {}
      strip("Zapisano w Twojej bibliotece", "Kolejne linki od ludzi z roku zapiszą się same. Biblioteka jest pod logo EduNote.");
    });
    strip("Wracaj tu bez szukania linku", "Zapisz " + (opts.what || "te notatki") + " w swojej bibliotece w tej przeglądarce. " + (opts.hint || ""), btn);
  }

  function inApp() { return /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|TikTok|musical_ly|LinkedInApp|Snapchat/i.test(navigator.userAgent || ""); }
  function appName() {
    var ua = navigator.userAgent || "";
    return /Instagram/i.test(ua) ? "Instagram" : /Messenger|Orca-Android/i.test(ua) ? "Messenger" : /TikTok|musical_ly/i.test(ua) ? "TikTok" : /LinkedIn/i.test(ua) ? "LinkedIn" : /Snapchat/i.test(ua) ? "Snapchat" : "Facebook";
  }

  // ta sama biblioteka w innej karcie
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) listeners.forEach(function (fn) { try { fn(); } catch (err) {} });
  });

  window.eduLibrary = {
    save: save, remove: remove, list: list, all: all, merge: merge, count: count, expired: expired, href: href, parse: parse, offer: offer, consented: consented, allow: consent,
    onChange: function (fn) { listeners.push(fn); }
  };
})();
