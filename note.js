// Strona udostępnionej notatki: czyta ją z Supabase po kodzie z adresu (…/n/#kod) i rysuje jak w aplikacji, z nauką
// fiszek w przeglądarce (study.js). Przykładowa notatka ze strony głównej (…/n/#przyklad) leży w n/przyklad.json.
(function () {
  "use strict";
  var SUPABASE = "https://fjpbdwsbktiylkborxvf.supabase.co";
  // klucz publiczny (publishable) – ten sam co w aplikacji, nie jest sekretem
  var KEY = "sb_publishable_XtknqXVtb-T-5Wd-oKFxEA_NINWbDsE";
  // adres: …/n/#KOD, a po przełączeniu zakładki …/n/#KOD/fiszki albo …/n/#KOD/quiz (odświeżenie wraca do tej zakładki)
  var hashParts = (location.hash || "").replace(/^#/, "").split("/");
  var code = hashParts[0].replace(/[^A-Za-z0-9]/g, ""), startTab = hashParts[1] || "";

  function rpc(name, args) {
    return fetch(SUPABASE + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: { "apikey": KEY, "Content-Type": "application/json" },
      body: JSON.stringify(args)
    }).then(function (r) { return r.ok ? r.json() : null; });
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === "text") e.textContent = attrs[k]; else if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  // te same kolory symboli co w aplikacji (VisualExplanation.symbolColors)
  var SYMBOL_COLORS = ["#6B8131", "#E2725B", "#3F7FBF", "#A97C14", "#6A3357"];

  function highlighted(latex) {
    SYMBOL_COLORS.forEach(function (hex, i) { latex = latex.split("\\hl" + (i + 1) + "{").join("\\color{" + hex + "}{"); });
    return latex.replace(/\\hl[0-9]*\{/g, "{");
  }

  function math(latex, display) {
    var span = el("span", { class: "m" });
    latex = highlighted(latex);
    try {
      katex.render(latex, span, { displayMode: !!display, throwOnError: false, output: "html" });
    } catch (e) {
      span.textContent = latex;
    }
    return span;
  }

  // „27 października”, a z rokiem tylko wtedy, gdy to inny rok niż teraz
  function shortDate(iso) {
    if (!iso) return "";
    var d = new Date(iso + "T12:00:00"), opts = { day: "numeric", month: "long" };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    return d.toLocaleDateString("pl-PL", opts);
  }

  // MARK: wykres – ta sama prosta składnia wzorów co w aplikacji (MathExpression.swift)

  var FUNCS = ["arcsin", "arccos", "arctan", "log2", "asin", "acos", "atan", "sqrt", "cbrt", "sign", "ceil", "floor",
               "sin", "cos", "tan", "cot", "ctg", "abs", "exp", "log", "sgn", "tg", "ln"];

  function normalize(s) {
    var i = s.lastIndexOf("=");
    if (i >= 0) s = s.slice(i + 1);
    // \frac{a}{b} → ((a)/(b)), od końca
    for (var p = s.lastIndexOf("\\frac"); p >= 0; p = s.lastIndexOf("\\frac", p - 1)) {
      var g1 = group(s, p + 5), g2 = g1 && group(s, g1.end);
      if (g2) s = s.slice(0, p) + "((" + g1.body + ")/(" + g2.body + "))" + s.slice(g2.end);
      if (p === 0) break;
    }
    var rep = [["\\cdot", "*"], ["\\times", "*"], ["·", "*"], ["×", "*"], ["−", "-"], ["–", "-"], ["÷", "/"],
               ["\\left", ""], ["\\right", ""], ["\\pi", "pi"], ["π", "pi"], ["√", "sqrt"], ["\\", ""],
               ["{", "("], ["}", ")"], ["[", "("], ["]", ")"], ["²", "^2"], ["³", "^3"], [",", "."]];
    rep.forEach(function (r) { s = s.split(r[0]).join(r[1]); });
    return s.toLowerCase();
  }

  function group(s, start) {
    if (s[start] !== "{") return null;
    var depth = 0;
    for (var i = start; i < s.length; i++) {
      if (s[i] === "{") depth++;
      if (s[i] === "}" && --depth === 0) return { body: s.slice(start + 1, i), end: i + 1 };
    }
    return null;
  }

  function tokenize(s) {
    var out = [], i = 0, names = FUNCS.concat(["pi", "e", "x"]).sort(function (a, b) { return b.length - a.length; });
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        var j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
        var v = parseFloat(s.slice(i, j)); if (isNaN(v)) throw "liczba";
        out.push({ k: "n", v: v }); i = j;
      } else if (/[a-z]/.test(c)) {
        var name = null;
        for (var n = 0; n < names.length; n++) if (s.startsWith(names[n], i)) { name = names[n]; break; }
        if (!name) throw "nazwa";
        out.push({ k: "f", t: name }); i += name.length;
      } else if ("+-*/^()".indexOf(c) >= 0) { out.push({ k: "s", t: c }); i++; }
      else throw "znak";
    }
    return out;
  }

  function compile(text) {
    var t = tokenize(normalize(text)), p = 0;
    if (!t.length) throw "pusty";
    function eat(sym) { if (p < t.length && t[p].k === "s" && t[p].t === sym) { p++; return true; } return false; }
    function expr() { var l = term(); for (;;) { if (eat("+")) { var a = l, b = term(); l = function (x) { return a(x) + b(x); }; } else if (eat("-")) { var c = l, d = term(); l = function (x) { return c(x) - d(x); }; } else return l; } }
    function starts() { return p < t.length && (t[p].k === "n" || t[p].k === "f" || (t[p].k === "s" && t[p].t === "(")); }
    function term() { var l = unary(); for (;;) { var a = l, b; if (eat("*")) { b = unary(); l = mul(a, b); } else if (eat("/")) { b = unary(); l = div(a, b); } else if (starts()) { b = power(); l = mul(a, b); } else return l; } }
    function mul(a, b) { return function (x) { return a(x) * b(x); }; }
    function div(a, b) { return function (x) { var d = b(x); return d === 0 ? NaN : a(x) / d; }; }
    function unary() { if (eat("-")) { var u = unary(); return function (x) { return -u(x); }; } if (eat("+")) return unary(); return power(); }
    function power() { var b = primary(); if (eat("^")) { var e = unary(); return function (x) { return pow(b(x), e(x)); }; } return b; }
    function pow(l, r) {
      if (l < 0 && r !== Math.round(r)) { var d = Math.round(1 / r); if (Math.abs(1 / d - r) < 1e-9 && d % 2 !== 0) return -Math.pow(-l, 1 / d); }
      return Math.pow(l, r);
    }
    function primary() {
      if (p >= t.length) throw "koniec";
      var tk = t[p++];
      if (tk.k === "n") return function () { return tk.v; };
      if (tk.k === "s") { if (tk.t !== "(") throw "nawias"; var e = expr(); if (!eat(")")) throw "nawias"; return e; }
      if (tk.t === "x") return function (x) { return x; };
      if (tk.t === "pi") return function () { return Math.PI; };
      if (tk.t === "e") return function () { return Math.E; };
      var ex = null; if (eat("^")) ex = primary();
      var arg = power(), f = fn(tk.t);
      var g = function (x) { return f(arg(x)); };
      return ex ? function (x) { return Math.pow(g(x), ex(x)); } : g;
    }
    var r = expr();
    if (p < t.length) throw "nadmiar";
    return r;
  }

  function fn(n) {
    switch (n) {
      case "sin": return Math.sin; case "cos": return Math.cos; case "tan": case "tg": return Math.tan;
      case "cot": case "ctg": return function (v) { return 1 / Math.tan(v); };
      case "asin": case "arcsin": return Math.asin; case "acos": case "arccos": return Math.acos; case "atan": case "arctan": return Math.atan;
      case "sqrt": return function (v) { return v < 0 ? NaN : Math.sqrt(v); }; case "cbrt": return Math.cbrt; case "abs": return Math.abs;
      case "ln": return function (v) { return v <= 0 ? NaN : Math.log(v); }; case "log": return function (v) { return v <= 0 ? NaN : Math.log10(v); };
      case "log2": return function (v) { return v <= 0 ? NaN : Math.log2(v); }; case "exp": return Math.exp;
      case "floor": return Math.floor; case "ceil": return Math.ceil; case "sign": case "sgn": return Math.sign;
    }
    return function () { return NaN; };
  }

  var COLORS = ["#6B8131", "#E2725B", "#3F7FBF"];
  var NS = "http://www.w3.org/2000/svg";

  function svg(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function niceStep(span, count) {
    var raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  }

  function graph(slide) {
    var W = 680, H = 360, L = 52, R = 14, T = 30, B = 40;
    var x0 = slide.xMin, x1 = slide.xMax, lines = [], ys = [];
    slide.plots.forEach(function (pl, i) {
      var f; try { f = compile(pl.expression); } catch (e) { return; }
      var pts = [];
      for (var k = 0; k < 500; k++) { var x = x0 + (x1 - x0) * k / 499, y = f(x); pts.push([x, y]); if (isFinite(y)) ys.push(y); }
      lines.push({ i: i, pts: pts });
    });
    slide.points.forEach(function (p) { ys.push(p.y); });
    ys.sort(function (a, b) { return a - b; });
    var lo = ys.length > 40 ? ys[Math.floor(ys.length * 0.03)] : (ys[0] || -5);
    var hi = ys.length > 40 ? ys[Math.floor(ys.length * 0.97)] : (ys[ys.length - 1] || 5);
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    var span = hi - lo;
    if (lo > 0 && lo < span * 0.6) lo = 0;
    if (hi < 0 && -hi < span * 0.6) hi = 0;
    var pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    function sx(x) { return L + (x - x0) / (x1 - x0) * (W - L - R); }
    function sy(y) { return T + (hi - y) / (hi - lo) * (H - T - B); }

    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Wykres funkcji" });
    var clip = svg("clipPath", { id: "plot" + Math.random().toString(36).slice(2) });
    clip.appendChild(svg("rect", { x: L, y: T, width: W - L - R, height: H - T - B }));
    s.appendChild(clip);
    var xs = niceStep(x1 - x0, 8), ysStep = niceStep(hi - lo, 6);
    for (var gx = Math.ceil(x0 / xs) * xs; gx <= x1 + 1e-9; gx += xs) {
      s.appendChild(svg("line", { x1: sx(gx), x2: sx(gx), y1: T, y2: H - B, stroke: "#E2DFD3", "stroke-width": 1 }));
      var tx = svg("text", { x: sx(gx), y: H - 8, "text-anchor": "middle", "font-size": 17, fill: "#6E6B5F" });
      tx.textContent = +gx.toFixed(6); s.appendChild(tx);
    }
    for (var gy = Math.ceil(lo / ysStep) * ysStep; gy <= hi + 1e-9; gy += ysStep) {
      s.appendChild(svg("line", { x1: L, x2: W - R, y1: sy(gy), y2: sy(gy), stroke: "#E2DFD3", "stroke-width": 1 }));
      var ty = svg("text", { x: L - 8, y: sy(gy) + 6, "text-anchor": "end", "font-size": 17, fill: "#6E6B5F" });
      ty.textContent = +gy.toFixed(6); s.appendChild(ty);
    }
    if (lo < 0 && hi > 0) s.appendChild(svg("line", { x1: L, x2: W - R, y1: sy(0), y2: sy(0), stroke: "#2A2A22", "stroke-opacity": 0.6, "stroke-width": 1.3 }));
    if (x0 < 0 && x1 > 0) s.appendChild(svg("line", { x1: sx(0), x2: sx(0), y1: T, y2: H - B, stroke: "#2A2A22", "stroke-opacity": 0.6, "stroke-width": 1.3 }));
    var jump = (hi - lo) * 1.5;
    lines.forEach(function (ln) {
      var d = "", prev = null;
      ln.pts.forEach(function (p) {
        if (!isFinite(p[1])) { prev = null; return; }
        var move = prev === null || Math.abs(p[1] - prev) > jump;
        d += (move ? "M" : "L") + sx(p[0]).toFixed(1) + " " + sy(p[1]).toFixed(1) + " ";
        prev = p[1];
      });
      s.appendChild(svg("path", { d: d, fill: "none", stroke: COLORS[ln.i % 3], "stroke-width": 2.8, "stroke-linecap": "round",
                                  "stroke-linejoin": "round", "clip-path": "url(#" + clip.id + ")" }));
    });
    slide.points.forEach(function (p) {
      if (p.x < x0 || p.x > x1 || p.y < lo || p.y > hi) return;
      s.appendChild(svg("circle", { cx: sx(p.x), cy: sy(p.y), r: 4.5, fill: "#2A2A22" }));
      if (p.label) {
        var t = svg("text", { x: sx(p.x) + 9, y: sy(p.y) - 10, "font-size": 20, "font-weight": 700, fill: "#2A2A22",
                              stroke: "#FFFEFA", "stroke-width": 4, "paint-order": "stroke" });
        t.textContent = p.label; s.appendChild(t);
      }
    });
    // podpisy osi (opcjonalne pola xLabel i yLabel slajdu)
    if (slide.xLabel) { var xl = svg("text", { x: W - R, y: H - B - 8, "text-anchor": "end", "font-size": 18, "font-weight": 700, fill: "#2A2A22" }); xl.textContent = slide.xLabel; s.appendChild(xl); }
    if (slide.yLabel) { var yl = svg("text", { x: L + 8, y: T - 10, "font-size": 18, "font-weight": 700, fill: "#2A2A22" }); yl.textContent = slide.yLabel; s.appendChild(yl); }
    var box = el("div", { class: "sketch graph" }, []);
    box.appendChild(s);
    var legend = el("div", { class: "legend" });
    slide.plots.forEach(function (pl, i) {
      var item = el("span", {}, [el("span", { class: "sw", style: "background:" + COLORS[i % 3] }), math(pl.label || pl.expression)]);
      legend.appendChild(item);
    });
    return el("div", {}, [box, legend]);
  }

  // MARK: mapa pojęć i oś lekcji – ten sam układ co w aplikacji (ConceptMapView, LessonPathView)

  var TONES = ["#E3E9CF", "#FBF0C9", "#DCE8F5", "#F8DED7", "#ECE3EC"];

  function noise(seed) { var x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }

  function mapLayout(nodes, links, width, nw, nh, gap) {
    var ids = nodes.map(function (n) { return n.id; }), incoming = {}, level = {};
    links.forEach(function (l) { incoming[l.to] = true; });
    var roots = ids.filter(function (id) { return !incoming[id]; });
    if (!roots.length && ids.length) roots = [ids[0]];
    var queue = roots.slice();
    roots.forEach(function (r) { level[r] = 0; });
    while (queue.length) {
      var id = queue.shift();
      links.forEach(function (l) { if (l.from === id && level[l.to] === undefined) { level[l.to] = level[id] + 1; queue.push(l.to); } });
    }
    var deepest = Math.max.apply(null, [0].concat(Object.keys(level).map(function (k) { return level[k]; })));
    ids.forEach(function (id) { if (level[id] === undefined) level[id] = deepest + 1; });
    var maxLevel = Math.max.apply(null, ids.map(function (id) { return level[id]; })), rows = [];
    for (var lv = 0; lv <= maxLevel; lv++) {
      var inLevel = nodes.filter(function (n) { return level[n.id] === lv; });
      for (var k = 0; k < inLevel.length; k += 4) rows.push(inLevel.slice(k, k + 4));
    }
    function order(r, by) {
      if (!rows[by]) return;
      var pos = {};
      rows[by].forEach(function (n, i) { pos[n.id] = (i + 0.5) / rows[by].length; });
      var keyed = rows[r].map(function (n, i) {
        var near = [];
        links.forEach(function (l) { if (l.to === n.id && pos[l.from] !== undefined) near.push(pos[l.from]); if (l.from === n.id && pos[l.to] !== undefined) near.push(pos[l.to]); });
        return { k: near.length ? near.reduce(function (a, b) { return a + b; }, 0) / near.length : (i + 0.5) / rows[r].length, i: i, n: n };
      });
      keyed.sort(function (a, b) { return a.k - b.k || a.i - b.i; });
      rows[r] = keyed.map(function (x) { return x.n; });
    }
    for (var pass = 0; pass < 2; pass++) {
      for (var r1 = 1; r1 < rows.length; r1++) order(r1, r1 - 1);
      for (var r2 = rows.length - 2; r2 >= 0; r2--) order(r2, r2 + 1);
    }
    var out = {};
    rows.forEach(function (row, r) {
      var step = width / row.length;
      row.forEach(function (n, i) { out[n.id] = { x: step * (i + 0.5), y: nh / 2 + 8 + r * gap, level: level[n.id], node: n }; });
    });
    return out;
  }

  function conceptMap(nodes, links) {
    var W = 728, NW = 158, NH = 66, GAP = 122, at = mapLayout(nodes, links, W, NW, NH, GAP);
    function far(a, b) { return Math.abs(a.y - b.y) < 1 && Math.abs(a.x - b.x) > NW * 1.9; }
    var maxY = 0, arcs = false;
    Object.keys(at).forEach(function (k) { maxY = Math.max(maxY, at[k].y); });
    links.forEach(function (l) { if (at[l.from] && at[l.to] && far(at[l.from], at[l.to])) arcs = true; });
    var H = maxY + NH / 2 + (arcs ? 60 : 12);
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Mapa pojęć" });
    function ends(a, b) {
      var h = NH / 2 + 3, w = NW / 2 + 3;
      if (Math.abs(a.y - b.y) < 1) {
        if (far(a, b)) return [{ x: a.x, y: a.y + h }, { x: b.x, y: b.y + h }];
        var d = b.x > a.x ? 1 : -1;
        return [{ x: a.x + d * w, y: a.y }, { x: b.x - d * w, y: b.y }];
      }
      var dy = b.y > a.y ? 1 : -1;
      return [{ x: a.x, y: a.y + dy * h }, { x: b.x, y: b.y - dy * h }];
    }
    function control(p, q, seed) {
      var mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      if (Math.abs(p.y - q.y) < 1 && Math.abs(p.x - q.x) > NW * 1.9) return { x: mid.x, y: mid.y + NH + 40 };
      var dx = q.x - p.x, dy = q.y - p.y, len = Math.max(Math.hypot(dx, dy), 1), bend = (noise(seed * 7 + 3) - 0.5) * Math.min(len * 0.18, 26);
      return { x: mid.x - dy / len * bend, y: mid.y + dx / len * bend };
    }
    var labels = [];
    links.forEach(function (l, i) {
      var a = at[l.from], b = at[l.to];
      if (!a || !b) return;
      var e = ends(a, b), p = e[0], q = e[1], c = control(p, q, i), ang = Math.atan2(q.y - c.y, q.x - c.x);
      var d = "M" + p.x + " " + p.y + " Q" + c.x + " " + c.y + " " + q.x + " " + q.y;
      [-1, 1].forEach(function (side) { var t = ang + Math.PI - side * 0.45; d += " M" + q.x + " " + q.y + " L" + (q.x + 10 * Math.cos(t)) + " " + (q.y + 10 * Math.sin(t)); });
      s.appendChild(svg("path", { d: d, fill: "none", stroke: "#2A2A22", "stroke-opacity": 0.75, "stroke-width": 1.6, "stroke-linecap": "round" }));
      if (l.label) labels.push({ x: 0.25 * p.x + 0.5 * c.x + 0.25 * q.x, y: 0.25 * p.y + 0.5 * c.y + 0.25 * q.y, t: l.label });
    });
    labels.forEach(function (lb) {
      var t = svg("text", { x: lb.x, y: lb.y + 4, "text-anchor": "middle", "font-size": 12, "font-style": "italic", fill: "#6E6B5F",
                            stroke: "#F7F5EE", "stroke-width": 5, "paint-order": "stroke" });
      t.textContent = lb.t; s.appendChild(t);
    });
    var i = 0;
    Object.keys(at).forEach(function (k) {
      var n = at[k], root = n.level === 0;
      var fo = svg("foreignObject", { x: n.x - NW / 2, y: n.y - NH / 2, width: NW, height: NH });
      var box = document.createElement("div");
      box.className = "mapnode";
      box.style.background = TONES[root ? 0 : 1 + (i++ % 4)];
      box.style.borderWidth = root ? "2px" : "1.4px";
      box.appendChild(el("b", { text: n.node.label }));
      if (n.node.detail) box.appendChild(el("small", { text: n.node.detail }));
      fo.appendChild(box);
      s.appendChild(fo);
    });
    var wrap = el("div", { class: "diagram" }); wrap.appendChild(s);
    return wrap;
  }

  function lessonPath(stages) {
    var W = 728, H = 270, line = H / 2, n = stages.length, margin = 70;
    var stops = stages.map(function (_, i) {
      return { x: n === 1 ? W / 2 : margin + (W - 2 * margin) * i / (n - 1), y: line + (noise(i * 13 + 5) - 0.5) * 10 };
    });
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Oś lekcji" });
    var f = stops[0], last = stops[n - 1];
    var d = "M18 " + (f.y + 6) + " Q40 " + (f.y + 12) + " " + f.x + " " + f.y;
    for (var i = 1; i < n; i++) {
      var a = stops[i - 1], b = stops[i], wave = i % 2 === 0 ? 22 : -22;
      d += " C" + (a.x + (b.x - a.x) * 0.35) + " " + (a.y + wave) + " " + (a.x + (b.x - a.x) * 0.65) + " " + (b.y - wave) + " " + b.x + " " + b.y;
    }
    var endX = W - 24, endY = last.y - 4, cx = last.x + 30, cy = last.y - 12, ang = Math.atan2(endY - cy, endX - cx);
    d += " Q" + cx + " " + cy + " " + endX + " " + endY;
    [-1, 1].forEach(function (side) { var t = ang + Math.PI - side * 0.45; d += " M" + endX + " " + endY + " L" + (endX + 10 * Math.cos(t)) + " " + (endY + 10 * Math.sin(t)); });
    s.appendChild(svg("path", { d: d, fill: "none", stroke: "#6B8131", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    var spacing = n > 1 ? (W - 140) / (n - 1) : W, lw = Math.min(190, spacing * 1.7);
    stages.forEach(function (st, i) {
      var p = stops[i];
      s.appendChild(svg("circle", { cx: p.x, cy: p.y, r: 14, fill: "#FFFEFA", stroke: "#2A2A22", "stroke-width": 1.6 }));
      var num = svg("text", { x: p.x, y: p.y + 4.5, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: "#2A2A22" });
      num.textContent = i + 1; s.appendChild(num);
      var above = i % 2 === 0, x = Math.min(Math.max(p.x, lw / 2), W - lw / 2);
      var fo = svg("foreignObject", { x: x - lw / 2, y: above ? p.y - 108 : p.y + 24, width: lw, height: 84 });
      var box = document.createElement("div");
      box.className = "stage " + (above ? "above" : "below");
      box.appendChild(el("b", { text: st.title }));
      if (st.detail) box.appendChild(el("small", { text: st.detail }));
      fo.appendChild(box); s.appendChild(fo);
    });
    var wrap = el("div", { class: "diagram" }); wrap.appendChild(s);
    return wrap;
  }

  function visual(v) {
    var wrap = el("section", {}, [el("h2", { text: v.title ? "Wyjaśnienie: " + v.title : "Wyjaśnienie wizualne" })]);
    (v.slides || []).forEach(function (s) {
      var slide = el("div", { class: "slide" }, [s.heading ? el("h3", { text: s.heading }) : null]);
      if (s.kind === "formula" && s.latex) {
        var f = el("div", { class: "sketch formula" }); f.appendChild(math(s.latex, true)); slide.appendChild(f);
        if (s.symbols && s.symbols.length) {
          var g = el("div", { class: "symbols" });
          s.symbols.forEach(function (sym, i) {
            var hex = SYMBOL_COLORS[i % SYMBOL_COLORS.length], m = math("\\color{" + hex + "}{" + sym.latex + "}");
            m.style.background = hex + "29"; m.style.borderRadius = "6px"; m.style.padding = "0 6px";
            g.appendChild(m); g.appendChild(el("span", { class: "muted", text: sym.meaning }));
          });
          slide.appendChild(g);
        }
      } else if (s.kind === "graph" && s.plots && s.plots.length) {
        slide.appendChild(graph(s));
      } else if (s.kind === "map" && s.nodes && s.nodes.length) {
        slide.appendChild(conceptMap(s.nodes, s.links || []));
      } else if (s.kind === "path" && s.stages && s.stages.length) {
        slide.appendChild(lessonPath(s.stages));
      } else if (s.kind === "steps" && s.steps && s.steps.length) {
        var ol = el("ol", { class: "steps" });
        s.steps.forEach(function (st) {
          var l = el("div", { class: "l" }); l.appendChild(math(st.latex));
          ol.appendChild(el("li", {}, [el("div", {}, [l, st.comment ? el("div", { class: "c", text: st.comment }) : null])]));
        });
        slide.appendChild(ol);
      }
      if (s.text) slide.appendChild(el("p", { text: s.text }));
      wrap.appendChild(slide);
    });
    return wrap;
  }

  // Link do EduNote w Mac App Store z kampanią (ct): „share” z przycisku pod notatką, „mail” z linku wysłanego sobie
  // na Maca. App Store Connect pokazuje pobrania z każdej kampanii. Ten sam identyfikator co w aplikacji
  // (ProAccess.appStoreURL) i na stronie głównej.
  var APP_STORE = "https://apps.apple.com/app/id6824044215";

  function storeLink(campaign) {
    return APP_STORE + (APP_STORE.indexOf("?") < 0 ? "?" : "&") + "ct=" + campaign;
  }

  // Ostatni dzień, w którym link działa („15 marca 2027”); serwer trzyma chwilę wygaśnięcia, np. 16 marca o północy
  function lastDay(iso) {
    var end = new Date(new Date(iso).getTime() - 1000);
    return end.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw" });
  }

  // KaTeX tylko przy notatkach ze wzorami (slajdy z wzorem, wykresem albo krokami), żeby pozostałe nie łączyły się
  // z CDN. Gdy się nie wczyta, wzór zostaje tekstem (math).
  var KATEX = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/";

  function needsMath(c) {
    return !!(c.visual && (c.visual.slides || []).some(function (s) {
      return s.kind === "formula" || s.kind === "graph" || s.kind === "steps";
    }));
  }

  function loadMath() {
    return new Promise(function (resolve) {
      document.head.appendChild(el("link", { rel: "stylesheet", href: KATEX + "katex.min.css" }));
      var js = el("script", { src: KATEX + "katex.min.js" });
      js.onload = js.onerror = function () { resolve(); };
      document.head.appendChild(js);
    });
  }

  // odpowiedź porównana jak w aplikacji (folded): bez wielkości liter, polskich znaków i spacji na brzegach
  function fold(s) {
    return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u0142\u0141]/g, "l").toLowerCase().trim();
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // Ostatni wynik quizu w tej przeglądarce (jak wynik fiszek w study.js): { v: 1, at, good, total }
  function quizResult(key, value) {
    try {
      if (value) { localStorage.setItem("edunote.quiz." + key, JSON.stringify(value)); return value; }
      var d = JSON.parse(localStorage.getItem("edunote.quiz." + key) || "null");
      return d && d.v === 1 ? d : null;
    } catch (e) { return null; }
  }

  // Quiz: odpowiedzi w nowej, losowej kolejności przy każdym podejściu (w danych dobra bywa zawsze pierwsza), obok
  // koloru ✓ i ✗, a po wyniku „Tylko błędne”, „Jeszcze raz” i dalsze kroki.
  // opts.key: pod jakim kluczem zapamiętać wynik całego quizu (kod notatki)
  // opts.after: zdanie pod wynikiem (na Macu zaproszenie do EduNote, gdzie indziej termin ważności linku)
  // opts.next: [[tekst, akcja]] – przyciski pod wynikiem, np. powtórka fiszek
  function quiz(items, opts) {
    var box = el("div", { class: "card quiz" });
    var last = opts.key && quizResult(opts.key);
    var sub = el("p", { class: "muted quiz-sub" });
    var retry = el("div", { class: "quiz-retry" });
    var section = el("section", { id: "quiz" }, [el("h2", { text: "Sprawdź się" }), sub, retry, box]);
    function header(list) {
      sub.textContent = list === items
        ? eduStudy.plural(items.length, "pytanie", "pytania", "pytań") + (last ? " · ostatnio " + last.good + " z " + last.total : " · wyjaśnienie po każdej odpowiedzi")
        : eduStudy.plural(list.length, "pytanie", "pytania", "pytań") + " · tylko błędne z poprzedniego podejścia";
      retry.innerHTML = "";
      var missed = list === items && last && last.wrong ? items.filter(function (q) { return last.wrong.indexOf(q.prompt) >= 0; }) : [];
      if (missed.length) retry.appendChild(button("Rozwiąż błędne z ostatniego razu (" + missed.length + ")", "btn btn-secondary", function () { again(missed); }));
    }

    function mark(b, ok) {
      b.classList.add(ok ? "right" : "wrong");
      b.appendChild(el("span", { class: "qmark", "aria-hidden": "true", text: ok ? "✓" : "✗" }));
      b.appendChild(el("span", { class: "sr", text: ok ? " (dobra odpowiedź)" : " (Twoja odpowiedź, zła)" }));
    }

    function round(list) {
      header(list);
      box.innerHTML = "";
      var answered = 0, wrong = [];
      var result = el("div", { class: "quiz-result hidden", role: "status" });
      list.forEach(function (q, qi) {
        var wrap = el("div", { class: "quiz-q" }, [el("p", { class: "quiz-prompt", text: (qi + 1) + ". " + eduStudy.tidy(q.prompt) })]);
        var options = el("div", { class: "quiz-options" });
        var why = el("p", { class: "muted quiz-why hidden", text: eduStudy.tidy(q.explanation || "") });
        shuffle(q.options || []).forEach(function (o) {
          var b = el("button", { class: "quiz-option", type: "button" }, [el("span", { text: eduStudy.tidy(o) })]);
          if (fold(o) === fold(q.answer)) b.dataset.right = "1";
          b.addEventListener("click", function () {
            if (wrap.dataset.answered) return;
            wrap.dataset.answered = "1";
            var ok = !!b.dataset.right;
            if (!ok) wrong.push(q);
            Array.prototype.forEach.call(options.children, function (x) {
              x.disabled = true;
              if (x.dataset.right) mark(x, true);
            });
            if (!ok) mark(b, false);
            if (q.explanation) why.classList.remove("hidden");
            if (++answered === list.length) score(list, wrong, result);
          });
          options.appendChild(b);
        });
        wrap.appendChild(options); wrap.appendChild(why); box.appendChild(wrap);
      });
      box.appendChild(result);
    }

    // nowe podejście od pierwszego pytania, bez płynnego przewijania
    function again(list) {
      round(list);
      var html = document.documentElement;
      html.style.scrollBehavior = "auto";
      section.scrollIntoView({ block: "start" });
      html.style.scrollBehavior = "";
    }

    function score(list, wrong, result) {
      if (opts.key && list === items) {
        last = quizResult(opts.key, { v: 1, at: new Date().toISOString(), good: list.length - wrong.length, total: list.length,
          wrong: wrong.map(function (q) { return q.prompt; }) });
      }
      result.appendChild(el("p", { class: "quiz-score num", text: (list.length - wrong.length) + " z " + list.length }));
      result.appendChild(el("p", { class: "muted", text: (wrong.length
        ? eduStudy.plural(wrong.length, "błąd", "błędy", "błędów") + ". Wyjaśnienia są pod pytaniami."
        : "Bez błędów.") + (opts.after ? " " + opts.after : "") }));
      var row = el("div", { class: "quiz-actions" });
      if (wrong.length) row.appendChild(button("Tylko błędne (" + wrong.length + ")", "btn btn-primary", function () { again(wrong); }));
      row.appendChild(button("Rozwiąż od nowa", wrong.length ? "btn btn-secondary" : "btn btn-primary", function () { again(items); }));
      (opts.next || []).forEach(function (n) { row.appendChild(button(n[0], "btn btn-ghost", n[1])); });
      result.appendChild(row);
      result.classList.remove("hidden");
    }

    round(items);
    return section;
  }

  // Fiszki do nauki w przeglądarce: prawdziwe fiszki z aplikacji (pole `cards`, gdy aplikacja zacznie je wysyłać),
  // a do tego czasu pojęcia (termin → definicja) i pytania do nauki (pytanie → odpowiedź)
  function cardsOf(c) {
    var out = [];
    (c.cards || []).forEach(function (k) { if (k.front && k.back) out.push({ front: k.front, back: k.back }); });
    if (out.length) return out;
    (c.concepts || []).forEach(function (k) { if (k.term && k.definition) out.push({ front: k.term, back: k.definition }); });
    (c.questions || []).forEach(function (q) { if (q.question && q.answer) out.push({ front: q.question, back: q.answer }); });
    return out;
  }

  function button(text, cls, action) {
    var b = el("button", { class: cls, type: "button", text: text });
    b.addEventListener("click", action);
    return b;
  }

  function $(id) { return document.getElementById(id); }

  // ikona z zestawu w n/index.html przed tekstem przycisku
  function withIcon(node, id) {
    var ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"), use = document.createElementNS(ns, "use");
    svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", "#" + id);
    svg.appendChild(use);
    node.insertBefore(svg, node.firstChild);
    return node;
  }

  function render(data) {
    var c = data.content || {};
    var title = data.topic || data.subject || "Notatka z zajęć";
    var label = data.topic && data.subject ? data.subject + ": " + data.topic : title;
    var mac = eduPlatform() === "mac";
    var url = location.origin + location.pathname + "#" + code;
    // dokładna data zamiast „do końca sesji”
    var until = data.expires_at ? "Link działa do " + lastDay(data.expires_at) + "." : "";
    var cards = cardsOf(c), hasQuiz = !!(c.quiz && c.quiz.length);
    var what = [cards.length ? eduStudy.plural(cards.length, "fiszka", "fiszki", "fiszek") : "", hasQuiz ? "quiz" : ""]
      .filter(Boolean).join(" i ");
    document.title = title + " · EduNote";

    // nagłówek jak w aplikacji: przedmiot z kropką i data, temat, oznaczenie treści z AI (AI Act, art. 50) przy każdej
    // notatce, którą pisało AI, a nie tylko autor; minuty to długość nagrania (starsze linki nie mają tych pól)
    if (data.sample) {
      $("sample").classList.remove("hidden");
      $("origin").textContent = "Przykładowa notatka przygotowana z pomocą AI na potrzeby tej strony, a nie materiał prowadzącego.";
    }
    $("subject").textContent = [data.subject, data.sample ? "przykład" : shortDate(data.lesson_date)].filter(Boolean).join(" · ");
    $("topic").textContent = title;
    var ai = c.fromRecording || c.summary || (c.sections && c.sections.length) || (c.concepts && c.concepts.length) || c.visual;
    if (ai) {
      $("ai-text").textContent = (c.fromRecording
        ? "Notatka z AI z " + (c.minutes > 0 ? c.minutes + "-minutowego nagrania" : "nagrania") + " wykładu w EduNote na Macu"
        : "Notatka przygotowana z pomocą AI") + " · może zawierać błędy";
    } else {
      $("ai-note").classList.add("hidden");
    }

    // Podgląd linku na czacie jest taki sam dla każdej notatki, więc temat i zawartość niesie tekst wiadomości,
    // razem z uczciwym dopiskiem, że to nieoficjalna notatka z AI (żeby nikt nie wziął jej za materiał prowadzącego)
    function shareNote() {
      eduShare(data.sample
        ? title + " (" + (data.subject || "").toLowerCase() + "): " + what + ", ok. " + eduStudy.minutes(cards) + " min. "
          + "To przykład z EduNote, nie nasz wykład. Działa w przeglądarce, bez logowania:"
        : label + (what ? " · " + what : "") + ". Nieoficjalna notatka z AI, sprawdźcie z wykładem. Działa w przeglądarce, bez logowania:",
        url, "Wyślij na grupę roku");
    }
    var share = $("share-top");
    withIcon(share, "i-share").addEventListener("click", shareNote);
    share.classList.remove("hidden");

    // Zakładki jak przełącznik w aplikacji: Notatka, Fiszki, Quiz. Adres się nie zmienia, bo po „#” stoi kod notatki.
    var tabs = $("tabs"), panels = { note: $("panel-note"), cards: $("panel-cards"), quiz: $("panel-quiz") }, buttons = {};
    function tab(id, text, count) {
      var b = el("button", { type: "button", role: "tab", id: "tab-" + id, "aria-controls": "panel-" + id, "aria-selected": "false" },
        [document.createTextNode(text), count ? el("span", { class: "count num", text: String(count) }) : null]);
      b.addEventListener("click", function () { show(id); });
      buttons[id] = b;
      tabs.appendChild(b);
    }
    // po przełączeniu treść zaczyna się tuż pod zakładkami, także gdy notatka była przewinięta w dół
    function show(id) {
      Object.keys(buttons).forEach(function (k) {
        buttons[k].setAttribute("aria-selected", String(k === id));
        panels[k].hidden = k !== id;
      });
      var name = { cards: "fiszki", quiz: "quiz" }[id];
      try { history.replaceState(null, "", "#" + code + (name ? "/" + name : "")); } catch (e) {}
      if (id === "cards" && !panels.cards.firstChild) studyIntro();
      var top = $("tabs-anchor").getBoundingClientRect().top + window.scrollY - document.querySelector(".bar").offsetHeight;
      if (window.scrollY > top) window.scrollTo(0, top);
    }
    tab("note", "Notatka");
    if (cards.length) tab("cards", "Fiszki", cards.length);
    // przy zakładce Fiszki: ile fiszek czeka na powtórkę (z ostatniego razu w tej przeglądarce)
    function due() {
      if (!buttons.cards) return;
      var count = buttons.cards.querySelector(".count"), p = eduStudy.progress(code, cards);
      count.classList.toggle("due", !!(p && p.hard.length));
      count.textContent = p && p.hard.length ? p.hard.length + " do powtórki" : String(cards.length);
    }
    due();
    if (hasQuiz) tab("quiz", "Quiz", c.quiz.length);
    buttons.note.setAttribute("aria-selected", "true");
    if (cards.length || hasQuiz) tabs.classList.remove("hidden");

    // Fiszki: krótki wstęp z ostatnim wynikiem, a nauka toczy się w tej samej zakładce
    function studyIntro() {
      var p = eduStudy.progress(code, cards), resume = p && p.rest.length, again = p && !resume && p.hard.length;
      var intro = el("div", { class: "study-intro" }, [
        el("p", { class: "eyebrow", text: !p ? what + " · ok. " + eduStudy.minutes(cards) + " min · bez logowania"
          : resume ? "Przerobione " + p.seen + " z " + p.total + " fiszek"
          : "Ostatnio " + p.ok + " z " + p.total + " za pierwszym razem" + (p.fixed ? " · " + p.fixed + " powtórzone" : "") }),
        el("h2", { text: p ? "Twoje fiszki" : "Przepytaj się z tej notatki" }),
        el("p", { class: "muted", text: "Najpierw spróbuj sobie przypomnieć odpowiedź, potem ją odkryj i oceń się. "
          + "Fiszki, których nie pamiętasz, wracają na koniec. Zadania liczysz na kartce." })
      ]);
      // po powrocie najpierw dokończenie przerwanej nauki albo powtórka tego, czego ostatnio nie było
      if (resume) intro.appendChild(button("Kontynuuj (zostało " + p.rest.length + ")", "btn btn-primary btn-lg", function () { learn(p.rest, "resume"); }));
      else if (again) intro.appendChild(button("Powtórz trudne (" + p.hard.length + ")", "btn btn-primary btn-lg", function () { learn(p.hard, "hard"); }));
      intro.appendChild(button(p ? "Od początku" : "Zacznij", p && (resume || again) ? "btn btn-secondary btn-lg" : "btn btn-primary btn-lg",
        function () { learn(); }));
      due();
      // wynik zostaje w przeglądarce, a przeglądarka w Messengerze czy Instagramie potrafi go zgubić
      if (/FBAN|FBAV|FB_IAB|Messenger|Instagram/i.test(navigator.userAgent)) {
        intro.appendChild(el("p", { class: "muted small", text: "Otwierasz w Messengerze? Wybierz „Otwórz w przeglądarce”, żeby wynik się zapisał." }));
      }
      intro.appendChild(el("p", { class: "export" }, [
        button("Kopiuj do Quizleta", "link", exportCards), button("Pobierz plik dla Anki (.txt)", "link", downloadCards)
      ]));
      panels.cards.innerHTML = "";
      panels.cards.appendChild(intro);
      // po „Zakończ” wstęp zaczyna się tuż pod zakładkami, a nie gdzieś w połowie ekranu
      var top = $("tabs-anchor").getBoundingClientRect().top + window.scrollY - document.querySelector(".bar").offsetHeight;
      if (window.scrollY > top) window.scrollTo(0, top);
    }
    // Quizlet i Anki przyjmują tekst: pojęcie, tabulator, definicja, każda fiszka w osobnej linii
    function tsv() {
      var clean = function (s) { return String(s).replace(/[\t\r\n]+/g, " ").trim(); };
      return cards.map(function (k) { return clean(k.front) + "\t" + clean(k.back); }).join("\n");
    }
    function exportCards() {
      eduCopy(tsv(), "Fiszki do Quizleta", {
        hint: "W Quizlecie na komputerze: Utwórz zestaw → Importuj, wklej i zostaw „Tabulator” między pojęciem a definicją.",
        button: "Kopiuj fiszki", done: "Skopiowano fiszki. Wklej je w Quizlecie.", rows: 6
      });
    }
    // plik dla Anki (Plik → Importuj) i dla tych, którzy wolą wgrać plik do Quizleta
    function downloadCards() {
      var a = el("a", { href: URL.createObjectURL(new Blob([tsv()], { type: "text/plain;charset=utf-8" })),
        download: "fiszki-" + fold(title).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".txt" });
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    // only i mode: dokończenie przerwanej nauki („resume”) albo same trudne („hard”); bez nich nowe podejście
    function learn(only, mode) {
      var stage = el("div", { class: "study-stage" });
      panels.cards.innerHTML = "";
      panels.cards.appendChild(stage);
      eduStudy.start(cards, { container: stage, key: code, only: only, mode: mode, done: afterStudy, onExit: studyIntro,
        offset: function () { return document.querySelector(".bar").offsetHeight + tabs.offsetHeight; } });
      // fiszka i przyciski od razu na ekranie, tuż pod paskiem i zakładkami
      var top = stage.getBoundingClientRect().top + window.scrollY - document.querySelector(".bar").offsetHeight - tabs.offsetHeight - 8;
      window.scrollTo(0, Math.max(0, top));
    }
    function afterStudy(result) {
      due();
      var box = el("div", { class: "done-actions" });
      if (hasQuiz) {
        box.appendChild(button("Quiz z tej notatki", result.hard.length ? "btn btn-secondary" : "btn btn-primary",
          function () { show("quiz"); }));
      }
      if (!mac && until) box.appendChild(el("p", { class: "muted small", text: "Wróć tu przed kolokwium. " + until }));
      if (mac) box.appendChild(appInvite(true, "btn btn-secondary"));
      return box;
    }

    // Notatka jak w aplikacji: „W skrócie”, działy, wyjaśnienie wzoru, pojęcia na kartach, „Na kolokwium”, pytania
    if (c.summary) $("summary").textContent = c.summary; else $("brief").classList.add("hidden");
    var body = $("body");
    (c.sections || []).forEach(function (s) {
      var sec = el("section", { class: "section" }, [el("h2", { text: s.heading })]);
      (s.body || "").split(/\n+/).forEach(function (p) { if (p.trim()) sec.appendChild(el("p", { text: eduStudy.tidy(p) })); });
      body.appendChild(sec);
    });
    (c.own || []).forEach(function (t) { body.appendChild(el("p", { class: "own", text: t })); });
    if (c.visual && c.visual.slides && c.visual.slides.length) body.appendChild(visual(c.visual));
    if (c.concepts && c.concepts.length) {
      var grid = el("div", { class: "concepts" });
      c.concepts.forEach(function (k) {
        grid.appendChild(el("div", { class: "concept" }, [
          el("p", { class: "term" }, [document.createTextNode(k.term), k.important ? el("span", { class: "key-chip", text: "kluczowe" }) : null]),
          el("p", { class: "def", text: eduStudy.tidy(k.definition) })
        ]));
      });
      body.appendChild(el("section", { class: "section" }, [el("h2", { text: "Pojęcia" }), grid]));
    }
    if (c.exam && c.exam.length) {
      var ul = el("ul", { class: "plain" });
      c.exam.forEach(function (t) { ul.appendChild(el("li", { text: t })); });
      // to wybór AI z wykładu, a nie lista od prowadzącego, więc „może być”, z odesłaniem do sylabusu
      body.appendChild(el("section", { class: "exam" }, [el("p", { class: "exam-label", text: "Może być na kolokwium" }), ul,
        el("p", { class: "exam-hint", text: data.sample ? "W prawdziwej notatce AI wybiera to z treści zajęć. Zakres zawsze sprawdź w sylabusie."
          : "Wybrane przez AI z treści zajęć. Zakres sprawdź w sylabusie." })]));
    }
    if (c.questions && c.questions.length) {
      var qs = el("div", { class: "questions" });
      c.questions.forEach(function (q) {
        qs.appendChild(el("details", { class: "q" }, [el("summary", { text: eduStudy.tidy(q.question) }), el("p", { text: eduStudy.tidy(q.answer) })]));
      });
      body.appendChild(el("section", { class: "section" }, [el("h2", { text: "Zadania i pytania do nauki" }),
        el("p", { class: "muted small", text: "Najpierw spróbuj rozwiązać, potem rozwiń odpowiedź." }), qs]));
    }
    if (c.homework && c.homework.length) {
      var hw = el("ul", { class: "plain" });
      c.homework.forEach(function (t) { hw.appendChild(el("li", { text: t })); });
      body.appendChild(el("section", { class: "section" }, [el("h2", { text: "Zadanie domowe" }), hw]));
    }
    if (hasQuiz) {
      panels.quiz.appendChild(quiz(c.quiz, {
        key: code,
        after: mac ? "Chcesz te pytania jako fiszki z powtórkami? EduNote przypomni je, zanim wylecą z głowy."
          : until && "Wróć tu przed kolokwium. " + until,
        next: cards.length ? [["Powtórz fiszki", function () { show("cards"); learn(); }]] : []
      }));
    }

    // Zaproszenie na końcu notatki: na Macu do App Store. Bez Maca uczysz się już tutaj, więc zaproszenie jest do
    // poproszenia osoby z Makiem z roku o nagrywanie (wystarczy jedna na rok), zwykłą prośbą, a nie reklamą.
    var slot = $("cta-slot");
    if (mac) {
      slot.appendChild(appInvite(true, "btn btn-primary"));
    } else {
      $("cta-title").textContent = "Chcesz takie notatki z innych wykładów?";
      $("cta-text").textContent = "Uczysz się tutaj i nic nie instalujesz. Notatki robi EduNote z nagrań na Macu: wystarczy jedna "
        + "osoba z Makiem na roku, która za zgodą prowadzącego nagra wykład i wyśle link grupie.";
      slot.appendChild(button("Poproś kogoś z Makiem", "btn btn-primary", function () {
        eduShare("Hej, nagrasz nam wykład w EduNote, jeśli prowadzący się zgodzi? Z nagrania robi notatkę, fiszki i quiz "
          + "dla całej grupy (na razie za darmo). Tak to wygląda:", url, "Poproś kogoś z Makiem", "Wyślij tę wiadomość osobie z Makiem z Twojego roku.");
      }));
      // zapis na EduNote na Androida, Windowsa albo iPhone'a jednym kliknięciem (waitlist.js)
      eduWaitlist(slot, { privacy: "../prywatnosc/" });
    }
    // zapis notatki na później: drukowanie albo PDF z przeglądarki, z rozwiniętymi rozwiązaniami
    $("print").addEventListener("click", function () {
      show("note");
      window.print();
    });
    // przykład nie wygasa, więc mówi, jak długo działają prawdziwe linki
    $("valid").textContent = until || (data.sample
      ? "Prawdziwe linki działają do końca sesji poprawkowej: z semestru zimowego do 15 marca, z letniego do 30 września." : "");
    var report = $("report");
    if (sample) report.classList.add("hidden"); else report.href = "../zglos/#n=" + code;
    $("loading").classList.add("hidden");
    $("note").classList.remove("hidden");
    // po odświeżeniu ta sama zakładka co przedtem
    var fromHash = { fiszki: "cards", quiz: "quiz" }[startTab];
    if (fromHash && buttons[fromHash]) show(fromHash);
  }

  // Na wydruku i w PDF rozwiązania zadań są rozwinięte; po wydruku wracają do stanu sprzed
  var closed = [];
  window.addEventListener("beforeprint", function () {
    closed = Array.prototype.filter.call(document.querySelectorAll("details.q"), function (d) { return !d.open; });
    closed.forEach(function (d) { d.open = true; });
  });
  window.addEventListener("afterprint", function () { closed.forEach(function (d) { d.open = false; }); });

  // Przycisk do EduNote: do App Store tylko na Macu. Na telefonie i na Windowsie strona „tylko na Maca” w App Store
  // to ślepa uliczka, więc zamiast niej link do wysłania sobie na Maca.
  function appInvite(mac, cls) {
    var a = el("a", { class: cls });
    if (mac) {
      a.textContent = "Pobierz EduNote na Maca";
      a.href = storeLink(sample ? "przyklad" : "share");
    } else {
      a.textContent = "Wyślij sobie link na Maca";
      a.href = "mailto:?subject=" + encodeURIComponent("EduNote na Maca")
        + "&body=" + encodeURIComponent("EduNote w Mac App Store: " + storeLink("mail"));
    }
    a.addEventListener("click", recordClick);
    return a;
  }

  // Kliknięcie „EduNote” pod udostępnioną notatką (licznik w aplikacji autora); keepalive: zapytanie dojdzie,
  // nawet gdy przeglądarka już przechodzi do App Store
  function recordClick() {
    if (sample) return;
    fetch(SUPABASE + "/rest/v1/rpc/record_share_click", {
      method: "POST", keepalive: true,
      headers: { "apikey": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_code: code })
    }).catch(function () {});
  }

  function missing() {
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("missing").classList.remove("hidden");
  }

  // Przykładowa notatka ze strony głównej (/n/#przyklad) leży obok strony, a nie w bazie
  var sample = code === "przyklad";
  if (!code) { missing(); return; }
  var load = sample ? fetch("przyklad.json").then(function (r) { return r.ok ? r.json() : null; })
    : rpc("get_shared_note", { p_code: code });
  load.then(function (d) {
    if (!d) return missing();
    return (needsMath(d.content || {}) ? loadMath() : Promise.resolve()).then(function () { render(d); });
  }).catch(missing);
})();
