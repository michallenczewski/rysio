// Zmienianie geometrii (etap 3): obrót, odbicie, skala, odsunięcie, zaokrąglenie narożnika, przycinanie i wydłużanie.
// Same obliczenia, bez okna — wyniki to pola elementów do app.edit(); sprawdzane w scripts/sprawdziany.mjs.
import { V, EPS, angOf, normAng, sweep, onArcAngle, bulgeOf, plineParts, partsOf, intersect, lineCircle, circleCircle, closestOnSeg, endpoints, lengthOf as lengthOfE, arcStart, arcEnd, arcMid, moved, dimGeom, blockEnts } from './geom.js';
import { lineX } from './snap.js';

const TAU = Math.PI * 2;
const pt = p => [p[0], p[1]];

/* ---------- przekształcenia ---------- */
// T: { f — przekształcenie punktu, rot — kąt obrotu, mirror — odbicie, axisAng — kąt osi odbicia, k — skala }
export const rotation = (o, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return { f: p => { const d = V.sub(p, o); return [o[0] + d[0] * c - d[1] * s, o[1] + d[0] * s + d[1] * c]; }, rot: ang, mirror: false, k: 1 };
};
export const mirroring = (a, b) => {
  const u = V.norm(V.sub(b, a));
  return { f: p => { const q = V.add(a, V.mul(u, V.dot(V.sub(p, a), u))); return V.sub(V.mul(q, 2), pt(p)); }, rot: 0, mirror: true, axisAng: Math.atan2(u[1], u[0]), k: 1 };
};
export const scaling = (o, k) => ({ f: p => V.add(o, V.mul(V.sub(pt(p), o), k)), rot: 0, mirror: false, k });
// obrót tekstu trzymany w (−90°, 90°], żeby napis zawsze dał się czytać
const readable = a => { a = normAng(a); if (a > Math.PI / 2 + 1e-9 && a <= 3 * Math.PI / 2 + 1e-9) a -= Math.PI; else if (a > 3 * Math.PI / 2) a -= TAU; return Math.abs(a) < 1e-12 ? 0 : a; };
// pola elementu po przekształceniu; null — tego elementu się tak nie przekształca (okno na arkuszu tylko się przesuwa)
export function transformed(e, T) {
  const ang = a => T.mirror ? normAng(2 * T.axisAng - a) : normAng(a + T.rot);
  switch (e.t) {
    case 'line': return { a: T.f(e.a), b: T.f(e.b) };
    case 'pline': return { pts: e.pts.map(p => { const q = T.f(p); return p[2] ? [q[0], q[1], T.mirror ? -p[2] : p[2]] : q; }) };
    case 'circle': return { c: T.f(e.c), r: e.r * T.k };
    case 'arc': { const a0 = ang(e.a0), a1 = ang(e.a1); return T.mirror ? { c: T.f(e.c), r: e.r * T.k, a0: a1, a1: a0 } : { c: T.f(e.c), r: e.r * T.k, a0, a1 }; }
    // tekst ma wysokość w mm wydruku — skala jej nie zmienia; odbity tekst zostaje czytelny (przesuwa się tylko punkt)
    case 'text': return { p: T.f(e.p), rot: T.mirror ? (e.rot || 0) : readable((e.rot || 0) + T.rot) };
    case 'dim': {
      let dir = e.dir;
      if (dir !== 'a') {
        const q = normAng(T.mirror ? 2 * T.axisAng : T.rot), quarter = Math.round(q / (Math.PI / 2));
        if (Math.abs(q - quarter * Math.PI / 2) > 1e-9) dir = 'a'; else if (quarter % 2 === 1) dir = dir === 'h' ? 'v' : 'h';
      }
      return { a: T.f(e.a), b: T.f(e.b), o: T.f(e.o), dir };
    }
    // wymiar kątowy: punkty; promień / średnica: środek, miejsce opisu i promień ze skalą
    case 'adim': return e.k === 'ang' ? { c: T.f(e.c), a: T.f(e.a), b: T.f(e.b), o: T.f(e.o) } : { c: T.f(e.c), o: T.f(e.o), r: e.r * T.k };
    // wstawienie bloku: punkt, obrót, skala i odbicie (odbicie w osi pod kątem α: obrót' = 2α − obrót + π, odbicie się przełącza)
    case 'ins': return T.mirror ? { p: T.f(e.p), rot: normAng(2 * T.axisAng - (e.rot || 0) + Math.PI), s: (e.s || 1) * T.k, mx: !e.mx } : { p: T.f(e.p), rot: normAng((e.rot || 0) + T.rot), s: (e.s || 1) * T.k };
    case 'hatch': return { loops: e.loops.map(L => L.map(q => T.f(q))), ang: normAng(T.mirror ? 2 * T.axisAng - (e.ang || 0) : (e.ang || 0) + T.rot) };
    default: return null;
  }
}
// przekształcenie wstawienia w postaci T (do transformed): odbicie x → −x, potem obrót = odbicie w osi pod kątem (obrót + π) / 2
export function insT(e) {
  const c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0), k = e.s || 1, m = e.mx ? -1 : 1;
  return { f: q => { const x = q[0] * k * m, y = q[1] * k; return [e.p[0] + x * c - y * s, e.p[1] + x * s + y * c]; }, rot: e.rot || 0, mirror: !!e.mx, axisAng: ((e.rot || 0) + Math.PI) / 2, k };
}
// rozbicie wstawienia: kopie elementów bloku w położeniu wstawienia (bez id i przestrzeni)
export function explodeIns(e) {
  const T = insT(e), out = [];
  for (const ch of blockEnts(e.b)) {
    const patch = transformed(ch, T); if (!patch) continue;
    const { id, sp, ...rest } = ch;
    const n = { ...rest, ...patch };
    // wysokość tekstu i wymiaru rośnie razem z blokiem (w bloku jest w mm wydruku przy skali 1)
    if ((ch.t === 'text' || ch.t === 'dim' || ch.t === 'adim') && T.k !== 1) n.h = (ch.h || (ch.t === 'text' ? 3 : 2.5)) * T.k;
    // tekst tak, jak rysuje go pióro bloku: kierunek przeniesiony, w odbitym bloku odwrócony z zamienionym wyrównaniem
    if (ch.t === 'text') {
      const a = e.mx ? (e.rot || 0) + Math.PI - (ch.rot || 0) - Math.PI : (e.rot || 0) + (ch.rot || 0);
      n.rot = normAng(a); if (n.rot > Math.PI) n.rot -= TAU;
      if (e.mx) n.align = ch.align === 'r' ? 'l' : ch.align === 'c' ? 'c' : 'r';
    }
    if (ch.t === 'hatch') n.ps = (ch.ps || 1) * T.k;   // gęstość jak w przeskalowanym bloku
    out.push(n);
  }
  return out;
}

/* ---------- odsunięcie ---------- */
// Odsunięcie elementu o d na stronę punktu side. Wynik: nowy element (bez warstwy i kreski) albo { error }.
export function offsetEnt(e, d, side) {
  if (!(d > 0)) return { error: 'distance' };
  if (e.t === 'line') {
    const n = V.perp(V.norm(V.sub(e.b, e.a))), s = Math.sign(V.dot(V.sub(side, e.a), n)) || 1, v = V.mul(n, d * s);
    return { t: 'line', a: V.add(e.a, v), b: V.add(e.b, v) };
  }
  if (e.t === 'circle' || e.t === 'arc') {
    const r = e.r + (V.dist(side, e.c) > e.r ? d : -d);
    if (r <= 1e-9) return { error: 'tooBig' };
    return e.t === 'circle' ? { t: 'circle', c: [...e.c], r } : { t: 'arc', c: [...e.c], r, a0: e.a0, a1: e.a1 };
  }
  if (e.t === 'pline') return offsetPline(e, d, side);
  return { error: 'type' };
}
// kierunek części polilinii w punkcie (wektor jednostkowy w stronę biegu polilinii)
function partDir(q, p) {
  if (q.k === 'seg') return V.norm(V.sub(q.b, q.a));
  const r = V.norm(V.sub(p, q.c));
  return q.ccw ? V.perp(r) : V.mul(V.perp(r), -1);
}
function nearestPart(parts, p) {
  let best = null, bd = Infinity;
  for (const q of parts) {
    let c;
    if (q.k === 'seg') c = closestOnSeg(p, q.a, q.b).p;
    else { const a = angOf(q.c, p); c = onArcAngle(q.a0, q.a1, a) ? V.polar(q.c, q.r, a) : (V.dist(p, q.from) < V.dist(p, q.to) ? q.from : q.to); }
    const dd = V.dist(p, c); if (dd < bd) { bd = dd; best = { q, c }; }
  }
  return best;
}
function offsetPline(e, d, side) {
  const parts = plineParts(e); if (!parts.length) return { error: 'type' };
  // strona: +1 — po lewej od kierunku polilinii, −1 — po prawej
  const np = nearestPart(parts, side), s = Math.sign(V.cross(partDir(np.q, np.c), V.sub(side, np.c))) || 1;
  // części odsunięte jako „nieskończone” kształty: prosta albo okrąg
  const off = [];
  for (const q of parts) {
    if (q.k === 'seg') { const n = V.mul(V.perp(V.norm(V.sub(q.b, q.a))), d * s); off.push({ k: 'seg', a: V.add(q.a, n), b: V.add(q.b, n) }); }
    else {
      const r = q.r + (q.ccw ? -1 : 1) * s * d;
      if (r <= 1e-9) return { error: 'tooBig' };
      off.push({ k: 'arc', c: q.c, r, ccw: q.ccw, from: V.add(q.c, V.mul(V.norm(V.sub(q.from, q.c)), r)), to: V.add(q.c, V.mul(V.norm(V.sub(q.to, q.c)), r)) });
    }
  }
  const startOf = o => o.k === 'seg' ? o.a : o.from, endOf = o => o.k === 'seg' ? o.b : o.to;
  // połączenie dwóch kolejnych części: przecięcie ich kształtów najbliższe końcowi pierwszej; null — kształty się nie przecinają
  function join(A, B) {
    const near = endOf(A);
    let cands = [];
    if (A.k === 'seg' && B.k === 'seg') { const x = lineX(A.a, V.sub(A.b, A.a), B.a, V.sub(B.b, B.a)); if (x) cands = [x]; }
    else if (A.k === 'seg') cands = lineCircle(A.a, A.b, B.c, B.r, false);
    else if (B.k === 'seg') cands = lineCircle(B.a, B.b, A.c, A.r, false);
    else cands = circleCircle(A.c, A.r, B.c, B.r);
    if (!cands.length) return V.dist(endOf(A), startOf(B)) < 1e-9 ? endOf(A) : null;
    return cands.sort((x, y) => V.dist(x, near) - V.dist(y, near))[0];
  }
  // wierzchołki z częścią, która od nich wychodzi; gdy kształty się nie przecinają — prosty łącznik między końcami
  const n = off.length, out = [];
  const link = (A, B) => { const x = join(A, B); if (x) out.push({ p: x, o: B }); else { out.push({ p: endOf(A), o: null }); out.push({ p: startOf(B), o: B }); } };
  const closed = e.closed && n >= 2;
  if (closed) { for (let i = 0; i < n; i++) link(off[(i + n - 1) % n], off[i]); }
  else { out.push({ p: startOf(off[0]), o: off[0] }); for (let i = 0; i < n - 1; i++) link(off[i], off[i + 1]); out.push({ p: endOf(off[n - 1]), o: null }); }
  // za duża odległość: któraś część zmieniła kierunek (figura się wywinęła)
  for (let k = 0; k < out.length; k++) {
    const { p, o } = out[k], q = out[(k + 1) % out.length]; if (!o || (!closed && k === out.length - 1)) continue;
    const src = parts[off.indexOf(o)];
    if (V.dot(V.sub(q.p, p), V.sub(src.to, src.from)) < -1e-12) return { error: 'tooBig' };
  }
  const pts = out.map(({ p, o }, k) => {
    if (!o || o.k === 'seg') return pt(p);
    const nx = out[(k + 1) % out.length].p;
    return [p[0], p[1], bulgeOf(o.c, p, nx, o.ccw)];
  });
  return { t: 'pline', pts, closed: !!closed };
}

/* ---------- zaokrąglenie narożnika (dwie linie) ---------- */
// l1, l2 — linie, p1, p2 — punkty kliknięcia (ta część linii zostaje), r — promień (0 = ostry narożnik).
// Wynik: { l1: { a?, b? }, l2: { a?, b? }, arc? } albo { error: 'parallel' | 'tooBig' }
export function filletLines(l1, p1, l2, p2, r) {
  const X = lineX(l1.a, V.sub(l1.b, l1.a), l2.a, V.sub(l2.b, l2.a));
  if (!X) return { error: 'parallel' };
  const side = (l, p) => {
    const u = V.norm(V.sub(l.b, l.a)), ta = V.dot(V.sub(l.a, X), u), tb = V.dot(V.sub(l.b, X), u), tp = V.dot(V.sub(p, X), u);
    const sg = Math.sign(tp) || Math.sign(Math.abs(ta) > Math.abs(tb) ? ta : tb) || 1;
    // zostaje koniec po stronie kliknięcia (dalszy od narożnika); drugi przesuwa się do narożnika
    const keepA = Math.sign(ta) === sg && (Math.sign(tb) !== sg || Math.abs(ta) >= Math.abs(tb));
    return { dir: V.mul(u, sg), keepKey: keepA ? 'a' : 'b', moveKey: keepA ? 'b' : 'a', len: Math.abs(keepA ? ta : tb) };
  };
  const s1 = side(l1, p1), s2 = side(l2, p2);
  if (!(r > 1e-12)) return { l1: { [s1.moveKey]: X }, l2: { [s2.moveKey]: X } };
  const th = Math.acos(Math.max(-1, Math.min(1, V.dot(s1.dir, s2.dir))));
  if (th < 1e-6 || Math.PI - th < 1e-6) return { error: 'parallel' };
  const dist = r / Math.tan(th / 2);
  if (dist > s1.len + 1e-9 || dist > s2.len + 1e-9) return { error: 'tooBig' };
  const T1 = V.add(X, V.mul(s1.dir, dist)), T2 = V.add(X, V.mul(s2.dir, dist));
  const C = V.add(X, V.mul(V.norm(V.add(s1.dir, s2.dir)), r / Math.sin(th / 2)));
  let a0 = angOf(C, T1), a1 = angOf(C, T2);
  if (sweep(a0, a1) > Math.PI) [a0, a1] = [a1, a0];
  return { l1: { [s1.moveKey]: T1 }, l2: { [s2.moveKey]: T2 }, arc: { t: 'arc', c: C, r, a0, a1 } };
}

// fazowanie dwóch linii: narożnik ścięty odcinkiem w odległościach d1 (na pierwszej) i d2 (na drugiej) od narożnika
export function chamferLines(l1, p1, l2, p2, d1, d2 = d1) {
  const z = filletLines(l1, p1, l2, p2, 0); if (z.error) return z;
  const X = z.l1.a || z.l1.b;
  const k1 = Object.keys(z.l1)[0], k2 = Object.keys(z.l2)[0], o1 = k1 === 'a' ? l1.b : l1.a, o2 = k2 === 'a' ? l2.b : l2.a;
  const L1 = V.dist(X, o1), L2 = V.dist(X, o2);
  if (!(d1 > 1e-12) && !(d2 > 1e-12)) return z;
  if (d1 > L1 + 1e-9 || d2 > L2 + 1e-9 || L1 < 1e-12 || L2 < 1e-12) return { error: 'tooBig' };
  const T1 = V.add(X, V.mul(V.sub(o1, X), d1 / L1)), T2 = V.add(X, V.mul(V.sub(o2, X), d2 / L2));
  return { l1: { [k1]: T1 }, l2: { [k2]: T2 }, line: { t: 'line', a: T1, b: T2 } };
}

// Zaokrąglenie dowolnych dwóch krzywych: linia, łuk, okrąg (okrąg się nie przycina). Środek łuku to przecięcie krzywych
// odsuniętych o r; z możliwych wybieramy ten, którego punkty styczności leżą najbliżej kliknięć. r = 0 — ostry narożnik.
export function filletCurves(e1, p1, e2, p2, r) {
  if (e1.t === 'line' && e2.t === 'line') return filletLines(e1, p1, e2, p2, r);
  const curve = e => e.t === 'line' ? { k: 'L', a: e.a, d: V.norm(V.sub(e.b, e.a)) } : { k: 'C', c: e.c, r: e.r };
  const c1 = curve(e1), c2 = curve(e2);
  const offs = (c, s) => c.k === 'L' ? { k: 'L', a: V.add(c.a, V.mul(V.perp(c.d), s * r)), d: c.d } : (c.r + s * r > 1e-12 ? { k: 'C', c: c.c, r: c.r + s * r } : null);
  const meet = (A, B) => A.k === 'L' && B.k === 'L' ? [lineX(A.a, A.d, B.a, B.d)].filter(Boolean) : A.k === 'L' ? lineCircle(A.a, V.add(A.a, A.d), B.c, B.r, false) : B.k === 'L' ? meet(B, A) : circleCircle(A.c, A.r, B.c, B.r);
  const foot = (c, C) => { if (c.k === 'L') return V.add(c.a, V.mul(c.d, V.dot(V.sub(C, c.a), c.d))); const d = V.sub(C, c.c); return V.len(d) < 1e-12 ? null : V.add(c.c, V.mul(V.norm(d), c.r)); };
  const signs = r > 1e-12 ? [1, -1] : [1];
  let best = null;
  for (const s1 of signs) for (const s2 of signs) {
    const A = offs(c1, s1), B = offs(c2, s2); if (!A || !B) continue;
    for (const C of meet(A, B)) {
      const T1 = foot(c1, C), T2 = foot(c2, C); if (!T1 || !T2) continue;
      const score = V.dist(T1, p1) + V.dist(T2, p2);
      if (!best || score < best.score - 1e-12) best = { C, T1, T2, score };
    }
  }
  if (!best) return { error: 'parallel' };
  const { C, T1, T2 } = best;
  const out = { l1: cutAt(e1, T1, p1), l2: cutAt(e2, T2, p2) };
  if (r > 1e-12 && V.dist(T1, T2) > 1e-12) { let a0 = angOf(C, T1), a1 = angOf(C, T2); if (sweep(a0, a1) > Math.PI) [a0, a1] = [a1, a0]; out.arc = { t: 'arc', c: C, r, a0, a1 }; }
  return out;
}
// przycięcie / wydłużenie elementu do punktu T; zostaje strona, po której kliknięto (p)
function cutAt(e, T, p) {
  if (e.t === 'line') { const u = V.sub(p, T); return V.dot(V.sub(e.a, T), u) >= V.dot(V.sub(e.b, T), u) ? { b: pt(T) } : { a: pt(T) }; }
  if (e.t === 'arc') {
    const ta = angOf(e.c, T), tp = angOf(e.c, p);
    if (onArcAngle(e.a0, e.a1, ta, 1e-9)) return onArcAngle(e.a0, ta, tp, 1e-9) ? { a1: ta } : { a0: ta };
    return sweep(ta, e.a0) < sweep(e.a1, ta) ? { a0: ta } : { a1: ta };   // poza łukiem — wydłużamy bliższy koniec
  }
  return {};   // okrąg zostaje cały
}

// Narożnik polilinii: wierzchołek najbliższy kliknięcia (oba sąsiednie kawałki proste).
// mode 'fillet' — łuk o promieniu r; 'chamfer' — ścięcie w odległościach r i d2. Zwraca nowe pts albo { error }.
// near — zasięg kliknięcia (w metrach): klik dalej od wierzchołka niż near i niż ćwierć klikniętego odcinka to błąd 'far'.
export function plineCorner(e, p, mode, r, d2 = r, near = Infinity) {
  const n = e.pts.length, parts = plineParts(e); if (!parts.length) return { error: 'noCorner' };
  const np = nearestPart(parts, p), q = np.q, i0 = q.i;
  let vi = V.dist(np.c, q.from) <= V.dist(np.c, q.to) ? i0 : (i0 + 1) % n;
  const atEnd = !e.closed && (vi === 0 || vi === n - 1);
  if (atEnd) vi = vi === 0 ? 1 : n - 2;   // na końcu otwartej polilinii — najbliższy narożnik (bez sprawdzania odległości)
  if (!e.closed && (vi <= 0 || vi >= n - 1)) return { error: 'noCorner' };
  if (!atEnd && V.dist(np.c, pt(e.pts[vi])) > Math.max(near, 0.25 * V.dist(pt(q.from), pt(q.to)))) return { error: 'far' };
  const ip = (vi - 1 + n) % n, inx = (vi + 1) % n;
  if (e.pts[ip][2] || e.pts[vi][2]) return { error: 'arcCorner' };
  const Vx = pt(e.pts[vi]), A = pt(e.pts[ip]), B = pt(e.pts[inx]);
  const la = V.dist(A, Vx), lb = V.dist(B, Vx); if (la < 1e-12 || lb < 1e-12) return { error: 'noCorner' };
  const u1 = V.mul(V.sub(A, Vx), 1 / la), u2 = V.mul(V.sub(B, Vx), 1 / lb);
  const th = Math.acos(Math.max(-1, Math.min(1, V.dot(u1, u2))));
  if (th < 1e-6 || Math.PI - th < 1e-6) return { error: 'parallel' };
  let T1, T2, bulge = 0;
  if (mode === 'chamfer') {
    if (r > la + 1e-9 || d2 > lb + 1e-9) return { error: 'tooBig' };
    T1 = V.add(Vx, V.mul(u1, r)); T2 = V.add(Vx, V.mul(u2, d2));
  } else {
    const dist = r / Math.tan(th / 2); if (dist > la + 1e-9 || dist > lb + 1e-9) return { error: 'tooBig' };
    T1 = V.add(Vx, V.mul(u1, dist)); T2 = V.add(Vx, V.mul(u2, dist));
    const C = V.add(Vx, V.mul(V.norm(V.add(u1, u2)), r / Math.sin(th / 2)));
    bulge = bulgeOf(C, T1, T2, V.cross(V.sub(T1, C), V.sub(T2, C)) > 0);
  }
  if (!(r > 1e-12) && !(d2 > 1e-12)) return { error: 'zero' };
  const pts = e.pts.map(q => [...q]);
  pts.splice(vi, 1, bulge ? [T1[0], T1[1], bulge] : [T1[0], T1[1]], [T2[0], T2[1]]);
  // ścięcie / łuk dokładnie do sąsiedniego wierzchołka — bez punktu o zerowej długości
  const clean = pts.filter((q, k) => (!e.closed && k === pts.length - 1) || V.dist(q, pts[(k + 1) % pts.length]) > 1e-12);
  return { pts: clean, vertex: Vx, A, B, T1, T2, bulge };   // A, B — sąsiednie wierzchołki; T1, T2 — początek i koniec łuku / ścięcia
}

/* ---------- przycinanie i wydłużanie ---------- */
// Parametr punktu na elemencie: linia i łuk 0…1, polilinia — numer części + 0…1, okrąg — kąt.
function paramOn(e, p) {
  if (e.t === 'line') { const d = V.sub(e.b, e.a); return V.dot(V.sub(p, e.a), d) / V.dot(d, d); }
  if (e.t === 'arc') return normAng(angOf(e.c, p) - e.a0) / sweep(e.a0, e.a1);
  if (e.t === 'circle') return angOf(e.c, p);
  const parts = plineParts(e), np = nearestPart(parts, p), q = np.q;
  if (q.k === 'seg') { const d = V.sub(q.b, q.a); return q.i + Math.max(0, Math.min(1, V.dot(V.sub(np.c, q.a), d) / V.dot(d, d))); }
  const sw = sweep(q.a0, q.a1), a = angOf(q.c, np.c);
  return q.i + (q.ccw ? normAng(a - angOf(q.c, q.from)) : normAng(angOf(q.c, q.from) - a)) / sw;
}
function pointAt(e, t) {
  if (e.t === 'line') return V.lerp(e.a, e.b, t);
  if (e.t === 'arc') return V.polar(e.c, e.r, e.a0 + t * sweep(e.a0, e.a1));
  if (e.t === 'circle') return V.polar(e.c, e.r, t);
  const parts = plineParts(e), i = Math.min(parts.length - 1, Math.floor(t + 1e-12)), f = t - i, q = parts[i];
  if (q.k === 'seg') return V.lerp(q.a, q.b, f);
  const a0 = angOf(q.c, q.from), sw = sweep(q.a0, q.a1);
  return V.polar(q.c, q.r, q.ccw ? a0 + f * sw : a0 - f * sw);
}
// fragment polilinii od parametru s do t (t może przekroczyć liczbę części przy zamkniętej — wtedy zawija)
function plineSlice(e, s, t) {
  const parts = plineParts(e), n = parts.length, pts = [];
  // punkt dla parametru, także „po zawinięciu” zamkniętej polilinii (n … 2n)
  const at = x => { let y = x; while (y > n + 1e-12) y -= n; while (y < 0) y += n; return pointAt(e, y); };
  let x = s;
  while (x < t - 1e-12) {
    const i = Math.floor(x + 1e-12), next = Math.min(t, i + 1), q = parts[((i % n) + n) % n];
    const P = at(x), Q = next >= i + 1 - 1e-12 ? pt(q.to) : at(next);
    pts.push(q.k === 'seg' ? pt(P) : [P[0], P[1], bulgeOf(q.c, P, Q, q.ccw)]);
    x = next;
  }
  pts.push(pt(at(t)));
  return pts.length > 1 ? { t: 'pline', pts, closed: false } : null;
}
// parametry przecięć elementu z elementami tnącymi
function cutParams(e, others) {
  const ts = [];
  for (const o of others) for (const x of intersect(e, o)) ts.push(paramOn(e, x));
  return ts;
}
const geomOf = e => { const { t, a, b, pts, closed, c, r, a0, a1 } = e; return Object.fromEntries(Object.entries({ t, a, b, pts, closed, c, r, a0, a1 }).filter(([, v]) => v !== undefined)); };

// Przycięcie kawałka elementu e, w który kliknięto (p), między najbliższymi przecięciami z others.
// Wynik: { replace: [nowe elementy] } (pusty — element znika) z polami lo / hi albo null, gdy nie ma czego przyciąć.
export function trimAt(e, p, others) {
  const tc = paramOn(e, p), ts = cutParams(e, others);
  if (e.t === 'circle') {
    const as = [...new Set(ts.map(a => +normAng(a).toFixed(12)))].sort((x, y) => x - y);
    if (as.length < 2) return null;
    const c = normAng(tc); let hi = as.find(a => a > c); let lo = [...as].reverse().find(a => a < c);
    if (hi === undefined) hi = as[0]; if (lo === undefined) lo = as[as.length - 1];
    return { replace: [{ t: 'arc', c: [...e.c], r: e.r, a0: hi, a1: lo }] };
  }
  const max = e.t === 'pline' ? plineParts(e).length : 1, eps = 1e-9;
  if (e.t === 'pline' && e.closed) {
    // w zamkniętej polilinii parametr 0 i max to ten sam punkt — zwykłe przecięcie, nie koniec elementu
    const inner = [...new Set(ts.map(t => (t >= max - eps ? 0 : Math.max(0, t))).map(t => +t.toFixed(12)))].sort((x, y) => x - y);
    if (inner.length < 2) return null;
    let lo = [...inner].reverse().find(t => t < tc - eps), hi = inner.find(t => t > tc + eps);
    if (lo === undefined) lo = inner[inner.length - 1] - max;
    if (hi === undefined) hi = inner[0] + max;
    const piece = plineSlice(e, hi, lo + max);
    return piece ? { replace: [piece], lo, hi } : null;
  }
  const inner = ts.filter(t => t > eps && t < max - eps).sort((x, y) => x - y);
  let lo = [...inner].reverse().find(t => t < tc - eps), hi = inner.find(t => t > tc + eps);
  if (lo === undefined && hi === undefined) return null;
  const out = [];
  if (e.t === 'line') { if (lo !== undefined) out.push({ t: 'line', a: [...e.a], b: pointAt(e, lo) }); if (hi !== undefined) out.push({ t: 'line', a: pointAt(e, hi), b: [...e.b] }); }
  else if (e.t === 'arc') {
    const sw = sweep(e.a0, e.a1);
    if (lo !== undefined) out.push({ t: 'arc', c: [...e.c], r: e.r, a0: e.a0, a1: normAng(e.a0 + lo * sw) });
    if (hi !== undefined) out.push({ t: 'arc', c: [...e.c], r: e.r, a0: normAng(e.a0 + hi * sw), a1: e.a1 });
  } else if (e.t === 'pline') {
    if (lo !== undefined) { const a = plineSlice(e, 0, lo); if (a) out.push(a); }
    if (hi !== undefined) { const b = plineSlice(e, hi, max); if (b) out.push(b); }
  } else return null;
  return { replace: out, lo, hi };
}

// Wydłużenie końca elementu e bliższego p do najbliższego elementu z others. Wynik: pola do tx.set albo null.
export function extendAt(e, p, others) {
  if (e.t === 'line' || (e.t === 'pline' && !e.closed)) {
    let A, B, apply;
    if (e.t === 'line') {
      const atB = V.dist(p, e.b) <= V.dist(p, e.a);
      [A, B] = atB ? [e.a, e.b] : [e.b, e.a];
      apply = x => (atB ? { b: x } : { a: x });
    } else {
      const parts = plineParts(e), atEnd = V.dist(p, endpoints(e)[e.pts.length - 1]) <= V.dist(p, e.pts[0]);
      const q = atEnd ? parts[parts.length - 1] : parts[0];
      if (q.k !== 'seg') return null;
      [A, B] = atEnd ? [q.a, q.b] : [q.b, q.a];
      apply = x => { const pts = e.pts.map(v => [...v]); if (atEnd) pts[pts.length - 1] = [x[0], x[1]]; else pts[0] = [x[0], x[1], ...(pts[0][2] ? [pts[0][2]] : [])]; return { pts }; };
    }
    const u = V.norm(V.sub(B, A)), len = V.dist(A, B);
    let best = null, bt = Infinity;
    for (const o of others) for (const q of partsOf(o)) {
      let xs = [];
      if (q.k === 'seg') { const x = lineX(A, u, q.a, V.sub(q.b, q.a)); if (x) { const tq = V.dot(V.sub(x, q.a), V.sub(q.b, q.a)) / V.dot(V.sub(q.b, q.a), V.sub(q.b, q.a)); if (tq >= -1e-9 && tq <= 1 + 1e-9) xs = [x]; } }
      else xs = lineCircle(A, B, q.c, q.r, false).filter(x => q.full || onArcAngle(q.a0, q.a1, angOf(q.c, x)));
      for (const x of xs) { const t = V.dot(V.sub(x, A), u); if (t > len + 1e-9 && t < bt) { bt = t; best = x; } }
    }
    return best ? apply(best) : null;
  }
  if (e.t === 'arc') {
    const atEnd = V.dist(p, V.polar(e.c, e.r, e.a1)) <= V.dist(p, V.polar(e.c, e.r, e.a0)), sw = sweep(e.a0, e.a1);
    let best = null, bd = Infinity;
    for (const o of others) for (const q of partsOf(o)) {
      const xs = q.k === 'seg' ? lineCircle(q.a, q.b, e.c, e.r, true) : circleCircle(e.c, e.r, q.c, q.r).filter(x => q.full || onArcAngle(q.a0, q.a1, angOf(q.c, x)));
      for (const x of xs) {
        const a = angOf(e.c, x), dlt = atEnd ? normAng(a - e.a1) : normAng(e.a0 - a);
        if (dlt > 1e-9 && dlt < TAU - sw - 1e-9 && dlt < bd) { bd = dlt; best = a; }
      }
    }
    return best === null ? null : atEnd ? { a1: best } : { a0: best };
  }
  return null;
}

// Narzędzie „przytnij / wydłuż” jednym kliknięciem: klik przy samym końcu (bliżej niż endTol albo 10% długości),
// gdy między kliknięciem a tym końcem nie ma przecięcia, a koniec da się dosunąć do innego elementu — wydłużenie;
// w pozostałych przypadkach przycięcie klikniętego kawałka.
export function trimOrExtend(e, p, others, endTol = 0) {
  const tr = trimAt(e, p, others);
  let end = null;
  if (e.t === 'line') end = V.dist(p, e.b) <= V.dist(p, e.a) ? ['b', e.b] : ['a', e.a];
  else if (e.t === 'arc') { const A = V.polar(e.c, e.r, e.a0), B = V.polar(e.c, e.r, e.a1); end = V.dist(p, B) <= V.dist(p, A) ? ['b', B] : ['a', A]; }
  else if (e.t === 'pline' && !e.closed) { const A = e.pts[0], B = e.pts[e.pts.length - 1]; end = V.dist(p, B) <= V.dist(p, A) ? ['b', B] : ['a', A]; }
  if (end) {
    const near = V.dist(p, end[1]) <= Math.max(endTol, 0.1 * lengthOfE(e));
    const clear = !tr || (end[0] === 'b' ? tr.hi === undefined : tr.lo === undefined);
    if (near && clear) { const ex = extendAt(e, p, others); if (ex) return { kind: 'extend', set: ex }; }
  }
  return tr ? { kind: 'trim', replace: tr.replace } : null;
}
// Kawałki elementu e między przecięciami z others; usuwa te, w które trafił któryś z punktów ps, sąsiednie pozostałe
// łączy w jeden element. Wynik: { keep: nowe elementy (pusta — element znika), gone: usunięte kawałki } albo null, gdy nie ma przecięć.
function trimPieces(e, ps, others) {
  const eps = 1e-9, ts = cutParams(e, others), uniq = a => a.sort((x, y) => x - y).filter((t, i, s) => !i || t - s[i - 1] > 1e-12);
  const cyclic = e.t === 'circle' || (e.t === 'pline' && e.closed);
  const period = e.t === 'circle' ? TAU : e.t === 'pline' ? plineParts(e).length : 1;
  const cuts = cyclic ? uniq(ts.map(t => (e.t === 'circle' ? normAng(t) : t >= period - eps ? 0 : Math.max(0, t)))) : uniq(ts.filter(t => t > eps && t < period - eps));
  if (cyclic ? cuts.length < 2 : !cuts.length) return null;
  // przedziały [od, do]: przy elemencie zamkniętym ostatni zawija przez początek
  const iv = cyclic ? cuts.map((t, i) => [t, i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + period]) : [0, ...cuts].map((t, i) => [t, i < cuts.length ? cuts[i] : period]);
  const hit = new Set();
  for (const p of ps) {
    let t = paramOn(e, p);
    if (cyclic) { t = ((t % period) + period) % period; if (t < cuts[0]) t += period; }
    else if (e.t === 'arc' && t > 1) { const sw = sweep(e.a0, e.a1), o = t * sw; t = o - sw < TAU - o ? 1 : 0; }   // poza łukiem — do bliższego końca
    else t = Math.max(0, Math.min(period, t));   // klik tuż za końcem linii
    // trafienie dokładnie w punkt cięcia — kawałki po obu jego stronach
    iv.forEach(([a, b], i) => { if (t >= a - eps && t <= b + eps) hit.add(i); });
    if (cyclic && Math.abs(t - period - cuts[0]) <= eps) hit.add(0);
  }
  if (!hit.size) return null;
  // ciągi sąsiednich zostających przedziałów (przy zamkniętym — zaczynając zaraz po usuniętym)
  const n = iv.length, first = cyclic ? ([...hit][0] + 1) % n : 0, runs = [];
  let run = null;
  for (let k = 0; k < n; k++) {
    const i = (first + k) % n;
    if (hit.has(i)) { run = null; continue; }
    const a = iv[i][0] + (cyclic && i < first ? period : 0), b = iv[i][1] + (cyclic && i < first ? period : 0);
    if (run) run[1] = b; else runs.push(run = [a, b]);
  }
  const slice = (a, b) => {
    if (e.t === 'line') return { t: 'line', a: pointAt(e, a), b: pointAt(e, b) };
    if (e.t === 'arc') { const sw = sweep(e.a0, e.a1); return { t: 'arc', c: [...e.c], r: e.r, a0: normAng(e.a0 + a * sw), a1: normAng(e.a0 + b * sw) }; }
    if (e.t === 'circle') return { t: 'arc', c: [...e.c], r: e.r, a0: normAng(a), a1: normAng(b) };
    return plineSlice(e, a, b);
  };
  // znikające kawałki — do podglądu (całe usunięte przedziały)
  const gone = [...hit].map(i => slice(iv[i][0], iv[i][1])).filter(Boolean);
  return { keep: runs.map(([a, b]) => slice(a, b)).filter(Boolean), gone };
}
// Przycinanie / wydłużanie kilku kawałków jednym przeciągnięciem: hits — [{ e, p }] (element i punkt, w którym ślad
// go przeciął; ten sam element może być kilka razy), others — wszystkie elementy tnące (geometria sprzed zmian).
// mode: 'auto' (jak jedno kliknięcie), 'trim', 'extend'. Wynik: [{ id, kind: 'trim', replace, gone? } | { id, kind: 'extend', set }].
export function trimMany(hits, others, mode = 'auto', endTol = 0) {
  const byId = new Map();
  for (const h of hits) { if (!byId.has(h.e.id)) byId.set(h.e.id, { e: h.e, ps: [] }); byId.get(h.e.id).ps.push(h.p); }
  const out = [];
  for (const { e, ps } of byId.values()) {
    const cut = others.filter(o => o.id !== e.id);
    if (mode === 'extend' || (mode === 'auto' && ps.length === 1)) {
      const r = mode === 'extend' ? (() => { const x = extendAt(e, ps[0], cut); return x ? { kind: 'extend', set: x } : null; })() : trimOrExtend(e, ps[0], cut, endTol);
      if (r) out.push({ id: e.id, ...r });
      continue;
    }
    // kilka punktów na jednym elemencie: znikają wszystkie kawałki (między przecięciami), w które trafił ślad
    const r = trimPieces(e, ps, cut);
    if (r) out.push({ id: e.id, kind: 'trim', replace: r.keep, gone: r.gone });
  }
  return out;
}
/* ---------- uchwyty zaznaczonych elementów ---------- */
// gripsOf(e) → [{ k, p }]: k mówi, co uchwyt robi; gripMove(e, k, p) → pola elementu po przeciągnięciu uchwytu do p.
//   linia: końce i środek (przesuwa całą) · polilinia: wierzchołki · okrąg: środek (przesuwa) i cztery kwadranty (promień)
//   łuk: końce (zmieniają kąt), środek łuku (promień), środek okręgu (przesuwa) · tekst: punkt wstawienia
//   wymiar: dwa mierzone punkty i położenie linii wymiarowej · okno na arkuszu: dwa narożniki
export function gripsOf(e) {
  const g = (k, p) => ({ k, p: [p[0], p[1]] });
  switch (e.t) {
    case 'line': return [g('a', e.a), g('b', e.b), g('mv', V.lerp(e.a, e.b, 0.5))];
    case 'pline': return e.pts.map((q, i) => g('v' + i, q));
    case 'circle': return [g('mv', e.c), ...[0, 1, 2, 3].map(i => g('r', V.polar(e.c, e.r, i * Math.PI / 2)))];
    case 'arc': return [g('a0', arcStart(e)), g('a1', arcEnd(e)), g('r', arcMid(e)), g('mv', e.c)];
    case 'text': return [g('mv', e.p)];
    case 'dim': return [g('a', e.a), g('b', e.b), g('o', dimGeom(e).mid)];
    case 'adim': return [g('o', e.o)];
    case 'vp': return [g('a', e.a), g('b', e.b)];
    case 'ins': return [g('mv', e.p)];
  }
  return [];
}
// Uchwyty leżące w tym samym miejscu (np. wspólny koniec dwóch osobnych kresek): grips — [{ e, k, p }] uchwyty zaznaczonych elementów.
export function sharedGrips(grips, p) { return grips.filter(g => V.dist(g.p, p) < 1e-9); }
// Przeciągnięcie kilku uchwytów naraz z punktu from do p. Wynik: [{ id, patch }] — po jednym na element.
export function gripMoveMany(list, p, from) {
  const by = new Map();
  for (const { e, k } of list) {
    const cur = by.get(e.id) || { e, patch: {} };
    const pm = gripMove({ ...e, ...cur.patch }, k, p, from); if (pm) Object.assign(cur.patch, pm);
    by.set(e.id, cur);
  }
  return [...by.values()].filter(x => Object.keys(x.patch).length).map(x => ({ id: x.e.id, patch: x.patch }));
}
export function gripMove(e, k, p, from) {
  p = [p[0], p[1]];
  if (k === 'mv') { const o = from || gripsOf(e).find(x => x.k === 'mv').p; return moved(e, V.sub(p, o)); }
  if (k[0] === 'v' && e.t === 'pline') { const i = +k.slice(1); return { pts: e.pts.map((q, j) => j === i ? (q[2] ? [...p, q[2]] : p) : q) }; }
  if (k === 'r') { const r = V.dist(e.c, p); return r > EPS ? { r } : null; }
  if (k === 'a0' || k === 'a1') {
    if (V.dist(e.c, p) < EPS) return null;
    const a = angOf(e.c, p), other = k === 'a0' ? e.a1 : e.a0;
    return Math.abs(Math.sin((a - other) / 2)) < 1e-9 ? null : { [k]: a };   // końce w jednym miejscu — łuk zniknąłby albo stał się okręgiem
  }
  if (k === 'o') return { o: p };
  if (k === 'a' || k === 'b') { if (e.t === 'line' && V.dist(p, k === 'a' ? e.b : e.a) < EPS) return null; return { [k]: p }; }
  return null;
}
export { geomOf };
