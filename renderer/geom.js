// Geometria 2D bez okna (działa też w sprawdzianach): punkty [x, y] w metrach, łuki przeciwnie do wskazówek zegara.
// Tolerancje są w metrach i podaje je wołający (zwykle „kilka pikseli” przeliczone na metry), więc nie zależą od tego pliku.

export const EPS = 1e-9;
const TAU = Math.PI * 2;

/* ---------- wektory ---------- */
export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, k) => [a[0] * k, a[1] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1],
  cross: (a, b) => a[0] * b[1] - a[1] * b[0],
  len: a => Math.hypot(a[0], a[1]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
  norm: a => { const l = Math.hypot(a[0], a[1]); return l < EPS ? [0, 0] : [a[0] / l, a[1] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
  perp: a => [-a[1], a[0]],
  eq: (a, b, tol = 1e-9) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol,
  polar: (c, r, ang) => [c[0] + r * Math.cos(ang), c[1] + r * Math.sin(ang)]
};

/* ---------- kąty i łuki ---------- */
export const normAng = a => { a %= TAU; return a < 0 ? a + TAU : a; };
export const angOf = (c, p) => normAng(Math.atan2(p[1] - c[1], p[0] - c[0]));
// rozpiętość łuku od a0 do a1 przeciwnie do wskazówek zegara (0..2π)
export const sweep = (a0, a1) => { const s = normAng(a1 - a0); return s < 1e-12 ? TAU : s; };
export const onArcAngle = (a0, a1, ang, tol = 1e-9) => normAng(ang - a0) <= sweep(a0, a1) + tol || normAng(ang - a0) >= TAU - tol;
export const arcStart = e => V.polar(e.c, e.r, e.a0);
export const arcEnd = e => V.polar(e.c, e.r, e.a1);
export const arcMid = e => V.polar(e.c, e.r, e.a0 + sweep(e.a0, e.a1) / 2);

// okrąg przez trzy punkty; null, gdy punkty leżą na prostej
export function circle3(p1, p2, p3) {
  const ax = p1[0], ay = p1[1], bx = p2[0], by = p2[1], cx = p3[0], cy = p3[1];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const scale = Math.max(V.dist(p1, p2), V.dist(p2, p3), V.dist(p1, p3));
  if (Math.abs(d) < 1e-12 * scale * scale || scale < EPS) return null;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const c = [(a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d, (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d];
  return { c, r: V.dist(c, p1) };
}
// łuk od p1 przez p2 do p3 → { c, r, a0, a1 } (zawsze przeciwnie do wskazówek zegara; kierunek odwraca się zamianą końców)
export function arc3(p1, p2, p3) {
  const k = circle3(p1, p2, p3); if (!k) return null;
  let a0 = angOf(k.c, p1), a1 = angOf(k.c, p3);
  const am = angOf(k.c, p2);
  if (!onArcAngle(a0, a1, am)) [a0, a1] = [a1, a0];
  return { c: k.c, r: k.r, a0, a1 };
}
// łuk ze środka: od kierunku na s do kierunku na e, przeciwnie do wskazówek zegara (albo zgodnie, gdy cw)
export function arcCSE(c, s, e, cw = false) {
  const r = V.dist(c, s); if (r < EPS) return null;
  let a0 = angOf(c, s), a1 = angOf(c, e);
  if (cw) [a0, a1] = [a1, a0];
  return { c: [...c], r, a0, a1 };
}

/* ---------- tekst, wymiar, okno (etap 2) ---------- */
// Wysokości tekstu i wymiarów są w milimetrach wydruku. ANNO — ile metrów przestrzeni wypada na milimetr papieru
// w przestrzeni, w której właśnie się liczy (model 1:50 → 0,05; arkusz → 0,001). Ustawia je program przed rysowaniem,
// przyciąganiem i zaznaczaniem w danej przestrzeni.
export let ANNO = 0.05;
export const setAnno = k => { ANNO = k; };
export const TEXT_W = 0.56;      // średnia szerokość znaku względem wysokości (Helvetica)
export const LINE_GAP = 1.4;     // odstęp wierszy względem wysokości
export const DIM_H = 2.5;        // wysokość liczby wymiaru (mm)
export const DIM_TICK = 1.6;     // pół długości ukośnej kreseczki (mm)
export const DIM_EXT = 2;        // wysunięcie linii pomocniczej za linię wymiarową (mm)
// prostokąt tekstu: p — początek linii bazowej pierwszego wiersza
export function textBox(e, k = ANNO) {
  const h = e.h * k, lines = String(e.s || '').split('\n'), n = lines.length;
  const w = Math.max(1, ...lines.map(l => l.length)) * TEXT_W * h;
  const x0 = e.p[0] - (e.align === 'c' ? w / 2 : e.align === 'r' ? w : 0);
  return [x0, e.p[1] - (n - 1) * LINE_GAP * h - 0.25 * h, x0 + w, e.p[1] + h];
}
// wymiar liniowy: a, b — mierzone punkty, o — punkt na linii wymiarowej, dir — 'h' poziomo, 'v' pionowo, 'a' równolegle
export function dimGeom(e) {
  let d1, d2, n;
  if (e.dir === 'v') { d1 = [e.o[0], e.a[1]]; d2 = [e.o[0], e.b[1]]; }
  else if (e.dir === 'a') {
    const u = V.norm(V.sub(e.b, e.a)); n = V.perp(u);
    const off = V.dot(V.sub(e.o, e.a), n); d1 = V.add(e.a, V.mul(n, off)); d2 = V.add(e.b, V.mul(n, off));
  } else { d1 = [e.a[0], e.o[1]]; d2 = [e.b[0], e.o[1]]; }
  return { d1, d2, value: V.dist(d1, d2), mid: V.lerp(d1, d2, 0.5) };
}
// Wymiar kątowy, promienia i średnicy: { t: 'adim', k: 'ang', c (wierzchołek), a, b (punkty na ramionach), o (miejsce łuku) }
// albo { t: 'adim', k: 'rad' | 'dia', c, r, o (miejsce opisu) }. Wynik: odcinki, łuki, strzałki (grot p, kierunek d),
// miejsce i kąt napisu, wartość (kąt w radianach albo długość) — wszystko w jednostkach przestrzeni; k — metry na mm wydruku.
export function adimGeom(e, k = ANNO) {
  const lines = [], arcs = [], arrows = [], h = (e.h || DIM_H) * k;
  const readable = a => { a = normAng(a); return a > Math.PI / 2 + 1e-6 && a <= 3 * Math.PI / 2 + 1e-6 ? [a - Math.PI, true] : [a, false]; };
  if (e.k === 'ang') {
    const u1 = V.norm(V.sub(e.a, e.c)), u2 = V.norm(V.sub(e.b, e.c)), R = Math.max(V.dist(e.o, e.c), 1e-9), ao = angOf(e.c, e.o);
    let best = null;
    // ramiona (albo ich przedłużenia za wierzchołek) i kierunek łuku tak, żeby kąt był mniejszy od 180° i obejmował miejsce o
    for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
      if (best) break;
      const x0 = angOf([0, 0], V.mul(u1, s1)), x1 = angOf([0, 0], V.mul(u2, s2));
      for (const [a0, a1, f] of [[x0, x1, false], [x1, x0, true]]) {
        const sw = sweep(a0, a1);
        if (sw <= Math.PI + 1e-9 && onArcAngle(a0, a1, ao)) { best = f ? { a0, a1, sw, s1: s2, s2: s1, swap: true } : { a0, a1, sw, s1, s2 }; break; }
      }
    }
    if (!best) { const a0 = angOf([0, 0], u1), a1 = angOf([0, 0], u2); best = sweep(a0, a1) <= Math.PI ? { a0, a1, sw: sweep(a0, a1), s1: 1, s2: 1 } : { a0: a1, a1: a0, sw: sweep(a1, a0), s1: 1, s2: 1 }; }
    const { a0, a1, sw } = best, E1 = V.polar(e.c, R, a0), E2 = V.polar(e.c, R, a1);
    arcs.push({ c: e.c, r: R, a0, a1 });
    // linie pomocnicze: od ramienia (albo wierzchołka, gdy łuk jest po drugiej stronie) do łuku i trochę dalej
    const [P1, P2] = best.swap ? [e.b, e.a] : [e.a, e.b];
    for (const [E, ang, P, s] of [[E1, a0, P1, best.s1], [E2, a1, P2, best.s2]]) {
      const d = V.polar([0, 0], 1, ang), from = s > 0 ? P : e.c, L = V.dot(V.sub(E, from), d);
      // łuk dalej niż ramię — linia od ramienia za łuk; łuk bliżej wierzchołka niż koniec ramienia — linia od ramienia do łuku
      if (L > 1 * k) lines.push([V.add(from, V.mul(d, Math.min(1 * k, L / 3))), V.add(E, V.mul(d, DIM_EXT * k))]);
      else if (L < -1 * k && s > 0) lines.push([V.sub(from, V.mul(d, Math.min(1 * k, -L / 3))), V.sub(E, V.mul(d, DIM_EXT * k))]);
    }
    arrows.push({ p: E1, d: [Math.sin(a0), -Math.cos(a0)] }, { p: E2, d: [-Math.sin(a1), Math.cos(a1)] });
    const am = a0 + sw / 2, [ta, flip] = readable(am - Math.PI / 2);
    return { lines, arcs, arrows, text: { p: V.polar(e.c, R + 1 * k + (flip ? h : 0), am), ang: ta, h }, value: sw, kind: 'ang', pts: [e.c, E1, E2, V.polar(e.c, R, am)] };
  }
  const d0 = V.sub(e.o, e.c), d = V.len(d0) > 1e-12 ? V.mul(d0, 1 / V.len(d0)) : [1, 0], out = V.len(d0) > e.r, E2 = V.add(e.c, V.mul(d, e.r));
  const dia = e.k === 'dia', E1 = dia ? V.sub(e.c, V.mul(d, e.r)) : e.c;
  lines.push([E1, out ? e.o : E2]);
  arrows.push({ p: E2, d });
  if (dia) arrows.push({ p: E1, d: V.mul(d, -1) });
  const [ta, flip] = readable(angOf([0, 0], d)), up = V.perp(V.polar([0, 0], 1, ta));
  const mid = out ? V.lerp(E2, e.o, 0.5) : V.lerp(dia ? e.c : e.c, E2, 0.5);
  void flip;
  return { lines, arcs, arrows, text: { p: V.add(mid, V.mul(up, 1 * k)), ang: ta, h }, value: dia ? 2 * e.r : e.r, kind: e.k, pts: [E1, E2, e.o] };
}
// odcinki grota strzałki (dwa ramiona pod 20°, długość 2,5 mm wydruku)
export function arrowSegs(ar, k = ANNO) {
  const L = 2.5 * k, b = angOf([0, 0], ar.d) + Math.PI;
  return [[ar.p, V.polar(ar.p, L, b + 0.35)], [ar.p, V.polar(ar.p, L, b - 0.35)]];
}

/* ---------- bloki (etap 4) ---------- */
// Definicje bloków zna program (setBlocks po każdej zmianie rysunku); geometria wstawienia to elementy bloku
// przeniesione przekształceniem wstawienia: q = p + R(rot) · s · (mx ? [−x, y] : [x, y]).
let BLOCKS = new Map(), BREV = 0, HIDDEN = new Set();
export function setBlocks(doc) {
  const m = new Map();
  HIDDEN = new Set((doc.layers || []).filter(L => !L.visible).map(L => L.id));   // elementy bloku na ukrytych warstwach nie przyciągają
  for (const b of doc.blocks || []) m.set(b.id, []);
  for (const e of doc.ents) if (typeof e.sp === 'string' && e.sp[0] === 'b') { const l = m.get(+e.sp.slice(1)); if (l) l.push(e); }
  BLOCKS = m; BREV++;
}
export const blockEnts = id => BLOCKS.get(id) || [];
// przekształcenie wstawienia: f — punkt, k — skala, rot — obrót, flip — odbicie, ang — kąt kierunku po przekształceniu
export function insXf(e) {
  const c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0), k = e.s || 1, m = e.mx ? -1 : 1, P = e.p;
  return {
    f: q => { const x = q[0] * k * m, y = q[1] * k; return [P[0] + x * c - y * s, P[1] + x * s + y * c]; },
    inv: q => { const dx = q[0] - P[0], dy = q[1] - P[1], x = (dx * c + dy * s) / k, y = (-dx * s + dy * c) / k; return [x * m, y]; },
    k, rot: e.rot || 0, flip: !!e.mx,
    ang: a => e.mx ? (e.rot || 0) + Math.PI - a : (e.rot || 0) + a
  };
}
const xfPart = (q, X) => {
  if (q.k === 'seg') return { k: 'seg', a: X.f(q.a), b: X.f(q.b) };
  if (q.full) return { k: 'arc', c: X.f(q.c), r: q.r * X.k, a0: 0, a1: TAU, full: true };
  const a0 = normAng(X.ang(q.a0)), a1 = normAng(X.ang(q.a1));
  return { k: 'arc', c: X.f(q.c), r: q.r * X.k, ...(X.flip ? { a0: a1, a1: a0 } : { a0, a1 }) };
};
let insDepth = 0;
const insCache = new WeakMap();
// części, końce i środki elementów bloku w położeniu wstawienia (pamiętane do następnej zmiany rysunku)
function insGeo(e) {
  const key = BREV + '|' + e.b + '|' + e.p + '|' + e.rot + '|' + e.s + '|' + e.mx;
  const c = insCache.get(e); if (c && c.key === key) return c;
  const X = insXf(e), out = { key, parts: [], ends: [], mids: [] };
  if (insDepth < 8) {
    insDepth++;
    try {
      for (const ch of blockEnts(e.b)) {
        // jak poza blokiem: tekst, wymiar i kreskowanie nie przyciągają i nie ograniczają kreskowania
        if (ch.t === 'hatch' || ch.t === 'text' || ch.t === 'dim' || ch.t === 'adim' || HIDDEN.has(ch.layer)) continue;
        for (const q of partsOf(ch)) out.parts.push(xfPart(q, X));
        for (const q of endpoints(ch)) out.ends.push(X.f(q));
        for (const q of midpoints(ch)) out.mids.push(X.f(q));
        if (ch.t === 'circle' || ch.t === 'arc') out.mids.push(X.f(ch.c));
      }
    } finally { insDepth--; }
  }
  insCache.set(e, out); return out;
}
// zamknięte obwody kreskowania: lista pętli punktów; parzysta liczba przecięć = na zewnątrz (otwory)
export function inLoops(loops, p) {
  let inside = false;
  for (const L of loops) for (let i = 0, j = L.length - 1; i < L.length; j = i++) {
    const a = L[i], b = L[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

const rectSegs = b => { const c = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]; return c.map((p, i) => ({ k: 'seg', a: p, b: c[(i + 1) % 4] })); };
const vpBox = e => [Math.min(e.a[0], e.b[0]), Math.min(e.a[1], e.b[1]), Math.max(e.a[0], e.b[0]), Math.max(e.a[1], e.b[1])];
export { vpBox };

/* ---------- części elementów ---------- */
// odcinki prostych elementów (linia, polilinia)
export function segsOf(e) {
  if (e.t === 'line') return [[e.a, e.b]];
  if (e.t === 'pline') {
    const out = [];
    for (let i = 0; i < e.pts.length - 1; i++) out.push([e.pts[i], e.pts[i + 1]]);
    if (e.closed && e.pts.length > 2) out.push([e.pts[e.pts.length - 1], e.pts[0]]);
    return out;
  }
  return [];
}
// Polilinia może mieć łuki: trzeci element wierzchołka [x, y, b] to „wybrzuszenie” jak w DXF — b = tan(θ/4),
// θ — kąt łuku od tego wierzchołka do następnego; b > 0 — przeciwnie do wskazówek zegara, b < 0 — zgodnie.
export function bulgeArc(p, q, b) {
  const d = V.dist(p, q); if (d < EPS || Math.abs(b) < 1e-12) return null;
  const u = V.mul(V.sub(q, p), 1 / d), m = V.lerp(p, q, 0.5);
  const c = V.add(m, V.mul(V.perp(u), d / 2 * (1 - b * b) / (2 * b)));
  const r = V.dist(c, p);
  return b > 0 ? { c, r, a0: angOf(c, p), a1: angOf(c, q), ccw: true } : { c, r, a0: angOf(c, q), a1: angOf(c, p), ccw: false };
}
// wybrzuszenie łuku o środku c od punktu p do q w danym kierunku
export function bulgeOf(c, p, q, ccw) { const sw = ccw ? sweep(angOf(c, p), angOf(c, q)) : sweep(angOf(c, q), angOf(c, p)); return (ccw ? 1 : -1) * Math.tan(sw / 4); }
// części polilinii po kolei: odcinki i łuki; from / to — początek i koniec części w kierunku polilinii
export function plineParts(e) {
  // zamknięta polilinia ma też część od ostatniego wierzchołka do pierwszego (dwa wierzchołki z łukami to np. okrąg z DXF)
  const out = [], n = e.pts.length, cnt = e.closed && n >= 2 ? n : n - 1;
  for (let i = 0; i < cnt; i++) {
    const p = e.pts[i], q = e.pts[(i + 1) % n], a = p[2] ? bulgeArc(p, q, p[2]) : null;
    out.push(a ? { k: 'arc', ...a, from: [p[0], p[1]], to: [q[0], q[1]], i } : { k: 'seg', a: [p[0], p[1]], b: [q[0], q[1]], from: [p[0], p[1]], to: [q[0], q[1]], i });
  }
  return out;
}
export const hasBulge = e => e.t === 'pline' && e.pts.some(p => p[2]);
const partBox = q => q.k === 'seg' ? boxOf([q.a, q.b]) : bbox({ t: 'arc', c: q.c, r: q.r, a0: q.a0, a1: q.a1 });

// „krzywe” elementu: odcinki i łuki w jednej postaci
export function partsOf(e) {
  if (e.t === 'ins') return insGeo(e).parts;
  if (e.t === 'hatch') { const out = []; for (const L of e.loops) for (let i = 0; i < L.length; i++) out.push({ k: 'seg', a: L[i], b: L[(i + 1) % L.length] }); return out; }
  if (e.t === 'text') return rectSegs(textBox(e));
  if (e.t === 'vp') return rectSegs(vpBox(e));
  if (e.t === 'dim') { const g = dimGeom(e); return [{ k: 'seg', a: g.d1, b: g.d2 }, { k: 'seg', a: e.a, b: g.d1 }, { k: 'seg', a: e.b, b: g.d2 }]; }
  if (e.t === 'adim') { const g = adimGeom(e); return [...g.lines.map(([a, b]) => ({ k: 'seg', a, b })), ...g.arcs.map(q => ({ k: 'arc', ...q, from: V.polar(q.c, q.r, q.a0), to: V.polar(q.c, q.r, q.a1), ccw: true }))]; }
  if (e.t === 'circle') return [{ k: 'arc', c: e.c, r: e.r, a0: 0, a1: TAU, full: true }];
  if (e.t === 'arc') return [{ k: 'arc', c: e.c, r: e.r, a0: e.a0, a1: e.a1 }];
  if (e.t === 'pline') return plineParts(e);
  return segsOf(e).map(([a, b]) => ({ k: 'seg', a, b }));
}
export function endpoints(e) {
  if (e.t === 'ins') return [e.p, ...insGeo(e).ends];
  if (e.t === 'hatch') return [];
  if (e.t === 'text') return [e.p];
  if (e.t === 'vp') { const b = vpBox(e); return [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]; }
  if (e.t === 'dim') { const g = dimGeom(e); return [e.a, e.b, g.d1, g.d2]; }
  if (e.t === 'adim') return [];
  if (e.t === 'line') return [e.a, e.b];
  if (e.t === 'pline') return e.pts.map(p => [p[0], p[1]]);   // bez wybrzuszenia — punkt, nie wierzchołek
  if (e.t === 'arc') return [arcStart(e), arcEnd(e)];
  return [];
}
export function midpoints(e) {
  if (e.t === 'ins') return insGeo(e).mids;
  if (e.t === 'text' || e.t === 'hatch') return [];
  if (e.t === 'dim') return [dimGeom(e).mid];
  if (e.t === 'adim') return [];
  if (e.t === 'vp') return rectSegs(vpBox(e)).map(q => V.lerp(q.a, q.b, 0.5));
  if (e.t === 'arc') return [arcMid(e)];
  if (e.t === 'pline') return plineParts(e).map(q => q.k === 'seg' ? V.lerp(q.a, q.b, 0.5) : arcMid(q));
  return segsOf(e).map(([a, b]) => V.lerp(a, b, 0.5));
}
export const centerOf = e => (e.t === 'circle' || e.t === 'arc') ? e.c : null;

// prostokąt obrysu [minX, minY, maxX, maxY]
export function bbox(e) {
  if (e.t === 'ins') { const g = insGeo(e); return g.parts.length ? g.parts.map(partBox).reduce(boxUnion, null) : [e.p[0], e.p[1], e.p[0], e.p[1]]; }
  if (e.t === 'hatch') return boxOf(e.loops.flat());
  if (e.t === 'text') return textBox(e);
  if (e.t === 'vp') return vpBox(e);
  if (e.t === 'dim') { const g = dimGeom(e), m = DIM_H * 1.6 * ANNO; return boxGrow(boxOf([e.a, e.b, g.d1, g.d2]), m); }
  if (e.t === 'adim') { const g = adimGeom(e), m = DIM_H * 1.6 * ANNO; return boxGrow(boxOf([...g.pts, g.text.p, ...g.lines.flat()]), m); }
  if (e.t === 'circle') return [e.c[0] - e.r, e.c[1] - e.r, e.c[0] + e.r, e.c[1] + e.r];
  if (e.t === 'arc') {
    const pts = [arcStart(e), arcEnd(e)];
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; if (onArcAngle(e.a0, e.a1, a)) pts.push(V.polar(e.c, e.r, a)); }
    return boxOf(pts);
  }
  if (e.t === 'pline' && hasBulge(e)) return plineParts(e).map(partBox).reduce(boxUnion, null) || boxOf(e.pts);
  return boxOf(e.t === 'line' ? [e.a, e.b] : e.pts);
}
export function boxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; }
  return [x0, y0, x1, y1];
}
export const boxUnion = (a, b) => !a ? b : !b ? a : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
export const boxHit = (b, r) => b[0] <= r[2] && b[2] >= r[0] && b[1] <= r[3] && b[3] >= r[1];
export const boxGrow = (b, d) => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];

/* ---------- najbliższy punkt i odległość ---------- */
export function closestOnSeg(p, a, b) {
  const d = V.sub(b, a), l2 = V.dot(d, d);
  if (l2 < EPS * EPS) return { p: [...a], t: 0 };
  const t = Math.max(0, Math.min(1, V.dot(V.sub(p, a), d) / l2));
  return { p: V.lerp(a, b, t), t };
}
export function closestOnArc(p, part) {
  const ang = angOf(part.c, p);
  if (part.full || onArcAngle(part.a0, part.a1, ang)) {
    if (V.dist(p, part.c) < EPS) return V.polar(part.c, part.r, part.a0);
    return V.polar(part.c, part.r, ang);
  }
  const s = V.polar(part.c, part.r, part.a0), e = V.polar(part.c, part.r, part.a1);
  return V.dist(p, s) <= V.dist(p, e) ? s : e;
}
export function nearestOn(e, p) {
  // w środek tekstu też się trafia
  if (e.t === 'text') { const b = textBox(e); if (p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]) return { p: [...p], d: 0 }; }
  // w kreskowanie trafia się też w środku (inside — wybierający daje wtedy pierwszeństwo liniom w pobliżu)
  if (e.t === 'hatch' && inLoops(e.loops, p)) return { p: [...p], d: 0, inside: true };
  return nearestOnParts(partsOf(e), p);
}
function nearestOnParts(parts, p) {
  let best = null, bd = Infinity;
  for (const q of parts) {
    const c = q.k === 'seg' ? closestOnSeg(p, q.a, q.b).p : closestOnArc(p, q);
    const d = V.dist(p, c); if (d < bd) { bd = d; best = c; }
  }
  return best ? { p: best, d: bd } : null;
}
export const distTo = (e, p) => { const n = nearestOn(e, p); return n ? n.d : Infinity; };

/* ---------- przecięcia ---------- */
// odcinek–odcinek; ext = true traktuje oba jak proste (do linii prowadzących)
export function segSeg(a, b, c, d, ext = false) {
  const r = V.sub(b, a), s = V.sub(d, c), den = V.cross(r, s);
  if (Math.abs(den) < 1e-12 * V.len(r) * V.len(s)) return [];
  const t = V.cross(V.sub(c, a), s) / den, u = V.cross(V.sub(c, a), r) / den;
  const tol = 1e-9;
  if (!ext && (t < -tol || t > 1 + tol || u < -tol || u > 1 + tol)) return [];
  return [V.add(a, V.mul(r, t))];
}
// prosta / odcinek a–b z okręgiem; zwraca punkty na odcinku (seg = true) albo na całej prostej
export function lineCircle(a, b, c, r, seg = true) {
  const d = V.sub(b, a), f = V.sub(a, c);
  const A = V.dot(d, d), B = 2 * V.dot(f, d), C = V.dot(f, f) - r * r;
  if (A < EPS * EPS) return [];
  let disc = B * B - 4 * A * C;
  if (disc < -1e-12 * A * r * r) return [];
  disc = Math.max(0, disc);
  const sq = Math.sqrt(disc), ts = disc === 0 ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)];
  return ts.filter(t => !seg || (t >= -1e-9 && t <= 1 + 1e-9)).map(t => V.add(a, V.mul(d, t)));
}
export function circleCircle(c1, r1, c2, r2) {
  const d = V.dist(c1, c2);
  if (d < EPS || d > r1 + r2 + 1e-12 || d < Math.abs(r1 - r2) - 1e-12) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const m = V.add(c1, V.mul(V.sub(c2, c1), a / d)), n = V.perp(V.norm(V.sub(c2, c1)));
  return h < 1e-12 ? [m] : [V.add(m, V.mul(n, h)), V.sub(m, V.mul(n, h))];
}
const onPartArc = (q, p) => q.full || onArcAngle(q.a0, q.a1, angOf(q.c, p), 1e-9);
function partPart(p, q) {
  if (p.k === 'seg' && q.k === 'seg') return segSeg(p.a, p.b, q.a, q.b);
  if (p.k === 'seg') return lineCircle(p.a, p.b, q.c, q.r).filter(x => onPartArc(q, x));
  if (q.k === 'seg') return partPart(q, p);
  return circleCircle(p.c, p.r, q.c, q.r).filter(x => onPartArc(p, x) && onPartArc(q, x));
}
// punkty przecięcia dwóch elementów (bez powtórzeń)
export function intersect(e1, e2) {
  const out = [];
  const P = partsOf(e1), Q = partsOf(e2);
  for (const p of P) for (const q of Q) for (const x of partPart(p, q)) if (!out.some(y => V.eq(x, y, 1e-9))) out.push(x);
  return out;
}
// przecięcia elementu z odcinkiem (np. śladem gumki albo pędzla)
export const crossesSeg = (e, a, b) => partsOf(e).some(q => partPart(q, { k: 'seg', a, b }).length > 0);

/* ---------- prostopadle i stycznie ---------- */
// spodki prostopadłych z punktu base na element (tylko leżące na elemencie)
export function perpFeet(e, base) {
  const out = [];
  for (const q of partsOf(e)) {
    if (q.k === 'seg') {
      const d = V.sub(q.b, q.a), l2 = V.dot(d, d); if (l2 < EPS * EPS) continue;
      const t = V.dot(V.sub(base, q.a), d) / l2;
      if (t >= -1e-9 && t <= 1 + 1e-9) out.push(V.add(q.a, V.mul(d, t)));
    } else {
      if (V.dist(base, q.c) < EPS) continue;
      const u = V.norm(V.sub(base, q.c));
      for (const p of [V.add(q.c, V.mul(u, q.r)), V.sub(q.c, V.mul(u, q.r))]) if (onPartArc(q, p)) out.push(p);
    }
  }
  return out;
}
// punkty styczności prostych z base do okręgu / łuku
export function tangentPts(e, base) {
  if (e.t !== 'circle' && e.t !== 'arc') return [];
  const d = V.dist(base, e.c); if (d <= e.r + 1e-12) return [];
  const a = angOf(e.c, base), b = Math.acos(e.r / d);
  const q = partsOf(e)[0];
  return [a + b, a - b].map(t => V.polar(e.c, e.r, t)).filter(p => onPartArc(q, p));
}

/* ---------- zaznaczanie ramką ---------- */
const inBox = (p, r) => p[0] >= r[0] && p[0] <= r[2] && p[1] >= r[1] && p[1] <= r[3];
// cały element w prostokącie (ramka w prawo)
export const insideRect = (e, r) => { const b = bbox(e); return b[0] >= r[0] && b[2] <= r[2] && b[1] >= r[1] && b[3] <= r[3]; };
// element dotyka prostokąta (ramka w lewo)
export function touchesRect(e, r) {
  if (!boxHit(bbox(e), r)) return false;
  if (insideRect(e, r)) return true;
  const corners = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
  for (let i = 0; i < 4; i++) if (crossesSeg(e, corners[i], corners[(i + 1) % 4])) return true;
  return endpoints(e).some(p => inBox(p, r)) || partsOf(e).some(q => q.k === 'seg' && inBox(q.a, r));
}

/* ---------- przekształcenia ---------- */
// pola elementu po przesunięciu o d (do tx.set albo nowego elementu)
export function moved(e, d) {
  const m = p => V.add(p, d);
  if (e.t === 'ins') return { p: m(e.p) };
  if (e.t === 'hatch') return { loops: e.loops.map(L => L.map(m)) };
  if (e.t === 'text') return { p: m(e.p) };
  if (e.t === 'dim') return { a: m(e.a), b: m(e.b), o: m(e.o) };
  if (e.t === 'adim') return e.k === 'ang' ? { c: m(e.c), a: m(e.a), b: m(e.b), o: m(e.o) } : { c: m(e.c), o: m(e.o) };
  if (e.t === 'vp') return { a: m(e.a), b: m(e.b) };     // okno przesuwa się po arkuszu, widok modelu w nim zostaje
  if (e.t === 'line') return { a: m(e.a), b: m(e.b) };
  if (e.t === 'pline') return { pts: e.pts.map(p => p[2] ? [...m(p), p[2]] : m(p)) };
  return { c: m(e.c) };
}
// długość elementu
export function lengthOf(e) {
  if (e.t === 'ins' || e.t === 'hatch') return 0;
  if (e.t === 'circle') return TAU * e.r;
  if (e.t === 'arc') return sweep(e.a0, e.a1) * e.r;
  if (e.t === 'pline') return plineParts(e).reduce((s, q) => s + (q.k === 'seg' ? V.dist(q.a, q.b) : sweep(q.a0, q.a1) * q.r), 0);
  return segsOf(e).reduce((s, [a, b]) => s + V.dist(a, b), 0);
}
