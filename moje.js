// Moje notatki w bibliotece (etap 3): po zalogowaniu biblioteka pokazuje też przedmioty i notatki z Maca tej osoby,
// z synchronizacji (sync.js), a pod adresami …/biblioteka/#/przedmiot/<id> i …/biblioteka/#/notatka/<id> otwiera je
// tak samo jak notatki z linku: ten sam note.js rysuje treść, quiz i fiszki. Do tego to, czego link nie pokazuje:
// zdjęcia, tablice, własne dopiski i tekst zajęć (zwinięty). Wszystko tylko do czytania i nauki; edycja to etap 4.
(function () {
  "use strict";
  var A = window.eduAuth, S = window.eduSync, V = window.eduNoteView, M = window.eduMotion || null;
  var client = null, uid = "", model = null, home = null, view = null, onHome = null;

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === "text") e.textContent = attrs[k]; else if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function plural(n, one, few, many) { return eduStudy.plural(n, one, few, many); }
  function day(d, withYear) {
    if (!d) return "";
    var o = { day: "numeric", month: "long", timeZone: "Europe/Warsaw" };
    if (withYear || d.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
    return d.toLocaleDateString("pl-PL", o);
  }

  // MARK: dane

  function subjects() {
    return Object.keys(model.subjects).map(function (id) { return model.subjects[id]; })
      .sort(function (a, b) { return (a.sortIndex - b.sortIndex) || String(a.name).localeCompare(String(b.name), "pl"); });
  }
  function notesOf(subjectID) {
    return Object.keys(model.notes).map(function (id) { return model.notes[id]; })
      .filter(function (n) { return n.subjectID === subjectID && n.kindRaw !== "inbox"; })
      .sort(function (a, b) { return (b.date - a.date) || (b.startMinute - a.startMinute); });
  }
  function due(cards) {
    var now = Date.now();
    return cards.filter(function (c) { var d = S.date(c.due); return d && d.getTime() <= now; });
  }
  function subjectCards(subjectID) {
    return Object.keys(model.cards).map(function (id) { return model.cards[id]; }).filter(function (c) { return c.subjectID === subjectID && !c.image; });
  }
  // rodzaj zajęć z notatki („wykład”, „ćwiczenia”…), jak na stronie linku do przedmiotu
  function typeOf(n) { return V.typeInfo(n.lessonType || "").tab === "Pozostałe" ? "" : (n.lessonType || ""); }

  // MARK: półka „Moje notatki” w bibliotece

  function shelf(host, status) {
    host.innerHTML = "";
    var list = subjects();
    list.forEach(function (s) {
      var notes = notesOf(s.id), dueCount = due(subjectCards(s.id)).length, last = notes[0];
      host.appendChild(el("li", { class: "shelf-item" }, [el("a", { class: "shelf-card", href: "#/przedmiot/" + s.id }, [
        el("span", { class: "shelf-top" }, [el("span", { class: "shelf-dot", style: "background:" + (s.colorHex || "var(--moss)"), "aria-hidden": "true" }),
          el("span", { class: "shelf-title", text: s.name || "Przedmiot" })]),
        el("span", { class: "shelf-meta", text: notes.length ? plural(notes.length, "notatka", "notatki", "notatek") + " z Twojego Maca" : "Jeszcze bez notatek" }),
        last ? el("span", { class: "shelf-latest" }, [el("span", { class: "shelf-latest-label", text: day(S.date(last.date)) + ": " }), last.topic || "Zajęcia"]) : null,
        dueCount ? el("span", { class: "shelf-foot" }, [el("span", { class: "chip chip-due", text: plural(dueCount, "fiszka", "fiszki", "fiszek") + " na dziś" })]) : null
      ])]));
    });
    if (status) status.textContent = model.pulledAt ? "Z Maca, " + new Date(model.pulledAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : "";
    if (window.eduTypo) eduTypo(host);
    return list.length;
  }

  // fiszki na dziś ze wszystkich moich przedmiotów (do „Na dziś” w bibliotece)
  function todayItems() {
    return subjects().map(function (s) { return { subject: s, due: due(subjectCards(s.id)).length }; }).filter(function (x) { return x.due > 0; });
  }

  // MARK: widok przedmiotu

  function subjectView(id) {
    var s = model.subjects[id];
    if (!s) return missing("Tego przedmiotu nie ma na Twoim koncie.");
    var notes = notesOf(id), types = [], present = {};
    notes.forEach(function (n) { present[typeOf(n)] = true; });
    V.types.forEach(function (t) { if (present[t[0]]) types.push(t[0]); });
    var nums = V.numbers(notes.map(function (n) { return { id: n.id, type: typeOf(n), lesson_date: S.date(n.date).toISOString().slice(0, 10), start: n.startMinute }; }));
    var active = types[0] || "";
    var box = el("article", { class: "mine" });
    box.appendChild(el("nav", { class: "crumbs", "aria-label": "Gdzie jesteś" }, [el("a", { href: "#", text: "Moja biblioteka" })]));
    box.appendChild(el("h1", { text: s.name || "Przedmiot" }));
    var cards = subjectCards(id), dueCards = due(cards);
    box.appendChild(el("p", { class: "course-by", text: plural(notes.length, "notatka", "notatki", "notatek") + " · " + plural(cards.length, "fiszka", "fiszki", "fiszek") }));
    // nauka z całego przedmiotu: najpierw fiszki na dziś
    var study = el("section", { class: "course-study" }, [el("div", { class: "course-study-head" }, [el("div", {}, [
      el("h2", { text: dueCards.length ? "Na dziś: " + plural(dueCards.length, "fiszka", "fiszki", "fiszek") : "Ucz się z całości" }),
      el("p", { class: "course-meta", text: dueCards.length ? "Według powtórek z aplikacji" : "Wszystkie fiszki z tego przedmiotu" })])])]);
    var actions = el("div", { class: "course-actions" });
    var studyCards = (dueCards.length ? dueCards : cards).map(function (c) { return toStudy(c); }).filter(Boolean);
    if (studyCards.length) actions.appendChild(V.button(dueCards.length ? "Powtórz teraz" : "Fiszki", "btn btn-primary", function () { learn(box, studyCards, "own.p." + id, function () { subjectView(id); }); }));
    var qs = [];
    notes.forEach(function (n) { qs = qs.concat(S.noteContent(n, model).quiz); });
    if (qs.length) actions.appendChild(V.button("Quiz", studyCards.length ? "btn btn-secondary" : "btn btn-primary", function () { quiz(box, V.shuffle(qs).slice(0, 15), "own.p." + id, function () { subjectView(id); }); }));
    if (actions.firstChild) study.appendChild(actions);
    box.appendChild(study);
    var tabs = el("div", { class: "tabs" + (types.length > 1 ? "" : " hidden"), role: "tablist", "aria-label": "Rodzaje zajęć" });
    var listBox = el("div");
    function list() {
      listBox.innerHTML = "";
      Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute("aria-selected", String(b.dataset.type === active)); });
      var ol = el("ol", { class: "lessons" });
      notes.filter(function (n) { return typeOf(n) === active; }).forEach(function (n) {
        var c = S.noteContent(n, model), facts = [c.cards.length ? plural(c.cards.length, "fiszka", "fiszki", "fiszek") : "", c.quiz.length ? plural(c.quiz.length, "pytanie", "pytania", "pytań") : "",
          c.images.length ? plural(c.images.length, "zdjęcie", "zdjęcia", "zdjęć") : ""].filter(Boolean).join(" · ");
        ol.appendChild(el("li", {}, [el("a", { class: "lesson", href: "#/notatka/" + n.id }, [
          el("span", { class: "lesson-meta", text: V.typeInfo(typeOf(n)).one + " " + (nums[n.id] || "") + " · " + day(S.date(n.date)) }),
          el("span", { class: "lesson-topic", text: n.topic || V.typeInfo(typeOf(n)).one }),
          c.summary ? el("span", { class: "lesson-sum", text: c.summary }) : null,
          facts ? el("span", { class: "lesson-facts", text: facts }) : null])]));
      });
      listBox.appendChild(el("div", { class: "lessons-head" }, [el("h2", { text: types.length > 1 ? V.typeInfo(active).tab : "Zajęcia" }),
        el("span", { class: "muted small", text: "Stuknij zajęcia, żeby przeczytać notatkę" })]));
      listBox.appendChild(ol);
      if (window.eduTypo) eduTypo(listBox);
    }
    types.forEach(function (t) {
      var b = el("button", { type: "button", role: "tab", "data-type": t }, [document.createTextNode(V.typeInfo(t).tab),
        el("span", { class: "count num", text: String(notes.filter(function (n) { return typeOf(n) === t; }).length) })]);
      b.addEventListener("click", function () { active = t; list(); });
      tabs.appendChild(b);
    });
    box.appendChild(tabs);
    box.appendChild(listBox);
    if (!notes.length) box.appendChild(el("p", { class: "muted", text: "Notatki pojawią się tutaj, gdy aplikacja na Macu je zsynchronizuje." }));
    list();
    open(box);
  }

  function toStudy(c) {
    if (c.kind === 2) {
      var f = String(c.front || "").replace(/\{\{c(\d+)::(.+?)(?:::(.+?))?\}\}/g, function (m, n, a, h) { return Number(n) === c.clozeIndex ? "[" + (h || "…") + "]" : a; });
      var ans = [];
      String(c.front || "").replace(/\{\{c(\d+)::(.+?)(?:::(.+?))?\}\}/g, function (m, n, a) { if (Number(n) === c.clozeIndex) ans.push(a); return m; });
      return ans.length ? { front: f.trim(), back: ans.join(", ") } : null;
    }
    return c.front && c.back ? { front: String(c.front).trim(), back: String(c.back).trim() } : null;
  }

  // MARK: widok notatki

  function noteView(id) {
    var n = model.notes[id];
    if (!n) return missing("Tej notatki nie ma na Twoim koncie.");
    var s = model.subjects[n.subjectID] || {}, c = S.noteContent(n, model);
    var need = V.needsMath(c);
    (need ? V.loadMath() : Promise.resolve()).then(function () {
      var box = el("article", { class: "mine" });
      box.appendChild(el("nav", { class: "crumbs", "aria-label": "Gdzie jesteś" }, [el("a", { href: "#", text: "Moja biblioteka" }),
        el("span", { class: "sep", "aria-hidden": "true", text: "›" }), el("a", { href: "#/przedmiot/" + n.subjectID, text: s.name || "Przedmiot" })]));
      box.appendChild(el("p", { class: "subject", text: [V.typeInfo(typeOf(n)).one, day(S.date(n.date), true)].filter(Boolean).join(" · ") }));
      box.appendChild(el("h1", { text: n.topic || s.name || "Notatka" }));
      if (c.summary || c.sections.length) box.appendChild(el("p", { class: "ai-line" }, [el("span", { class: "tag", text: "AI" }),
        el("span", { text: "Notatka z AI" + (c.fromRecording ? " z zajęć" : "") + " · może zawierać błędy" })]));
      var tabs = el("div", { class: "tabs", role: "tablist", "aria-label": "Notatka, fiszki i quiz" });
      var panel = el("div", { class: "mine-panel" });
      var studyCards = c.cards.map(function (x) { return { front: x.front, back: x.back }; });
      function tab(name, label, count, fn) {
        var b = el("button", { type: "button", role: "tab", "aria-selected": String(name === "note") }, [document.createTextNode(label), count ? el("span", { class: "count num", text: String(count) }) : null]);
        b.addEventListener("click", function () { Array.prototype.forEach.call(tabs.children, function (x) { x.setAttribute("aria-selected", String(x === b)); }); fn(); });
        tabs.appendChild(b);
      }
      function noteBody() {
        panel.innerHTML = "";
        if (c.summary) panel.appendChild(el("div", { class: "brief" }, [el("p", { class: "brief-label", text: "W skrócie" }), el("p", { text: c.summary })]));
        V.body(c).forEach(function (x) { panel.appendChild(x); });
        c.images.forEach(function (img) { panel.appendChild(blobFigure(img.sha, img.caption || "Zdjęcie z zajęć")); });
        c.boards.forEach(function (b) { if (b.thumbnail) panel.appendChild(blobFigure(b.thumbnail.sha256, b.title || "Tablica")); });
        if (c.transcripts.length) {
          var d = el("details", { class: "fold" }, [el("summary", {}, [el("span", { class: "fold-title", text: "Tekst zajęć" }),
            el("span", { class: "fold-meta", text: "Tylko dla Ciebie, nikt z linku go nie widzi" })])]);
          c.transcripts.forEach(function (t) { d.appendChild(el("p", { class: "transcript", text: t.text })); });
          panel.appendChild(el("section", { class: "section" }, [d]));
        }
        if (window.eduTypo) eduTypo(panel);
      }
      tab("note", "Notatka", 0, noteBody);
      if (studyCards.length) tab("cards", "Fiszki", studyCards.length, function () { panel.innerHTML = ""; var st = el("div", { class: "study-stage" }); panel.appendChild(st);
        eduStudy.start(studyCards, { container: st, key: "own." + n.id, onExit: function () { tabs.children[0].click(); } }); });
      if (c.quiz.length) tab("quiz", "Quiz", c.quiz.length, function () { panel.innerHTML = ""; panel.appendChild(V.quiz(c.quiz, { key: "own." + n.id })); });
      box.appendChild(tabs);
      box.appendChild(panel);
      noteBody();
      open(box);
    });
  }

  function blobFigure(sha, caption) {
    var img = el("img", { alt: caption, loading: "lazy" });
    var fig = el("figure", { class: "board" }, [el("div", { class: "board-open" }, [img]), el("figcaption", {}, [el("span", { class: "board-title", text: caption })])]);
    S.blobURL(client, uid, sha).then(function (url) {
      if (!url) { fig.classList.add("failed"); return; }
      img.onload = function () { fig.classList.add("ready"); };
      img.src = url;
    });
    return fig;
  }

  function learn(box, cards, key, back) {
    box.innerHTML = "";
    var st = el("div", { class: "study-stage" });
    box.appendChild(st);
    eduStudy.start(cards, { container: st, key: key, onExit: back });
    window.scrollTo(0, 0);
  }
  function quiz(box, items, key, back) {
    box.innerHTML = "";
    box.appendChild(V.quiz(items, { key: key, next: [["Wróć do przedmiotu", back]] }));
    window.scrollTo(0, 0);
  }

  function missing(text) {
    open(el("div", { class: "missing" }, [el("h1", { text: "Nie ma tego tutaj" }), el("p", { class: "muted", text: text }),
      el("p", { class: "missing-actions" }, [el("a", { class: "btn btn-primary", href: "#", text: "Moja biblioteka" })])]));
  }

  // MARK: przełączanie widoków po adresie (#/przedmiot/…, #/notatka/…, pusty = biblioteka)

  function open(node) {
    view.innerHTML = "";
    view.appendChild(node);
    view.classList.remove("hidden");
    home.classList.add("hidden");
    window.scrollTo(0, 0);
    if (M && M.ok()) M.enter(node, { y: 8 });
  }
  function route() {
    var h = location.hash || "", m = /^#\/(przedmiot|notatka)\/([0-9a-fA-F-]{36})$/.exec(h);
    if (!m || !model) { view.classList.add("hidden"); home.classList.remove("hidden"); if (onHome) onHome(); return; }
    if (m[1] === "przedmiot") subjectView(m[2].toLowerCase()); else noteView(m[2].toLowerCase());
  }

  // Start: z bazy w przeglądarce od razu, potem nowe zmiany z serwera. render(model) rysuje półkę w bibliotece.
  function start(opts) {
    home = opts.home; view = opts.view; onHome = opts.onHome;
    window.addEventListener("hashchange", route);
    return A.session().then(function (s) {
      if (!s) return null;
      client = A.client(); uid = s.user.id;
      return S.model(uid).then(function (m) {
        model = m;
        opts.render(api, false, true);
        route();
        return S.pull(client, uid).then(function (count) {
          return S.model(uid).then(function (m2) { model = m2; opts.render(api); if (count && /^#\//.test(location.hash)) route(); });
        }).catch(function (e) {
          if (window.console) console.warn("Notatki z Maca: nie udało się pobrać", e && (e.message || e.code || e));
          opts.render(api, true);
        });
      });
    });
  }

  var api = { start: start, shelf: shelf, todayItems: todayItems, hasData: function () { return !!(model && Object.keys(model.subjects).length); }, model: function () { return model; } };
  window.eduMine = api;
})();
