// Schowek (⌘C / ⌘V, Ctrl+C / Ctrl+V): zaznaczenie zapisane jako tekst JSON w schowku systemu,
// więc da się je wkleić do innego rysunku i do drugiego okna Rysia.
// Paczka: { rysio: 'schowek', v: 1, space: 'model' | 'sheet', scale, ents, layers, blocks: [{ name, ents }] }
// — warstwy i bloki po nazwie (w docelowym rysunku łączą się z tymi o tej samej nazwie), elementy bez id.
import { transformed, insT, scaling } from './edit.js';
import { bbox, boxUnion, moved } from './geom.js';

const MARK = 'schowek';
const strip = e => { const { id, sp, _ghost, ...rest } = e; return JSON.parse(JSON.stringify(rest)); };

// zaznaczone elementy (z ich warstwami i blokami, także zagnieżdżonymi) → paczka
export function packClip(doc, ents, { sheet, scale }) {
  const layerIds = new Set(), blockIds = [], seen = new Set();
  const walk = list => { for (const e of list) { layerIds.add(e.layer); if (e.t === 'ins' && !seen.has(e.b)) { seen.add(e.b); walk(doc.ents.filter(x => x.sp === 'b' + e.b)); blockIds.push(e.b); } } };
  walk(ents);
  const layerName = id => (doc.layers.find(L => L.id === id) || doc.layers[0]).name;
  const blockName = id => (doc.blocks.find(b => b.id === id) || {}).name || '?';
  // okno arkusza ukrywa warstwy po id — w paczce po nazwie, żeby w innym rysunku ukryć te same
  const out = e => { const n = strip(e); n.layer = layerName(e.layer); if (n.t === 'ins') n.b = blockName(e.b); if (n.t === 'vp') n.hidden = (e.hidden || []).map(layerName); return n; };
  return {
    rysio: MARK, v: 1, space: sheet ? 'sheet' : 'model', scale,
    layers: doc.layers.filter(L => layerIds.has(L.id)).map(({ id, ...L }) => L),
    // bloki w kolejności „najpierw te, które są w środku”
    blocks: blockIds.map(id => ({ name: blockName(id), ents: doc.ents.filter(x => x.sp === 'b' + id).map(out) })),
    ents: ents.map(out)
  };
}

// tekst ze schowka → paczka albo null
export function readClip(text) {
  if (typeof text !== 'string' || !text.includes('"rysio"')) return null;
  try {
    const c = JSON.parse(text);
    if (!c || c.rysio !== MARK || c.v !== 1 || !Array.isArray(c.ents) || !c.ents.length) return null;
    c.layers = Array.isArray(c.layers) ? c.layers.filter(L => L && typeof L.name === 'string') : [];
    c.blocks = Array.isArray(c.blocks) ? c.blocks.filter(b => b && typeof b.name === 'string' && Array.isArray(b.ents)) : [];
    c.ents = c.ents.filter(e => e && typeof e.t === 'string');
    return c.ents.length ? c : null;
  } catch (e) { return null; }
}

// mnożnik wielkości przy wklejaniu: model (metry) ↔ arkusz (metry papieru) w skali 1:scale; model ↔ model bez zmian
export function clipFactor(clip, toSheet, docScale) {
  const fromSheet = clip.space === 'sheet';
  if (fromSheet === toSheet) return 1;
  return toSheet ? 1 / (clip.scale > 0 ? clip.scale : 1) : (docScale > 0 ? docScale : 1);
}

// elementy paczki przesunięte o d i przeskalowane o k (względem zera); okno arkusza się nie skaluje (do modelu i tak nie trafia) — pola do tx.add, warstwy i bloki jeszcze po nazwie
function placed(list, k, d) {
  const S = scaling([0, 0], k);
  return list.map(e => { let n = { ...e }; if (k !== 1) { const f = transformed(n, S); if (f) n = { ...n, ...f }; } return { ...n, ...moved(n, d) }; });
}

// podgląd: elementy płasko (bloki rozbite według definicji z paczki), w położeniu po wklejeniu
export function clipGhosts(clip, k, d, limit = 2000) {
  const defs = new Map(clip.blocks.map(b => [b.name, b.ents])), out = [];
  const flat = (list, depth) => {
    for (const e of list) {
      if (out.length >= limit) return;
      if (e.t === 'vp') continue;
      if (e.t === 'ins') { if (depth < 10) { const T = insT(e); flat((defs.get(e.b) || []).map(ch => { const f = transformed(ch, T); return f ? { ...ch, ...f, layer: e.layer } : null; }).filter(Boolean), depth + 1); } continue; }
      out.push(e);
    }
  };
  flat(placed(clip.ents, k, d), 0);
  return out;
}

// lewy dolny róg zawartości paczki po przeskalowaniu (za ten punkt kopia trzyma się kursora)
export function clipBase(clip, k) {
  const g = clipGhosts(clip, k, [0, 0], 5000);
  let b = null; for (const e of g) { try { b = boxUnion(b, bbox(e)); } catch (err) {} }
  return b ? [b[0], b[1]] : [0, 0];
}

// wklejenie w transakcji: brakujące warstwy i bloki powstają, elementy trafiają do bieżącej przestrzeni.
// forbid(blockId) — true, jeśli tego bloku nie wolno tu wstawić (edycja bloku w nim samym). Zwraca { made, skipped }.
export function pasteClip(tx, doc, clip, { k, d, toSheet, forbid }) {
  const layerId = new Map(doc.layers.map(L => [L.name, L.id]));
  const lay = (name) => {
    if (layerId.has(name)) return layerId.get(name);
    const src = (clip.layers || []).find(L => L.name === name) || { name: String(name || '?') };
    const L = tx.addLayer({ name: src.name, color: src.color, w: src.w, lt: src.lt, visible: true, locked: false });
    layerId.set(L.name, L.id); return L.id;
  };
  // bloki: ten sam blok (ta sama nazwa i treść) — bierzemy istniejący; ta sama nazwa, inna treść — nowy blok „nazwa (2)”
  const blockId = new Map();   // nazwa w paczce → id w rysunku
  const docName = id => (doc.blocks.find(b => b.id === id) || {}).name;
  const layerName = id => (doc.layers.find(L => L.id === id) || doc.layers[0]).name;
  const sig = list => list.map(e => JSON.stringify(Object.keys(e).sort().reduce((o, key) => (o[key] = e[key], o), {}))).sort().join('|');
  const docSig = id => sig(doc.ents.filter(x => x.sp === 'b' + id).map(e => { const n = strip(e); n.layer = layerName(e.layer); if (n.t === 'ins') n.b = docName(e.b); return n; }));
  // na arkusz bloków się nie wstawia — definicji też nie dokładamy
  for (const b of toSheet ? [] : clip.blocks) {
    const mine = sig(b.ents.map(e => e.t === 'ins' ? { ...e, b: docName(blockId.get(e.b)) } : e));
    // także „nazwa (2)” itd. z wcześniejszego wklejenia tego samego bloku
    const same = doc.blocks.find(x => (x.name === b.name || x.name.startsWith(b.name + ' (')) && docSig(x.id) === mine);
    if (same) { blockId.set(b.name, same.id); continue; }
    let name = b.name, n = 2; while (doc.blocks.some(x => x.name === name)) name = `${b.name} (${n++})`;
    const id = Math.max(0, ...doc.blocks.map(x => x.id)) + 1;
    tx.setDoc({ blocks: [...doc.blocks, { id, name }] });
    blockId.set(b.name, id);
    for (const e of b.ents) { if (e.t === 'vp') continue; if (e.t === 'ins' && !blockId.has(e.b)) continue; tx.add({ ...e, layer: lay(e.layer), ...(e.t === 'ins' ? { b: blockId.get(e.b) } : {}), sp: 'b' + id }); }
  }
  const made = []; let skipped = 0;
  for (const e of placed(clip.ents, k, d)) {
    if (e.t === 'vp' && !toSheet) { skipped++; continue; }
    // bloki wstawia się tylko w modelu (jak narzędziem bloków)
    if (e.t === 'ins') { const b = blockId.get(e.b); if (!b || toSheet || forbid?.(b)) { skipped++; continue; } e.b = b; }
    if (e.t === 'vp') e.hidden = (e.hidden || []).map(nm => layerId.get(nm)).filter(v => v != null);
    const { sp, ...rest } = e;
    made.push(tx.add({ ...rest, layer: lay(e.layer) }));
  }
  return { made, skipped };
}
