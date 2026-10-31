// Zapis na EduNote na inne urządzenie jednym kliknięciem (strona główna i strona notatki bez Maca): wybór urządzenia,
// dobrowolny e-mail na jedną wiadomość, gdy wersja będzie gotowa, i licznik chętnych. Zapisuje funkcja join_waitlist
// w Supabase (supabase/migrations/20261031170000_waitlist.sql). Gdy jej jeszcze nie ma albo nie ma sieci, zostaje
// zwykły e-mail do autora, żeby przycisk nigdy nie był martwy.
(function () {
  "use strict";
  var SUPABASE = "https://fjpbdwsbktiylkborxvf.supabase.co";
  // klucz publiczny (publishable) – ten sam co w aplikacji, nie jest sekretem
  var KEY = "sb_publishable_XtknqXVtb-T-5Wd-oKFxEA_NINWbDsE";
  var NAMES = { android: "Androida", windows: "Windowsa", iphone: "iPhone'a" };

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === "text") e.textContent = attrs[k]; else if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function rpc(name, args) {
    return fetch(SUPABASE + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: { "apikey": KEY, "Content-Type": "application/json" },
      body: JSON.stringify(args || {})
    }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  }

  function mail(platform) {
    return "mailto:marcin@rozycki.pro?subject=" + encodeURIComponent("EduNote na " + (NAMES[platform] || "inne urządzenie"))
      + "&body=" + encodeURIComponent("Cześć, daj znać, gdy EduNote będzie na " + (NAMES[platform] || "moje urządzenie") + ".");
  }

  /** „1 osoba”, „3 osoby”, „5 osób” */
  function people(n) {
    var f = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
    return n + " " + (n === 1 ? "osoba" : f ? "osoby" : "osób");
  }

  // container: gdzie wstawić; opts.privacy: adres polityki prywatności względem strony
  function render(container, opts) {
    opts = opts || {};
    var email = el("input", { type: "email", inputmode: "email", autocomplete: "email", placeholder: "Twój e-mail (opcjonalnie)",
      "aria-label": "E-mail, jeśli chcesz wiadomość, gdy będzie gotowe (opcjonalnie)" });
    var status = el("p", { class: "waitlist-status", role: "status" });
    var buttons = el("div", { class: "waitlist-opts" });
    var box = el("div", { class: "waitlist" }, [
      el("p", { class: "waitlist-q", text: "Na czym chcesz EduNote? Jedno kliknięcie, bez konta." }),
      buttons, email, status,
      el("p", { class: "waitlist-note" }, [document.createTextNode("E-mail jest dobrowolny: tylko jedna wiadomość, gdy wersja będzie gotowa. "),
        el("a", { href: opts.privacy || "prywatnosc/", text: "Prywatność" })])
    ]);
    ["android", "windows", "iphone"].forEach(function (p) {
      var b = el("button", { class: "btn btn-ghost btn-sm", type: "button", text: { android: "Android", windows: "Windows", iphone: "iPhone" }[p] });
      b.addEventListener("click", function () { join(p, b); });
      buttons.appendChild(b);
    });

    function join(platform, b) {
      var address = email.value.trim();
      if (address && !email.checkValidity()) { status.textContent = "Sprawdź adres e-mail albo zostaw to pole puste."; return; }
      Array.prototype.forEach.call(buttons.children, function (x) { x.disabled = true; });
      status.textContent = "Zapisuję…";
      rpc("join_waitlist", { p_platform: platform, p_email: address || null }).then(function () {
        b.classList.add("on");
        email.remove();
        status.textContent = "Zapisane: EduNote na " + NAMES[platform] + "." + (address ? " Dam znać mailem, gdy będzie gotowe." : "");
        return rpc("waitlist_count").then(function (rows) {
          var row = (rows || []).filter(function (r) { return r.platform === platform; })[0];
          if (row && row.waiting > 1) status.textContent += " Czeka już " + people(Number(row.waiting)) + ".";
        }).catch(function () {});
      }).catch(function () {
        // bez funkcji w bazie albo bez sieci: zwykły e-mail do autora
        Array.prototype.forEach.call(buttons.children, function (x) { x.disabled = false; });
        status.textContent = "";
        status.appendChild(document.createTextNode("Nie udało się zapisać. "));
        status.appendChild(el("a", { href: mail(platform), text: "Napisz zamiast tego do autora" }));
      });
    }

    container.appendChild(box);
  }

  window.eduWaitlist = render;
})();
