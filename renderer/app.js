// Rysio — okno programu: stan, mysz i klawiatura, paski, okienka warstw i kreski, zapis. Opis: ARCHITEKTURA.md.
import { _t, translateDom, lang, LANGS, setLang } from './i18n.js';
import { newDoc, fixDoc, History, serialize, strokeOf, layerOf, isLive, isShown, WEIGHTS, LTYPES, LTYPE_IDS, LAYER_COLORS, SCALES } from './model.js';
import { V, bbox, boxHit, boxGrow, nearestOn } from './geom.js';
import { View } from './view.js';
import { Snapper } from './snap.js';
import { makeTools } from './tools.js';
import { setUnit, getUnit, fmtLength } from './units.js';
import { ACTIONS, loadKeys, saveKeyOverride, keysFor, comboOf, prettyCombo } from './keys.js';
import { installTestApi } from './testapi.js';

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
  gear: '<path d="M2.5 4.5h4M9.5 4.5h4M2.5 11.5h7M12.5 11.5h1"/><circle cx="8" cy="4.5" r="1.5"/><circle cx="11" cy="11.5" r="1.5"/>',
  eye: '<path d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.9"/>',
  eyeOff: '<path d="M2.5 2.5l11 11M6.6 4A6.3 6.3 0 0 1 8 3.8c4 0 6.2 4.2 6.2 4.2a11 11 0 0 1-1.8 2.3M10.6 11.6A5.8 5.8 0 0 1 8 12.2C4 12.2 1.8 8 1.8 8a11 11 0 0 1 2.4-2.8"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  unlock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9"/>'
};
const ic = (n, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
const chev = '<svg class="chev" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const wtxt = w => w.toFixed(2).replace('.', ',');
const sample = (w, lt, len = 26, h = 8) => { const d = (LTYPES[lt] || LTYPES.solid).dash.map(v => Math.max(v * 1.6, 0.6)).join(' '); return `<svg width="${len}" height="${h}" aria-hidden="true"><line x1="1" y1="${h / 2}" x2="${len - 1}" y2="${h / 2}" stroke="currentColor" stroke-width="${Math.max(0.7, w * 3.78).toFixed(2)}" stroke-dasharray="${d}" stroke-linecap="${lt === 'dot' ? 'round' : 'butt'}"/></svg>`; };
for (const [id, n] of [['#undoBtn', 'undo'], ['#redoBtn', 'redo'], ['#thinBtn', 'thin'], ['#pdfBtn', 'pdf'], ['#setBtn', 'gear']]) $(id).innerHTML = ic(n);

/* ---------- stan ---------- */
const app = {
  isMac, altName: isMac ? '⌥' : 'Ctrl', shiftName: isMac ? '⇧' : 'Shift', bsName: isMac ? '⌫' : 'Backspace',
  doc: newDoc(), sel: new Set(),
  thin: false, ortho: false,
  file: { path: null, name: _t('Bez nazwy'), dirty: false },
  keys: loadKeys()
};
// klawisz „kopii” i „pobierz z linii”: ⌥ na Macu, Ctrl w Windows (jak w Modo — Alt w Windows otwiera menu okna)
app.altKey = e => !!e && (isMac ? e.altKey : e.ctrlKey);
app.hist = new History(app.doc, () => afterChange());
app.view = new View($('#view'));
app.snapper = new Snapper();
app.tools = makeTools(app);
let tool = app.tools.select;
let snapRes = null, cursorModel = null, cursorScreen = null, hoverEnt = null, lockDir = null;

app.edit = (label, fn) => app.hist.edit(label, fn);
app.tol = () => 9 / app.view.ppm;
app.newStroke = () => ({ layer: app.doc.cur.layer, w: app.doc.cur.w, lt: app.doc.cur.lt });
// element pod punktem: tylko widoczne i niezablokowane warstwy
app.pick = (p, { locked = false } = {}) => {
  const tol = app.tol(), probe = [p[0] - tol, p[1] - tol, p[0] + tol, p[1] + tol];
  let best = null, bd = Infinity;
  for (const e of app.doc.ents) {
    if (!(locked ? isShown(app.doc, e) : isLive(app.doc, e)) || !boxHit(boxGrow(bbox(e), tol), probe)) continue;
    const n = nearestOn(e, p); if (n && n.d <= tol && n.d < bd) { bd = n.d; best = e; }
  }
  return best;
};
app.selectionChanged = () => { refreshUi(); redraw(); };
// opis skrótu polecenia w bieżącym układzie (do podpowiedzi)
app.keyName = id => { const k = keysFor(id, app.keys.over)[0]; return k ? prettyCombo(k, isMac) : ''; };
app.refreshUi = () => refreshUi();
function afterChange() {
  // zaznaczenie bez usuniętych elementów
  for (const id of [...app.sel]) { const e = app.doc.ents.find(x => x.id === id); if (!e || !isLive(app.doc, e)) app.sel.delete(id); }
  setUnit(app.doc.units, false);
  markDirty(true); refreshUi(); redraw();
}

/* ---------- lewy pasek ---------- */
const TOOLBAR = ['select', 'eraser', 'brush', null, 'line', 'pline', 'rect', 'circle', 'arc', null, 'move', 'copy', 'rotate', 'mirror', 'scale', null, 'offset', 'fillet', 'trim', null, 'hatch', 'block', 'text', 'dim', 'grow', 'extents'];
const toolsEl = $('#tools');
for (const id of TOOLBAR) {
  if (id === null) { toolsEl.insertAdjacentHTML('beforeend', '<div class="hsep"></div>'); continue; }
  if (id === 'grow') { toolsEl.insertAdjacentHTML('beforeend', '<div class="grow"></div>'); continue; }
  const a = ACTIONS.find(x => x.id === id), later = !!a.later;
  const b = document.createElement('button');
  b.className = 'ib' + (later ? ' later' : ''); b.dataset.tool = id; b.innerHTML = ic(id);
  const name = id === 'arc' ? _t`Łuk (${app.shiftName} + klik — ze środka; Tab przełącza)` : a.name;
  b.setAttribute('aria-label', name); b.dataset.tip = name + (later ? _t(' — w kolejnej wersji') : ''); b.dataset.act = id;
  b.addEventListener('click', e => runAction(id === 'arc' && e.shiftKey ? 'arcC' : id));
  toolsEl.append(b);
}

function setTool(id, opts = {}) {
  if (!app.tools[id]) return;
  // przerwij to, co narzędzie ma w toku (zaznaczenie zostaje — W i C działają na nim)
  if (tool.id === 'select') { tool._down = null; tool.box = null; } else for (let i = 0; i < 3 && tool.cancel(); i++);
  tool = app.tools[id];
  tool.start?.();
  if (id === 'arc') { tool.pts = []; tool.mode = opts.arcMode || '3p'; }
  if (id !== 'brush') hideBrushBar();
  lockDir = null; typing = null; app.snapper.clearRefs(); snapRes = null; hoverEnt = null;
  if (cursorScreen) updateCursor(...cursorScreen);
  toolsEl.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === id));
  $('#view').className = tool.draw ? 'c-draw' : '';
  refreshUi(); redraw();
}
app.setTool = setTool;

/* ---------- akcje (skróty, przyciski, menu) ---------- */
function runAction(id) {
  const a = ACTIONS.find(x => x.id === id);
  if (a && a.later) return toast(_t`${a.name} — w kolejnej wersji.`);
  if (app.tools[id]) return setTool(id);
  switch (id) {
    case 'arcC': return setTool('arc', { arcMode: 'c' });
    case 'undo': { if (tool.undoInTool?.()) { refreshUi(); redraw(); return; } const l = app.hist.undo(); if (l) toast(_t`Cofnięto: ${l}`, 1200); return; }
    case 'redo': { const l = app.hist.redo(); if (l) toast(_t`Ponowiono: ${l}`, 1200); return; }
    case 'delete': if (app.sel.size) { const ids = [...app.sel].filter(id => { const e = app.doc.ents.find(x => x.id === id); return e && isLive(app.doc, e); }); app.edit(_t('Usuń'), tx => ids.forEach(i => tx.del(i))); } return;
    case 'selectAll': setTool('select'); app.sel = new Set(app.doc.ents.filter(e => isLive(app.doc, e)).map(e => e.id)); app.selectionChanged(); return;
    case 'extents': app.view.fitDoc(app.doc); redraw(); return;
    case 'thin': app.thin = !app.thin; $('#thinBtn').setAttribute('aria-pressed', app.thin); redraw(); return;
    case 'ortho': app.ortho = !app.ortho; refreshUi(); return;
    case 'snapToggle': app.snapper.enabled = !app.snapper.enabled; refreshUi(); return;
    case 'theme': { const order = ['auto', 'light', 'dark']; setTheme(order[(order.indexOf(themePref) + 1) % 3]); toast({ auto: _t('Wygląd automatyczny'), light: _t('Wygląd jasny'), dark: _t('Wygląd ciemny') }[themePref], 1200); return; }
    case 'new': return fileNew();
    case 'open': return fileOpen();
    case 'save': return fileSave(false);
    case 'saveAs': return fileSave(true);
    case 'keys': return openKeys();
  }
}
app.run = runAction;

/* ---------- mysz ---------- */
const view = $('#view');
const xy = e => { const r = view.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
let panning = null, spaceDown = false, downBtn = -1;
function updateCursor(sx, sy, e) {
  cursorScreen = [sx, sy];
  const raw = app.view.toModel(sx, sy);
  if (tool.draw) {
    const shown = app.doc.ents.filter(x => isShown(app.doc, x));
    snapRes = app.snapper.find(raw, { tol: app.tol(), ents: shown, base: tool.base(), lockDir, ortho: app.ortho, noSnap: false });
    cursorModel = snapRes.p; hoverEnt = null;
  } else {
    snapRes = null; cursorModel = raw;
    hoverEnt = (tool.id === 'select' && tool.box) ? null : app.pick(raw);
  }
}
view.addEventListener('pointerdown', e => {
  if (closePops() && e.button === 0) return;
  view.setPointerCapture(e.pointerId); downBtn = e.button;
  const [x, y] = xy(e);
  if (e.button === 1 || (e.button === 0 && spaceDown)) { panning = [x, y]; view.classList.add('c-grabbing'); e.preventDefault(); return; }
  if (e.button === 2) { if (!tool.enter()) tool.cancel(); refreshUi(); redraw(); return; }
  if (e.button !== 0) return;
  updateCursor(x, y, e);
  if (typing !== null) { typing = null; }
  tool.down(cursorModel, e); updateCursor(x, y, e);
  refreshUi(); redraw();
});
view.addEventListener('pointermove', e => {
  const [x, y] = xy(e);
  if (panning) { app.view.pan(x - panning[0], y - panning[1]); panning = [x, y]; redraw(); return; }
  updateCursor(x, y, e);
  tool.move(cursorModel, e);
  showReading(); redraw();
});
view.addEventListener('pointerup', e => {
  const [x, y] = xy(e);
  if (panning) { panning = null; view.classList.remove('c-grabbing'); return; }
  if (e.button === 0 && downBtn === 0) { tool.up?.(cursorModel || app.view.toModel(x, y), e); refreshUi(); redraw(); }
  downBtn = -1;
});
view.addEventListener('pointerleave', () => { cursorScreen = null; snapRes = null; hoverEnt = null; $('#snapLbl')?.remove(); $('#reading')?.remove(); redraw(); });
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
  if (plain && tool.label() && tool.base() && /^[0-9.,\-]$/.test(e.key)) { e.preventDefault(); typing = e.key; return refreshUi(); }
  if (e.key === 'Escape') {
    if (closePops()) return;
    if (!tool.cancel()) { if (tool.id !== 'select') setTool('select'); else if (app.sel.size) { app.sel.clear(); app.selectionChanged(); } }
    refreshUi(); redraw(); return;
  }
  if (e.key === 'Enter') { if (tool.enter()) { refreshUi(); redraw(); } return; }
  if (e.key === 'Tab' && tool.id === 'arc') { e.preventDefault(); tool.toggle(); refreshUi(); redraw(); return; }
  if (e.key === 'Backspace' && plain && tool.backspace?.()) { e.preventDefault(); refreshUi(); redraw(); return; }
  if (e.key === ' ' && plain) { spaceDown = true; view.classList.add('c-grab'); e.preventDefault(); return; }
  // ⇧ trzyma kierunek od punktu bazowego
  if (e.key === 'Shift' && tool.draw && tool.base() && cursorModel && !lockDir) {
    const d = V.norm(V.sub(cursorModel, tool.base())); if (d[0] || d[1]) { lockDir = d; redraw(); }
    return;
  }
  const c = comboOf(e, isMac); if (!c) return;
  const id = app.keys.map.get(c);
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
  app.view.render({
    doc: app.doc, sel: app.sel, thin: app.thin,
    hover: [...hi, ...(hoverEnt && !app.sel.has(hoverEnt.id) ? [hoverEnt] : [])], hoverColor: tool.id === 'eraser' ? '#c0533f' : null,
    guides: snapRes ? snapRes.guides : [], snap: snapRes, marks: tool.draw ? app.snapper.refPts : [],
    preview: cursorScreen || !tool.draw ? tool.preview() : [], box: tool.box, path: tool.path && tool.path.length > 1 ? tool.path : null
  });
  showSnapLabel();
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
  let el = $('#reading');
  const r = cursorScreen && tool.reading ? tool.reading() : null;
  if (!r || typing !== null) { el?.remove(); } else {
    if (!el) { el = document.createElement('div'); el.id = 'reading'; el.className = 'reading'; view.append(el); }
    el.textContent = r; el.style.left = (cursorScreen[0] + 16) + 'px'; el.style.top = (cursorScreen[1] - 30) + 'px';
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
  if (typing !== null) $('#reading')?.remove();
  $('#undoBtn').disabled = !app.hist.canUndo; $('#redoBtn').disabled = !app.hist.canRedo;
  $('#snapChip').classList.toggle('off', !app.snapper.enabled);
  $('#orthoChip').classList.toggle('off', !app.ortho);
  $('#unitBtn').textContent = app.doc.units;
  $('#scaleBtn').innerHTML = '1:' + app.doc.scale + ' ' + chev;
  renderPills();
  if (tool.id === 'brush') showBrushBar();
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
function placePop(pop, anchor) {
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = (r.bottom + 6) + 'px';
  anchor.classList.add('open');
}
function closePops() {
  let any = false;
  for (const id of ['#layersPop', '#strokePop', '#menu']) if (!$(id).hidden) { $(id).hidden = true; any = true; }
  document.querySelectorAll('.pill.open, .tb.open').forEach(b => b.classList.remove('open'));
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
      <button class="swb" data-color="${L.id}" aria-label="${_t('Kolor warstwy')}"><i style="background:${L.color === '#1a1a19' ? 'var(--ink)' : L.color}"></i></button>
      <span class="nm" translate="no" data-pick="${L.id}" title="${_t('Klik — warstwa dla nowych elementów, dwuklik — zmiana nazwy')}">${nm}</span>
      ${si ? `<button class="mv" data-move="${L.id}">${_t`Przenieś tutaj ${si.n}`}</button>` : ''}
      ${empty && !cur && d.layers.length > 1 ? `<button class="ic del" data-del="${L.id}" aria-label="${_t('Usuń pustą warstwę')}">${ic('trash', 14)}</button>` : ''}
      <button class="ls" data-stroke="${L.id}" aria-label="${_t('Kreska warstwy')}">${sample(L.w, L.lt, 28, 4)}<span>${String(L.w).replace('0.', ',')}</span></button>
      <button class="ic${L.visible ? ' act' : ''}" data-vis="${L.id}" aria-label="${_t('Widoczność')}">${ic(L.visible ? 'eye' : 'eyeOff', 14)}</button>
      <button class="ic${L.locked ? ' act' : ''}" data-lock="${L.id}" aria-label="${_t('Blokada')}">${ic(L.locked ? 'lock' : 'unlock', 14)}</button>
    </div>` + (colorFor === L.id ? `<div class="colors">${LAYER_COLORS.map(c => `<button data-setcolor="${c}" data-for="${L.id}" class="${c === L.color ? 'on' : ''}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>` : '');
  }).join('');
  const note = si ? _t`Zaznaczone: ${si.n}. „Przenieś tutaj” przy warstwie przenosi je na nią; z kreską „jak warstwa” przejmują jej kreskę.` : _t('Klik w nazwę — warstwa dla nowych elementów, dwuklik — zmiana nazwy. Kreska w wierszu zmienia kreskę warstwy.');
  pop.innerHTML = `<div class="row" style="height:26px"><span class="ttl grow">${_t('Warstwy')}</span><button class="tbs" id="layerAdd">${_t('Dodaj')}</button></div><div class="hr" style="margin-top:4px"></div>${rows}<div class="hr"></div><p class="note">${note}</p>`;
  const inp = pop.querySelector('[data-rename]'); if (inp) { inp.focus(); inp.select(); }
}
$('#layersPop').addEventListener('click', e => {
  e.stopPropagation();
  const t = e.target.closest('button, [data-pick]'); if (!t) return;
  const d = app.doc, num = k => +t.dataset[k];
  if (t.id === 'layerAdd') {
    const n = d.layers.length + 1;
    const L = app.edit(_t('Nowa warstwa'), tx => { const L = tx.addLayer({ name: _t`Warstwa ${n}`, color: LAYER_COLORS[(n - 1) % LAYER_COLORS.length] }); tx.setDoc({ cur: { ...d.cur, layer: L.id } }); return L; });
    renaming = L.id; renderLayersPop(); return;
  }
  if (t.dataset.pick && !t.querySelector('input')) { app.edit(_t('Bieżąca warstwa'), tx => tx.setDoc({ cur: { ...d.cur, layer: num('pick') } })); app.tools.brush.carry = null; refreshUi(); return; }
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
  pop.innerHTML = `<div class="row" style="height:28px">${head}</div><div class="hr"></div>
    <div class="kcols"><div class="kcol"><div class="h">${_t('Grubość, mm')}</div>${ws}</div><div class="kcol"><div class="h">${_t('Rodzaj')}</div>${ts}</div></div>
    <div class="hr"></div><p class="note">${note}</p>`;
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
  else { app.edit(_t('Kreska'), tx => tx.setDoc({ cur: { ...d.cur, ...patch } })); app.tools.brush.carry = null; refreshUi(); }
});
document.addEventListener('pointerdown', e => { if (!e.target.closest('.pop, .menu, .pill, #status .unit, #fileBtn, #setBtn')) closePops(); });

/* ---------- pasek pędzla ---------- */
function showBrushBar() {
  let el = $('#brushBar');
  if (!el) { el = document.createElement('div'); el.id = 'brushBar'; el.className = 'toolbar'; view.append(el); el.addEventListener('pointerdown', e => e.stopPropagation()); el.addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) { app.tools.brush.mode = b.dataset.mode; showBrushBar(); } }); }
  const br = app.tools.brush, c = br.getCarry(), L = app.doc.layers.find(x => x.id === c.layer) || app.doc.layers[0];
  const w = c.w ?? L.w, lt = c.lt ?? L.lt;
  el.innerHTML = `<span class="t">${_t('Pędzel')}</span>
    <div class="seg">${[['both', _t('Kreska i warstwa')], ['stroke', _t('Tylko kreska')], ['layer', _t('Tylko warstwa')]].map(([m, n]) => `<button data-mode="${m}" class="${br.mode === m ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="smp">${sample(w, lt, 30)}<span>${wtxt(w)} ${LTYPES[lt].name}${c.w === null && c.lt === null ? ' <span class="lbl">(' + _t('jak warstwa') + ')</span>' : ''}</span><span class="lbl">·</span><i style="background:${L.color === '#1a1a19' ? 'var(--ink)' : L.color}"></i><span translate="no">${esc(L.name)}</span></div>
    <span class="lbl" style="padding:0 6px"><kbd>${app.altName}</kbd> + ${_t('klik — pobierz z linii')}</span>`;
}
function hideBrushBar() { $('#brushBar')?.remove(); }

/* ---------- pasek stanu: jednostka i skala ---------- */
function showMenu(anchor, items, { up = false } = {}) {
  const m = $('#menu'); m.innerHTML = '';
  for (const it of items) {
    if (it === 'sep') { m.insertAdjacentHTML('beforeend', '<div class="msep"></div>'); continue; }
    if (it.lbl) { m.insertAdjacentHTML('beforeend', `<div class="mlbl">${it.lbl}</div>`); continue; }
    if (it.html) { const d = document.createElement('div'); d.className = 'mrow'; d.innerHTML = it.html; m.append(d); it.bind?.(d); continue; }
    const b = document.createElement('button'); b.className = it.on ? 'on' : ''; b.disabled = !!it.disabled;
    b.innerHTML = `<span>${it.label}</span>` + (it.kbd ? `<kbd>${prettyCombo(it.kbd, isMac)}</kbd>` : '');
    b.addEventListener('click', () => { closePops(); it.act(); });
    m.append(b);
  }
  m.hidden = false;
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = (up ? r.top - m.offsetHeight - 6 : r.bottom + 6) + 'px';
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
  app.doc = doc; app.hist.reset(doc); app.sel.clear(); setUnit(doc.units, false); app.tools.brush.carry = null;
  setFile(path, name); markDirty(dirty);
  setTool('select'); app.view.fitDoc(doc); refreshUi(); redraw();
}
function confirmDiscard() { return !app.file.dirty || confirm(_t('Rysunek ma niezapisane zmiany. Porzucić je?')); }
function fileNew() { if (!confirmDiscard()) return; loadDoc(newDoc()); api.autosaveClear(autoKey); }
async function fileOpen(p) {
  if (!confirmDiscard()) return;
  try {
    const r = await api.openFile(p); if (!r) return;
    loadDoc(fixDoc(JSON.parse(r.text)), { path: r.path, name: r.name });
  } catch (err) { toast(_t`Nie udało się otworzyć pliku: ${esc(err.message)}`, 5000); }
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
  app.view.theme = { bg: v('--paper'), ink: v('--ink'), sel: v('--sel'), snap: v('--snap'), muted: v('--muted2') };
  api.setTheme(dark); redraw();
}
function setTheme(p) { themePref = p; try { localStorage.setItem('rysio.theme', p); } catch (e) {} applyTheme(); }
mq.addEventListener('change', applyTheme);
applyTheme();
$('#setBtn').addEventListener('click', e => {
  e.stopPropagation(); if (!$('#menu').hidden) return closePops();
  showMenu($('#setBtn'), [
    { lbl: _t('Wygląd') }, ...[['auto', _t('Automatyczny')], ['light', _t('Jasny')], ['dark', _t('Ciemny')]].map(([k, n]) => ({ label: n, on: themePref === k, act: () => setTheme(k) })),
    'sep', { lbl: _t('Język') }, ...LANGS.map(([k, n]) => ({ label: n, on: lang === k, act: () => { if (k === lang || !confirmDiscard()) return; setLang(k); api.setLang(k); location.reload(); } })),
    'sep', { label: _t('Skróty klawiszowe'), kbd: 'Shift+Slash', act: openKeys },
    ...(api.web ? [] : [{ label: _t('Sprawdź aktualizacje'), act: async () => { const s = await api.updateCheck(); showUpdate(s); if (s.state === 'none') toast(_t`Masz najnowszą wersję (${s.current}).`); else if (s.state === 'error') toast(_t`Nie udało się sprawdzić: ${esc(s.error)}`); } }])
  ]);
});
$('#pdfBtn').addEventListener('click', () => toast(_t('Eksport PDF powstanie razem z arkuszami (etap 2).')));
$('#tabAdd').addEventListener('click', () => toast(_t('Arkusze powstaną w etapie 2.')));
$('#thinBtn').addEventListener('click', () => runAction('thin'));
$('#undoBtn').addEventListener('click', () => runAction('undo'));
$('#redoBtn').addEventListener('click', () => runAction('redo'));
$('#snapChip').addEventListener('click', () => runAction('snapToggle'));
$('#orthoChip').addEventListener('click', () => runAction('ortho'));
function showUpdate(s) {
  const b = $('#updBtn');
  if (!s || !['available', 'downloading', 'ready'].includes(s.state)) { b.hidden = true; return; }
  b.hidden = false;
  b.textContent = s.state === 'downloading' ? _t`Pobieranie ${Math.round(100 * s.got / (s.size || 1))}%` : s.state === 'ready' ? _t('Instalowanie…') : _t`Nowa wersja ${s.version} — zainstaluj`;
}
$('#updBtn').addEventListener('click', () => api.updateInstall());
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

/* ---------- wskazówki z opisem skrótu (⌘/⌥ na Macu, Ctrl/Alt w Windows) ---------- */
let tipEl = null;
function bindTips(root) {
  root.querySelectorAll('[data-tip]').forEach(b => {
    if (b._tip) return; b._tip = 1;
    b.addEventListener('mouseenter', () => {
      tipEl?.remove(); tipEl = document.createElement('div'); tipEl.className = 'tip';
      const k = b.dataset.act ? keysFor(b.dataset.act, app.keys.over)[0] : null;
      tipEl.innerHTML = esc(_t(b.dataset.tip)) + (k ? ` <kbd>${prettyCombo(k, isMac)}</kbd>` : '');
      document.body.append(tipEl);
      const r = b.getBoundingClientRect(), side = !!b.closest('#tools');
      tipEl.style.left = (side ? r.right + 8 : Math.max(8, Math.min(r.left, innerWidth - tipEl.offsetWidth - 8))) + 'px';
      tipEl.style.top = (side ? r.top + 2 : b.closest('#status') ? r.top - 34 : r.bottom + 6) + 'px';
    });
    b.addEventListener('mouseleave', () => { tipEl?.remove(); tipEl = null; });
    b.addEventListener('pointerdown', () => { tipEl?.remove(); tipEl = null; });
  });
}
bindTips(document.body);

/* ---------- komunikat ---------- */
let toastTimer = null;
function toast(msg, ms = 2600, action = null) {
  const t = $('#toast'); t.innerHTML = msg;
  if (action) { const b = document.createElement('button'); b.textContent = action[0]; b.addEventListener('click', () => { t.hidden = true; action[1](); }); t.append(b); }
  t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
app.toast = toast;

/* ---------- start ---------- */
installTestApi(app, { loadDoc, frame: () => frame(), getSnap: () => snapRes, getTool: () => tool, updateCursor, setTyping: v => { typing = v; refreshUi(); }, submitTyping });
setFile(null, null);
setTool('select');
refreshUi();
app.view.fit(null);
const openParam = new URLSearchParams(location.search).get('p');
if (openParam && !api.web) fileOpen(openParam);
