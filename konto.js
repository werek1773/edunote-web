// Konto i ustawienia (…/konto/): kto jest zalogowany i przez co, urządzenia konta (sync_devices, tylko własne przez
// RLS), wygląd strony, wylogowanie z tej przeglądarki i usunięcie konta (funkcja account-delete z expected_uid, żeby
// nie skasować innego konta, gdy sesja w międzyczasie się zmieniła). Usunięcie potwierdza się słowem „USUŃ”.
(function () {
  "use strict";
  var A = window.eduAuth, user = null;
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { if (k === "text") e.textContent = attrs[k]; else if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }

  var VIA = { email: "Logujesz się kodem z e‑maila", apple: "Logujesz się przez Apple", google: "Logujesz się przez Google" };
  var PLATFORM = { mac: "Mac", iphone: "iPhone", ipad: "iPad", windows: "Windows", web: "Przeglądarka" };

  // „przed chwilą”, „12 min temu”, „dziś 9:41”, „wczoraj 20:10”, „3 listopada”
  function ago(iso) {
    var d = new Date(iso), min = Math.round((Date.now() - d) / 60000);
    if (min < 2) return "przed chwilą";
    if (min < 60) return min + " min temu";
    var time = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    var start = new Date(); start.setHours(0, 0, 0, 0);
    if (d >= start) return "dziś " + time;
    if (d >= new Date(start.getTime() - 86400000)) return "wczoraj " + time;
    return d.toLocaleDateString("pl-PL", { day: "numeric", month: "long" });
  }
  // długi adres łamie się po „@” i po kropkach, a nie w połowie słowa
  function breakable(node, text) {
    node.textContent = "";
    text.split(/(?=[@.])/).forEach(function (part, i) { if (i) node.appendChild(document.createElement("wbr")); node.appendChild(document.createTextNode(part)); });
  }

  function signedIn(session) {
    user = session.user;
    var meta = user.user_metadata || {}, providers = (user.app_metadata && user.app_metadata.providers) || [user.app_metadata && user.app_metadata.provider];
    $("who-initial").textContent = (meta.full_name || meta.name || user.email || "?").trim().charAt(0).toUpperCase();
    breakable($("who-email"), user.email || "Konto bez adresu e‑mail");
    $("who-via").textContent = providers.filter(Boolean).map(function (p) { return VIA[p] || p; }).join(" · ");
    ["who-box", "devices-box", "actions-box"].forEach(function (id) { $(id).classList.remove("hidden"); });
    profileUI();
    A.client().from("sync_devices").select("device,name,platform,app_version,last_seen").order("last_seen", { ascending: false })
      .then(function (r) {
        var list = $("devices");
        list.innerHTML = "";
        (r.data || []).forEach(function (d) {
          list.appendChild(el("li", {}, [el("span", {}, [el("b", { text: d.name || PLATFORM[d.platform] || "Urządzenie" }), d.platform ? " · " + (PLATFORM[d.platform] || d.platform) : ""]),
            el("span", { class: "muted", text: d.last_seen ? ago(d.last_seen) : "" })]));
        });
        if (!list.children.length) list.appendChild(el("li", {}, [el("span", { class: "muted", text: "Żadne urządzenie jeszcze się nie zsynchronizowało. Zaloguj się w aplikacji na Macu tym samym kontem." })]));
      });
  }

  // MARK: profil studenta (shared_profiles; do czasu wdrożenia tabeli sekcja się nie pokazuje)
  var profile = null, mySubjects = [];
  function profileUI() {
    var c = A.client();
    Promise.all([
      c.from("shared_profiles").select("code,nickname,subject_codes,blocked_at").maybeSingle(),
      c.from("shared_subjects").select("code,subject,author,expires_at,blocked_at").order("updated_at", { ascending: false })
    ]).then(function (r) {
      if (r[0].error || r[1].error) return; // brak tabeli profilu: bez sekcji
      profile = r[0].data; mySubjects = (r[1].data || []).filter(function (x) { return !x.blocked_at && new Date(x.expires_at) > new Date(); });
      $("profile-box").classList.remove("hidden");
      $("nick").value = profile ? profile.nickname : "";
      var box = $("profile-subjects"), chosen = profile ? profile.subject_codes : [];
      box.innerHTML = "";
      if (!mySubjects.length) box.appendChild(el("p", { class: "muted small", text: "Nie udostępniasz jeszcze żadnego przedmiotu. Udostępnij go w aplikacji na Macu (przycisk „Udostępnij” przy przedmiocie)." }));
      mySubjects.forEach(function (x) {
        var anon = !x.author, input = el("input", { type: "checkbox", value: x.code });
        input.checked = !anon && chosen.indexOf(x.code) >= 0;
        input.disabled = anon;
        box.appendChild(el("label", { class: "pick" + (anon ? " is-disabled" : "") }, [input,
          el("span", { text: (x.subject || "Przedmiot") + (anon ? " · udostępniony anonimowo" : "") })]));
      });
      $("profile-copy").classList.toggle("hidden", !profile);
      $("profile-delete").classList.toggle("hidden", !profile);
      $("profile-save").textContent = profile ? "Zapisz zmiany" : "Utwórz profil";
    });
  }
  function profileURL() { return location.origin + "/u/#" + profile.code; }
  $("profile-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var nick = $("nick").value.trim(), err = $("profile-error");
    var codes = Array.prototype.map.call($("profile-subjects").querySelectorAll("input:checked"), function (i) { return i.value; });
    if (!nick) { err.textContent = "Wpisz pseudonim, który zobaczą osoby z linkiem."; err.classList.remove("hidden"); $("nick").focus(); return; }
    err.classList.add("hidden");
    var c = A.client(), q = profile
      ? c.from("shared_profiles").update({ nickname: nick, subject_codes: codes, updated_at: new Date().toISOString() }).eq("code", profile.code).select().single()
      : c.from("shared_profiles").insert({ nickname: nick, subject_codes: codes }).select().single();
    q.then(function (r) {
      if (r.error) throw r.error;
      var created = !profile;
      profile = r.data;
      profileUI();
      if (window.eduToast) eduToast(created ? "Profil gotowy. Skopiuj link i wyślij go na grupę." : "Zapisano profil.");
    }).catch(function () { err.textContent = "Nie udało się zapisać profilu. Spróbuj za chwilę."; err.classList.remove("hidden"); });
  });
  $("profile-copy").addEventListener("click", function () {
    (navigator.clipboard ? navigator.clipboard.writeText(profileURL()) : Promise.reject()).then(function () {
      if (window.eduToast) eduToast("Skopiowano link do profilu.");
    }, function () { window.prompt("Skopiuj link:", profileURL()); });
  });
  $("profile-delete").addEventListener("click", function () {
    if (!profile || !window.confirm("Wyłączyć profil? Link przestanie działać, a przedmioty zostaną udostępnione jak dotąd.")) return;
    A.client().from("shared_profiles").delete().eq("code", profile.code).then(function (r) {
      if (r.error) return;
      profile = null; $("nick").value = ""; profileUI();
    });
  });

  function out() {
    var id = user && user.id;
    return A.signOut().then(function () { return id && window.eduSync ? eduSync.clear(id) : null; });
  }

  $("signout").addEventListener("click", function () { out().then(function () { location.href = "../biblioteka/"; }); });

  // MARK: usunięcie konta
  var sheet = $("del-sheet"), back = $("del-back"), word = $("del-word"), go = $("del-go");
  function openDel() { sheet.classList.remove("hidden"); back.classList.remove("hidden"); word.value = ""; go.disabled = true; word.focus(); }
  function closeDel() { sheet.classList.add("hidden"); back.classList.add("hidden"); $("del-error").classList.add("hidden"); $("delete").focus(); }
  $("delete").addEventListener("click", openDel);
  $("del-cancel").addEventListener("click", closeDel);
  back.addEventListener("click", closeDel);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !sheet.classList.contains("hidden")) closeDel(); });
  word.addEventListener("input", function () { go.disabled = word.value.trim().toUpperCase() !== "USUŃ"; });
  go.addEventListener("click", function () {
    go.disabled = true; go.textContent = "Usuwam…";
    A.session().then(function (s) {
      if (!s) throw new Error("Zaloguj się ponownie, żeby usunąć konto.");
      return fetch("https://fjpbdwsbktiylkborxvf.supabase.co/functions/v1/account-delete", {
        method: "POST",
        headers: { "Authorization": "Bearer " + s.access_token, "apikey": "sb_publishable_XtknqXVtb-T-5Wd-oKFxEA_NINWbDsE", "Content-Type": "application/json" },
        body: JSON.stringify({ expected_uid: s.user.id })
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || "Nie udało się usunąć konta. Spróbuj za chwilę."); }); });
    }).then(function () { return out(); }).then(function () {
      location.href = "../biblioteka/";
    }).catch(function (e) {
      var err = $("del-error"); err.textContent = e.message; err.classList.remove("hidden");
      go.textContent = "Usuń konto na zawsze"; go.disabled = word.value.trim().toUpperCase() !== "USUŃ";
    });
  });

  A.session().then(function (s) { if (s) signedIn(s); else $("signed-out").classList.remove("hidden"); })
    .catch(function () { $("signed-out").classList.remove("hidden"); });
})();
