// Profil studenta (…/u/#KOD): przedmioty, z których ta osoba udostępnia notatki, pod jednym linkiem (RPC
// get_shared_profile). Każdy przedmiot prowadzi do zwykłej strony przedmiotu (…/p/#KOD). Na profilu są tylko
// przedmioty z podpisem autora; udostępnione „Anonimowo” nigdy tu nie trafiają (pilnuje tego serwer).
(function () {
  "use strict";
  var SUPABASE = "https://fjpbdwsbktiylkborxvf.supabase.co";
  var KEY = "sb_publishable_XtknqXVtb-T-5Wd-oKFxEA_NINWbDsE";
  var code = (location.hash || "").replace(/^#/, "").split("/")[0].replace(/[^A-Za-z0-9]/g, "");
  var L = window.eduLibrary, M = window.eduMotion || null;

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { if (k === "text") e.textContent = attrs[k]; else if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function plural(n, one, few, many) { return eduStudy.plural(n, one, few, many); }
  function lastDay(iso) {
    var end = new Date(new Date(iso).getTime() - 1000);
    return end.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw" });
  }

  // rodzaje zajęć z planu autora („wykłady i ćwiczenia”)
  var KINDS = { "wykład": "wykłady", "ćwiczenia": "ćwiczenia", "laboratorium": "laboratoria", "seminarium": "seminaria" };
  function kinds(s) {
    var list = Object.keys((s.meta && s.meta.when) || {}).map(function (k) { return KINDS[k]; }).filter(Boolean);
    return list.length > 1 ? list.slice(0, -1).join(", ") + " i " + list[list.length - 1] : list[0] || "";
  }

  function entry(s) {
    return { kind: "p", code: s.code, subject: s.subject || "", author: s.author || "", lessons: s.notes || 0,
             expires_at: s.expires_at || "", updated_at: s.updated_at || "" };
  }

  // Zapis całego profilu w bibliotece: po zgodzie od razu, bez niej jednym stuknięciem (jak przy przedmiocie)
  function offer(subjects) {
    if (!L || !subjects.length) return;
    var box = $("welcome");
    function done(text) {
      box.innerHTML = "";
      box.appendChild(el("div", { class: "welcome-text" }, [el("p", { class: "welcome-title", text: text }),
        el("p", { text: "Wrócisz do nich z biblioteki, bez szukania linku na czacie." })]));
      box.classList.remove("hidden");
    }
    if (L.consented()) {
      var fresh = 0;
      subjects.forEach(function (s) { if (L.save(entry(s))) fresh++; });
      if (fresh) done(plural(fresh, "przedmiot zapisany", "przedmioty zapisane", "przedmiotów zapisanych") + " w Twojej bibliotece");
      return;
    }
    var btn = el("button", { type: "button", class: "btn btn-primary btn-sm welcome-save", text: "Zapisz wszystkie w mojej bibliotece" });
    btn.addEventListener("click", function () {
      L.allow();
      subjects.forEach(function (s) { L.save(entry(s)); });
      done("Zapisano w Twojej bibliotece");
    });
    box.innerHTML = "";
    box.appendChild(el("div", { class: "welcome-text" }, [el("p", { class: "welcome-title ask", text: "Wszystkie przedmioty w jednym miejscu" }),
      el("p", { text: "Zapisz je w swojej bibliotece w tej przeglądarce. Kolejne linki od ludzi z roku zapiszą się same." }), btn]));
    box.classList.remove("hidden");
  }

  function render(d) {
    var subjects = d.subjects || [], nick = d.nickname || "Ktoś z roku";
    document.title = nick + ": notatki z zajęć · EduNote";
    $("nickname").textContent = nick;
    $("initial").textContent = nick.trim().charAt(0).toUpperCase();
    $("meta").textContent = subjects.length ? plural(subjects.length, "przedmiot", "przedmioty", "przedmiotów") + " z notatkami" : "Na razie bez przedmiotów";
    var list = $("subjects");
    subjects.forEach(function (s) {
      list.appendChild(el("li", { class: "shelf-item" }, [el("a", { class: "shelf-card", href: "../p/#" + s.code }, [
        el("span", { class: "shelf-top" }, [el("span", { class: "shelf-title", text: s.subject || "Przedmiot" })]),
        el("span", { class: "shelf-meta", text: [plural(s.notes || 0, "notatka", "notatki", "notatek"), kinds(s)].filter(Boolean).join(" · ") }),
        s.expires_at ? el("span", { class: "shelf-foot" }, [el("span", { class: "shelf-until", text: "Link do " + lastDay(s.expires_at) })]) : null
      ])]));
    });
    if (!subjects.length) list.appendChild(el("li", {}, [el("p", { class: "muted", text: "Autor nie dodał jeszcze przedmiotów albo ich linki wygasły." })]));
    var share = $("share-top");
    share.classList.remove("hidden");
    share.addEventListener("click", function () {
      eduShare(nick + ": notatki z " + plural(subjects.length, "przedmiotu", "przedmiotów", "przedmiotów") + " w EduNote. "
        + "Nieoficjalne notatki z AI, sprawdźcie z zajęciami. Działa w przeglądarce, bez logowania:", location.origin + location.pathname + "#" + code, "Wyślij na grupę roku");
    });
    offer(subjects);
    if (window.eduTypo) eduTypo($("profile"));
    $("loading").classList.add("hidden");
    $("profile").classList.remove("hidden");
    if (M && M.ok()) M.stagger(document.querySelectorAll("#profile > *, #subjects > li"), { step: 45, max: 8, y: 10 });
  }

  function missing() {
    $("loading").classList.add("hidden");
    $("missing").classList.remove("hidden");
  }

  if (!code) { missing(); return; }
  fetch(SUPABASE + "/rest/v1/rpc/get_shared_profile", {
    method: "POST", headers: { "apikey": KEY, "Content-Type": "application/json" }, body: JSON.stringify({ p_code: code })
  }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d) render(d); else missing(); }).catch(missing);
})();
