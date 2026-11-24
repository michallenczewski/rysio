// Przyciąganie i kierunki. Działa na samych danych (bez okna), więc sprawdziany mogą go wołać bezpośrednio.
//   Punkty: koniec, środek, przecięcie, prostopadle, środek okręgu, styczna, najbliższy.
//   Kierunki (od punktu bazowego narzędzia): poziom, pion, wzdłuż i prostopadle do linii, przy których był kursor;
//   śledzenie: poziom i pion od punktów, przy których był kursor — i ich przecięcia.
// Tolerancja przychodzi w metrach (kilka pikseli przeliczone przez widok), więc działa tak samo przy każdym powiększeniu.
import { _t } from './i18n.js';
import { V, bbox, boxGrow, boxHit, endpoints, midpoints, partsOf, nearestOn, intersect, perpFeet, tangentPts, closestOnSeg, lineCircle, onArcAngle, angOf } from './geom.js';

export const SNAP = {
  end: { label: _t('Koniec'), pri: 0 },
  center: { label: _t('Środek okręgu'), pri: 1 },
  int: { label: _t('Przecięcie'), pri: 2 },
  mid: { label: _t('Środek'), pri: 3 },
  perp: { label: _t('Prostopadle'), pri: 4 },
  tan: { label: _t('Styczna'), pri: 5 },
  track: { label: _t('Śledzenie'), pri: 6 },
  guideInt: { label: _t('Przecięcie z kierunkiem'), pri: 6 },
  grid: { label: _t('Siatka'), pri: 10 },
  guide: { label: '', pri: 8 },
  near: { label: _t('Najbliższy'), pri: 9 }
};
export const GUIDE_COLOR = { h: '#c0533f', v: '#4f8a46', par: '#b0489e', perp: '#b0489e', lock: '#b0489e' };
const GUIDE_NAME = { h: _t('Poziomo'), v: _t('Pionowo'), par: _t('Równolegle'), perp: _t('Prostopadle do linii'), lock: _t('Kierunek zablokowany') };

// odstęp siatki: potęga dziesięciu (1 cm, 10 cm, 1 m, 10 m…), tak żeby oczka miały na ekranie co najmniej ~14 px
export const gridStep = ppm => Math.pow(10, Math.ceil(Math.log10(14 / ppm)));

const projOnLine = (p, o, d) => V.add(o, V.mul(d, V.dot(V.sub(p, o), d)));

export class Snapper {
  constructor() { this.refPts = []; this.refSegs = []; this.enabled = true; }
  clearRefs() { this.refPts = []; this.refSegs = []; }
  // zapamiętuje punkt do śledzenia (najwyżej dwa ostatnie)
  addRefPt(p) { if (this.refPts.some(q => V.eq(q, p, 1e-9))) return; this.refPts.push([...p]); if (this.refPts.length > 2) this.refPts.shift(); }
  addRefSeg(a, b) { if (this.refSegs.some(s => V.eq(s[0], a, 1e-9) && V.eq(s[1], b, 1e-9))) return; this.refSegs.push([[...a], [...b]]); if (this.refSegs.length > 2) this.refSegs.shift(); }

  // p — kursor w metrach; o: { tol, ents, base, lockDir, ortho, noSnap, grid (odstęp widocznej siatki albo 0) }
  find(p, o) {
    const tol = o.tol, base = o.base || null;
    const out = { p: [...p], kind: null, label: '', guides: [], ent: null };
    // 1) punkty charakterystyczne elementów w pobliżu
    const cands = [];
    if (this.enabled && !o.noSnap) {
      const probe = [p[0] - tol, p[1] - tol, p[0] + tol, p[1] + tol];
      const near = [];
      for (const e of o.ents) {
        const b = bbox(e);
        const cen = (e.t === 'circle' || e.t === 'arc') ? e.c : null;
        if (!boxHit(boxGrow(b, tol), probe) && !(cen && V.dist(cen, p) <= tol)) continue;
        const n = nearestOn(e, p);
        if (n && n.d <= tol) near.push({ e, n });
        if (cen && V.dist(cen, p) <= tol) cands.push({ p: cen, kind: 'center', e });
        if (!n || n.d > tol) continue;
        for (const q of endpoints(e)) cands.push({ p: q, kind: 'end', e });
        for (const q of midpoints(e)) cands.push({ p: q, kind: 'mid', e });
        if (base) for (const q of perpFeet(e, base)) cands.push({ p: q, kind: 'perp', e });
        if (base) for (const q of tangentPts(e, base)) cands.push({ p: q, kind: 'tan', e });
        cands.push({ p: n.p, kind: 'near', e });
      }
      for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++)
        for (const q of intersect(near[i].e, near[j].e)) cands.push({ p: q, kind: 'int', e: near[i].e });
      // odcinek pod kursorem staje się odniesieniem dla kierunków „równolegle / prostopadle”
      const segHit = near.map(x => partsOf(x.e).find(q => q.k === 'seg' && closestOnSeg(p, q.a, q.b).p && V.dist(closestOnSeg(p, q.a, q.b).p, p) <= tol)).find(Boolean);
      if (segHit) this.addRefSeg(segHit.a, segHit.b);
      if (o.grid) { const g = o.grid, q = [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g]; if (V.dist(q, p) <= tol) cands.push({ p: q, kind: 'grid', e: null }); }
    }
    const pointHit = cands.filter(c => c.kind !== 'near' && V.dist(c.p, p) <= tol)
      .sort((a, b) => SNAP[a.kind].pri - SNAP[b.kind].pri || V.dist(a.p, p) - V.dist(b.p, p))[0];

    // 2) kierunki: od punktu bazowego i od punktów śledzenia
    const guides = [];
    if (base && o.lockDir) guides.push({ o: base, d: o.lockDir, kind: 'lock', from: 'base' });
    else if (base) {
      guides.push({ o: base, d: [1, 0], kind: 'h', from: 'base' }, { o: base, d: [0, 1], kind: 'v', from: 'base' });
      if (!o.ortho) for (const [a, b] of this.refSegs) {
        const d = V.norm(V.sub(b, a)); if (Math.abs(d[0]) > 0.9999 || Math.abs(d[1]) > 0.9999) continue;
        guides.push({ o: base, d, kind: 'par', from: 'base', ref: [a, b] }, { o: base, d: V.perp(d), kind: 'perp', from: 'base', ref: [a, b] });
      }
    }
    if (this.enabled && !o.noSnap && !o.lockDir) for (const r of this.refPts) {
      if (base && V.eq(r, base, 1e-9)) continue;
      guides.push({ o: r, d: [1, 0], kind: 'h', from: 'ref' }, { o: r, d: [0, 1], kind: 'v', from: 'ref' });
    }
    const gd = g => V.dist(projOnLine(p, g.o, g.d), p);

    // tryb „tylko kąty proste” i zablokowany kierunek: punkt zawsze leży na kierunku od bazy
    if (base && (o.ortho || o.lockDir)) {
      const opts = guides.filter(g => g.from === 'base');
      const g = opts.sort((a, b) => gd(a) - gd(b))[0];
      const src = pointHit ? pointHit.p : p;
      out.p = projOnLine(src, g.o, g.d);
      out.kind = pointHit ? pointHit.kind : 'guide'; out.label = pointHit ? SNAP[pointHit.kind].label : GUIDE_NAME[g.kind];
      out.guides = [g]; out.ent = pointHit ? pointHit.e : null;
      return out;
    }
    if (pointHit && SNAP[pointHit.kind].pri <= SNAP.tan.pri) {
      Object.assign(out, { p: [...pointHit.p], kind: pointHit.kind, label: SNAP[pointHit.kind].label, ent: pointHit.e });
      // kierunek, na którym ten punkt akurat leży, też pokazujemy
      out.guides = guides.filter(g => g.from === 'base' && V.dist(out.p, g.o) > 1e-9 && V.dist(projOnLine(out.p, g.o, g.d), out.p) < 1e-7);
      if (['end', 'mid', 'center', 'int'].includes(pointHit.kind)) this.addRefPt(pointHit.p);
      return out;
    }
    // 3) przecięcia dwóch kierunków w pobliżu kursora
    const close = guides.filter(g => gd(g) <= tol);
    let best = null;
    for (let i = 0; i < close.length; i++) for (let j = i + 1; j < close.length; j++) {
      const a = close[i], b = close[j];
      if (Math.abs(V.cross(a.d, b.d)) < 1e-9) continue;
      const x = lineX(a.o, a.d, b.o, b.d);
      if (x && V.dist(x, p) <= tol * 1.5 && (!best || V.dist(x, p) < V.dist(best.p, p))) best = { p: x, guides: [a, b] };
    }
    if (best) return Object.assign(out, { p: best.p, kind: 'track', label: SNAP.track.label, guides: best.guides });
    // 4) jeden kierunek: punkt na nim; jeśli kierunek przecina element pod kursorem — to przecięcie
    const g = close.sort((a, b) => gd(a) - gd(b))[0];
    if (g) {
      const q = projOnLine(p, g.o, g.d);
      let gi = null;
      for (const c of cands.filter(c => c.kind === 'near')) for (const x of guideEnt(g, c.e)) if (V.dist(x, p) <= tol && (!gi || V.dist(x, p) < V.dist(gi, p))) gi = x;
      if (gi) return Object.assign(out, { p: gi, kind: 'guideInt', label: SNAP.guideInt.label, guides: [g] });
      return Object.assign(out, { p: q, kind: 'guide', label: GUIDE_NAME[g.kind], guides: [g] });
    }
    // 5) najbliższy punkt na elemencie
    const nearest = cands.filter(c => c.kind === 'near').sort((a, b) => V.dist(a.p, p) - V.dist(b.p, p))[0];
    if (nearest) return Object.assign(out, { p: [...nearest.p], kind: 'near', label: SNAP.near.label, ent: nearest.e });
    // 6) węzeł siatki — najsłabszy: punkty elementów, kierunki i śledzenie mają pierwszeństwo
    const gridHit = cands.find(c => c.kind === 'grid');
    if (gridHit) return Object.assign(out, { p: [...gridHit.p], kind: 'grid', label: SNAP.grid.label });
    return out;
  }
}
// przecięcie dwóch prostych (punkt + kierunek)
export function lineX(o1, d1, o2, d2) {
  const den = V.cross(d1, d2); if (Math.abs(den) < 1e-12) return null;
  const t = V.cross(V.sub(o2, o1), d2) / den;
  return V.add(o1, V.mul(d1, t));
}
// przecięcia prostej kierunku z elementem
function guideEnt(g, e) {
  const a = g.o, b = V.add(g.o, g.d), out = [];
  for (const q of partsOf(e)) {
    if (q.k === 'seg') { const x = lineX(a, g.d, q.a, V.sub(q.b, q.a)); if (x) { const t = V.dot(V.sub(x, q.a), V.sub(q.b, q.a)) / V.dot(V.sub(q.b, q.a), V.sub(q.b, q.a)); if (t >= -1e-9 && t <= 1 + 1e-9) out.push(x); } }
    else for (const x of lineCircle(a, b, q.c, q.r, false)) if (q.full || onArcAngle(q.a0, q.a1, angOf(q.c, x))) out.push(x);
  }
  return out;
}
