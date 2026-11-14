// Twoje notatki z Maca na stronie: rekordy synchronizacji zalogowanego konta (tabela sync_records, przez RLS tylko
// własne), pobierane „od numeru” (seq) tak jak w aplikacji i trzymane w IndexedDB tej przeglądarki, żeby biblioteka
// otwierała się od razu, także bez sieci. Każde konto ma osobną bazę; wylogowanie ją usuwa.
// Format treści: EduNote/Services/Sync/SyncRecords.swift (pola modeli SwiftData pod ich nazwami, daty jako sekundy
// od 1.01.2001, pliki w kubełku „sync” pod <konto>/<sha256>).
(function () {
  "use strict";
  var REF = Date.UTC(2001, 0, 1);
  var PAGE = 1000;
  // rekord ustawień „profile” z aplikacji (imię i poziom studiów), SyncPrefsID.profile w SyncRecords.swift
  var PROFILE = "7e5c0001-0000-4000-8000-000000000002";

  // Odwołania do innych rekordów (subjectID, noteID, noteIDs…) aplikacja zapisuje wielkimi literami (UUID.uuidString),
  // a kolumna id wraca z bazy małymi, więc przed łączeniem wszystko sprowadzamy do małych liter
  function lowerIDs(p) {
    Object.keys(p).forEach(function (k) {
      if (/ID$/.test(k) && typeof p[k] === "string") p[k] = p[k].toLowerCase();
      else if (/IDs$/.test(k) && Array.isArray(p[k])) p[k] = p[k].map(function (v) { return typeof v === "string" ? v.toLowerCase() : v; });
    });
    return p;
  }

  // data z aplikacji (sekundy od 1.01.2001) → Date
  function date(sec) { return typeof sec === "number" ? new Date(REF + sec * 1000) : null; }

  // MARK: IndexedDB: magazyn „records” (klucz entity:id) i „meta” (ostatni numer zmiany, czas pobrania)
  function open(uid) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open("edunote-" + uid, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("records")) db.createObjectStore("records");
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
        if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function tx(db, store, mode, fn) {
    return new Promise(function (resolve, reject) {
      var t = db.transaction(store, mode), s = t.objectStore(store), out = fn(s);
      t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
      t.onerror = t.onabort = function () { reject(t.error); };
    });
  }
  function all(db, store) {
    return new Promise(function (resolve, reject) {
      var out = {}, t = db.transaction(store, "readonly"), c = t.objectStore(store).openCursor();
      c.onsuccess = function () { var cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } };
      t.oncomplete = function () { resolve(out); };
      t.onerror = function () { reject(t.error); };
    });
  }

  var state = { uid: "", db: null };
  function ready(uid) {
    if (state.db && state.uid === uid) return Promise.resolve(state.db);
    return open(uid).then(function (db) { state.uid = uid; state.db = db; return db; });
  }

  // Pobiera zmiany od ostatniego numeru (seq) i zapisuje je w bazie. onProgress(liczba) przy dużej pierwszej porcji.
  function pull(client, uid, onProgress) {
    var count = 0;
    return ready(uid).then(function (db) {
      return tx(db, "meta", "readonly", function (s) { return s.get("seq"); }).then(function (last) {
        last = last || 0;
        function page() {
          return client.from("sync_records").select("entity,id,payload,deleted,modified_ms,seq,blobs")
            .gt("seq", last).order("seq", { ascending: true }).limit(PAGE)
            .then(function (r) {
              if (r.error) throw r.error;
              var rows = r.data || [];
              if (!rows.length) return;
              return tx(db, "records", "readwrite", function (s) {
                rows.forEach(function (row) {
                  var key = row.entity + ":" + row.id;
                  if (row.deleted) s.delete(key); else s.put({ entity: row.entity, id: row.id, payload: row.payload, modified_ms: row.modified_ms, blobs: row.blobs || [] }, key);
                });
              }).then(function () {
                last = rows[rows.length - 1].seq;
                count += rows.length;
                if (onProgress) onProgress(count);
                return tx(db, "meta", "readwrite", function (s) { s.put(last, "seq"); s.put(Date.now(), "pulled_at"); });
              }).then(function () { if (rows.length === PAGE) return page(); });
            });
        }
        return page();
      });
    }).then(function () { return count; });
  }

  // MARK: model: przedmioty, notatki z blokami, fiszki, tablice i zaliczenia
  function model(uid) {
    return ready(uid).then(function (db) { return Promise.all([all(db, "records"), tx(db, "meta", "readonly", function (s) { return s.get("pulled_at"); })]); })
      .then(function (r) {
        var recs = r[0], m = { subjects: {}, notes: {}, blocks: {}, cards: {}, boards: {}, exams: {}, materials: {}, slots: {}, prefs: {}, personName: "", pulledAt: r[1] || 0 };
        Object.keys(recs).forEach(function (k) {
          var x = recs[k], p = lowerIDs(x.payload || {});
          p.id = String(x.id).toLowerCase();
          switch (x.entity) {
            case "subject": m.subjects[x.id] = p; break;
            case "note": m.notes[x.id] = p; break;
            case "block": m.blocks[x.id] = p; break;
            case "card": m.cards[x.id] = p; break;
            case "board": m.boards[x.id] = p; break;
            case "exam": m.exams[x.id] = p; break;
            case "material": m.materials[x.id] = p; break;
            case "slot": m.slots[x.id] = p; break;
            case "prefs": m.prefs[p.id] = p; break;
          }
        });
        var profile = m.prefs[PROFILE];
        if (profile && typeof profile.name === "string") m.personName = profile.name.trim();
        // bloki przy notatkach (kolejność jak w aplikacji: czas, potem order), fiszki przy notatkach i przedmiotach
        Object.keys(m.notes).forEach(function (id) { m.notes[id].blocks = []; m.notes[id].cards = []; });
        Object.keys(m.blocks).forEach(function (id) { var b = m.blocks[id], n = b.noteID && m.notes[b.noteID]; if (n) n.blocks.push(b); });
        Object.keys(m.notes).forEach(function (id) {
          m.notes[id].blocks.sort(function (a, b) { return (a.createdAt - b.createdAt) || (a.order - b.order); });
        });
        Object.keys(m.cards).forEach(function (id) { var c = m.cards[id], n = c.sourceNoteID && m.notes[c.sourceNoteID]; if (n) n.cards.push(c); });
        Object.keys(m.notes).forEach(function (id) { m.notes[id].cards.sort(function (a, b) { return a.createdAt - b.createdAt; }); });
        return m;
      });
  }

  // MARK: treść notatki jak na stronie linku (NoteShare.content w aplikacji), żeby rysował ją ten sam note.js

  function trimmed(s) { return String(s || "").trim(); }
  function fold(s) { return trimmed(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[łŁ]/g, "l").toLowerCase(); }
  // punkty bloku („exam”, „homework”): linie po pierwszej (nagłówek), bez „•”
  function lines(text) {
    return text.split(/\r?\n/).slice(1).map(function (l) { return l.replace(/^[•\s]+|\s+$/g, ""); }).filter(Boolean);
  }
  function concepts(text, important) {
    return text.split(/\r?\n/).slice(1).map(function (line) {
      var i = line.indexOf(" :: ");
      if (i < 0) return null;
      var term = trimmed(line.slice(0, i)), def = trimmed(line.slice(i + 4));
      return term && def ? { term: term, definition: def, important: !!(important && important[fold(term)]) } : null;
    }).filter(Boolean);
  }
  function questions(text) {
    var out = [], pending = null;
    text.split(/\r?\n/).slice(1).map(trimmed).forEach(function (line) {
      if (line.indexOf("P:") === 0) pending = trimmed(line.slice(2));
      else if (line.indexOf("O:") === 0 && pending !== null) { out.push({ question: pending, answer: trimmed(line.slice(2)) }); pending = null; }
    });
    return out;
  }

  // luka {{c1::odpowiedź::podpowiedź}}: przód z „[…]” w miejscu aktywnej luki, tył to jej odpowiedź
  var CLOZE = /\{\{c(\d+)::(.+?)(?:::(.+?))?\}\}/g;
  function clozeFront(text, active) {
    return text.replace(CLOZE, function (m, n, a, h) { return Number(n) === active ? "[" + (h ? trimmed(h) : "…") + "]" : trimmed(a); });
  }
  function clozeAnswer(text, active) {
    var out = [];
    text.replace(CLOZE, function (m, n, a) { if (Number(n) === active) out.push(trimmed(a)); return m; });
    return out.join(", ");
  }

  function quizOf(note) {
    var bank = [];
    try { bank = (JSON.parse(note.quizJSON || "{}").entries || []).map(function (e) { return e.item; }); } catch (e) {}
    return bank.filter(function (q) { return q && (q.type === "mc" || q.type === "trueFalse" || !q.type); }).map(function (q) {
      var prompt = trimmed(q.prompt), explanation = (q.explanations || [])[0] || "";
      if (q.type === "trueFalse") return { prompt: prompt, options: ["Prawda", "Fałsz"], answer: fold(q.answer) === "prawda" ? "Prawda" : "Fałsz", explanation: explanation };
      var answer = trimmed(q.answer), seen = {}; seen[fold(answer)] = true;
      var wrong = (q.options || []).map(trimmed).filter(function (o) { if (!o || seen[fold(o)]) return false; seen[fold(o)] = true; return true; });
      return { prompt: prompt, options: [answer].concat(wrong.slice(0, 3)), answer: answer, explanation: explanation };
    }).filter(function (q) { return q.prompt && q.answer; });
  }

  function cardsOf(note) {
    return (note.cards || []).filter(function (c) { return !c.image; }).map(function (c) {
      if (c.kind === 2) return { id: c.id, front: trimmed(clozeFront(c.front, c.clozeIndex)), back: trimmed(clozeAnswer(c.front, c.clozeIndex)), card: c };
      return { id: c.id, front: trimmed(c.front), back: trimmed(c.back), card: c };
    }).filter(function (c) { return c.front && c.back; });
  }

  // Własna notatka: wszystko z bloków, jak w aplikacji. Do tego, czego nie ma w linku: zdjęcia, tablice i tekst zajęć.
  function noteContent(note, m) {
    var c = { summary: "", sections: [], concepts: [], exam: [], questions: [], homework: [], own: [], quiz: [], cards: [],
              images: [], boards: [], transcripts: [], visual: null, fromRecording: false };
    (note.blocks || []).forEach(function (b) {
      var text = trimmed(b.text);
      if (b.kindRaw === "image" && b.image) { c.images.push({ sha: b.image.sha256, caption: text }); return; }
      if (b.kindRaw === "board" && b.boardID) { var bd = m.boards[b.boardID]; if (bd) c.boards.push(bd); return; }
      if (b.kindRaw === "transcript") { if (text) c.transcripts.push({ text: text, source: b.sourceRaw }); if (b.sourceRaw === "recording") c.fromRecording = true; return; }
      if (!text) return;
      if (b.sourceRaw !== "ai") { if (b.kindRaw === "text") c.own.push(text); return; }
      var important = null;
      if (b.aiStateRaw === "ranked") { important = {}; (b.aiTerms || []).forEach(function (t) { important[fold(t)] = true; }); }
      switch (b.aiRole) {
        case "summary": c.summary = [c.summary, text].filter(Boolean).join(" "); break;
        case "section":
          var i = text.indexOf("\n");
          c.sections.push({ heading: trimmed(i < 0 ? text : text.slice(0, i)), body: i < 0 ? "" : trimmed(text.slice(i + 1)) });
          break;
        case "concepts": c.concepts = c.concepts.concat(concepts(text, important)); break;
        case "questions": c.questions = c.questions.concat(questions(text)); break;
        case "exam": c.exam = c.exam.concat(lines(text)); break;
        case "homework": c.homework = c.homework.concat(lines(text)); break;
      }
    });
    if (note.visualJSON) { try { c.visual = JSON.parse(note.visualJSON); } catch (e) {} }
    c.quiz = quizOf(note);
    c.cards = cardsOf(note);
    return c;
  }

  // MARK: pliki z kubełka „sync” (zdjęcia, miniatury tablic): z pamięci przeglądarki albo z serwera
  var urls = {};
  function blobURL(client, uid, sha) {
    if (!/^[0-9a-f]{64}$/.test(sha || "")) return Promise.resolve("");
    if (urls[sha]) return Promise.resolve(urls[sha]);
    return ready(uid).then(function (db) {
      return tx(db, "blobs", "readonly", function (s) { return s.get(sha); }).then(function (hit) {
        if (hit) return hit;
        return client.storage.from("sync").download(uid + "/" + sha).then(function (r) {
          if (r.error || !r.data) return null;
          return tx(db, "blobs", "readwrite", function (s) { s.put(r.data, sha); }).then(function () { return r.data; }, function () { return r.data; });
        });
      });
    }).then(function (blob) { if (!blob) return ""; urls[sha] = URL.createObjectURL(blob); return urls[sha]; }).catch(function () { return ""; });
  }

  function clear(uid) {
    if (state.db) { state.db.close(); state.db = null; }
    return new Promise(function (resolve) { var r = indexedDB.deleteDatabase("edunote-" + uid); r.onsuccess = r.onerror = r.onblocked = function () { resolve(); }; });
  }

  window.eduSync = { pull: pull, model: model, noteContent: noteContent, blobURL: blobURL, clear: clear, date: date, fold: fold };
})();
