// Biblioteka bloków: zwykły folder z plikami DXF — jeden plik to jeden blok, podfoldery to kategorie.
// Plik czyta i zapisuje proces główny (main.js: lib-*), tu jest zamiana plik ↔ blok:
//   libPack   — tekst DXF → paczka jak w schowku (warstwy i bloki po nazwie, główny blok na końcu, nazwany jak plik)
//   importLib — paczka → blok w rysunku (w transakcji cofania); blok o tej samej nazwie już jest → ten
//   libFile   — blok z rysunku → tekst DXF (punkt wstawienia bloku w zerze pliku, w modelu jedno wstawienie)
//   starterFiles — kilkanaście prostych bloków na start, do pustego folderu
// Elementy na warstwie „0” (jak w bibliotekach AutoCAD-a i w blokach startowych) trafiają na bieżącą warstwę rysunku.
import { _t } from './i18n.js';
import { newDoc } from './model.js';
import { moved } from './geom.js';
import { transformed, insT } from './edit.js';
import { packClip, pasteClip, clipGhosts } from './clip.js';
import { parseDxf, writeDxf, layerName } from './dxf.js';

// porównanie nazw warstw bez polskich liter (DXF zapisuje je bez ogonków) i bez wielkości liter
export const fold = s => layerName(s).toUpperCase();
// nazwa pliku: bez znaków, których Windows nie przyjmie
// (kropka na początku ukryłaby plik, kropka i spacja na końcu oraz nazwy CON, NUL, COM1… są w Windows zakazane)
export function fileSafe(s) {
  let n = String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim().replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  if (!n) n = 'Blok';
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(n)) n += '_';
  return n;
}

// tekst albo bajty DXF → { layers, blocks: [{ name, ents }] } — bloki zagnieżdżone najpierw, główny ostatni
export function libPack(data, name, scale) {
  const { doc, info } = parseDxf(data, { scale });
  const model = doc.ents.filter(e => !e.sp && e.t !== 'vp');
  if (!model.length) throw new Error(_t('W pliku nie ma rysunku.'));
  const p = packClip(doc, model, { sheet: false, scale: doc.scale });
  // plik z jednym wstawieniem bloku (tak zapisuje Rysio) → treść tego bloku; inaczej cały model za punktem bazowym pliku
  // (obrót, skala i odbicie tego wstawienia zostają w bloku — wstawia się tak, jak wygląda w pliku)
  if (model.length === 1 && model[0].t === 'ins') {
    const ins = model[0], T = insT({ ...ins, p: [0, 0] }), same = !ins.rot && (ins.s || 1) === 1 && !ins.mx;
    const ents = p.blocks[p.blocks.length - 1].ents.map(e => { if (same) return e; const f = transformed(e, T); return f ? { ...e, ...f } : e; });
    return { layers: p.layers, blocks: [...p.blocks.slice(0, -1), { name, ents }] };
  }
  const d = [-info.base[0], -info.base[1]];
  return { layers: p.layers, blocks: [...p.blocks, { name, ents: p.ents.map(e => ({ ...e, ...moved(e, d) })) }] };
}

// elementy płasko (bloki zagnieżdżone rozbite) — do miniatury
export const libGhosts = pack => clipGhosts({ blocks: pack.blocks, ents: [{ t: 'ins', b: pack.blocks[pack.blocks.length - 1].name, p: [0, 0], rot: 0, s: 1, mx: false, layer: '0' }] }, 1, [0, 0], 4000);

// paczka → id bloku w rysunku (w transakcji tx)
export function importLib(tx, doc, pack) {
  const name = pack.blocks[pack.blocks.length - 1].name;
  const have = doc.blocks.find(b => b.name === name); if (have) return have.id;
  const cur = (doc.layers.find(L => L.id === doc.cur.layer) || doc.layers[0]).name;
  const map = new Map();
  for (const L of pack.layers) {
    if (L.name === '0') { map.set('0', cur); continue; }
    const m = doc.layers.find(x => x.name === L.name) || doc.layers.find(x => fold(x.name) === fold(L.name));
    map.set(L.name, m ? m.name : L.name);
  }
  const rl = e => ({ ...e, layer: map.has(e.layer) ? map.get(e.layer) : e.layer === '0' ? cur : e.layer });
  const clip = { layers: pack.layers.filter(L => map.get(L.name) === L.name), blocks: pack.blocks.map(b => ({ name: b.name, ents: b.ents.map(rl) })), ents: [] };
  return pasteClip(tx, doc, clip, { k: 1, d: [0, 0], toSheet: false }).blocks.get(name);
}

// blok z rysunku → tekst DXF; base — punkt wstawienia w układzie bloku (zwykle [0, 0])
export function libFile(doc, blockId, name, base = [0, 0]) {
  const ids = [], seen = new Set();
  const walk = id => { if (seen.has(id)) return; seen.add(id); for (const e of doc.ents) if (e.sp === 'b' + id && e.t === 'ins') walk(e.b); ids.push(id); };
  walk(blockId);
  const d = [-base[0], -base[1]], shift = base[0] || base[1];
  const ents = doc.ents.filter(e => typeof e.sp === 'string' && ids.includes(+e.sp.slice(1))).map(e => shift && e.sp === 'b' + blockId ? { ...e, ...moved(e, d) } : e);
  const used = new Set(ents.map(e => e.layer));
  const t = newDoc();
  t.units = doc.units; t.scale = doc.scale;
  t.layers = doc.layers.filter(L => used.has(L.id)).map(L => ({ ...L, visible: true, locked: false }));
  if (!t.layers.length) t.layers = [{ ...doc.layers[0] }];
  t.blocks = doc.blocks.filter(b => ids.includes(b.id)).map(b => b.id === blockId ? { ...b, name } : b);
  const id = Math.max(doc.next || 0, ...doc.ents.map(e => e.id)) + 1;
  t.ents = [...ents, { id, t: 'ins', b: blockId, p: [0, 0], rot: 0, s: 1, mx: false, layer: t.layers[0].id, w: null, lt: null }];
  t.cur = { layer: t.layers[0].id, w: null, lt: null }; t.next = id + 1;
  return writeDxf(t).text;
}

/* ---------- bloki na start ---------- */
// wymiary w metrach, punkt wstawienia w zerze; oś Y w górę
const R = (x, y, w, h) => ({ t: 'pline', pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true });
const RR = (x, y, w, h, r) => { const b = Math.tan(Math.PI / 8); return { t: 'pline', closed: true, pts: [[x + r, y], [x + w - r, y, b], [x + w, y + r], [x + w, y + h - r, b], [x + w - r, y + h], [x + r, y + h, b], [x, y + h - r], [x, y + r, b]] }; };
const L = (x1, y1, x2, y2, lt = null) => ({ t: 'line', a: [x1, y1], b: [x2, y2], lt });
const C = (x, y, r) => ({ t: 'circle', c: [x, y], r });
const A = (x, y, r, a0, a1) => ({ t: 'arc', c: [x, y], r, a0: a0 * Math.PI / 180, a1: a1 * Math.PI / 180 });
const door = w => [R(0, 0, 0.04, w), A(0, 0, w, 0, 90)];
const win = w => [R(0, 0, w, 0.25), L(0, 0.11, w, 0.11), L(0, 0.14, w, 0.14)];
const stairs = (n, run = 0.27, wd = 1) => [R(0, 0, n * run, wd), ...Array.from({ length: n - 1 }, (_, i) => L((i + 1) * run, 0, (i + 1) * run, wd)),
  L(run / 2, wd / 2, n * run - 0.12, wd / 2), L(n * run - 0.24, wd / 2 - 0.08, n * run - 0.12, wd / 2), L(n * run - 0.24, wd / 2 + 0.08, n * run - 0.12, wd / 2)];

function starters() {
  const D = _t('Drzwi i okna'), M = _t('Meble'), Ł = _t('Łazienka'), K = _t('Kuchnia'), S = _t('Schody');
  return [
    [D, _t('Drzwi 90'), door(0.9)],
    [D, _t('Drzwi 80'), door(0.8)],
    [D, _t('Drzwi przesuwne 90'), [R(0, 0.01, 0.5, 0.04), R(0.4, -0.05, 0.5, 0.04)]],
    [D, _t('Okno 120'), win(1.2)],
    [D, _t('Okno 90'), win(0.9)],
    [M, _t('Stół 80×160'), [R(-0.8, -0.4, 1.6, 0.8), R(-0.6, 0.45, 0.42, 0.4), R(0.18, 0.45, 0.42, 0.4), R(-0.6, -0.85, 0.42, 0.4), R(0.18, -0.85, 0.42, 0.4), R(-1.3, -0.21, 0.4, 0.42), R(0.9, -0.21, 0.4, 0.42)]],
    [M, _t('Stół okrągły ø100'), [C(0, 0, 0.5), R(-0.21, 0.55, 0.42, 0.4), R(-0.21, -0.95, 0.42, 0.4), R(-0.95, -0.21, 0.4, 0.42), R(0.55, -0.21, 0.4, 0.42)]],
    [M, _t('Łóżko 160×200'), [R(-0.8, -2, 1.6, 2), R(-0.7, -0.45, 0.65, 0.35), R(0.05, -0.45, 0.65, 0.35), L(-0.8, -0.65, 0.8, -0.65)]],
    [M, _t('Sofa 3-osobowa'), [R(-1.1, -0.9, 2.2, 0.9), L(-0.9, -0.2, 0.9, -0.2), L(-0.9, 0, -0.9, -0.9), L(0.9, 0, 0.9, -0.9), L(-0.3, -0.2, -0.3, -0.9), L(0.3, -0.2, 0.3, -0.9)]],
    [M, _t('Fotel'), [R(-0.425, -0.85, 0.85, 0.85), L(-0.27, 0, -0.27, -0.85), L(0.27, 0, 0.27, -0.85), L(-0.27, -0.2, 0.27, -0.2)]],
    [M, _t('Szafa 60×180'), [R(-0.9, -0.6, 1.8, 0.6), L(-0.3, 0, -0.3, -0.6), L(0.3, 0, 0.3, -0.6), L(-0.9, -0.3, 0.9, -0.3, 'dash')]],
    [M, _t('Biurko 140'), [R(-0.7, -0.7, 1.4, 0.7), R(-0.22, -1.15, 0.44, 0.4)]],
    [Ł, _t('Miska WC'), [R(-0.18, -0.17, 0.36, 0.17), { t: 'pline', closed: false, pts: [[-0.17, -0.17], [-0.17, -0.45, 1], [0.17, -0.45], [0.17, -0.17]] }]],
    [Ł, _t('Umywalka 60'), [R(-0.3, -0.45, 0.6, 0.45), C(0, -0.24, 0.16), L(0, -0.02, 0, -0.07)]],
    [Ł, _t('Wanna 170×75'), [R(0, -0.75, 1.7, 0.75), RR(0.07, -0.68, 1.56, 0.61, 0.2), C(1.48, -0.375, 0.03)]],
    [Ł, _t('Brodzik 90×90'), [R(0, -0.9, 0.9, 0.9), L(0, 0, 0.9, -0.9), L(0.9, 0, 0, -0.9), C(0.45, -0.45, 0.05)]],
    [Ł, _t('Pralka'), [R(-0.3, -0.6, 0.6, 0.6), C(0, -0.33, 0.2)]],
    [K, _t('Zlewozmywak'), [R(0, -0.5, 1, 0.5), RR(0.06, -0.44, 0.4, 0.36, 0.05), RR(0.54, -0.44, 0.4, 0.36, 0.05)]],
    [K, _t('Płyta 4-polowa'), [R(0, -0.52, 0.6, 0.52), C(0.15, -0.13, 0.08), C(0.43, -0.13, 0.08), C(0.15, -0.37, 0.1), C(0.43, -0.37, 0.07)]],
    [K, _t('Lodówka 60'), [R(0, -0.6, 0.6, 0.6), L(0, 0, 0.6, -0.6)]],
    [S, _t('Schody proste 10'), stairs(10)],
    [S, _t('Schody proste 14'), stairs(14)]
  ];
}
// [{ rel: 'Kategoria/Nazwa.dxf', text }]
export function starterFiles(scale = 50) {
  return starters().map(([cat, name, list]) => {
    const t = newDoc(); t.units = 'm'; t.scale = scale;
    t.blocks = [{ id: 1, name }];
    t.ents = [...list.map((e, i) => ({ w: null, lt: null, ...e, id: 10 + i, layer: 1, sp: 'b1', _layerName: '0' })),
      { id: 9, t: 'ins', b: 1, p: [0, 0], rot: 0, s: 1, mx: false, layer: 1, w: null, lt: null, _layerName: '0' }];
    t.next = 10 + list.length;
    return { rel: fileSafe(cat) + '/' + fileSafe(name) + '.dxf', text: writeDxf(t).text };
  });
}
