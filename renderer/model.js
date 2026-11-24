// Rysunek Rysia: warstwy, elementy, kreski i jedyna droga zmiany — edit() z historią cofania.
// Geometria w metrach (oś Y w górę, jak w DXF); grubości w milimetrach papieru. Opis: ARCHITEKTURA.md.
import { _t } from './i18n.js';

export const FORMAT_VERSION = 1;
// grubości z szeregu ISO 128 (mm)
export const WEIGHTS = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0, 1.4, 2.0];
// rodzaje linii: wzór kresek w milimetrach papieru (kreska, przerwa, …); pusty = ciągła
export const LTYPES = {
  solid: { name: _t('ciągła'), dash: [] },
  dash: { name: _t('kreskowa'), dash: [3, 1.5] },
  center: { name: _t('osiowa'), dash: [8, 1.5, 0.6, 1.5] },
  dot: { name: _t('punktowa'), dash: [0.05, 1.2] }
};
export const LTYPE_IDS = Object.keys(LTYPES);
export const LAYER_COLORS = ['#1a1a19', '#6a6a66', '#c0533f', '#d08a3c', '#4f8a46', '#3f8a8a', '#4d6597', '#7a5aa0', '#b0489e', '#9a948a'];
export const SCALES = [1, 5, 10, 20, 50, 100, 200, 500, 1000];

export function newDoc() {
  return {
    format: 'rysio', version: FORMAT_VERSION, units: 'm', scale: 50,
    layers: [{ id: 1, name: _t('Rysunek'), color: '#1a1a19', visible: true, locked: false, w: 0.35, lt: 'solid' }],
    cur: { layer: 1, w: null, lt: null },
    ents: [], next: 2,
    // arkusze (etap 2): elementy arkusza leżą w doc.ents z polem sp = numer arkusza, w metrach papieru (1 mm = 0,001)
    sheets: [],
    project: { projekt: '', projektant: '', data: '' }
  };
}

/* ---------- arkusze ---------- */
// formaty w milimetrach (szerokość × wysokość w pionie)
export const PAPER = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] };
// wymiary arkusza w metrach papieru [szer., wys.]
export function sheetSize(sh) { const [a, b] = PAPER[sh.size] || PAPER.A3; return sh.land ? [b / 1000, a / 1000] : [a / 1000, b / 1000]; }
export const newSheet = (id, n) => ({ id, name: _t`Arkusz ${n}`, size: 'A3', land: true, frame: true, title: { rysunek: '', nr: '' } });
// przestrzeń elementu: 0 — model, liczba — arkusz
export const spaceOf = e => e.sp || 0;
// wysokość tekstu i wymiarów jest w milimetrach wydruku; w przestrzeni o skali 1:k to k/1000 metra na milimetr
export const annoK = scale => scale / 1000;

// Uzupełnia braki i podnosi starsze wersje formatu (każda nowa wersja = nowy krok tutaj, stare kroki zostają).
export function fixDoc(d) {
  if (!d || typeof d !== 'object') throw new Error(_t('To nie jest rysunek Rysia.'));
  if (d.format && d.format !== 'rysio') throw new Error(_t('To nie jest rysunek Rysia.'));
  if ((d.version || 1) > FORMAT_VERSION) throw new Error(_t('Ten rysunek zapisała nowsza wersja Rysia — zaktualizuj program.'));
  const doc = Object.assign(newDoc(), d);
  doc.version = FORMAT_VERSION;
  if (!Array.isArray(doc.layers) || !doc.layers.length) doc.layers = newDoc().layers;
  for (const L of doc.layers) {
    L.visible = L.visible !== false; L.locked = !!L.locked;
    if (!WEIGHTS.includes(L.w) && typeof L.w !== 'number') L.w = 0.25;
    if (!LTYPES[L.lt]) L.lt = 'solid';
    if (!L.color) L.color = '#1a1a19';
  }
  doc.ents = (doc.ents || []).filter(e => e && ENT_TYPES.has(e.t));
  for (const e of doc.ents) { if (!doc.layers.some(L => L.id === e.layer)) e.layer = doc.layers[0].id; if (e.w === undefined) e.w = null; if (e.lt === undefined) e.lt = null; }
  const maxId = Math.max(0, ...doc.ents.map(e => e.id || 0), ...doc.layers.map(L => L.id));
  for (const e of doc.ents) if (!e.id) e.id = 0;
  let n = maxId + 1; for (const e of doc.ents) if (!e.id) e.id = n++;
  doc.next = Math.max(doc.next || 1, n, ...(Array.isArray(d.sheets) ? d.sheets.map(sh => (sh && sh.id || 0) + 1) : []));
  doc.cur = Object.assign({ layer: doc.layers[0].id, w: null, lt: null }, doc.cur);
  if (!doc.layers.some(L => L.id === doc.cur.layer)) doc.cur.layer = doc.layers[0].id;
  doc.sheets = (Array.isArray(doc.sheets) ? doc.sheets : []).filter(sh => sh && sh.id).map(sh => Object.assign(newSheet(sh.id, 1), sh, { title: Object.assign({ rysunek: '', nr: '' }, sh.title) }));
  doc.project = Object.assign({ projekt: '', projektant: '', data: '' }, doc.project);
  // elementy z nieistniejących arkuszy i okna poza arkuszem znikają
  doc.ents = doc.ents.filter(e => (!e.sp || doc.sheets.some(sh => sh.id === e.sp)) && (e.t !== 'vp' || e.sp));
  for (const e of doc.ents) if (e.t === 'vp') { e.hidden = Array.isArray(e.hidden) ? e.hidden : []; if (!(e.scale > 0)) e.scale = 100; }
  if (!(doc.scale > 0)) doc.scale = 50;
  if (!['m', 'cm', 'mm'].includes(doc.units)) doc.units = 'm';
  return doc;
}
const ENT_TYPES = new Set(['line', 'pline', 'circle', 'arc', 'text', 'dim', 'vp']);

export const layerOf = (doc, e) => doc.layers.find(L => L.id === e.layer) || doc.layers[0];
// kreska elementu po uwzględnieniu „jak warstwa”
export function strokeOf(doc, e) { const L = layerOf(doc, e); return { w: e.w ?? L.w, lt: e.lt ?? L.lt, color: L.color, layer: L }; }
// czy element można zaznaczyć / przyciągać / zmieniać (warstwa widoczna i niezablokowana)
export const isLive = (doc, e) => { if (e.t === 'vp') return true; const L = layerOf(doc, e); return L.visible && !L.locked; };
export const isShown = (doc, e) => e.t === 'vp' || layerOf(doc, e).visible;

const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- historia: jedna droga zmiany rysunku ---------- */
// const h = new History(doc); h.edit('Linia', tx => tx.add({ t:'line', a, b }));  h.undo(); h.redo();
export class History {
  constructor(doc, onChange = () => {}) { this.doc = doc; this.undoStack = []; this.redoStack = []; this.onChange = onChange; this.limit = 300; }
  reset(doc) { this.doc = doc; this.undoStack = []; this.redoStack = []; }
  // Zmiana rysunku. fn dostaje transakcję; jeśli nic nie zmieniła, historia zostaje bez wpisu.
  edit(label, fn) {
    const tx = new Tx(this.doc);
    let out;
    try { out = fn(tx); }
    catch (err) { tx.rollback(); throw err; }
    if (tx.ops.length) {
      this.undoStack.push({ label, ops: tx.ops });
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack = [];
      this.onChange({ label, ops: tx.ops });
    }
    return out;
  }
  undo() { const s = this.undoStack.pop(); if (!s) return null; applyOps(this.doc, s.ops, true); this.redoStack.push(s); this.onChange({ label: s.label, undo: true, ops: s.ops }); return s.label; }
  redo() { const s = this.redoStack.pop(); if (!s) return null; applyOps(this.doc, s.ops, false); this.undoStack.push(s); this.onChange({ label: s.label, redo: true, ops: s.ops }); return s.label; }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
}

// Transakcja: każda zmiana zapisana razem ze stanem przed nią.
class Tx {
  constructor(doc) { this.doc = doc; this.ops = []; }
  get ents() { return this.doc.ents; }
  // nowy element; brakująca warstwa i kreska biorą się z „bieżących” (doc.cur)
  add(e) {
    const d = this.doc;
    const ent = Object.assign({ layer: d.cur.layer, w: d.cur.w, lt: d.cur.lt }, clone(e), { id: d.next });
    // nowy element trafia do przestrzeni, w której się pracuje (doc._space ustawia program; nie zapisuje się do pliku)
    if (ent.sp === undefined && d._space) ent.sp = d._space;
    this.ops.push({ op: 'add', ent: clone(ent), next: [d.next, d.next + 1] });
    d.next++; d.ents.push(ent); return ent;
  }
  del(id) {
    const i = this.doc.ents.findIndex(e => e.id === id); if (i < 0) return false;
    this.ops.push({ op: 'del', ent: clone(this.doc.ents[i]), index: i });
    this.doc.ents.splice(i, 1); return true;
  }
  // zmiana pól elementu (np. { w: 0.5 }, { a: [...] }); niezmienione pola nie trafiają do historii
  set(id, patch) {
    const e = this.doc.ents.find(e => e.id === id); if (!e) return false;
    const before = {}, after = {};
    for (const k of Object.keys(patch)) { if (k === 'id' || k === 't') continue; if (JSON.stringify(e[k]) === JSON.stringify(patch[k])) continue; before[k] = clone(e[k] ?? null); after[k] = clone(patch[k]); }
    if (!Object.keys(after).length) return false;
    this.ops.push({ op: 'set', id, before, after });
    Object.assign(e, clone(after)); return true;
  }
  addLayer(props) {
    const d = this.doc;
    const L = Object.assign({ name: _t('Warstwa'), color: '#1a1a19', visible: true, locked: false, w: 0.25, lt: 'solid' }, props, { id: d.next });
    this.ops.push({ op: 'addLayer', layer: clone(L), next: [d.next, d.next + 1] });
    d.next++; d.layers.push(L); return L;
  }
  setLayer(id, patch) {
    const L = this.doc.layers.find(L => L.id === id); if (!L) return false;
    const before = {}, after = {};
    for (const k of Object.keys(patch)) { if (k === 'id' || L[k] === patch[k]) continue; before[k] = L[k]; after[k] = patch[k]; }
    if (!Object.keys(after).length) return false;
    this.ops.push({ op: 'setLayer', id, before, after });
    Object.assign(L, after); return true;
  }
  // usuwa pustą warstwę (nie ostatnią i nie bieżącą)
  delLayer(id) {
    const d = this.doc, i = d.layers.findIndex(L => L.id === id);
    if (i < 0 || d.layers.length < 2 || d.cur.layer === id || d.ents.some(e => e.layer === id)) return false;
    this.ops.push({ op: 'delLayer', layer: clone(d.layers[i]), index: i });
    d.layers.splice(i, 1); return true;
  }
  // pola rysunku (scale, units, cur)
  setDoc(patch) {
    const d = this.doc, before = {}, after = {};
    for (const k of Object.keys(patch)) { if (JSON.stringify(d[k]) === JSON.stringify(patch[k])) continue; before[k] = clone(d[k]); after[k] = clone(patch[k]); }
    if (!Object.keys(after).length) return false;
    this.ops.push({ op: 'doc', before, after });
    Object.assign(d, clone(after)); return true;
  }
  rollback() { applyOps(this.doc, this.ops, true); this.ops = []; }
}

function applyOps(doc, ops, back) {
  const list = back ? [...ops].reverse() : ops;
  for (const o of list) {
    switch (o.op) {
      case 'add':
        if (back) { doc.ents.splice(doc.ents.findIndex(e => e.id === o.ent.id), 1); doc.next = o.next[0]; }
        else { doc.ents.push(clone(o.ent)); doc.next = o.next[1]; }
        break;
      case 'del':
        if (back) doc.ents.splice(o.index, 0, clone(o.ent));
        else doc.ents.splice(doc.ents.findIndex(e => e.id === o.ent.id), 1);
        break;
      case 'set': { const e = doc.ents.find(e => e.id === o.id); if (e) Object.assign(e, clone(back ? o.before : o.after)); break; }
      case 'addLayer':
        if (back) { doc.layers.splice(doc.layers.findIndex(L => L.id === o.layer.id), 1); doc.next = o.next[0]; }
        else { doc.layers.push(clone(o.layer)); doc.next = o.next[1]; }
        break;
      case 'setLayer': { const L = doc.layers.find(L => L.id === o.id); if (L) Object.assign(L, back ? o.before : o.after); break; }
      case 'delLayer':
        if (back) doc.layers.splice(o.index, 0, clone(o.layer));
        else doc.layers.splice(doc.layers.findIndex(L => L.id === o.layer.id), 1);
        break;
      case 'doc': Object.assign(doc, clone(back ? o.before : o.after)); break;
    }
  }
}

// zapis do pliku: bez pól roboczych
export const serialize = doc => JSON.stringify(doc);
