// Nauka fiszek w przeglądarce, w ramce na stronie: na stronie notatki w zakładce „Fiszki”, na stronie głównej
// w telefonie z przykładem. Dwa przyciski jak w prostym trybie aplikacji: „Jeszcze raz” odkłada kartę na koniec
// kolejki (karta wraca, aż będzie „Pamiętam”), „Pamiętam” ją zdejmuje. Liczy się pierwsza odpowiedź: na końcu
// „9 z 11 za pierwszym razem” i lista fiszek do powtórki. Z `opts.key` (kod notatki) wynik zostaje w tej przeglądarce
// (localStorage, bez konta i bez serwera): przerwaną naukę można dokończyć, a po powrocie powtórzyć same trudne.
// Powtórka trudnych nie poprawia wyniku pierwszego podejścia, tylko oznacza fiszki jako powtórzone. Postęp na
// serwerze to etap 2 planu strony (docs/strona-plan-po-badaniu.md). Klawiatura: spacja pokazuje odpowiedź, 1 i 2 oceniają.
(function () {
  "use strict";

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === "text") e.textContent = attrs[k]; else if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function button(text, cls, action) {
    var b = el("button", { class: cls, type: "button", text: text });
    b.addEventListener("click", action);
    return b;
  }

  /** „1 fiszka”, „3 fiszki”, „5 fiszek” */
  function plural(n, one, few, many) {
    var f = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
    return n + " " + (n === 1 ? one : f ? few : many);
  }

  /** Zadanie z liczbami, a nie pojęcie: długie pytanie, liczy się je na kartce */
  function isTask(c) { return c.front.length > 90; }

  /** Uczciwy czas: ok. 20 sekund na pojęcie i ponad minuta na zadanie */
  function minutes(cards) {
    var s = 0;
    cards.forEach(function (c) { s += isTask(c) ? 75 : 20; });
    return Math.max(1, Math.round(s / 60));
  }

  /** Twarde spacje, żeby na telefonie nic nie łamało się w pół: „10 000 zł”, „20 %”, „Q = 120 − 4P” (znak „=” zostaje
      przy lewej stronie, linia może się złamać dopiero po nim) */
  function tidy(s) {
    return String(s).replace(/(\d) (?=\d{3}(?!\d))/g, "$1 ").replace(/(\d) (zł|%|szt\.)/g, "$1 $2").replace(/ = /g, " = ");
  }

  /** „Została 1 fiszka”, „Zostały 3 fiszki”, „Zostało 5 fiszek” */
  function left(n) {
    var f = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
    return (n === 1 ? "Została " : f ? "Zostały " : "Zostało ") + plural(n, "fiszka", "fiszki", "fiszek");
  }

  // MARK: wynik w tej przeglądarce: { v: 1, at: czas, cards: { "<przód fiszki>": "ok" | "hard" | "fixed" } }
  // ok: pamiętana za pierwszym razem, hard: do powtórki, fixed: była do powtórki i przy powtórce już ją pamiętasz

  var PREFIX = "edunote.fiszki.";

  function load(key) {
    if (!key) return null;
    try {
      var d = JSON.parse(localStorage.getItem(PREFIX + key) || "null");
      return d && d.v === 1 && d.cards ? d : null;
    } catch (e) { return null; }
  }

  function save(key, d) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(d)); return true; } catch (e) { return false; }
  }

  /** Ostatnie podejście do tych fiszek: { ok, fixed, hard: [karty], rest: [karty bez odpowiedzi], seen, total }
      albo null, gdy nic nie zapisano */
  function progress(key, cards) {
    var d = load(key);
    if (!d) return null;
    var ok = 0, fixed = 0, hard = [], rest = [];
    cards.forEach(function (c) {
      var s = d.cards[c.front];
      if (s === "ok") ok++; else if (s === "fixed") fixed++; else if (s === "hard") hard.push(c); else rest.push(c);
    });
    var seen = ok + fixed + hard.length;
    return seen ? { ok: ok, fixed: fixed, hard: hard, rest: rest, seen: seen, total: cards.length } : null;
  }

  // cards: [{ front, back }]
  // opts.container: ramka, w której toczy się nauka
  // opts.compact: mała ramka (telefon na stronie głównej): bez listy do powtórki, bez fokusu na start
  // opts.key: pod jakim kluczem zapamiętać wynik (bez niego nic się nie zapisuje)
  // opts.only: fiszki na start (dokończenie albo same trudne); „Od początku” wraca do wszystkich
  // opts.mode: "fresh" (nowe podejście, domyślnie), "resume" (dokończenie przerwanego), "hard" (powtórka trudnych)
  // opts.done(result): węzeł dopisany do ekranu końcowego; result: { ok, hard: [karty] } z tej sesji
  // opts.onExit(): „Zakończ” w nagłówku i na końcu (bez niego nie ma tego przycisku)
  // opts.offset(): ile pikseli u góry zasłaniają przyklejone paski (nowa fiszka zaczyna się tuż pod nimi)
  function start(all, opts) {
    opts = opts || {};
    var root = opts.container, compact = !!opts.compact, mode = opts.mode || "fresh";
    var inner = el("div", { class: "study-box" + (compact ? " compact" : ""), tabindex: "-1" });
    var cards, queue, first, flipped, saved = false, back = false;

    // first: przód fiszki → pierwsza odpowiedź w tej sesji (true = „Pamiętam”)
    function reset(list) {
      cards = list;
      queue = list.slice();
      first = {};
      flipped = false;
    }

    // nowe podejście zaczyna wynik od zera, żeby nie mieszał się ze starym
    function fresh() {
      mode = "fresh";
      if (opts.key) saved = save(opts.key, { v: 1, at: new Date().toISOString(), cards: {} }) || saved;
    }

    function flip() { if (!flipped) { flipped = true; render(); } }

    function grade(ok) {
      var c = queue.shift();
      if (!(c.front in first)) { first[c.front] = ok; remember(c.front, ok); }
      if (!ok) queue.push(c);
      flipped = false;
      back = !ok && queue.length > 1;
      if (queue.length) render(); else finish();
    }

    // od razu po ocenie, żeby przerwana nauka nie gubiła wyniku; powtórka trudnych nie poprawia pierwszego podejścia
    function remember(front, ok) {
      if (!opts.key) return;
      var d = load(opts.key) || { v: 1, cards: {} };
      d.cards[front] = mode === "hard" ? (ok ? "fixed" : "hard") : (ok ? "ok" : "hard");
      d.at = new Date().toISOString();
      saved = save(opts.key, d) || saved;
    }

    function exit() {
      document.removeEventListener("keydown", onKey);
      inner.remove();
      if (opts.onExit) opts.onExit();
    }

    // nowa fiszka zaczyna się na ekranie, pod przyklejonym paskiem i zakładkami, a nie nad nimi
    function keepInView() {
      if (compact) return;
      var top = inner.getBoundingClientRect().top - (opts.offset ? opts.offset() : 0) - 8;
      if (top < 0) window.scrollBy(0, top);
    }

    function render() {
      inner.innerHTML = "";
      var c = queue[0], task = isTask(c);
      var head = el("div", { class: "study-head" }, [
        opts.onExit ? button("Zakończ", "link", exit) : el("span"),
        el("span", { class: "count num", text: left(queue.length) })
      ]);
      var bar = el("div", { class: "progress" }, [el("i", { style: "width:" + Math.round((cards.length - queue.length) / cards.length * 100) + "%" })]);
      // po „Jeszcze raz” licznik stoi, więc mówimy wprost, co się stało z tamtą fiszką
      var note = back ? el("p", { class: "back-note", role: "status", text: "Poprzednia fiszka wróci na koniec." }) : null;
      back = false;
      // zadanie z liczbami: zwykły krój i do lewej, a zamiast „Pamiętam” uczciwe „Policzone dobrze”
      var card = el("button", { class: "flash" + (task ? " long" : ""), type: "button", "aria-live": "polite" }, [
        first[c.front] === false ? el("span", { class: "again-tag", text: "Powtórka" }) : null,
        el("div", { class: "front", text: tidy(c.front) }),
        flipped ? el("div", { class: "back", text: tidy(c.back) })
          : el("div", { class: "hint", text: task ? "Policz na kartce, potem odkryj rozwiązanie" : "Najpierw spróbuj sobie przypomnieć" })
      ]);
      card.addEventListener("click", flip);
      var controls = flipped
        ? el("div", { class: "grades" }, [button(task ? "Jeszcze nie" : "Jeszcze raz", "btn btn-ghost", function () { grade(false); }),
                                          button(task ? "Policzone dobrze" : "Pamiętam", "btn btn-primary", function () { grade(true); })])
        : button(task ? "Pokaż rozwiązanie" : "Pokaż odpowiedź", "btn btn-primary btn-block btn-lg", flip);
      [head, bar, note, card, controls].forEach(function (n) { if (n) inner.appendChild(n); });
      if (!compact) inner.appendChild(el("p", { class: "keys", text: "Spacja: odpowiedź · 1: jeszcze raz · 2: pamiętam" }));
      keepInView();
    }

    function finish() {
      inner.innerHTML = "";
      var hard = cards.filter(function (c) { return first[c.front] === false; });
      var ok = cards.length - hard.length, total = cards.length;
      // po dokończeniu przerwanej nauki wynik całego podejścia, razem z fiszkami sprzed przerwy
      if (mode !== "hard" && opts.key) {
        var p = progress(opts.key, all);
        if (p && !p.rest.length) { hard = p.hard; ok = p.ok; total = p.total; }
      }
      var result = { ok: ok, hard: hard };
      var title = hard.length ? "Gotowe" : mode === "hard" ? "Trudne powtórzone" : "Wszystko pamiętasz";
      var score = mode === "hard"
        ? ok + " z " + total + " trudnych już pamiętasz"
        : ok + " z " + total + " za pierwszym razem";
      var box = el("div", { class: "done" }, [el("h2", { text: title }), el("p", { class: "score num", text: score })]);
      if (hard.length && !compact) {
        var list = el("ul", { class: "hard-list" });
        hard.slice(0, 5).forEach(function (c) { list.appendChild(el("li", { text: c.front })); });
        if (hard.length > 5) list.appendChild(el("li", { class: "muted", text: "i " + plural(hard.length - 5, "kolejna", "kolejne", "kolejnych") }));
        box.appendChild(el("div", { class: "hard-box" }, [el("p", { class: "label", text: "Do powtórki" }), list]));
      }
      if (hard.length) {
        box.appendChild(button("Powtórz trudne (" + hard.length + ")", compact ? "btn btn-ghost" : "btn btn-primary", function () {
          mode = "hard"; reset(hard); render(); if (!compact) inner.focus({ preventScroll: true });
        }));
      }
      var extra = opts.done && opts.done(result);
      if (extra) box.appendChild(extra);
      var links = el("div", { class: "done-links" }, [button("Od początku", "link", function () { fresh(); reset(all); render(); })]);
      if (opts.onExit) links.appendChild(button("Zakończ", "link", exit));
      box.appendChild(links);
      if (saved) box.appendChild(el("p", { class: "saved", text: "Wynik zostaje tylko w tej przeglądarce." }));
      inner.appendChild(box);
      if (!compact) inner.focus({ preventScroll: true });
      keepInView();
    }

    function onKey(e) {
      if (!inner.isConnected) { document.removeEventListener("keydown", onKey); return; }
      if (!inner.contains(e.target) && e.target !== document.body) return;
      if (compact && !inner.contains(e.target)) return;
      if (!queue.length || e.metaKey || e.ctrlKey || e.altKey) return;
      // przycisk w fokusie sam obsłuży spację i Enter
      if (e.key === " " && e.target.tagName !== "BUTTON") { e.preventDefault(); flip(); }
      else if (flipped && e.key === "1") grade(false);
      else if (flipped && e.key === "2") grade(true);
    }

    if (mode === "fresh") fresh();
    reset(opts.only && opts.only.length ? opts.only : all);
    if (!cards.length) return;
    root.innerHTML = "";
    root.appendChild(inner);
    document.addEventListener("keydown", onKey);
    render();
    if (!compact) inner.focus({ preventScroll: true });
  }

  window.eduStudy = { start: start, plural: plural, minutes: minutes, progress: progress, tidy: tidy };
})();
