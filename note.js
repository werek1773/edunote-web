// Strona udostępnionej notatki: czyta ją z Supabase po kodzie z adresu (…/n/#kod) i rysuje jak w aplikacji.
(function () {
  "use strict";
  var SUPABASE = "https://fjpbdwsbktiylkborxvf.supabase.co";
  // klucz publiczny (publishable) – ten sam co w aplikacji, nie jest sekretem
  var KEY = "sb_publishable_XtknqXVtb-T-5Wd-oKFxEA_NINWbDsE";
  var code = (location.hash || "").replace(/^#/, "").replace(/[^A-Za-z0-9]/g, "");

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

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
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
    var W = 680, H = 340, L = 44, R = 14, T = 14, B = 30;
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
      var tx = svg("text", { x: sx(gx), y: H - 10, "text-anchor": "middle", "font-size": 12, fill: "#6E6B5F" });
      tx.textContent = +gx.toFixed(6); s.appendChild(tx);
    }
    for (var gy = Math.ceil(lo / ysStep) * ysStep; gy <= hi + 1e-9; gy += ysStep) {
      s.appendChild(svg("line", { x1: L, x2: W - R, y1: sy(gy), y2: sy(gy), stroke: "#E2DFD3", "stroke-width": 1 }));
      var ty = svg("text", { x: L - 8, y: sy(gy) + 4, "text-anchor": "end", "font-size": 12, fill: "#6E6B5F" });
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
        var t = svg("text", { x: sx(p.x) + 8, y: sy(p.y) - 8, "font-size": 13, "font-weight": 600, fill: "#2A2A22",
                              stroke: "#FFFEFA", "stroke-width": 4, "paint-order": "stroke" });
        t.textContent = p.label; s.appendChild(t);
      }
    });
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
    var wrap = el("section", {}, [el("h2", { class: "display", text: v.title ? "Wyjaśnienie: " + v.title : "Wyjaśnienie wizualne" })]);
    (v.slides || []).forEach(function (s) {
      var slide = el("div", { class: "slide" }, [s.heading ? el("h3", { class: "display", text: s.heading }) : null]);
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

  function render(data) {
    var c = data.content || {};
    document.title = (data.topic || data.subject || "Notatka") + " · EduNote";
    var meta = document.getElementById("meta");
    meta.appendChild(el("span", { class: "dot" }));
    meta.appendChild(document.createTextNode([data.subject, formatDate(data.lesson_date)].filter(Boolean).join(" · ")));
    document.getElementById("topic").textContent = data.topic || data.subject || "Notatka z zajęć";
    document.getElementById("summary").textContent = c.summary || "";
    var body = document.getElementById("body");
    (c.sections || []).forEach(function (s) {
      var sec = el("section", { class: "section" }, [el("h2", { class: "display", text: s.heading })]);
      (s.body || "").split(/\n+/).forEach(function (p) { if (p.trim()) sec.appendChild(el("p", { text: p })); });
      body.appendChild(sec);
    });
    (c.own || []).forEach(function (t) { body.appendChild(el("p", { class: "card", text: t, style: "white-space:pre-wrap" })); });
    if (c.visual && c.visual.slides && c.visual.slides.length) body.appendChild(visual(c.visual));
    if (c.concepts && c.concepts.length) {
      var dl = el("dl", { class: "concepts" });
      c.concepts.forEach(function (k) { dl.appendChild(el("dt", { class: k.important ? "key" : "", text: k.term })); dl.appendChild(el("dd", { text: k.definition })); });
      body.appendChild(el("section", {}, [el("h2", { class: "display", text: "Pojęcia" }), el("div", { class: "card" }, [dl])]));
    }
    if (c.exam && c.exam.length) {
      var ul = el("ul", { class: "plain" }); c.exam.forEach(function (t) { ul.appendChild(el("li", { text: t })); });
      body.appendChild(el("section", {}, [el("h2", { class: "display", text: "Na sprawdzian" }), el("div", { class: "mat" }, [ul])]));
    }
    if (c.questions && c.questions.length) {
      var qs = el("div", { class: "card" });
      c.questions.forEach(function (q) { qs.appendChild(el("details", { class: "q" }, [el("summary", { text: q.question }), el("p", { text: q.answer })])); });
      body.appendChild(el("section", {}, [el("h2", { class: "display", text: "Pytania do nauki" }), qs]));
    }
    if (c.homework && c.homework.length) {
      var hw = el("ul", { class: "plain" }); c.homework.forEach(function (t) { hw.appendChild(el("li", { text: t })); });
      body.appendChild(el("section", {}, [el("h2", { class: "display", text: "Zadanie domowe" }), hw]));
    }
    document.getElementById("cta").addEventListener("click", function () {
      // keepalive: zapytanie dojdzie, nawet gdy przeglądarka już przechodzi na stronę EduNote
      fetch(SUPABASE + "/rest/v1/rpc/record_share_click", {
        method: "POST", keepalive: true,
        headers: { "apikey": KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_code: code })
      }).catch(function () {});
    });
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("note").classList.remove("hidden");
  }

  function missing() {
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("missing").classList.remove("hidden");
  }

  if (!code) { missing(); return; }
  rpc("get_shared_note", { p_code: code }).then(function (d) { d ? render(d) : missing(); }).catch(missing);
})();
