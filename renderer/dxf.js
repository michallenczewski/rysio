// DXF: odczyt do elementów Rysia i zapis rysunku (model, arkusze, bloki) do DXF R2000.
// Rozkład pliku na sekcje, tabela warstw, bloki i wstawienia — na wzór czytnika podkładu z Modo 0.4.2 (renderer/dxf.js),
// ale tu wynikiem są prawdziwe elementy (linie, polilinie z łukami, okręgi, łuki, teksty), a nie odcinki podkładu.
//   Bloki i wymiary są rozbijane na zwykłe elementy (Rysio nie ma jeszcze bloków); kreskowania na razie pomijamy.
//   Elipsy i splajny zamieniają się w polilinie. Współrzędne zostają takie jak w pliku (w metrach).
import { _t, DEC } from './i18n.js';
import { newDoc, fixDoc, WEIGHTS, LTYPES, sheetSize } from './model.js';
import { drawFrame } from './sheet.js';
import { V, dimGeom, adimGeom, arrowSegs, LINE_GAP, DIM_EXT, DIM_TICK, DIM_H, setAnno, ANNO } from './geom.js';
import { adimText } from './draw.js';
import { hatchSegs } from './hatch.js';

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
  let SP = null;   // przestrzeń, do której trafiają elementy (null — model, 'b' + id — definicja bloku)
  const add = (e, base) => { if (out.length < LIMIT) out.push({ ...e, layer: base.layer, w: base.w, lt: base.lt, ...(SP ? { sp: SP } : {}) }); };
  // bloki: nazwany blok wstawiany bez zniekształceń staje się blokiem Rysia (definicja raz, potem wstawienia)
  const defs = new Map(), defining = new Set(); let nextBlock = 1;
  // inherit — wstawienie, które pierwsze użyło bloku: elementy bloku na warstwie „0” i z kreską BYBLOCK biorą jego warstwę i kreskę
  // (Rysio nie ma warstwy „0” zmieniającej się z wstawieniem — przybliżenie wystarczające dla typowych plików)
  const defOf = (name, depth, inherit) => {
    if (defining.has(name)) return -1;   // blok w samym sobie (bezpośrednio albo przez inne bloki) — pomijamy
    if (defs.has(name)) return defs.get(name);
    const b = blocks.get(name); if (!b) return null;
    const id = nextBlock++; defs.set(name, id); defining.add(name);
    const keep = SP; SP = 'b' + id;
    try { emit(b.ents, [u, 0, 0, u, -b.base[0] * u, -b.base[1] * u], inherit, depth + 1); } finally { SP = keep; defining.delete(name); }
    return id;
  };

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
            const frozen = !!((layerInfo.get(lname) || {}).flags & 1) || !!(inherit && inherit.frozen);
            const plain = M[1] === 0 && M[2] === 0 && M[0] === M[3] && M[0] > 0;   // bez obrotu i odbicia z zewnątrz
            if (o.blocks !== false && plain && !frozen && !/^\*/.test(gs(2)) && g(230, 1) > 0 && Math.max(1, g(70, 1) | 0) === 1 && Math.max(1, g(71, 1) | 0) === 1 && Math.abs(Math.abs(sx) - Math.abs(sy)) <= 1e-9 * Math.abs(sx) && sx) {
              const bid = defOf(gs(2), depth, { name: lname, w: base.w, lt: base.lt, frozen: false });
              if (bid === -1) { skip(_t('blok w samym sobie')); break; }
              if (bid) {
                let rr = rot, mx = false;
                if (sx < 0 && sy < 0) rr += Math.PI; else if (sx < 0) mx = true; else if (sy < 0) { mx = true; rr += Math.PI; }
                add({ t: 'ins', b: bid, p: P(M, [g(10), g(20)]), rot: r6(((rr % TAU) + TAU) % TAU), s: r6(Math.abs(sx)), mx }, base);
                if (g(66) === 1) while (j + 1 < ents.length && ents[j + 1].type === 'ATTRIB') { j++; emit([ents[j]], M, null, depth + 1); }
                if (j + 1 < ents.length && ents[j + 1].type === 'SEQEND') j++;
                break;
              }
            }
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
        case 'HATCH': {
          const loops = hatchLoops(c).map(L => L.map(q => P(ocs, q))).filter(L => L.length > 2);
          if (!loops.length) { skip('HATCH'); break; }
          const nm = (gs(2) || '').toUpperCase(), solid = g(70) === 1 || nm === 'SOLID';
          const own = /^RYSIO_([A-Z]+)$/.exec(nm), ownPat = own && ['diag', 'cross', 'conc', 'ins', 'soil'].includes(own[1].toLowerCase()) ? own[1].toLowerCase() : null;
          const pat = solid ? 'solid' : ownPat ? ownPat : /CONC|SAND/.test(nm) ? 'conc' : /EARTH/.test(nm) ? 'soil' : /INSUL/.test(nm) ? 'ins' : /ANSI37|ANSI38|NET|CROSS|SQUARE/.test(nm) ? 'cross' : 'diag';
          const baseAng = /ANSI3[1-8]/.test(nm) ? 45 : 0;
          add({ t: 'hatch', loops, pat, ps: ownPat && g(41) > 0 ? g(41) : 1, ang: r6(((baseAng + g(52)) % 360 + 360) % 360 * Math.PI / 180) }, { ...base, w: base.w ?? 0.13 });
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
  const ptsOf = e => e.t === 'line' ? [e.a, e.b] : e.t === 'pline' ? e.pts : e.t === 'text' || e.t === 'ins' ? [e.t === 'ins' ? e.p : e.p] : e.t === 'hatch' ? e.loops.flat() : [e.c];
  for (const e of out) if (!e.sp) for (const q of ptsOf(e)) seen(q);
  const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
  if (isFinite(mid[0]) && Math.max(Math.abs(mid[0]), Math.abs(mid[1])) > 100000) {
    const o0 = [Math.round(mid[0] / 1000) * 1000, Math.round(mid[1] / 1000) * 1000], sh = q => { const r = [r6(q[0] - o0[0]), r6(q[1] - o0[1])]; return q.length > 2 ? [...r, q[2]] : r; };
    for (const e of out) { if (e.sp) continue; if (e.t === 'line') { e.a = sh(e.a); e.b = sh(e.b); } else if (e.t === 'pline') e.pts = e.pts.map(sh); else if (e.t === 'text' || e.t === 'ins') e.p = sh(e.p); else if (e.t === 'hatch') e.loops = e.loops.map(L => L.map(sh)); else e.c = sh(e.c); }
    doc.origin = o0;
  }
  doc.blocks = [...defs].map(([name, id]) => ({ id, name: cleanText(name, false) }));
  // numery bloków nie mogą się zderzyć z numerami elementów i warstw — przenumerowujemy je za nimi
  const bmap = new Map(doc.blocks.map(b => [b.id, nextId++])); for (const b of doc.blocks) b.id = bmap.get(b.id);
  for (const e of out) { if (e.t === 'ins') e.b = bmap.get(e.b); if (e.sp) e.sp = 'b' + bmap.get(+e.sp.slice(1)); }
  doc.ents = out.map(e => ({ ...e, id: nextId++ }));
  doc.next = nextId;
  // pusta warstwa „0” (jest w każdym DXF) i ramka arkuszy z pliku Rysia — bez nich
  const usedL = new Set(out.map(e => e.layer));
  const drop = L => !usedL.has(L.id) && (L.name === '0' || (rysioUnits && /^RAMKA(_\d+)?$/.test(L.name)));
  if (doc.layers.some(L => !drop(L))) doc.layers = doc.layers.filter(L => !drop(L));
  doc.cur = { layer: (doc.layers.find(L => L.visible && !L.locked) || doc.layers[0]).id, w: null, lt: null };   // rysujemy na warstwie widocznej i odblokowanej
  if (!doc.ents.length && !Object.keys(skipped).length) throw new Error(_t('W pliku nie ma rysunku.'));
  // punkt bazowy pliku ($INSBASE) w metrach modelu — za niego wstawia się plik jako blok (biblioteka bloków)
  const ib = header.$INSBASE ? [+((header.$INSBASE.find(x => x[0] === 10) || [])[1]) || 0, +((header.$INSBASE.find(x => x[0] === 20) || [])[1]) || 0] : [0, 0];
  const base = [r6(ib[0] * u - (doc.origin ? doc.origin[0] : 0)), r6(ib[1] * u - (doc.origin ? doc.origin[1] : 0))];
  return { doc: fixDoc(doc), info: { count: doc.ents.filter(e => !e.sp).length, blocks: doc.blocks.length, skipped, units: fileUnits, guessed, truncated: out.length >= LIMIT, base } };
}
// obwody kreskowania z kodów HATCH: ścieżki-polilinie (z wybrzuszeniami) i ścieżki z krawędzi (odcinki, łuki, elipsy, splajny)
function hatchLoops(c) {
  const out = []; let i = c.findIndex(x => x[0] === 91); if (i < 0) return out;
  const nPaths = parseInt(c[i][1], 10); i++;
  const num = () => parseFloat(c[i++][1]);
  const want = code => { while (i < c.length && c[i][0] !== code) i++; return i < c.length; };
  for (let k = 0; k < nPaths; k++) {
    if (!want(92)) break;
    const flag = parseInt(c[i++][1], 10), pts = [];
    if (flag & 2) {
      want(72); const hasB = num() === 1; want(73); i++; want(93); const n = num(), vs = [];
      for (let v = 0; v < n; v++) { want(10); const x = num(); want(20); const y = num(); let b = 0; if (hasB && c[i] && c[i][0] === 42) b = num(); vs.push({ x, y, b }); }
      for (let v = 0; v < vs.length; v++) { const p = [vs[v].x, vs[v].y], q = vs[(v + 1) % vs.length]; if (!v) pts.push(p); pts.push(...bulgePts(p, [q.x, q.y], vs[v].b)); }
      pts.pop();
    } else {
      want(93); const nE = num();
      for (let ed = 0; ed < nE; ed++) {
        want(72); const type = num(); let seg = [];
        if (type === 1) { want(10); const x0 = num(); want(20); const y0 = num(); want(11); const x1 = num(); want(21); const y1 = num(); seg = [[x0, y0], [x1, y1]]; }
        else if (type === 2) {
          want(10); const cx = num(); want(20); const cy = num(); want(40); const r = num(); want(50); let a0 = num(); want(51); let a1 = num(); want(73); const ccw = num() === 1;
          if (ccw) seg = arcPts([cx, cy], r, a0 * Math.PI / 180, a1 * Math.PI / 180);
          else seg = arcPts([cx, cy], r, -a1 * Math.PI / 180, -a0 * Math.PI / 180).reverse();   // łuk zgodnie ze wskazówkami: kąty podane jak dla odbitego
        } else if (type === 3) {
          want(10); const cx = num(); want(20); const cy = num(); want(11); const mx = num(); want(21); const my = num(); want(40); const ratio = num(); want(50); let t0 = num() * Math.PI / 180; want(51); let t1 = num() * Math.PI / 180; want(73); const ccw = num() === 1;
          if (!ccw) { const a = -t1, b = -t0; t0 = a; t1 = b; }
          while (t1 <= t0) t1 += TAU;
          const n = Math.max(8, Math.ceil((t1 - t0) / (Math.PI / 36))), mn = [-my * ratio, mx * ratio];
          for (let m = 0; m <= n; m++) { const t = t0 + (t1 - t0) * m / n; seg.push([cx + mx * Math.cos(t) + mn[0] * Math.sin(t), cy + my * Math.cos(t) + mn[1] * Math.sin(t)]); }
          if (!ccw) seg.reverse();
        } else if (type === 4) {
          want(94); const deg = num() | 0; want(95); const nk = num(); want(96); const nc = num(); const knots = [], ctl = [];
          for (let m = 0; m < nk; m++) { want(40); knots.push(num()); }
          for (let m = 0; m < nc; m++) { want(10); const x = num(); want(20); ctl.push([x, num()]); }
          seg = splinePts(ctl, knots, deg, false);
        } else break;
        for (const q of seg) if (!pts.length || !s1(pts[pts.length - 1], q)) pts.push(q);
      }
      if (pts.length > 1 && s1(pts[0], pts[pts.length - 1])) pts.pop();
    }
    if (pts.length > 2) out.push(pts);
  }
  return out;
}
function guessExtent(ents) {   // rozpiętość osobno w X i w Y (mapy mają X i Y różne o miliony)
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const e of ents) for (const [code, val] of e.codes) if (code === 10 || code === 20) { const k = code === 10 ? 0 : 1, v = parseFloat(val); if (!Number.isFinite(v)) continue; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  return Math.max(0, hi[0] - lo[0], hi[1] - lo[1]);
}

/* ---------- wspólne dla zapisu ---------- */
// polskie litery w tekstach jako \U+XXXX (plik jest czystym ASCII)
const esc = s => String(s).replace(/[^\x20-\x7e]/g, ch => ch === '\n' ? ' ' : '\\U+' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
// nazwy warstw i bloków: litery A–Z, cyfry i $ - _ (polskie litery bez ogonków, reszta → _) — pewne w każdym programie CAD
const PL = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z', Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z' };
export const layerName = s => String(s).trim().replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, ch => PL[ch]).replace(/[^A-Za-z0-9$_-]/g, '_') || 'Warstwa';
const num = v => { const x = Math.round(v * 1e6) / 1e6; return Object.is(x, -0) ? '0' : String(x); };


/* ---------- zapis: DXF R2000 (AC1015) ---------- */
// Model i arkusze (arkusz = układ wydruku z oknami w skali i ramką), grubości linii (370), kreskowania jako HATCH
// z opisem wzoru, wymiary jako DIMENSION z blokiem *D (wygląd jak w Rysiu). Model w jednostkach rysunku (m / cm / mm),
// arkusze w milimetrach papieru. Struktura (tabele, słowniki, LAYOUT) jak w najprostszym pliku AutoCAD 2000.
const LW = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
const lwOf = mm => { const v = mm * 100; return LW.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, 0); };
const deg = r => r * 180 / Math.PI;

// wzór kreskowania jako rodziny linii DXF (w układzie wzoru, mm wydruku × m): kąt (stopnie), punkt bazowy, przesunięcie kolejnej linii, kreski
function patFamilies(pat, m) {
  const r2 = Math.SQRT2;
  if (pat === 'diag') return [{ a: 0, base: [0, 0], off: [0, 2 * m], dash: [] }];
  if (pat === 'cross') return [{ a: 0, base: [0, 0], off: [0, 2 * m], dash: [] }, { a: 90, base: [0, 0], off: [2 * m, 0], dash: [] }];
  if (pat === 'ins') { const w = 2 * m, h = 4 * m, L = Math.hypot(w, h); return [{ a: deg(Math.atan2(h, w)), base: [0, 0], off: [2 * w, 0], dash: [L, -L] }, { a: deg(Math.atan2(-h, w)), base: [w, h], off: [2 * w, 0], dash: [L, -L] }]; }
  if (pat === 'soil') { const w = 5 * m, h = 3 * m, l = 1.4 * m * r2, per = 30 * m * r2; return [0, 1, 2].map(k => ({ a: 45, base: [k * 0.6 * m, 0], off: [w / 2, h], dash: [l, -(per - l)] })); }
  if (pat === 'conc') {
    // beton: regularna siatka małych trójkątów i kropek (w Rysiu kamyki są rozrzucone losowo — w DXF wzór musi się powtarzać)
    const u = [5 * m, 0], v = [1 * m, 4 * m], t = 0.15, w = V.sub(v, u), Lu = V.len(u), Lv = V.len(v), Lw = V.len(w);
    return [
      { a: 0, base: [0, 0], off: v, dash: [t * Lu, -(1 - t) * Lu] },
      { a: deg(Math.atan2(v[1], v[0])), base: [0, 0], off: u, dash: [t * Lv, -(1 - t) * Lv] },
      { a: deg(Math.atan2(w[1], w[0])), base: V.mul(u, t), off: u, dash: [t * Lw, -(1 - t) * Lw] },
      { a: 0, base: [2.5 * m, 2 * m], off: v, dash: [0, -Lu] },
      { a: 0, base: [1.3 * m, 3 * m], off: v, dash: [0, -Lu] }
    ];
  }
  return [];
}

export function writeDxf(doc) {
  const units = ['m', 'cm', 'mm'].includes(doc.units) ? doc.units : 'm', U = { m: 1, cm: 100, mm: 1000 }[units], kM = doc.scale / 1000;
  const O0 = Array.isArray(doc.origin) ? doc.origin : [0, 0];
  const o = [], put = (...a) => { for (const x of a) o.push(String(x)); };
  let hn = 0x20; const H = () => (hn++).toString(16).toUpperCase();

  // stałe uchwyty
  const h = { root: H(), groups: H(), layouts: H(), pstyles: H(), normal: H(), tVport: H(), tLtype: H(), tLayer: H(), tStyle: H(), tView: H(), tUcs: H(), tAppid: H(), tDim: H(), tBr: H(),
    vpActive: H(), ltByBlock: H(), ltByLayer: H(), ltCont: H(), layer0: H(), stStd: H(), appAcad: H(), dimStd: H(), brModel: H(), brPaper: H(), loModel: H(), blkModel: H(), endModel: H() };

  // warstwy, rodzaje linii, bloki — nazwy bez polskich liter (pewniejsze w starszych programach)
  const lts = Object.entries(LT_OUT).filter(([id]) => id !== 'solid').map(([id, name]) => ({ id, name, h: H() }));
  const ltName = lt => LT_OUT[lt] === 'CONTINUOUS' ? 'Continuous' : (LT_OUT[lt] || 'Continuous');
  const names = new Map(), used = new Set(['0']), lh = new Map();
  for (const L of doc.layers) { let n = layerName(L.name), m = 2; while (used.has(n.toUpperCase())) n = layerName(L.name) + '_' + m++; used.add(n.toUpperCase()); names.set(L.id, n); lh.set(L.id, H()); }
  const frameLayer = (() => { let n = 'RAMKA', m = 2; while (used.has(n)) n = 'RAMKA_' + m++; used.add(n); return n; })(), frameH = H();
  const bnames = new Map(), bused = new Set();
  for (const b of doc.blocks || []) { let nm = layerName(b.name), m = 2; while (bused.has(nm.toUpperCase()) || nm.startsWith('*')) nm = layerName(b.name) + '_' + m++; bused.add(nm.toUpperCase()); bnames.set(b.id, nm); }

  // przestrzenie: model, arkusze (pierwszy — *Paper_Space, kolejne — *Paper_Space0…), bloki, bloki wymiarów *D
  const sheets = doc.sheets.length ? doc.sheets : [null];
  const spaces = sheets.map((sh, i) => ({ sh, name: i === 0 ? '*Paper_Space' : '*Paper_Space' + (i - 1), br: i === 0 ? h.brPaper : H(), lo: H(), blk: H(), end: H(), vp1: H() }));
  const blocks = (doc.blocks || []).filter(b => bnames.has(b.id)).map(b => ({ b, name: bnames.get(b.id), br: H(), blk: H(), end: H() }));
  const dimBlocks = [];   // { name, br, blk, end, body: [] } — uzupełniane przy zapisie wymiarów

  // --- zapis elementów do bufora (każda przestrzeń osobno) ---
  const keepAnno = ANNO;
  // ctx: { owner, paper, O (przesunięcie), U (jednostki), k (metry przestrzeni na mm wydruku) }
  const ents = (ctx, list, out) => {
    const P = p => [num((p[0] + ctx.O[0]) * ctx.U), num((p[1] + ctx.O[1]) * ctx.U)];
    const L = x => x * ctx.U;
    const head = (t, e, extra) => {
      out.push(0, t, 5, H(), 330, ctx.owner, 100, 'AcDbEntity'); if (ctx.paper) out.push(67, 1);
      out.push(8, e._layerName || names.get(e.layer) || '0');
      if (e.lt) out.push(6, ltName(e.lt));
      if (e.w != null) out.push(370, lwOf(e.w));
      if (extra) out.push(...extra);
    };
    const line = (e, a, b) => { const A = P(a), B = P(b); head('LINE', e); out.push(100, 'AcDbLine', 10, A[0], 20, A[1], 30, 0, 11, B[0], 21, B[1], 31, 0); };
    const text = (e, p, s, hh, align, rot) => {
      const dir = [Math.cos(rot), Math.sin(rot)], down = [dir[1], -dir[0]];
      String(s).split('\n').forEach((ln, i) => {
        if (!ln.trim()) return;
        const A = P(V.add(p, V.mul(down, i * LINE_GAP * hh)));
        head('TEXT', e); out.push(100, 'AcDbText', 10, A[0], 20, A[1], 30, 0, 40, num(L(hh)), 1, esc(ln), 50, num(deg(rot)), 7, 'Standard');
        if (align === 'c' || align === 'r') out.push(72, align === 'c' ? 1 : 2, 11, A[0], 21, A[1], 31, 0);
        out.push(100, 'AcDbText');
      });
    };
    const dimLook = (e, g, sink) => {   // wymiar jak w Rysiu: linia, linie pomocnicze, kreseczki, liczba
      const k = ctx.k, d = V.norm(V.sub(g.d2, g.d1)), dir = (d[0] || d[1]) ? d : [1, 0];
      sink.line(V.sub(g.d1, V.mul(dir, DIM_EXT * k)), V.add(g.d2, V.mul(dir, DIM_EXT * k)));
      for (const [p, q] of [[e.a, g.d1], [e.b, g.d2]]) { const v = V.sub(q, p), Ln = V.len(v); if (Ln < 1e-9) continue; const nn = V.mul(v, 1 / Ln), gap = Math.min(1 * k, Ln / 3); sink.line(V.add(p, V.mul(nn, gap)), V.add(q, V.mul(nn, DIM_EXT * k))); }
      const t = V.mul(V.norm(V.add(dir, V.perp(dir))), DIM_TICK * k);
      for (const q of [g.d1, g.d2]) sink.line(V.sub(q, t), V.add(q, t));
      let ang = Math.atan2(dir[1], dir[0]); if (ang > Math.PI / 2 + 1e-6 || ang <= -Math.PI / 2 + 1e-6) ang += Math.PI;
      const up = [-Math.sin(ang), Math.cos(ang)];
      sink.text(V.add(g.mid, V.mul(up, 1 * k)), dimText(g.value, ctx.paper), (e.h || DIM_H) * k, 'c', ang);
      return V.add(g.mid, V.mul(up, 1 * k));
    };
    let n = 0;
    for (const e of list) {
      if (e.t === 'vp' || !doc.layers.some(Lr => Lr.id === e.layer)) continue;
      n++;
      if (e.t === 'line') line(e, e.a, e.b);
      else if (e.t === 'pline') {
        head('LWPOLYLINE', e); out.push(100, 'AcDbPolyline', 90, e.pts.length, 70, e.closed ? 1 : 0, 43, 0);
        for (const v of e.pts) { const A = P(v); out.push(10, A[0], 20, A[1]); if (v[2]) out.push(42, num(v[2])); }
      } else if (e.t === 'circle') { const C = P(e.c); head('CIRCLE', e); out.push(100, 'AcDbCircle', 10, C[0], 20, C[1], 30, 0, 40, num(L(e.r))); }
      else if (e.t === 'arc') { const C = P(e.c); head('ARC', e); out.push(100, 'AcDbCircle', 10, C[0], 20, C[1], 30, 0, 40, num(L(e.r)), 100, 'AcDbArc', 50, num(deg(e.a0)), 51, num(deg(e.a1))); }
      else if (e.t === 'text') text(e, e.p, e.s, e.h * ctx.k, e.align || 'l', e.rot || 0);
      else if (e.t === 'ins') {
        if (!bnames.has(e.b)) { n--; continue; }
        const A = P(e.p), s = e.s || 1;
        head('INSERT', e); out.push(100, 'AcDbBlockReference', 2, bnames.get(e.b), 10, A[0], 20, A[1], 30, 0, 41, num(e.mx ? -s : s), 42, num(s), 43, num(s), 50, num(deg(e.rot || 0)));
      } else if (e.t === 'hatch') {
        const solid = e.pat === 'solid', ang = e.ang || 0, m = ctx.k * (e.ps || 1) * ctx.U;
        head('HATCH', e);
        out.push(100, 'AcDbHatch', 10, 0, 20, 0, 30, 0, 210, 0, 220, 0, 230, 1, 2, solid ? 'SOLID' : 'RYSIO_' + String(e.pat).toUpperCase(), 70, solid ? 1 : 0, 71, 0, 91, e.loops.length);
        e.loops.forEach((Lp, i) => { out.push(92, i === 0 ? 3 : 2, 72, 0, 73, 1, 93, Lp.length); for (const v of Lp) { const A = P(v); out.push(10, A[0], 20, A[1]); } out.push(97, 0); });
        out.push(75, 0, 76, solid ? 1 : 2);
        if (!solid) {
          const fam = patFamilies(e.pat, m), c = Math.cos(ang), sn = Math.sin(ang), R = v => [v[0] * c - v[1] * sn, v[0] * sn + v[1] * c];
          out.push(52, num(deg(ang)), 41, num(e.ps || 1), 77, 0, 78, fam.length);
          for (const f of fam) { const B = R(f.base), F = R(f.off); out.push(53, num(f.a + deg(ang)), 43, num(B[0] + ctx.O[0] * ctx.U), 44, num(B[1] + ctx.O[1] * ctx.U), 45, num(F[0]), 46, num(F[1]), 79, f.dash.length); for (const d of f.dash) out.push(49, num(d)); }
        }
        const s0 = P(e.loops[0][0]); out.push(98, 1, 10, s0[0], 20, s0[1]);
      } else if (e.t === 'adim') {
        // kątowy / promień / średnica: blok *D z wyglądem jak w Rysiu i DIMENSION z punktami definicji
        const g = adimGeom(e, ctx.k), db = { name: '*D' + (dimBlocks.length + 1), br: H(), blk: H(), end: H(), body: [] };
        const sub = { ...ctx, owner: db.br, paper: false }, st = { layer: e.layer, w: e.w, lt: null };
        const parts = [...g.lines.map(([a, b]) => ({ t: 'line', a, b, ...st })), ...g.arcs.map(q => ({ t: 'arc', ...q, ...st })), ...g.arrows.flatMap(ar => arrowSegs(ar, ctx.k).map(([a, b]) => ({ t: 'line', a, b, ...st })))];
        const label = adimText(g, v => dimText(v, ctx.paper));
        ents(sub, parts, db.body);
        ents(sub, [{ t: 'text', p: g.text.p, s: label, h: g.text.h / ctx.k, align: 'c', rot: g.text.ang, layer: e.layer, w: null }], db.body);
        dimBlocks.push(db);
        const T = P(g.text.p);
        head('DIMENSION', e);
        if (e.k === 'ang') {
          const q = g.arcs[0], C = P(e.c), A1 = P(V.polar(q.c, q.r, q.a0)), A2 = P(V.polar(q.c, q.r, q.a1)), M = P(V.polar(q.c, q.r, q.a0 + (q.a1 - q.a0 + (q.a1 < q.a0 ? 2 * Math.PI : 0)) / 2));
          out.push(100, 'AcDbDimension', 2, db.name, 10, A2[0], 20, A2[1], 30, 0, 11, T[0], 21, T[1], 31, 0, 70, 32 + 2, 1, esc(label), 3, 'Standard',
            100, 'AcDb2LineAngularDimension', 13, C[0], 23, C[1], 33, 0, 14, A1[0], 24, A1[1], 34, 0, 15, C[0], 25, C[1], 35, 0, 16, M[0], 26, M[1], 36, 0);
        } else {
          const d = V.norm(V.sub(e.o, e.c)), dd = (d[0] || d[1]) ? d : [1, 0], C = P(e.c), E = P(V.add(e.c, V.mul(dd, e.r))), F = P(V.sub(e.c, V.mul(dd, e.r))), lead = Math.max(0, V.dist(e.o, e.c) - e.r) * ctx.U;
          const dia = e.k === 'dia';
          out.push(100, 'AcDbDimension', 2, db.name, 10, (dia ? F : C)[0], 20, (dia ? F : C)[1], 30, 0, 11, T[0], 21, T[1], 31, 0, 70, 32 + (dia ? 3 : 4), 1, esc(label), 3, 'Standard',
            100, dia ? 'AcDbDiametricDimension' : 'AcDbRadialDimension', 15, E[0], 25, E[1], 35, 0, 40, num(lead));
        }
      } else if (e.t === 'dim') {
        // blok *D z wyglądem wymiaru i DIMENSION, który go wskazuje (programy CAD pokazują blok, a wartość znają z punktów)
        const g = dimGeom(e), db = { name: '*D' + (dimBlocks.length + 1), br: H(), blk: H(), end: H(), body: [] };
        const sub = { ...ctx, owner: db.br, paper: false };
        const looks = []; const sink = { line: (a, b) => looks.push({ t: 'line', a, b, layer: e.layer, w: e.w, lt: null }), text: (p, s, hh, al, rot) => looks.push({ t: '_text', p, s, hh, al, rot, layer: e.layer }) };
        const tp = dimLook(e, g, sink);
        for (const x of looks) { if (x.t === 'line') ents(sub, [x], db.body); else { const tmp = []; ents({ ...sub }, [{ t: 'text', p: x.p, s: x.s, h: x.hh / ctx.k, align: x.al, rot: x.rot, layer: x.layer, w: null }], tmp); db.body.push(...tmp); } }
        dimBlocks.push(db);
        const D2 = P(g.d2), T = P(tp), A = P(e.a), B = P(e.b), aligned = e.dir === 'a';
        head('DIMENSION', e);
        out.push(100, 'AcDbDimension', 2, db.name, 10, D2[0], 20, D2[1], 30, 0, 11, T[0], 21, T[1], 31, 0, 70, 32 + (aligned ? 1 : 0), 1, esc(dimText(g.value, ctx.paper)), 3, 'Standard',
          100, 'AcDbAlignedDimension', 13, A[0], 23, A[1], 33, 0, 14, B[0], 24, B[1], 34, 0);
        if (!aligned) out.push(50, e.dir === 'v' ? 90 : 0, 100, 'AcDbRotatedDimension');
      } else n--;
    }
    return n;
  };
  // liczba wymiaru w jednostce rysunku (na arkuszu — w milimetrach papieru × skala nieznana, więc jak w modelu)
  const dimText = (v, paper) => paper ? String(Math.round(v * 1000)) : doc.units === 'mm' ? String(Math.round(v * 1000)) : doc.units === 'cm' ? (v * 100).toFixed(1).replace('.', DEC) : v.toFixed(2).replace('.', DEC);

  // model
  const modelOut = []; setAnno(kM);
  const count = ents({ owner: h.brModel, paper: false, O: O0, U, k: kM }, doc.ents.filter(e => !e.sp), modelOut);
  // bloki użytkownika (w układzie bloku, bez przesunięcia)
  for (const B of blocks) { B.body = []; ents({ owner: B.br, paper: false, O: [0, 0], U, k: kM }, doc.ents.filter(e => e.sp === 'b' + B.b.id), B.body); }
  // arkusze: milimetry papieru; okna jako VIEWPORT, ramka i tabelka na warstwie RAMKA
  setAnno(0.001);
  for (const S of spaces) {
    S.body = []; if (!S.sh) continue;
    const ctx = { owner: S.br, paper: true, O: [0, 0], U: 1000, k: 0.001 };
    ents(ctx, doc.ents.filter(e => e.sp === S.sh.id && e.t !== 'vp'), S.body);
    // ramka: nagrywamy linie i napisy rysowane przez arkusz
    const rec = [];
    const pen = { ppm: 1000, style() {}, line: (a, b) => rec.push({ t: 'line', a, b }), poly: (pts, closed) => { for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) rec.push({ t: 'line', a: pts[i], b: pts[(i + 1) % pts.length] }); }, text: (p, s, hh) => rec.push({ t: 'text', p, s, h: hh * 1000 }) };
    drawFrame(pen, doc, S.sh, { mono: true, ink: '#000000', exact: true });
    ents(ctx, rec.map(x => ({ ...x, layer: doc.layers[0].id, _layerName: frameLayer, w: x.t === 'line' ? 0.35 : null, lt: null, align: 'l', rot: 0 })), S.body);
    for (const v of doc.ents.filter(e => e.sp === S.sh.id && e.t === 'vp')) {
      const b = [Math.min(v.a[0], v.b[0]), Math.min(v.a[1], v.b[1]), Math.max(v.a[0], v.b[0]), Math.max(v.a[1], v.b[1])];
      const cx = (b[0] + b[2]) / 2 * 1000, cy = (b[1] + b[3]) / 2 * 1000, W = (b[2] - b[0]) * 1000, Hh = (b[3] - b[1]) * 1000;
      S.vps = S.vps || []; S.vps.push({ cx, cy, W, H: Hh, vc: [(v.c[0] + O0[0]) * U, (v.c[1] + O0[1]) * U], vh: (b[3] - b[1]) * v.scale * U, frozen: (v.hidden || []).map(id => lh.get(id)).filter(Boolean), layer: names.get(v.layer) || '0', h: H() });
    }
  }
  setAnno(keepAnno);

  // --- nagłówek ---
  const seed = () => (hn + 1).toString(16).toUpperCase();
  put(999, 'Rysio - jednostki ' + units);
  const header = () => {
    put(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 9, '$DWGCODEPAGE', 3, 'ANSI_1250', 9, '$INSBASE', 10, 0, 20, 0, 30, 0,
      9, '$LTSCALE', 40, 1, 9, '$PSLTSCALE', 70, 1, 9, '$DIMSCALE', 40, doc.scale, 9, '$INSUNITS', 70, { m: 6, cm: 5, mm: 4 }[units], 9, '$MEASUREMENT', 70, 1, 9, '$LUNITS', 70, 2,
      9, '$LWDISPLAY', 290, 1, 9, '$CELWEIGHT', 370, -1, 9, '$HANDSEED', 5, seed(), 0, 'ENDSEC');
  };
  // uchwyty wszystkich tabel muszą być znane przed zapisem — liczymy je teraz
  const brAll = [{ name: '*Model_Space', br: h.brModel, lo: h.loModel }, ...spaces.map(S => ({ name: S.name, br: S.br, lo: S.lo })), ...blocks.map(B => ({ name: B.name, br: B.br, lo: '0' })), ...dimBlocks.map(D => ({ name: D.name, br: D.br, lo: '0' }))];
  for (const S of spaces) if (!S.vps) S.vps = [];
  const pstyleH = h.normal;
  const objH = spaces.map(() => null);   // (miejsce na przyszłość)
  void objH;
  header();
  put(0, 'SECTION', 2, 'CLASSES', 0, 'ENDSEC');

  // --- tabele ---
  put(0, 'SECTION', 2, 'TABLES');
  const table = (name, hh, n, extra = []) => put(0, 'TABLE', 2, name, 5, hh, 330, 0, 100, 'AcDbSymbolTable', 70, n, ...extra);
  const rec = (type, hh, owner, sub) => put(0, type, 5, hh, 330, owner, 100, 'AcDbSymbolTableRecord', 100, sub);
  table('VPORT', h.tVport, 1);
  rec('VPORT', h.vpActive, h.tVport, 'AcDbViewportTableRecord');
  put(2, '*ACTIVE', 70, 0, 10, 0, 20, 0, 11, 1, 21, 1, 12, 0, 22, 0, 13, 0, 23, 0, 14, 1, 24, 1, 15, 1, 25, 1, 16, 0, 26, 0, 36, 1, 17, 0, 27, 0, 37, 0, 40, 100, 41, 1.5, 42, 50, 43, 0, 44, 0, 50, 0, 51, 0, 71, 0, 72, 1000, 73, 1, 74, 3, 75, 0, 76, 0, 77, 0, 78, 0, 281, 0, 65, 1, 110, 0, 120, 0, 130, 0, 111, 1, 121, 0, 131, 0, 112, 0, 122, 1, 132, 0, 79, 0, 146, 0);
  put(0, 'ENDTAB');
  table('LTYPE', h.tLtype, 3 + lts.length);
  for (const [hh, nm] of [[h.ltByBlock, 'ByBlock'], [h.ltByLayer, 'ByLayer'], [h.ltCont, 'Continuous']]) { rec('LTYPE', hh, h.tLtype, 'AcDbLinetypeTableRecord'); put(2, nm, 70, 0, 3, nm === 'Continuous' ? 'Solid line' : '', 72, 65, 73, 0, 40, 0); }
  for (const t of lts) {
    const pat = LTYPES[t.id].dash.map((v, m) => (m % 2 ? -1 : 1) * v * kM * U * (t.id === 'dot' && m % 2 === 0 ? 0 : 1));
    rec('LTYPE', t.h, h.tLtype, 'AcDbLinetypeTableRecord'); put(2, t.name, 70, 0, 3, esc(LTYPES[t.id].name), 72, 65, 73, pat.length, 40, num(pat.reduce((a, b) => a + Math.abs(b), 0)));
    for (const v of pat) put(49, num(v), 74, 0);
  }
  put(0, 'ENDTAB');
  table('LAYER', h.tLayer, doc.layers.length + 2);
  rec('LAYER', h.layer0, h.tLayer, 'AcDbLayerTableRecord'); put(2, '0', 70, 0, 62, 7, 6, 'Continuous', 370, -3, 390, pstyleH);
  for (const L of doc.layers) { const c = nearestAci(L.color); rec('LAYER', lh.get(L.id), h.tLayer, 'AcDbLayerTableRecord'); put(2, names.get(L.id), 70, L.locked ? 4 : 0, 62, L.visible ? c : -c, 6, ltName(L.lt), 370, lwOf(L.w), 390, pstyleH); }
  rec('LAYER', frameH, h.tLayer, 'AcDbLayerTableRecord'); put(2, frameLayer, 70, 0, 62, 7, 6, 'Continuous', 370, 35, 390, pstyleH);
  put(0, 'ENDTAB');
  table('STYLE', h.tStyle, 1);
  rec('STYLE', h.stStd, h.tStyle, 'AcDbTextStyleTableRecord'); put(2, 'Standard', 70, 0, 40, 0, 41, 1, 50, 0, 71, 0, 42, 2.5, 3, 'arial.ttf', 4, '');
  put(0, 'ENDTAB');
  table('VIEW', h.tView, 0); put(0, 'ENDTAB');
  table('UCS', h.tUcs, 0); put(0, 'ENDTAB');
  table('APPID', h.tAppid, 1);
  rec('APPID', h.appAcad, h.tAppid, 'AcDbRegAppTableRecord'); put(2, 'ACAD', 70, 0);
  put(0, 'ENDTAB');
  put(0, 'TABLE', 2, 'DIMSTYLE', 5, h.tDim, 330, 0, 100, 'AcDbSymbolTable', 70, 1, 100, 'AcDbDimStyleTable', 71, 0);
  put(0, 'DIMSTYLE', 105, h.dimStd, 330, h.tDim, 100, 'AcDbSymbolTableRecord', 100, 'AcDbDimStyleTableRecord', 2, 'Standard', 70, 0, 40, doc.scale, 41, DIM_TICK, 42, 1, 44, DIM_EXT, 140, DIM_H, 340, h.stStd);
  put(0, 'ENDTAB');
  table('BLOCK_RECORD', h.tBr, brAll.length);
  for (const B of brAll) { rec('BLOCK_RECORD', B.br, h.tBr, 'AcDbBlockTableRecord'); put(2, B.name, 340, B.lo); }
  put(0, 'ENDTAB');
  put(0, 'ENDSEC');

  // --- bloki ---
  put(0, 'SECTION', 2, 'BLOCKS');
  const block = (name, br, blk, end, body, paper, flags = 0) => {
    put(0, 'BLOCK', 5, blk, 330, br, 100, 'AcDbEntity'); if (paper) put(67, 1);
    put(8, '0', 100, 'AcDbBlockBegin', 2, name, 70, flags, 10, 0, 20, 0, 30, 0, 3, name, 1, '');
    if (body) put(...body);
    put(0, 'ENDBLK', 5, end, 330, br, 100, 'AcDbEntity'); if (paper) put(67, 1);
    put(8, '0', 100, 'AcDbBlockEnd');
  };
  const vpEnts = (S) => {
    const out = [], [W, Hh] = S.sh ? sheetSize(S.sh).map(v => v * 1000) : [420, 297];
    const one = (v, id) => {
      out.push(0, 'VIEWPORT', 5, v.h, 330, S.br, 100, 'AcDbEntity', 67, 1, 8, v.layer || '0', 100, 'AcDbViewport', 10, num(v.cx), 20, num(v.cy), 30, 0, 40, num(v.W), 41, num(v.H), 69, id,
        12, num(v.vc[0]), 22, num(v.vc[1]), 13, 0, 23, 0, 14, 10, 24, 10, 15, 10, 25, 10, 16, 0, 26, 0, 36, 1, 17, 0, 27, 0, 37, 0, 42, 50, 43, 0, 44, 0, 45, num(v.vh), 50, 0, 51, 0, 72, 1000);
      for (const f of v.frozen || []) out.push(341, f);
      out.push(90, 32864, 1, '', 281, 0, 71, 1, 74, 0, 110, 0, 120, 0, 130, 0, 111, 1, 121, 0, 131, 0, 112, 0, 122, 1, 132, 0, 79, 0, 146, 0);
    };
    one({ h: S.vp1, cx: W / 2, cy: Hh / 2, W: W * 1.05, H: Hh * 1.05, vc: [W / 2, Hh / 2], vh: Hh * 1.05 }, 1);
    S.vps.forEach((v, i) => one(v, i + 2));
    return out;
  };
  block('*Model_Space', h.brModel, h.blkModel, h.endModel, null, false);
  spaces.forEach((S, i) => block(S.name, S.br, S.blk, S.end, i === 0 ? null : [...vpEnts(S), ...S.body], true));
  for (const B of blocks) block(B.name, B.br, B.blk, B.end, B.body, false);
  for (const D of dimBlocks) block(D.name, D.br, D.blk, D.end, D.body, false, 1);
  put(0, 'ENDSEC');

  // --- elementy: model i pierwszy arkusz ---
  put(0, 'SECTION', 2, 'ENTITIES');
  put(...modelOut);
  put(...vpEnts(spaces[0]), ...spaces[0].body);
  put(0, 'ENDSEC');

  // --- obiekty: słowniki i układy wydruku ---
  put(0, 'SECTION', 2, 'OBJECTS');
  put(0, 'DICTIONARY', 5, h.root, 330, 0, 100, 'AcDbDictionary', 281, 1, 3, 'ACAD_GROUP', 350, h.groups, 3, 'ACAD_LAYOUT', 350, h.layouts, 3, 'ACAD_PLOTSTYLENAME', 350, h.pstyles);
  put(0, 'DICTIONARY', 5, h.groups, 102, '{ACAD_REACTORS', 330, h.root, 102, '}', 330, h.root, 100, 'AcDbDictionary', 281, 1);
  put(0, 'DICTIONARY', 5, h.layouts, 102, '{ACAD_REACTORS', 330, h.root, 102, '}', 330, h.root, 100, 'AcDbDictionary', 281, 1, 3, 'Model', 350, h.loModel);
  const loNames = spaces.map((S, i) => { const base = S.sh ? layerName(S.sh.name).slice(0, 200) : 'Arkusz'; let nm = base, m = 2; const prev = new Set(spaces.slice(0, i).map(x => x._nm)); while (prev.has(nm) || nm === 'Model') nm = base + '_' + m++; S._nm = nm; return nm; });
  spaces.forEach((S, i) => put(3, loNames[i], 350, S.lo));
  put(0, 'ACDBDICTIONARYWDFLT', 5, h.pstyles, 102, '{ACAD_REACTORS', 330, h.root, 102, '}', 330, h.root, 100, 'AcDbDictionary', 281, 1, 3, 'Normal', 350, h.normal, 100, 'AcDbDictionaryWithDefault', 340, h.normal);
  put(0, 'ACDBPLACEHOLDER', 5, h.normal, 102, '{ACAD_REACTORS', 330, h.pstyles, 102, '}', 330, h.pstyles);
  const layout = (hh, name, br, tab, W, Hh, model) => {
    put(0, 'LAYOUT', 5, hh, 102, '{ACAD_REACTORS', 330, h.layouts, 102, '}', 330, h.layouts, 100, 'AcDbPlotSettings', 1, '', 2, 'none_device', 4, model ? '' : `Rysio_${Math.round(W)}x${Math.round(Hh)}_mm`, 6, '',
      40, 0, 41, 0, 42, 0, 43, 0, 44, num(W), 45, num(Hh), 46, 0, 47, 0, 48, 0, 49, 0, 140, 0, 141, 0, 142, 1, 143, 1, 70, model ? 1712 : 688, 72, 1, 73, 0, 74, model ? 0 : 5, 7, '', 75, model ? 0 : 16, 147, 1, 148, 0, 149, 0,
      100, 'AcDbLayout', 1, name, 70, 1, 71, tab, 10, 0, 20, 0, 11, num(W), 21, num(Hh), 12, 0, 22, 0, 32, 0, 14, 0, 24, 0, 34, 0, 15, num(W), 25, num(Hh), 35, 0, 146, 0,
      13, 0, 23, 0, 33, 0, 16, 1, 26, 0, 36, 0, 17, 0, 27, 1, 37, 0, 76, 0, 330, br);
  };
  layout(h.loModel, 'Model', h.brModel, 0, 420, 297, true);
  spaces.forEach((S, i) => { const [W, Hh] = S.sh ? sheetSize(S.sh).map(v => v * 1000) : [420, 297]; layout(S.lo, loNames[i], S.br, i + 1, W, Hh, false); });
  put(0, 'ENDSEC', 0, 'EOF');
  return { text: o.join('\r\n') + '\r\n', count, units };
}
