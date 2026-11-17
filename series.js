// Strona serii przed kolokwium (…/s/#KOD): odcinki do słuchania z udostępnionej serii i fiszki tematów, bez logowania.
// Seria z get_shared_series, plik odcinka przez funkcję podcast-play (podpisany adres na godzinę, kubełek jest prywatny).
// Miejsce w odcinku i wysłuchane odcinki zapamiętuje tylko ta przeglądarka (localStorage). Media Session: tytuł na
// ekranie blokady i sterowanie słuchawkami. Projekt: docs/podcasty-seria-projekt.md (etap 2), makieta widok B.
(function () {
  "use strict";
  var SUPABASE = "https://fjpbdwsbktiylkborxvf.supabase.co";
  // klucz publiczny (publishable) – ten sam co w aplikacji, nie jest sekretem
  var KEY = "sb_publishable_XtknqXVtb-T-5Wd-oKFxEA_NINWbDsE";
  var code = (location.hash || "").replace(/^#/, "").split("/")[0].replace(/[^A-Za-z0-9]/g, "");
  var $ = function (id) { return document.getElementById(id); };
  var audio = $("audio");
  var speeds = [1, 1.25, 1.5, 2], sp = 0;
  var series = null, list = [], cur = -1, urlFor = {};

  function rpc(name, args) {
    return fetch(SUPABASE + "/rest/v1/rpc/" + name, {
      method: "POST", headers: { "apikey": KEY, "Content-Type": "application/json" }, body: JSON.stringify(args)
    }).then(function (r) { return r.ok ? r.json() : null; });
  }

  function play(episode) {
    if (urlFor[episode]) return Promise.resolve(urlFor[episode]);
    return fetch(SUPABASE + "/functions/v1/podcast-play", {
      method: "POST", headers: { "apikey": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ code: code, episode: episode })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.url) throw new Error("brak");
      urlFor[episode] = d.url;
      return d.url;
    });
  }

  function store(key, value) { try { if (value === undefined) return JSON.parse(localStorage.getItem(key) || "null"); localStorage.setItem(key, JSON.stringify(value)); } catch (e) { return null; } }
  var heard = store("edunote.series." + code + ".heard") || {};
  function markHeard(id) { heard[id] = true; store("edunote.series." + code + ".heard", heard); }

  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function minutes(s) { return Math.max(1, Math.round((s || 0) / 60)) + " min"; }
  function plural(n, one, few, many) { var m10 = n % 10, m100 = n % 100; return n + " " + (n === 1 ? one : (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) ? few : many); }
  function day(iso) {
    if (!iso) return "";
    var d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "numeric" });
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function icon(id) { var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); var u = document.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "#" + id); s.appendChild(u); return s; }

  // MARK: lista

  function render() {
    var box = $("eps"); box.innerHTML = "";
    list.forEach(function (t, i) {
      var b = el("button", "epi" + (i === cur ? " on" : "")); b.type = "button";
      var pl = el("span", "pl"); pl.appendChild(icon(i === cur && !audio.paused ? "i-pause" : "i-play"));
      var txt = el("span"); txt.appendChild(el("span", "t", t.episode.title || t.title));
      var m = el("span", "m", minutes(t.episode.seconds) + (t.lesson_date ? " · zajęcia " + day(t.lesson_date) : ""));
      if (heard[t.episode.id]) { m.appendChild(document.createTextNode(" · ")); m.appendChild(el("span", "done", "wysłuchany")); }
      txt.appendChild(m);
      b.appendChild(pl); b.appendChild(txt); b.appendChild(el("span"));
      b.addEventListener("click", function () { if (i === cur) toggle(); else load(i, true); });
      box.appendChild(b);
    });
    var only = (series.topics || []).filter(function (t) { return !t.episode && t.cards && t.cards.length; });
    $("only-title").classList.toggle("hidden", !only.length);
    var o = $("only"); o.innerHTML = "";
    only.forEach(function (t) {
      var b = el("button", "epi"); b.type = "button";
      var pl = el("span", "pl"); pl.appendChild(icon("i-cards"));
      var txt = el("span"); txt.appendChild(el("span", "t", t.title)); txt.appendChild(el("span", "m", "Bez odcinka · " + plural(t.cards.length, "fiszka", "fiszki", "fiszek")));
      b.appendChild(pl); b.appendChild(txt); b.appendChild(el("span"));
      b.addEventListener("click", function () { check(t); });
      o.appendChild(b);
    });
  }

  // MARK: odtwarzacz

  function load(i, start) {
    cur = i;
    var t = list[i];
    $("ep").textContent = "Odcinek " + (i + 1) + " z " + list.length;
    $("ep-title").textContent = t.episode.title || t.title;
    $("ep-from").textContent = t.title + " · " + minutes(t.episode.seconds);
    $("dur").textContent = fmt(t.episode.seconds); $("cur").textContent = "0:00"; $("fill").style.width = "0";
    $("check").classList.add("hidden");
    var s = $("script"); s.innerHTML = "";
    var paras = (t.episode.script || "").split(/\n\s*\n/).filter(function (p) { return p.trim(); });
    var total = paras.reduce(function (n, p) { return n + p.length; }, 0) || 1, at = 0;
    paras.forEach(function (p) { var e = el("p", null, p.trim()); e.dataset.at = at / total; at += p.length; s.appendChild(e); });
    audio.removeAttribute("src");
    if ("mediaSession" in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.episode.title || t.title, artist: "EduNote · lektorka AI", album: series.subject || "Powtórka" });
    }
    render();
    if (start) toggle(true);
  }

  function toggle(force) {
    if (cur < 0) return;
    var want = force === undefined ? audio.paused : force;
    if (!want) { audio.pause(); return; }
    var t = list[cur];
    var go = function () { audio.playbackRate = speeds[sp]; return audio.play(); };
    if (audio.getAttribute("src")) { go(); return; }
    $("pp").disabled = true;
    play(t.episode.id).then(function (url) {
      audio.src = url;
      var saved = store("edunote.series." + code + ".pos." + t.episode.id);
      audio.addEventListener("loadedmetadata", function once() { audio.removeEventListener("loadedmetadata", once); if (saved && saved < audio.duration - 5) audio.currentTime = saved; });
      return go();
    }).catch(function () {
      $("ep-from").textContent = "Nie udało się wczytać odcinka. Sprawdź internet i spróbuj jeszcze raz.";
    }).then(function () { $("pp").disabled = false; });
  }

  function paint() {
    var d = audio.duration || (list[cur] && list[cur].episode.seconds) || 1, p = audio.currentTime || 0;
    $("fill").style.width = (100 * p / d) + "%";
    $("cur").textContent = fmt(p); $("dur").textContent = fmt(d);
    $("pp-ico").setAttribute("href", audio.paused ? "#i-play" : "#i-pause");
    $("pp").setAttribute("aria-label", audio.paused ? "Posłuchaj" : "Pauza");
    var ps = $("script").children, now = 0;
    for (var k = 0; k < ps.length; k++) if (+ps[k].dataset.at <= p / d) now = k;
    for (k = 0; k < ps.length; k++) ps[k].classList.toggle("now", k === now && p > 0);
  }

  audio.addEventListener("timeupdate", function () {
    paint();
    if (cur >= 0 && Math.floor(audio.currentTime) % 5 === 0) store("edunote.series." + code + ".pos." + list[cur].episode.id, audio.currentTime);
  });
  audio.addEventListener("play", function () { paint(); render(); });
  audio.addEventListener("pause", function () { paint(); render(); });
  audio.addEventListener("ended", function () {
    var t = list[cur];
    markHeard(t.episode.id);
    store("edunote.series." + code + ".pos." + t.episode.id, 0);
    render(); paint();
    if (t.cards && t.cards.length) check(t); else next();
    $("cta").classList.remove("hidden");
  });

  $("pp").addEventListener("click", function () { toggle(); });
  $("back").addEventListener("click", function () { audio.currentTime = Math.max(0, audio.currentTime - 15); });
  $("fwd").addEventListener("click", function () { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); });
  $("speed").addEventListener("click", function () { sp = (sp + 1) % speeds.length; audio.playbackRate = speeds[sp]; this.textContent = String(speeds[sp]).replace(".", ",") + "×"; });
  $("track").addEventListener("click", function (e) { if (!audio.duration) return; var r = this.getBoundingClientRect(); audio.currentTime = audio.duration * (e.clientX - r.left) / r.width; });
  $("script-btn").addEventListener("click", function () { var h = $("script").classList.toggle("hidden"); this.textContent = h ? "Tekst odcinka" : "Schowaj tekst"; });
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", function () { toggle(true); });
    navigator.mediaSession.setActionHandler("pause", function () { toggle(false); });
    navigator.mediaSession.setActionHandler("seekbackward", function () { audio.currentTime = Math.max(0, audio.currentTime - 15); });
    navigator.mediaSession.setActionHandler("seekforward", function () { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); });
  }

  function next() {
    var n = -1;
    list.forEach(function (t, i) { if (n < 0 && i !== cur && !heard[t.episode.id]) n = i; });
    if (n >= 0) load(n, true);
  }

  // MARK: „Sprawdź się”: fiszki tematu w przeglądarce, nic nie wychodzi poza nią

  function check(t) {
    var box = $("check"), cards = t.cards || [], k = 0, good = 0;
    box.classList.remove("hidden");
    function intro() {
      box.innerHTML = "";
      box.appendChild(el("h3", null, "Sprawdź się"));
      box.appendChild(el("p", "cnt", plural(cards.length, "fiszka", "fiszki", "fiszek") + " z tematu „" + t.title + "”. Wynik zostaje tylko w tej przeglądarce."));
      var row = el("div", "row-btns");
      var go = el("button", "btn btn-primary btn-sm", "Zaczynam"); go.type = "button"; go.addEventListener("click", card);
      row.appendChild(go);
      if (list.length > 1) { var sk = el("button", "btn btn-ghost btn-sm", "Następny odcinek"); sk.type = "button"; sk.addEventListener("click", next); row.appendChild(sk); }
      box.appendChild(row);
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    function card() {
      box.innerHTML = "";
      box.appendChild(el("h3", null, "Sprawdź się"));
      box.appendChild(el("p", "cnt", "Fiszka " + (k + 1) + " z " + cards.length));
      var f = el("button", "flash" + (cards[k].front.length > 90 ? " long" : "")); f.type = "button";
      f.appendChild(el("span", "front", cards[k].front)); f.appendChild(el("span", "hint", "Dotknij, żeby zobaczyć odpowiedź"));
      f.addEventListener("click", function () {
        f.innerHTML = ""; f.appendChild(el("span", "front", cards[k].front)); f.appendChild(el("span", "back", cards[k].back));
        var g = el("div", "grades");
        [["Jeszcze raz", 0], ["Prawie", 1], ["Wiem", 2]].forEach(function (x) {
          var b = el("button", "btn " + (x[1] === 2 ? "btn-secondary" : "btn-ghost") + " btn-sm", x[0]); b.type = "button";
          b.addEventListener("click", function () { if (x[1] > 0) good++; k++; if (k < cards.length) card(); else result(); });
          g.appendChild(b);
        });
        box.appendChild(g);
      }, { once: true });
      box.appendChild(f);
    }
    function result() {
      box.innerHTML = "";
      var r = el("div", "result");
      r.appendChild(el("div", "num", good + " z " + cards.length));
      r.appendChild(el("p", "cnt", good >= Math.ceil(cards.length * 0.8) ? "Ten temat siedzi. Możesz iść dalej." : "Warto posłuchać jeszcze raz przed kolokwium. Spokojnie, jest na to czas."));
      var row = el("div", "row-btns"); row.style.justifyContent = "center";
      if (list.length > 1) { var n = el("button", "btn btn-primary btn-sm", "Następny odcinek"); n.type = "button"; n.addEventListener("click", next); row.appendChild(n); }
      r.appendChild(row); box.appendChild(r);
    }
    intro();
  }

  // MARK: start

  function show(data) {
    $("loading").classList.add("hidden");
    if (!data) { $("missing").classList.remove("hidden"); return; }
    series = data;
    list = (data.topics || []).filter(function (t) { return t.episode && t.episode.id; });
    var when = data.exam_date ? " · " + (data.exam_title || "kolokwium").toLowerCase() + " " + day(data.exam_date) : "";
    $("sub").textContent = (data.subject || "") + when;
    var total = list.reduce(function (n, t) { return n + (t.episode.seconds || 0); }, 0);
    $("byline").textContent = "Udostępnia " + (data.author || "ktoś z roku") + " · " + plural(list.length, "odcinek", "odcinki", "odcinków") + (total ? ", razem " + minutes(total) : "");
    $("valid").textContent = data.expires_at ? "Link działa do " + new Date(data.expires_at).toLocaleDateString("pl-PL") + "." : "";
    $("report").href = "../zglos/#s=" + code; $("report-ep").href = "../zglos/#s=" + code;
    $("get").addEventListener("click", function () { rpc("record_series_click", { p_code: code }); });
    $("series").classList.remove("hidden");
    if (list.length) load(0, false); else { $("player").classList.add("hidden"); $("eps-title").classList.add("hidden"); render(); }
  }

  if (!code) { show(null); return; }
  rpc("get_shared_series", { p_code: code }).then(show).catch(function () { show(null); });
})();
