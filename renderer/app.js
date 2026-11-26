// Rysio — okno programu: stan, mysz i klawiatura, paski, okienka warstw i kreski, zapis. Opis: ARCHITEKTURA.md.
import { _t, translateDom, lang, LANGS, setLang, DEC } from './i18n.js';
import { newDoc, fixDoc, History, serialize, strokeOf, layerOf, isLive, isShown, WEIGHTS, LTYPES, LTYPE_IDS, LAYER_COLORS, SCALES, spaceOf, newSheet, sheetSize, PAPER } from './model.js';
import { V, bbox, boxHit, boxGrow, boxUnion, nearestOn, setAnno, vpBox, textBox, setBlocks, blockEnts, insXf } from './geom.js';
import { explodeIns } from './edit.js';
import { packClip, readClip, clipFactor } from './clip.js';
import { PATTERNS, PATTERN_IDS } from './hatch.js';
import { CanvasPen, drawEnt } from './draw.js';
import { vpMap, titleScales, drawSheet } from './sheet.js';
import { makePdf } from './pdf.js';
import { View } from './view.js';
import { Snapper, gridStep } from './snap.js';
import { makeTools } from './tools.js';
import { setUnit, getUnit, fmtLength } from './units.js';
import { ACTIONS, loadKeys, saveKeyOverride, keysFor, comboOf, prettyCombo } from './keys.js';
import { installTestApi } from './testapi.js';
import { libPack, libGhosts, importLib, libFile, starterFiles, fileSafe, fold } from './library.js';

const api = window.api;
const $ = s => document.querySelector(s);
const isMac = api.platform === 'darwin';
if (!api.web) document.documentElement.classList.add(isMac ? 'frame-mac' : 'frame-win');
api.onFullscreen(v => document.documentElement.classList.toggle('fs', v));
translateDom();

/* ---------- ikony (jak w Modo: 16×16, kreska 1,4) ---------- */
const IC = {
  select: '<path d="M4 2.5v10.2l2.9-2.5 1.9 4.1 1.7-.8-1.9-4h3.9z"/>',
  eraser: '<path d="M9.6 2.6 13.4 6.4 7 12.8H4.2L2.6 11.2z"/><path d="M6 6.2l3.8 3.8M7 12.8h6.5"/>',
  brush: '<path d="M13.5 2.5 8 9.2 6.8 8 13.5 2.5z"/><path d="M6.6 8.4c-1.6-.4-3 .5-3.2 2.2-.1 1.2-.6 2-1.4 2.6 2.2.5 4.5.1 5.3-1.6.4-.9.3-1.8-.7-3.2z"/>',
  line: '<path d="M4 12 12 4"/><circle cx="3.2" cy="12.8" r="1.2"/><circle cx="12.8" cy="3.2" r="1.2"/>',
  pline: '<path d="M3 12.5 5.5 5.5l4.5 4.5 3-6.5"/><circle cx="3" cy="12.5" r="1.1"/><circle cx="13" cy="3.5" r="1.1"/>',
  rect: '<rect x="2.5" y="4" width="11" height="8" rx=".5"/>',
  circle: '<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r=".6"/>',
  arc: '<path d="M2.5 12.5a6.5 6.5 0 0 1 11 0"/><circle cx="2.5" cy="12.5" r="1"/><circle cx="13.5" cy="12.5" r="1"/><circle cx="8" cy="6" r="1"/>',
  move: '<path d="M8 2v12M2 8h12M6.2 3.8 8 2l1.8 1.8M6.2 12.2 8 14l1.8-1.8M3.8 6.2 2 8l1.8 1.8M12.2 6.2 14 8l-1.8 1.8"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.2"/><path d="M10.5 5.5V3.7a1.2 1.2 0 0 0-1.2-1.2H3.7a1.2 1.2 0 0 0-1.2 1.2v5.6a1.2 1.2 0 0 0 1.2 1.2h1.8"/>',
  rotate: '<path d="M13.2 8.5A5.3 5.3 0 1 1 11.6 4"/><path d="M12.2 1.8v2.7H9.5"/>',
  mirror: '<path d="M8 2v12" stroke-dasharray="1.6 1.8"/><path d="M6 4.5 2.5 12H6zM10 4.5l3.5 7.5H10z"/>',
  scale: '<rect x="2.5" y="6.5" width="7" height="7" rx=".5"/><path d="M9 2.5h4.5V7M13.5 2.5 8 8"/>',
  offset: '<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><rect x="5.5" y="5.5" width="5" height="5" rx=".5"/>',
  fillet: '<path d="M3 13.5V9.5A6.5 6.5 0 0 1 9.5 3h4"/><path d="M3 6.5V3h3.5" stroke-dasharray="1.3 1.6"/>',
  extend: '<path d="M13.5 2.5v11"/><path d="M2.5 8h8.5"/><path d="M8.5 5.5 11 8l-2.5 2.5"/>',
  measure: '<path d="M2 11.5 11.5 2 14 4.5 4.5 14z"/><path d="M5 8.5l1.3 1.3M7 6.5l1.3 1.3M9 4.5l1.3 1.3"/>',
  trim: '<circle cx="4" cy="11.5" r="1.8"/><circle cx="12" cy="11.5" r="1.8"/><path d="M5.2 10.2 12.5 2.5M10.8 10.2 3.5 2.5"/>',
  text: '<path d="M3.5 4h9M8 4v8.5"/>',
  dim: '<path d="M2.5 5v7M13.5 5v7M2.5 9.5h11"/><path d="M4 11l-1.4-1.4M13.4 9.6 12 8"/>',
  hatch: '<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M2.8 7.2 7.2 2.8M2.8 12.2l9.4-9.4M7.2 13.2l6-6"/>',
  block: '<rect x="2.5" y="2.5" width="5" height="5" rx=".6"/><rect x="8.5" y="8.5" width="5" height="5" rx=".6"/><path d="M8.5 5H11a1 1 0 0 1 1 1v1.5M7.5 11H5a1 1 0 0 1-1-1V8.5"/>',
  extents: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/><rect x="5.5" y="5.5" width="5" height="5" rx=".5"/>',
  undo: '<path d="M5.5 3 2.5 6l3 3"/><path d="M2.5 6h7a4 4 0 0 1 0 8H6"/>',
  redo: '<path d="M10.5 3l3 3-3 3"/><path d="M13.5 6h-7a4 4 0 0 0 0 8H10"/>',
  thin: '<path d="M2.5 5h11" stroke-width="2.6"/><path d="M2.5 11h11" stroke-width=".8"/>',
  pdf: '<path d="M8 2.5v8M5 7.5l3 3 3-3"/><path d="M2.5 11v2.5h11V11"/>',
  sliders: '<path d="M2.5 5.5h11M2.5 10.5h11"/><circle cx="6" cy="5.5" r="1.8" fill="var(--bg)"/><circle cx="10.5" cy="10.5" r="1.8" fill="var(--bg)"/>',
  eye: '<path d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.9"/>',
  eyeOff: '<path d="M2.5 2.5l11 11M6.6 4A6.3 6.3 0 0 1 8 3.8c4 0 6.2 4.2 6.2 4.2a11 11 0 0 1-1.8 2.3M10.6 11.6A5.8 5.8 0 0 1 8 12.2C4 12.2 1.8 8 1.8 8a11 11 0 0 1 2.4-2.8"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  unlock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1"/>',
  alignL: '<path d="M2.5 4h11M2.5 8h7M2.5 12h9"/>', alignC: '<path d="M2.5 4h11M4.5 8h7M3.5 12h9"/>', alignR: '<path d="M2.5 4h11M6.5 8h7M4.5 12h9"/>',
  viewport: '<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M4.5 10.5 7 7.5l2 2 1.5-1.5 1.5 2.5"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9"/>'
};
const ic = (n, s = 15) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
const chev = '<svg class="chev" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const wtxt = w => w.toFixed(2).replace('.', DEC);
const sample = (w, lt, len = 26, h = 8) => { const d = (LTYPES[lt] || LTYPES.solid).dash.map(v => Math.max(v * 1.6, 0.6)).join(' '); return `<svg width="${len}" height="${h}" aria-hidden="true"><line x1="1" y1="${h / 2}" x2="${len - 1}" y2="${h / 2}" stroke="currentColor" stroke-width="${Math.max(0.7, w * 3.78).toFixed(2)}" stroke-dasharray="${d}" stroke-linecap="${lt === 'dot' ? 'round' : 'butt'}"/></svg>`; };
for (const [id, n] of [['#undoBtn', 'undo'], ['#redoBtn', 'redo'], ['#thinBtn', 'thin'], ['#pdfBtn', 'pdf'], ['#setBtn', 'sliders']]) $(id).innerHTML = ic(n);

/* ---------- stan ---------- */
const app = {
  isMac, altName: isMac ? '⌥' : 'Ctrl', shiftName: isMac ? '⇧' : 'Shift', bsName: isMac ? '⌫' : 'Backspace',
  doc: newDoc(), sel: new Set(),
  mini: (() => { try { return localStorage.getItem('rysio.mini') === '1'; } catch (e) { return false; } })(),
  thin: false, ortho: false, grid: (() => { try { const g = localStorage.getItem('rysio.grid'); return ['dots', 'lines'].includes(g) ? g : null; } catch (e) { return null; } })(),
  space: 0,                       // 0 — model, liczba — numer arkusza
  textH: 3.5, textAlign: 'l',     // wysokość (mm wydruku) i wyrównanie nowego tekstu
  vpEdit: null, lastVpScale: null, // okno, w którym przesuwa się widok modelu; ostatnio ustawiona skala okna
  file: { path: null, name: _t('Bez nazwy'), dirty: false },
  keys: loadKeys()
};
// klawisz „kopii” i „pobierz z linii”: ⌥ na Macu, Ctrl w Windows (jak w Modo — Alt w Windows otwiera menu okna)
app.altKey = e => !!e && (isMac ? e.altKey : e.ctrlKey);
app.hist = new History(app.doc, info => afterChange(info));
app.rev = 0; setBlocks(app.doc);
app.view = new View($('#view'));
app.snapper = new Snapper();
app.tools = makeTools(app);
let tool = app.tools.select;
let snapRes = null, cursorModel = null, cursorScreen = null, hoverEnt = null, lockDir = null;

app.edit = (label, fn) => app.hist.edit(label, fn);
// elementy bieżącej przestrzeni i jej skala (arkusz zawsze 1:1)
// przestrzeń, w której się pracuje: model (0), arkusz (numer) albo definicja edytowanego bloku ('b' + id)
app.spaceKey = () => app.blockEdit ? 'b' + app.blockEdit.id : app.space;
app.ents = () => { const k = app.spaceKey(); return app.doc.ents.filter(e => spaceOf(e) === k); };
app.sheet = () => app.space ? app.doc.sheets.find(sh => sh.id === app.space) || null : null;
app.spaceScale = () => app.space ? 1 : app.doc.scale;
const UNITF = { m: [1, 2], cm: [0.01, 1], mm: [0.001, 0] };
const fmtU = (v, u) => (v / UNITF[u][0]).toFixed(UNITF[u][1]).replace('.', DEC);
app.fmtModel = v => fmtU(v, app.doc.units);
app.fmtSheet = v => fmtU(v, 'mm');
// przestrzeń, w której się pracuje: wysokość tekstu, jednostka wymiarów i to, gdzie trafiają nowe elementy
function syncSpace() {
  setAnno(app.spaceScale() / 1000);
  Object.defineProperty(app.doc, '_space', { value: app.spaceKey() || 0, writable: true, configurable: true, enumerable: false });
  setUnit(app.space ? 'mm' : app.doc.units, false);
}
app.modelCenter = () => { setAnno(app.doc.scale / 1000); let b = null; for (const e of app.doc.ents) if (!spaceOf(e) && isShown(app.doc, e)) b = boxUnion(b, bbox(e)); syncSpace(); return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [0, 0]; };
app.tol = () => 9 / app.view.ppm;
app.newStroke = () => ({ layer: app.doc.cur.layer, w: app.doc.cur.w, lt: app.doc.cur.lt });
// element pod punktem: tylko widoczne i niezablokowane warstwy
app.pick = (p, { locked = false } = {}) => {
  const tol = app.tol(), probe = [p[0] - tol, p[1] - tol, p[0] + tol, p[1] + tol];
  let best = null, bd = Infinity;
  for (const e of app.ents()) {
    if (!(locked ? isShown(app.doc, e) : isLive(app.doc, e)) || !boxHit(boxGrow(bbox(e), tol), probe)) continue;
    const n = nearestOn(e, p); if (!n) continue;
    const d = n.inside ? tol * 0.95 : n.d;   // środek kreskowania przegrywa z linią w pobliżu
    if (d <= tol && d < bd) { bd = d; best = e; }
  }
  return best;
};
app.selectionChanged = () => { refreshUi(); redraw(); };
// opis skrótu polecenia w bieżącym układzie (do podpowiedzi)
app.keyName = id => { const k = keysFor(id, app.keys.over)[0]; return k ? prettyCombo(k, isMac) : ''; };
// „X jeszcze raz” albo, gdy skrót skasowany, „przycisk narzędzia jeszcze raz”
app.againName = id => app.keyName(id) || _t('przycisk narzędzia');
app.refreshUi = () => refreshUi();
// przestrzeń, której dotyczyła zmiana (pierwszy element w zapisie); null — zmiana nie dotyczyła elementów
function spaceOfOps(ops = []) {
  for (const o of ops) {
    if (o.ent) return spaceOf(o.ent);
    if (o.op === 'set') { const e = app.doc.ents.find(x => x.id === o.id); if (e) return spaceOf(e); }
  }
  return null;
}
function afterChange(info) {
  app.rev++; setBlocks(app.doc);
  // edytowany blok mógł zniknąć (cofnięcie utworzenia)
  if (app.blockEdit && !app.doc.blocks.some(b => b.id === app.blockEdit.id)) { const be = app.blockEdit; app.blockEdit = null; app.hist.limit = be.limit; Object.assign(app.view, be.view); app.view.needs = true; syncSpace(); }
  // ciągnięty uchwyt: przerwij, gdy element zniknął, został zablokowany albo ukryty, albo zmiana przyszła z cofnięcia
  const gr = app.tools.select.grip;
  if (gr) { const e = app.doc.ents.find(x => x.id === gr.e.id); if (info?.undo || info?.redo || !e || !isLive(app.doc, e)) app.tools.select.cancel(); else gr.e = e; }
  // zaznaczenie bez usuniętych elementów
  for (const id of [...app.sel]) { const e = app.doc.ents.find(x => x.id === id); if (!e || !isLive(app.doc, e) || spaceOf(e) !== app.spaceKey()) app.sel.delete(id); }
  // arkusz mógł zniknąć (usunięcie, cofnięcie dodania arkusza) — pełne przejście do modelu
  if (app.space && !app.sheet()) setSpace(0, true);
  // cofnięcie albo ponowienie zmiany z innej przestrzeni pokazuje tę przestrzeń
  else if (info && (info.undo || info.redo)) { const sp = spaceOfOps(info.ops); if (sp !== null && sp !== app.space && (sp === 0 || app.doc.sheets.some(x => x.id === sp))) setSpace(sp); }
  syncSpace(); renderTabs();
  markDirty(true); refreshUi(); redraw();
}

/* ---------- lewy pasek ---------- */
const TOOLBAR = ['select', 'eraser', 'brush', null, 'line', 'pline', 'rect', 'circle', 'arc', null, 'move', 'copy', 'rotate', 'mirror', 'scale', null, 'offset', 'fillet', 'trim', 'extend', null, 'hatch', 'block', 'text', 'dim', 'measure', 'viewport', 'grow', 'extents'];
const toolsEl = $('#tools');
// narzędzia w jednej kapsule z przeskakującym wskaźnikiem; „Pokaż wszystko” (polecenie, nie narzędzie) zostaje osobno na dole
const capsEl = document.createElement('div'); capsEl.className = 'caps'; capsEl.innerHTML = '<div class="ind still"></div>'; toolsEl.append(capsEl);
let toolsBox = capsEl;
for (const id of TOOLBAR) {
  if (id === null) { toolsBox.insertAdjacentHTML('beforeend', '<div class="hsep"></div>'); continue; }
  if (id === 'grow') { toolsEl.insertAdjacentHTML('beforeend', '<div class="grow"></div>'); toolsBox = toolsEl; continue; }
  const a = ACTIONS.find(x => x.id === id), later = !!a.later;
  const b = document.createElement('button');
  b.className = 'ib' + (later ? ' later' : ''); b.dataset.tool = id; b.innerHTML = ic(id);
  const name = id === 'arc' ? _t`Łuk (${app.shiftName} + klik — ze środka; drugie kliknięcie albo drugie B przełącza)` : a.name;
  b.setAttribute('aria-label', name); b.dataset.tip = name + (later ? _t(' — w kolejnej wersji') : ''); b.dataset.act = id;
  b.addEventListener('click', e => runAction(id === 'arc' && e.shiftKey ? 'arcC' : id));
  toolsBox.append(b);
}
function placeInd() {
  const on = capsEl.querySelector('.ib.on:not([hidden])'), ind = capsEl.querySelector('.ind');   // ukryty przycisk (Okno w modelu) — bez wskaźnika
  ind.hidden = !on; if (on) ind.style.transform = `translateY(${on.offsetTop}px)`;
  // w niskim oknie pasek się przewija — wybrane narzędzie (np. ze skrótu) ma być widać, także poza cieniem przy krawędzi
  if (on) { const t = on.offsetTop + capsEl.offsetTop - toolsEl.offsetTop, pad = 32; if (t < toolsEl.scrollTop + pad) toolsEl.scrollTop = t - pad; else if (t + on.offsetHeight > toolsEl.scrollTop + toolsEl.clientHeight - pad) toolsEl.scrollTop = t + on.offsetHeight - toolsEl.clientHeight + pad; }
  toolsFade();
  if (ind.classList.contains('still')) requestAnimationFrame(() => ind.classList.remove('still'));   // bez skoku przy starcie
}

// cień u góry / u dołu paska, gdy są tam narzędzia schowane za krawędzią okna
function toolsFade() { const t = toolsEl; t.classList.toggle('more-up', t.scrollTop > 1); t.classList.toggle('more-down', t.scrollTop + t.clientHeight < t.scrollHeight - 1); }
toolsEl.addEventListener('scroll', toolsFade, { passive: true });
addEventListener('resize', toolsFade);

function setTool(id, opts = {}) {
  if (!app.tools[id]) return;
  // przerwij to, co narzędzie ma w toku (zaznaczenie zostaje — W i C działają na nim)
  if (tool.id === 'select') { tool._down = null; tool.box = null; if (tool.grip) tool.cancel(); } else for (let i = 0; i < 3 && tool.cancel(); i++);
  tool = app.tools[id];
  tool.start?.();
  if (id === 'arc') { tool.pts = []; tool.mode = opts.arcMode || '3p'; }
  if (id !== 'brush') hideBrushBar();
  if (textEd) finishText();
  lockDir = null; typing = null; app.snapper.clearRefs(); snapRes = null; hoverEnt = null;
  if (cursorScreen) updateCursor(...cursorScreen);
  toolsEl.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === id));
  placeInd();
  app.cursorClass();
  refreshUi(); redraw();
  // bloki bez żadnego bloku w rysunku: od razu okienko z biblioteką
  if (id === 'block' && tool.mode === 'insert' && !tool.cur) setTimeout(() => { const b = $('#blockBar [data-b=pick]'); if (b && $('#blocksPop')?.hidden !== false) openBlocksPop(b, pickForInsert, null, 'lib'); }, 0);
}
app.setTool = setTool;
app.cursorClass = () => { $('#view').className = tool.draw ? 'c-draw' : ''; };

/* ---------- akcje (skróty, przyciski, menu) ---------- */
function runAction(id) {
  const a = ACTIONS.find(x => x.id === id);
  if (a && a.later) return toast(_t`${a.name} — w kolejnej wersji.`);
  // ponowne naciśnięcie klawisza narzędzia zmienia jego sposób (łuk: trzy punkty / ze środka, wymiar: kierunek)
  if (app.tools[id]) { if (tool.id === id && tool.toggle) { tool.toggle(); refreshUi(); redraw(); return; } return setTool(id); }
  switch (id) {
    case 'arcC': return setTool('arc', { arcMode: 'c' });
    case 'undo': { if (tool.undoInTool?.()) { refreshUi(); redraw(); return; } const l = app.hist.undo(); if (l) toast(_t`Cofnięto: ${l}`, 1200); else { react($('#undoBtn'), 'nie'); toast(_t('Nie ma czego cofnąć.'), 1500); } return; }
    case 'redo': { const l = app.hist.redo(); if (l) toast(_t`Ponowiono: ${l}`, 1200); else { react($('#redoBtn'), 'nie'); toast(_t('Nie ma czego ponowić.'), 1500); } return; }
    case 'delete': if (app.sel.size) { const ids = [...app.sel].filter(id => { const e = app.doc.ents.find(x => x.id === id); return e && isLive(app.doc, e); }); app.edit(_t('Usuń'), tx => ids.forEach(i => tx.del(i))); } return;
    case 'selectAll': setTool('select'); app.sel = new Set(app.ents().filter(e => isLive(app.doc, e)).map(e => e.id)); app.selectionChanged(); return;
    case 'extents': fitSpace(); redraw(); return;
    case 'thin': { app.thin = !app.thin; const b = $('#thinBtn'); b.setAttribute('aria-pressed', app.thin); react(b, app.thin ? 'wlacz' : 'wylacz'); redraw(); return; }
    case 'ortho': app.ortho = !app.ortho; refreshUi(); return;
    case 'snapToggle': app.snapper.enabled = !app.snapper.enabled; refreshUi(); return;
    case 'mini': return setMini(!app.mini);
    case 'grid': { const order = [null, 'dots', 'lines']; app.grid = order[(order.indexOf(app.grid) + 1) % 3]; try { localStorage.setItem('rysio.grid', app.grid || ''); } catch (e) {} if (app.grid && app.sheet()) toast(_t('Siatka jest tylko w modelu — na arkuszu jej nie ma.'), 1800); refreshUi(); redraw(); return; }
    case 'theme': { const order = ['auto', 'light', 'dark']; setTheme(order[(order.indexOf(themePref) + 1) % 3]); toast({ auto: _t('Motyw jak w systemie'), light: _t('Jasny motyw'), dark: _t('Ciemny motyw') }[themePref], 1200); return; }
    case 'new': return fileNew();
    case 'open': return fileOpen();
    case 'save': return fileSave(false);
    case 'saveAs': return fileSave(true);
    case 'keys': return openKeys();
    case 'exportPdf': return openExport();
    case 'newSheet': return addSheet();
    case 'clipCopy': return clipCopy(null);
    case 'clipCut': return clipCopy(null, true);
    case 'clipPaste': return clipPaste(null);
  }
}
app.run = runAction;

/* ---------- schowek: ⌘C / ⌘V (Ctrl+C / Ctrl+V) ---------- */
// Zaznaczenie idzie do schowka systemu jako tekst, więc wkleja się też w innym rysunku i w drugim oknie.
// Zwykłe ⌘C / ⌘X / ⌘V przechodzą przez zdarzenia copy / cut / paste (działają bez pytania o zgodę); inny przypisany klawisz — przez navigator.clipboard.
let clipMemo = null;   // zapas, gdy schowek systemu jest niedostępny
let clipWait = 0;     // licznik: ⌘C / ⌘V czeka na zdarzenie copy / paste
function clipCopy(dt, cut = false) {
  const ents = app.ents().filter(e => app.sel.has(e.id) && isLive(app.doc, e));
  if (!ents.length) { toast(cut ? _t('Najpierw zaznacz, co wyciąć.') : _t('Najpierw zaznacz, co skopiować.')); return false; }
  const clip = packClip(app.doc, ents, { sheet: !!app.sheet(), scale: app.doc.scale });
  const text = JSON.stringify(clip); clipMemo = text;
  if (dt) dt.setData('text/plain', text);
  else navigator.clipboard?.writeText(text).catch(() => {});
  if (cut) {
    // wycięcie = kopia w schowku i usunięcie (jeden krok cofania)
    const ids = ents.map(e => e.id);
    app.edit(_t('Wytnij'), tx => ids.forEach(i => tx.del(i)));
    app.sel.clear(); app.selectionChanged();
    toast(_t`Wycięto ${ents.length} el. — ${app.keyName('clipPaste') || _t('wklej')} wkleja.`, 1600);
  } else toast(_t`Skopiowano ${ents.length} el. — ${app.keyName('clipPaste') || _t('wklej')} wkleja.`, 1600);
  return true;
}
async function clipPaste(dt) {
  let text = null;
  if (dt) text = dt.getData('text/plain');
  else { try { text = await navigator.clipboard.readText(); } catch (e) { text = null; } }
  const clip = readClip(text) || (text == null || text === '' ? readClip(clipMemo) : null);
  if (!clip) { toast(_t('W schowku nie ma rysunku — skopiuj elementy w Rysiu.')); return; }
  const toSheet = !!app.sheet();
  if (!toSheet && clip.ents.every(e => e.t === 'vp')) { toast(_t('Okna arkusza wkleja się tylko na arkusz.')); return; }
  setTool('paste');
  tool.set(clip, clipFactor(clip, toSheet, app.doc.scale));
  if (cursorScreen) { updateCursor(...cursorScreen); tool.move(cursorModel); }
  refreshUi(); redraw();
}
// zdarzenie dotyczy rysunku: nie pole tekstowe, nie otwarte okno, a skrót wciąż przypisany do schowka
const clipTarget = (e, id, combo) => !typingIn(document.activeElement) && !e.target?.closest?.('.textEd') && !textEd && $('#keysModal').hidden && $('#exportPop').hidden && app.keys.map.get(combo) === id;
document.addEventListener('copy', e => { clipWait++; if (!clipTarget(e, 'clipCopy', 'Mod+C')) return; if (clipCopy(e.clipboardData)) e.preventDefault(); });
document.addEventListener('cut', e => { clipWait++; if (!clipTarget(e, 'clipCut', 'Mod+X')) return; if (clipCopy(e.clipboardData, true)) e.preventDefault(); });
document.addEventListener('paste', e => { clipWait++; if (!clipTarget(e, 'clipPaste', 'Mod+V')) return; e.preventDefault(); clipPaste(e.clipboardData); });

/* ---------- mysz ---------- */
const view = $('#view');
const xy = e => { const r = view.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
let panning = null, spaceDown = false, downBtn = -1, vpPan = null;
function updateCursor(sx, sy, e) {
  cursorScreen = [sx, sy];
  const raw = app.view.toModel(sx, sy);
  if (tool.draw) {
    const shown = app.ents().filter(x => isShown(app.doc, x) && x.t !== 'text' && x.t !== 'hatch' && x.id !== app.hideEnt && x.id !== app.dragEnt).concat(tool.snapEnts?.() || []);
    snapRes = app.snapper.find(raw, { tol: app.tol(), ents: shown, base: tool.base(), lockDir, ortho: app.ortho, noSnap: false, grid: app.grid && !app.sheet() ? gridStep(app.view.ppm) : 0 });
    cursorModel = snapRes.p; hoverEnt = null;
  } else {
    snapRes = null; cursorModel = raw;
    hoverEnt = (tool.id === 'select' && tool.box) ? null : app.pick(raw);
  }
}
view.addEventListener('pointerdown', e => {
  if (e.target.closest('.textEd, .toolbar')) return;   // pole pisanego tekstu i paski narzędzi obsługują się same
  if (closePops() && e.button === 0) return;
  view.setPointerCapture(e.pointerId); downBtn = e.button;
  const [x, y] = xy(e);
  if (e.button === 1 || (e.button === 0 && spaceDown)) { panning = [x, y]; view.classList.add('c-grabbing'); e.preventDefault(); return; }
  if (e.button === 2) { if (!tool.enter()) tool.cancel(); refreshUi(); redraw(); return; }
  if (e.button !== 0) return;
  // w trybie „widok w oknie” przeciąganie przesuwa model w oknie (skala okna się nie zmienia)
  if (app.vpEdit) {
    const vp = app.doc.ents.find(v => v.id === app.vpEdit);
    if (vp && pointInBox(app.view.toModel(x, y), vpBox(vp))) { vpPan = { x, y, c0: [...vp.c], vp }; view.classList.add('c-grabbing'); return; }
    app.vpEdit = null; refreshUi();
  }
  updateCursor(x, y, e);
  if (typing !== null) { typing = null; }
  tool.down(cursorModel, e); updateCursor(x, y, e);
  refreshUi(); redraw();
});
view.addEventListener('pointermove', e => {
  const [x, y] = xy(e);
  if (panning) { app.view.pan(x - panning[0], y - panning[1]); panning = [x, y]; redraw(); return; }
  if (vpPan) { const k = vpPan.vp.scale / app.view.ppm; vpPan.vp.c = [vpPan.c0[0] - (x - vpPan.x) * k, vpPan.c0[1] + (y - vpPan.y) * k]; redraw(); return; }
  updateCursor(x, y, e);
  tool.move(cursorModel, e);
  showReading(); redraw();
});
view.addEventListener('pointerup', e => {
  const [x, y] = xy(e);
  if (panning) { panning = null; view.classList.remove('c-grabbing'); return; }
  if (vpPan) { const { vp, c0 } = vpPan, c = vp.c; vp.c = c0; vpPan = null; view.classList.remove('c-grabbing'); if (V.dist(c, c0) > 0) app.edit(_t('Widok w oknie'), tx => tx.set(vp.id, { c })); downBtn = -1; return; }
  if (e.button === 0 && downBtn === 0) { tool.up?.(cursorModel || app.view.toModel(x, y), e); refreshUi(); redraw(); }
  downBtn = -1;
});
view.addEventListener('pointerleave', () => { cursorScreen = null; snapRes = null; hoverEnt = null; $('#snapLbl')?.remove(); $('#reading')?.remove(); redraw(); });
const pointInBox = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
// dwuklik: w tekst — poprawka tekstu; w okno na arkuszu — przesuwanie modelu w oknie
view.addEventListener('dblclick', e => {
  if (e.target.closest('.textEd, .toolbar') || !['select', 'text'].includes(tool.id)) return;
  if (tool.grip) tool.cancel();
  const [x, y] = xy(e), p = app.view.toModel(x, y), hit = app.pick(p);
  if (hit && hit.t === 'text') return app.editText(hit);
  if (hit && hit.t === 'ins' && tool.id === 'select') return startBlockEdit(hit);
  const vp = app.space && app.ents().filter(v => v.t === 'vp' && isLive(app.doc, v)).reverse().find(v => pointInBox(p, vpBox(v)));
  if (vp) {
    if (vp.locked) return toast(_t('Widok w tym oknie jest zablokowany — odblokuj go na pasku okna.'));
    app.vpEdit = vp.id; app.sel.clear(); refreshUi(); redraw();
  }
});
view.addEventListener('contextmenu', e => e.preventDefault());
view.addEventListener('auxclick', e => e.preventDefault());
// kółko myszy: przybliżanie do kursora; gładzik: dwa palce przesuwają, szczypanie przybliża (jak w Modo)
view.addEventListener('wheel', e => {
  e.preventDefault();
  const [x, y] = xy(e);
  const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && e.wheelDeltaY && Math.abs(e.wheelDeltaY) % 120 === 0);
  if (e.ctrlKey || mouseWheel) {
    const k = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    app.view.zoomAt(x, y, Math.pow(1.0018, -k * (e.ctrlKey && !mouseWheel ? 4 : 1)));
  } else app.view.pan(-e.deltaX, -e.deltaY);
  updateCursor(x, y, e); tool.move(cursorModel, e); showReading(); redraw();
}, { passive: false });
app.view.onResize = () => redraw();

/* ---------- klawiatura i pole wymiaru ---------- */
let typing = null;   // wpisywany wymiar (tekst) albo null
const typingIn = el => el && (el.tagName === 'INPUT' && el.type !== 'checkbox' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
let capture = null;  // przypisywanie skrótu w oknie skrótów
function submitTyping(e) {
  const s = typing; typing = null;
  if (s && !tool.typed(s, e)) toast(_t`Nie rozumiem wymiaru „${esc(s)}”.`);
  if (cursorScreen) updateCursor(...cursorScreen);
  refreshUi(); redraw();
}
window.addEventListener('keydown', e => {
  if (capture) return capture(e);
  if (typingIn(document.activeElement)) { if (e.key === 'Escape') document.activeElement.blur(); return; }
  if (!$('#keysModal').hidden) { if (e.key === 'Escape') closeKeys(); return; }
  const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
  // pole wymiaru: cyfry zaczynają wpisywanie, a potem wszystkie znaki trafiają do pola (także litery jednostek)
  if (typing !== null) {
    e.preventDefault();
    if (e.key === 'Enter') return submitTyping(e);
    if (e.key === 'Escape') { typing = null; return refreshUi(); }
    if (e.key === 'Backspace') { typing = typing.slice(0, -1); if (!typing) typing = null; return refreshUi(); }
    if (e.key.length === 1 && plain || e.key.length === 1 && e.shiftKey) { if (typing.length < 30) typing += e.key; return refreshUi(); }
    return;
  }
  if (plain && tool.label() && (tool.base() || tool.typeAnytime) && /^[0-9.,\-]$/.test(e.key)) { e.preventDefault(); typing = e.key; return refreshUi(); }
  if (e.key === 'Escape') {
    if (closePops()) return;
    if (app.vpEdit) { app.vpEdit = null; refreshUi(); redraw(); return; }
    if (!tool.cancel()) { if (tool.id !== 'select') setTool('select'); else if (app.sel.size) { app.sel.clear(); app.selectionChanged(); } else if (app.blockEdit) endBlockEdit(false); }
    refreshUi(); redraw(); return;
  }
  if (e.key === 'Enter') { if (tool.enter()) { refreshUi(); redraw(); } return; }
  if (e.key === 'Backspace' && plain && tool.backspace?.()) { e.preventDefault(); refreshUi(); redraw(); return; }
  if (e.key === ' ' && plain) { spaceDown = true; view.classList.add('c-grab'); e.preventDefault(); return; }
  // ⇧ trzyma kierunek od punktu bazowego
  if (e.key === 'Shift' && tool.draw && tool.base() && cursorModel && !lockDir) {
    const d = V.norm(V.sub(cursorModel, tool.base())); if (d[0] || d[1]) { lockDir = d; redraw(); }
    return;
  }
  const c = comboOf(e, isMac); if (!c) return;
  if (e.key === 'Tab') e.preventDefault();   // Tab nie przenosi fokusu po przyciskach
  const id = app.keys.map.get(c);
  // ⌘C / ⌘V zostawiamy przeglądarce — wywoła zdarzenie copy / paste ze schowkiem systemu
  // (gdyby zdarzenie nie przyszło w ułamku sekundy — robimy to sami przez navigator.clipboard)
  if ((id === 'clipCopy' && c === 'Mod+C') || (id === 'clipCut' && c === 'Mod+X') || (id === 'clipPaste' && c === 'Mod+V')) { const n = ++clipWait; setTimeout(() => { if (clipWait === n) { clipWait++; runAction(id); } }, 250); return; }
  if (id) { e.preventDefault(); runAction(id); }
});
window.addEventListener('keyup', e => {
  if (e.key === 'Shift' && lockDir) { lockDir = null; if (cursorScreen) updateCursor(...cursorScreen, e); redraw(); }
  if (e.key === ' ') { spaceDown = false; view.classList.remove('c-grab'); }
});
window.addEventListener('blur', () => { lockDir = null; spaceDown = false; });

/* ---------- rysowanie ---------- */
let rafPending = false;
function redraw() { if (rafPending) return; rafPending = true; requestAnimationFrame(frame); }
app.redraw = redraw;
function frame() {
  rafPending = false;
  const hi = tool.highlight ? [...tool.highlight()].map(id => app.doc.ents.find(e => e.id === id)).filter(Boolean) : [];
  const pv = cursorScreen || !tool.draw ? tool.preview() : [], hid = new Set(pv.filter(e => e._replaces).map(e => e._replaces));   // podgląd zastępuje element (np. zaokrąglanie)
  app.view.render({
    doc: app.doc, sel: tool.picked ? new Set([...app.sel, ...tool.picked()]) : app.sel, thin: app.thin, grid: app.grid, ents: app.hideEnt || app.dragEnt || hid.size ? app.ents().filter(e => e.id !== app.hideEnt && e.id !== app.dragEnt && !hid.has(e.id)) : app.ents(), scale: app.spaceScale(), sheet: app.sheet(), vpEdit: app.vpEdit,
    fmt: app.space ? app.fmtSheet : app.fmtModel, fmtModel: app.fmtModel,
    hover: [...hi, ...(hoverEnt && !app.sel.has(hoverEnt.id) && !hid.has(hoverEnt.id) ? [hoverEnt] : [])], hoverColor: tool.id === 'eraser' || tool.id === 'trim' ? '#c0533f' : null,
    guides: snapRes ? snapRes.guides : [], snap: snapRes, marks: tool.draw ? app.snapper.refPts : [],
    ghost: blockGhost(),
    preview: pv, grips: tool.grips ? tool.grips() : null, box: tool.box, path: tool.path && tool.path.length > 1 ? tool.path : null
  });
  showSnapLabel(); showVpBar(); placeTextEd();
}
function showSnapLabel() {
  let el = $('#snapLbl');
  if (!snapRes || !snapRes.label || !cursorScreen) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'snapLbl'; el.className = 'snapLbl'; view.append(el); }
  el.textContent = snapRes.label;
  const s = app.view.toScreen(snapRes.p);
  el.style.left = (s[0] + 12) + 'px'; el.style.top = (s[1] + 10) + 'px';
}
function showReading() {
  if (tool.id === 'measure') showToolBar();
  let el = $('#reading');
  const r = cursorScreen && tool.reading ? tool.reading() : null;
  // w trybie minimalnym pole wymiaru jest przy kursorze: wpisywana wartość pokazuje się tam, gdzie patrzysz
  const typed = app.mini && typing !== null;
  if (!typed && (!r || typing !== null)) { el?.remove(); } else {
    if (!el) { el = document.createElement('div'); el.id = 'reading'; el.className = 'reading'; view.append(el); }
    if (typed) el.innerHTML = `<em>${esc(tool.label() || '')}</em><u>${esc(typing)}</u>`; else el.textContent = r;
    el.classList.toggle('typed', !!typed);
    const at = cursorScreen || [view.clientWidth / 2 - 40, view.clientHeight - 30];
    el.style.left = (at[0] + 16) + 'px'; el.style.top = (at[1] - 30) + 'px';
  }
  if (typing === null) $('#vcb').textContent = r || '';
}

/* ---------- paski: podpowiedź, pole wymiaru, pastylki ---------- */
function refreshUi() {
  $('#hint').innerHTML = tool.hint();
  const lbl = tool.label();
  $('#vcbWrap').style.visibility = lbl ? 'visible' : 'hidden';
  $('#vcbLabel').textContent = lbl || '';
  const vcb = $('#vcb');
  vcb.classList.toggle('typing', typing !== null);
  if (typing !== null) vcb.textContent = typing; else vcb.textContent = tool.reading?.() || '';
  if (typing !== null && !app.mini) $('#reading')?.remove();
  if (app.mini) showReading();
  $('#undoBtn').disabled = !app.hist.canUndo; $('#redoBtn').disabled = !app.hist.canRedo;
  $('#snapChip').classList.toggle('off', !app.snapper.enabled);
  $('#orthoChip').classList.toggle('off', !app.ortho);
  $('#gridChip').classList.toggle('off', !app.grid); $('#gridChip').lastChild.textContent = app.grid === 'lines' ? _t('Siatka: linie') : app.grid === 'dots' ? _t('Siatka: kropki') : _t('Siatka');
  const sh = app.sheet();
  $('#unitBtn').textContent = sh ? 'mm' : app.doc.units; $('#unitBtn').disabled = !!sh;
  $('#scaleBtn').innerHTML = '1:' + app.doc.scale + ' ' + chev; $('#scaleBtn').hidden = !!sh;
  $('#fmtChip').hidden = $('#titleChip').hidden = !sh;
  if (sh) $('#fmtChip').innerHTML = `${sh.size} ${sh.land ? _t('poziomo') : _t('pionowo')} ${chev}`;
  showVpBar(); showTextBar();
  renderPills();
  if (tool.id === 'brush') showBrushBar();
  showHatchBar(); showBlockBar(); showToolBar();
  if (app.mini) renderBadge();
  if (!$('#layersPop').hidden) renderLayersPop();
  if (!$('#strokePop').hidden) renderStrokePop();
}
app.refreshUi = refreshUi;

// kreska i warstwa zaznaczenia: wspólna wartość albo „różne”
function selInfo() {
  const ents = app.doc.ents.filter(e => app.sel.has(e.id));
  if (!ents.length) return null;
  const same = f => ents.every(e => f(e) === f(ents[0])) ? f(ents[0]) : undefined;
  return { n: ents.length, ents, layer: same(e => e.layer), w: same(e => e.w), lt: same(e => e.lt), ew: same(e => strokeOf(app.doc, e).w), elt: same(e => strokeOf(app.doc, e).lt) };
}
function renderPills() {
  const d = app.doc, si = selInfo();
  const L = d.layers.find(x => x.id === (si ? si.layer : d.cur.layer));
  const sw = c => `<i class="sw" style="background:${c === '#1a1a19' ? 'var(--ink)' : c}"></i>`;
  $('#layerPill').innerHTML = (L ? sw(L.color) + `<span class="nm" translate="no">${esc(L.name)}</span>` : `<span class="nm">${_t('różne warstwy')}</span>`) +
    (si ? `<span class="selc">· ${_t`${si.n} zaznaczone`}</span>` : '') + chev;
  let w, lt, byLayer;
  if (si) { w = si.ew; lt = si.elt; byLayer = si.w === null && si.lt === null; }
  else { const cl = layerOf(d, { layer: d.cur.layer }); w = d.cur.w ?? cl.w; lt = d.cur.lt ?? cl.lt; byLayer = d.cur.w === null && d.cur.lt === null; }
  const txt = (w !== undefined ? wtxt(w) : '—') + ' ' + (lt !== undefined ? LTYPES[lt].name : _t('różne'));
  $('#strokePill').innerHTML = `<span style="color:var(--text)">${sample(w ?? 0.25, lt ?? 'solid', 30)}</span><span>${txt}</span>` + (byLayer ? `<span class="sub">${_t('jak warstwa')}</span>` : '') + chev;
}

/* ---------- okienka: warstwy ---------- */
let colorFor = null, renaming = null;
// okienko spod przycisku na górnym pasku unosi się nad kartką: górna krawędź = kartka + 12 px, prawa krawędź równo
// z prawą krawędzią przycisku (wytyczne-uklad-i-przyciski §2); spod przycisku gdzie indziej — tuż pod nim, od lewej
const POP_GAP = 12;
const fromTop = a => !!a.closest('#top');
const belowBar = (anchor, r) => fromTop(anchor) ? $('#view').getBoundingClientRect().top + POP_GAP : r.bottom + 6;
function placePop(pop, anchor) {
  pop.hidden = false;
  const r = anchor.getBoundingClientRect(), w = pop.offsetWidth;
  pop.style.left = Math.max(8, Math.min(fromTop(anchor) && r.left + r.width / 2 > innerWidth / 2 ? r.right - w : r.left, innerWidth - w - 8)) + 'px';
  pop.style.top = fitTop(pop, belowBar(anchor, r)) + 'px';
  anchor.classList.add('open');
}
// okienko nie może wystawać poza dół okna (niskie okno, przycisk niżej niż górny pasek)
const fitTop = (pop, top) => Math.max(8, Math.min(top, innerHeight - pop.offsetHeight - 8));
function closePops() {
  let any = false;
  for (const id of ['#layersPop', '#strokePop', '#menu', '#sheetPop', '#titlePop', '#exportPop', '#blocksPop', '#libSavePop']) { const el = $(id); if (el && !el.hidden) { el.hidden = true; any = true; } }
  document.querySelectorAll('.pill.open, .tb.open, .tbs.open, .ib.open').forEach(b => b.classList.remove('open'));
  colorFor = null; renaming = null; strokeTarget = 'auto';
  return any;
}
$('#layerPill').addEventListener('click', e => { e.stopPropagation(); const was = !$('#layersPop').hidden; closePops(); if (was) return; renderLayersPop(); placePop($('#layersPop'), $('#layerPill')); });
function renderLayersPop() {
  const d = app.doc, si = selInfo(), pop = $('#layersPop');
  const rows = d.layers.map(L => {
    const cur = L.id === d.cur.layer, empty = !d.ents.some(e => e.layer === L.id);
    const nm = renaming === L.id ? `<input value="${esc(L.name)}" data-rename="${L.id}" spellcheck="false">` : esc(L.name);
    return `<div class="layer${cur ? ' cur' : ''}${L.visible ? '' : ' off'}" data-id="${L.id}">
      <button class="swb" data-color="${L.id}" aria-label="${_t('Kolor warstwy')}" data-tip="${_t('Kolor warstwy')}"><i style="background:${L.color === '#1a1a19' ? 'var(--ink)' : L.color}"></i></button>
      <span class="nm" translate="no" data-pick="${L.id}" data-tip="${_t('Klik — warstwa dla nowych elementów, dwuklik — zmiana nazwy')}">${nm}</span>
      ${si ? `<button class="mv" data-move="${L.id}">${_t`Przenieś tutaj ${si.n}`}</button>` : ''}
      ${empty && !cur && d.layers.length > 1 ? `<button class="ic del" data-del="${L.id}" aria-label="${_t('Usuń pustą warstwę')}" data-tip="${_t('Usuń pustą warstwę')}">${ic('trash', 14)}</button>` : ''}
      <button class="ls" data-stroke="${L.id}" aria-label="${_t('Kreska warstwy')}" data-tip="${_t('Kreska warstwy')}">${sample(L.w, L.lt, 28, 4)}<span>${String(L.w).replace('0.', DEC)}</span></button>
      <button class="ic${L.visible ? ' act' : ''}" data-vis="${L.id}" aria-label="${_t('Widoczność')}" data-tip="${L.visible ? _t('Ukryj warstwę') : _t('Pokaż warstwę')}">${ic(L.visible ? 'eye' : 'eyeOff', 14)}</button>
      <button class="ic${L.locked ? ' act' : ''}" data-lock="${L.id}" aria-label="${_t('Blokada')}" data-tip="${L.locked ? _t('Odblokuj warstwę') : _t('Zablokuj warstwę')}">${ic(L.locked ? 'lock' : 'unlock', 14)}</button>
    </div>` + (colorFor === L.id ? `<div class="colors">${LAYER_COLORS.map(c => `<button data-setcolor="${c}" data-for="${L.id}" class="${c === L.color ? 'on' : ''}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>` : '');
  }).join('');
  const note = si ? _t`Zaznaczone: ${si.n}. „Przenieś tutaj” przy warstwie przenosi je na nią; z kreską „jak warstwa” przejmują jej kreskę.` : _t('Klik w nazwę — warstwa dla nowych elementów, dwuklik — zmiana nazwy. Kreska w wierszu zmienia kreskę warstwy.');
  morph(pop, `<div class="row" style="height:26px"><span class="ttl grow">${_t('Warstwy')}</span><button class="tbs" id="layerAdd">${_t('Dodaj')}</button></div><div class="hr" style="margin-top:4px"></div>${rows}<div class="hr"></div><p class="note">${note}</p>`);
  const inp = pop.querySelector('[data-rename]'); if (inp) { inp.focus(); inp.select(); }
}
$('#layersPop').addEventListener('click', e => {
  e.stopPropagation();
  const t = e.target.closest('button, [data-pick]'); if (!t) return;
  const d = app.doc, num = k => +t.dataset[k];
  if (t.id === 'layerAdd') {
    let n = d.layers.length + 1; while (d.layers.some(L => L.name === _t`Warstwa ${n}`)) n++;
    const L = app.edit(_t('Nowa warstwa'), tx => { const L = tx.addLayer({ name: _t`Warstwa ${n}`, color: LAYER_COLORS[(n - 1) % LAYER_COLORS.length] }); tx.setDoc({ cur: { ...d.cur, layer: L.id } }); return L; });
    renaming = L.id; renderLayersPop(); return;
  }
  if (t.dataset.pick && !t.querySelector('input')) { app.edit(_t('Bieżąca warstwa'), tx => tx.setDoc({ cur: { ...d.cur, layer: num('pick') } })); refreshUi(); return; }
  if (t.dataset.color) { colorFor = colorFor === num('color') ? null : num('color'); renderLayersPop(); return; }
  if (t.dataset.setcolor) { const id = +t.dataset.for; colorFor = null; app.edit(_t('Kolor warstwy'), tx => tx.setLayer(id, { color: t.dataset.setcolor })); return; }
  if (t.dataset.vis) { const L = d.layers.find(x => x.id === num('vis')); app.edit(L.visible ? _t('Ukryj warstwę') : _t('Pokaż warstwę'), tx => tx.setLayer(L.id, { visible: !L.visible })); if (!L.visible && L.id === d.cur.layer) toast(_t('Bieżąca warstwa jest ukryta — nowe elementy nie będą widoczne.')); pruneSel(); return; }
  if (t.dataset.lock) { const L = d.layers.find(x => x.id === num('lock')); app.edit(L.locked ? _t('Odblokuj warstwę') : _t('Zablokuj warstwę'), tx => tx.setLayer(L.id, { locked: !L.locked })); pruneSel(); return; }
  if (t.dataset.del) { app.edit(_t('Usuń warstwę'), tx => tx.delLayer(num('del'))); return; }
  if (t.dataset.move) { const id = num('move'), ids = [...app.sel]; app.edit(_t('Na warstwę'), tx => ids.forEach(i => tx.set(i, { layer: id }))); toast(_t`Przeniesiono: ${ids.length}`, 1200); return; }
  if (t.dataset.stroke) { strokeTarget = num('stroke'); renderStrokePop(); placePop($('#strokePop'), t); return; }
});
$('#layersPop').addEventListener('dblclick', e => { const t = e.target.closest('[data-pick]'); if (!t) return; renaming = +t.dataset.pick; renderLayersPop(); });
$('#layersPop').addEventListener('keydown', e => {
  const inp = e.target.closest('[data-rename]'); if (!inp) return;
  e.stopPropagation();
  if (e.key === 'Enter') inp.blur();
  if (e.key === 'Escape') { renaming = null; renderLayersPop(); }
});
$('#layersPop').addEventListener('focusout', e => {
  const inp = e.target.closest('[data-rename]'); if (!inp || renaming === null) return;
  const id = +inp.dataset.rename, v = inp.value.trim(); renaming = null;
  // dwie warstwy o tej samej nazwie myliłyby się przy wklejaniu, w bibliotece i w DXF (tam bez ogonków i wielkości liter)
  if (v && app.doc.layers.some(L => L.id !== id && fold(L.name) === fold(v))) { toast(_t`Warstwa „${esc(v)}” już jest.`); renderLayersPop(); return; }
  if (v) app.edit(_t('Nazwa warstwy'), tx => tx.setLayer(id, { name: v })); else renderLayersPop();
});
// zaznaczenie nie może trzymać elementów z ukrytych i zablokowanych warstw
function pruneSel() { let ch = false; for (const id of [...app.sel]) { const e = app.doc.ents.find(x => x.id === id); if (!e || !isLive(app.doc, e)) { app.sel.delete(id); ch = true; } } if (ch) app.selectionChanged(); }

/* ---------- okienka: kreska ---------- */
let strokeTarget = 'auto';   // 'auto' — zaznaczenie albo nowe elementy; liczba — kreska warstwy
$('#strokePill').addEventListener('click', e => { e.stopPropagation(); const was = !$('#strokePop').hidden && strokeTarget === 'auto'; closePops(); if (was) return; strokeTarget = 'auto'; renderStrokePop(); placePop($('#strokePop'), $('#strokePill')); });
function strokeState() {
  const d = app.doc;
  if (typeof strokeTarget === 'number') { const L = d.layers.find(x => x.id === strokeTarget); return { kind: 'layer', L, w: L.w, lt: L.lt, own: { w: L.w, lt: L.lt } }; }
  const si = selInfo();
  if (si) return { kind: 'sel', si, w: si.ew, lt: si.elt, own: { w: si.w, lt: si.lt }, L: si.layer !== undefined ? d.layers.find(x => x.id === si.layer) : null };
  const L = layerOf(d, { layer: d.cur.layer });
  return { kind: 'cur', L, w: d.cur.w ?? L.w, lt: d.cur.lt ?? L.lt, own: { w: d.cur.w, lt: d.cur.lt } };
}
function renderStrokePop() {
  const s = strokeState(), pop = $('#strokePop');
  const byLayer = s.kind !== 'layer' && s.own.w === null && s.own.lt === null;
  const head = s.kind === 'layer' ? `<span class="ttl grow">${_t`Kreska warstwy ${esc(s.L.name)}`}</span>`
    : `<span class="ttl grow">${_t('Jak warstwa')}${s.L ? ` <span class="lbl" style="font-weight:400">· ${esc(s.L.name)}: ${wtxt(s.L.w)} ${LTYPES[s.L.lt].name}</span>` : ''}</span><button class="tgl${byLayer ? ' on' : ''}" id="byLayerTgl" role="switch" aria-checked="${byLayer}" aria-label="${_t('Jak warstwa')}"></button>`;
  const fromLayer = k => s.kind !== 'layer' && s.own[k] === null;
  const ws = WEIGHTS.map(w => `<button class="krow${w === s.w ? (fromLayer('w') ? ' lay' : ' on') : ''}" data-w="${w}">${sample(w, 'solid', 96)}<span>${wtxt(w)}</span></button>`).join('');
  const ts = LTYPE_IDS.map(id => `<button class="krow${id === s.lt ? (fromLayer('lt') ? ' lay' : ' on') : ''}" data-lt="${id}">${sample(0.25, id, 96)}<span>${LTYPES[id].name}</span></button>`).join('');
  const note = s.kind === 'layer' ? _t('Zmiana dotyczy wszystkich elementów tej warstwy z kreską „jak warstwa”.')
    : s.kind === 'sel' ? _t`Zmiana dotyczy zaznaczonych elementów (${s.si.n}). Obwódka — kreska z warstwy.`
    : _t`Dotyczy następnych elementów. Obwódka — kreska z warstwy. Istniejące linie najszybciej przemalujesz pędzlem (${prettyCombo(keysFor('brush', app.keys.over)[0] || 'M', isMac)}).`;
  morph(pop, `<div class="row" style="height:28px">${head}</div><div class="hr"></div>
    <div class="kcols"><div class="kcol"><div class="h">${_t('Grubość, mm')}</div>${ws}</div><div class="kcol"><div class="h">${_t('Rodzaj')}</div>${ts}</div></div>
    <div class="hr"></div><p class="note">${note}</p>`);
}
$('#strokePop').addEventListener('click', e => {
  e.stopPropagation();
  const t = e.target.closest('button'); if (!t) return;
  const s = strokeState(), d = app.doc;
  let patch = null;
  if (t.id === 'byLayerTgl') patch = (s.own.w === null && s.own.lt === null) ? { w: s.w, lt: s.lt } : { w: null, lt: null };
  else if (t.dataset.w) patch = { w: +t.dataset.w };
  else if (t.dataset.lt) patch = { lt: t.dataset.lt };
  if (!patch) return;
  if (s.kind === 'layer') app.edit(_t('Kreska warstwy'), tx => tx.setLayer(s.L.id, patch));
  else if (s.kind === 'sel') { const ids = s.si.ents.map(e => e.id); app.edit(_t('Kreska'), tx => ids.forEach(id => tx.set(id, patch))); }
  else { app.edit(_t('Kreska'), tx => tx.setDoc({ cur: { ...d.cur, ...patch } })); refreshUi(); }
});
document.addEventListener('pointerdown', e => { if (!e.target.closest('.pop, .menu, .pill, #miniBadge, #status .unit, #status .chip, #fileBtn, #setBtn, #pdfBtn, .toolbar')) closePops(); });

// przebudowa paska albo okienka „w miejscu”: te same elementy zostają (zmieniają się tylko napisy i atrybuty),
// więc kliknięty przycisk nie znika i jego animacja wciśnięcia / „tak” się odgrywa; pole z kursorem zostaje nietknięte
const KEEP_CLS = ['wcis', 'tak', 'nie', 'wlacz', 'wylacz', 'open', 'zind'];
// „tożsamość” elementu: id i nazwy atrybutów data-* z wartościami kluczy — inny element na tym miejscu (np. nowa zakładka
// tam, gdzie był „+”, wiersz kolorów zamiast wiersza warstwy) jest podmieniany, a nie przerabiany (nie przejmuje animacji ani podpowiedzi)
const KEY_ATTR = ['data-sp', 'data-id', 'data-rel', 'data-for', 'data-tab', 'data-cat'];
const keyOf = e => (e.id || '') + '|' + [...e.attributes].filter(a => a.name.startsWith('data-')).map(a => a.name + (KEY_ATTR.includes(a.name) ? '=' + a.value : '')).sort().join(',');
function morph(el, html) { const t = document.createElement('template'); t.innerHTML = html; syncKids(el, t.content); }
function syncKids(old, neu) {
  // wskaźnik zakładek (.seg > .ind) dokłada app.js — nie ma go w nowym kodzie, więc go pomijamy
  const a = [...old.childNodes].filter(x => !(x.nodeType === 1 && x.classList.contains('ind') && old.classList?.contains('seg'))), b = [...neu.childNodes];
  for (let i = 0; i < b.length; i++) {
    const o = a[i], n = b[i];
    if (!o) { old.append(n); continue; }
    if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName || (o.nodeType === 1 && keyOf(o) !== keyOf(n))) { o.replaceWith(n); continue; }
    if (o.nodeType !== 1) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; continue; }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(o.nodeName)) { if (o !== document.activeElement) o.replaceWith(n); continue; }
    for (const at of [...o.attributes]) if (!n.hasAttribute(at.name)) o.removeAttribute(at.name);
    for (const at of [...n.attributes]) {
      let v = at.value;
      if (at.name === 'class') v = [v, ...KEEP_CLS.filter(c => o.classList.contains(c))].join(' ').trim();
      if (o.getAttribute(at.name) !== v) o.setAttribute(at.name, v);
    }
    if (!n.hasAttribute('class')) { const k = KEEP_CLS.filter(c => o.classList.contains(c)); if (k.length) o.setAttribute('class', k.join(' ')); }
    syncKids(o, n);
  }
  for (let i = b.length; i < a.length; i++) a[i].remove();
}

/* ---------- pasek pędzla ---------- */
function showBrushBar() {
  let el = $('#brushBar');
  if (!el) { el = document.createElement('div'); el.id = 'brushBar'; el.className = 'toolbar'; view.append(el); el.addEventListener('pointerdown', e => e.stopPropagation()); el.addEventListener('click', e => { const br = app.tools.brush; if (e.target.closest('[data-pick]')) { br.picking = !br.picking; refreshUi(); return; } const b = e.target.closest('[data-mode]'); if (b) { br.mode = b.dataset.mode; showBrushBar(); } }); }
  const br = app.tools.brush, c = br.getCarry(), L = app.doc.layers.find(x => x.id === c.layer) || app.doc.layers[0];
  const w = c.w ?? L.w, lt = c.lt ?? L.lt;
  morph(el, `<span class="t">${_t('Pędzel')}</span>
    <div class="seg">${[['both', _t('Kreska i warstwa')], ['stroke', _t('Tylko kreska')], ['layer', _t('Tylko warstwa')]].map(([m, n]) => `<button data-mode="${m}" class="${br.mode === m ? 'on' : ''}">${n}</button>`).join('')}</div>
    <span class="lbl">${_t('Maluje:')}</span>
    <div class="smp">${br.mode !== 'stroke' ? `<i style="background:${L.color === '#1a1a19' ? 'var(--ink)' : L.color}"></i><span translate="no">${esc(L.name)}</span>` : ''}${br.mode === 'both' ? '<span class="lbl">·</span>' : ''}${br.mode !== 'layer' ? `${sample(w, lt, 30)}<span>${wtxt(w)} ${LTYPES[lt].name}${c.w === null && c.lt === null ? ' <span class="lbl">(' + _t('jak warstwa') + ')</span>' : ''}</span>` : ''}</div>
    <span class="lbl">${_t('z pastylek u góry')}</span>
    <button data-pick class="pick${br.picking ? ' on' : ''}" data-tip="${_t('Pipeta')} (${app.altName} + ${_t('klik')})">${_t('Pipeta')}</button>`);
  // pastylki, z których maluje pędzel, dostają obwódkę
  $('#layerPill').classList.toggle('src', br.mode !== 'stroke'); $('#strokePill').classList.toggle('src', br.mode !== 'layer');
}
// paski narzędzi nad kartką: gdy pasek nie mieści się w wąskim oknie, chowają się podpisy pomocnicze (.lbl)
// (sprawdzane po każdej zmianie treści paska — bez czekania na klatkę obrazu)
function fitBar(el) {
  if (!el.isConnected) return;
  el.classList.remove('tight');
  if (el.offsetWidth > view.clientWidth - 24) el.classList.add('tight');
}
new MutationObserver(ms => {
  const bars = new Set();
  for (const m of ms) { const el = (m.target.nodeType === 1 ? m.target : m.target.parentElement)?.closest('.toolbar') || [...m.addedNodes].find(n => n.classList?.contains('toolbar')); if (el) bars.add(el); }
  bars.forEach(fitBar);
}).observe(view, { childList: true, subtree: true, characterData: true });
addEventListener('resize', () => view.querySelectorAll(':scope > .toolbar').forEach(fitBar));
function hideBrushBar() { $('#brushBar')?.remove(); $('#layerPill').classList.remove('src'); $('#strokePill').classList.remove('src'); }

/* ---------- tryb minimalny (Tab): sama kartka, plakietka z narzędziem, warstwą i kreską ---------- */
function setMini(on) {
  app.mini = on; document.body.classList.toggle('mini', on);
  try { localStorage.setItem('rysio.mini', on ? '1' : ''); } catch (e) {}
  closePops();
  if (!on) { $('#miniBadge')?.remove(); $('#miniExit')?.remove(); }
  refreshUi(); redraw();
}
function renderBadge() {
  let el = $('#miniBadge');
  if (!el) {
    el = document.createElement('div'); el.id = 'miniBadge'; view.append(el);
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', e => {
      if (e.target.closest('[data-space]')) { const ids = [0, ...app.doc.sheets.map(s => s.id)]; setSpace(ids[(ids.indexOf(app.space) + 1) % ids.length]); refreshUi(); redraw(); return; }
      const b = e.target.closest('[data-open]'); if (!b) return;
      e.stopPropagation();
      const pop = b.dataset.open === 'layer' ? $('#layersPop') : $('#strokePop'), was = !pop.hidden && (b.dataset.open === 'layer' || strokeTarget === 'auto');
      closePops(); if (was) return;
      if (b.dataset.open === 'layer') renderLayersPop(); else { strokeTarget = 'auto'; renderStrokePop(); }
      placePop(pop, b);
    });
    const x = document.createElement('div'); x.id = 'miniExit'; view.append(x);
  }
  const k = app.keyName('mini');
  $('#miniExit').innerHTML = k ? `<kbd>${esc(k)}</kbd> ${_t('pełny widok')}` : _t('pełny widok: Widok → Tryb minimalny');
  const name = tool.badge?.() || (ACTIONS.find(a => a.id === tool.id) || {}).name || '';
  const spName = app.blockEdit ? _t`Blok „${blockName(app.blockEdit.id)}”` : app.space ? (app.sheet()?.name || _t('Arkusz')) : _t('Model');
  el.innerHTML = `<span class="click" data-space data-tip="${_t('Następna zakładka')}">${esc(spName)}</span><span class="sep"></span><span class="t">${esc(name)}</span><span class="sep"></span>
    <span class="click" data-open="layer">${$('#layerPill').innerHTML}</span>
    <span class="click" data-open="stroke">${$('#strokePill').innerHTML}</span>`;
}

/* ---------- kreskowanie: pasek wzoru (narzędzie H albo zaznaczone kreskowania) ---------- */
const PAT_SVG = {
  diag: '<path d="M-2 18 18 -2M-2 10 10 -2M6 18 18 6M-2 26 26 -2" stroke="currentColor" stroke-width="1"/>',
  cross: '<path d="M-2 18 18 -2M-2 10 10 -2M6 18 18 6M-2 2 18 22M-2 10 10 22M6 -2 26 18" stroke="currentColor" stroke-width=".9"/>',
  conc: '<g fill="none" stroke="currentColor" stroke-width=".9"><path d="M3 4l3-1 1 3z"/><path d="M13 9l3 1-1 3z"/><circle cx="8" cy="12" r=".7"/><circle cx="17" cy="4" r=".6"/></g>',
  ins: '<path d="M0 12 3 3 6 12 9 3 12 12 15 3 18 12 21 3" fill="none" stroke="currentColor" stroke-width="1"/>',
  soil: '<path d="M2 12l3-3M4 12l3-3M6 12l3-3M12 6l3-3M14 6l3-3M16 6l3-3" stroke="currentColor" stroke-width="1"/>',
  solid: '<rect x="2" y="2" width="18" height="12" rx="1" fill="currentColor" opacity=".8"/>'
};
const selHatches = () => (tool.id === 'select' || tool.id === 'hatch') && app.sel.size ? app.ents().filter(e => app.sel.has(e.id)) : [];
// pasek narzędzia: rodzaj wymiaru, zaokrąglij / fazuj, wynik mierzenia
function showToolBar() {
  let el = $('#toolBar2');
  if (!['dim', 'fillet', 'measure'].includes(tool.id) || (tool.id === 'dim' && app.vpEdit)) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'toolBar2'; el.className = 'toolbar'; view.append(el);
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.kind && tool.id === 'dim') tool.setKind(b.dataset.kind);
      else if (b.dataset.fm && tool.id === 'fillet' && tool.mode !== b.dataset.fm) tool.toggle();
      else if (b.dataset.copy != null) { navigator.clipboard?.writeText(el._copy || '').then(() => toast(_t('Skopiowano wynik.'), 1200), () => toast(_t('Nie udało się skopiować do schowka.'))); return; }
      refreshUi(); redraw();
    });
  }
  const fld = (label, v, big) => `<span class="fld${big ? ' big' : ''}"><em>${label}</em>${v}</span>`;
  let html = '', copy = '';
  if (tool.id === 'dim') {
    const ks = [['lin', _t('Liniowy')], ['ang', _t('Kątowy')], ['rad', _t('Promień')], ['dia', _t('Średnica')]];
    html = `<span class="t">${_t('Wymiar')}</span><div class="seg">${ks.map(([k, n]) => `<button data-kind="${k}" class="${tool.kind === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  } else if (tool.id === 'fillet') {
    const ch = tool.mode === 'chamfer';
    html = `<span class="t">${_t('Narożnik')}</span><div class="seg"><button data-fm="fillet" class="${ch ? '' : 'on'}">${_t('Zaokrąglij')}</button><button data-fm="chamfer" class="${ch ? 'on' : ''}">${_t('Fazuj')}</button></div>`
      + fld(ch ? _t('Odległość') : _t('Promień'), ch ? tool.dText() : fmtLength(tool.r))
      + `<span class="lbl">${ch ? _t('cyfry zmieniają odległość · dwie po średniku: 0,3;0,5') : _t('cyfry zmieniają promień')}</span>`;
  } else {
    // pole w jednostce rysunku (na arkuszu — mm² papieru)
    const r = tool.info(), u = app.space ? 'mm' : app.doc.units;
    const fA = v => (u === 'm' ? v.toFixed(2) : (v * (u === 'cm' ? 1e4 : 1e6)).toFixed(0)).replace('.', DEC) + ' ' + u + '²';
    if (!r) html = `<span class="t">${_t('Mierz')}</span><span class="lbl">${_t('kliknij pierwszy punkt')}</span>`;
    else if (r.area != null) { html = `<span class="t">${_t('Mierz')}</span>${fld(_t('Pole'), fA(r.area), true)}${fld(_t('Obwód'), fmtLength(r.per))}`; copy = `${_t('Pole')} ${fA(r.area)}, ${_t('Obwód')} ${fmtLength(r.per)}`; }
    else {
      html = `<span class="t">${_t('Mierz')}</span>` + (r.seg != null ? fld(_t('Odcinek'), fmtLength(r.seg), true) : '') + fld(_t('Razem'), fmtLength(r.total))
        + (r.seg != null ? fld(_t('Kąt'), (Math.round(r.ang * 1800 / Math.PI) / 10).toFixed(1).replace('.', DEC) + '°') + fld('Δx; Δy', fmtLength(r.dx) + '; ' + fmtLength(r.dy)) : '');
      copy = (r.seg != null ? `${_t('Odcinek')} ${fmtLength(r.seg)}, ` : '') + `${_t('Razem')} ${fmtLength(r.total)}`;
    }
    if (copy) html += `<button class="tbs" data-copy>${_t('Kopiuj wynik')}</button>`;
  }
  el._copy = copy;
  if (el._html !== html) { morph(el, html); el._html = html; }
}
function showHatchBar() {
  const hs = selHatches(), onSel = hs.length && hs.every(e => e.t === 'hatch');
  let el = $('#hatchBar');
  if (tool.id !== 'hatch' && !onSel) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'hatchBar'; el.className = 'toolbar'; view.append(el);
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', e => { const b = e.target.closest('[data-pat]'); if (b) setHatch({ pat: b.dataset.pat }); });
    el.addEventListener('change', e => {
      const f = e.target.dataset.f; if (!f) return;
      const v = parseFloat(String(e.target.value).replace(',', '.'));
      if (!Number.isFinite(v) || (f === 'ps' && !(v > 0))) { refreshUi(); return; }
      // gęściej niż 0,1 kreski zlewają się (i przestają się rysować), rzadziej niż 100 — znikają z obszaru
      if (f === 'ps' && (v < 0.1 || v > 100)) { toast(_t('Skala kreskowania: od 0,1 do 100.'), 2200); refreshUi(); return; }
      setHatch(f === 'ps' ? { ps: v } : { ang: ((v % 360) + 360) % 360 * Math.PI / 180 });
    });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); e.stopPropagation(); });
  }
  const o = onSel ? hs[0] : app.tools.hatch.opts;
  const html = `<span class="t">${_t('Kreskowanie')}</span>
    <div class="pats">${PATTERN_IDS.map(id => `<button data-pat="${id}" class="${o.pat === id ? 'on' : ''}" aria-label="${PATTERNS[id].name}" data-tip="${PATTERNS[id].name}"><svg width="22" height="16" viewBox="0 0 22 16"><defs><clipPath id="cp-${id}"><rect width="22" height="16" rx="2"/></clipPath></defs><g clip-path="url(#cp-${id})">${PAT_SVG[id]}</g></svg></button>`).join('')}</div>
    <span class="lbl">${PATTERNS[o.pat]?.name || ''}</span>
    <label class="fld"><em>${_t('Skala')}</em><input data-f="ps" value="${fmtNum(o.ps || 1)}" inputmode="decimal"></label>
    <label class="fld"><em>${_t('Kąt')}</em><input data-f="ang" value="${fmtNum(Math.round((o.ang || 0) * 180 / Math.PI * 10) / 10)}" inputmode="decimal">°</label>
    ${onSel ? `<span class="lbl">${hs.length > 1 ? _t`zmienia ${hs.length} zaznaczone` : _t('zmienia zaznaczone')}</span>` : ''}`;
  if (el._html !== html) { morph(el, html); el._html = html; }
}
const fmtNum = v => String(+(+v).toFixed(3)).replace('.', DEC);
function setHatch(patch) {
  const hs = selHatches();
  const o = app.tools.hatch.opts, onSel = hs.length && hs.every(e => e.t === 'hatch');
  if (patch.pat && patch.pat !== (onSel ? hs[0].pat : o.pat)) patch.ang = PATTERNS[patch.pat].ang * Math.PI / 180;
  // zaznaczone kreskowania (też to właśnie położone) zmieniają się od razu; w narzędziu kreskowania ustawienia idą też na następne
  if (onSel) app.edit(_t('Kreskowanie'), tx => hs.forEach(e => tx.set(e.id, patch)));
  if (!onSel || tool.id === 'hatch') Object.assign(o, patch);
  refreshUi(); redraw();
}

/* ---------- bloki: pasek (wstawianie, nowy blok, zaznaczony blok, edycja w miejscu) ---------- */
const blockName = id => (app.doc.blocks.find(b => b.id === id) || {}).name || '?';
const insCount = id => app.doc.ents.filter(e => e.t === 'ins' && e.b === id).length;
const blockThumb = id => thumbOf(blockEnts(id));
// miniatura bloku (elementy w układzie bloku) z niebieskim krzyżykiem w punkcie wstawienia
function thumbOf(ents, w = 160, h = 108) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  let b = null; for (const e of ents) { try { b = boxUnion(b, bbox(e)); } catch (err) {} }
  if (!b) return c.toDataURL();
  b = boxUnion(b, [0, 0, 0, 0]);   // punkt wstawienia zawsze w kadrze
  const bw = Math.max(b[2] - b[0], 1e-6), bh = Math.max(b[3] - b[1], 1e-6), k = Math.min((w - 24) / bw, (h - 24) / bh);
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, toScreen = p => [w / 2 + (p[0] - cx) * k, h / 2 - (p[1] - cy) * k];
  const ctx = c.getContext('2d'), pen = new CanvasPen(ctx, { toScreen, ppm: k }), css = getComputedStyle(document.body);
  const ink = css.getPropertyValue('--ink').trim() || '#1a1a19';
  for (const e of ents) drawEnt(pen, app.doc, e, { ppm: k, ink, thin: true, scale: app.doc.scale });
  const [x, y] = toScreen([0, 0]);
  ctx.strokeStyle = css.getPropertyValue('--sel').trim() || '#3f63a8'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.stroke();
  return c.toDataURL();
}
function selIns() { if (tool.id !== 'select' || app.sel.size !== 1 || app.blockEdit) return null; const e = app.ents().find(x => app.sel.has(x.id)); return e && e.t === 'ins' ? e : null; }
function showBlockBar() {
  const bt = tool.id === 'block' ? app.tools.block : null, si = selIns(), be = app.blockEdit;
  let el = $('#blockBar');
  if (!bt && !si && !be) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'blockBar'; el.className = 'toolbar'; view.append(el);
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', onBlockBar);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); e.stopPropagation(); });
    el.addEventListener('input', e => { if (e.target.dataset.b === 'newname') app.tools.block.name = e.target.value; });
    el.addEventListener('change', e => {
      if (e.target.dataset.b !== 'rename') return;
      const ins = selIns(), name = e.target.value.trim(); if (!ins) { refreshUi(); return; }
      const back = () => { e.target.value = blockName(ins.b); react(e.target.closest('.fld'), 'nie'); };   // odrzucona nazwa nie zostaje w polu
      if (!name) { back(); return; }
      if (app.doc.blocks.some(b => b.name === name && b.id !== ins.b)) { toast(_t`Blok „${esc(name)}” już jest.`); back(); return; }
      app.edit(_t('Nazwa bloku'), tx => tx.setDoc({ blocks: app.doc.blocks.map(b => b.id === ins.b ? { ...b, name } : b) }));
    });
  }
  el.classList.toggle('right', !!(be || (si && !bt)));
  let html;
  if (be) html = `<span class="t">${_t`Edycja bloku „${esc(blockName(be.id))}”`}</span><span class="lbl">${_t`zmiana obejmie wszystkie wstawienia (${insCount(be.id)})`}</span>
    <button class="tbs pri" data-b="done">${_t('Gotowe')}</button><button class="tbs" data-b="cancel">${_t('Anuluj')}</button>`;
  else if (bt && bt.mode === 'create') html = `<span class="t">${_t('Nowy blok')}</span><label class="fld"><em>${_t('Nazwa')}</em><input data-b="newname" value="${esc(bt.name)}"></label><span class="lbl">${_t('kliknij punkt wstawienia')}</span>`;
  else if (bt && bt.mode === 'insert') html = `<span class="t">${_t('Bloki')}</span>` + (bt.cur ? `<button class="tbs" data-b="pick">${esc(blockName(bt.cur))} ${chev}</button><span class="lbl">${_t('klik wstawia · cyfry wpisują obrót')}</span>` : `<button class="tbs" data-b="pick">${_t('Wybierz blok')} ${chev}</button><span class="lbl">${_t('w rysunku nie ma jeszcze bloków')}</span>`);
  else if (bt) { el.remove(); return; }
  else html = `<span class="t">${_t('Blok')}</span><label class="fld"><input data-b="rename" value="${esc(blockName(si.b))}" aria-label="${_t('Nazwa bloku')}"></label><span class="lbl">${_t`${insCount(si.b)} w rysunku`}</span>
    <button class="tbs" data-b="edit">${_t('Edytuj w miejscu')}</button><button class="tbs" data-b="explode">${_t('Rozbij')}</button><button class="tbs" data-b="swap">${_t('Zamień na…')} ${chev}</button>
    <button class="tbs" data-b="tolib" data-tip="${_t('Zapisz blok w bibliotece — będzie pod ręką w innych rysunkach')}">${IC_FOLDER}${_t('Do biblioteki')}</button>`;
  if (el._html !== html) { morph(el, html); el._html = html; }
}
function onBlockBar(e) {
  const b = e.target.closest('[data-b]'); if (!b) return;
  e.stopPropagation();
  const act = b.dataset.b;
  if (act === 'done') return endBlockEdit(false);
  if (act === 'cancel') return endBlockEdit(true);
  if (act === 'pick') return openBlocksPop(b, pickForInsert);
  const ins = selIns(); if (!ins) return;
  if (act === 'tolib') return openSavePop(b, { insId: ins.id, base: null, name: blockName(ins.b), cat: null, exists: false });
  if (act === 'edit') return startBlockEdit(ins);
  if (act === 'explode') {
    const ids = [];
    app.edit(_t('Rozbij blok'), tx => { tx.del(ins.id); for (const n of explodeIns(ins)) ids.push(tx.add({ ...n, sp: ins.sp }).id); });
    app.sel = new Set(ids); app.selectionChanged(); return;
  }
  if (act === 'swap') return openBlocksPop(b, id => { if (id !== ins.b) app.edit(_t('Zamień blok'), tx => tx.set(ins.id, { b: id })); }, ins.b);
}
const pickForInsert = id => { app.tools.block.cur = id; refreshUi(); redraw(); };
/* okienko bloków: zakładki „W rysunku” i „Biblioteka” (folder z plikami DXF — zob. library.js i main.js: lib-*) */
const lib = { info: null, list: null, cache: new Map(), pending: new Map(), tab: null, cat: '', q: '', loading: null, gen: 0 };
const IC_FOLDER = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4.5V12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3.5H3A1 1 0 0 0 2 4.5z"/></svg>';
// miniatura pamiętana do zmiany pliku albo motywu (kolor kreski)
const inkNow = () => getComputedStyle(document.body).getPropertyValue('--ink').trim();
const libFresh = (c, it) => !!c && c.mtime === it.mtime && c.ink === inkNow();
const libShort = dir => api.web ? _t('Biblioteka w przeglądarce') : String(dir || '').split(/[\\/]/).filter(Boolean).slice(-3).join(' › ');
const libShowLabel = () => isMac ? _t('Pokaż w Finderze') : _t('Pokaż w Eksploratorze');
// wczytanie listy plików; równoczesne wywołania czekają na to samo (force po trwającym — jeszcze raz, po nim)
function libLoad(force = false) {
  if (!force && (lib.info || lib.loading)) return lib.loading || Promise.resolve();
  const run = async () => {
    try { lib.info = await api.libInfo(); lib.list = lib.info.ok ? (await api.libList()) || [] : null; }
    catch (err) { lib.info = { dir: null, ok: false }; lib.list = null; }
  };
  const p = (lib.loading ? lib.loading.then(run) : run()).finally(() => { if (lib.loading === p) lib.loading = null; });
  return lib.loading = p;
}
// błąd z procesu głównego → zrozumiały komunikat
function libErr(err) {
  const m = String(err && err.message || err).replace(/^Error invoking remote method '[^']*': (\w*Error: )?/, '');
  if (/EACCES|EPERM/.test(m)) return _t('brak uprawnień do zapisu w tym folderze');
  if (/ENOSPC/.test(m)) return _t('brak miejsca na dysku');
  if (/ENOENT/.test(m)) return _t('nie ma takiego pliku albo folderu');
  if (m === 'FULL') return _t('pamięć przeglądarki jest pełna');
  if (m === '?') return _t('niedozwolona nazwa pliku');
  return m;
}
// plik → paczka i miniatura (pamiętane do zmiany pliku)
async function libEntry(it) {
  const c = lib.cache.get(it.rel);
  if (libFresh(c, it)) return c;
  if (lib.pending.has(it.rel)) return lib.pending.get(it.rel);
  const p = libEntryLoad(it).finally(() => lib.pending.delete(it.rel));
  lib.pending.set(it.rel, p); return p;
}
async function libEntryLoad(it) {
  const e = { mtime: it.mtime, ink: inkNow() };
  try {
    e.pack = libPack(await api.libRead(it.rel), it.name, app.doc.scale);
    const g = libGhosts(e.pack); e.thumb = thumbOf(g);
    let b = null; for (const x of g) { try { b = boxUnion(b, bbox(x)); } catch (err) {} }
    if (b) e.size = `${fmtLength(b[2] - b[0]).replace(/ \S+$/, '')} × ${fmtLength(b[3] - b[1])}`;
  } catch (err) { e.err = libErr(err); }
  lib.cache.set(it.rel, e); return e;
}
async function libChoose() {
  const r = await api.libChoose(); if (!r) return false;
  lib.cache.clear(); lib.cat = ''; await libLoad(true);
  // zupełnie pusty folder: bloki na start (do folderu z innymi plikami — tylko na życzenie, przyciskiem)
  if (lib.list && !lib.list.length && await api.libEmpty()) await libSeed();
  return true;
}
async function libSeed() {
  let n = 0;
  try { for (const f of starterFiles(app.doc.scale)) { const r = await api.libWrite(f.rel, f.text, false); if (r && r.ok) n++; } }
  catch (err) { toast(_t`Nie udało się zapisać w folderze biblioteki: ${esc(libErr(err))}`, 5000); }
  await libLoad(true);
  if (n) toast(_t`Wgrano bloki na start: ${n}.`, 3000);
}

function openBlocksPop(anchor, onPick, skip = null, tab = null) {
  let pop = $('#blocksPop');
  if (!pop) {
    pop = document.createElement('section'); pop.id = 'blocksPop'; pop.className = 'pop'; pop.hidden = true; document.body.append(pop);
    pop.addEventListener('pointerdown', e => e.stopPropagation());
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') { closePops(); e.preventDefault(); } e.stopPropagation(); });
    pop.addEventListener('input', e => { if (e.target.dataset.q != null) { lib.q = e.target.value; renderLibGrid(pop); } });
    pop.addEventListener('click', onBlocksPopClick);
  }
  const was = !pop.hidden; closePops(); if (was) return;
  pop._ctx = { anchor, onPick, skip };
  pop._tab = tab || (app.doc.blocks.some(b => b.id !== skip) ? lib.tab || 'doc' : 'lib');
  renderBlocksPop(pop);
  placePop(pop, anchor);
  libRefresh(pop);
}
// przy każdym otwarciu biblioteki — świeża lista plików (bloki dodane na innym komputerze albo wrzucone ręcznie)
function libRefresh(pop) {
  if (!lib.info?.ok || pop._tab !== 'lib') return;
  const sig = () => JSON.stringify((lib.list || []).map(it => [it.rel, it.mtime]));
  const was = sig(), ctx = pop._ctx;
  libLoad(true).then(() => { if (sig() !== was && !pop.hidden && pop._ctx === ctx && pop._tab === 'lib') renderBlocksPop(pop); });
}
function renderBlocksPop(pop) {
  const { skip } = pop._ctx, tab = pop._tab;
  const tabs = `<div class="seg" role="tablist"><button data-tab="doc" class="${tab === 'doc' ? 'on' : ''}">${_t('W rysunku')}</button><button data-tab="lib" class="${tab === 'lib' ? 'on' : ''}">${_t('Biblioteka')}</button></div>`;
  let body;
  if (tab === 'doc') {
    const list = app.doc.blocks.filter(b => b.id !== skip);
    body = `<div class="blocks">${list.map(b => { const n = insCount(b.id);
      return `<button class="blk${app.tools.block.cur === b.id && !skip ? ' on' : ''}" data-id="${b.id}"><img src="${blockThumb(b.id)}" alt=""><b translate="no">${esc(b.name)}</b><span>${n ? _t`${n} w rysunku` : _t('nieużywany')}</span></button>`; }).join('')
      || `<div class="none">${_t('W rysunku nie ma jeszcze bloków.')}</div>`}</div>
      <div class="lbl" style="padding:2px 4px">${_t`Nowy blok: zaznacz elementy i naciśnij ${app.keyName('block') || 'K'}.`}</div>`;
  } else if (!lib.info) {
    body = `<div class="libempty"><span class="lbl">${_t('Czytam bibliotekę…')}</span></div>`;
    libLoad().then(() => { if (lib.info && !pop.hidden && pop._tab === 'lib') renderBlocksPop(pop); });
  } else if (!lib.info.ok) {
    body = `<div class="libempty">${IC_FOLDER.replace(/"14"/g, '"22"')}
      <span class="ttl">${lib.info.dir ? _t('Folder biblioteki jest niedostępny') : _t('Biblioteka nie ma jeszcze folderu')}</span>
      <span>${lib.info.dir ? _t`Nie ma folderu ${esc(lib.info.dir)} — może dysk w chmurze jest odłączony. Wskaż go jeszcze raz albo wybierz inny.` : _t('Wskaż folder, w którym będą leżeć bloki. Jeśli wybierzesz folder w OneDrive, Dropboxie albo iCloud, ta sama biblioteka będzie w biurze i w domu.')}</span>
      ${lib.info.dir ? '' : `<span class="lbl">${_t('Do pustego folderu wgramy ponad dwadzieścia podstawowych bloków na start.')}</span>`}
      <button class="tbs pri" data-lib="choose">${_t('Wskaż folder…')}</button></div>`;
  } else if (!lib.list.length) {
    body = `<div class="libempty"><span class="ttl">${_t('W folderze nie ma jeszcze bloków')}</span>
      <span>${_t('Zaznacz wstawiony blok i naciśnij „Do biblioteki” albo wrzuć do folderu pliki DXF.')}</span>
      <button class="tbs" data-lib="seed">${_t('Wgraj bloki na start')}</button></div>` + libFoot();
  } else {
    const cats = [...new Set(lib.list.map(it => it.cat))].sort((a, b) => a.localeCompare(b));
    if (lib.cat && lib.cat !== '~' && !cats.includes(lib.cat)) lib.cat = '';
    body = `<label class="search libq"><input data-q placeholder="${_t('Szukaj w bibliotece')}" value="${esc(lib.q)}" spellcheck="false"></label>
      <div class="cats">${['', ...cats.filter(Boolean)].map(c => `<button data-cat="${esc(c)}" class="${c === lib.cat ? 'on' : ''}">${c ? esc(c) : _t('Wszystkie')}</button>`).join('')}${cats.includes('') && cats.length > 1 ? `<button data-cat="~" class="${lib.cat === '~' ? 'on' : ''}">${_t('Bez kategorii')}</button>` : ''}</div>
      <div class="blocks" data-grid></div>` + libFoot();
  }
  morph(pop, `<div class="row">${tabs}</div>${body}`);
  if (pop.querySelector('[data-grid]')) renderLibGrid(pop);
  if (!pop.hidden) placePop(pop, pop._ctx.anchor);   // treść zmieniła wysokość — okienko dalej mieści się w oknie
}
const libFoot = () => `<div class="libfoot"><span class="path" data-tip="${esc(lib.info.dir || '')}">${IC_FOLDER}<span>${esc(libShort(lib.info.dir))}</span></span>${api.web ? '' : `<button class="tbs" data-lib="show">${libShowLabel()}</button>`}<button class="tbs" data-lib="choose">${_t('Zmień…')}</button></div>`;
// szukanie bez ogonków i wielkości liter; „x” znajduje też „×” (80x160 → 80×160)
const srch = s => String(s).toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/×/g, 'x');
// blok z biblioteki już w rysunku: ta sama nazwa albo nazwa, z której powstała nazwa pliku (np. „a/b” → plik „a-b”)
const libInDoc = it => app.doc.blocks.find(b => b.name === it.name) || app.doc.blocks.find(b => fileSafe(b.name) === it.name);
function renderLibGrid(pop) {
  const grid = pop.querySelector('[data-grid]'); if (!grid) return;
  const q = srch(lib.q.trim());
  const items = lib.list.filter(it => (!lib.cat || (lib.cat === '~' ? !it.cat : it.cat === lib.cat)) && (!q || srch(it.name + ' ' + it.cat).includes(q))).sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  grid.innerHTML = items.map(it => { const c = lib.cache.get(it.rel), ok = libFresh(c, it);
    const sub = ok && c.err ? _t('nie da się odczytać') : !lib.cat && it.cat ? esc(it.cat) : ok && c.size ? c.size : '';
    const inDoc = !!libInDoc(it);
    return `<button class="blk${ok && c.err ? ' bad' : ''}" data-rel="${esc(it.rel)}" data-tip="${esc(it.name)}"><img ${ok && c.thumb ? `src="${c.thumb}"` : ''} alt=""><b translate="no">${esc(it.name)}</b><span>${sub || '&nbsp;'}</span>${inDoc ? `<i class="indoc" data-tip="${_t('Już jest w rysunku')}"></i>` : ''}</button>`; }).join('')
    || `<div class="none">${_t('Nic nie pasuje.')}</div>`;
  // miniatury po kolei, bez blokowania okna
  // jedna kolejka naraz: nowe rysowanie siatki (np. kolejna litera w szukaniu) kończy poprzednią
  const todo = items.filter(it => !libFresh(lib.cache.get(it.rel), it)), gen = ++lib.gen;
  (async () => {
    for (const it of todo) {
      if (gen !== lib.gen || pop.hidden || !grid.isConnected) return;
      const c = await libEntry(it), el = [...grid.querySelectorAll('[data-rel]')].find(x => x.dataset.rel === it.rel); if (!el) continue;
      if (c.thumb) el.querySelector('img').src = c.thumb;
      el.classList.toggle('bad', !!c.err);
      if (c.err) el.querySelector('span').textContent = _t('nie da się odczytać');
      else if (lib.cat && c.size) el.querySelector('span').textContent = c.size;
    }
  })();
}
async function onBlocksPopClick(e) {
  const pop = $('#blocksPop'), t = e.target;
  const tb = t.closest('[data-tab]'); if (tb) { pop._tab = lib.tab = tb.dataset.tab; renderBlocksPop(pop); libRefresh(pop); return; }
  const cb = t.closest('[data-cat]'); if (cb) { lib.cat = cb.dataset.cat; renderBlocksPop(pop); return; }
  const lb = t.closest('[data-lib]');
  if (lb) {
    const a = lb.dataset.lib;
    if (a === 'show') return api.libShow();
    if (a === 'seed') { await libSeed(); if (!pop.hidden) renderBlocksPop(pop); return; }
    if (a === 'choose') { if (await libChoose() && !pop.hidden) renderBlocksPop(pop); return; }
  }
  const x = t.closest('[data-id]'); if (x) { closePops(); pop._ctx.onPick(+x.dataset.id); return; }
  const r = t.closest('[data-rel]'); if (!r) return;
  const it = lib.list.find(i => i.rel === r.dataset.rel); if (!it) return;
  const ctx = pop._ctx, c = await libEntry(it);
  if (pop.hidden || pop._ctx !== ctx) return;   // w czasie czytania pliku okienko zamknięto
  if (c.err) { react(r, 'nie'); toast(_t`Nie da się odczytać „${esc(it.name)}”: ${esc(c.err)}`, 4000); return; }
  if (app.space) { toast(_t('Bloki wstawia się w modelu — przejdź do zakładki Model.')); return; }
  const had = libInDoc(it);
  const id = had ? had.id : app.edit(_t('Blok z biblioteki'), tx => importLib(tx, app.doc, c.pack));
  closePops(); ctx.onPick(id);
  if (!had && ctx.onPick === pickForInsert) toast(_t`„${esc(it.name)}” skopiowany z biblioteki do rysunku — kliknij miejsce na kartce.`, 3000);
}

/* zapis bloku do biblioteki: nazwa, kategoria (podfolder), punkt wstawienia */
let saveSt = null;
function openSavePop(anchor, st) {
  let pop = $('#libSavePop');
  if (!pop) {
    pop = document.createElement('section'); pop.id = 'libSavePop'; pop.className = 'pop'; pop.hidden = true; document.body.append(pop);
    pop.addEventListener('pointerdown', e => e.stopPropagation());
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') { closePops(); e.preventDefault(); } else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); saveToLib(); } e.stopPropagation(); });
    pop.addEventListener('input', e => { if (!saveSt) return; if (e.target.dataset.s === 'name') saveSt.name = e.target.value; if (e.target.dataset.s === 'newcat') saveSt.cat = e.target.value; saveSt.exists = false; renderSaveFoot(pop); });
    pop.addEventListener('click', onSavePopClick);
  }
  const was = !pop.hidden; closePops(); if (was) return;
  saveSt = st; pop._anchor = anchor;
  renderSavePop(pop);
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.right - pop.offsetWidth, innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = fitTop(pop, r.bottom + 6) + 'px';
  if (!lib.info) libLoad().then(() => { if (lib.info && !pop.hidden && saveSt === st) renderSavePop(pop); });
  pop.querySelector('[data-s=name]')?.select();
}
function renderSavePop(pop) {
  const st = saveSt;
  if (lib.info && !lib.info.ok) {
    pop.innerHTML = `<div class="row"><span class="ttl grow">${_t('Zapisz do biblioteki')}</span></div>
      <div class="libempty" style="width:280px"><span>${lib.info.dir ? _t`Folder biblioteki ${esc(lib.info.dir)} jest niedostępny.` : _t('Najpierw wskaż folder biblioteki — zwykły folder na dysku, najlepiej w OneDrive, Dropboxie albo iCloud.')}</span>
      <button class="tbs pri" data-s="choose">${_t('Wskaż folder…')}</button></div>`;
    return;
  }
  const cats = lib.list ? [...new Set(lib.list.map(it => it.cat).filter(Boolean))].sort((a, b) => a.localeCompare(b)) : [];
  // kategoria: ta, w której leży plik o tej nazwie (blok przyszedł z biblioteki), inaczej Meble albo pierwsza
  if (st.cat === null && lib.list) { const same = lib.list.find(it => it.name === fileSafe(st.name)); st.cat = same ? same.cat : cats.includes(_t('Meble')) ? _t('Meble') : (cats[0] || ''); }
  const custom = st.newCat;
  pop.innerHTML = `<div class="row"><span class="ttl grow">${_t('Zapisz do biblioteki')}</span></div>
    <label class="fld2"><em>${_t('Nazwa')}</em><input data-s="name" value="${esc(st.name)}" spellcheck="false"></label>
    <div class="lbl" style="padding:0 2px">${_t('Kategoria')}</div>
    <div class="cats">${cats.map(c => `<button data-scat="${esc(c)}" class="${!custom && c === st.cat ? 'on' : ''}">${esc(c)}</button>`).join('')}<button data-scat="" class="${!custom && !st.cat ? 'on' : ''}">${_t('Bez kategorii')}</button>${custom ? `<label class="fld2 newcat"><input data-s="newcat" value="${esc(st.cat)}" placeholder="${_t('Nowa kategoria')}" spellcheck="false"></label>` : `<button data-s="newcat">${_t('+ Nowa…')}</button>`}</div>
    <div class="row"><span class="lbl grow">${st.base ? _t('Punkt wstawienia: wskazany na rysunku') : _t('Punkt wstawienia: ten, który blok ma w rysunku (krzyżyk na miniaturze)')}</span><button class="tbs" data-s="point">${st.base ? _t('Wskaż jeszcze raz') : _t('Wskaż inny')}</button></div>
    <div data-foot></div>`;
  renderSaveFoot(pop);
  if (custom) pop.querySelector('[data-s=newcat]').focus();
}
const saveRel = st => ((st.cat || '').trim() ? fileSafe(st.cat) + '/' : '') + fileSafe(st.name || _t('Blok')) + '.dxf';
function renderSaveFoot(pop) {
  const st = saveSt, f = pop.querySelector('[data-foot]'); if (!f || !lib.info) return;
  f.innerHTML = `<div class="sub">${st.exists ? `<b>${_t('Taki plik już jest w bibliotece.')}</b> ${_t('Zastąpić go? Rysunki, do których blok już wstawiono, się nie zmienią.')}` : _t`Plik: ${esc(libShort(lib.info.dir) + ' › ' + saveRel(st).replace(/\//g, ' › '))} — otworzy go też AutoCAD.`}</div>
    <div class="row" style="justify-content:flex-end;margin-top:6px"><button class="tbs" data-s="cancel">${_t('Anuluj')}</button><button class="tbs pri" data-s="save">${st.exists ? _t('Zastąp') : _t('Zapisz')}</button></div>`;
}
async function onSavePopClick(e) {
  const pop = $('#libSavePop'), st = saveSt, t = e.target; if (!st) return;
  const c = t.closest('[data-scat]'); if (c) { st.cat = c.dataset.scat; st.newCat = false; st.exists = false; renderSavePop(pop); return; }
  const b = t.closest('[data-s]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'LABEL') return;
  const a = b.dataset.s;
  if (a === 'cancel') { closePops(); return; }
  if (a === 'choose') { if (await libChoose()) renderSavePop(pop); return; }
  if (a === 'newcat') { st.newCat = true; st.cat = ''; st.exists = false; renderSavePop(pop); return; }
  if (a === 'point') { closePops(); app.libPick = st; setTool('libpt'); return; }
  if (a === 'save') saveToLib();
}
async function saveToLib() {
  const pop = $('#libSavePop'), st = saveSt; if (!st || !lib.info?.ok) return;
  const ins = app.doc.ents.find(e => e.id === st.insId);
  const name = (st.name || '').trim();
  if (!ins || !name) { react(pop.querySelector('[data-s=save]'), 'nie'); return; }
  try {
    const text = libFile(app.doc, ins.b, name, st.base || [0, 0]);
    const r = await api.libWrite(saveRel({ ...st, name }), text, st.exists);
    if (r && r.exists) { st.exists = true; renderSaveFoot(pop); return; }
    closePops(); saveSt = null;
    lib.cache.delete(saveRel({ ...st, name })); await libLoad(true);
    react($('#blockBar [data-b=tolib]'), 'tak');
    toast(_t`Zapisano „${esc(name)}” w bibliotece` + ((st.cat || '').trim() ? ` (${esc(st.cat.trim())}).` : '.'), 2600);
  } catch (err) { toast(_t`Nie udało się zapisać w folderze biblioteki: ${esc(libErr(err))}`, 5000); }
}
// punkt wskazany narzędziem „libpt” → w układzie bloku (odwrotność wstawienia: przesunięcie, obrót, skala, odbicie)
app.libPointPicked = p => {
  const st = app.libPick; if (!st) return; app.libPick = null;
  const ins = app.doc.ents.find(e => e.id === st.insId);
  if (p && ins) {
    const d = V.sub(p, ins.p), c = Math.cos(ins.rot || 0), s = Math.sin(ins.rot || 0), k = ins.s || 1, m = ins.mx ? -1 : 1;
    st.base = [(d[0] * c + d[1] * s) / (k * m), (-d[0] * s + d[1] * c) / k];
  }
  setTimeout(() => {
    if (tool.id === 'libpt') setTool('select');
    if (tool.id !== 'select' || !ins || !app.doc.ents.some(e => e.id === ins.id)) return;
    app.sel = new Set([ins.id]); app.selectionChanged();
    setTimeout(() => { const a = $('#blockBar [data-b=tolib]'); if (a) openSavePop(a, st); }, 0);
  }, 0);
};
// edycja w miejscu: pracujemy w układzie bloku, reszta rysunku jest przygaszonym tłem (przeniesionym odwrotnie)
function startBlockEdit(ins) {
  if (app.space) { toast(_t('Bloki edytuje się w modelu.')); return; }
  if (app.blockEdit) { toast(_t('Najpierw zakończ edycję tego bloku (Gotowe), potem edytuj blok w nim.')); return; }
  for (let i = 0; i < 3 && tool.cancel(); i++);
  // w czasie edycji historia nie gubi najstarszych wpisów — „Anuluj” musi cofnąć dokładnie to, co zrobiono w bloku
  app.blockEdit = { id: ins.b, insId: ins.id, ins: JSON.parse(JSON.stringify(ins)), undoLen: app.hist.undoStack.length, limit: app.hist.limit, view: { cx: app.view.cx, cy: app.view.cy, ppm: app.view.ppm } };
  app.hist.limit = Infinity;
  app.sel.clear(); syncSpace(); setTool('select');
  // ten sam fragment rysunku co przed wejściem: środek i powiększenie przeliczone do układu bloku
  const X = insXf(ins), c = X.inv([app.view.cx, app.view.cy]);
  app.view.cx = c[0]; app.view.cy = c[1]; app.view.ppm = app.view.ppm * X.k; app.view.needs = true;
  refreshUi(); redraw();
}
function endBlockEdit(cancel) {
  const be = app.blockEdit; if (!be) return;
  for (let i = 0; i < 3 && tool.cancel(); i++);
  if (cancel) while (app.hist.undoStack.length > be.undoLen && app.blockEdit) app.hist.undo();
  app.blockEdit = null; app.sel.clear(); syncSpace(); app.hist.limit = be.limit;
  Object.assign(app.view, be.view); app.view.needs = true;
  if (app.doc.ents.some(e => e.id === be.insId)) app.sel.add(be.insId);
  if (!blockEnts(be.id).length && app.doc.blocks.some(b => b.id === be.id)) toast(_t('Blok jest pusty — jego wstawień nie widać.'), 3000);
  setTool('select'); refreshUi(); redraw();
}
function blockGhost() {
  const be = app.blockEdit; if (!be) return null;
  const ins = app.doc.ents.find(e => e.id === be.insId) || be.ins, X = insXf(ins);
  // tylko to, co widać: prostokąt widoku przeniesiony do układu modelu
  const v = app.view.rect, cs = [[v[0], v[1]], [v[2], v[1]], [v[2], v[3]], [v[0], v[3]]].map(X.f);
  const wr = [Math.min(...cs.map(q => q[0])), Math.min(...cs.map(q => q[1])), Math.max(...cs.map(q => q[0])), Math.max(...cs.map(q => q[1]))];
  return { ents: app.doc.ents.filter(e => !spaceOf(e) && e.id !== be.insId && isShown(app.doc, e) && boxHit(bbox(e), wr)), map: X.inv, k: 1 / X.k, tr: { ang: a => X.flip ? X.rot + Math.PI - a : a - X.rot, flip: X.flip } };
}

/* ---------- pasek stanu: jednostka i skala ---------- */
function showMenu(anchor, items, { up = false, right = false } = {}) {
  const m = $('#menu'); m.innerHTML = '';
  for (const it of items) {
    if (it === 'sep') { m.insertAdjacentHTML('beforeend', '<div class="msep"></div>'); continue; }
    if (it.lbl) { m.insertAdjacentHTML('beforeend', `<div class="mlbl">${it.lbl}</div>`); continue; }
    if (it.ver) { m.insertAdjacentHTML('beforeend', `<div class="mver">${esc(it.ver)}</div>`); continue; }
    if (it.html) { const d = document.createElement('div'); d.className = 'mrow'; d.innerHTML = it.html; m.append(d); it.bind?.(d); continue; }
    const b = document.createElement('button'); b.className = (it.on ? 'on' : '') + (it.hot ? ' hot' : ''); b.disabled = !!it.disabled;
    b.innerHTML = `<span>${it.label}</span>` + (it.kbd ? `<kbd>${prettyCombo(it.kbd, isMac)}</kbd>` : '');
    b.addEventListener('click', () => { closePops(); it.act(); });
    m.append(b);
  }
  m.hidden = false;
  const r = anchor.getBoundingClientRect();
  if (fromTop(anchor)) right = r.left + r.width / 2 > innerWidth / 2;   // menu z górnego paska jak okienka (§2); Plik po lewej — od lewej krawędzi przycisku
  m.style.left = Math.max(8, Math.min(right ? r.right - m.offsetWidth : r.left, innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.transformOrigin = (up ? 'bottom ' : 'top ') + (right ? 'right' : 'left');
  m.style.top = (up ? r.top - m.offsetHeight - 6 : belowBar(anchor, r)) + 'px';
  anchor.classList.add('open');
}
$('#unitBtn').addEventListener('click', e => { e.stopPropagation(); if (!$('#menu').hidden) return closePops(); showMenu($('#unitBtn'), [{ lbl: _t('Jednostka wymiarów') }, ...['m', 'cm', 'mm'].map(u => ({ label: { m: _t('metry'), cm: _t('centymetry'), mm: _t('milimetry') }[u], on: app.doc.units === u, act: () => app.edit(_t('Jednostka'), tx => tx.setDoc({ units: u })) }))], { up: true }); });
$('#scaleBtn').addEventListener('click', e => {
  e.stopPropagation(); if (!$('#menu').hidden) return closePops();
  showMenu($('#scaleBtn'), [{ lbl: _t('Skala rysunku') }, ...SCALES.map(s => ({ label: '1:' + s, on: app.doc.scale === s, act: () => setScale(s) })),
    'sep', { html: `<input class="fld grow" id="scaleOwn" placeholder="${_t('własna, np. 1:25')}" spellcheck="false">`, bind: d => { const i = d.querySelector('input'); i.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') { const m = /^\s*(?:1\s*:\s*)?(\d+(?:[.,]\d+)?)\s*$/.exec(i.value); if (m && +m[1].replace(',', '.') > 0) { closePops(); setScale(+m[1].replace(',', '.')); } else toast(_t('Wpisz skalę jak 1:25.')); } if (ev.key === 'Escape') closePops(); }); } }], { up: true });
  setTimeout(() => $('#scaleOwn')?.focus(), 0);
});
function setScale(s) { app.edit(_t('Skala'), tx => tx.setDoc({ scale: s })); }

/* ---------- plik ---------- */
const autoKey = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
let autoDirty = false;
function markDirty(v) {
  app.file.dirty = v; if (v) autoDirty = true;
  $('#saved').textContent = v ? _t('niezapisane zmiany') : '';
  api.setDirty(v);
}
function setFile(path, name) { app.file.path = path; app.file.name = name || _t('Bez nazwy'); $('#fileName').textContent = app.file.name; document.title = app.file.name + ' — Rysio'; }
function loadDoc(doc, { path = null, name = null, dirty = false } = {}) {
  app.doc = doc; app.hist.reset(doc); app.sel.clear(); app.blockEdit = null; app.rev++; setBlocks(doc);
  app.space = 0; app.vpEdit = null; for (const k of Object.keys(viewMemo)) delete viewMemo[k]; syncSpace(); renderTabs();
  setFile(path, name); markDirty(dirty);
  setTool('select'); fitSpace(); refreshUi(); redraw();
}
function confirmDiscard() { return !app.file.dirty || confirm(_t('Rysunek ma niezapisane zmiany. Porzucić je?')); }
function fileNew() { if (!confirmDiscard()) return; loadDoc(newDoc()); api.autosaveClear(autoKey); }
async function fileOpen(p) {
  if (!confirmDiscard()) return;
  try {
    const r = await api.openFile(p); if (!r) return;
    if (r.cad) return await openCad(r);
    loadDoc(fixDoc(JSON.parse(r.text)), { path: r.path, name: r.name });
  } catch (err) { toast(_t`Nie udało się otworzyć pliku: ${esc(err.message)}`, 5000); }
}
// DXF i DWG otwierają się jako nowy, niezapisany rysunek (Zapisz zapisze go jako .rysio)
async function openCad(r) {
  toast(r.cad === 'dwg' ? _t('Czytam DWG…') : _t('Czytam DXF…'), 60000);
  await new Promise(res => setTimeout(res, 30));
  const { parseDxf } = await import('./dxf.js');
  const parse = t => parseDxf(t, { scale: app.doc.scale });
  const res = r.cad === 'dwg' ? await (await import('./dwg.js')).readDwg(r.data, parse) : parse(r.data);
  loadDoc(res.doc, { path: null, name: r.name, dirty: true });
  const sk = Object.entries(res.info.skipped);
  const unitsTxt = { m: _t('metry'), cm: _t('centymetry'), mm: _t('milimetry'), dm: _t('decymetry'), in: _t('cale'), ft: _t('stopy') }[res.info.units] || res.info.units;
  toast(_t`Wczytano ${res.info.count} elementów.` + ' ' + (res.info.guessed ? _t`Plik nie podaje jednostek — przyjąłem ${unitsTxt}.` : _t`Jednostki pliku: ${unitsTxt}.`) + (sk.length ? ' ' + _t`Pominięte: ${esc(sk.map(([t, n]) => `${t} ×${n}`).join(', '))}.` : '') + (res.info.truncated ? ' ' + _t('Plik był bardzo duży — wczytano tylko część.') : '') + (res.info.noText ? ' ' + _t('Tekstów z tego pliku DWG nie udało się odczytać — wczytano sam rysunek.') : ''), 7000);
}
async function exportDxf() {
  try {
    const { writeDxf } = await import('./dxf.js');
    const { text, count, units } = writeDxf(app.doc);
    const ok = await api.saveBinary(new TextEncoder().encode(text), app.file.name || _t('Rysunek'), 'dxf');
    if (ok) toast(_t`Zapisano DXF: ${count} elementów modelu i ${app.doc.sheets.length} arkuszy, jednostki: ${units}.`, 4500);
  } catch (err) { toast(_t`Nie udało się zapisać DXF: ${esc(err.message)}`, 5000); }
}
async function fileSave(as) {
  try {
    const r = await api.saveFile(as ? null : app.file.path, serialize(app.doc), app.file.name);
    if (!r) return false;
    setFile(r.path, r.name); markDirty(false); autoDirty = false; api.autosaveClear(autoKey);
    toast(_t('Zapisano'), 1000); return true;
  } catch (err) { toast(_t`Nie udało się zapisać: ${esc(err.message)}`, 5000); return false; }
}
if (api.web) window.addEventListener('beforeunload', e => { if (app.file.dirty) { e.preventDefault(); e.returnValue = ''; } });
api.onSaveThenClose(async () => { if (await fileSave(false)) api.closeNow(); });
$('#fileBtn').addEventListener('click', async e => {
  e.stopPropagation(); if (!$('#menu').hidden) return closePops();
  const recent = await api.recentList();
  showMenu($('#fileBtn'), [
    { label: _t('Nowy rysunek'), kbd: keysFor('new', app.keys.over)[0], act: fileNew },
    { label: _t('Otwórz…'), kbd: keysFor('open', app.keys.over)[0], act: () => fileOpen() },
    { label: _t('Zapisz'), kbd: keysFor('save', app.keys.over)[0], act: () => fileSave(false) },
    { label: _t('Zapisz jako…'), kbd: keysFor('saveAs', app.keys.over)[0], act: () => fileSave(true) },
    { label: _t('Eksport DXF…'), act: exportDxf },
    ...(recent.length ? ['sep', { lbl: _t('Ostatnie') }, ...recent.slice(0, 8).map(r => ({ label: esc(r.name) + ` <span class="lbl">${esc(r.dir)}</span>`, act: () => fileOpen(r.path) }))] : []),
    'sep', { label: _t('Nowe okno'), act: () => api.newWindow() }
  ]);
});
// autozapis co 30 s, gdy są zmiany (po awarii program zaproponuje przywrócenie)
setInterval(() => { if (!autoDirty || !app.file.dirty) return; autoDirty = false; api.autosave(autoKey, { name: app.file.name, path: app.file.path, time: Date.now(), text: serialize(app.doc) }); }, 30000);
(async () => {
  const list = await api.autosaveList(autoKey);
  if (!list || !list.length) return;
  const r = list[0];
  toast(_t`Rysunek „${esc(r.name)}” nie został zapisany przed zamknięciem programu.`, 15000, [_t('Przywróć'), async () => {
    const rec = await api.autosaveRead(r.key); if (!rec) return;
    try { loadDoc(fixDoc(JSON.parse(rec.text)), { path: rec.path, name: rec.name, dirty: true }); api.autosaveClear(r.key); } catch (err) { toast(esc(err.message)); }
  }]);
})();

/* ---------- ustawienia: wygląd, język, skróty, aktualizacje ---------- */
let themePref = (() => { try { return localStorage.getItem('rysio.theme') || 'auto'; } catch (e) { return 'auto'; } })();
const mq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const dark = themePref === 'dark' || (themePref === 'auto' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  app.view.theme = { bg: v('--paper'), desk: v('--soft'), ink: v('--ink'), sel: v('--sel'), snap: v('--snap'), muted: v('--muted2') };
  api.setTheme(dark); redraw();
}
function setTheme(p) { themePref = p; try { localStorage.setItem('rysio.theme', p); } catch (e) {} applyTheme(); }
mq.addEventListener('change', applyTheme);
applyTheme();
// Ustawienia jak w całej rodzinie programów (wytyczne interakcji §8): motyw, skróty, opcje Rysia (język), na dole wersja i aktualizacje
$('#setBtn').addEventListener('click', e => {
  e.stopPropagation(); if (!$('#menu').hidden) return closePops();
  const u = updState, busy = u && (u.state === 'downloading' || u.state === 'ready');
  const updItem = api.web ? [] : [
    ...(u?.current ? [{ ver: 'Rysio ' + u.current }] : []),
    u?.state === 'available' ? { label: _t`Zainstaluj wersję ${esc(u.version)}`, hot: true, act: () => api.updateInstall() }
    : busy && !(isMac && u.state === 'ready') ? { label: u.state === 'ready' ? _t('Instalowanie…') : _t`Pobieranie ${Math.round(100 * u.got / (u.size || 1))}%`, disabled: true, act: () => {} }
    : { label: _t('Sprawdź aktualizacje'), act: async () => { const s = await api.updateCheck(); showUpdate(s); if (s.state === 'none') toast(_t`Masz najnowszą wersję (${s.current}).`); else if (s.state === 'error') toast(_t`Nie udało się sprawdzić: ${esc(s.error)}`); } }
  ];
  showMenu($('#setBtn'), [
    ...[['light', _t('Jasny motyw')], ['dark', _t('Ciemny motyw')], ['auto', _t('Motyw jak w systemie')]].map(([k, n]) => ({ label: n, on: themePref === k, act: () => setTheme(k) })),
    'sep', { label: _t('Skróty klawiszowe'), kbd: 'Shift+Slash', act: openKeys },
    'sep', { lbl: _t('Język') }, ...LANGS.map(([k, n]) => ({ label: n, on: lang === k, act: () => { if (k === lang || !confirmDiscard()) return; setLang(k); api.setLang(k); location.reload(); } })),
    ...(updItem.length ? ['sep', ...updItem] : [])
  ], { right: true });
});
$('#thinBtn').addEventListener('click', () => runAction('thin'));
$('#undoBtn').addEventListener('click', () => runAction('undo'));
$('#redoBtn').addEventListener('click', () => runAction('redo'));
$('#snapChip').addEventListener('click', () => runAction('snapToggle'));
$('#orthoChip').addEventListener('click', () => runAction('ortho'));
$('#gridChip').addEventListener('click', () => runAction('grid'));
// stan aktualizacji: pozycja w menu ustawień; o nowej wersji mówi raz krótki komunikat, postęp pobierania i jego wynik — komunikaty na dole
let updState = null, updTold = null;
function showUpdate(s) {
  if (!s) return;
  const was = updState?.state; updState = s;
  const v = esc(s.version || '');
  if (s.state === 'available' && was === 'downloading') toast(_t`Nie udało się pobrać wersji ${v}: ${esc(s.error || '')}`, 6000, [_t('Spróbuj jeszcze raz'), () => api.updateInstall()]);
  else if (s.state === 'available' && updTold !== s.version) { updTold = s.version; toast(_t`Jest nowa wersja ${v}.`, 6000, [_t('Zainstaluj'), () => api.updateInstall()]); }
  else if (s.state === 'downloading') toast(_t`Pobieranie ${Math.round(100 * s.got / (s.size || 1))}%`, 3000);
  else if (s.state === 'ready' && was !== 'ready') toast(isMac ? _t('Pobrano — otworzyłem instalator nowej wersji.') : _t('Instalowanie…'), 6000);
}
api.onUpdate(showUpdate);
api.updateGet().then(showUpdate);

/* ---------- okno skrótów (jak w Modo) ---------- */
function openKeys() { $('#keysModal').hidden = false; renderKeys(); $('#keysQ').focus(); }
function closeKeys() { $('#keysModal').hidden = true; capture = null; }
$('#keysClose').addEventListener('click', closeKeys);
$('#keysModal .scrim').addEventListener('click', closeKeys);
$('#keysQ').addEventListener('input', renderKeys);
$('#keysQ').addEventListener('keydown', e => { if (e.key === 'Escape') closeKeys(); });
$('#keysReset').addEventListener('click', () => { app.keys.over = {}; saveKeyOverride({}); app.keys = loadKeys(); renderKeys(); });
function renderKeys() {
  const q = $('#keysQ').value.trim().toLowerCase();
  const box = $('#keysList'); box.innerHTML = '';
  for (const g of [...new Set(ACTIONS.map(a => a.group))]) {
    const items = ACTIONS.filter(a => a.group === g && (!q || a.name.toLowerCase().includes(q) || keysFor(a.id, app.keys.over).some(k => prettyCombo(k, isMac).toLowerCase().includes(q))));
    if (!items.length) continue;
    const col = document.createElement('section'); col.className = 'grp'; col.innerHTML = `<div class="gh">${g}</div>`;
    for (const a of items) {
      const row = document.createElement('div'); row.className = 'k' + (a.later ? ' later' : '');
      row.innerHTML = `<span>${a.name}</span>` + (a.later ? `<span class="lbl" style="flex:none">${_t('później')}</span>` : '');
      const b = document.createElement('button'); b.setAttribute('aria-label', _t('Zmień skrót: ') + a.name);
      b.innerHTML = keysFor(a.id, app.keys.over).map(k => `<kbd>${prettyCombo(k, isMac)}</kbd>`).join(' ') || '<kbd>—</kbd>';
      b.addEventListener('click', () => {
        b.classList.add('wait'); b.innerHTML = `<kbd>${_t('naciśnij…')}</kbd>`;
        capture = e => {
          e.preventDefault(); e.stopPropagation();
          if (e.key === 'Escape') { capture = null; renderKeys(); return; }
          if (e.key === 'Backspace' && !e.shiftKey && !e.metaKey && !e.ctrlKey) { app.keys.over[a.id] = []; }
          else {
            const c = comboOf(e, isMac); if (!c) return;
            // ten sam skrót nie może należeć do dwóch poleceń
            for (const o of ACTIONS) if (o.id !== a.id) { const ks = keysFor(o.id, app.keys.over); if (ks.includes(c)) app.keys.over[o.id] = ks.filter(k => k !== c); }
            app.keys.over[a.id] = [c];
          }
          capture = null; saveKeyOverride(app.keys.over); app.keys = loadKeys(); renderKeys();
        };
      });
      row.append(b); col.append(row);
    }
    box.append(col);
  }
}

/* ---------- podpowiedzi z opisem skrótu (⌘/⌥ na Macu, Ctrl/Alt w Windows) ----------
   Wytyczne interakcji §6: pojawia się po 1,5 s bez ruchu, na sąsiednim przycisku (do 0,4 s po zniknięciu poprzedniej) od razu;
   znika przy zjechaniu, kliknięciu i kółku. Przy pionowym pasku narzędzi stoi z boku, w pasku dolnym nad przyciskiem. */
let tipEl = null, tipFor = null, tipT = 0, tipLast = 0;
function tipShow(b) {
  tipEl?.remove(); tipEl = document.createElement('div'); tipEl.className = 'tip';
  const k = b.dataset.act ? keysFor(b.dataset.act, app.keys.over)[0] : null;
  tipEl.innerHTML = `<span>${esc(_t(b.dataset.tip))}</span>` + (k ? `<kbd>${prettyCombo(k, isMac)}</kbd>` : '');
  document.body.append(tipEl);
  const r = b.getBoundingClientRect(), side = !!b.closest('#tools'), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  tipEl.classList.toggle('side', side);
  if (side) { tipEl.style.left = (r.right + 8) + 'px'; tipEl.style.top = (r.top + r.height / 2 - h / 2) + 'px'; }
  else {
    const below = !b.closest('#status') && r.bottom + 8 + h < innerHeight;
    tipEl.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + 'px';
    tipEl.style.top = (below ? r.bottom + 6 : r.top - h - 6) + 'px';
  }
  void tipEl.offsetWidth; tipEl.classList.add('on');
}
// „od razu” na sąsiednim tylko po podpowiedzi, która naprawdę była widoczna (przejechanie przez pasek nie zapala ich)
function tipHide() { clearTimeout(tipT); if (tipEl) tipLast = Date.now(); tipFor = null; tipEl?.remove(); tipEl = null; }
// jedna obsługa dla całego okna — działa też w okienkach i paskach tworzonych później (zamiast systemowego title)
document.addEventListener('mouseover', e => {
  const b = e.target.closest && e.target.closest('[data-tip]'); if (!b || tipFor === b || !b.dataset.tip) return;
  tipHide(); tipFor = b;
  tipT = setTimeout(() => { if (tipFor === b && b.isConnected) tipShow(b); }, Date.now() - tipLast < 400 ? 0 : 1500);
});
document.addEventListener('mouseout', e => {
  const b = e.target.closest && e.target.closest('[data-tip]'); if (!b || tipFor !== b || (e.relatedTarget && b.contains(e.relatedTarget))) return;
  tipHide();
});
addEventListener('pointerdown', tipHide, true);
addEventListener('wheel', tipHide, { passive: true, capture: true });
addEventListener('keydown', tipHide, true);

/* ---------- arkusze: zakładki, przełączanie przestrzeni ---------- */
const viewMemo = {};   // zapamiętany widok każdej przestrzeni
function fitSpace() {
  const sh = app.sheet();
  if (sh) { const [W, H] = sheetSize(sh); app.view.fit([0, 0, W, H], 24); }
  else app.view.fitDoc(app.doc, app.ents());
}
function setSpace(id, force = false) {
  if (app.blockEdit && (id !== app.space || force)) endBlockEdit(false);
  if (id === app.space && !force) return;
  viewMemo[app.space] = { cx: app.view.cx, cy: app.view.cy, ppm: app.view.ppm };
  if (tool.cancel) for (let i = 0; i < 3 && tool.cancel(); i++);
  app.space = id; app.sel.clear(); app.vpEdit = null; app.snapper.clearRefs();
  syncSpace();
  const m = viewMemo[id]; if (m) Object.assign(app.view, m); else fitSpace();
  app.view.needs = true;
  if (tool.id === 'viewport' && !id) setTool('select');
  renderTabs(); refreshUi(); redraw();
}
app.setSpace = setSpace;
function renderTabs() {
  const box = $('#tabs');
  morph(box, `<button data-sp="0" class="${app.space ? '' : 'on'}">${_t('Model')}</button>` +
    app.doc.sheets.map(sh => `<button data-sp="${sh.id}" class="${app.space === sh.id ? 'on' : ''}" translate="no">${esc(sh.name)}</button>`).join('') +
    `<button class="add" id="tabAdd" data-tip="${_t('Nowy arkusz')}">+</button>`);
  toolsEl.querySelector('[data-tool=viewport]')?.toggleAttribute('hidden', !app.space);
}
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'tabAdd') return addSheet();
  setSpace(+b.dataset.sp);
});
$('#tabs').addEventListener('dblclick', e => { const b = e.target.closest('[data-sp]'); if (b && +b.dataset.sp) openSheetPop(); });
function addSheet() {
  const id = app.doc.next, n = app.doc.sheets.length + 1;
  app.edit(_t('Nowy arkusz'), tx => { tx.setDoc({ sheets: [...app.doc.sheets, newSheet(id, n)], next: id + 1 }); });
  setSpace(id);
  toast(_t('Nowy arkusz. Narysuj na nim okno (O), żeby pokazać fragment modelu w skali.'), 4000);
}
function patchSheet(patch, label = _t('Arkusz')) {
  const sh = app.sheet(); if (!sh) return;
  app.edit(label, tx => tx.setDoc({ sheets: app.doc.sheets.map(x => x.id === sh.id ? { ...x, ...patch, title: { ...x.title, ...(patch.title || {}) } } : x) }));
}

/* ---------- okienka arkusza: format i tabelka ---------- */
const fld = (id, v, ph = '') => `<input class="fld grow" data-f="${id}" value="${esc(v || '')}" placeholder="${esc(ph)}" spellcheck="false">`;
function openSheetPop() {
  const sh = app.sheet(); if (!sh) return;
  closePops();
  const pop = $('#sheetPop');
  morph(pop, `<div class="row"><span class="ttl grow">${_t('Arkusz')}</span></div>
    <div class="row"><span class="lbl w72">${_t('Format')}</span><div class="seg stretch grow">${Object.keys(PAPER).reverse().map(k => `<button data-size="${k}" class="${sh.size === k ? 'on' : ''}">${k}</button>`).join('')}</div></div>
    <div class="row"><span class="lbl w72">${_t('Układ')}</span><div class="seg stretch grow"><button data-land="1" class="${sh.land ? 'on' : ''}">${_t('Poziomo')}</button><button data-land="0" class="${sh.land ? '' : 'on'}">${_t('Pionowo')}</button></div></div>
    <div class="row"><span class="lbl w72">${_t('Ramka')}</span><span class="grow">${_t('z tabelką rysunkową')}</span><button class="tgl${sh.frame ? ' on' : ''}" data-frame role="switch" aria-checked="${sh.frame}" aria-label="${_t('Ramka z tabelką')}"></button></div>
    <div class="row"><span class="lbl w72">${_t('Nazwa')}</span>${fld('name', sh.name)}</div>
    <div class="hr"></div>
    <div class="row"><p class="note grow">${_t('Ramka ma margines 20 mm z lewej do wpięcia i 10 mm z pozostałych stron.')}</p></div>
    <div class="row"><span class="grow"></span><button class="tbs" data-delsheet>${_t('Usuń arkusz')}</button></div>`);
  placePopUp(pop, $('#fmtChip'));
}
$('#sheetPop').addEventListener('click', e => {
  e.stopPropagation();
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.size) patchSheet({ size: b.dataset.size }, _t('Format arkusza'));
  else if (b.dataset.land) patchSheet({ land: b.dataset.land === '1' }, _t('Układ arkusza'));
  else if (b.hasAttribute('data-frame')) patchSheet({ frame: !app.sheet().frame }, _t('Ramka'));
  else if (b.hasAttribute('data-delsheet')) {
    const sh = app.sheet();
    if (!confirm(_t`Usunąć arkusz „${sh.name}” razem z jego oknami i opisami? Można to cofnąć.`)) return;
    const ids = app.doc.ents.filter(x => x.sp === sh.id).map(x => x.id);
    app.edit(_t('Usuń arkusz'), tx => { ids.forEach(i => tx.del(i)); tx.setDoc({ sheets: app.doc.sheets.filter(x => x.id !== sh.id) }); });
    closePops(); setSpace(0); return;
  }
  openSheetPop();
});
function openTitlePop() {
  const sh = app.sheet(); if (!sh) return;
  closePops();
  const p = app.doc.project, t = sh.title;
  $('#titlePop').innerHTML = `<div class="row"><span class="ttl grow">${_t('Tabelka rysunkowa')}</span></div>
    <div class="lbl" style="padding:2px 4px 0">${_t('Wspólne dla wszystkich arkuszy')}</div>
    <div class="row"><span class="lbl w72">${_t('Projekt')}</span>${fld('p.projekt', p.projekt)}</div>
    <div class="row"><span class="lbl w72">${_t('Projektant')}</span>${fld('p.projektant', p.projektant, _t('imię i nazwisko'))}</div>
    <div class="row"><span class="lbl w72">${_t('Data')}</span>${fld('p.data', p.data, new Date().toLocaleDateString('pl-PL'))}</div>
    <div class="hr"></div>
    <div class="lbl" style="padding:0 4px">${_t('Tylko ten arkusz')}</div>
    <div class="row"><span class="lbl w72">${_t('Rysunek')}</span>${fld('t.rysunek', t.rysunek, sh.name)}</div>
    <div class="row"><span class="lbl w72">${_t('Nr')}</span>${fld('t.nr', t.nr, 'A-01')}</div>
    <div class="row"><span class="lbl w72">${_t('Skala')}</span><span class="grow">${titleScales(app.doc, sh) || '—'}</span><span class="lbl">${_t('z okien')}</span></div>`;
  placePopUp($('#titlePop'), $('#titleChip'));
}
// pola okienek zapisują się po zatwierdzeniu (Enter albo wyjście z pola)
for (const id of ['#sheetPop', '#titlePop']) {
  $(id).addEventListener('keydown', e => { if (e.target.dataset.f) { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') closePops(); } });
  $(id).addEventListener('change', e => {
    const f = e.target.dataset.f; if (!f) return;
    const v = e.target.value.trim();
    if (f === 'name') { if (v) patchSheet({ name: v }, _t('Nazwa arkusza')); }
    else if (f.startsWith('p.')) app.edit(_t('Tabelka'), tx => tx.setDoc({ project: { ...app.doc.project, [f.slice(2)]: v } }));
    else if (f.startsWith('t.')) patchSheet({ title: { [f.slice(2)]: v } }, _t('Tabelka'));
  });
}
$('#fmtChip').addEventListener('click', e => { e.stopPropagation(); if (!$('#sheetPop').hidden) return closePops(); openSheetPop(); });
$('#titleChip').addEventListener('click', e => { e.stopPropagation(); if (!$('#titlePop').hidden) return closePops(); openTitlePop(); });
function placePopUp(pop, anchor) {
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = Math.max(8, r.top - pop.offsetHeight - 8) + 'px';
  anchor.classList.add('open');
}

/* ---------- pasek okna na arkuszu: skala, warstwy, blokada ---------- */
function selectedVp() {
  if (!app.space || app.sel.size !== 1) return null;
  const e = app.doc.ents.find(x => app.sel.has(x.id)); return e && e.t === 'vp' ? e : null;
}
function showVpBar() {
  let el = $('#vpBar');
  const vp = app.vpEdit ? app.doc.ents.find(x => x.id === app.vpEdit) : selectedVp();
  if (!vp) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'vpBar'; el.className = 'toolbar'; view.append(el);
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', onVpBar);
  }
  const shown = app.doc.layers.filter(L => !vp.hidden.includes(L.id)).length;
  const html = app.vpEdit
    ? `<span class="t">${_t('Widok w oknie')}</span><span class="lbl">${_t('przeciągnij, żeby przesunąć model; Esc kończy')}</span><button class="tbs" data-vp="done">${_t('Gotowe')}</button>`
    : `<span class="t">${_t('Okno')}</span>
      <button class="tbs" data-vp="scale">${_t('Skala')} 1:${String(+vp.scale.toFixed(3)).replace('.', DEC)} ${chev}</button>
      <button class="tbs" data-vp="layers">${_t`Warstwy ${shown} z ${app.doc.layers.length}`} ${chev}</button>
      <button class="tbs" data-vp="lock">${ic(vp.locked ? 'lock' : 'unlock', 14)} ${vp.locked ? _t('Widok zablokowany') : _t('Zablokuj widok')}</button>
      <button class="tbs" data-vp="edit">${_t('Przesuń widok')}</button>`;
  if (el._html !== html) { morph(el, html); el._html = html; }
  const b = vpBox(vp), a = app.view.toScreen([b[0], b[3]]);
  el.style.left = Math.max(8, Math.min(a[0], view.clientWidth - el.offsetWidth - 8)) + 'px';
  el.style.top = Math.max(app.mini ? 52 : 8, a[1] - 48) + 'px';
}
function onVpBar(e) {
  e.stopPropagation();
  const b = e.target.closest('[data-vp]'); if (!b) return;
  const vp = app.vpEdit ? app.doc.ents.find(x => x.id === app.vpEdit) : selectedVp(); if (!vp) return;
  const act = b.dataset.vp;
  if (act === 'done') { app.vpEdit = null; refreshUi(); redraw(); return; }
  if (act === 'edit') { if (vp.locked) return toast(_t('Widok w tym oknie jest zablokowany.')); app.vpEdit = vp.id; app.sel.clear(); refreshUi(); redraw(); return; }
  if (act === 'lock') { app.edit(vp.locked ? _t('Odblokuj widok') : _t('Zablokuj widok'), tx => tx.set(vp.id, { locked: !vp.locked })); return; }
  if (act === 'scale') {
    showMenu(b, [{ lbl: _t('Skala okna') }, ...SCALES.map(k => ({ label: '1:' + k, on: vp.scale === k, act: () => setVpScale(vp, k) })),
      'sep', { html: `<input class="fld grow" id="vpScaleOwn" placeholder="${_t('własna, np. 1:25')}" spellcheck="false">`, bind: d => { const i = d.querySelector('input'); i.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') { const m = /^\s*(?:1\s*:\s*)?(\d+(?:[.,]\d+)?)\s*$/.exec(i.value); if (m && +m[1].replace(',', '.') > 0) { closePops(); setVpScale(vp, +m[1].replace(',', '.')); } else toast(_t('Wpisz skalę jak 1:25.')); } if (ev.key === 'Escape') closePops(); }); } }]);
    return;
  }
  if (act === 'layers') {
    showMenu(b, [{ lbl: _t('Warstwy w tym oknie') }, ...app.doc.layers.map(L => ({
      label: `<i class="sw" style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:8px;background:${L.color === '#1a1a19' ? 'var(--ink)' : L.color}"></i>${esc(L.name)}${L.visible ? '' : ` <span class="lbl">(${_t('ukryta w rysunku')})</span>`}`,
      on: !vp.hidden.includes(L.id), act: () => app.edit(_t('Warstwy okna'), tx => tx.set(vp.id, { hidden: vp.hidden.includes(L.id) ? vp.hidden.filter(i => i !== L.id) : [...vp.hidden, L.id] }))
    }))]);
  }
}
function setVpScale(vp, k) { app.lastVpScale = k; app.edit(_t('Skala okna'), tx => tx.set(vp.id, { scale: k })); }

/* ---------- tekst: pisanie wprost na rysunku ---------- */
let textEd = null;   // { el, ent (poprawiany) albo null, p }
app.editText = (ent, p) => {
  if (app.tools.select.grip) app.tools.select.cancel();
  finishText();
  const h = ent ? ent.h : app.textH, align = ent ? ent.align || 'l' : app.textAlign, at = ent ? ent.p : p;
  if (ent) { app.textH = ent.h; app.textAlign = align; }
  const el = document.createElement('textarea'); el.className = 'textEd' + (app.space ? ' onPaper' : ''); el.spellcheck = false; el.value = ent ? ent.s : '';
  view.append(el);
  textEd = { el, ent, p: [...at] };
  placeTextEd();
  el.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishText(); }
    if (e.key === 'Escape') { e.preventDefault(); finishText(true); }
  });
  el.addEventListener('input', placeTextEd);
  el.addEventListener('blur', () => setTimeout(() => { if (textEd && textEd.el === el && document.activeElement !== el && !document.activeElement?.closest('#textBar')) finishText(); }, 0));
  setTimeout(() => { el.focus(); el.select(); }, 0);
  if (ent) app.hideEnt = ent.id;
  showTextBar(); redraw();
};
function placeTextEd() {
  if (!textEd) return;
  const k = app.spaceScale() / 1000, px = app.textH * k * app.view.ppm / 0.72, s = app.view.toScreen(textEd.p), el = textEd.el;
  el.style.fontSize = Math.max(9, px) + 'px'; el.style.lineHeight = (1.4 * 0.72) + '';
  el.style.textAlign = { l: 'left', c: 'center', r: 'right' }[app.textAlign];
  el.style.height = 'auto'; el.style.width = 'auto';
  el.rows = Math.max(1, el.value.split('\n').length);
  const w = Math.max(60, Math.max(...el.value.split('\n').map(l => l.length), 4) * Math.max(9, px) * 0.6 + 16);
  el.style.width = w + 'px';
  const left = s[0] - (app.textAlign === 'c' ? w / 2 : app.textAlign === 'r' ? w : 0) - 4;
  el.style.left = left + 'px'; el.style.top = (s[1] - Math.max(9, px) * 0.95) + 'px';
}
function finishText(cancel = false) {
  if (!textEd) return;
  const { el, ent, p } = textEd, v = el.value.replace(/\s+$/, '');
  textEd = null; el.remove(); app.hideEnt = null;
  if (!cancel) {
    if (ent && !v) app.edit(_t('Usuń tekst'), tx => tx.del(ent.id));
    else if (ent) app.edit(_t('Tekst'), tx => tx.set(ent.id, { s: v, h: app.textH, align: app.textAlign }));
    else if (v) app.edit(_t('Tekst'), tx => tx.add({ t: 'text', p, s: v, h: app.textH, align: app.textAlign }));
  }
  showTextBar(); refreshUi(); redraw();
}
function showTextBar() {
  let el = $('#textBar');
  if (tool.id !== 'text' && !textEd) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'textBar'; el.className = 'toolbar'; view.append(el);
    el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.h) app.textH = +b.dataset.h; if (b.dataset.al) app.textAlign = b.dataset.al;
      showTextBar(); placeTextEd(); textEd?.el.focus();
    });
  }
  morph(el, `<span class="t">${_t('Tekst')}</span><span class="lbl">${_t('Wysokość')}</span>
    <div class="seg">${[1.8, 2.5, 3.5, 5, 7].map(h => `<button data-h="${h}" class="${app.textH === h ? 'on' : ''}">${String(h).replace('.', DEC)}</button>`).join('')}</div><span class="lbl">${_t('mm na wydruku')}</span>
    <div class="seg">${[['l', _t('Do lewej')], ['c', _t('Do środka')], ['r', _t('Do prawej')]].map(([a, n]) => `<button data-al="${a}" class="${app.textAlign === a ? 'on' : ''}" aria-label="${n}">${ic('align' + a.toUpperCase(), 14)}</button>`).join('')}</div>`);
}

/* ---------- eksport: PDF w skali i PNG ---------- */
let exp = { kind: 'pdf', all: false, mono: true };
function openExport() {
  closePops();
  if (!app.doc.sheets.length) return toast(_t('Najpierw dodaj arkusz (+ na dole) — PDF powstaje z arkuszy.'), 4000);
  const pop = $('#exportPop'), cur = app.sheet(), all = exp.kind === 'pdf' && (exp.all || !cur), pngSheet = cur || app.doc.sheets[0];
  morph(pop, `<div class="row"><span class="ttl grow">${_t('Eksport')}</span></div>
    <div class="seg stretch"><button data-k="pdf" class="${exp.kind === 'pdf' ? 'on' : ''}">${_t('PDF wektorowy')}</button><button data-k="png" class="${exp.kind === 'png' ? 'on' : ''}">PNG</button></div>
    <div class="row"><span class="lbl w72">${_t('Arkusze')}</span><div class="seg stretch grow"><button data-all="0" class="${all || !cur ? '' : 'on'}" ${cur ? '' : 'disabled'}>${_t('Ten')}</button><button data-all="1" class="${all ? 'on' : ''}" ${exp.kind === 'png' ? 'disabled' : ''}>${_t`Wszystkie (${app.doc.sheets.length})`}</button></div></div>
    <div class="row"><span class="lbl w72">${_t('Kolory')}</span><div class="seg stretch grow"><button data-mono="0" class="${exp.mono ? '' : 'on'}">${_t('Warstw')}</button><button data-mono="1" class="${exp.mono ? 'on' : ''}">${_t('Czarno-białe')}</button></div></div>
    <div class="hr"></div><p class="note">${exp.kind === 'pdf' ? _t('Kreski w milimetrach jak w pasku kreski, okna w swoich skalach. Wszystkie arkusze trafiają do jednego pliku, każdy na osobnej stronie.') : _t`Obraz arkusza „${esc(pngSheet.name)}” w 200 dpi.`}</p>
    <div class="row" style="justify-content:flex-end;gap:6px"><button class="tbs" id="expPrint">${_t('Drukuj…')}</button><button class="primary" id="expGo">${exp.kind === 'pdf' ? _t('Zapisz PDF…') : _t('Zapisz PNG…')}</button></div>`);
  placePop(pop, $('#pdfBtn'));
}
$('#exportPop').addEventListener('click', async e => {
  e.stopPropagation();
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.k) exp.kind = b.dataset.k; else if (b.dataset.all) exp.all = b.dataset.all === '1'; else if (b.dataset.mono) exp.mono = b.dataset.mono === '1';
  else if (b.id === 'expGo') { closePops(); return runExport(); }
  else if (b.id === 'expPrint') { closePops(); return printSheets(); }
  openExport();
});
async function runExport() {
  const sheets = exp.kind === 'pdf' && (exp.all || !app.sheet()) ? app.doc.sheets : [app.sheet() || app.doc.sheets[0]];
  const name = app.file.name + (sheets.length === 1 ? ' — ' + sheets[0].name : '');
  try {
    if (exp.kind === 'pdf') {
      const bytes = makePdf(app.doc, sheets, { mono: exp.mono, fmtModel: app.fmtModel, fmtSheet: app.fmtSheet });
      const r = await api.saveBinary(bytes, name, 'pdf'); if (r) { react($('#pdfBtn'), 'tak'); toast(_t('Zapisano PDF'), 1500); }
    } else {
      const blob = await sheetPng(sheets[0], 200, exp.mono);
      const r = await api.saveBinary(new Uint8Array(await blob.arrayBuffer()), name, 'png'); if (r) { react($('#pdfBtn'), 'tak'); toast(_t('Zapisano PNG'), 1500); }
    }
  } catch (err) { toast(_t`Nie udało się zapisać: ${esc(err.message)}`, 5000); }
  finally { syncSpace(); }
}
// Drukowanie: arkusze jako obrazy (do 300 dpi, duże formaty mniej, żeby zmieścić się w pamięci) na stronach w rozmiarze
// arkusza (@page z nazwą dla każdego formatu) w ukrytej ramce; okno drukowania jest systemowe. Skala jest dokładna, gdy
// w oknie drukowania wybrano „rzeczywisty rozmiar / 100%”.
async function printSheets() {
  // te same arkusze, które pokazuje okienko („Wszystkie” tylko przy PDF)
  const sheets = exp.kind === 'pdf' && (exp.all || !app.sheet()) ? app.doc.sheets : [app.sheet() || app.doc.sheets[0]];
  toast(_t('Przygotowuję wydruk…'), 1500);
  let fr = null;
  const urls = [];
  try {
    const pages = [];
    for (const [i, sh] of sheets.entries()) {
      const [W, H] = sheetSize(sh), sq = (W / 0.0254) * (H / 0.0254), dpi = Math.max(100, Math.min(300, Math.floor(Math.sqrt(60e6 / sq))));
      const url = URL.createObjectURL(await sheetPng(sh, dpi, exp.mono)); urls.push(url);
      pages.push({ url, w: W * 1000, h: H * 1000, n: 'p' + i });
    }
    const css = pages.map(p => `@page ${p.n}{size:${p.w}mm ${p.h}mm;margin:0} .${p.n}{page:${p.n};width:${p.w}mm;height:${p.h}mm}`).join('\n');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}div{break-after:page;overflow:hidden}div:last-child{break-after:auto}img{display:block;width:100%;height:100%}${css}</style></head><body>${pages.map(p => `<div class="${p.n}"><img src="${p.url}"></div>`).join('')}</body></html>`;
    fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;border:0';
    document.body.append(fr);
    await new Promise(res => { fr.onload = res; fr.srcdoc = html; });
    await Promise.all([...fr.contentDocument.images].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
    const done = () => { fr.remove(); urls.forEach(u => URL.revokeObjectURL(u)); };
    fr.contentWindow.addEventListener('afterprint', () => setTimeout(done, 500));
    fr.contentWindow.focus(); if (!app._noPrint) fr.contentWindow.print();   // _noPrint: sprawdziany w przeglądarce bez okna drukowania
    setTimeout(() => { if (fr.isConnected) done(); }, 10 * 60 * 1000);
    app._printFrame = fr;   // do sprawdzianów
  } catch (err) { fr?.remove(); urls.forEach(u => URL.revokeObjectURL(u)); toast(_t`Nie udało się przygotować wydruku: ${esc(err.message)}`, 5000); }
}
// arkusz jako obraz: te same polecenia rysowania co ekran i PDF
function sheetPng(sh, dpi, mono) {
  const [W, H] = sheetSize(sh), ppm = dpi / 0.0254, cw = Math.round(W * ppm), ch = Math.round(H * ppm);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cw, ch);
  const v = { ppm, toScreen: p => [p[0] * ppm, (H - p[1]) * ppm] };
  drawSheet(new CanvasPen(c, v), app.doc, sh, { exact: true, mono, ink: '#1a1a19', muted: '#8f8e89', fmtModel: app.fmtModel, fmtSheet: app.fmtSheet });
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
$('#pdfBtn').addEventListener('click', e => { e.stopPropagation(); if (!$('#exportPop').hidden) return closePops(); openExport(); });

/* ---------- komunikat ---------- */
let toastTimer = null;
// krótka reakcja przycisku: „tak” — udało się, „nie” — nie da się (wytyczne interakcji §5)
// (wzorzec_przyciskow.html: „zagraj”) — także przy kolejnych kliknięciach pod rząd; wlacz / wylacz — przełącznik
function react(b, cls) { if (!b) return; b.classList.remove('tak', 'nie', 'wlacz', 'wylacz'); void b.offsetWidth; b.classList.add(cls); clearTimeout(b._react); b._react = setTimeout(() => b.classList.remove(cls), 650); }
// zakładki (.seg): wspólny wskaźnik idzie pod przycisk z klasą .on — bez względu na to, które miejsce w kodzie ją ustawia.
// Zakładki powstają w paskach i okienkach w trakcie pracy, więc każdą nową kapsułę wyłapuje obserwator całego okna.
function segInd(seg) {
  if (seg._ind) return; seg._ind = 1;
  const ind = document.createElement('div'); ind.className = 'ind cicho'; seg.prepend(ind); seg.classList.add('zind');
  let first = true;
  const move = () => {
    if (ind.parentNode !== seg) seg.prepend(ind);   // przebudowa zawartości kapsuły mogła go zdjąć
    const on = seg.querySelector(':scope > button.on'); ind.style.opacity = on ? 1 : 0; if (!on || !on.offsetWidth) return;
    ind.style.width = on.offsetWidth + 'px'; ind.style.transform = `translateX(${on.offsetLeft}px)`;
    if (first) { first = false; requestAnimationFrame(() => requestAnimationFrame(() => ind.classList.remove('cicho'))); }
  };
  new MutationObserver(move).observe(seg, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  new ResizeObserver(() => { ind.classList.add('cicho'); move(); requestAnimationFrame(() => ind.classList.remove('cicho')); }).observe(seg);
  move();
}
document.querySelectorAll('.seg').forEach(segInd);
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches('.seg')) segInd(n); n.querySelectorAll?.('.seg').forEach(segInd); } })
  .observe(document.body, { childList: true, subtree: true });
// „tak” po kliknięciu przycisku z tekstem (§4); fokus nie zostaje na przycisku klikniętym myszą (§5) — inaczej skrót
// zapala na nim ramkę fokusu, a spacja albo Enter klikają go jeszcze raz
document.addEventListener('click', e => {   // w fazie przechwytywania: paski i okienka zatrzymują kliknięcie dla siebie
  const b = e.target.closest && e.target.closest('.tb, .tbs, .primary'); if (b && !b.disabled && !b.classList.contains('chip')) react(b, 'tak');
}, true);
document.addEventListener('click', e => {
  if (e.detail === 0) return;
  const b = e.target.closest && e.target.closest('button, input[type="checkbox"]');
  if (b && document.activeElement === b) b.blur();
}, true);
// wciśnięcie przycisku z ikoną (wzorzec_przyciskow.html): :active trwa tyle co kliknięcie (~0,1 s), więc ugięcia prawie
// nie widać — klasa .wcis od pointerdown do puszczenia, ale co najmniej 90 ms
// przyciski z ikoną (.ib — ugina się ikona) i z samym tekstem (ugina się cały przycisk, wytyczne §2b)
const PRESS = '.ib, .layer .ic, .layer .ls, .layer .swb, .tb, .tbs, .pill, .menu button, .seg button, .pop .cats button, #blocksPop .blk, #toast button, .toolbar .pick, .toolbar .pats button, .tabs button, .pop .mv, .primary';
document.addEventListener('pointerdown', e => {
  const b = e.target.closest && e.target.closest(PRESS); if (!b || e.button || b.disabled) return;
  b.classList.add('wcis'); const t0 = performance.now();
  const up = () => { removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    setTimeout(() => b.classList.remove('wcis'), Math.max(0, 90 - (performance.now() - t0))); };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
}, true);   // w fazie przechwytywania: paski i okienka zatrzymują pointerdown dla siebie
function toast(msg, ms = 2600, action = null) {
  const t = $('#toast'); t.innerHTML = msg;
  if (action) { const b = document.createElement('button'); b.textContent = action[0]; b.addEventListener('click', () => { t.hidden = true; action[1](); }); t.append(b); }
  t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
app.toast = toast;

/* ---------- start ---------- */
installTestApi(app, { loadDoc, setSpace, frame: () => frame(), getSnap: () => snapRes, getTool: () => tool, updateCursor, setTyping: v => { typing = v; refreshUi(); }, submitTyping });
setFile(null, null);
syncSpace(); renderTabs();
if (app.mini) document.body.classList.add('mini');
setTool('select');
refreshUi();
app.view.fit(null);
const openParam = new URLSearchParams(location.search).get('p');
if (openParam && !api.web) fileOpen(openParam);
