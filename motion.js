// Ruch na stronie EduNote, wspólny dla strony głównej, notatki i przedmiotu: spokojne, płynne przejścia zamiast
// skoków. Treść po wczytaniu wchodzi po kolei, zakładki mają przesuwaną pigułkę, nowa zakładka wsuwa się z boku,
// z którego przyszła, rozwijane pytania zmieniają wysokość płynnie, fiszka odlatuje w stronę przycisku oceny,
// powiększona tablica wyrasta z miniatury, a sekcje strony głównej pojawiają się przy przewijaniu.
// Animujemy prawie tylko transform i opacity, więc także starszy telefon nie gubi klatek. Kto wyłączył animacje
// w systemie (prefers-reduced-motion), dostaje wszystko od razu. Bez tego pliku strona działa tak samo, tylko bez
// ruchu: inne skrypty wołają go przez window.eduMotion, a każda funkcja sama sprawdza, czy wolno się ruszać.
(function () {
  "use strict";
  var media = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  // wejście: szybki start i długie, miękkie hamowanie; wyjście: rozpędza się i znika; zmiana stanu: miękko w obie strony
  var EASE = "cubic-bezier(.22, 1, .36, 1)", EXIT = "cubic-bezier(.5, 0, .75, 0)", MOVE = "cubic-bezier(.65, 0, .35, 1)";

  function ok() { return !(media && media.matches) && typeof Element.prototype.animate === "function"; }

  // Safari na iPhonie pokazuje stan :active (przycisk lekko się wciska, style.css) tylko wtedy, gdy strona słucha dotyku
  document.addEventListener("touchstart", function () {}, { passive: true });
  function each(list, fn) { Array.prototype.forEach.call(list || [], fn); }
  function shown(n) { return !!(n && n.nodeType === 1 && n.getClientRects().length); }
  function px(v) { return parseFloat(v) || 0; }

  function play(node, frames, opts) {
    if (!node || !ok()) return null;
    try {
      return node.animate(frames, Object.assign({ duration: 420, easing: EASE, fill: "backwards" }, opts || {}));
    } catch (e) { return null; }
  }
  // Koniec animacji (także przerwanej); bez animacji od razu. Z zapasowym zegarem: gdy przeglądarka wstrzyma klatki
  // (karta w tle, oszczędzanie baterii), zamknięcie okienka czy przejście do następnej notatki i tak się wydarzy.
  function finished(a) {
    if (!a || !a.finished) return Promise.resolve();
    var end = 0;
    try { end = a.effect.getComputedTiming().endTime || 0; } catch (e) {}
    return Promise.race([a.finished.then(null, function () {}),
      new Promise(function (r) { setTimeout(r, end + 250); })]);
  }
  function shift(o, y) {
    return "translate3d(" + (o.x || 0) + "px," + (o.y === undefined ? y : o.y) + "px,0)" + (o.scale ? " scale(" + o.scale + ")" : "");
  }

  // Wejście z przesunięcia i przezroczystości na miejsce. o: x, y (px), scale, delay, duration
  function enter(node, o) {
    o = o || {};
    return play(node, [{ opacity: 0, transform: shift(o, 10) }, { opacity: 1, transform: "none" }],
      { duration: o.duration || 520, delay: o.delay || 0, easing: o.easing || EASE });
  }

  // Po kolei: każdy następny element trochę później; od `max` (domyślnie 8) wszystkie razem, żeby długa lista nie czekała
  function stagger(nodes, o) {
    o = o || {};
    var i = 0;
    each(nodes, function (n) {
      if (!shown(n)) return;
      enter(n, Object.assign({}, o, { delay: (o.delay || 0) + Math.min(i++, o.max || 8) * (o.step || 50) }));
    });
  }

  // Wyjście: znika i lekko odjeżdża; zostaje niewidoczne, aż ktoś je usunie. Zwraca obietnicę końca.
  function leave(node, o) {
    o = o || {};
    return finished(play(node, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: shift(o, -6) }],
      { duration: o.duration || 200, easing: EXIT, fill: "forwards" }));
  }

  // Nowa treść w tym samym miejscu (zakładka, powrót do listy): dir 1 wsuwa z prawej, -1 z lewej, 0 od dołu
  function swap(node, dir) {
    return enter(node, dir ? { x: 18 * dir, y: 0, duration: 460 } : { y: 10, duration: 460 });
  }

  // Pigułka pod wybraną zakładką przesuwa się do nowej, zamiast przeskakiwać. Zwraca place(animate): wołać po każdej
  // zmianie aria-selected. Gdy zakładki przewijają się w bok (wąski telefon), wybrana wjeżdża cała na ekran.
  function pill(tabs) {
    if (!tabs) return function () {};
    var p = tabs.querySelector(".tab-pill");
    if (!p) {
      p = document.createElement("span");
      p.className = "tab-pill";
      p.setAttribute("aria-hidden", "true");
      tabs.insertBefore(p, tabs.firstChild);
    }
    tabs.classList.add("has-pill");
    function place(animate) {
      var on = tabs.querySelector('[role="tab"][aria-selected="true"]');
      if (!on || !on.offsetWidth) return;
      var instant = !animate || !ok() || !p.classList.contains("on");
      if (instant) p.style.transition = "none";
      p.style.width = on.offsetWidth + "px";
      p.style.height = on.offsetHeight + "px";
      p.style.transform = "translate3d(" + on.offsetLeft + "px," + on.offsetTop + "px,0)";
      p.classList.add("on");
      if (instant) { void p.offsetWidth; p.style.transition = ""; }
      if (animate && tabs.scrollWidth > tabs.clientWidth) {
        var l = on.offsetLeft - 16, r = on.offsetLeft + on.offsetWidth + 16;
        var to = l < tabs.scrollLeft ? l : r > tabs.scrollLeft + tabs.clientWidth ? r - tabs.clientWidth : null;
        if (to !== null) tabs.scrollTo({ left: Math.max(0, to), behavior: ok() ? "smooth" : "auto" });
      }
    }
    // liczniki na zakładkach („3 do powtórki”) zmieniają szerokość: pigułka dopasowuje się bez animacji
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { place(false); });
      ro.observe(tabs);
      each(tabs.querySelectorAll('[role="tab"]'), function (b) { ro.observe(b); });
    }
    place(false);
    return place;
  }

  // Rozwinięcie świeżo wstawionego albo pokazanego elementu: wysokość od zera do swojej, treść wyłania się z mgły
  function expand(node) {
    if (!shown(node) || !ok()) return null;
    var cs = getComputedStyle(node), h = node.offsetHeight;
    if (!h) return null;
    var full = { height: h + "px", opacity: 1, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom };
    node.style.overflow = "hidden";
    var a = play(node, [{ height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px", marginTop: "0px", marginBottom: "0px" }, full],
      { duration: Math.round(Math.min(540, 260 + h * 0.45)), fill: "none" });
    if (a) a.onfinish = a.oncancel = function () { node.style.overflow = ""; };
    else node.style.overflow = "";
    return a;
  }

  // Zwinięcie przed usunięciem albo ukryciem: obietnica końca, element zostaje zwinięty do usunięcia
  function collapse(node) {
    if (!shown(node) || !ok()) return Promise.resolve();
    var cs = getComputedStyle(node), h = node.offsetHeight;
    node.style.overflow = "hidden";
    return finished(play(node, [
      { height: h + "px", opacity: 1, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom },
      { height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px", marginTop: "0px", marginBottom: "0px" }],
      { duration: Math.round(Math.min(440, 220 + h * 0.3)), easing: MOVE, fill: "forwards" }));
  }

  // Rozwijane pytania, odpowiedzi i pojęcia (<details class="faq|q|fold">): wysokość zmienia się płynnie w obie
  // strony, także przy szybkim podwójnym kliknięciu, a treść wchodzi lekko z góry. Ikona „+”/„–” w CSS zmienia się od
  // razu po kliknięciu (klasa closing na czas zwijania). Wydruk i „znajdź na stronie” otwierają je zwyczajnie.
  var running = typeof WeakMap === "function" ? new WeakMap() : null;
  function closedHeight(d, s) {
    var cs = getComputedStyle(d), ss = getComputedStyle(s);
    return s.offsetHeight + px(ss.marginTop) + px(ss.marginBottom) + px(cs.paddingTop) + px(cs.paddingBottom)
      + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
  }
  function toggle(d, s) {
    var from = d.getBoundingClientRect().height, last = running.get(d);
    if (last) last.cancel();
    var opening = !d.open || d.classList.contains("closing");
    d.classList.remove("closing");
    d.open = true;
    var to = opening ? d.getBoundingClientRect().height : closedHeight(d, s);
    if (!opening) d.classList.add("closing");
    d.style.overflow = "hidden";
    var a = d.animate({ height: [from + "px", to + "px"] },
      { duration: Math.round(Math.min(560, 280 + Math.abs(to - from) * 0.35)), easing: opening ? EASE : MOVE });
    running.set(d, a);
    a.onfinish = function () {
      running.delete(d);
      d.style.overflow = "";
      if (!opening) { d.open = false; d.classList.remove("closing"); }
    };
    a.oncancel = function () { d.style.overflow = ""; };
    if (opening) each(d.children, function (c) { if (c !== s) enter(c, { y: -6, duration: 460, delay: 30 }); });
  }
  document.addEventListener("click", function (e) {
    if (!running || e.defaultPrevented || !ok()) return;
    var s = e.target.closest ? e.target.closest("summary") : null, d = s && s.parentElement;
    if (!d || d.tagName !== "DETAILS" || d.firstElementChild !== s || !d.matches(".faq, .q, .fold")) return;
    e.preventDefault();
    toggle(d, s);
  });

  // Strona główna: to, czego jeszcze nie widać, pojawia się przy przewijaniu; elementy, które wchodzą na ekran razem,
  // po kolei. Ukrywamy tylko to, co jest pod pierwszym ekranem, więc nic nie mignie, a bez obserwatora (stara
  // przeglądarka) wszystko jest od razu widoczne. Po wejściu klasa znika, więc nic nie zostaje przesunięte.
  function reveal(nodes) {
    if (!ok() || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      var i = 0;
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var n = en.target;
        io.unobserve(n);
        n.style.transitionDelay = Math.min(i++, 5) * 90 + "ms";
        n.classList.add("in");
        setTimeout(function () { n.classList.remove("reveal", "in"); n.style.transitionDelay = ""; }, 1500);
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    var line = window.innerHeight * 0.94;
    each(nodes, function (n) {
      if (!shown(n) || n.getBoundingClientRect().top < line) return;
      n.classList.add("reveal");
      io.observe(n);
    });
  }

  // Zdjęcia z loading=lazy nie wskakują, tylko wyłaniają się w swojej ramce
  function fadeImages(imgs) {
    if (!ok()) return;
    each(imgs, function (img) {
      if (img.complete) return;
      img.classList.add("img-wait");
      img.addEventListener("load", function () { img.classList.add("img-in"); }, { once: true });
      img.addEventListener("error", function () { img.classList.remove("img-wait"); }, { once: true });
    });
  }

  // Liczba w wyniku dochodzi do wartości („9 z 11”): fmt(n) daje cały napis, na końcu zawsze dokładny
  function count(node, to, fmt) {
    fmt = fmt || String;
    if (!node) return;
    if (!ok() || !(to > 0)) { node.textContent = fmt(to); return; }
    var start = null, dur = Math.min(900, 420 + to * 40);
    node.textContent = fmt(0);
    function step(t) {
      if (start === null) start = t;
      var k = Math.min(1, (t - start) / dur);
      node.textContent = fmt(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // Dobra odpowiedź lekko się nadyma, zła kręci głową
  function pop(node) {
    return play(node, [{ transform: "scale(1)" }, { transform: "scale(1.025)", offset: 0.35 }, { transform: "scale(1)" }],
      { duration: 460, easing: MOVE, fill: "none" });
  }
  function shake(node) {
    return play(node, [{ transform: "translateX(0)" }, { transform: "translateX(-7px)", offset: 0.18 }, { transform: "translateX(6px)", offset: 0.38 },
      { transform: "translateX(-4px)", offset: 0.58 }, { transform: "translateX(2px)", offset: 0.78 }, { transform: "translateX(0)" }],
      { duration: 460, easing: "ease-out", fill: "none" });
  }

  // Karta odlatuje z miejsca, w którym była, nad nową treścią: dir 1 w prawo (pamiętam), -1 w lewo (jeszcze raz).
  // box: { top, left, width, height } względem `layer`, zmierzone przed podmianą treści.
  function fling(node, box, layer, dir) {
    if (!ok() || !node || !layer) return;
    if (getComputedStyle(layer).position === "static") layer.style.position = "relative";
    var s = node.style;
    s.position = "absolute"; s.top = box.top + "px"; s.left = box.left + "px"; s.width = box.width + "px"; s.height = box.height + "px";
    s.margin = "0"; s.zIndex = "3"; s.pointerEvents = "none";
    node.removeAttribute("aria-live");
    node.setAttribute("aria-hidden", "true");
    node.tabIndex = -1;
    // flying: wstawiona drugi raz karta nie powtarza swoich animacji z CSS (rysowanej linii nad odpowiedzią)
    node.classList.add("flying");
    layer.appendChild(node);
    var a = play(node, [{ opacity: 1, transform: "none" },
      { opacity: 0, transform: "translate3d(" + 30 * dir + "%," + (dir > 0 ? -3 : 2) + "%,0) rotate(" + 5 * dir + "deg)" }],
      { duration: 420, easing: "cubic-bezier(.45, 0, .8, .55)", fill: "forwards" });
    finished(a).then(function () { node.remove(); });
  }

  // FLIP: element stoi już na nowym miejscu (`to`), a rysuje się od starego prostokąta (`from`) do nowego
  function toRect(a, b) {
    return "translate3d(" + (a.left - b.left) + "px," + (a.top - b.top) + "px,0) scale(" + a.width / b.width + "," + a.height / b.height + ")";
  }
  function morph(node, from, to, o) {
    o = o || {};
    if (!ok() || !from || !to || !from.width || !to.width) return null;
    node.style.transformOrigin = "0 0";
    return play(node, [{ transform: toRect(from, to) }, { transform: "none" }], { duration: o.duration || 480, easing: o.easing || EASE, fill: "none" });
  }
  // i z powrotem: z miejsca, gdzie stoi, do prostokąta `to`; zostaje tam do usunięcia
  function morphTo(node, to, o) {
    o = o || {};
    var from = node.getBoundingClientRect();
    if (!ok() || !to || !to.width || !from.width) return Promise.resolve();
    node.style.transformOrigin = "0 0";
    return finished(play(node, [{ transform: "none" }, { transform: toRect(to, from) }], { duration: o.duration || 400, easing: o.easing || MOVE, fill: "forwards" }));
  }
  // prostokąt w całości albo w dużej części na ekranie (tylko wtedy tablica wraca do miniatury)
  function onScreen(r) { return r && r.width && r.bottom > 40 && r.top < window.innerHeight - 40; }

  // tło warstwy (powiększona tablica) od przezroczystego do koloru strony i z powrotem
  function fade(node, show, o) {
    o = o || {};
    return finished(play(node, show ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
      { duration: o.duration || (show ? 360 : 240), delay: o.delay || 0, easing: show ? EASE : EXIT, fill: show ? "backwards" : "forwards" }));
  }

  window.eduMotion = {
    ok: ok, enter: enter, stagger: stagger, leave: leave, swap: swap, pill: pill, expand: expand, collapse: collapse,
    reveal: reveal, fadeImages: fadeImages, count: count, pop: pop, shake: shake, fling: fling, morph: morph, morphTo: morphTo,
    onScreen: onScreen, fade: fade, finished: finished, EASE: EASE, MOVE: MOVE
  };
})();
