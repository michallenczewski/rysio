// Rysowanie elementów przez „pióro”. Pióro ekranowe (CanvasPen) rysuje na płótnie; w etapie 2 dojdzie pióro PDF
// z tymi samymi poleceniami — dzięki temu wydruk wygląda jak ekran. Grubości i wzory kresek są w milimetrach papieru.
import { LTYPES, strokeOf } from './model.js';
import { sweep } from './geom.js';

export const PX_PER_MM = 96 / 25.4;   // ekran przy 100%: 1 mm ≈ 3,78 px

// ile pikseli ekranu wypada na milimetr papieru przy danym powiększeniu (px na metr) i skali 1:scale
export const pxPerPaperMM = (pxPerM, scale) => pxPerM * scale / 1000;
// grubość kreski na ekranie: jak na papierze, ale nie cieńsza niż 0,6 px i nie grubsza niż 3× rzeczywista przy 96 dpi
export function strokePx(mm, pxPerM, scale, thin = false) {
  if (thin) return 1;
  return Math.max(0.6, Math.min(mm * pxPerPaperMM(pxPerM, scale), mm * PX_PER_MM * 3));
}
// wzór kresek w pikselach; przy oddaleniu nie gęstnieje poniżej czytelności, przy zbliżeniu nie rośnie bez końca
export function dashPx(lt, pxPerM, scale) {
  const pat = (LTYPES[lt] || LTYPES.solid).dash; if (!pat.length) return [];
  const f = Math.max(1.6, Math.min(pxPerPaperMM(pxPerM, scale), PX_PER_MM * 3));
  return pat.map(v => Math.max(v * f, 0.1));
}
// kolory warstw bliskie czerni rysujemy kolorem „tuszu” (w trybie ciemnym jasnym)
export function inkColor(color, ink) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color || ''); if (!m) return ink;
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.2 ? ink : color;
}

// Pióro ekranowe: współrzędne modelu (metry, Y w górę) → piksele płótna przez widok.
export class CanvasPen {
  constructor(ctx, view) { this.c = ctx; this.v = view; }
  style({ width = 1, dash = [], color = '#000', alpha = 1, cap = 'butt' }) {
    const c = this.c; c.lineWidth = width; c.setLineDash(dash); c.lineDashOffset = 0; c.strokeStyle = color; c.globalAlpha = alpha; c.lineCap = cap; c.lineJoin = 'miter';
  }
  path(fn) { const c = this.c; c.beginPath(); fn(); c.stroke(); }
  line(a, b) { const A = this.v.toScreen(a), B = this.v.toScreen(b); this.path(() => { this.c.moveTo(A[0], A[1]); this.c.lineTo(B[0], B[1]); }); }
  poly(pts, closed) {
    if (pts.length < 2) return;
    this.path(() => { pts.forEach((p, i) => { const s = this.v.toScreen(p); i ? this.c.lineTo(s[0], s[1]) : this.c.moveTo(s[0], s[1]); }); if (closed) this.c.closePath(); });
  }
  // łuk przeciwnie do wskazówek zegara od a0 do a1 (oś Y modelu jest odwrócona względem ekranu)
  arc(c, r, a0, a1) { const s = this.v.toScreen(c), R = r * this.v.ppm; this.path(() => this.c.arc(s[0], s[1], R, -a0, -(a0 + sweep(a0, a1)), true)); }
  circle(c, r) { const s = this.v.toScreen(c); this.path(() => this.c.arc(s[0], s[1], r * this.v.ppm, 0, Math.PI * 2)); }
}

// sam kształt elementu (styl ustawia wołający)
export function traceEnt(pen, e) {
  if (e.t === 'line') pen.line(e.a, e.b);
  else if (e.t === 'pline') pen.poly(e.pts, e.closed);
  else if (e.t === 'circle') pen.circle(e.c, e.r);
  else if (e.t === 'arc') pen.arc(e.c, e.r, e.a0, e.a1);
}
// element w jego kresce
export function drawEnt(pen, doc, e, o) {
  const st = strokeOf(doc, e);
  pen.style({ width: strokePx(st.w, o.ppm, doc.scale, o.thin), dash: dashPx(st.lt, o.ppm, doc.scale), color: o.color || inkColor(st.color, o.ink), alpha: o.alpha ?? 1, cap: st.lt === 'dot' ? 'round' : 'butt' });
  traceEnt(pen, e);
}
