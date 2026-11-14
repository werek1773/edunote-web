// Strona „Moja biblioteka” (…/biblioteka/): przedmioty i notatki z linków, które ta przeglądarka już otworzyła
// (library.js), od ostatnio otwieranych. Bez sieci: wszystko, co tu widać, zapisała strona przedmiotu albo notatki
// przy ostatnim otwarciu. „Na dziś” zbiera fiszki do powtórki z wyników nauki w tej przeglądarce (study.js).
(function () {
  "use strict";
  var L = window.eduLibrary, M = window.eduMotion || null;

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === "text") e.textContent = attrs[k]; else if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function plural(n, one, few, many) { return eduStudy.plural(n, one, few, many); }

  // „15 marca”, z rokiem tylko wtedy, gdy to inny rok
  function day(iso) {
    var d = new Date(iso), opts = { day: "numeric", month: "long", timeZone: "Europe/Warsaw" };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    return d.toLocaleDateString("pl-PL", opts);
  }
  // ostatni dzień działania linku (serwer trzyma chwilę wygaśnięcia, np. 16 marca o północy)
  function lastDay(iso) { return day(new Date(new Date(iso).getTime() - 1000).toISOString()); }
  function daysLeft(iso) { return Math.ceil((new Date(iso) - new Date()) / 86400000); }

  // Kolor kropki przedmiotu: stały dla nazwy, z kolorów aplikacji (strona nie zna koloru z planu autora)
  var DOTS = ["var(--sym1)", "var(--sym3)", "var(--sym2)", "var(--sym4)", "var(--sym5)"];
  function dot(name) {
    var h = 0, s = String(name || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return DOTS[Math.abs(h) % DOTS.length];
  }

  // Fiszki do powtórki w przedmiocie albo notatce: ostatni wynik każdej fiszki ze wszystkich podejść w tej
  // przeglądarce (zakładki przedmiotu, własny wybór zajęć, pojedyncza notatka), liczone bez powtórzeń
  function hardCount(item) {
    var prefix = "edunote.fiszki." + (item.kind === "p" ? "p." + item.code + "." : item.code), records = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || (item.kind === "p" ? k.indexOf(prefix) !== 0 : k !== prefix)) continue;
        var d = JSON.parse(localStorage.getItem(k) || "null");
        if (d && d.v === 1 && d.cards) records.push(d);
      }
    } catch (e) { return 0; }
    records.sort(function (a, b) { return String(a.at || "").localeCompare(String(b.at || "")); });
    var last = {};
    records.forEach(function (d) { for (var f in d.cards) last[f] = d.cards[f]; });
    return Object.keys(last).filter(function (f) { return last[f] === "hard"; }).length;
  }

  function removeButton(item, label) {
    var b = el("button", { type: "button", class: "icon-btn lib-remove", "aria-label": "Usuń z biblioteki: " + label, title: "Usuń z biblioteki" });
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    b.addEventListener("click", function (e) {
      e.preventDefault();
      var snapshot = JSON.parse(JSON.stringify(item));
      L.remove(item.kind, item.code);
      undoToast("Usunięto z biblioteki: " + label, function () { L.save(snapshot); });
    });
    return b;
  }

  // komunikat z „Cofnij” przez kilka sekund (link działa dalej, więc usunięcie łatwo odwrócić)
  function undoToast(text, undo) {
    var old = document.querySelector(".toast"); if (old) old.remove();
    var t = el("div", { class: "toast toast-action", role: "status" }, [el("span", { text: text })]);
    var b = el("button", { type: "button", class: "toast-btn", text: "Cofnij" });
    b.addEventListener("click", function () { undo(); t.remove(); });
    t.appendChild(b);
    document.body.appendChild(t);
    setTimeout(function () { if (t.isConnected) { t.classList.add("leaving"); setTimeout(function () { t.remove(); }, 320); } }, 6000);
  }

  function subjectCard(item) {
    var hard = hardCount(item), left = item.expires_at ? daysLeft(item.expires_at) : null;
    var meta = ["udostępnia " + (item.author ? L.person(item.author) : "ktoś z roku"), item.lessons ? plural(item.lessons, "notatka", "notatki", "notatek") : ""]
      .filter(Boolean).join(" · ");
    var latest = item.latest && (item.latest.topic || item.latest.label);
    var card = el("a", { class: "shelf-card", href: L.href(item, "../") }, [
      el("span", { class: "shelf-top" }, [
        el("span", { class: "shelf-dot", style: "background:" + dot(item.subject), "aria-hidden": "true" }),
        el("span", { class: "shelf-title", text: item.subject || "Przedmiot" })
      ]),
      meta ? el("span", { class: "shelf-meta", text: meta.charAt(0).toUpperCase() + meta.slice(1) }) : null,
      latest ? el("span", { class: "shelf-latest" }, [el("span", { class: "shelf-latest-label", text: (item.latest.label || "Ostatnio") + ": " }), item.latest.topic || ""]) : null,
      el("span", { class: "shelf-foot" }, [
        hard ? el("span", { class: "chip chip-due", text: plural(hard, "fiszka", "fiszki", "fiszek") + " do powtórki" }) : null,
        left !== null ? el("span", { class: "shelf-until" + (left <= 14 ? " soon" : ""), text: left <= 14
          ? (left <= 1 ? "Link działa do dziś" : "Link działa jeszcze " + plural(left, "dzień", "dni", "dni"))
          : "Link do " + lastDay(item.expires_at) }) : null
      ])
    ]);
    var li = el("li", { class: "shelf-item" }, [card, removeButton(item, item.subject || "przedmiot")]);
    return li;
  }

  function noteCard(item) {
    var card = el("a", { class: "shelf-card", href: L.href(item, "../") }, [
      el("span", { class: "shelf-top" }, [
        el("span", { class: "shelf-dot", style: "background:" + dot(item.subject), "aria-hidden": "true" }),
        el("span", { class: "shelf-kicker", text: item.subject || "Notatka" })
      ]),
      el("span", { class: "shelf-title", text: item.topic || item.subject || "Notatka z zajęć" }),
      el("span", { class: "shelf-foot" }, [
        item.latest && item.latest.date ? el("span", { class: "shelf-meta", text: day(item.latest.date + "T12:00:00") }) : null,
        item.expires_at ? el("span", { class: "shelf-until", text: "Link do " + lastDay(item.expires_at) }) : null
      ])
    ]);
    return el("li", { class: "shelf-item" }, [card, removeButton(item, item.topic || item.subject || "notatka")]);
  }

  function expiredCard(item) {
    return el("li", { class: "shelf-item" }, [
      el("div", { class: "shelf-card is-expired" }, [
        el("span", { class: "shelf-title", text: item.kind === "p" ? (item.subject || "Przedmiot") : (item.topic || item.subject || "Notatka") }),
        el("span", { class: "shelf-meta", text: "Link wygasł" + (item.expires_at ? " " + lastDay(item.expires_at) : "") })
      ]),
      removeButton(item, item.subject || item.topic || "notatka")
    ]);
  }

  function render(first) {
    var items = L.list(), live = items.filter(function (x) { return !L.expired(x); });
    var subjects = live.filter(function (x) { return x.kind === "p"; });
    var notes = live.filter(function (x) { return x.kind === "n"; });
    var gone = items.filter(L.expired);

    $("subjects").innerHTML = ""; $("notes").innerHTML = ""; $("expired-list").innerHTML = ""; $("today-list").innerHTML = "";
    subjects.forEach(function (x) { $("subjects").appendChild(subjectCard(x)); });
    notes.forEach(function (x) { $("notes").appendChild(noteCard(x)); });
    gone.forEach(function (x) { $("expired-list").appendChild(expiredCard(x)); });
    $("shelf").classList.toggle("hidden", !subjects.length);
    $("shelf-count").textContent = subjects.length > 1 ? String(subjects.length) : "";
    $("singles").classList.toggle("hidden", !notes.length);
    $("expired").classList.toggle("hidden", !gone.length);
    $("expired-meta").textContent = plural(gone.length, "link", "linki", "linków");
    $("empty").classList.toggle("hidden", items.length > 0 || !!(mine && mine.hasData()));
    $("lib-sub").textContent = live.length
      ? "Notatki od ludzi z roku w jednym miejscu. Każdy link, który otworzysz, sam się tu zapisuje."
      : "Notatki od ludzi z roku w jednym miejscu.";

    // Na dziś: przedmioty i notatki z fiszkami do powtórki
    var due = live.map(function (x) { return { item: x, hard: hardCount(x) }; }).filter(function (d) { return d.hard > 0; });
    due.forEach(function (d) {
      var x = d.item, name = x.kind === "p" ? x.subject : (x.topic || x.subject);
      var target = L.href(x, "../") + (x.kind === "p" ? "/powtorka" : "/fiszki");
      $("today-list").appendChild(el("li", {}, [el("a", { class: "today-item", href: target }, [
        el("span", { class: "today-name", text: name || "Notatki" }),
        el("span", { class: "today-count", text: "Powtórz " + plural(d.hard, "fiszkę", "fiszki", "fiszek") })
      ])]));
    });
    var own = mine ? mine.todayItems() : [];
    own.forEach(function (x) {
      $("today-list").appendChild(el("li", {}, [el("a", { class: "today-item", href: "#/przedmiot/" + x.subject.id }, [
        el("span", { class: "today-name", text: x.subject.name || "Przedmiot" }),
        el("span", { class: "today-count", text: "Powtórz " + plural(x.due, "fiszkę", "fiszki", "fiszek") })
      ])]));
    });
    $("today").classList.toggle("hidden", !due.length && !own.length);
    if (own.length) $("empty").classList.add("hidden");
    if (window.eduTypo) eduTypo(document.querySelector("main"));

    if (first && M && M.ok()) {
      M.stagger(document.querySelectorAll(".lib-head > *, #today:not(.hidden), .shelf-item, .lib-empty:not(.hidden), .lib-paste"),
        { step: 45, max: 8, y: 10 });
    }
  }

  // wklejony link: otwórz notatki (zapiszą się same po wczytaniu)
  $("paste").addEventListener("submit", function (e) {
    e.preventDefault();
    var raw = $("paste-input").value, p = L.parse(raw);
    $("paste-error").classList.toggle("hidden", !!p);
    if (!p) { $("paste-input").focus(); return; }
    // wklejenie linku w bibliotece to prośba o zapis: zgoda na bibliotekę od razu, bez drugiego pytania
    if (L.allow) L.allow();
    location.href = "../" + p.kind + "/#" + p.code;
  });

  // MARK: konto (etap 2) i moje notatki z Maca (etap 3)

  var mine = null;
  function account() {
    var host = $("account"), who = window.eduAuth && eduAuth.peek();
    host.innerHTML = "";
    $("login-cta").classList.toggle("hidden", !!who || !window.eduAuth || !eduAuth.open);
    if (!window.eduAuth) return;
    if (!who) {
      if (eduAuth.open) host.appendChild(el("a", { class: "btn btn-ghost btn-sm", href: "../zaloguj/?dalej=/biblioteka/", text: "Zaloguj się" }));
      return;
    }
    // inicjał w kółku (imię z aplikacji na Macu, nie z konta Google) i menu: kto, wylogowanie
    var initial = eduAuth.initial(who);
    var box = el("details", { class: "more account-menu" });
    var sum = el("summary", { class: "avatar", "aria-label": "Konto: " + who.email, title: who.email, text: initial });
    var list = el("div", { class: "more-list", role: "menu" }, [el("p", { class: "account-who", text: who.email }),
      el("a", { class: "more-item", role: "menuitem", href: "../konto/", text: "Konto i ustawienia" })]);
    var out = el("button", { type: "button", class: "more-item", role: "menuitem", text: "Wyloguj się z tej przeglądarki" });
    out.addEventListener("click", function () {
      eduAuth.signOut().then(function () { return window.eduSync ? eduSync.clear(who.id) : null; }).then(function () { location.href = "./"; });
    });
    list.appendChild(out);
    box.appendChild(sum); box.appendChild(list);
    host.appendChild(box);
  }

  function renderMine(api, offline, loading) {
    mine = api;
    var n = api.shelf($("mine-subjects"), $("mine-status"));
    // przy pierwszym pobieraniu i przy błędzie sekcja zostaje widoczna z wyjaśnieniem, zamiast zniknąć bez słowa
    $("mine").classList.toggle("hidden", !n && !loading && !offline);
    if (!n && loading) $("mine-status").textContent = "Pobieram notatki z Twojego Maca…";
    if (offline) $("mine-status").textContent = n ? "Bez połączenia: pokazuję ostatnio pobrane" : "Nie udało się pobrać notatek z Maca. Odśwież stronę za chwilę.";
    // z moimi notatkami półka linków od innych ma swoją nazwę
    $("shelf-title").textContent = n ? "Od ludzi z roku" : "Przedmioty";
    if (n) $("empty").classList.add("hidden");
    render(false);
  }

  // Biblioteka na koncie (tabela library_items, tylko własne wiersze przez RLS): przy każdym otwarciu biblioteki
  // nowsze zmiany z konta trafiają tutaj, a nowsze stąd na konto. Usunięcie to ślad removed = true. Bez tabeli na
  // serwerze (przed wdrożeniem) biblioteka działa jak dotąd, tylko w tej przeglądarce.
  var syncing = false;
  function stamp(x) { return x.hidden ? x.removed_at : x.opened_at; }
  function syncLibrary() {
    if (syncing || !window.eduAuth || !eduAuth.peek()) return Promise.resolve();
    syncing = true;
    var client;
    return eduAuth.session().then(function (s) {
      if (!s) return;
      client = eduAuth.client();
      return client.from("library_items").select("kind,code,meta,added_at,opened_at,removed,updated_at").then(function (r) {
        if (r.error) throw r.error;
        var rows = r.data || [], server = {};
        L.merge(rows);
        rows.forEach(function (x) { server[x.kind + ":" + x.code] = x; });
        var now = new Date().toISOString(), up = [];
        L.all().forEach(function (item) {
          var row = server[item.kind + ":" + item.code], rowStamp = row ? (row.removed ? row.updated_at : row.opened_at) : "";
          if (row && String(stamp(item) || "") <= String(rowStamp || "")) return;
          if (!row && item.hidden) return;
          var meta = {};
          ["subject", "topic", "author", "lessons", "cards", "questions", "latest", "expires_at", "updated_at"].forEach(function (k) { if (item[k] !== undefined) meta[k] = item[k]; });
          up.push({ user_id: s.user.id, kind: item.kind, code: item.code, meta: meta, added_at: item.added_at || now,
                    opened_at: item.opened_at || now, removed: !!item.hidden, updated_at: stamp(item) || now });
        });
        if (up.length) return client.from("library_items").upsert(up, { onConflict: "user_id,kind,code" }).then(function (u) { if (u.error) throw u.error; });
      });
    }).catch(function (e) {
      // brak tabeli albo sieci: biblioteka zostaje w tej przeglądarce, bez komunikatu
      if (window.console) console.info("Biblioteka na koncie niedostępna:", e && (e.message || e.code));
    }).then(function () { syncing = false; });
  }

  L.onChange(function () { render(false); });
  render(true);
  account();
  // imię z aplikacji (zamiast imienia z Google) do inicjału w pasku
  if (window.eduAuth && eduAuth.peek()) eduAuth.personName().then(function () { account(); });
  syncLibrary().then(function () { render(false); });
  // usunięcie albo powrót pozycji w tej karcie: od razu na konto
  L.onChange(function () { setTimeout(syncLibrary, 400); });
  if (window.eduMine && window.eduAuth && eduAuth.peek()) {
    eduMine.start({ home: $("home"), view: $("view"), render: renderMine, onHome: function () { render(false); } }).catch(function () {});
  }
})();
