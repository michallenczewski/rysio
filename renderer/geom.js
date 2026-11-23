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
// „krzywe” elementu: odcinki i łuki w jednej postaci
export function partsOf(e) {
  if (e.t === 'circle') return [{ k: 'arc', c: e.c, r: e.r, a0: 0, a1: TAU, full: true }];
  if (e.t === 'arc') return [{ k: 'arc', c: e.c, r: e.r, a0: e.a0, a1: e.a1 }];
  return segsOf(e).map(([a, b]) => ({ k: 'seg', a, b }));
}
export function endpoints(e) {
  if (e.t === 'line') return [e.a, e.b];
  if (e.t === 'pline') return e.pts;
  if (e.t === 'arc') return [arcStart(e), arcEnd(e)];
  return [];
}
export function midpoints(e) {
  if (e.t === 'arc') return [arcMid(e)];
  return segsOf(e).map(([a, b]) => V.lerp(a, b, 0.5));
}
export const centerOf = e => (e.t === 'circle' || e.t === 'arc') ? e.c : null;

// prostokąt obrysu [minX, minY, maxX, maxY]
export function bbox(e) {
  if (e.t === 'circle') return [e.c[0] - e.r, e.c[1] - e.r, e.c[0] + e.r, e.c[1] + e.r];
  if (e.t === 'arc') {
    const pts = [arcStart(e), arcEnd(e)];
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; if (onArcAngle(e.a0, e.a1, a)) pts.push(V.polar(e.c, e.r, a)); }
    return boxOf(pts);
  }
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
  let best = null, bd = Infinity;
  for (const q of partsOf(e)) {
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
  if (e.t === 'line') return { a: m(e.a), b: m(e.b) };
  if (e.t === 'pline') return { pts: e.pts.map(m) };
  return { c: m(e.c) };
}
// długość elementu
export function lengthOf(e) {
  if (e.t === 'circle') return TAU * e.r;
  if (e.t === 'arc') return sweep(e.a0, e.a1) * e.r;
  return segsOf(e).reduce((s, [a, b]) => s + V.dist(a, b), 0);
}
