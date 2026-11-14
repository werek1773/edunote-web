// Strona logowania (…/zaloguj/): Apple, Google albo kod z e-maila, jak w Claude. Ten sam ekran zakłada konto i loguje.
// Po zalogowaniu wraca tam, skąd ktoś przyszedł (…/zaloguj/?dalej=/biblioteka/), domyślnie do biblioteki.
(function () {
  "use strict";
  var A = window.eduAuth, M = window.eduMotion || null;
  var email = "", resendTimer = null;

  function $(id) { return document.getElementById(id); }
  function show(id) {
    ["step-start", "step-code", "step-done"].forEach(function (s) { $(s).classList.toggle("hidden", s !== id); });
    $("skip").classList.toggle("hidden", id === "step-done");
    if (M && M.ok()) M.enter($(id), { y: 10 });
  }
  function error(id, text) {
    var e = $(id);
    e.textContent = text || "";
    e.classList.toggle("hidden", !text);
  }
  function busy(btn, on, label) {
    btn.disabled = on;
    if (label) btn.textContent = label;
    btn.classList.toggle("busy", on);
  }

  // dokąd po zalogowaniu: tylko adres na tej stronie (bez przekierowań na obce strony)
  function next() {
    var d = new URLSearchParams(location.search).get("dalej") || "";
    return /^\/[A-Za-z0-9/_#.-]*$/.test(d) && d.indexOf("//") < 0 ? d : "../biblioteka/";
  }

  function done(session) {
    var u = session && session.user;
    $("done-who").textContent = u && u.email ? "Konto: " + u.email : "Zalogowano.";
    $("next").href = next();
    show("step-done");
  }

  // MARK: kod z e-maila

  $("email-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var value = $("email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) { error("start-error", "To nie wygląda na adres e‑mail. Sprawdź, czy nie ma literówki."); $("email").focus(); return; }
    error("start-error", "");
    busy($("send"), true, "Wysyłam kod…");
    A.sendCode(value).then(function (r) {
      email = value;
      $("code-hint").textContent = "Wysłaliśmy 6‑cyfrowy kod na adres " + email + ". Kod działa " + Math.round((r.expires_in || 600) / 60) + " minut.";
      show("step-code");
      $("code").value = "";
      $("code").focus();
      countdown(r.resend_after || 45);
    }).catch(function (err) {
      error("start-error", err.message);
    }).then(function () { busy($("send"), false, "Wyślij mi kod"); });
  });

  // nowy kod najwcześniej po czasie z serwera; licznik na przycisku
  function countdown(seconds) {
    clearInterval(resendTimer);
    var left = seconds, b = $("resend");
    b.disabled = true;
    function tick() {
      if (left <= 0) { clearInterval(resendTimer); b.disabled = false; b.textContent = "Wyślij kod jeszcze raz"; return; }
      b.textContent = "Nowy kod za " + left + " s";
      left--;
    }
    tick();
    resendTimer = setInterval(tick, 1000);
  }

  $("resend").addEventListener("click", function () {
    error("code-error", "");
    A.sendCode(email).then(function (r) { countdown(r.resend_after || 45); if (window.eduToast) eduToast("Wysłaliśmy nowy kod."); })
      .catch(function (err) { error("code-error", err.message); if (err.retryAfter) countdown(err.retryAfter); });
  });
  $("change").addEventListener("click", function () { clearInterval(resendTimer); show("step-start"); $("email").focus(); });

  // kod wklejony albo wpisany: same cyfry, a po szóstej od razu logowanie
  $("code").addEventListener("input", function () {
    var v = this.value.replace(/\D/g, "").slice(0, 6);
    if (v !== this.value) this.value = v;
    if (v.length === 6) $("code-form").requestSubmit ? $("code-form").requestSubmit() : $("verify").click();
  });
  $("code-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var code = $("code").value.replace(/\D/g, "");
    if (code.length !== 6) { error("code-error", "Kod to 6 cyfr z maila."); return; }
    error("code-error", "");
    busy($("verify"), true, "Sprawdzam…");
    A.verifyCode(email, code).then(function (session) {
      clearInterval(resendTimer);
      done(session);
    }).catch(function (err) {
      error("code-error", err.message);
      $("code").select();
    }).then(function () { busy($("verify"), false, "Zaloguj się"); });
  });

  // MARK: Apple i Google (nie w przeglądarkach w aplikacjach: tam zostaje kod z e-maila)

  if (A.inApp()) {
    $("inapp").classList.remove("hidden");
    $("providers").classList.add("hidden");
    $("copy-link").addEventListener("click", function () {
      var url = location.origin + location.pathname;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () {
        if (window.eduToast) eduToast("Skopiowano link. Otwórz go w Chrome albo Safari.");
      }, function () { window.prompt("Skopiuj link:", url); });
    });
  } else {
    var dark = document.documentElement.dataset.theme === "dark";
    A.mountGoogle($("google"), { dark: dark, onDone: function (err, session) {
      if (err) { error("start-error", err.message); return; }
      done(session);
    } }).then(function (shown) { if (!shown) $("google").classList.add("hidden"); })
      .catch(function () { $("google").classList.add("hidden"); });
    A.appleEnabled().then(function (on) {
      if (!on) { $("apple").classList.add("hidden"); return; }
      var redirect = location.origin + location.pathname;
      // skrypt Apple i nonce zawczasu, żeby kliknięcie od razu otwierało okno (Safari blokuje spóźnione okna)
      A.prepareApple(redirect).catch(function () {});
      $("apple").addEventListener("click", function () {
        error("start-error", "");
        A.signInApple(redirect).then(done).catch(function (err) {
          if (!err.cancelled) error("start-error", err.message || "Apple nie potwierdził logowania. Spróbuj jeszcze raz.");
        });
      });
    });
  }

  $("signout").addEventListener("click", function () {
    A.signOut().then(function () { show("step-start"); if (window.eduToast) eduToast("Wylogowano z tej przeglądarki."); });
  });

  // już zalogowany w tej przeglądarce: od razu, kto to i dokąd dalej
  A.session().then(function (s) { if (s) done(s); }).catch(function () {});
  if (window.eduTypo) eduTypo(document.body);
})();
