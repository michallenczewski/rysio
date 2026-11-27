// Narzędzia. Każde dostaje od programu punkt już przyciągnięty (narzędzia rysujące) albo surowy (zaznaczanie, gumka, pędzel).
// Rysunek zmieniają wyłącznie przez app.edit() — jedna droga z cofaniem.
//
// Narzędzie:  base() punkt bazowy do kierunków · label() podpis pola wymiaru (null = bez wpisywania) · reading() bieżąca wartość
//             hint() podpowiedź · down/move/up(p, e) · typed(tekst) → true, gdy zrozumiało · enter() / cancel() → true, gdy coś zrobiło
//             preview() elementy podglądu (_replaces — zastępuje element, _sel — w kolorze zaznaczenia, _ghost — przygaszony,
//             _gone — znika: czerwona przerywana, _dash — powstanie: przerywana w kolorze zaznaczenia)
//             halo() → kawałki do podświetlenia zamiast całego elementu pod kursorem (null — cały element) · note() napis przy kursorze
//             path / box — ślad pędzla i gumki, ramka zaznaczania
import { _t, DEC } from './i18n.js';
import { V, arc3, arcCSE, angOf, sweep, moved, touchesRect, insideRect, crossesSeg, intersect, lengthOf, dimGeom, adimGeom, partsOf, closestOnSeg, angArms } from './geom.js';
import { parseLength, parseLengths, fmtLength, fmtNum } from './units.js';
import { isLive, isShown } from './model.js';
import { rotation, mirroring, scaling, transformed, offsetEnt, filletLines, filletCurves, chamferLines, plineCorner, trimMany, gripsOf, gripMove } from './edit.js';
import { buildFaces, regionAt } from './hatch.js';
import { blockEnts, bbox, boxGrow, boxHit } from './geom.js';
import { clipGhosts, clipBase, pasteClip } from './clip.js';

const dirOf = (from, to) => { const d = V.norm(V.sub(to, from)); return d[0] || d[1] ? d : [1, 0]; };
const deg = r => (r * 180 / Math.PI);
const fmtDeg = r => deg(r).toFixed(1).replace('.', DEC) + '°';

export function makeTools(app) {
  const T = {};

  /* ---------- zaznacz (Q) ---------- */
  // Z zaznaczeniem pokazuje uchwyty: przeciągnięcie uchwytu (albo klik w uchwyt i klik w nowe miejsce) zmienia element,
  // z przyciąganiem i kierunkami jak przy rysowaniu.
  T.select = {
    id: 'select', box: null, _down: null, grip: null,
    get draw() { return !!this.grip && (!this.grip.body || this.grip.moved); },
    base() { return this.grip ? this.grip.from : null; }, label: () => null, reading: () => null,
    // uchwyty zaznaczonych elementów (przy bardzo dużym zaznaczeniu nie pokazujemy — byłby gąszcz)
    grips() {
      if (this.grip || app.sel.size > 60) return [];
      const out = [];
      for (const e of app.ents()) if (app.sel.has(e.id) && isLive(app.doc, e)) for (const g of gripsOf(e)) out.push({ e, ...g });
      return out;
    },
    gripAt(p) { const tol = 7 / app.view.ppm; let best = null, bd = tol; for (const g of this.grips()) { const d = V.dist(g.p, p); if (d <= bd) { bd = d; best = g; } } return best; },
    finishGrip(p) {
      const { e, k, from } = this.grip; this.grip = null; app.dragEnt = null;
      const patch = gripMove(e, k, p, from);
      app.cursorClass?.();
      if (patch && V.dist(p, from) > 1e-9) app.edit(_t('Uchwyt'), tx => tx.set(e.id, patch));
    },
    hint() {
      if (this.grip) return _t('<b>Uchwyt:</b> przeciągnij albo kliknij nowe miejsce — przyciąganie i kierunki działają jak przy rysowaniu. Esc przerywa.');
      return app.sel.size ? _t`<b>${app.sel.size} zaznaczone.</b> ${app.keyName('delete')} usuwa, ${app.keyName('move')} przesuwa, ${app.keyName('copy')} kopiuje. Kwadracik (uchwyt) przeciągnij, żeby zmienić kształt.` : _t`<b>Zaznacz:</b> kliknij element (${app.shiftName} dodaje i odejmuje) albo przeciągnij ramkę — w prawo: całe w ramce, w lewo: wszystko, czego dotknie.`; },
    down(p, e) {
      if (this.grip) {   // drugi klik: uchwyt ląduje tutaj (szybki drugi klik to dwuklik, nie przesunięcie)
        if (performance.now() - (this.grip.armedAt || 0) < 400) { this.cancel(); return; }
        this.finishGrip(p); return;
      }
      const g = !e.shiftKey && this.gripAt(p);
      if (g) { this.grip = { e: g.e, k: g.k, from: g.p, p: g.p, moved: false }; app.dragEnt = g.e.id; app.cursorClass?.(); return; }
      // tekst chwyta się w dowolnym miejscu napisu: przeciągnięcie go przesuwa, samo kliknięcie zaznacza
      const hit = !e.shiftKey && app.pick(p);
      if (hit && hit.t === 'text') { this.grip = { e: hit, k: 'mv', from: [...p], p: [...p], moved: false, body: true }; return; }
      this._down = p; this.box = null; this._shift = e.shiftKey;
    },
    move(p) {
      if (this.grip) {
        this.grip.p = p;
        if (!this.grip.moved && V.dist(p, this.grip.from) * app.view.ppm > 4) { this.grip.moved = true; if (this.grip.body) { app.dragEnt = this.grip.e.id; app.cursorClass?.(); } }
        return;
      }
      if (this._down && V.dist(this._down, p) * app.view.ppm > 4) this.box = { a: this._down, b: p };
    },
    preview() {
      if (!this.grip) return [];
      const { e, k, from, p } = this.grip, patch = gripMove(e, k, p, from);
      return patch ? [{ ...e, ...patch }] : [{ ...e }];
    },
    up(p) {
      if (this.grip && this.grip.body) {   // tekst: przeciągnięty — przesuwamy i zaznaczamy; kliknięty — tylko zaznaczamy
        const t = this.grip.e;
        if (this.grip.moved) this.finishGrip(p); else { this.grip = null; app.dragEnt = null; }
        app.sel.clear(); app.sel.add(t.id); app.selectionChanged(); return;
      }
      if (this.grip) { if (this.grip.moved) this.finishGrip(p); else this.grip.armedAt = performance.now(); return; }   // bez ruchu: czekamy na klik w nowe miejsce
      if (!this._down) return;
      if (this.box) {
        const a = this.box.a, b = this.box.b, r = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
        const test = b[0] < a[0] ? touchesRect : insideRect;
        if (!this._shift) app.sel.clear();
        for (const e of app.ents()) if (isLive(app.doc, e) && test(e, r)) app.sel.add(e.id);
      } else {
        const e = app.pick(p);
        if (!this._shift) app.sel.clear();
        if (e) { if (this._shift && app.sel.has(e.id)) app.sel.delete(e.id); else app.sel.add(e.id); }
      }
      this._down = null; this.box = null; app.selectionChanged();
    },
    cancel() {
      if (this.grip) { this.grip = null; app.dragEnt = null; app.cursorClass?.(); return true; }
      if (this._down) { this._down = null; this.box = null; return true; }
      if (app.sel.size) { app.sel.clear(); app.selectionChanged(); return true; }
      return false;
    },
    enter: () => false, typed: () => false
  };

  /* ---------- usuń / gumka (S) ---------- */
  T.eraser = {
    id: 'eraser', draw: false, path: null, marked: new Set(),
    base: () => null, label: () => null, reading: () => null,
    hint: () => _t('<b>Usuń:</b> kliknij element albo przeciągnij przez kilka naraz.'),
    down(p) { this.path = [p]; this.marked = new Set(); const e = app.pick(p); if (e) this.marked.add(e.id); },
    move(p) {
      if (!this.path) return;
      const last = this.path[this.path.length - 1]; this.path.push(p);
      for (const e of app.ents()) if (!this.marked.has(e.id) && isLive(app.doc, e) && crossesSeg(e, last, p)) this.marked.add(e.id);
    },
    up() {
      const ids = [...this.marked]; this.path = null; this.marked = new Set();
      if (ids.length) app.edit(_t('Usuń'), tx => ids.forEach(id => tx.del(id)));
    },
    highlight() { return this.marked; },
    cancel() { if (this.path) { this.path = null; this.marked = new Set(); return true; } return false; },
    enter: () => false, typed: () => false, preview: () => []
  };

  /* ---------- pędzel (M): przemalowuje kreskę i/lub warstwę ---------- */
  T.brush = {
    // Pędzel maluje dokładnie tym, co jest w pastylkach u góry (doc.cur) — jedno źródło prawdy.
    // ⌥ + klik (Ctrl w Windows) to pipeta: przepisuje kreskę i warstwę linii do pastylek.
    id: 'brush', draw: false, path: null, done: new Set(), mode: 'both', picking: false,
    base: () => null, label: () => null, reading: () => null,
    hint() { return this.picking ? _t('<b>Pipeta:</b> kliknij linię, której kreskę i warstwę chcesz nadać innym — potem pędzel nimi maluje.') : _t`<b>Pędzel:</b> maluje kreską i warstwą z pastylek u góry — klikaj linie albo przeciągnij przez kilka naraz. Pipeta (albo ${app.altName} + klik) bierze kreskę i warstwę z innej linii.`; },
    // co niesie pędzel: domyślnie bieżąca warstwa i kreska
    getCarry() { const c = app.doc.cur; return { layer: c.layer, w: c.w, lt: c.lt }; },
    patch() { const c = this.getCarry(), p = {}; if (this.mode !== 'layer') { p.w = c.w; p.lt = c.lt; } if (this.mode !== 'stroke') p.layer = c.layer; return p; },
    down(p, e) {
      if (this.picking || app.altKey(e)) {
        const s = app.pick(p, { locked: true });
        if (s) { this.picking = false; app.edit(_t('Pipeta'), tx => tx.setDoc({ cur: { layer: s.layer, w: s.w ?? null, lt: s.lt ?? null } })); app.toast(_t('Pobrane — teraz klikaj albo przeciągaj przez linie, którym chcesz to nadać.'), 2200); app.refreshUi(); }
        return;
      }
      this.path = [p]; this.done = new Set(); const s = app.pick(p); if (s) this.done.add(s.id);
    },
    move(p) {
      if (!this.path) return;
      const last = this.path[this.path.length - 1]; this.path.push(p);
      for (const e of app.ents()) if (!this.done.has(e.id) && isLive(app.doc, e) && crossesSeg(e, last, p)) this.done.add(e.id);
    },
    up() {
      const ids = [...this.done]; this.path = null; this.done = new Set();
      if (ids.length) { const patch = this.patch(); app.edit(_t('Pędzel'), tx => ids.forEach(id => tx.set(id, patch))); }
    },
    highlight() { return this.done; },
    cancel() { if (this.path) { this.path = null; this.done = new Set(); return true; } if (this.picking) { this.picking = false; app.refreshUi(); return true; } return false; },
    enter: () => false, typed: () => false, preview: () => []
  };

  /* ---------- linia (A): ciąg osobnych odcinków ---------- */
  T.line = {
    id: 'line', draw: true, pts: [], cur: null,
    base() { return this.pts.length ? this.pts[this.pts.length - 1] : null; },
    label: () => _t('Długość'),
    reading() { const b = this.base(); return b && this.cur ? fmtLength(V.dist(b, this.cur)) : null; },
    hint() { return this.pts.length ? _t`<b>Linia:</b> kliknij następny punkt albo wpisz długość. Esc kończy, ${app.shiftName} trzyma kierunek.` : _t('<b>Linia:</b> kliknij punkt początkowy.'); },
    // cofanie w trakcie: sam punkt startowy znika bez cofania rysunku; z odcinkiem — punkt wraca razem z cofnięciem odcinka
    undoInTool() { if (this.pts.length === 1) { this.pts = []; return true; } if (this.pts.length > 1) this.pts.pop(); return false; },
    down(p) { this.addPt(p); },
    addPt(p) {
      const b = this.base();
      if (b && V.dist(b, p) < 1e-9) return;
      if (b) app.edit(_t('Linia'), tx => tx.add({ t: 'line', a: b, b: p }));
      this.pts.push([...p]);
    },
    move(p) { this.cur = p; },
    typed(s) { const b = this.base(), v = parseLength(s); if (!b || !(v > 0)) return false; this.addPt(V.add(b, V.mul(dirOf(b, this.cur || V.add(b, [1, 0])), v))); return true; },
    preview() { const b = this.base(); return b && this.cur ? [{ t: 'line', a: b, b: this.cur, ...app.newStroke() }] : []; },
    enter() { if (this.pts.length) { this.pts = []; return true; } return false; },
    cancel() { return this.enter(); }
  };

  /* ---------- polilinia (F): jeden element ---------- */
  T.pline = {
    id: 'pline', draw: true, pts: [], cur: null,
    base() { return this.pts.length ? this.pts[this.pts.length - 1] : null; },
    label: () => _t('Długość'),
    reading() { const b = this.base(); return b && this.cur ? fmtLength(V.dist(b, this.cur)) : null; },
    hint() { return this.pts.length ? _t`<b>Polilinia:</b> następny punkt albo długość. Klik w pierwszy punkt zamyka, Enter kończy, ${app.bsName} cofa punkt.` : _t('<b>Polilinia:</b> kliknij punkt początkowy.'); },
    undoInTool() { return this.backspace(); },
    down(p) {
      if (this.pts.length > 2 && V.dist(p, this.pts[0]) <= app.tol()) return this.finish(true);
      if (this.pts.length && V.dist(this.base(), p) < 1e-9) return;
      this.pts.push([...p]);
    },
    move(p) { this.cur = p; },
    typed(s) { const b = this.base(), v = parseLength(s); if (!b || !(v > 0)) return false; this.pts.push(V.add(b, V.mul(dirOf(b, this.cur || V.add(b, [1, 0])), v))); return true; },
    backspace() { if (this.pts.length) { this.pts.pop(); return true; } return false; },
    finish(closed = false) {
      const pts = this.pts; this.pts = [];
      if (pts.length >= 2) app.edit(_t('Polilinia'), tx => tx.add({ t: 'pline', pts, closed: closed && pts.length > 2 }));
      return true;
    },
    preview() { const pts = this.cur && this.pts.length ? [...this.pts, this.cur] : this.pts; return pts.length > 1 ? [{ t: 'pline', pts, closed: false, ...app.newStroke() }] : []; },
    // już wskazane punkty i odcinki rysowanej polilinii też przyciągają (koniec, środek, przecięcie, kierunki)
    snapEnts() { return this.pts.length > 1 ? [{ t: 'pline', id: -1, pts: this.pts, closed: false }] : []; },
    enter() { return this.pts.length ? this.finish(false) : false; },
    cancel() { return this.enter(); }
  };

  /* ---------- prostokąt (D) ---------- */
  T.rect = {
    id: 'rect', draw: true, a: null, cur: null,
    base() { return this.a; },
    label: () => _t('Wymiary'),
    reading() { if (!this.a || !this.cur) return null; return fmtNum(Math.abs(this.cur[0] - this.a[0])) + '; ' + fmtNum(Math.abs(this.cur[1] - this.a[1])); },
    hint() { return this.a ? _t('<b>Prostokąt:</b> kliknij drugi narożnik albo wpisz szerokość;wysokość (np. 6;4).') : _t('<b>Prostokąt:</b> kliknij pierwszy narożnik.'); },
    pts(a, b) { return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]]; },
    down(p) { if (!this.a) { this.a = [...p]; return; } this.make(p); },
    make(b) { const a = this.a; this.a = null; if (Math.abs(b[0] - a[0]) < 1e-9 || Math.abs(b[1] - a[1]) < 1e-9) return; app.edit(_t('Prostokąt'), tx => tx.add({ t: 'pline', pts: this.pts(a, b), closed: true })); },
    move(p) { this.cur = p; },
    typed(s) {
      if (!this.a) return false;
      const v = parseLengths(s); if (!v || !(v[0] > 0)) return false;
      const w = v[0], h = v.length > 1 ? v[1] : v[0];
      if (!(h > 0)) return false;
      const sx = this.cur && this.cur[0] < this.a[0] ? -1 : 1, sy = this.cur && this.cur[1] < this.a[1] ? -1 : 1;
      this.make([this.a[0] + sx * w, this.a[1] + sy * h]); return true;
    },
    preview() { return this.a && this.cur ? [{ t: 'pline', pts: this.pts(this.a, this.cur), closed: true, ...app.newStroke() }] : []; },
    enter: () => false,
    undoInTool() { return this.cancel(); },
    cancel() { if (this.a) { this.a = null; return true; } return false; }
  };

  /* ---------- okrąg (V) ---------- */
  T.circle = {
    id: 'circle', draw: true, c: null, cur: null,
    base() { return this.c; },
    label: () => _t('Promień'),
    reading() { return this.c && this.cur ? fmtLength(V.dist(this.c, this.cur)) : null; },
    hint() { return this.c ? _t('<b>Okrąg:</b> kliknij punkt na obwodzie albo wpisz promień.') : _t('<b>Okrąg:</b> kliknij środek.'); },
    down(p) { if (!this.c) { this.c = [...p]; return; } this.make(V.dist(this.c, p)); },
    make(r) { const c = this.c; this.c = null; if (r > 1e-9) app.edit(_t('Okrąg'), tx => tx.add({ t: 'circle', c, r })); },
    move(p) { this.cur = p; },
    typed(s) { const v = parseLength(s); if (!this.c || !(v > 0)) return false; this.make(v); return true; },
    preview() { return this.c && this.cur && V.dist(this.c, this.cur) > 1e-9 ? [{ t: 'circle', c: this.c, r: V.dist(this.c, this.cur), ...app.newStroke() }] : []; },
    enter: () => false,
    undoInTool() { return this.cancel(); },
    cancel() { if (this.c) { this.c = null; return true; } return false; }
  };

  /* ---------- łuk (B): przez trzy punkty; ⇧B albo drugie B — ze środka ---------- */
  T.arc = {
    id: 'arc', draw: true, mode: '3p', pts: [], cur: null,
    base() { return this.mode === 'c' ? (this.pts[0] || null) : (this.pts[this.pts.length - 1] || null); },
    label() { return this.mode === 'c' ? (this.pts.length < 2 ? _t('Promień') : _t('Kąt')) : null; },
    reading() {
      if (this.mode !== 'c' || !this.cur || !this.pts.length) return null;
      if (this.pts.length === 1) return fmtLength(V.dist(this.pts[0], this.cur));
      const a = arcCSE(this.pts[0], this.pts[1], this.cur); return a ? fmtDeg(sweep(a.a0, a.a1)) : null;
    },
    hint() {
      const sw = _t`${app.againName('arc')} jeszcze raz zmienia sposób.`;
      if (this.mode === 'c') return [_t('<b>Łuk ze środka:</b> kliknij środek.'), _t('<b>Łuk ze środka:</b> kliknij początek albo wpisz promień.'), _t('<b>Łuk ze środka:</b> kliknij koniec albo wpisz kąt w stopniach (ujemny — zgodnie ze wskazówkami zegara).')][this.pts.length] + ' ' + sw;
      return [_t('<b>Łuk przez trzy punkty:</b> kliknij początek.'), _t('<b>Łuk przez trzy punkty:</b> kliknij punkt na łuku.'), _t('<b>Łuk przez trzy punkty:</b> kliknij koniec.')][this.pts.length] + ' ' + sw;
    },
    badge() { return this.mode === 'c' ? _t('Łuk ze środka') : _t('Łuk przez trzy punkty'); },
    toggle() { this.mode = this.mode === 'c' ? '3p' : 'c'; this.pts = []; },
    down(p) {
      if (this.pts.length && V.dist(this.pts[this.pts.length - 1], p) < 1e-9) return;
      this.pts.push([...p]);
      if (this.pts.length === 3) this.make(this.build(this.pts[2]));
    },
    build(p3) {
      if (this.mode === 'c') return this.pts.length >= 2 ? arcCSE(this.pts[0], this.pts[1], p3) : null;
      return this.pts.length >= 2 ? arc3(this.pts[0], this.pts[1], p3) : null;
    },
    make(a) { this.pts = []; if (a && a.r > 1e-9) app.edit(_t('Łuk'), tx => tx.add({ t: 'arc', ...a })); },
    move(p) { this.cur = p; },
    typed(s) {
      if (this.mode !== 'c' || !this.pts.length) return false;
      if (this.pts.length === 1) { const r = parseLength(s); if (!(r > 0)) return false; this.pts.push(V.add(this.pts[0], V.mul(dirOf(this.pts[0], this.cur || V.add(this.pts[0], [1, 0])), r))); return true; }
      const d = parseFloat(String(s).replace(',', '.').replace('°', '')); if (!isFinite(d) || Math.abs(d) < 1e-9) return false;
      const c = this.pts[0], r = V.dist(c, this.pts[1]), a0 = angOf(c, this.pts[1]), a1 = a0 + d * Math.PI / 180;
      if (Math.abs(d) >= 360 - 1e-9) { this.pts = []; if (r > 1e-9) app.edit(_t('Okrąg'), tx => tx.add({ t: 'circle', c: [...c], r })); return true; }   // pełny obrót — okrąg
      this.make(d > 0 ? { c, r, a0, a1: ((a1 % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) } : { c, r, a0: ((a1 % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), a1: a0 });
      return true;
    },
    preview() {
      if (!this.cur || !this.pts.length) return [];
      const st = app.newStroke();
      if (this.pts.length === 1) return this.mode === 'c' ? [{ t: 'line', a: this.pts[0], b: this.cur, ...st, _ghost: true }] : [{ t: 'line', a: this.pts[0], b: this.cur, ...st, _ghost: true }];
      const a = this.build(this.cur);
      const out = a ? [{ t: 'arc', ...a, ...st }] : [{ t: 'line', a: this.pts[0], b: this.cur, ...st }];
      if (this.mode === 'c') out.push({ t: 'line', a: this.pts[0], b: this.pts[1], ...st, _ghost: true });
      return out;
    },
    enter: () => false,
    undoInTool() { return this.cancel(); },
    cancel() { if (this.pts.length) { this.pts = []; return true; } return false; }
  };

  /* ---------- przesuń (W) i kopiuj (C) ---------- */
  const mover = (id, copyDefault) => ({
    id, draw: true, from: null, cur: null, copy: copyDefault, count: 0,
    base() { return this.from; },
    label() { return app.sel.size ? _t('Odległość') : null; },
    reading() { return this.from && this.cur ? fmtLength(V.dist(this.from, this.cur)) : null; },
    isCopy(e) { return copyDefault || app.altKey(e); },
    hint() {
      const what = copyDefault ? _t('Kopiuj') : _t('Przesuń');
      if (!app.sel.size) return _t`<b>${what}:</b> najpierw zaznacz elementy (Q) albo kliknij element.`;
      if (!this.from) return _t`<b>${what}:</b> kliknij punkt bazowy.`;
      return copyDefault ? _t('<b>Kopiuj:</b> kliknij miejsce kopii albo wpisz odległość. Kolejne kliknięcia — kolejne kopie, Esc kończy.') : _t`<b>Przesuń:</b> kliknij miejsce docelowe albo wpisz odległość. ${app.altName} + klik — kopia.`;
    },
    start() { this.from = null; this.count = 0; },
    down(p, e) {
      if (!app.sel.size) { const s = app.pick(p); if (s) { app.sel.add(s.id); app.selectionChanged(); } return; }
      if (!this.from) { this.from = [...p]; return; }
      this.apply(V.sub(p, this.from), this.isCopy(e));
    },
    apply(d, copy) {
      if (V.len(d) < 1e-12) return;
      const ents = app.ents().filter(e => app.sel.has(e.id) && isLive(app.doc, e));
      if (copy) {
        const made = app.edit(_t('Kopiuj'), tx => ents.map(e => { const n = { ...e, ...moved(e, d) }; delete n.id; return tx.add(n); }));
        this.count++;
        if (!copyDefault) { this.from = null; app.sel.clear(); made.forEach(e => app.sel.add(e.id)); app.selectionChanged(); }
      } else {
        app.edit(_t('Przesuń'), tx => ents.forEach(e => tx.set(e.id, moved(e, d))));
        this.from = null;
      }
    },
    move(p) { this.cur = p; },
    typed(s, e) { const v = parseLength(s); if (!this.from || !(v > 0)) return false; this.apply(V.mul(dirOf(this.from, this.cur || V.add(this.from, [1, 0])), v), this.isCopy(e)); return true; },
    preview() {
      if (!this.from || !this.cur) return [];
      const d = V.sub(this.cur, this.from);
      return [{ t: 'line', a: this.from, b: this.cur, w: 0.13, lt: 'dash', layer: app.doc.cur.layer, _ghost: true },
        ...app.ents().filter(e => app.sel.has(e.id)).slice(0, 2000).map(e => ({ ...e, ...moved(e, d), _ghost: true }))];
    },
    enter() { if (this.from) { this.from = null; return true; } return false; },
    undoInTool() { return this.cancel(); },
    cancel() { if (this.from) { this.from = null; return true; } return false; }
  });
  T.move = mover('move', false);
  T.copy = mover('copy', true);

  /* ---------- wklej ze schowka (⌘V / Ctrl+V) — kopia trzyma się kursora lewym dolnym rogiem ---------- */
  T.paste = {
    id: 'paste', draw: true, clip: null, k: 1, base0: [0, 0], at: null,
    set(clip, k) { this.clip = clip; this.k = k; this.base0 = clipBase(clip, k); this.at = null; },
    base: () => null, label: () => null, reading: () => null, badge: () => _t('Wklej'),
    hint() { return _t('<b>Wklej:</b> kliknij miejsce — kopia trzyma się kursora lewym dolnym rogiem (przyciąganie działa). Esc rezygnuje.'); },
    down(p) {
      if (!this.clip) return;
      const d = V.sub(p, this.base0), toSheet = !!app.sheet();
      const forbid = b => !!app.blockEdit && contains(b, app.blockEdit.id);
      const r = app.edit(_t('Wklej'), tx => pasteClip(tx, app.doc, this.clip, { k: this.k, d, toSheet, forbid }));
      // zaznaczamy tylko to, co da się zmieniać — warstwa o tej samej nazwie może być tu ukryta albo zablokowana
      app.sel.clear(); for (const e of r.made) if (isLive(app.doc, e)) app.sel.add(e.id);
      const off = r.made.filter(e => !isLive(app.doc, e)).length;
      if (r.skipped) app.toast(_t`Pominięto ${r.skipped} el., których nie da się tu wkleić (okno arkusza poza arkuszem, blok na arkuszu albo blok w samym sobie).`, 3200);
      else if (off) app.toast(_t`Wklejono, ale ${off} el. leży na ukrytej albo zablokowanej warstwie — włącz ją w warstwach.`, 3200);
      this.clip = null; app.setTool('select');
    },
    move(p) { this.at = p; },
    typed: () => false,
    preview() { return this.clip && this.at ? clipGhosts(this.clip, this.k, V.sub(this.at, this.base0)).map(e => ({ ...e, layer: app.doc.cur.layer, _ghost: true })) : []; },
    enter: () => false,
    cancel() { if (this.clip) { this.clip = null; app.setTool('select'); return true; } return false; }
  };

  /* ---------- obróć (E), odbij (⇧E), skaluj (R) ---------- */
  // wspólne: zaznaczenie (albo klik w element), punkt bazowy, potem kąt / oś / skala; ⌥ (Ctrl w Windows) — kopia
  const selEnts = () => app.ents().filter(e => app.sel.has(e.id) && isLive(app.doc, e) && e.t !== 'vp');
  function applyT(label, T, copy) {
    const ents = selEnts(); if (!ents.length) return;
    if (copy) {
      const made = app.edit(label, tx => ents.map(e => { const f = transformed(e, T); if (!f) return null; const n = { ...e, ...f }; delete n.id; return tx.add(n); }).filter(Boolean));
      app.sel.clear(); made.forEach(e => app.sel.add(e.id)); app.selectionChanged();
    } else app.edit(label, tx => ents.forEach(e => { const f = transformed(e, T); if (f) tx.set(e.id, f); }));
  }
  const ghosts = T => selEnts().slice(0, 2000).map(e => { const f = transformed(e, T); return f ? { ...e, ...f, _ghost: true } : null; }).filter(Boolean);
  const needSel = (p) => { if (app.sel.size) return false; const s = app.pick(p); if (s) { app.sel.add(s.id); app.selectionChanged(); } return true; };
  const refLine = (a, b) => ({ t: 'line', a, b, w: 0.13, lt: 'dash', layer: app.doc.cur.layer, _ghost: true });

  T.rotate = {
    id: 'rotate', draw: true, o: null, cur: null,
    base() { return this.o; }, label() { return this.o ? _t('Kąt') : null; },
    angle() { return this.o && this.cur && V.dist(this.o, this.cur) > 1e-12 ? Math.atan2(this.cur[1] - this.o[1], this.cur[0] - this.o[0]) : 0; },
    reading() { return this.o && this.cur ? fmtDeg(this.angle()) : null; },
    hint() {
      if (!app.sel.size) return _t('<b>Obróć:</b> najpierw zaznacz elementy (Q) albo kliknij element.');
      return this.o ? _t`<b>Obróć:</b> kliknij kierunek albo wpisz kąt w stopniach (od poziomu, przeciwnie do wskazówek zegara). ${app.altName} + klik albo ${app.altName} + Enter — kopia.` : _t('<b>Obróć:</b> kliknij punkt obrotu.');
    },
    start() { this.o = null; },
    down(p, e) { if (needSel(p)) return; if (!this.o) { this.o = [...p]; return; } if (V.dist(p, this.o) < 1e-9) return; applyT(_t('Obróć'), rotation(this.o, this.angle()), app.altKey(e)); this.o = null; },
    move(p) { this.cur = p; },
    typed(s, e) { const d = parseFloat(String(s).replace(',', '.').replace('°', '')); if (!this.o || !isFinite(d)) return false; applyT(_t('Obróć'), rotation(this.o, d * Math.PI / 180), app.altKey(e)); this.o = null; return true; },
    preview() { return this.o && this.cur ? [refLine(this.o, this.cur), ...ghosts(rotation(this.o, this.angle()))] : []; },
    enter: () => false, cancel() { if (this.o) { this.o = null; return true; } return false; }
  };
  T.mirror = {
    id: 'mirror', draw: true, a: null, cur: null,
    base() { return this.a; }, label: () => null, reading: () => null,
    hint() {
      if (!app.sel.size) return _t('<b>Odbij:</b> najpierw zaznacz elementy (Q) albo kliknij element.');
      return this.a ? _t`<b>Odbij:</b> kliknij drugi punkt osi. ${app.altName} + klik — zostaw oryginał.` : _t('<b>Odbij:</b> kliknij pierwszy punkt osi odbicia.');
    },
    start() { this.a = null; },
    down(p, e) { if (needSel(p)) return; if (!this.a) { this.a = [...p]; return; } if (V.dist(this.a, p) < 1e-9) return; applyT(_t('Odbij'), mirroring(this.a, p), app.altKey(e)); this.a = null; },
    move(p) { this.cur = p; }, typed: () => false,
    preview() { return this.a && this.cur && V.dist(this.a, this.cur) > 1e-9 ? [refLine(this.a, this.cur), ...ghosts(mirroring(this.a, this.cur))] : []; },
    enter: () => false, cancel() { if (this.a) { this.a = null; return true; } return false; }
  };
  T.scale = {
    id: 'scale', draw: true, o: null, ref: null, cur: null,
    base() { return this.ref || this.o; }, label() { return this.o ? _t('Skala') : null; },
    factor() { return this.o && this.ref && this.cur ? V.dist(this.o, this.cur) / Math.max(V.dist(this.o, this.ref), 1e-12) : 1; },
    reading() { return this.ref && this.cur ? '×' + this.factor().toFixed(3).replace('.', DEC) : null; },
    hint() {
      if (!app.sel.size) return _t('<b>Skaluj:</b> najpierw zaznacz elementy (Q) albo kliknij element.');
      if (!this.o) return _t('<b>Skaluj:</b> kliknij punkt bazowy.');
      return this.ref ? _t`<b>Skaluj:</b> kliknij nowe położenie punktu albo wpisz skalę (np. 2 albo 0,5). ${app.altName} + klik albo ${app.altName} + Enter — kopia.` : _t('<b>Skaluj:</b> wpisz skalę (np. 2 albo 0,5) albo kliknij punkt odniesienia.');
    },
    start() { this.o = this.ref = null; },
    down(p, e) {
      if (needSel(p)) return;
      if (!this.o) { this.o = [...p]; return; }
      if (!this.ref) { if (V.dist(p, this.o) > 1e-9) this.ref = [...p]; return; }
      const k = this.factor(); if (k > 1e-9) applyT(_t('Skaluj'), scaling(this.o, k), app.altKey(e)); this.o = this.ref = null;
    },
    move(p) { this.cur = p; },
    typed(s, e) { const k = parseFloat(String(s).replace(',', '.')); if (!this.o || !(k > 0)) return false; applyT(_t('Skaluj'), scaling(this.o, k), app.altKey(e)); this.o = this.ref = null; return true; },
    preview() { return this.ref && this.cur ? [refLine(this.o, this.cur), ...ghosts(scaling(this.o, this.factor()))] : []; },
    enter: () => false, cancel() { if (this.ref) { this.ref = null; return true; } if (this.o) { this.o = null; return true; } return false; }
  };

  /* ---------- odsunięcie (T) ---------- */
  T.offset = {
    id: 'offset', draw: false, src: null, cur: null, d: 0.5, typeAnytime: true,
    base: () => null, label() { return _t('Odległość'); }, reading() { return fmtLength(this.d); },
    hint() { return this.src ? _t('<b>Odsunięcie:</b> kliknij, po której stronie ma powstać kopia. Wpisz odległość, żeby ją zmienić.') : _t`<b>Odsunięcie:</b> kliknij linię, łuk, okrąg albo polilinię. Odległość: ${fmtLength(this.d)} — wpisz, żeby zmienić.`; },
    start() { this.src = null; this.cur = null; },
    leave() { this.cur = null; },
    down(p) {
      if (!this.src) { const s = app.pick(p); if (s && ['line', 'arc', 'circle', 'pline'].includes(s.t)) this.src = s; else if (s) app.toast(_t('Odsunięcie działa na liniach, łukach, okręgach i poliliniach.')); return; }
      const r = offsetEnt(this.src, this.d, p);
      if (r.error) { app.toast(r.error === 'tooBig' ? _t('Za duża odległość — kształt by się zapadł.') : _t('Nie da się odsunąć tego elementu.')); return; }
      const src = this.src;
      app.edit(_t('Odsunięcie'), tx => tx.add({ ...r, layer: src.layer, w: src.w, lt: src.lt }));
      this.src = null;
    },
    move(p) { this.cur = p; },
    typed(s) { const v = parseLength(s); if (!(v > 0)) return false; this.d = v; return true; },
    highlight() { return this.src ? new Set([this.src.id]) : new Set(); },
    // kopia po stronie kursora — po wskazaniu elementu i już wcześniej, dla elementu pod kursorem
    preview() {
      if (!this.cur) return [];
      const h = this.src ? null : app.pick(this.cur), src = this.src || (h && ['line', 'arc', 'circle', 'pline'].includes(h.t) ? h : null);
      if (!src) return [];
      const r = offsetEnt(src, this.d, this.cur); return r.error ? [] : [{ ...r, _dash: true }];
    },
    enter: () => false, cancel() { if (this.src) { this.src = null; return true; } return false; }
  };

  /* ---------- zaokrąglij narożnik (G) ---------- */
  T.fillet = {
    id: 'fillet', draw: false, first: null, r: 0, typeAnytime: true, mode: 'fillet', d1: 0.1, d2: 0.1,
    base: () => null,
    label() { return this.mode === 'chamfer' ? _t('Odległość') : _t('Promień'); },
    reading() { return this.mode === 'chamfer' ? this.dText() : fmtLength(this.r); },
    dText() { return Math.abs(this.d1 - this.d2) < 1e-12 ? fmtLength(this.d1) : fmtLength(this.d1) + '; ' + fmtLength(this.d2); },
    // drugie naciśnięcie G: zaokrąglanie ↔ fazowanie
    toggle() { this.mode = this.mode === 'chamfer' ? 'fillet' : 'chamfer'; this.first = null; },
    badge() { return this.mode === 'chamfer' ? _t('Fazuj') : _t('Zaokrąglij'); },
    hint() {
      if (this.mode === 'chamfer') return this.first ? _t('<b>Fazuj:</b> kliknij drugą linię (po stronie, która ma zostać).') : _t`<b>Fazuj:</b> kliknij pierwszą linię — albo polilinię blisko narożnika. Odległość ${this.dText()} — wpisz, żeby zmienić (dwie po średniku: 0,3;0,5). ${app.againName('fillet')} jeszcze raz — zaokrąglanie.`;
      return this.first ? _t('<b>Zaokrąglij:</b> kliknij drugi element (po stronie, która ma zostać).') : _t`<b>Zaokrąglij:</b> kliknij pierwszą linię albo łuk — albo polilinię blisko narożnika. Promień ${fmtLength(this.r)} — wpisz, żeby zmienić (0 — ostry narożnik).`; },
    start() { this.first = null; this.pv = []; this.hl = null; this.nt = null; },
    down(p) {
      this.pv = []; this.hl = null; this.nt = null;
      const s = app.pick(p); if (!s) return;
      const err = c => app.toast({ parallel: _t('Te elementy nie mają narożnika (są równoległe albo się nie spotkają).'), tooBig: _t('Promień jest za duży dla tego narożnika.'), noCorner: _t('Tu polilinia nie ma narożnika — kliknij blisko wierzchołka.'), far: _t('Kliknij bliżej narożnika, który ma się zaokrąglić.'), arcCorner: _t('Ten narożnik polilinii jest na łuku — zaokrągla się narożniki między prostymi odcinkami.'), zero: _t('Promień 0 — narożnik polilinii jest już ostry.') }[c] || _t('Tego narożnika nie da się zaokrąglić.'));
      if (this.mode === 'chamfer') {
        const errC = c => app.toast({ parallel: _t('Linie są równoległe — nie mają narożnika.'), tooBig: _t('Odległość jest za duża dla tego narożnika.'), noCorner: _t('Tu polilinia nie ma narożnika — kliknij blisko wierzchołka.'), far: _t('Kliknij bliżej narożnika, który ma się sfazować.'), arcCorner: _t('Ten narożnik polilinii jest na łuku — fazuje się narożniki między prostymi odcinkami.'), zero: _t('Odległość 0 — narożnik zostaje ostry.') }[c] || _t('Tego narożnika nie da się sfazować.'));
        if (!this.first && s.t === 'pline') { const r = plineCorner(s, p, 'chamfer', this.d1, this.d2, 20 / app.view.ppm); if (r.error) return errC(r.error); app.edit(_t('Fazuj'), tx => tx.set(s.id, { pts: r.pts })); return; }
        if (s.t !== 'line') { app.toast(_t('Fazuje się linie i narożniki polilinii.')); return; }
        if (!this.first) { this.first = { e: s, p: [...p] }; return; }
        if (s.id === this.first.e.id) return;
        const f = this.first; this.first = null;
        const r = chamferLines(f.e, f.p, s, p, this.d1, this.d2);
        if (r.error) return errC(r.error);
        app.edit(_t('Fazuj'), tx => { tx.set(f.e.id, r.l1); tx.set(s.id, r.l2); if (r.line) tx.add({ ...r.line, layer: f.e.layer, w: f.e.w, lt: f.e.lt }); });
        return;
      }
      // polilinia: jedno kliknięcie zaokrągla najbliższy wierzchołek
      if (!this.first && s.t === 'pline') { const r = plineCorner(s, p, 'fillet', this.r, this.r, 20 / app.view.ppm); if (r.error) return err(r.error); app.edit(_t('Zaokrąglij'), tx => tx.set(s.id, { pts: r.pts })); return; }
      if (!['line', 'arc', 'circle'].includes(s.t)) { app.toast(_t('Zaokrągla się linie, łuki, okręgi i narożniki polilinii.')); return; }
      if (!this.first) { this.first = { e: s, p: [...p] }; return; }
      if (s.id === this.first.e.id) return;
      const f = this.first; this.first = null;
      const r = filletCurves(f.e, f.p, s, p, this.r);
      if (r.error) return err(r.error);
      app.edit(_t('Zaokrąglij'), tx => { tx.set(f.e.id, r.l1); tx.set(s.id, r.l2); if (r.arc) tx.add({ ...r.arc, layer: f.e.layer, w: f.e.w, lt: f.e.lt }); });
    },
    move(p) { this.cur = p; },
    // podgląd wyniku pod kursorem: po pierwszym kliknięciu — narożnik z elementem pod kursorem; bez niego — narożnik polilinii.
    // Podświetlają się tylko krawędzie, które się zmienią; nowy łuk / ścięcie w kolorze zaznaczenia, odcinany róg — przerywany.
    calc(p) {
      this.pv = []; this.hl = null; this.nt = null;
      const s = app.pick(p); if (!s) return;
      const ch = this.mode === 'chamfer', st = e => ({ layer: e.layer, w: e.w, lt: e.lt });
      try {
        if (!this.first) {
          if (s.t !== 'pline') return;
          const r = ch ? plineCorner(s, p, 'chamfer', this.d1, this.d2, 20 / app.view.ppm) : plineCorner(s, p, 'fillet', this.r, this.r, 20 / app.view.ppm);
          this.hl = [];
          if (r.error) { if (r.error === 'far') this.nt = _t('Bliżej narożnika'); return; }
          const mid = r.bulge ? { t: 'pline', pts: [[...r.T1, r.bulge], [...r.T2]], closed: false } : { t: 'line', a: r.T1, b: r.T2 };
          this.pv = [{ ...s, pts: r.pts, _replaces: s.id }, { ...mid, ...st(s), _sel: true }, { t: 'pline', pts: [r.T1, r.vertex, r.T2], closed: false, _gone: true }];
          this.hl = [{ t: 'line', a: r.A, b: r.vertex }, { t: 'line', a: r.vertex, b: r.B }];
          return;
        }
        const f = this.first; if (s.id === f.e.id) return;
        if (ch ? s.t !== 'line' : !['line', 'arc', 'circle'].includes(s.t)) return;
        const r = ch ? chamferLines(f.e, f.p, s, p, this.d1, this.d2) : filletCurves(f.e, f.p, s, p, this.r);
        if (r.error) return;
        const extra = r.arc ? [{ ...r.arc, ...st(f.e), _sel: true }] : r.line ? [{ ...r.line, ...st(f.e), _sel: true }] : [];
        // oba elementy po zmianie zwykłą kreską (zamiast oryginałów), nowy łuk / odcinek w kolorze zaznaczenia; poświata na obu
        // odcinane końce linii — czerwoną przerywaną, jak róg polilinii
        const cut = (o, n) => o.t !== 'line' ? [] : ['a', 'b'].filter(k => n[k] && !V.eq(n[k], o[k], 1e-9) && V.dot(V.sub(n[k], o.a), V.sub(n[k], o.b)) < 0).map(k => ({ t: 'line', a: n[k], b: o[k], _gone: true }));
        this.pv = [{ ...f.e, ...r.l1, _replaces: f.e.id }, { ...s, ...r.l2, _replaces: s.id }, ...extra, ...cut(f.e, r.l1), ...cut(s, r.l2)];
        this.hl = [f.e, s];
      } catch (err) { this.pv = []; this.hl = null; }
    },
    preview() { if (!this.cur) return []; this.calc(this.cur); return this.pv; },   // liczone przy każdej klatce: wpisany promień i zmiana trybu widać od razu
    halo() { return this.cur ? this.hl : null; },
    leave() { this.cur = null; },
    note() { return this.cur ? this.nt : null; },
    // pierwszy wskazany element rysuje się jak zaznaczony
    picked() { return this.first ? [this.first.e.id] : []; },
    typed(s) {
      if (this.mode === 'chamfer') { const v = parseLengths(s); if (!v || !v.length || v.length > 2 || v.some(x => !(x >= 0))) return false; this.d1 = v[0]; this.d2 = v[1] ?? v[0]; return true; }
      const v = parseLength(s); if (!(v >= 0)) return false; this.r = v; return true;
    },
    highlight() { return new Set(); },
    enter: () => false, cancel() { if (this.first) { this.first = null; return true; } return false; }
  };

  // podgląd wyniku przycinania / wydłużania: res — wynik trimMany
  const entById = id => app.doc.ents.find(x => x.id === id);
  const stOf = e => ({ layer: e.layer, w: e.w, lt: e.lt });
  // przedłużenie: od starego do nowego końca
  const extension = (e, set) => {
    if (e.t === 'line') return set.b ? { t: 'line', a: e.b, b: set.b } : set.a ? { t: 'line', a: set.a, b: e.a } : null;
    if (e.t === 'arc') return set.a1 !== undefined ? { t: 'arc', c: e.c, r: e.r, a0: e.a1, a1: set.a1 } : { t: 'arc', c: e.c, r: e.r, a0: set.a0, a1: e.a0 };
    if (e.t === 'pline' && set.pts) {
      const n = e.pts.length, last = !V.eq(e.pts[n - 1], set.pts[n - 1], 1e-12);
      return last ? { t: 'line', a: e.pts[n - 1].slice(0, 2), b: set.pts[n - 1].slice(0, 2) } : { t: 'line', a: set.pts[0].slice(0, 2), b: e.pts[0].slice(0, 2) };
    }
    return null;
  };
  // wydłużany koniec: połowa linii, skrajny odcinek polilinii, cały łuk
  const extEnd = (e, set) => {
    if (e.t === 'line') { const m = V.lerp(e.a, e.b, 0.5); return set.b ? { t: 'line', a: m, b: e.b } : { t: 'line', a: e.a, b: m }; }
    if (e.t === 'pline' && set.pts) { const n = e.pts.length, last = !V.eq(e.pts[n - 1], set.pts[n - 1], 1e-12); return last ? { t: 'line', a: e.pts[n - 2], b: e.pts[n - 1] } : { t: 'line', a: e.pts[0], b: e.pts[1] }; }
    return e;
  };
  function changePreview(res) {
    const out = [];
    for (const r of res) {
      const e = entById(r.id); if (!e) continue;
      if (r.kind === 'trim') {
        if (!r.gone) out.push({ ...e, _replaces: e.id, _gone: true });
        for (const g of r.gone || []) out.push({ ...g, _replaces: e.id, _gone: true });
        for (const n of r.replace) out.push({ ...n, ...stOf(e), _replaces: e.id });
      } else {
        // element zostaje jak jest, przedłużenie przerywaną (bez niego — podgląd całego wydłużonego elementu)
        const x = extension(e, r.set); out.push(x ? { ...x, _dash: true } : { ...e, ...r.set, _replaces: e.id });
      }
    }
    return out;
  }
  function changeHalo(res) {
    const out = [];
    for (const r of res) { const e = entById(r.id); if (!e) continue; if (r.kind === 'trim') out.push(...(r.gone || [e])); else out.push(extEnd(e, r.set)); }
    return out;
  }

  /* ---------- przytnij (X) i wydłuż (⇧X): klik albo przeciągnięcie przez kilka kawałków, jak gumka ---------- */
  const CUTS = ['line', 'arc', 'circle', 'pline'];
  T.trim = {
    id: 'trim', draw: false, path: null, hits: [], marked: new Set(), mode: 'trim', hov: null, hp: null,
    base: () => null, label: () => null, reading: () => null,
    hint() {
      return this.mode === 'extend' ? _t('<b>Wydłuż:</b> kliknij linię blisko końca albo przeciągnij przez końce kilku — dosuną się do najbliższego elementu.')
        : _t('<b>Przytnij:</b> kliknij kawałek między przecięciami albo przeciągnij przez kilka — znikną wszystkie przecięte kawałki.');
    },
    // wynik dla trafień (bez zmiany rysunku) — do podglądu i do wykonania
    result(hits) {
      if (!hits.length) return [];
      let others = app.ents().filter(o => isShown(app.doc, o) && !['text', 'vp'].includes(o.t));
      // przycinanie potrzebuje tylko elementów, które mogą przeciąć trafione (obrysy się stykają) — szybko także przy dużym podkładzie
      if (this.mode === 'trim') { const bs = hits.map(h => boxGrow(bbox(h.e), 1e-6)); others = others.filter(o => { const b = bbox(o); return bs.some(x => boxHit(x, b)); }); }
      return trimMany(hits, others, this.mode, 14 / app.view.ppm);
    },
    start() { this.hp = null; this.hov = null; },
    leave() { if (!this.path) { this.hp = null; this.hov = null; } },
    down(p) {
      this.path = [p]; this.hits = []; this.marked = new Set();
      const e = app.pick(p);
      if (e && CUTS.includes(e.t)) { this.hits.push({ e, p }); this.marked.add(e.id); }
      else if (e) app.toast(_t('Przycinać i wydłużać można linie, łuki, okręgi i polilinie.'));
    },
    move(p) {
      // bez przeciągania: podgląd tego, co zrobi kliknięcie w element pod kursorem
      if (!this.path) { this.hp = p; return; }
      const last = this.path[this.path.length - 1]; this.path.push(p);
      const seg = { t: 'line', a: last, b: p };
      for (const e of app.ents()) {
        if (!CUTS.includes(e.t) || !isLive(app.doc, e)) continue;
        for (const x of intersect(e, seg)) { this.hits.push({ e, p: x }); this.marked.add(e.id); }
      }
    },
    up() {
      const hits = this.hits; this.path = null; this.hits = []; this.marked = new Set(); this.hov = null;
      if (!hits.length) return;
      const res = this.result(hits);
      if (!res.length) {
        app.toast(this.mode === 'extend' ? _t('Nic do wydłużenia — na przedłużeniu nie ma żadnego elementu.') : this.mode === 'trim' ? _t('Nic do przycięcia — brak przecięć.') : _t('Nic do przycięcia ani wydłużenia — brak przecięć i nic na przedłużeniu.'));
        return;
      }
      const byId = new Map(hits.map(h => [h.e.id, h.e]));
      const label = res.every(r => r.kind === 'extend') ? _t('Wydłuż') : res.every(r => r.kind === 'trim') ? _t('Przytnij') : _t('Przytnij / wydłuż');
      app.edit(label, tx => {
        for (const r of res) {
          const e = byId.get(r.id);
          if (r.kind === 'extend') tx.set(r.id, r.set);
          else { tx.del(r.id); for (const n of r.replace) tx.add({ ...n, layer: e.layer, w: e.w, lt: e.lt }); }
        }
      });
    },
    highlight() { return new Set(); },
    // podgląd: znikające kawałki czerwoną przerywaną, wydłużenie przerywaną w kolorze zaznaczenia.
    // Liczony przy każdej klatce z bieżącego rysunku — po cofnięciu albo zmianie elementu nie zostaje stary.
    preview() {
      if (this.path) this.hov = this.hits.length ? this.result(this.hits) : null;
      else { const e = this.hp && app.pick(this.hp); this.hov = e && CUTS.includes(e.t) ? this.result([{ e, p: this.hp }]) : null; }
      return this.hov ? changePreview(this.hov) : [];
    },
    halo() {
      if (!this.hov) return null;
      const out = changeHalo(this.hov);
      // przeciągnięte elementy, z którymi nic się nie stanie — też podświetlone (ślad je złapał)
      if (this.path) { const done = new Set(this.hov.map(r => r.id)); for (const id of this.marked) if (!done.has(id)) { const e = entById(id); if (e) out.push(e); } }
      return out;
    },
    cancel() { if (this.path) { this.path = null; this.hits = []; this.marked = new Set(); this.hov = null; return true; } return false; },
    typed: () => false, enter: () => false
  };
  // wydłuż (⇧X): to samo narzędzie w trybie „tylko wydłuż”
  T.extend = { ...T.trim, id: 'extend', mode: 'extend', path: null, hits: [], marked: new Set(), hov: null, hp: null };

  /* ---------- tekst (Y): klik i pisanie wprost na rysunku ---------- */
  T.text = {
    id: 'text', draw: true,
    base: () => null, label: () => null, reading: () => null,
    hint() { return _t`<b>Tekst:</b> kliknij miejsce i pisz. Enter kończy, ${app.shiftName} + Enter — nowy wiersz. Wysokość jest w milimetrach wydruku.`; },
    down(p) { const hit = app.pick(p); if (hit && hit.t === 'text') app.editText(hit); else app.editText(null, p); },
    move() {}, typed: () => false, preview: () => [], enter: () => false, cancel: () => false
  };

  /* ---------- wymiar (U): dwa punkty i miejsce linii, potem łańcuch ---------- */
  // kierunek: 'auto' wybiera poziomo / pionowo po położeniu kursora; drugie naciśnięcie U przełącza auto → poziomo → pionowo → równolegle
  T.dim = {
    id: 'dim', draw: true, a: null, b: null, chain: null, cur: null, mode: 'auto', kind: 'lin', src: null,
    base() { return this.kind !== 'lin' ? null : this.chain ? this.chain.b : this.b || this.a; },
    label: () => null,
    reading() {
      const e = this.previewDim(); if (!e) return null;
      if (e.t === 'adim') { const g = adimGeom(e); return e.k === 'ang' ? fmtDeg(g.value) : fmtLength(g.value); }
      return fmtLength(dimGeom(e).value);
    },
    // rodzaj z paska: liniowy, kątowy, promień, średnica
    setKind(k) { this.kind = k; this.a = this.b = this.chain = this.src = null; },
    hint() {
      if (this.kind === 'ang') return this.src && this.src.c ? _t('<b>Wymiar kątowy:</b> kliknij miejsce łuku wymiarowego — po tej stronie, którą kąt ma objąć.') : this.src ? _t('<b>Wymiar kątowy:</b> kliknij drugą linię.') : _t('<b>Wymiar kątowy:</b> kliknij pierwszą linię (albo prosty odcinek polilinii).');
      if (this.kind === 'rad' || this.kind === 'dia') { const w = this.kind === 'rad' ? _t('Wymiar promienia') : _t('Wymiar średnicy'); return this.src ? _t`<b>${w}:</b> kliknij miejsce opisu.` : _t`<b>${w}:</b> kliknij łuk albo okrąg.`; }
      const m = { auto: _t('sam'), h: _t('poziomo'), v: _t('pionowo'), a: _t('równolegle') }[this.mode];
      if (this.chain) return _t`<b>Wymiar:</b> kliknij kolejny punkt — łańcuch ciągnie się dalej. Esc kończy. Kierunek: ${m} (${app.againName('dim')} jeszcze raz zmienia).`;
      if (this.b) return _t`<b>Wymiar:</b> kliknij miejsce linii wymiarowej. Kierunek: ${m} (${app.againName('dim')} jeszcze raz zmienia).`;
      return this.a ? _t('<b>Wymiar:</b> kliknij drugi punkt.') : _t('<b>Wymiar:</b> kliknij pierwszy punkt.');
    },
    badge() { if (this.kind !== 'lin') return { ang: _t('Wymiar kątowy'), rad: _t('Wymiar promienia'), dia: _t('Wymiar średnicy') }[this.kind]; return _t('Wymiar') + ' · ' + { auto: _t('kierunek sam'), h: _t('poziomo'), v: _t('pionowo'), a: _t('równolegle') }[this.mode]; },
    dirFor(a, b, o) {
      if (this.mode !== 'auto') return this.mode;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
      const outY = o[1] > y1 || o[1] < y0, outX = o[0] > x1 || o[0] < x0;
      if (outY && !outX) return 'h'; if (outX && !outY) return 'v';
      return Math.abs(o[1] - my) >= Math.abs(o[0] - mx) ? 'h' : 'v';
    },
    toggle() { if (this.kind !== 'lin') { this.setKind('lin'); return; } const o = ['auto', 'h', 'v', 'a']; this.mode = o[(o.indexOf(this.mode) + 1) % 4]; },
    previewDim() {
      if (!this.cur) return null;
      if (this.kind === 'ang') return this.src && this.src.c ? { t: 'adim', k: 'ang', c: this.src.c, a: this.src.a, b: this.src.b, o: this.cur } : null;
      if (this.kind === 'rad' || this.kind === 'dia') return this.src ? { t: 'adim', k: this.kind, c: this.src.c, r: this.src.r, o: this.cur } : null;
      if (this.chain) return { t: 'dim', a: this.chain.b, b: this.cur, o: this.chain.o, dir: this.chain.dir };
      if (this.b) return { t: 'dim', a: this.a, b: this.b, o: this.cur, dir: this.dirFor(this.a, this.b, this.cur) };
      return null;
    },
    // prosty odcinek pod kliknięciem: linia albo odcinek polilinii
    segAt(p) {
      const s = app.pick(p, { locked: true }); if (!s) return null;   // podkład na zablokowanej warstwie też się wymiaruje
      if (s.t === 'line') return { a: s.a, b: s.b };
      if (s.t === 'pline') { let best = null, bd = Infinity; for (const q of partsOf(s)) if (q.k === 'seg') { const d = V.dist(p, closestOnSeg(p, q.a, q.b).p); if (d < bd) { bd = d; best = { a: q.a, b: q.b }; } } return best; }
      return null;
    },
    down(p) {
      if (this.kind === 'ang') {
        if (this.src && this.src.c) { const e = { t: 'adim', k: 'ang', c: this.src.c, a: this.src.a, b: this.src.b, o: [...p] }; app.edit(_t('Wymiar'), tx => tx.add(e)); this.src = null; return; }
        const s = this.segAt(p); if (!s) { app.toast(_t('Kliknij linię albo prosty odcinek polilinii.')); return; }
        const q = closestOnSeg(p, s.a, s.b).p;
        if (!this.src) { this.src = { s, a: q }; return; }
        const g = angArms(this.src.s, this.src.a, s, q);
        if (!g) { app.toast(_t('Linie są równoległe — nie tworzą kąta.')); return; }
        this.src = g;
        return;
      }
      if (this.kind === 'rad' || this.kind === 'dia') {
        if (this.src) { const e = { t: 'adim', k: this.kind, c: this.src.c, r: this.src.r, o: [...p] }; app.edit(_t('Wymiar'), tx => tx.add(e)); this.src = null; return; }
        const s = app.pick(p, { locked: true }); if (!s || (s.t !== 'circle' && s.t !== 'arc')) { app.toast(_t('Kliknij łuk albo okrąg.')); return; }
        this.src = { c: s.c, r: s.r }; return;
      }
      if (this.chain) { if (V.dist(p, this.chain.b) < 1e-9) return; const e = { t: 'dim', a: this.chain.b, b: [...p], o: this.chain.o, dir: this.chain.dir }; app.edit(_t('Wymiar'), tx => tx.add(e)); this.chain = { ...this.chain, b: [...p] }; return; }
      if (!this.a) { this.a = [...p]; return; }
      if (!this.b) { if (V.dist(p, this.a) < 1e-9) return; this.b = [...p]; return; }
      const e = { t: 'dim', a: this.a, b: this.b, o: [...p], dir: this.dirFor(this.a, this.b, p) };
      app.edit(_t('Wymiar'), tx => tx.add(e));
      this.chain = { b: this.b, o: e.o, dir: e.dir }; this.a = this.b = null;
    },
    move(p) { this.cur = p; },
    typed: () => false,
    preview() { const e = this.previewDim(); if (e) return [{ ...e, ...app.newStroke() }]; return this.a && this.cur ? [{ t: 'line', a: this.a, b: this.cur, ...app.newStroke(), _ghost: true }] : []; },
    enter() { if (this.chain || this.a || this.src) { this.chain = null; this.a = this.b = this.src = null; return true; } return false; },
    cancel() { return this.enter(); },
    undoInTool() { if (this.src) { this.src = null; return true; } if (this.b && !this.chain) { this.b = null; return true; } if (this.a && !this.chain) { this.a = null; return true; } this.chain = null; return false; }
  };

  /* ---------- mierz (L): odcinki, suma, kąt, pole — nic nie trafia do rysunku ---------- */
  // pole wielokąta z wybrzuszeniami (polilinia z łukami): wzór Gaussa + odcinki koła
  const areaOf = (pts, closed) => {
    let s = 0; const n = pts.length; if (n < 3 && !(n === 2 && pts[0][2])) return 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n]; s += p[0] * q[1] - q[0] * p[1];
      if (p[2] && (closed || i < n - 1)) { const th = 4 * Math.atan(p[2]), c = V.dist(p, q), r = c / (2 * Math.sin(Math.abs(th) / 2)); s += Math.sign(th) * r * r * (Math.abs(th) - Math.sin(Math.abs(th))); }
    }
    return Math.abs(s / 2);
  };
  T.measure = {
    id: 'measure', draw: true, pts: [], cur: null, res: null,
    base() { return this.pts.length && !this.res ? this.pts[this.pts.length - 1] : null; },
    label: () => null,
    reading() { const b = this.base(); return b && this.cur ? fmtLength(V.dist(b, this.cur)) : null; },
    start() { this.pts = []; this.res = null; },
    hint() { return _t`<b>Mierz:</b> klikaj kolejne punkty (przyciąganie działa) — pasek u góry pokazuje odcinek i sumę. Kliknięcie w pierwszy punkt zamyka obrys i daje pole. ${app.shiftName} + klik w zamknięty element — jego pole i obwód. Esc zaczyna od nowa.`; },
    // wynik na pasek: { seg, total, ang, dx, dy } albo { area, per }
    info() {
      if (this.res) return this.res;
      const b = this.base(), cur = this.cur;
      let total = 0; for (let i = 1; i < this.pts.length; i++) total += V.dist(this.pts[i - 1], this.pts[i]);
      if (!b || !cur) return this.pts.length > 1 ? { total } : null;
      const d = V.sub(cur, b), seg = V.len(d);
      return { seg, total: total + seg, ang: seg > 1e-12 ? angOf([0, 0], d) : 0, dx: d[0], dy: d[1] };
    },
    down(p, e) {
      if (e && e.shiftKey && !this.pts.length) {
        const s = app.pick(p, { locked: true });
        if (s && (s.t === 'circle' || (s.t === 'pline' && s.closed))) {
          this.res = s.t === 'circle' ? { area: Math.PI * s.r * s.r, per: 2 * Math.PI * s.r, shape: s } : { area: areaOf(s.pts, true), per: lengthOf(s), shape: s };
          return;
        }
        app.toast(_t('Pole mierzy się na zamkniętej polilinii, prostokącie albo okręgu.'));
        return;
      }
      if (this.res) { this.res = null; this.pts = []; }
      if (this.pts.length > 2 && V.dist(p, this.pts[0]) < Math.max(1e-9, app.tol ? app.tol() : 0)) {
        const pts = this.pts; let per = 0; for (let i = 0; i < pts.length; i++) per += V.dist(pts[i], pts[(i + 1) % pts.length]);
        this.res = { area: areaOf(pts, true), per, poly: pts }; this.pts = []; return;
      }
      if (this.pts.length && V.dist(p, this.pts[this.pts.length - 1]) < 1e-9) return;
      this.pts.push([p[0], p[1]]);
    },
    move(p) { this.cur = p; },
    snapEnts() { return this.pts.length > 1 ? [{ t: 'pline', pts: this.pts, closed: false, layer: app.doc.cur.layer }] : []; },
    typed: () => false,
    preview() {
      const st = { layer: app.doc.cur.layer, w: 0.25, lt: 'dash', _ghost: true };
      if (this.res) return this.res.poly ? [{ t: 'pline', pts: this.res.poly, closed: true, ...st }] : [];
      const pts = this.cur && this.pts.length ? [...this.pts, this.cur] : this.pts;
      return pts.length > 1 ? [{ t: 'pline', pts, closed: false, ...st }] : [];
    },
    highlight() { return this.res && this.res.shape ? new Set([this.res.shape.id]) : new Set(); },
    enter() { if (this.pts.length || this.res) { this.pts = []; this.res = null; return true; } return false; },
    cancel() { return this.enter(); },
    undoInTool() { if (this.pts.length) { this.pts.pop(); return true; } return false; },
    backspace() { if (this.pts.length) { this.pts.pop(); return true; } return false; }
  };

  /* ---------- okno na arkuszu (O): dwa narożniki ---------- */
  T.viewport = {
    id: 'viewport', draw: true, a: null, cur: null,
    base() { return this.a; }, label: () => null, reading: () => null,
    hint() { if (!app.space) return _t('<b>Okno:</b> działa na arkuszu — wybierz zakładkę arkusza na dole.'); return this.a ? _t('<b>Okno:</b> kliknij drugi narożnik okna.') : _t('<b>Okno:</b> kliknij pierwszy narożnik okna na arkuszu.'); },
    down(p) {
      if (!app.space) return;
      if (!this.a) { this.a = [...p]; return; }
      const a = this.a; this.a = null;
      if (Math.abs(p[0] - a[0]) < 0.005 || Math.abs(p[1] - a[1]) < 0.005) return;   // okno mniejsze niż 5 mm — pomyłka
      const scale = app.lastVpScale || app.doc.scale, c = app.modelCenter();
      const e = app.edit(_t('Okno'), tx => tx.add({ t: 'vp', a, b: [...p], scale, c, hidden: [] }));
      app.sel.clear(); app.sel.add(e.id); app.selectionChanged();
    },
    move(p) { this.cur = p; },
    typed: () => false,
    preview() { return this.a && this.cur ? [{ t: 'pline', pts: [this.a, [this.cur[0], this.a[1]], this.cur, [this.a[0], this.cur[1]]], closed: true, layer: app.doc.cur.layer, w: 0.18, lt: 'dash' }] : []; },
    enter: () => false,
    cancel() { if (this.a) { this.a = null; return true; } return false; }
  };

  /* ---------- kreskowanie (H): klik w zamknięty obszar ---------- */
  T.hatch = {
    id: 'hatch', draw: false, region: null, _faces: null, _key: '',
    opts: { pat: 'diag', ps: 1, ang: Math.PI / 4 },
    base: () => null, label: () => null, reading: () => null,
    hint: () => _t('<b>Kreskowanie:</b> kliknij wewnątrz zamkniętego obszaru — obrys podświetla się przed kliknięciem. Wzór, gęstość i kąt są na pasku u góry; gęstość jest w milimetrach wydruku, więc w każdej skali wygląda tak samo.'),
    // ściany grafu linii w widocznej części rysunku (liczone raz na zmianę rysunku albo widoku)
    faces() {
      const v = app.view.rect, d = (v[2] - v[0]) * 0.15, rect = [v[0] - d, v[1] - d, v[2] + d, v[3] + d];
      const key = app.rev + '|' + rect.map(x => x.toPrecision(5)).join(',');
      if (this._key !== key) { this._faces = buildFaces(app.ents().filter(e => isShown(app.doc, e)), rect); this._key = key; }
      return this._faces;
    },
    move(p) { this.region = regionAt(this.faces(), p); },
    down(p) {
      const r = regionAt(this.faces(), p);
      if (!r) { app.toast(this._faces?.truncated ? _t('W widoku jest za dużo linii, żeby znaleźć obszar — przybliż rysunek do tego miejsca.') : _t('Tu nie ma zamkniętego obszaru — obrys musi się domykać (wystarczą przecięcia linii).')); return; }
      const o = this.opts;
      const h = app.edit(_t('Kreskowanie'), tx => tx.add({ t: 'hatch', loops: r.loops, pat: o.pat, ps: o.ps, ang: o.ang, w: app.doc.cur.w ?? 0.13 }));
      // położone kreskowanie zostaje zaznaczone — pasek u góry zmienia je, dopóki nie klikniesz następnego obszaru
      app.sel.clear(); app.sel.add(h.id); app.selectionChanged();
      this.region = null;
    },
    preview() { return this.region ? [{ t: 'hatch', loops: this.region.loops, ...this.opts, ...app.newStroke(), w: app.doc.cur.w ?? 0.13, _ghost: true }] : []; },
    highlight() { return new Set(); },
    typed: () => false, enter: () => false, cancel() { if (this.region) { this.region = null; return true; } return false; }
  };

  /* ---------- bloki (K): z zaznaczeniem — utwórz blok, bez — wstawiaj ---------- */
  // czy blok id zawiera (także głębiej) blok target — żeby nie wstawić bloku w samego siebie
  const contains = (id, target, depth = 0) => id === target || (depth < 10 && blockEnts(id).some(e => e.t === 'ins' && contains(e.b, target, depth + 1)));
  T.block = {
    id: 'block', draw: true, mode: 'insert', cur: null, at: null, rot: 0, name: '', typeAnytime: true,
    start() {
      const sel = app.ents().filter(e => app.sel.has(e.id) && isLive(app.doc, e) && e.t !== 'vp');
      if (typeof app.space === 'number' && app.space) { this.mode = 'none'; return; }
      if (sel.length) { this.mode = 'create'; this.sel = sel.map(e => e.id); let n = app.doc.blocks.length + 1; while (app.doc.blocks.some(b => b.name === _t`Blok ${n}`)) n++; this.name = _t`Blok ${n}`; return; }
      this.mode = 'insert'; this.rot = 0;
      if (!app.doc.blocks.some(b => b.id === this.cur)) this.cur = app.doc.blocks[0]?.id ?? null;
    },
    base: () => null,
    label() { return this.mode === 'insert' && this.cur ? _t('Obrót') : null; },
    reading() { return this.mode === 'insert' && this.cur ? fmtDeg(this.rot) : null; },
    hint() {
      if (this.mode === 'none') return _t('<b>Bloki:</b> wstawia się je w modelu — przejdź do zakładki Model.');
      if (this.mode === 'create') return _t`<b>Nowy blok z ${this.sel.length} el.:</b> nazwa jest na pasku u góry; kliknij punkt wstawienia — za ten punkt blok będzie się wstawiać.`;
      if (!this.cur) return _t`<b>Bloki:</b> w rysunku nie ma jeszcze bloków — wybierz blok z biblioteki albo zaznacz elementy i naciśnij ${app.keyName('block') || _t('przycisk bloków')}, żeby utworzyć pierwszy.`;
      return _t('<b>Wstaw blok:</b> kliknij miejsce (przyciąganie działa), wpisz kąt, żeby obrócić. Esc kończy.');
    },
    down(p) {
      if (this.mode === 'create') {
        const name = (this.name || '').trim() || _t('Blok');
        if (app.doc.blocks.some(b => b.name === name)) { app.toast(_t`Blok „${escH(name)}” już jest — zmień nazwę na pasku.`); return; }
        const id = Math.max(0, ...app.doc.blocks.map(b => b.id)) + 1, ids = this.sel.filter(i => app.doc.ents.some(e => e.id === i));
        const ins = app.edit(_t('Utwórz blok'), tx => {
          tx.setDoc({ blocks: [...app.doc.blocks, { id, name }] });
          for (const i of ids) { const e = app.doc.ents.find(x => x.id === i); tx.set(i, { ...moved(e, [-p[0], -p[1]]), sp: 'b' + id }); }
          return tx.add({ t: 'ins', b: id, p: [...p], rot: 0, s: 1, mx: false, w: null, lt: null });
        });
        this.cur = id; app.sel.clear(); app.setTool('select'); app.toast(_t`Utworzono blok „${escH(name)}”. Kliknij go, żeby zobaczyć pasek bloku; ${app.keyName('block') || _t('przycisk bloków')} wstawia kolejne.`, 2600);
        void ins;
        return;
      }
      if (this.mode !== 'insert' || !this.cur) return;
      if (app.blockEdit && contains(this.cur, app.blockEdit.id)) { app.toast(_t('Bloku nie da się wstawić w niego samego.')); return; }
      app.edit(_t('Wstaw blok'), tx => tx.add({ t: 'ins', b: this.cur, p: [...p], rot: this.rot, s: 1, mx: false, w: null, lt: null }));
    },
    move(p) { this.at = p; },
    typed(s) { if (this.mode !== 'insert') return false; const v = parseFloat(String(s).replace(',', '.')); if (!Number.isFinite(v)) return false; this.rot = normDeg(v) * Math.PI / 180; return true; },
    preview() { return this.mode === 'insert' && this.cur && this.at ? [{ t: 'ins', b: this.cur, p: this.at, rot: this.rot, s: 1, mx: false, ...app.newStroke(), _ghost: true }] : []; },
    enter: () => false, cancel: () => false
  };

  /* ---------- punkt wstawienia bloku zapisywanego do biblioteki (z okienka „Zapisz do biblioteki”) ---------- */
  T.libpt = {
    id: 'libpt', draw: true,
    base: () => null, label: () => null, reading: () => null, badge: () => _t('Punkt wstawienia'),
    hint: () => _t('<b>Punkt wstawienia:</b> kliknij punkt, za który blok będzie się wstawiać z biblioteki (przyciąganie działa). Bloków w tym rysunku to nie przesunie. Esc wraca.'),
    down(p) { app.libPointPicked?.(p); },
    move() {}, typed: () => false, preview: () => [], enter: () => false,
    cancel() { app.libPointPicked?.(null); return true; }
  };

  return T;
}
const normDeg = v => ((v % 360) + 360) % 360;
const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export { lengthOf };
