// Wektorowy PDF arkuszy, bez zewnętrznych bibliotek. Rysuje te same polecenia pióra co ekran (sheet.js → draw.js),
// więc wydruk jest w skali: 1 mm papieru = 72/25,4 pt. Tekst — wbudowana czcionka Helvetica (każdy czytnik PDF ją ma);
// polskie litery przez własną tablicę znaków (/Differences z nazwami glifów Ą, ą, Ć…).
import { sheetSize } from './model.js';
import { sweep, LINE_GAP, ANNO, setAnno } from './geom.js';
import { drawSheet } from './sheet.js';

export const PT_PER_M = 72 / 0.0254;   // punkty PDF na metr papieru (≈ 2834,6)

// polskie litery spoza WinAnsi → kody 1–16 i nazwy glifów
const PL = 'ĄąĆćĘęŁłŃńŚśŹźŻż';
const PL_NAMES = ['Aogonek', 'aogonek', 'Cacute', 'cacute', 'Eogonek', 'eogonek', 'Lslash', 'lslash', 'Nacute', 'nacute', 'Sacute', 'sacute', 'Zacute', 'zacute', 'Zdotaccent', 'zdotaccent'];
const WIN = { 'ó': 243, 'Ó': 211, '°': 176, '–': 150, '—': 151, '„': 132, '”': 148, '“': 147, '×': 215, '²': 178, '³': 179, '·': 183, 'é': 233, 'ü': 252, 'ö': 246, 'ä': 228 };
// szerokości znaków Helvetiki (na 1000 jednostek wysokości czcionki)
const HW = { ' ': 278, '!': 278, '"': 355, '#': 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '=': 584, '?': 556, '@': 1015, '[': 278, ']': 278, '_': 556, '°': 400, '–': 556, '—': 1000, '×': 584, '²': 333, '³': 333, '·': 278, '„': 333, '”': 333, '“': 333,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500 };
for (let d = 0; d <= 9; d++) HW[String(d)] = 556;
const BASE = { 'Ą': 'A', 'ą': 'a', 'Ć': 'C', 'ć': 'c', 'Ę': 'E', 'ę': 'e', 'Ł': 'L', 'ł': 'l', 'Ń': 'N', 'ń': 'n', 'Ó': 'O', 'ó': 'o', 'Ś': 'S', 'ś': 's', 'Ź': 'Z', 'ź': 'z', 'Ż': 'Z', 'ż': 'z', 'é': 'e', 'ü': 'u', 'ö': 'o', 'ä': 'a' };
export const textWidth = (s, size) => [...s].reduce((w, ch) => w + (HW[ch] ?? HW[BASE[ch]] ?? 556), 0) * size / 1000;
// tekst → ciąg PDF w nawiasach (znaki spoza tablicy → „?”)
function pdfString(s) {
  let out = '';
  for (const ch of s) {
    const i = PL.indexOf(ch);
    let code = i >= 0 ? i + 1 : WIN[ch] ?? ch.charCodeAt(0);
    if (code > 255 || (code < 32 && i < 0)) code = 63;
    if (code === 40 || code === 41 || code === 92) out += '\\' + String.fromCharCode(code);
    else if (code < 32 || code > 126) out += '\\' + code.toString(8).padStart(3, '0');
    else out += String.fromCharCode(code);
  }
  return '(' + out + ')';
}
const n = v => (Math.abs(v) < 1e-9 ? 0 : +v.toFixed(3)).toString();
const rgb = hex => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '#000000') || [0, '00', '00', '00']; return [m[1], m[2], m[3]].map(h => n(parseInt(h, 16) / 255)).join(' '); };

// Pióro PDF: te same polecenia co CanvasPen; map — przeliczenie punktu przestrzeni na metry papieru
export class PdfPen {
  constructor(out, map = p => p, k = 1) { this.out = out; this.map = map; this.k = k; this.st = {}; }
  get ppm() { return PT_PER_M * this.k; }
  P(p) { const q = this.map(p); return n(q[0] * PT_PER_M) + ' ' + n(q[1] * PT_PER_M); }
  sub(map, k) { const m = this.map; const pen = new PdfPen(this.out, p => m(map(p)), this.k * k); pen.st = this.st; return pen; }
  style(s) { this.st = { width: 1, dash: [], color: '#000000', cap: 'butt', ...s }; }
  apply() {
    const s = this.st;
    this.out.push(`${n(s.width)} w ${s.cap === 'round' ? 1 : 0} J [${(s.dash || []).map(n).join(' ')}] 0 d ${rgb(s.color)} RG ${rgb(s.color)} rg`);
  }
  line(a, b) { this.apply(); this.out.push(`${this.P(a)} m ${this.P(b)} l S`); }
  poly(pts, closed) { if (pts.length < 2) return; this.apply(); this.out.push(pts.map((p, i) => this.P(p) + (i ? ' l' : ' m')).join(' ') + (closed ? ' s' : ' S')); }
  // łuk przeciwnie do wskazówek zegara jako krzywe Béziera (po najwyżej 90°)
  arc(c, r, a0, a1, full = false) {
    const sw = full ? Math.PI * 2 : sweep(a0, a1), parts = Math.max(1, Math.ceil(sw / (Math.PI / 2) - 1e-9)), d = sw / parts;
    const pt = a => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
    const kk = 4 / 3 * Math.tan(d / 4);
    let s = this.P(pt(a0)) + ' m';
    for (let i = 0; i < parts; i++) {
      const t0 = a0 + i * d, t1 = t0 + d, p0 = pt(t0), p3 = pt(t1);
      const p1 = [p0[0] - kk * r * Math.sin(t0), p0[1] + kk * r * Math.cos(t0)], p2 = [p3[0] + kk * r * Math.sin(t1), p3[1] - kk * r * Math.cos(t1)];
      s += ` ${this.P(p1)} ${this.P(p2)} ${this.P(p3)} c`;
    }
    this.apply(); this.out.push(s + ' S');
  }
  circle(c, r) { this.arc(c, r, 0, 0, true); }
  // p — początek linii bazowej, h — wysokość wielkich liter w jednostkach przestrzeni (Helvetica: 0,718 wysokości czcionki)
  text(p, str, h, align = 'l', rot = 0) {
    const size = h * this.k * PT_PER_M / 0.718; if (size < 0.5) return;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    String(str).split('\n').forEach((line, i) => {
      const w = textWidth(line, size), dx = align === 'c' ? -w / 2 : align === 'r' ? -w : 0, dy = -i * LINE_GAP * h * this.k * PT_PER_M;
      const o = this.map(p), x = o[0] * PT_PER_M + dx * cs - dy * sn, y = o[1] * PT_PER_M + dx * sn + dy * cs;
      this.out.push(`BT /F1 ${n(size)} Tf ${rgb(this.st.color)} rg ${n(cs)} ${n(sn)} ${n(-sn)} ${n(cs)} ${n(x)} ${n(y)} Tm ${pdfString(line)} Tj ET`);
    });
  }
  clip(box, fn) {
    const a = this.map([box[0], box[1]]), b = this.map([box[2], box[3]]);
    this.out.push(`q ${n(a[0] * PT_PER_M)} ${n(a[1] * PT_PER_M)} ${n((b[0] - a[0]) * PT_PER_M)} ${n((b[1] - a[1]) * PT_PER_M)} re W n`);
    fn(); this.out.push('Q');
  }
}

// PDF z listą arkuszy (każdy na osobnej stronie, w swoim formacie). o: { mono, fmtModel, fmtSheet }
export function makePdf(doc, sheets, o = {}) {
  const keepAnno = ANNO;   // rysowanie okien zmienia ANNO — na koniec wraca, jak było
  const objs = [];   // treści obiektów (numer = indeks + 1)
  const add = s => { objs.push(s); return objs.length; };
  const catalog = add(null), pages = add(null);
  const font = add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [1 ${PL_NAMES.map(g => '/' + g).join(' ')}] >> >>`);
  const kids = [];
  for (const sh of sheets) {
    const [W, H] = sheetSize(sh), out = [];
    const pen = new PdfPen(out);
    drawSheet(pen, doc, sh, { exact: true, mono: o.mono !== false, ink: '#000000', muted: '#555555', fmtModel: o.fmtModel, fmtSheet: o.fmtSheet });
    const body = out.join('\n');
    const content = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${n(W * PT_PER_M)} ${n(H * PT_PER_M)}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
  objs[pages - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let s = '%PDF-1.4\n%âãÏÓ\n';
  const offs = [];
  objs.forEach((body, i) => { offs.push(s.length); s += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(x => String(x).padStart(10, '0') + ' 00000 n \n').join('');
  s += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Producer (Rysio) >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 255;
  setAnno(keepAnno);
  return bytes;
}
