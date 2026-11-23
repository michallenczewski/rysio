// Płótno rysunku: przesuwanie, przybliżanie, przeliczanie metry ↔ piksele i rysowanie całości z nakładkami.
import { V, bbox, boxHit, boxUnion } from './geom.js';
import { isShown } from './model.js';
import { CanvasPen, drawEnt, traceEnt, strokePx } from './draw.js';
import { GUIDE_COLOR } from './snap.js';

export class View {
  constructor(el) {
    this.el = el;
    this.canvas = document.createElement('canvas');
    el.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.cx = 0; this.cy = 0; this.ppm = 60;   // środek widoku (m) i piksele na metr
    this.w = 1; this.h = 1; this.dpr = 1;
    this.theme = { bg: '#fff', ink: '#1a1a19', sel: '#3f63a8', snap: '#b0489e', muted: '#8f8e89' };
    this.needs = true;
    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
  }
  resize() {
    const r = this.el.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px';
    this.needs = true; this.onResize?.();
  }
  toScreen(p) { return [(p[0] - this.cx) * this.ppm + this.w / 2, (this.cy - p[1]) * this.ppm + this.h / 2]; }
  toModel(x, y) { return [(x - this.w / 2) / this.ppm + this.cx, this.cy - (y - this.h / 2) / this.ppm]; }
  // widoczny obszar w metrach
  get rect() { const a = this.toModel(0, this.h), b = this.toModel(this.w, 0); return [a[0], a[1], b[0], b[1]]; }
  zoomAt(x, y, k) {
    const p = this.toModel(x, y);
    this.ppm = Math.max(1e-3, Math.min(1e6, this.ppm * k));
    const q = this.toModel(x, y);
    this.cx += p[0] - q[0]; this.cy += p[1] - q[1]; this.needs = true;
  }
  pan(dx, dy) { this.cx -= dx / this.ppm; this.cy += dy / this.ppm; this.needs = true; }
  // pokaż prostokąt [x0,y0,x1,y1] z marginesem
  fit(b, margin = 40) {
    if (!b || !isFinite(b[0])) { this.cx = 0; this.cy = 0; this.ppm = 60; this.needs = true; return; }
    const w = Math.max(b[2] - b[0], 1e-3), h = Math.max(b[3] - b[1], 1e-3);
    this.ppm = Math.min((this.w - 2 * margin) / w, (this.h - 2 * margin) / h);
    this.cx = (b[0] + b[2]) / 2; this.cy = (b[1] + b[3]) / 2; this.needs = true;
  }
  fitDoc(doc) { let b = null; for (const e of doc.ents) if (isShown(doc, e)) b = boxUnion(b, bbox(e)); this.fit(b); }

  // s: { doc, sel:Set, hover, preview:[ent], previewDoc, guides, snap, box, thin, marks:[p], path }
  render(s) {
    const c = this.ctx, t = this.theme, d = s.doc;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalAlpha = 1; c.fillStyle = t.bg; c.fillRect(0, 0, this.w, this.h);
    const pen = new CanvasPen(c, this), vr = this.rect, o = { ppm: this.ppm, ink: t.ink, thin: s.thin };
    // 1) rysunek
    for (const e of d.ents) {
      if (!isShown(d, e) || !boxHit(bbox(e), vr)) continue;
      if (s.sel.has(e.id)) continue;
      drawEnt(pen, d, e, o);
    }
    // 2) zaznaczenie i element pod kursorem
    for (const e of d.ents) {
      if (!s.sel.has(e.id) || !isShown(d, e)) continue;
      pen.style({ width: strokePx(0.5, this.ppm, d.scale, s.thin) + 5, color: t.sel, alpha: 0.18, cap: 'round' }); traceEnt(pen, e);
      drawEnt(pen, d, e, { ...o, color: t.sel });
    }
    for (const h of [].concat(s.hover || [])) { pen.style({ width: 6, color: s.hoverColor || t.sel, alpha: 0.18, cap: 'round' }); traceEnt(pen, h); }
    // 3) kierunki
    for (const g of s.guides || []) {
      const far = 1e5 / Math.max(this.ppm, 1e-6) + 1e4;
      pen.style({ width: 1, dash: g.from === 'ref' ? [2, 5] : [5, 4], color: GUIDE_COLOR[g.kind] || t.snap, alpha: 0.85 });
      pen.line(V.sub(g.o, V.mul(g.d, far)), V.add(g.o, V.mul(g.d, far)));
    }
    // punkty śledzenia
    for (const p of s.marks || []) { const q = this.toScreen(p); c.globalAlpha = 0.9; c.strokeStyle = t.snap; c.lineWidth = 1; c.setLineDash([]); c.beginPath(); c.moveTo(q[0] - 4, q[1]); c.lineTo(q[0] + 4, q[1]); c.moveTo(q[0], q[1] - 4); c.lineTo(q[0], q[1] + 4); c.stroke(); }
    // 4) podgląd narzędzia
    for (const e of s.preview || []) drawEnt(pen, s.previewDoc || d, e, { ...o, alpha: e._ghost ? 0.45 : 1 });
    if (s.path) { pen.style({ width: 9, color: t.snap, alpha: 0.3, cap: 'round' }); this.ctx.lineJoin = 'round'; pen.poly(s.path, false); }
    // 5) ramka zaznaczania: w prawo ciągła (całe w ramce), w lewo przerywana (dotknięte)
    if (s.box) {
      const [a, b] = [this.toScreen(s.box.a), this.toScreen(s.box.b)], cross = s.box.b[0] < s.box.a[0];
      c.globalAlpha = 1; c.setLineDash(cross ? [5, 4] : []); c.lineWidth = 1; c.strokeStyle = t.sel;
      c.fillStyle = cross ? 'rgba(79,138,70,.08)' : 'rgba(63,99,168,.08)';
      c.beginPath(); c.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]); c.fill(); c.stroke();
    }
    // 6) znaczek przyciągania
    if (s.snap && s.snap.kind && s.snap.kind !== 'guide') drawMarker(c, this.toScreen(s.snap.p), s.snap.kind, t.snap);
    c.globalAlpha = 1; c.setLineDash([]);
    this.needs = false;
  }
}

// znaczki przyciągania: kwadrat (koniec), trójkąt (środek), krzyżyk (przecięcie), kąt prosty (prostopadle),
// kółko z krzyżykiem (środek okręgu), kółko ze styczną (styczna), klepsydra (najbliższy)
function drawMarker(c, [x, y], kind, col) {
  c.save(); c.globalAlpha = 1; c.setLineDash([]); c.strokeStyle = col; c.lineWidth = 1.6; c.lineJoin = 'miter'; c.beginPath();
  const r = 5;
  switch (kind) {
    case 'end': c.rect(x - r, y - r, 2 * r, 2 * r); break;
    case 'mid': c.moveTo(x, y - r - 1); c.lineTo(x + r + 1, y + r); c.lineTo(x - r - 1, y + r); c.closePath(); break;
    case 'int': case 'guideInt': case 'track': c.moveTo(x - r, y - r); c.lineTo(x + r, y + r); c.moveTo(x + r, y - r); c.lineTo(x - r, y + r); break;
    case 'perp': c.moveTo(x - r, y - r); c.lineTo(x - r, y + r); c.lineTo(x + r, y + r); c.moveTo(x - r, y); c.lineTo(x, y); c.lineTo(x, y + r); break;
    case 'center': c.arc(x, y, r, 0, Math.PI * 2); c.moveTo(x - 2, y); c.lineTo(x + 2, y); c.moveTo(x, y - 2); c.lineTo(x, y + 2); break;
    case 'tan': c.arc(x, y + 1, r - 1, 0, Math.PI * 2); c.moveTo(x - r - 2, y - r + 1); c.lineTo(x + r + 2, y - r + 1); break;
    case 'near': c.moveTo(x - r, y - r); c.lineTo(x + r, y - r); c.lineTo(x - r, y + r); c.lineTo(x + r, y + r); c.closePath(); break;
  }
  c.stroke(); c.restore();
}
