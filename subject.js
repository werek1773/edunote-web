// Strona linku do przedmiotu (…/p/#KOD): wszystkie notatki z jednego przedmiotu w zakładkach według rodzaju zajęć
// (Wykłady, Ćwiczenia…), od najnowszych, a pod tematem zajęć pierwsze zdanie z „W skrócie”. Nad listą karta „Ucz się
// z całości”: fiszki i quiz przed kolokwium z wybranych zajęć (domyślnie z całej zakładki), te fiszki do Quizleta
// albo Anki i te notatki jako jeden PDF. Notatka otwiera się na stronie notatki (…/n/#KOD-1a2b3c4d), która bierze
// przedmiot z pamięci karty, więc przejście jest od razu. Treść, quiz i wczytywanie przedmiotu daje note.js
// (window.eduNoteView), fiszki study.js, ruch motion.js (bez niego wszystko działa, tylko bez animacji).
(function () {
  "use strict";
  var V = window.eduNoteView, el = V.el, button = V.button, M = window.eduMotion || null;
  var hashParts = (location.hash || "").replace(/^#/, "").split("/");
  var code = hashParts[0].replace(/[^A-Za-z0-9]/g, ""), startTab = hashParts[1] || "";
  var mac = eduPlatform() === "mac";
  var QUIZ_SIZE = 15;

  var data = null, notes = [], nums = {}, types = [], active = "", until = "", lastVisit = null;
  // własny zakres nauki (identyfikatory notatek); null = cała otwarta zakładka
  var custom = null, picking = false;
  // przesuwana pigułka pod wybraną zakładką (motion.js); co jest pod zakładkami: lista zajęć, fiszki albo quiz
  var place = null, view = "list";

  function $(id) { return document.getElementById(id); }
  function plural(n, one, few, many) { return eduStudy.plural(n, one, few, many); }

  // zakładka w adresie bez polskich znaków: …/p/#KOD/cwiczenia
  function slug(type) { return V.fold(V.typeInfo(type).tab).replace(/[^a-z]+/g, "-"); }
  function ofType(type) { return notes.filter(function (n) { return (n.type || "") === type; }); }
  function label(n) { return V.typeInfo(n.type).one + " " + nums[n.id]; }
  function noteURL(n) { return "../n/#" + code + "-" + String(n.id).slice(0, 8); }

  // Pierwsze zdanie streszczenia: bez cięcia na skrótach („np.”, „tzw.”, „2020 r.”) i inicjałach, a za długie
  // skrócone na granicy słowa
  var ABBR = /(?:^|[\s(„"])(?:np|tzw|m\.in|itd|itp|tj|dr|prof|mgr|inż|hab|ok|ang|łac|gr|zob|por|wg|nr|pkt|ust|art|tys|mln|mld|zł|godz|min|ul|al|jw|cd|ds|vs|p|r|s|w)\.$/i;
  function firstSentence(s, max) {
    var t = String(s || "").replace(/\s+/g, " ").trim(), re = /[.!?…]+(?=\s+["„(]?[A-ZĄĆĘŁŃÓŚŹŻ0-9])/g, m;
    while ((m = re.exec(t))) {
      var head = t.slice(0, m.index + m[0].length);
      if (ABBR.test(head) || /(?:^|\s)[A-ZĄĆĘŁŃÓŚŹŻ]\.$/.test(head)) continue;
      t = head;
      break;
    }
    max = max || 170;
    return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, "").replace(/[\s,;:–-]+$/, "") + "…" : t;
  }
  function topic(n) { return n.topic || firstSentence((n.content || {}).summary, 90) || label(n); }

  // MARK: zakres nauki

  function scopeIDs() { return custom || ofType(active).map(function (n) { return n.id; }); }
  // od najstarszych: fiszki i PDF idą w kolejności zajęć
  function scopeNotes() {
    var ids = scopeIDs();
    return notes.filter(function (n) { return ids.indexOf(n.id) >= 0; }).reverse();
  }
  function scopeLabel() {
    var list = scopeNotes();
    if (custom) return "wybrane zajęcia (" + list.length + ")";
    return (types.length > 1 ? "wszystkie " + V.typeInfo(active).tab.toLowerCase() : "wszystkie zajęcia") + " (" + list.length + ")";
  }
  // osobny wynik fiszek i quizu dla każdej zakładki i dla własnego wyboru (study.js zaczyna wynik od zera przy nowym podejściu)
  function scopeKey() { return "p." + code + "." + (custom ? "wybrane" : slug(active)); }

  function scopeCards() {
    var out = [], seen = {};
    scopeNotes().forEach(function (n) {
      V.cardsOf(n.content || {}).forEach(function (c) { if (!seen[c.front]) { seen[c.front] = true; out.push(c); } });
    });
    return out;
  }
  function scopeQuestions() {
    var out = [];
    scopeNotes().forEach(function (n) {
      ((n.content || {}).quiz || []).forEach(function (q) { if (q.prompt && q.options && q.options.length > 1) out.push(q); });
    });
    return out;
  }

  // MARK: strona

  function render() {
    var title = data.subject || "Notatki z zajęć";
    document.title = title + ": notatki · EduNote";
    $("title").textContent = title;
    $("byline").textContent = "Udostępnia: " + (data.author || "ktoś z roku") + " · " + plural(notes.length, "notatka", "notatki", "notatek");
    until = data.expires_at ? "Link działa do " + V.lastDay(data.expires_at) + "." : "";
    $("valid").textContent = until;
    $("report").href = "../zglos/#n=" + code;

    // podgląd linku na czacie jest jeden dla wszystkich przedmiotów, więc o przedmiocie mówi tekst wiadomości
    var share = $("share-top");
    V.withIcon(share, "i-share").addEventListener("click", function () {
      var what = types.map(function (t) { return V.typeInfo(t).tab.toLowerCase(); }).join(" i ");
      eduShare(title + ": notatki z zajęć" + (what ? " (" + what + ")" : "") + ", fiszki i quiz z całości. "
        + "Nieoficjalne notatki z AI, sprawdźcie z zajęciami. Działa w przeglądarce, bez logowania:",
        location.origin + location.pathname + "#" + code, "Wyślij na grupę roku");
    });
    share.classList.remove("hidden");

    // zakładki tylko przy kilku rodzajach zajęć; przy jednym od razu lista
    var tabs = $("tabs");
    tabs.innerHTML = "";
    types.forEach(function (t) {
      var b = el("button", { type: "button", role: "tab", id: "tab-" + slug(t), "aria-selected": "false" },
        [document.createTextNode(V.typeInfo(t).tab), el("span", { class: "count num", text: String(ofType(t).length) })]);
      b.addEventListener("click", function () { show(t, true); });
      tabs.appendChild(b);
    });
    if (types.length > 1) tabs.classList.remove("hidden");

    cta();
    $("loading").classList.add("hidden");
    $("course").classList.remove("hidden");
    if (M && types.length > 1) place = M.pill(tabs);
    var start = types.filter(function (t) { return slug(t) === startTab; })[0];
    show(start !== undefined ? start : types[0] || "", false);
    // nagłówek, karta nauki i pierwsze zajęcia wchodzą po kolei
    if (M) {
      M.stagger([$("byline"), $("title"), document.querySelector("#course .ai-line"), tabs]
        .concat(Array.prototype.slice.call($("panel").children, 0, 2)), { step: 55, y: 12 });
      M.stagger(document.querySelectorAll("#panel .lessons > li"), { delay: 300, step: 45, max: 6, y: 8 });
    }
  }

  function show(type, byUser) {
    // ta sama zakładka: z fiszek albo quizu z powrotem do listy zajęć, a na liście tylko do góry
    if (byUser && type === active) { if (view === "list") toTabs(); else backToList(); return; }
    var dir = types.indexOf(type) - types.indexOf(active);
    active = type;
    Array.prototype.forEach.call($("tabs").querySelectorAll('[role="tab"]'), function (b) {
      b.setAttribute("aria-selected", String(b.id === "tab-" + slug(type)));
    });
    if (place) place(byUser);
    try { history.replaceState(null, "", "#" + code + (types.length > 1 && type !== types[0] ? "/" + slug(type) : "")); } catch (e) {}
    panel();
    if (byUser) {
      toTabs();
      // nowa zakładka wsuwa się z boku, z którego przyszła
      if (M) M.swap($("panel"), dir > 0 ? 1 : dir < 0 ? -1 : 0);
    }
  }

  // treść zaczyna się tuż pod zakładkami, także gdy strona była przewinięta w dół
  function toTabs() {
    var top = $("tabs-anchor").getBoundingClientRect().top + window.scrollY - document.querySelector(".bar").offsetHeight;
    if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
  }

  function panel() {
    var box = $("panel");
    box.innerHTML = "";
    view = "list";
    if (!notes.length) {
      box.appendChild(el("p", { class: "muted course-empty", text: "Notatki pojawią się tu po pierwszych zajęciach. Link zostaje ten sam." }));
      return;
    }
    box.appendChild(studyCard());
    var when = data.meta && data.meta.when && data.meta.when[active];
    box.appendChild(el("div", { class: "lessons-head" }, [
      el("h2", { text: types.length > 1 ? V.typeInfo(active).tab : "Zajęcia" }),
      when ? el("span", { class: "muted small", text: "Zajęcia: " + when }) : null]));
    var ol = el("ol", { class: "lessons" });
    ofType(active).forEach(function (n) { ol.appendChild(lessonItem(n)); });
    box.appendChild(ol);
  }

  // ta sama lista po zmianie zakresu: bez skoku strony i bez przewijania wyboru zajęć z powrotem do góry
  function rerender() {
    var y = window.scrollY, old = document.querySelector("#panel .picker"), top = old ? old.scrollTop : 0;
    panel();
    var p = document.querySelector("#panel .picker");
    if (p) p.scrollTop = top;
    window.scrollTo(0, y);
  }

  // powrót z fiszek albo quizu do listy zajęć
  function backToList() {
    panel();
    toTabs();
    if (M) M.swap($("panel"), 0);
  }

  function lessonItem(n) {
    var c = n.content || {}, cards = V.cardsOf(c).length, q = (c.quiz || []).length, b = (c.boards || []).length;
    var facts = [cards ? plural(cards, "fiszka", "fiszki", "fiszek") : "", q ? plural(q, "pytanie", "pytania", "pytań") : "",
                 b ? plural(b, "tablica", "tablice", "tablic") : ""].filter(Boolean).join(" · ");
    // nowe albo poprawione od ostatniej wizyty w tej przeglądarce
    var fresh = lastVisit && n.updated_at && new Date(n.updated_at) > new Date(lastVisit);
    // pod tematem pierwsze zdanie z „W skrócie”, żeby od razu było wiadomo, o czym były zajęcia
    // (zajęcia bez tematu mają to zdanie zamiast tematu, więc drugi raz go nie ma)
    var sum = n.topic ? firstSentence(c.summary) : "";
    return el("li", {}, [el("a", { class: "lesson", href: noteURL(n) }, [
      el("span", { class: "lesson-meta" }, [document.createTextNode(label(n) + " · " + V.shortDate(n.lesson_date)),
        fresh ? el("span", { class: "new-chip", text: "nowe" }) : null]),
      el("span", { class: "lesson-topic", text: topic(n) }),
      sum ? el("span", { class: "lesson-sum", text: sum }) : null,
      facts ? el("span", { class: "lesson-facts", text: facts }) : null
    ])]);
  }

  // MARK: ucz się z całości

  function studyCard() {
    if (!scopeNotes().length) {
      picking = true;
      return el("section", { class: "course-study" }, [el("h2", { text: "Ucz się z całości" }),
        el("p", { class: "scope-line" }, [document.createTextNode("Zaznacz zajęcia, z których chcesz się uczyć.")]), picker()]);
    }
    var cards = scopeCards(), qs = scopeQuestions(), key = scopeKey();
    var p = cards.length ? eduStudy.progress(key, cards) : null;
    var resume = p && p.rest.length && p.rest.length < cards.length, again = p && !resume && p.hard.length;
    var meta = [cards.length ? plural(cards.length, "fiszka", "fiszki", "fiszek") : "", qs.length ? plural(qs.length, "pytanie", "pytania", "pytań") : ""]
      .filter(Boolean).join(" · ");
    var card = el("section", { class: "course-study" }, [
      el("p", { class: "eyebrow", text: meta ? meta + (cards.length ? " · ok. " + eduStudy.minutes(cards) + " min" : "") : "Notatki do przeczytania" }),
      el("h2", { text: "Ucz się z całości" }),
      el("p", { class: "scope-line" }, [document.createTextNode("Zakres: " + scopeLabel() + " "),
        button(picking ? "Gotowe" : "Wybierz zajęcia", "link", togglePicker)])
    ]);
    if (picking) card.appendChild(picker());
    var actions = el("div", { class: "course-actions" });
    if (cards.length) {
      // po powrocie najpierw dokończenie przerwanej nauki albo powtórka tego, czego ostatnio nie było
      if (resume) actions.appendChild(button("Dokończ fiszki (" + p.rest.length + ")", "btn btn-primary", function () { learn(cards, p.rest, "resume"); }));
      else if (again) actions.appendChild(button("Powtórz trudne (" + p.hard.length + ")", "btn btn-primary", function () { learn(cards, p.hard, "hard"); }));
      else actions.appendChild(button("Fiszki z całości", "btn btn-primary", function () { learn(cards); }));
    }
    if (qs.length) actions.appendChild(button("Quiz przed kolokwium", cards.length ? "btn btn-secondary" : "btn btn-primary", quizTime));
    if (actions.firstChild) card.appendChild(actions);
    else card.appendChild(el("p", { class: "muted", text: "W tych notatkach nie ma jeszcze fiszek ani pytań." }));
    var links = el("p", { class: "course-links" });
    if (resume || again) links.appendChild(button("Fiszki od początku", "link", function () { learn(cards); }));
    links.appendChild(button("Zapisz te notatki jako PDF", "link", printScope));
    // te same fiszki w Quizlecie albo Anki, z całego zakresu (jak pod jedną notatką)
    if (cards.length) {
      links.appendChild(button("Kopiuj do Quizleta", "link", function () { V.copyCards(cards); }));
      links.appendChild(button("Pobierz plik dla Anki (.txt)", "link", function () {
        V.downloadCards(cards, (data.subject || "przedmiot") + " " + (custom ? "wybrane zajęcia" : V.typeInfo(active).tab));
      }));
    }
    card.appendChild(links);
    return card;
  }

  // „Wybierz zajęcia” rozwija listę zajęć, a „Gotowe” ją zwija (motion.js), zamiast żeby skakała cała karta
  function togglePicker() {
    if (!picking) {
      picking = true;
      rerender();
      if (M) M.expand(document.querySelector("#panel .picker"));
      return;
    }
    var p = document.querySelector("#panel .picker");
    (M && p ? M.collapse(p) : Promise.resolve()).then(function () { picking = false; rerender(); });
  }

  // Wybór zajęć do nauki i PDF: wszystkie rodzaje, w każdym od pierwszych zajęć, z polem „cała zakładka”
  function picker() {
    var box = el("div", { class: "picker" }), chosen = scopeIDs();
    function check(on, action, labelText, cls) {
      var input = el("input", { type: "checkbox" });
      input.checked = on;
      input.addEventListener("change", function () { action(input.checked); });
      return el("label", { class: "pick" + (cls ? " " + cls : "") }, [input, el("span", { text: labelText })]);
    }
    types.forEach(function (t) {
      var group = ofType(t);
      var all = group.every(function (n) { return chosen.indexOf(n.id) >= 0; });
      box.appendChild(check(all, function (on) { choose(group, on); }, V.typeInfo(t).tab + " (" + group.length + ")", "pick-head"));
      group.slice().reverse().forEach(function (n) {
        box.appendChild(check(chosen.indexOf(n.id) >= 0, function (on) { choose([n], on); }, label(n) + " · " + topic(n)));
      });
    });
    return box;
  }

  function choose(list, on) {
    var ids = scopeIDs().slice();
    list.forEach(function (n) {
      var i = ids.indexOf(n.id);
      if (on && i < 0) ids.push(n.id);
      if (!on && i >= 0) ids.splice(i, 1);
    });
    // znowu dokładnie cała zakładka: z powrotem zakres zakładki
    var tab = ofType(active).map(function (n) { return n.id; });
    custom = ids.length === tab.length && tab.every(function (id) { return ids.indexOf(id) >= 0; }) ? null : ids;
    rerender();
  }

  // only i mode: dokończenie przerwanej nauki („resume”) albo same trudne („hard”); bez nich nowe podejście
  function learn(cards, only, mode) {
    var box = $("panel");
    box.innerHTML = "";
    view = "cards";
    var head = el("p", { class: "eyebrow course-scope", text: "Fiszki · " + scopeLabel() });
    box.appendChild(head);
    var stage = el("div", { class: "study-stage" });
    box.appendChild(stage);
    eduStudy.start(cards, { container: stage, key: scopeKey(), only: only, mode: mode, done: afterStudy, onExit: backToList,
      offset: function () { return document.querySelector(".bar").offsetHeight + $("tabs").offsetHeight; } });
    toTabs();
    if (M) M.enter(head, { y: 6 });
  }

  function afterStudy(result) {
    var box = el("div", { class: "done-actions" });
    if (scopeQuestions().length) {
      box.appendChild(button("Quiz przed kolokwium", result.hard.length ? "btn btn-secondary" : "btn btn-primary", quizTime));
    }
    if (!mac && until) box.appendChild(el("p", { class: "muted small", text: "Wróć tu przed kolokwium. " + until }));
    return box;
  }

  // Quiz przed kolokwium: do 15 pytań z zakresu, za każdym razem inne; pytania źle rozwiązane ostatnio idą pierwsze
  function quizTime() {
    var all = scopeQuestions(), key = scopeKey(), last = null;
    try { last = JSON.parse(localStorage.getItem("edunote.quiz." + key) || "null"); } catch (e) {}
    var wrong = last && last.wrong ? all.filter(function (q) { return last.wrong.indexOf(q.prompt) >= 0; }) : [];
    var rest = V.shuffle(all.filter(function (q) { return wrong.indexOf(q) < 0; }));
    var items = V.shuffle(wrong.concat(rest).slice(0, QUIZ_SIZE));
    var box = $("panel");
    box.innerHTML = "";
    view = "quiz";
    box.appendChild(el("p", { class: "eyebrow course-scope", text: "Quiz przed kolokwium · " + scopeLabel()
      + (all.length > items.length ? " · " + items.length + " z " + all.length + " pytań, za każdym razem inne" : "") }));
    box.appendChild(V.quiz(items, {
      key: key,
      after: mac ? "Chcesz te pytania jako fiszki z powtórkami? EduNote przypomni je, zanim wylecą z głowy."
        : until && "Wróć tu przed kolokwium. " + until,
      next: [[all.length > items.length ? "Nowe pytania" : "Wymieszaj pytania", quizTime], ["Wróć do zajęć", backToList]]
    }));
    box.appendChild(el("p", { class: "course-back" }, [button("← Wróć do zajęć", "link", backToList)]));
    toTabs();
    if (M) M.stagger(box.children, { y: 10, step: 60, max: 3 });
  }

  // MARK: PDF

  // Zakres jako jeden dokument: zajęcia od pierwszych, każde od nowej strony, z rozwiniętymi rozwiązaniami (note.js)
  // i z tablicami wczytanymi przed drukiem. Klasa print-all zostaje: zmienia tylko wydruk, nie ekran.
  function printScope() {
    var list = scopeNotes();
    // tablice potrafią się wczytywać kilka sekund: wtedy krótka informacja, że coś się dzieje
    var slow = setTimeout(function () { if (window.eduToast) eduToast("Przygotowuję PDF…"); }, 500);
    var need = list.some(function (n) { return V.needsMath(n.content || {}); });
    (need ? V.loadMath() : Promise.resolve()).then(function () {
      var area = $("print-area");
      area.innerHTML = "";
      area.appendChild(el("h1", { class: "print-title", text: data.subject || "Notatki z zajęć" }));
      area.appendChild(el("p", { class: "print-sub", text: "Notatki: " + scopeLabel() + ". Nieoficjalne notatki studenta zrobione "
        + "z pomocą AI, a nie materiał prowadzącego. " + until }));
      list.forEach(function (n) {
        var c = n.content || {};
        var art = el("article", { class: "print-note" }, [
          el("p", { class: "subject", text: label(n) + " · " + V.shortDate(n.lesson_date) }),
          el("h2", { class: "print-topic", text: topic(n) })]);
        if (c.summary) art.appendChild(el("div", { class: "brief" }, [el("p", { class: "brief-label", text: "W skrócie" }), el("p", { text: c.summary })]));
        V.body(c).forEach(function (x) { art.appendChild(x); });
        area.appendChild(art);
      });
      var imgs = Array.prototype.slice.call(area.querySelectorAll("img"));
      imgs.forEach(function (i) { i.loading = "eager"; });
      var loaded = Promise.all(imgs.map(function (i) {
        return i.complete ? Promise.resolve() : new Promise(function (r) { i.onload = i.onerror = r; });
      }));
      return Promise.race([loaded, new Promise(function (r) { setTimeout(r, 6000); })]);
    }).then(function () {
      clearTimeout(slow);
      document.documentElement.classList.add("print-all");
      window.print();
    });
  }

  // MARK: zaproszenie

  function recordClick() { V.recordClick("record_subject_click", code); }

  // Na Macu do App Store; bez Maca uczysz się już tutaj, więc prośba do osoby z Makiem z roku (jak pod notatką)
  function cta() {
    var slot = $("cta-slot"), url = location.origin + location.pathname + "#" + code;
    if (mac) {
      slot.appendChild(V.invite(true, "btn btn-primary", "przedmiot", recordClick));
      return;
    }
    $("cta-title").textContent = "Chcesz takie notatki z innych przedmiotów?";
    $("cta-text").textContent = "Uczysz się tutaj i nic nie instalujesz. Notatki robi EduNote na Macu: wystarczy jedna osoba "
      + "z Makiem na roku. Za zgodą prowadzącego EduNote słucha zajęć, od razu robi z nich notatki, a link dostaje cała grupa.";
    slot.appendChild(button("Poproś kogoś z Makiem", "btn btn-primary", function () {
      eduShare(eduAsk.mac, url, "Poproś kogoś z Makiem", "Wyślij tę wiadomość osobie z Makiem z Twojego roku.");
    }));
    slot.appendChild(el("p", { class: "cta-links" }, [button("Prośba do prowadzącego o zgodę", "link", eduAsk.lecturer)]));
    eduWaitlist(slot, { privacy: "../prywatnosc/" });
  }

  function missing() {
    $("loading").classList.add("hidden");
    $("missing").classList.remove("hidden");
    if (M) M.enter($("missing"));
  }

  // MARK: start

  // zmiana samej końcówki adresu (…/p/#KOD/cwiczenia): inna zakładka; inny kod: inny przedmiot
  window.addEventListener("hashchange", function () {
    var parts = (location.hash || "").replace(/^#/, "").split("/");
    if (parts[0].replace(/[^A-Za-z0-9]/g, "") !== code) { location.reload(); return; }
    var t = types.filter(function (x) { return slug(x) === (parts[1] || ""); })[0];
    if (data) show(t !== undefined ? t : types[0] || "", false);
  });

  if (!code) { missing(); return; }
  var visitKey = "edunote.p." + code + ".wizyta";
  try { lastVisit = localStorage.getItem(visitKey); } catch (e) {}
  V.subjectData(code).then(function (d) {
    if (!d) return missing();
    data = d;
    notes = (d.notes || []).filter(function (n) { return n && n.content; });
    nums = V.numbers(notes);
    var present = {};
    notes.forEach(function (n) { present[n.type || ""] = true; });
    types = V.types.map(function (t) { return t[0]; }).filter(function (t) { return present[t]; });
    render();
    try { localStorage.setItem(visitKey, new Date().toISOString()); } catch (e) {}
  }).catch(missing);
})();
