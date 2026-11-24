// DXF: odczyt do elementów Rysia i zapis rysunku (modelu) do DXF R12.
// Rozkład pliku na sekcje, tabela warstw, bloki i wstawienia — na wzór czytnika podkładu z Modo 0.4.2 (renderer/dxf.js),
// ale tu wynikiem są prawdziwe elementy (linie, polilinie z łukami, okręgi, łuki, teksty), a nie odcinki podkładu.
//   Bloki i wymiary są rozbijane na zwykłe elementy (Rysio nie ma jeszcze bloków); kreskowania na razie pomijamy.
//   Elipsy i splajny zamieniają się w polilinie. Współrzędne zostają takie jak w pliku (w metrach).
import { _t } from './i18n.js';
import { newDoc, fixDoc, WEIGHTS, LTYPES } from './model.js';
import { V, dimGeom, LINE_GAP, DIM_EXT, DIM_TICK, DIM_H } from './geom.js';

const TAU = Math.PI * 2;
const UNIT_M = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 14: 0.1 };
const UNIT_NAME = { 4: 'mm', 5: 'cm', 6: 'm' };

/* ---------- barwy AutoCAD (ACI) ---------- */
const ACI_BASE = { 1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: '#1a1a19', 8: '#808080', 9: '#c0c0c0' };
export function aciColor(i) {
  i = Math.abs(i | 0);
  if (ACI_BASE[i]) return ACI_BASE[i];
  if (i >= 250 && i <= 255) { const g = Math.round(51 + (i - 250) * 40.8); return hex([g, g, g]); }
  if (i < 10 || i > 249) return '#1a1a19';
  const h = (Math.floor(i / 10) - 1) * 15, row = i % 10;
  const v = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3][row], s = row % 2 ? 0.5 : 1;
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return hex([f(5), f(3), f(1)].map(x => Math.round(x * 255)));
}
const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
const rgbOf = h => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h || ''); return m ? [1, 2, 3].map(k => parseInt(m[k], 16)) : [26, 26, 25]; };
export function nearestAci(color) {
  const c = rgbOf(color);
  if (c[0] + c[1] + c[2] < 120) return 7;   // czerń „tuszu” → biała/czarna AutoCAD-a
  let best = 7, bd = Infinity;
  for (let i = 1; i <= 255; i++) { if (i === 7) continue; const q = rgbOf(aciColor(i)), d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}

/* ---------- rodzaje i grubości linii ---------- */
const LT_OUT = { solid: 'CONTINUOUS', dash: 'DASHED', center: 'CENTER', dot: 'DOT' };
function ltIn(name) {
  if (!name) return null;
  const n = name.toUpperCase();
  if (n === 'BYLAYER' || n === 'BYBLOCK') return null;
  if (n === 'CONTINUOUS') return 'solid';
  if (/CENTER|AXIS|DASHDOT|DASH_DOT|OSI|PHANTOM|BORDER/.test(n)) return 'center';
  if (/DASH|HIDDEN|KRESK/.test(n)) return 'dash';
  if (/DOT|PUNKT/.test(n)) return 'dot';
  return 'solid';
}
function wIn(v) {   // 370: setne części milimetra; ujemne — „jak warstwa / blok / domyślna”
  if (!(v > 0)) return null;
  const mm = v / 100; return WEIGHTS.reduce((a, b) => Math.abs(b - mm) < Math.abs(a - mm) ? b : a);
}

/* ---------- tekst: kody formatowania AutoCAD-a ---------- */
function cleanText(s, mtext) {
  s = s.replace(/\\U\+([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/%%[cC]/g, '⌀').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[uUoOkK]/g, '').replace(/%%%/g, '%');
  if (!mtext) return s;
  return s.replace(/\\P/g, '\n').replace(/\\~/g, ' ')
    .replace(/\\[ACcFfHhQTWp][^;\\{}]*;/g, '')
    .replace(/\\S([^;]*)[#^/]([^;]*);/g, '$1/$2')
    .replace(/\\[LlOoKk]/g, '')
    .replace(/\\([\\{}])/g, '$1').replace(/[{}]/g, '');
}

/* ---------- przekształcenia płaskie: M = [a, b, c, d, e, f] → x' = a·x + c·y + e, y' = b·x + d·y + f ---------- */
const mul = (M, N) => [M[0] * N[0] + M[2] * N[1], M[1] * N[0] + M[3] * N[1], M[0] * N[2] + M[2] * N[3], M[1] * N[2] + M[3] * N[3], M[0] * N[4] + M[2] * N[5] + M[4], M[1] * N[4] + M[3] * N[5] + M[5]];
const tp = (M, p) => [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]];
const tv = (M, v) => [M[0] * v[0] + M[2] * v[1], M[1] * v[0] + M[3] * v[1]];
const angOfV = v => { const a = Math.atan2(v[1], v[0]); return a < 0 ? a + TAU : a; };
const scaleX = M => Math.hypot(M[0], M[1]), scaleY = M => Math.hypot(M[2], M[3]);
const det = M => M[0] * M[3] - M[1] * M[2];
const similar = M => { const sx = scaleX(M), sy = scaleY(M); return Math.abs(sx - sy) <= 1e-9 * Math.max(sx, sy) && Math.abs(M[0] * M[2] + M[1] * M[3]) <= 1e-9 * sx * sy; };
const r6 = v => Math.round(v * 1e9) / 1e9;
const P = (M, p) => tp(M, p).map(r6);

function arcPts(c, r, a0, a1) {
  let sw = a1 - a0; while (sw <= 1e-12) sw += TAU;
  const n = Math.max(8, Math.ceil(sw / (Math.PI / 36)));
  const out = []; for (let k = 0; k <= n; k++) { const a = a0 + sw * k / n; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
  return out;
}
function bulgePts(p, q, b) {
  if (!b) return [q];
  const th = 4 * Math.atan(b), dx = q[0] - p[0], dy = q[1] - p[1], ch = Math.hypot(dx, dy); if (ch < 1e-12) return [q];
  const s = (ch / 2) / Math.tan(th / 2), cx = (p[0] + q[0]) / 2 - dy / ch * s, cy = (p[1] + q[1]) / 2 + dx / ch * s;
  const r = Math.hypot(p[0] - cx, p[1] - cy), a0 = Math.atan2(p[1] - cy, p[0] - cx);
  const n = Math.max(2, Math.ceil(Math.abs(th) / (Math.PI / 36))), out = [];
  for (let k = 1; k < n; k++) { const a = a0 + th * k / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  out.push(q); return out;
}
// splajn B: wartość w punkcie t algorytmem de Boora (wagi pomijamy — w rysunkach architektonicznych prawie zawsze równe)
function splinePts(ctl, knots, deg, closed) {
  if (ctl.length < 2) return ctl;
  if (!knots.length || knots.length !== ctl.length + deg + 1) return ctl;
  const t0 = knots[deg], t1 = knots[ctl.length], n = Math.max(16, ctl.length * 8), out = [];
  for (let s = 0; s <= n; s++) {
    const t = Math.min(t0 + (t1 - t0) * s / n, t1 - 1e-12 * Math.abs(t1 || 1));
    let k = deg; while (k < ctl.length - 1 && !(t >= knots[k] && t < knots[k + 1])) k++;
    const d = []; for (let j = 0; j <= deg; j++) d.push([...ctl[k - deg + j]]);
    for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) {
      const i = k - deg + j, den = knots[i + deg - r + 1] - knots[i], a = den ? (t - knots[i]) / den : 0;
      d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1]];
    }
    out.push(d[deg]);
  }
  if (s1(out[0], out[out.length - 1]) && closed) out.pop();
  return out;
}
const s1 = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

/* ---------- czytanie ---------- */
function decode(input) {
  if (typeof input === 'string') return input;
  let text = new TextDecoder('utf-8').decode(input);
  if (text.startsWith('AutoCAD Binary DXF')) throw new Error(_t('Binarny DXF — zapisz plik jako DXF tekstowy (ASCII).'));
  if (text.includes('�')) text = new TextDecoder('windows-1250').decode(input);
  return text;
}
function pairsOf(text) {
  const lines = text.split(/\r?\n/), out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i], 10), v = lines[i + 1];
    const w = (code === 1 || code === 3 ? v : v.trim()).replace(/\\U\+([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
    out.push([code, w]);   // w tekstach spacje na początku są treścią; \U+XXXX to znak Unicode (także w nazwach warstw)
  }
  return out;
}

// input: tekst albo bajty DXF; o.scale — skala rysunku (wysokości tekstów Rysio trzyma w milimetrach wydruku).
// Wynik: { doc, info: { count, skipped: {RODZAJ: liczba}, units, truncated } }
export function parseDxf(input, o = {}) {
  const PR = pairsOf(decode(input));
  let i = 0;
  const header = {}, layerInfo = new Map(), blocks = new Map(), entities = [];
  let rysioUnits = null;
  const readEnt = () => { const e = { type: PR[i][1], codes: [] }; i++; while (i < PR.length && PR[i][0] !== 0) { e.codes.push(PR[i]); i++; } return e; };
  while (i < PR.length) {
    if (PR[i][0] === 999) { const m = /Rysio.*jednostki\s+(mm|cm|m)\b/.exec(PR[i][1]); if (m) rysioUnits = m[1]; i++; continue; }
    if (!(PR[i][0] === 0 && PR[i][1] === 'SECTION')) { i++; continue; }
    const name = PR[i + 1] && PR[i + 1][1]; i += 2;
    const end = () => i < PR.length && !(PR[i][0] === 0 && PR[i][1] === 'ENDSEC');
    if (name === 'HEADER') {
      let key = null;
      while (end()) { if (PR[i][0] === 9) key = PR[i][1]; else if (key) (header[key] ||= []).push(PR[i]); i++; }
    } else if (name === 'TABLES') {
      while (end()) {
        if (PR[i][0] === 0 && PR[i][1] === 'LAYER') {
          const e = readEnt(), g = c => (e.codes.find(p => p[0] === c) || [])[1];
          const nm = g(2); if (nm != null) layerInfo.set(nm, { color: parseInt(g(62) || '7', 10), flags: parseInt(g(70) || '0', 10), lt: g(6), w: parseInt(g(370) || '-3', 10) });
        } else i++;
      }
    } else if (name === 'BLOCKS') {
      let cur = null;
      while (end()) {
        if (PR[i][0] === 0 && PR[i][1] === 'BLOCK') { const e = readEnt(), g = c => (e.codes.find(p => p[0] === c) || [])[1]; cur = { name: g(2), base: [parseFloat(g(10) || 0), parseFloat(g(20) || 0)], ents: [] }; blocks.set(cur.name, cur); }
        else if (PR[i][0] === 0 && PR[i][1] === 'ENDBLK') { readEnt(); cur = null; }
        else if (PR[i][0] === 0) { const e = readEnt(); if (cur) cur.ents.push(e); }
        else i++;
      }
    } else if (name === 'ENTITIES') {
      while (end()) { if (PR[i][0] === 0) entities.push(readEnt()); else i++; }
    } else while (end()) i++;
    i++;
  }

  // jednostki pliku → metry
  const insunits = header.$INSUNITS ? parseInt(header.$INSUNITS[0][1], 10) : 0;
  let units = rysioUnits || UNIT_NAME[insunits] || null;
  let fileUnits = rysioUnits || { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm', 14: 'dm' }[insunits] || null, guessed = false;
  let u = rysioUnits ? { mm: 0.001, cm: 0.01, m: 1 }[rysioUnits] : UNIT_M[insunits] || 0;
  if (!u) {   // bez jednostek: zgadujemy po rozmiarze (rysunek większy niż 3 km w metrach to raczej milimetry)
    const hv = k2 => header[k2] ? [+((header[k2].find(x => x[0] === 10) || [])[1]), +((header[k2].find(x => x[0] === 20) || [])[1])] : null;
    const a = hv('$EXTMIN'), b = hv('$EXTMAX');
    const okExt = a && b && [...a, ...b].every(v => Number.isFinite(v) && Math.abs(v) < 1e19) && b[0] >= a[0] && b[1] >= a[1];   // ±1e20 = „zakres nieobliczony”
    const ext = okExt ? Math.max(b[0] - a[0], b[1] - a[1]) : guessExtent(entities);
    u = ext > 3000 ? 0.001 : 1; units = fileUnits = u === 0.001 ? 'mm' : 'm'; guessed = true;
  }

  // warstwy
  const doc = newDoc(); doc.layers = []; doc.units = units && ['m', 'cm', 'mm'].includes(units) ? units : 'm';
  if (o.scale > 0) doc.scale = o.scale;
  const dimscale = header.$DIMSCALE ? +header.$DIMSCALE[0][1] : 0;
  if (!o.scale && dimscale >= 5 && dimscale <= 1000) doc.scale = dimscale;
  const k = doc.scale / 1000;   // metry modelu na milimetr wydruku
  let nextId = 1;
  const layerIds = new Map();
  const layerFor = nm => {
    nm = nm || '0';
    if (layerIds.has(nm)) return layerIds.get(nm);
    const inf = layerInfo.get(nm) || { color: 7, flags: 0, lt: null, w: -3 };
    const L = { id: nextId++, name: nm, color: aciColor(inf.color), visible: inf.color >= 0 && !(inf.flags & 1), locked: !!(inf.flags & 4), w: wIn(inf.w) ?? 0.25, lt: ltIn(inf.lt) || 'solid' };
    doc.layers.push(L); layerIds.set(nm, L.id); return L.id;
  };
  for (const nm of layerInfo.keys()) layerFor(nm);

  const out = [], skipped = {};
  const skip = t => { skipped[t] = (skipped[t] || 0) + 1; };
  const LIMIT = 300000;
  const add = (e, base) => { if (out.length < LIMIT) out.push({ ...e, layer: base.layer, w: base.w, lt: base.lt }); };

  const emit = (ents, M, inherit, depth) => {
    if (depth > 10) return;
    for (let j = 0; j < ents.length; j++) {
      const e = ents[j], c = e.codes;
      const g = (code, d = 0) => { const p = c.find(x => x[0] === code); return p ? parseFloat(p[1]) : d; };
      const gs = code => { const p = c.find(x => x[0] === code); return p ? p[1] : null; };
      // arkusz (paper space) i elementy niewidoczne (60 = 1) pomijamy razem z wierzchołkami polilinii
      if (g(67) === 1 || g(60) === 1) { if (e.type === 'POLYLINE') while (j + 1 < ents.length && ents[j + 1].type !== 'SEQEND') j++; continue; }
      let lname = gs(8) || '0';
      // w bloku warstwa „0” przejmuje warstwę wstawienia; wstawienie na zamrożonej warstwie chowa cały blok
      if (inherit && (lname === '0' || inherit.frozen)) lname = inherit.name;
      const base = { layer: layerFor(lname), w: wIn(g(370, -1)) ?? (inherit && g(370, -1) === -2 ? inherit.w : null), lt: ltIn(gs(6)) ?? (inherit && /^BYBLOCK$/i.test(gs(6) || '') ? inherit.lt : null) };
      // płaskie encje leżą w układzie obiektu; normalna −Z (odbicie) odwraca oś X
      const ocs = g(230, 1) < 0 ? mul(M, [-1, 0, 0, 1, 0, 0]) : M;
      const pline = (vs, closed, Mx) => {
        if (vs.length < 2) return;
        if (similar(Mx)) {
          const flip = det(Mx) < 0;
          add({ t: 'pline', pts: vs.map(v => { const q = P(Mx, [v.x, v.y]), b = v.b ? (flip ? -v.b : v.b) : 0; return b ? [...q, r6(b)] : q; }), closed: !!closed }, base);
        } else {
          const pts = [];
          for (let m = 0; m < vs.length; m++) { const p = [vs[m].x, vs[m].y]; if (!m) pts.push(p); const q = vs[m + 1] ? [vs[m + 1].x, vs[m + 1].y] : closed ? [vs[0].x, vs[0].y] : null; if (q) pts.push(...bulgePts(p, q, vs[m].b)); }
          if (closed) pts.pop();
          add({ t: 'pline', pts: pts.map(p => P(Mx, p)), closed: !!closed }, base);
        }
      };
      // tekst: p — początek linii bazowej, dir — kierunek pisania (oba w układzie przed Mx)
      const putText = (Mx, p, dir, h, align, s) => {
        let q = tp(Mx, p), d = tv(Mx, dir);
        const u2 = tv(Mx, [-dir[1], dir[0]]), hs = Math.hypot(u2[0], u2[1]);
        if (det(Mx) < 0) {
          // Rysio nie ma lustrzanego tekstu: napis zostaje czytelny (jak w AutoCAD-zie przy MIRRTEXT = 0)
          const rev = d[0] < -1e-9 || (Math.abs(d[0]) <= 1e-9 && d[1] < 0), r = rev ? [-d[0], -d[1]] : d;
          if (-r[1] * u2[0] + r[0] * u2[1] < 0) q = [q[0] + u2[0] * h, q[1] + u2[1] * h];   // napis leży po tej samej stronie linii
          if (rev) align = align === 'l' ? 'r' : align === 'r' ? 'l' : 'c';
          d = r;
        }
        add({ t: 'text', p: q.map(r6), s, h: r6(h * hs / k), align, rot: r6(angOfV(d)) % TAU }, base);
      };
      const ptsOut = (pts, closed, Mx) => { if (pts.length > 1) add({ t: 'pline', pts: pts.map(p => P(Mx, p)), closed: !!closed }, base); };
      switch (e.type) {
        case 'LINE': add({ t: 'line', a: P(M, [g(10), g(20)]), b: P(M, [g(11), g(21)]) }, base); break;
        case 'LWPOLYLINE': {
          const vs = []; let cur = null;
          for (const [code, val] of c) { if (code === 10) { cur = { x: parseFloat(val), y: 0, b: 0 }; vs.push(cur); } else if (code === 20 && cur) cur.y = parseFloat(val); else if (code === 42 && cur) cur.b = parseFloat(val); }
          pline(vs, (g(70) & 1) === 1, ocs); break;
        }
        case 'POLYLINE': {
          const flags = g(70), vs = [];
          while (j + 1 < ents.length && ents[j + 1].type === 'VERTEX') {
            j++; const vc = ents[j].codes, vg = (cc, d = 0) => { const p = vc.find(x => x[0] === cc); return p ? parseFloat(p[1]) : d; };
            if (!(vg(70) & 16)) vs.push({ x: vg(10), y: vg(20), b: vg(42) });   // bez punktów kontrolnych splajnu
          }
          if (j + 1 < ents.length && ents[j + 1].type === 'SEQEND') j++;
          if (flags & (16 | 64)) { skip('POLYFACE'); break; }   // siatki 3D
          pline(vs, (flags & 1) === 1, flags & 8 ? M : ocs); break;
        }
        case 'CIRCLE': {
          const cc = [g(10), g(20)], r = g(40);
          if (similar(ocs)) add({ t: 'circle', c: P(ocs, cc), r: r6(r * scaleX(ocs)) }, base);
          else { const p = arcPts(cc, r, 0, TAU); p.pop(); ptsOut(p, true, ocs); }
          break;
        }
        case 'ARC': {
          const cc = [g(10), g(20)], r = g(40), a0 = g(50) * Math.PI / 180, a1 = g(51) * Math.PI / 180;
          if (similar(ocs)) {
            const A0 = angOfV(tv(ocs, [Math.cos(a0), Math.sin(a0)])), A1 = angOfV(tv(ocs, [Math.cos(a1), Math.sin(a1)]));
            add({ t: 'arc', c: P(ocs, cc), r: r6(r * scaleX(ocs)), ...(det(ocs) < 0 ? { a0: A1, a1: A0 } : { a0: A0, a1: A1 }) }, base);
          } else ptsOut(arcPts(cc, r, a0, a1), false, ocs);
          break;
        }
        case 'ELLIPSE': {
          const cc = [g(10), g(20)], mx = g(11), my = g(21), ratio = g(40, 1);
          let t0 = g(41, 0), t1 = g(42, TAU); while (t1 <= t0) t1 += TAU;
          // środek i oś są w układzie świata; mała półoś = normalna × duża (przy normalnej −Z obrócona w drugą stronę)
          const minor = (g(230, 1) < 0 ? [my, -mx] : [-my, mx]).map(v => v * ratio), full = Math.abs(t1 - t0 - TAU) < 1e-6;
          const n = Math.max(12, Math.ceil((t1 - t0) / (Math.PI / 36))), pts = [];
          for (let m = 0; m <= n; m++) { const t = t0 + (t1 - t0) * m / n, cs = Math.cos(t), sn = Math.sin(t); pts.push([cc[0] + mx * cs + minor[0] * sn, cc[1] + my * cs + minor[1] * sn]); }
          if (full) pts.pop();
          ptsOut(pts, full, M); break;
        }
        case 'SPLINE': {
          const fit = [], ctl = [], knots = []; let cp = null, fp = null;
          for (const [code, val] of c) {
            if (code === 10) { cp = [parseFloat(val), 0]; ctl.push(cp); } else if (code === 20 && cp) cp[1] = parseFloat(val);
            else if (code === 11) { fp = [parseFloat(val), 0]; fit.push(fp); } else if (code === 21 && fp) fp[1] = parseFloat(val);
            else if (code === 40) knots.push(parseFloat(val));
          }
          const closed = (g(70) & 1) === 1;
          const pts = ctl.length > 1 ? splinePts(ctl, knots, g(71, 3) | 0, closed) : fit;
          ptsOut(pts, closed && pts.length > 2, M); break;
        }
        case 'SOLID': case 'TRACE': case '3DFACE': {
          const q = [[g(10), g(20)], [g(11), g(21)], e.type === '3DFACE' ? [g(12), g(22)] : [g(13), g(23)], e.type === '3DFACE' ? [g(13), g(23)] : [g(12), g(22)]];
          const pts = q.filter((p, m) => !m || !s1(p, q[m - 1])); if (pts.length > 2 && s1(pts[0], pts[pts.length - 1])) pts.pop();
          ptsOut(pts, true, e.type === '3DFACE' ? M : ocs); break;
        }
        case 'TEXT': case 'ATTRIB': {
          if (e.type === 'ATTRIB' && (g(70) & 1)) break;   // atrybut niewidoczny
          const s = cleanText(gs(1) || '', false); if (!s.trim()) break;
          const hx = g(72) | 0, fit = hx === 3 || hx === 5;   // „wyrównany” i „dopasowany”: między punktami 10 i 11 — bierzemy początek
          const vy = hx === 4 ? 2 : g(73) | 0, alignPt = !fit && (hx || vy) && c.some(x => x[0] === 11);
          let p = alignPt ? [g(11), g(21)] : [g(10), g(20)];
          const h = g(40, 1), rot = g(50) * Math.PI / 180, dir = [Math.cos(rot), Math.sin(rot)], up = [-dir[1], dir[0]];
          if (alignPt && vy === 2) p = V.sub(p, V.mul(up, h / 2)); else if (alignPt && vy === 3) p = V.sub(p, V.mul(up, h));
          putText(ocs, p, dir, h, fit ? 'l' : hx === 1 || hx === 4 ? 'c' : hx === 2 ? 'r' : 'l', s);
          break;
        }
        case 'MTEXT': {
          let raw = ''; for (const [code, val] of c) if (code === 3) raw += val; raw += gs(1) || '';
          const s = cleanText(raw, true).replace(/\n+$/, ''); if (!s.trim()) break;
          const h = g(40, 1), at = g(71, 1) | 0;
          const rot = c.some(x => x[0] === 11) ? Math.atan2(g(21), g(11)) : g(50) * Math.PI / 180;
          const dir = [Math.cos(rot), Math.sin(rot)], up = [-dir[1], dir[0]], lines = s.split('\n').length;
          const tall = h * (1 + (lines - 1) * LINE_GAP);
          const row = Math.ceil(at / 3), col = (at - 1) % 3;
          const dy = row === 1 ? -h : row === 2 ? tall / 2 - h : (lines - 1) * LINE_GAP * h;
          const p = V.add([g(10), g(20)], V.mul(up, dy));
          putText(M, p, dir, h, col === 1 ? 'c' : col === 2 ? 'r' : 'l', s);   // punkt i kierunek MTEXT są w układzie świata
          break;
        }
        case 'INSERT': case 'DIMENSION': {
          const b = blocks.get(gs(2)); if (!b) { if (e.type === 'DIMENSION') skip('DIMENSION'); break; }
          let T = M;
          if (e.type === 'INSERT') {
            const sx = g(41, 1), sy = g(42, 1), rot = g(50) * Math.PI / 180, cs = Math.cos(rot), sn = Math.sin(rot);
            const L = [cs * sx, sn * sx, -sn * sy, cs * sy, g(10), g(20)];
            T = mul(mul(ocs, L), [1, 0, 0, 1, -b.base[0], -b.base[1]]);
            const cols = Math.max(1, g(70, 1) | 0), rows = Math.max(1, g(71, 1) | 0);
            for (let cI = 0; cI < cols; cI++) for (let rI = 0; rI < rows; rI++) {
              const off = tv([cs, sn, -sn, cs, 0, 0], [cI * g(44), rI * g(45)]);
              emit(b.ents, mul(mul(ocs, [1, 0, 0, 1, off[0], off[1]]), mul(L, [1, 0, 0, 1, -b.base[0], -b.base[1]])), { name: lname, w: base.w, lt: base.lt, frozen: !!((layerInfo.get(lname) || {}).flags & 1) || !!(inherit && inherit.frozen) }, depth + 1);
            }
            // atrybuty wstawienia
            if (g(66) === 1) while (j + 1 < ents.length && ents[j + 1].type === 'ATTRIB') { j++; emit([ents[j]], M, null, depth + 1); }
            if (j + 1 < ents.length && ents[j + 1].type === 'SEQEND') j++;
            break;
          }
          emit(b.ents, T, { name: lname, w: base.w, lt: base.lt, frozen: !!((layerInfo.get(lname) || {}).flags & 1) || !!(inherit && inherit.frozen) }, depth + 1);   // wymiar: jego rysunek leży w bloku *D…
          break;
        }
        case 'ATTDEF': case 'SEQEND': case 'VERTEX': case 'POINT': case 'VIEWPORT': break;
        default: skip(e.type);
      }
    }
  };
  emit(entities, [u, 0, 0, u, 0, 0], null, 0);
  if (!doc.layers.length) layerFor('0');
  // współrzędne geodezyjne (np. układ 2000, ~5 500 000 m): rysunek przesuwamy do okolic zera, a przesunięcie
  // zapisujemy w doc.origin — zapis DXF dodaje je z powrotem
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  const seen = p => { if (p[0] < lo[0]) lo[0] = p[0]; if (p[1] < lo[1]) lo[1] = p[1]; if (p[0] > hi[0]) hi[0] = p[0]; if (p[1] > hi[1]) hi[1] = p[1]; };
  for (const e of out) for (const q of e.t === 'line' ? [e.a, e.b] : e.t === 'pline' ? e.pts : e.t === 'text' ? [e.p] : [e.c]) seen(q);
  const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
  if (isFinite(mid[0]) && Math.max(Math.abs(mid[0]), Math.abs(mid[1])) > 100000) {
    const o0 = [Math.round(mid[0] / 1000) * 1000, Math.round(mid[1] / 1000) * 1000], sh = q => { const r = [r6(q[0] - o0[0]), r6(q[1] - o0[1])]; return q.length > 2 ? [...r, q[2]] : r; };
    for (const e of out) { if (e.t === 'line') { e.a = sh(e.a); e.b = sh(e.b); } else if (e.t === 'pline') e.pts = e.pts.map(sh); else if (e.t === 'text') e.p = sh(e.p); else e.c = sh(e.c); }
    doc.origin = o0;
  }
  doc.ents = out.map(e => ({ ...e, id: nextId++ }));
  doc.next = nextId;
  doc.cur = { layer: (doc.layers.find(L => L.visible && !L.locked) || doc.layers[0]).id, w: null, lt: null };   // rysujemy na warstwie widocznej i odblokowanej
  if (!doc.ents.length && !Object.keys(skipped).length) throw new Error(_t('W pliku nie ma rysunku.'));
  return { doc: fixDoc(doc), info: { count: doc.ents.length, skipped, units: fileUnits, guessed, truncated: out.length >= LIMIT } };
}
function guessExtent(ents) {   // rozpiętość osobno w X i w Y (mapy mają X i Y różne o miliony)
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const e of ents) for (const [code, val] of e.codes) if (code === 10 || code === 20) { const k = code === 10 ? 0 : 1, v = parseFloat(val); if (!Number.isFinite(v)) continue; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  return Math.max(0, hi[0] - lo[0], hi[1] - lo[1]);
}

/* ---------- zapis: DXF R12 (AC1009) — czyta go każdy program CAD ---------- */
// Zapisujemy model (bez arkuszy) w jednostkach rysunku (m, cm albo mm — mapa w metrach zostaje w metrach). Wymiary rozbijamy na linie i tekst. R12 nie zna grubości linii —
// grubości zostają tylko w pliku .rysio (Rysio czyta je z DXF, gdy plik je ma).
const esc = s => String(s).replace(/[^\x20-\x7e]/g, ch => ch === '\n' ? ' ' : '\\U+' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
// nazwy warstw w R12: tylko litery A–Z, cyfry i $ - _ (polskie litery bez ogonków, reszta → _)
const PL = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z', Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z' };
const layerName = s => String(s).trim().replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, ch => PL[ch]).replace(/[^A-Za-z0-9$_-]/g, '_') || 'Warstwa';
const num = v => { const x = Math.round(v * 1e6) / 1e6; return Object.is(x, -0) ? '0' : String(x); };

export function writeDxf(doc) {
  const units = ['m', 'cm', 'mm'].includes(doc.units) ? doc.units : 'm', U = { m: 1, cm: 100, mm: 1000 }[units], k = doc.scale / 1000;   // metry → jednostki pliku; metry modelu na milimetr wydruku
  const o = [];
  const put = (...a) => { for (const x of a) o.push(String(x)); };
  put(999, 'Rysio - jednostki ' + units);
  put(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSBASE', 10, 0, 20, 0, 30, 0, 9, '$LTSCALE', 40, 1, 9, '$DIMSCALE', 40, doc.scale, 0, 'ENDSEC');
  // tabele: rodzaje linii (długości kresek w mm modelu dla skali rysunku), warstwy, styl tekstu
  put(0, 'SECTION', 2, 'TABLES');
  const lts = Object.entries(LT_OUT);
  put(0, 'TABLE', 2, 'LTYPE', 70, lts.length);
  for (const [id, name] of lts) {
    const pat = LTYPES[id].dash.map((v, m) => (m % 2 ? -1 : 1) * v * k * U * (id === 'dot' && m % 2 === 0 ? 0 : 1));
    put(0, 'LTYPE', 2, name, 70, 0, 3, esc(LTYPES[id].name), 72, 65, 73, pat.length, 40, num(pat.reduce((a, b) => a + Math.abs(b), 0)));
    for (const v of pat) put(49, num(v));
  }
  put(0, 'ENDTAB');
  const names = new Map(), used = new Set();
  for (const L of doc.layers) { let n = layerName(L.name), m = 2; while (used.has(n.toUpperCase())) n = layerName(L.name) + '_' + m++; used.add(n.toUpperCase()); names.set(L.id, n); }
  put(0, 'TABLE', 2, 'LAYER', 70, doc.layers.length);
  for (const L of doc.layers) { const c = nearestAci(L.color); put(0, 'LAYER', 2, names.get(L.id), 70, L.locked ? 4 : 0, 62, L.visible ? c : -c, 6, LT_OUT[L.lt] || 'CONTINUOUS'); }
  put(0, 'ENDTAB');
  put(0, 'TABLE', 2, 'STYLE', 70, 1, 0, 'STYLE', 2, 'STANDARD', 70, 0, 40, 0, 41, 1, 50, 0, 71, 0, 42, 2.5, 3, 'txt', 4, '', 0, 'ENDTAB');
  put(0, 'ENDSEC');

  put(0, 'SECTION', 2, 'ENTITIES');
  const O = Array.isArray(doc.origin) ? doc.origin : [0, 0];   // przesunięcie rysunku z importu (współrzędne geodezyjne)
  const Q = p => [num((p[0] + O[0]) * U), num((p[1] + O[1]) * U)];
  const head = (t, e) => { put(0, t, 8, names.get(e.layer) || '0'); if (e.lt) put(6, LT_OUT[e.lt] || 'CONTINUOUS'); };
  const line = (e, a, b) => { head('LINE', e); const A = Q(a), B = Q(b); put(10, A[0], 20, A[1], 30, 0, 11, B[0], 21, B[1], 31, 0); };
  const text = (e, p, s, h, align, rot) => {
    const dir = [Math.cos(rot), Math.sin(rot)], down = [dir[1], -dir[0]];
    String(s).split('\n').forEach((ln, m) => {
      if (!ln.trim()) return;
      const q = V.add(p, V.mul(down, m * LINE_GAP * h)), A = Q(q);
      head('TEXT', e); put(10, A[0], 20, A[1], 30, 0, 40, num(h * U), 1, esc(ln), 50, num(rot * 180 / Math.PI));
      if (align === 'c' || align === 'r') put(72, align === 'c' ? 1 : 2, 11, A[0], 21, A[1], 31, 0);
    });
  };
  let n = 0;
  for (const e of doc.ents) {
    if (e.sp || e.t === 'vp' || !doc.layers.some(L => L.id === e.layer)) continue;
    n++;
    if (e.t === 'line') line(e, e.a, e.b);
    else if (e.t === 'pline') {
      head('POLYLINE', e); put(66, 1, 10, 0, 20, 0, 30, 0, 70, e.closed ? 1 : 0);
      for (const v of e.pts) { const A = Q(v); put(0, 'VERTEX', 8, names.get(e.layer) || '0', 10, A[0], 20, A[1], 30, 0); if (v[2]) put(42, num(v[2])); }
      put(0, 'SEQEND', 8, names.get(e.layer) || '0');
    } else if (e.t === 'circle') { head('CIRCLE', e); const C = Q(e.c); put(10, C[0], 20, C[1], 30, 0, 40, num(e.r * U)); }
    else if (e.t === 'arc') { head('ARC', e); const C = Q(e.c); put(10, C[0], 20, C[1], 30, 0, 40, num(e.r * U), 50, num(e.a0 * 180 / Math.PI), 51, num(e.a1 * 180 / Math.PI)); }
    else if (e.t === 'text') text(e, e.p, e.s, e.h * k, e.align || 'l', e.rot || 0);
    else if (e.t === 'dim') {
      // wymiar jako linie i tekst — tak, jak wygląda na rysunku
      const g = dimGeom(e), d = V.norm(V.sub(g.d2, g.d1)), dir = (d[0] || d[1]) ? d : [1, 0];
      line(e, V.sub(g.d1, V.mul(dir, DIM_EXT * k)), V.add(g.d2, V.mul(dir, DIM_EXT * k)));
      for (const [p, q] of [[e.a, g.d1], [e.b, g.d2]]) { const v = V.sub(q, p), L = V.len(v); if (L < 1e-9) continue; const nn = V.mul(v, 1 / L), gap = Math.min(1 * k, L / 3); line(e, V.add(p, V.mul(nn, gap)), V.add(q, V.mul(nn, DIM_EXT * k))); }
      const t = V.mul(V.norm(V.add(dir, V.perp(dir))), DIM_TICK * k);
      for (const q of [g.d1, g.d2]) line(e, V.sub(q, t), V.add(q, t));
      let ang = Math.atan2(dir[1], dir[0]); if (ang > Math.PI / 2 + 1e-6 || ang <= -Math.PI / 2 + 1e-6) ang += Math.PI;
      const up = [-Math.sin(ang), Math.cos(ang)];
      const val = doc.units === 'mm' ? String(Math.round(g.value * 1000)) : doc.units === 'cm' ? (g.value * 100).toFixed(1).replace('.', ',') : g.value.toFixed(2).replace('.', ',');
      text(e, V.add(g.mid, V.mul(up, 1 * k)), val, (e.h || DIM_H) * k, 'c', ang);
    }
  }
  put(0, 'ENDSEC', 0, 'EOF');
  return { text: o.join('\r\n') + '\r\n', count: n, units };
}
