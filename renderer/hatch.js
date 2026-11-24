// Kreskowanie (etap 4): wzory, kreski przycięte do obszaru i szukanie zamkniętego obszaru pod kliknięciem.
// Wzory są w milimetrach wydruku (jak grubości kresek), więc w każdej skali kreskowanie ma tę samą gęstość na papierze.
// Kreskowanie to element { t: 'hatch', loops: [[x, y]…]…, pat, ps (mnożnik gęstości), ang (obrót wzoru, radiany) };
// pętle nie są związane z liniami, z których powstały (przesunięcie ściany nie zmienia kreskowania).
import { _t } from './i18n.js';
import { V, EPS, ANNO, partsOf, bbox, boxHit, inLoops, sweep } from './geom.js';

const TAU = Math.PI * 2;
// wzory: domyślny kąt (stopnie) i opis kresek w mm wydruku przy ps = 1
export const PATTERNS = {
  diag: { name: _t('Ukośne'), ang: 45 },
  cross: { name: _t('Krzyżowe'), ang: 45 },
  conc: { name: _t('Beton'), ang: 0 },
  ins: { name: _t('Izolacja'), ang: 0 },
  soil: { name: _t('Grunt'), ang: 0 },
  solid: { name: _t('Pełne'), ang: 0 }
};
export const PATTERN_IDS = Object.keys(PATTERNS);

// powtarzalny „los” dla betonu (ten sam rysunek przy każdym odświeżeniu)
const rnd = (i, j, k) => { let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// odcinki wzoru w układzie wzoru (oś X wzdłuż kąta wzoru), pokrywające prostokąt b; m — metry na mm wydruku
function patternSegs(pat, b, m) {
  const out = [], [x0, y0, x1, y1] = b;
  const rows = (step, fn) => { const j0 = Math.floor(y0 / step), j1 = Math.ceil(y1 / step); if (j1 - j0 > 4000) return; for (let j = j0; j <= j1; j++) fn(j, j * step + step * 1e-4); };
  if (pat === 'diag') rows(2 * m, (j, y) => out.push([[x0, y], [x1, y]]));
  else if (pat === 'cross') {
    rows(2 * m, (j, y) => out.push([[x0, y], [x1, y]]));
    const s = 2 * m, i0 = Math.floor(x0 / s), i1 = Math.ceil(x1 / s);
    if (i1 - i0 <= 4000) for (let i = i0; i <= i1; i++) { const x = i * s + s * 1e-4; out.push([[x, y0], [x, y1]]); }
  } else if (pat === 'ins') {
    // izolacja: zygzak w pasach co 4 mm
    const h = 4 * m, w = 2 * m;
    rows(h, (j, y) => { const i0 = Math.floor(x0 / w), i1 = Math.ceil(x1 / w); if (i1 - i0 > 20000) return; for (let i = i0; i < i1; i++) out.push([[i * w, y + (i % 2 ? h : 0)], [(i + 1) * w, y + (i % 2 ? 0 : h)]]); });
  } else if (pat === 'soil') {
    // grunt: grupy trzech krótkich ukośnych kresek
    const h = 3 * m, w = 5 * m, l = 1.4 * m;
    rows(h, (j, y) => { const i0 = Math.floor(x0 / w), i1 = Math.ceil(x1 / w); if (i1 - i0 > 20000) return; for (let i = i0; i <= i1; i++) for (let k = 0; k < 3; k++) { const x = i * w + (j % 2 ? w / 2 : 0) + k * 0.6 * m; out.push([[x, y], [x + l, y + l]]); } });
  } else if (pat === 'conc') {
    // beton: kamyki (małe trójkąty) i kropki rozrzucone w kratkach 5 mm
    const c = 5 * m, i0 = Math.floor(x0 / c), i1 = Math.ceil(x1 / c), j0 = Math.floor(y0 / c), j1 = Math.ceil(y1 / c);
    if ((i1 - i0) * (j1 - j0) > 60000) return out;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const ox = i * c, oy = j * c, cx = ox + rnd(i, j, 1) * c, cy = oy + rnd(i, j, 2) * c, r = (0.35 + rnd(i, j, 3) * 0.4) * m, a = rnd(i, j, 4) * TAU;
      const p = [0, 1, 2].map(k => [cx + r * Math.cos(a + k * TAU / 3), cy + r * Math.sin(a + k * TAU / 3)]);
      out.push([p[0], p[1]], [p[1], p[2]], [p[2], p[0]]);
      for (let k = 5; k < 7; k++) { const dx = ox + rnd(i, j, k) * c, dy = oy + rnd(i, j, k + 10) * c; out.push([[dx, dy], [dx + 0.12 * m, dy]]); }
    }
  }
  return out;
}

// odcinek a–b przycięty do pętli (zasada parzystości: otwory zostają puste)
function clipSeg(a, b, loops, out) {
  const ts = [], d = V.sub(b, a);
  for (const L of loops) for (let i = 0; i < L.length; i++) {
    const p = L[i], q = L[(i + 1) % L.length], s = V.sub(q, p), den = V.cross(d, s);
    if (Math.abs(den) < 1e-18) continue;
    const t = V.cross(V.sub(p, a), s) / den, u = V.cross(V.sub(p, a), d) / den;
    if (t > 0 && t < 1 && u >= 0 && u < 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  let inside = inLoops(loops, a), t0 = 0;
  for (const t of [...ts, 1]) {
    if (inside && t - t0 > 1e-9) out.push([V.lerp(a, b, t0), V.lerp(a, b, t)]);
    inside = !inside; t0 = t;
  }
  return out;
}

// kreski kreskowania w metrach przestrzeni (pamiętane, dopóki nie zmieni się kształt, wzór albo skala)
const cache = new WeakMap();
export function hatchSegs(e, m = ANNO) {
  if (e.pat === 'solid') return [];
  const key = m + '|' + e.pat + '|' + e.ps + '|' + e.ang;
  const c = cache.get(e); if (c && c.key === key && c.loops === e.loops) return c.segs;
  const ang = e.ang || 0, cs = Math.cos(ang), sn = Math.sin(ang);
  const toP = p => [p[0] * cs + p[1] * sn, -p[0] * sn + p[1] * cs], fromP = p => [p[0] * cs - p[1] * sn, p[0] * sn + p[1] * cs];
  const loopsP = e.loops.map(L => L.map(toP));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const L of loopsP) for (const p of L) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; }
  const out = [];
  if (isFinite(x0)) for (const [a, b] of patternSegs(e.pat, [x0, y0, x1, y1], m * (e.ps || 1))) clipSeg(a, b, loopsP, out);
  const segs = out.map(([a, b]) => [fromP(a), fromP(b)]);
  cache.set(e, { key, loops: e.loops, segs });
  return segs;
}

/* ---------- szukanie obszaru ---------- */
// Wszystkie widoczne krzywe zamieniamy w odcinki, dzielimy w przecięciach, usuwamy „wiszące” końce i obchodzimy ściany
// grafu (zawsze najbardziej w prawo). Obszar to najmniejsza ściana zawierająca punkt; osobne kształty leżące w niej
// (np. wewnętrzny obrys ściany) stają się otworami.
// tol — dopuszczalna strzałka łuku (małe okręgi dostają mniej odcinków)
function flatten(e, tol) {
  const out = [];
  for (const q of partsOf(e)) {
    if (q.k === 'seg') { out.push([q.a, q.b]); continue; }
    const sw = q.full ? TAU : sweep(q.a0, q.a1), step = Math.max(Math.PI / 36, 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / q.r)))), n = Math.max(6, Math.ceil(sw / step));
    let prev = V.polar(q.c, q.r, q.a0);
    for (let i = 1; i <= n; i++) { const p = V.polar(q.c, q.r, q.a0 + sw * i / n); out.push([prev, p]); prev = p; }
  }
  return out;
}
const area = L => { let s = 0; for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };

// ents — elementy brane pod uwagę; rect — widoczny prostokąt (dalej nie szukamy); zwraca { loops } albo null
export function buildFaces(ents, rect) {
  let segs = [], truncated = false;
  const ftol = rect ? Math.hypot(rect[2] - rect[0], rect[3] - rect[1]) / 4000 : 1e-3;
  for (const e of ents) {
    if (e.t === 'text' || e.t === 'dim' || e.t === 'adim' || e.t === 'hatch' || e.t === 'vp') continue;
    if (rect && !boxHit(bbox(e), rect)) continue;
    if (segs.length > 150000) { truncated = true; break; }
    for (const s of flatten(e, ftol)) if (V.dist(s[0], s[1]) > 1e-9) segs.push(s);
  }
  // przecięcia: zamiatanie wzdłuż X
  const n = segs.length, cuts = segs.map(() => [0, 1]);
  const ord = segs.map((s, i) => ({ i, x0: Math.min(s[0][0], s[1][0]), x1: Math.max(s[0][0], s[1][0]), y0: Math.min(s[0][1], s[1][1]), y1: Math.max(s[0][1], s[1][1]) })).sort((a, b) => a.x0 - b.x0);
  const tol = 1e-7;
  for (let a = 0; a < n; a++) {
    const A = ord[a], s = segs[A.i], r = V.sub(s[1], s[0]);
    for (let b = a + 1; b < n && ord[b].x0 <= A.x1 + tol; b++) {
      const B = ord[b]; if (B.y0 > A.y1 + tol || B.y1 < A.y0 - tol) continue;
      const q = segs[B.i], d = V.sub(q[1], q[0]), den = V.cross(r, d);
      if (Math.abs(den) < 1e-14 * V.len(r) * V.len(d)) continue;
      const t = V.cross(V.sub(q[0], s[0]), d) / den, u = V.cross(V.sub(q[0], s[0]), r) / den;
      const et = tol / (V.len(r) || 1), eu = tol / (V.len(d) || 1);
      if (t < -et || t > 1 + et || u < -eu || u > 1 + eu) continue;
      cuts[A.i].push(Math.max(0, Math.min(1, t))); cuts[B.i].push(Math.max(0, Math.min(1, u)));
    }
  }
  // wierzchołki (sklejane z dokładnością ~1e-6 m) i krawędzie
  const vid = new Map(), P = [], adj = [];
  const key = p => Math.round(p[0] * 1e6) + ',' + Math.round(p[1] * 1e6);
  const vtx = p => { const k = key(p); let i = vid.get(k); if (i === undefined) { i = P.length; vid.set(k, i); P.push(p); adj.push(new Set()); } return i; };
  for (let i = 0; i < n; i++) {
    const ts = [...new Set(cuts[i].map(t => Math.round(t * 1e9) / 1e9))].sort((a, b) => a - b), s = segs[i];
    for (let k = 0; k + 1 < ts.length; k++) {
      const u = vtx(V.lerp(s[0], s[1], ts[k])), v = vtx(V.lerp(s[0], s[1], ts[k + 1]));
      if (u !== v) { adj[u].add(v); adj[v].add(u); }
    }
  }
  // wiszące końce precz
  const stack = []; for (let i = 0; i < P.length; i++) if (adj[i].size === 1) stack.push(i);
  while (stack.length) { const i = stack.pop(); if (adj[i].size !== 1) continue; const [j] = adj[i]; adj[i].delete(j); adj[j].delete(i); if (adj[j].size === 1) stack.push(j); }
  // krawędzie wychodzące posortowane po kącie
  const out = adj.map((s, i) => [...s].sort((a, b) => Math.atan2(P[a][1] - P[i][1], P[a][0] - P[i][0]) - Math.atan2(P[b][1] - P[i][1], P[b][0] - P[i][0])));
  const used = new Set(), faces = [];
  for (let u = 0; u < P.length; u++) for (const v0 of out[u]) {
    if (used.has(u + '>' + v0)) continue;
    const loop = []; let a = u, b = v0, guard = 0;
    while (!used.has(a + '>' + b) && guard++ < 200000) {
      used.add(a + '>' + b); loop.push(a);
      const lst = out[b], i = lst.indexOf(a), nx = lst[(i - 1 + lst.length) % lst.length];
      a = b; b = nx;
    }
    if (loop.length > 2) faces.push(loop);
  }
  // składowe (osobne kształty)
  const comp = new Array(P.length).fill(-1); let nc = 0;
  for (let i = 0; i < P.length; i++) if (comp[i] < 0 && adj[i].size) { const st = [i]; comp[i] = nc; while (st.length) { const x = st.pop(); for (const y of adj[x]) if (comp[y] < 0) { comp[y] = nc; st.push(y); } } nc++; }
  const res = faces.map(f => { const pts = f.map(i => P[i]); return { pts, area: area(pts), comp: comp[f[0]] }; });
  res.truncated = truncated;
  return res;
}
// obszar pod punktem: zewnętrzna pętla i otwory
export function regionAt(faces, p) {
  let best = null;
  for (const f of faces) if (f.area > 1e-12 && inLoops([f.pts], p) && (!best || f.area < best.area)) best = f;
  if (!best) return null;
  const loops = [best.pts];
  // obrysy innych kształtów leżących w obszarze (ich zewnętrzna ściana ma ujemne pole) → otwory
  for (const f of faces) {
    if (f.area >= -1e-12 || f.comp === best.comp) continue;
    const L = [...f.pts].reverse();
    if (inLoops([best.pts], L[0]) && !inLoops([L], p) && Math.abs(f.area) < best.area) loops.push(L);
  }
  return { loops };
}
