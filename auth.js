// Konto EduNote na stronie: te same konta co w aplikacji na Maca (Supabase Auth). Trzy sposoby, jak w Claude:
// - Apple: Sign in with Apple JS w okienku, identity token → supabase.auth.signInWithIdToken; potem kod autoryzacji
//   idzie do funkcji account-apple (client "web"), żeby usunięcie konta mogło unieważnić zgodę u Apple,
// - Google: przycisk Google Identity Services w okienku, ID token → signInWithIdToken,
// - kod z e-maila: funkcja account-email (send, verify) zwraca sesję, którą strona przyjmuje przez setSession.
// Nonce: do Apple i Google idzie skrót SHA-256, do Supabase sam nonce (Supabase porównuje skrót z tokenem).
// Sesję trzyma supabase-js (web/vendor) w localStorage pod „edunote.konto” i sam ją odświeża, także między kartami.
// Wylogowanie tylko w tej przeglądarce (scope "local"), żeby nie wylogować Maca.
(function () {
  "use strict";
  var SUPABASE = "https://fjpbdwsbktiylkborxvf.supabase.co";
  // klucz publiczny (publishable), ten sam co w aplikacji i w note.js; nie jest sekretem
  var KEY = "sb_publishable_XtknqXVtb-T-5Wd-oKFxEA_NINWbDsE";
  var STORAGE = "edunote.konto";
  var APPLE_CLIENT = "app.edunote.EduNote.web";
  var APPLE_SCRIPT = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/pl_PL/appleid.auth.js";
  // supabase-js leży obok auth.js (web/vendor); biblioteka wczytuje go dopiero dla zalogowanych (ready())
  var VENDOR = new URL("vendor/supabase-2.119.0.js", (document.currentScript && document.currentScript.src) || location.href).href;
  // Logowanie widoczne dla wszystkich („Zaloguj się” w bibliotece). Do startu z nową polityką prywatności false:
  // /zaloguj/ działa pod bezpośrednim adresem, a zalogowany widzi swoje konto, ale nikt inny nie trafi na logowanie.
  var OPEN = false;
  var GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";

  var client = null;
  function sb() {
    if (client) return client;
    if (!window.supabase || !window.supabase.createClient) throw new Error("Brak biblioteki supabase-js");
    client = window.supabase.createClient(SUPABASE, KEY, {
      auth: { storageKey: STORAGE, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    return client;
  }

  // Bez wczytywania supabase-js: czy w tej przeglądarce ktoś jest zalogowany i jak go podpisać w pasku (inicjał)
  function peek() {
    try {
      var d = JSON.parse(localStorage.getItem(STORAGE) || "null");
      var u = d && (d.user || (d.currentSession && d.currentSession.user));
      if (!u) return null;
      var meta = u.user_metadata || {};
      return { email: u.email || "", name: meta.full_name || meta.name || "", id: u.id };
    } catch (e) { return null; }
  }

  // Przeglądarki w aplikacjach (Messenger, Instagram, Facebook, TikTok, LinkedIn, Snapchat): Google tam blokuje
  // logowanie (disallowed_useragent), a okienko Apple bywa zawodne, więc zostaje kod z e-maila
  function inApp() {
    return /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Line\/|TikTok|musical_ly|Bytedance|LinkedInApp|Snapchat|; wv\)/i.test(navigator.userAgent || "");
  }

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  // losowy nonce i jego skrót SHA-256 (szesnastkowo, jak w aplikacji na Maca)
  function nonce() {
    var raw = hex(crypto.getRandomValues(new Uint8Array(24)));
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)).then(function (h) { return { raw: raw, hashed: hex(h) }; });
  }

  // Każdy skrypt wczytuje się raz; kolejne wywołania czekają na ten sam wynik (a nie kończą się, zanim skrypt dojdzie)
  var loading = {};
  function load(src) {
    if (loading[src]) return loading[src];
    loading[src] = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { delete loading[src]; s.remove(); reject(new Error("Nie udało się wczytać logowania. Sprawdź internet.")); };
      document.head.appendChild(s);
    });
    return loading[src];
  }

  // Funkcje serwera EduNote (Supabase Edge Functions); błąd ma polskie zdanie z serwera, gdy serwer je podał
  function fn(name, body, token) {
    var headers = { "apikey": KEY, "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(SUPABASE + "/functions/v1/" + name, { method: "POST", headers: headers, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) {
            var e = new Error(j.message || j.error || "Coś poszło nie tak po stronie EduNote. Spróbuj za chwilę.");
            e.code = j.error || ""; e.retryAfter = j.retry_after || 0;
            throw e;
          }
          return j;
        });
      }, function () { throw new Error("Brak połączenia z internetem. Sprawdź sieć i spróbuj jeszcze raz."); });
  }

  // MARK: kod z e-maila

  function sendCode(email) { return fn("account-email", { action: "send", email: email }); }

  function verifyCode(email, code) {
    return fn("account-email", { action: "verify", email: email, code: code }).then(function (j) {
      if (!j.session) throw new Error("Nie udało się zalogować. Spróbuj jeszcze raz.");
      return sb().auth.setSession({ access_token: j.session.access_token, refresh_token: j.session.refresh_token });
    }).then(function (r) {
      if (r.error) throw new Error("Nie udało się zalogować. Spróbuj jeszcze raz.");
      return r.data.session;
    });
  }

  // MARK: ustawienia logowania z app_config (jak w aplikacji na Maca): przyciski Apple i Google pojawiają się, gdy
  // ktoś wpisze tam identyfikatory klientów, bez nowej wersji strony
  var config = null;
  function appConfig() {
    if (!config) {
      config = fetch(SUPABASE + "/rest/v1/app_config?key=in.(google_web_client_id,apple_web_client_id)&select=key,value", { headers: { "apikey": KEY } })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) { var o = {}; (rows || []).forEach(function (x) { o[x.key] = x.value; }); return o; })
        .catch(function () { return {}; });
    }
    return config;
  }

  // MARK: Apple

  function appleClientID() {
    return appConfig().then(function (c) { var id = c.apple_web_client_id; return id === APPLE_CLIENT ? id : ""; });
  }
  function appleEnabled() { return appleClientID().then(function (id) { return !!id; }); }

  function appleReady(redirect, n) {
    return Promise.all([appleClientID(), load(APPLE_SCRIPT)]).then(function (r) {
      if (!r[0]) throw new Error("Logowanie przez Apple jeszcze nie działa na stronie. Zaloguj się kodem z e‑maila.");
      window.AppleID.auth.init({ clientId: r[0], scope: "name email", redirectURI: redirect, nonce: n.hashed, usePopup: true });
    });
  }

  function signInApple(redirect) {
    var n;
    return nonce().then(function (x) { n = x; return appleReady(redirect, n); })
      .then(function () { return window.AppleID.auth.signIn(); })
      .then(function (res) {
        var a = (res && res.authorization) || {};
        if (!a.id_token) throw new Error("Apple nie potwierdził logowania. Spróbuj jeszcze raz.");
        return sb().auth.signInWithIdToken({ provider: "apple", token: a.id_token, nonce: n.raw }).then(function (r) {
          if (r.error) throw r.error;
          var session = r.data.session;
          // kod autoryzacji dla funkcji account-apple (unieważnienie zgody przy usuwaniu konta); bez czekania
          if (a.code && session) fn("account-apple", { authorization_code: a.code, client: "web" }, session.access_token).catch(function () {});
          return session;
        });
      }, function (e) {
        // zamknięte okienko Apple to nie błąd
        if (e && (e.error === "popup_closed_by_user" || e.error === "user_cancelled_authorize")) { var c = new Error(""); c.cancelled = true; throw c; }
        throw e && e.message ? e : new Error("Apple nie potwierdził logowania. Spróbuj jeszcze raz.");
      });
  }

  // MARK: Google

  // Identyfikator klienta Google typu „aplikacja internetowa” z app_config (jak w aplikacji na Maca): przycisk Google
  // pojawia się, gdy go tam wpiszesz, bez nowej wersji strony
  function googleClientID() {
    return appConfig().then(function (c) {
      var id = c.google_web_client_id;
      return typeof id === "string" && /\.apps\.googleusercontent\.com$/.test(id) ? id : "";
    });
  }

  // Przycisk Google rysuje sam Google (tak każą jego zasady); po wybraniu konta onDone dostaje sesję albo błąd
  function mountGoogle(host, opts) {
    var n;
    return Promise.all([googleClientID(), nonce()]).then(function (r) {
      var id = r[0]; n = r[1];
      if (!id) return false;
      return load(GOOGLE_SCRIPT).then(function () {
        window.google.accounts.id.initialize({
          client_id: id, nonce: n.hashed, ux_mode: "popup", use_fedcm_for_button: false, auto_select: false, itp_support: true,
          callback: function (resp) {
            sb().auth.signInWithIdToken({ provider: "google", token: resp.credential, nonce: n.raw }).then(function (x) {
              if (x.error) throw x.error;
              opts.onDone(null, x.data.session);
            }).catch(function (e) { opts.onDone(e && e.message ? e : new Error("Google nie potwierdził logowania. Spróbuj jeszcze raz.")); });
          }
        });
        window.google.accounts.id.renderButton(host, {
          type: "standard", theme: opts.dark ? "filled_black" : "outline", size: "large", text: "continue_with",
          shape: "pill", logo_alignment: "center", locale: "pl", width: Math.min(400, Math.max(240, host.clientWidth || 320))
        });
        return true;
      });
    });
  }

  // MARK: sesja

  // supabase-js wczytany (strony konta mają go od razu, biblioteka dopiero dla zalogowanych)
  function ready() { return window.supabase && window.supabase.createClient ? Promise.resolve() : load(VENDOR); }
  function session() { return ready().then(function () { return sb().auth.getSession(); }).then(function (r) { return r.data.session; }); }
  function onChange(fn) { return sb().auth.onAuthStateChange(function (event, s) { fn(event, s); }); }
  function signOut() { return ready().then(function () { return sb().auth.signOut({ scope: "local" }); }); }

  window.eduAuth = {
    client: sb, peek: peek, inApp: inApp, sendCode: sendCode, verifyCode: verifyCode, signInApple: signInApple, appleEnabled: appleEnabled,
    mountGoogle: mountGoogle, session: session, onChange: onChange, signOut: signOut, storageKey: STORAGE, ready: ready, open: OPEN
  };
})();
