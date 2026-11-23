// Rysowanie elementów przez „pióro”. CanvasPen rysuje na płótnie, PdfPen (pdf.js) zapisuje wektorowy PDF — te same
// polecenia, więc wydruk wygląda jak ekran. Grubości, wzory kresek i wysokości tekstu są w milimetrach papieru.
import { LTYPES, strokeOf } from './model.js';
import { V, sweep, dimGeom, textBox, LINE_GAP, DIM_H, DIM_TICK, DIM_EXT } from './geom.js';

export const PX_PER_MM = 96 / 25.4;   // ekran przy 100%: 1 mm ≈ 3,78 px

// ile jednostek pióra (pikseli albo punktów PDF) wypada na milimetr papieru przy danym powiększeniu i skali 1:scale
export const pxPerPaperMM = (pxPerM, scale) => pxPerM * scale / 1000;
// grubość kreski na ekranie: jak na papierze, ale nie cieńsza niż 0,6 px i nie grubsza niż 3× rzeczywista przy 96 dpi
export function strokePx(mm, pxPerM, scale, thin = false) {
  if (thin) return 1;
  return Math.max(0.6, Math.min(mm * pxPerPaperMM(pxPerM, scale), mm * PX_PER_MM * 3));
}
// wzór kresek; przy oddaleniu nie gęstnieje poniżej czytelności, przy zbliżeniu nie rośnie bez końca
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

// Pióro ekranowe: współrzędne przestrzeni (metry, Y w górę) → piksele płótna przez widok (v.toScreen, v.ppm).
export class CanvasPen {
  constructor(ctx, view) { this.c = ctx; this.v = view; }
  get ppm() { return this.v.ppm; }
  style({ width = 1, dash = [], color = '#000', alpha = 1, cap = 'butt' }) {
    const c = this.c; c.lineWidth = width; c.setLineDash(dash); c.lineDashOffset = 0; c.strokeStyle = color; c.fillStyle = color; c.globalAlpha = alpha; c.lineCap = cap; c.lineJoin = 'miter';
  }
  path(fn) { const c = this.c; c.beginPath(); fn(); c.stroke(); }
  line(a, b) { const A = this.v.toScreen(a), B = this.v.toScreen(b); this.path(() => { this.c.moveTo(A[0], A[1]); this.c.lineTo(B[0], B[1]); }); }
  poly(pts, closed) {
    if (pts.length < 2) return;
    this.path(() => { pts.forEach((p, i) => { const s = this.v.toScreen(p); i ? this.c.lineTo(s[0], s[1]) : this.c.moveTo(s[0], s[1]); }); if (closed) this.c.closePath(); });
  }
  // łuk przeciwnie do wskazówek zegara od a0 do a1 (oś Y przestrzeni jest odwrócona względem ekranu)
  arc(c, r, a0, a1) { const s = this.v.toScreen(c), R = r * this.v.ppm; this.path(() => this.c.arc(s[0], s[1], R, -a0, -(a0 + sweep(a0, a1)), true)); }
  circle(c, r) { const s = this.v.toScreen(c); this.path(() => this.c.arc(s[0], s[1], r * this.v.ppm, 0, Math.PI * 2)); }
  // tekst: p — początek linii bazowej, h — wysokość wielkich liter w jednostkach przestrzeni, rot — obrót w radianach
  text(p, str, h, align = 'l', rot = 0) {
    const c = this.c, s = this.v.toScreen(p), px = h * this.v.ppm / 0.72;
    if (px < 0.8) return;
    c.save(); c.translate(s[0], s[1]); c.rotate(-rot);
    c.font = `${px}px Helvetica, Arial, sans-serif`; c.textAlign = align === 'c' ? 'center' : align === 'r' ? 'right' : 'left'; c.textBaseline = 'alphabetic';
    String(str).split('\n').forEach((l, i) => c.fillText(l, 0, i * LINE_GAP * h * this.v.ppm));
    c.restore();
  }
  // pióro dla innej przestrzeni (okno arkusza): map — punkt tej przestrzeni → punkt bieżącej, k — skala długości
  sub(map, k) { const v = this.v; return new CanvasPen(this.c, { toScreen: p => v.toScreen(map(p)), ppm: v.ppm * k }); }
  clip(box, fn) {   // box w jednostkach przestrzeni
    const a = this.v.toScreen([box[0], box[3]]), b = this.v.toScreen([box[2], box[1]]), c = this.c;
    c.save(); c.beginPath(); c.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]); c.clip(); fn(); c.restore();
  }
}

// sam kształt elementu (styl ustawia wołający); tekst i wymiar rysuje drawEnt
export function traceEnt(pen, e) {
  if (e.t === 'line') pen.line(e.a, e.b);
  else if (e.t === 'pline') pen.poly(e.pts, e.closed);
  else if (e.t === 'circle') pen.circle(e.c, e.r);
  else if (e.t === 'arc') pen.arc(e.c, e.r, e.a0, e.a1);
  else if (e.t === 'vp') pen.poly([e.a, [e.b[0], e.a[1]], e.b, [e.a[0], e.b[1]]], true);
  else if (e.t === 'dim') { const g = dimGeom(e); pen.line(g.d1, g.d2); }
  else if (e.t === 'text') { const b = textBox(e); pen.poly([[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], true); }
}

// Element w jego kresce. o: { ppm, scale (skala przestrzeni), ink, thin, exact (PDF: bez ograniczeń grubości),
// color (wymuszony kolor), mono (czarno-białe), fmt (liczba wymiaru → tekst), alpha }
export function drawEnt(pen, doc, e, o) {
  if (e.t === 'vp') return;   // okno rysuje widok (zawartość i ramkę osobno)
  const st = strokeOf(doc, e), k = o.scale / 1000;   // metry przestrzeni na milimetr papieru
  const col = o.color || (o.mono ? '#000000' : inkColor(st.color, o.ink));
  const f = pxPerPaperMM(pen.ppm, o.scale);
  const width = mm => o.exact ? mm * f : strokePx(mm, pen.ppm, o.scale, o.thin);
  const dash = lt => o.exact ? (LTYPES[lt] || LTYPES.solid).dash.map(v => v * f) : dashPx(lt, pen.ppm, o.scale);
  if (e.t === 'text') { pen.style({ color: col, alpha: o.alpha ?? 1 }); pen.text(e.p, e.s, e.h * k, e.align || 'l', e.rot || 0); return; }
  if (e.t === 'dim') {
    const g = dimGeom(e), u = V.norm(V.sub(g.d2, g.d1)), dir = (u[0] || u[1]) ? u : [1, 0];
    pen.style({ width: width(st.w), color: col, alpha: o.alpha ?? 1 });
    pen.line(V.sub(g.d1, V.mul(dir, DIM_EXT * k)), V.add(g.d2, V.mul(dir, DIM_EXT * k)));
    for (const [p, d] of [[e.a, g.d1], [e.b, g.d2]]) {
      const v = V.sub(d, p), L = V.len(v); if (L < 1e-9) continue;
      const n = V.mul(v, 1 / L), gap = Math.min(1 * k, L / 3);
      pen.line(V.add(p, V.mul(n, gap)), V.add(d, V.mul(n, DIM_EXT * k)));
    }
    // ukośne kreseczki: pod 45° do linii wymiarowej
    const t = V.mul(V.norm(V.add(dir, V.perp(dir))), DIM_TICK * k);
    pen.style({ width: width(Math.max(0.35, st.w * 2)), color: col, alpha: o.alpha ?? 1 });
    for (const d of [g.d1, g.d2]) pen.line(V.sub(d, t), V.add(d, t));
    // liczba nad linią, czytana z dołu albo z prawej
    let ang = Math.atan2(dir[1], dir[0]); if (ang > Math.PI / 2 + 1e-6 || ang <= -Math.PI / 2 + 1e-6) ang += Math.PI;
    const up = [-Math.sin(ang), Math.cos(ang)];
    const h = (e.h || DIM_H) * k;
    pen.style({ color: col, alpha: o.alpha ?? 1 });
    pen.text(V.add(g.mid, V.mul(up, 1 * k)), (o.fmt || (v => v.toFixed(2)))(g.value), h, 'c', ang);
    return;
  }
  pen.style({ width: width(st.w), dash: dash(st.lt), color: col, alpha: o.alpha ?? 1, cap: st.lt === 'dot' ? 'round' : 'butt' });
  traceEnt(pen, e);
}
