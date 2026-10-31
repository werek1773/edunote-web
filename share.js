// Wysyłanie linku na czat roku: na telefonie systemowe udostępnianie z gotowym tekstem, a tam, gdzie go nie ma
// (część przeglądarek na komputerze), okienko z wiadomością i przyciskiem „Kopiuj”. Podgląd linku na czacie jest
// taki sam dla każdej notatki (kod notatki stoi po „#”), więc o temacie mówi sam tekst wiadomości.
// Używają go strona notatki (note.js) i strona główna.
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

  function toast(text) {
    var t = el("div", { class: "toast", role: "status", text: text });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2800);
  }

  // Schowek, a gdy przeglądarka go nie da: zaznaczony tekst i stare „kopiuj” (działa też bez HTTPS)
  function copy(text, area) {
    function fallback() {
      area.focus();
      area.select();
      try { return document.execCommand("copy"); } catch (e) { return false; }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    }
    return Promise.resolve(fallback());
  }

  // opts.hint: zdanie pod tytułem, opts.button: napis na przycisku, opts.done: komunikat po skopiowaniu
  function sheet(message, heading, opts) {
    opts = opts || {};
    var opener = document.activeElement;
    var area = el("textarea", { class: "sheet-text", rows: String(opts.rows || 4), readonly: "", "aria-label": heading });
    area.value = message;
    var copyBtn = el("button", { class: "btn btn-primary btn-block", type: "button", text: opts.button || "Kopiuj wiadomość" });
    var closeBtn = el("button", { class: "link", type: "button", text: "Zamknij" });
    var back = el("div", { class: "sheet-back" });
    var box = el("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": heading }, [
      el("h2", { text: heading }),
      el("p", { class: "muted", text: opts.hint || "Skopiuj wiadomość i wklej ją na grupie roku albo znajomym." }),
      area, copyBtn, closeBtn
    ]);
    function close() {
      back.remove();
      box.remove();
      document.removeEventListener("keydown", onKey);
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    copyBtn.addEventListener("click", function () {
      copy(message, area).then(function (ok) {
        if (ok) { close(); toast(opts.done || "Skopiowano. Wklej wiadomość na grupie."); }
        else toast("Tekst jest zaznaczony. Skopiuj go i wklej.");
      });
    });
    closeBtn.addEventListener("click", close);
    back.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.appendChild(back);
    document.body.appendChild(box);
    copyBtn.focus({ preventScroll: true });
  }

  // text: wiadomość bez linku, url: link, heading: tytuł okienka, gdy nie ma systemowego udostępniania,
  // hint: zdanie pod tytułem okienka
  function share(text, url, heading, hint) {
    var fallback = function () { sheet(text + "\n" + url, heading, { hint: hint }); };
    if (navigator.share) {
      navigator.share({ text: text, url: url }).catch(function (e) { if (!e || e.name !== "AbortError") fallback(); });
    } else {
      fallback();
    }
  }

  // Dwa gotowe teksty dla roku bez Maca: prośba do osoby z Makiem (co nagrywający ma z tego dla siebie, bez
  // obiecywania ceny) i prośba do prowadzącego o zgodę na nagrywanie, zgodna z tym, co naprawdę robi aplikacja
  // (nagranie zostaje na komputerze, do AI trafia sam tekst, link tylko dla roku i wygasa po sesji poprawkowej)
  var ASK_LECTURER = "Dzień dobry,\n\n"
    + "czy możemy nagrywać Pani/Pana wykłady z [przedmiot], żeby się z nich uczyć? Nagrywa jedna osoba z roku "
    + "na swoim komputerze i nagranie tam zostaje. Aplikacja EduNote robi z niego notatkę i fiszki z pomocą AI "
    + "(do AI trafia sam tekst, bez nagrania). Udostępniamy je tylko naszemu rokowi przez link, nigdzie ich nie publikujemy, "
    + "a link przestaje działać po sesji poprawkowej. Jeśli jakiejś części zajęć nie chce Pani/Pan nagrywać, "
    + "oczywiście jej nie nagramy.\n\n"
    + "Z wyrazami szacunku\n[imię i nazwisko], [kierunek, rok]";
  window.eduAsk = {
    mac: "Hej, nagrasz nam wykład w EduNote, jeśli prowadzący się zgodzi? Ty masz z nagrania gotową notatkę, fiszki i quiz, "
      + "a reszta roku uczy się z linku, bez instalowania. Tak to wygląda:",
    lecturer: function () {
      sheet(ASK_LECTURER, "Prośba do prowadzącego", {
        hint: "Uzupełnij przedmiot i podpis, a potem wyślij z poczty uczelnianej albo zapytaj po zajęciach.",
        button: "Kopiuj prośbę", done: "Skopiowano. Wklej prośbę w mailu do prowadzącego.", rows: 9
      });
    }
  };

  window.eduShare = share;
  // okienko z tekstem do skopiowania, np. fiszki do Quizleta: eduCopy(tekst, tytuł, { hint, button, done, rows })
  window.eduCopy = sheet;
  window.eduToast = toast;
})();
