// Narzędzia. Każde dostaje od programu punkt już przyciągnięty (narzędzia rysujące) albo surowy (zaznaczanie, gumka, pędzel).
// Rysunek zmieniają wyłącznie przez app.edit() — jedna droga z cofaniem.
//
// Narzędzie:  base() punkt bazowy do kierunków · label() podpis pola wymiaru (null = bez wpisywania) · reading() bieżąca wartość
//             hint() podpowiedź · down/move/up(p, e) · typed(tekst) → true, gdy zrozumiało · enter() / cancel() → true, gdy coś zrobiło
//             preview() elementy podglądu · path / box — ślad pędzla i gumki, ramka zaznaczania
import { _t } from './i18n.js';
import { V, arc3, arcCSE, angOf, sweep, moved, touchesRect, insideRect, crossesSeg, intersect, lengthOf, dimGeom } from './geom.js';
import { parseLength, parseLengths, fmtLength, fmtNum } from './units.js';
import { isLive, isShown } from './model.js';
import { rotation, mirroring, scaling, transformed, offsetEnt, filletLines, trimMany } from './edit.js';

const dirOf = (from, to) => { const d = V.norm(V.sub(to, from)); return d[0] || d[1] ? d : [1, 0]; };
const deg = r => (r * 180 / Math.PI);
const fmtDeg = r => deg(r).toFixed(1).replace('.', ',') + '°';

export function makeTools(app) {
  const T = {};

  /* ---------- zaznacz (Q) ---------- */
  T.select = {
    id: 'select', draw: false, box: null, _down: null,
    base: () => null, label: () => null, reading: () => null,
    hint() { return app.sel.size ? _t`<b>${app.sel.size} zaznaczone.</b> ${app.keyName('delete')} usuwa, ${app.keyName('move')} przesuwa, ${app.keyName('copy')} kopiuje. Warstwę i kreskę zmienisz w pastylkach u góry.` : _t`<b>Zaznacz:</b> kliknij element (${app.shiftName} dodaje i odejmuje) albo przeciągnij ramkę — w prawo: całe w ramce, w lewo: wszystko, czego dotknie.`; },
    down(p, e) { this._down = p; this.box = null; this._shift = e.shiftKey; },
    move(p) { if (this._down && V.dist(this._down, p) * app.view.ppm > 4) this.box = { a: this._down, b: p }; },
    up(p) {
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
    cancel() { if (this._down) { this._down = null; this.box = null; return true; } if (app.sel.size) { app.sel.clear(); app.selectionChanged(); return true; } return false; },
    enter: () => false, typed: () => false, preview: () => []
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

  /* ---------- łuk (B): przez trzy punkty; ⇧B albo Tab — ze środka ---------- */
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
      const sw = _t('Tab zmienia sposób.');
      if (this.mode === 'c') return [_t('<b>Łuk ze środka:</b> kliknij środek.'), _t('<b>Łuk ze środka:</b> kliknij początek albo wpisz promień.'), _t('<b>Łuk ze środka:</b> kliknij koniec albo wpisz kąt w stopniach (ujemny — zgodnie ze wskazówkami zegara).')][this.pts.length] + ' ' + sw;
      return [_t('<b>Łuk przez trzy punkty:</b> kliknij początek.'), _t('<b>Łuk przez trzy punkty:</b> kliknij punkt na łuku.'), _t('<b>Łuk przez trzy punkty:</b> kliknij koniec.')][this.pts.length] + ' ' + sw;
    },
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
    reading() { return this.ref && this.cur ? '×' + this.factor().toFixed(3).replace('.', ',') : null; },
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
    start() { this.src = null; },
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
    preview() { if (!this.src || !this.cur) return []; const r = offsetEnt(this.src, this.d, this.cur); return r.error ? [] : [{ ...r, layer: this.src.layer, w: this.src.w, lt: this.src.lt, _ghost: true }]; },
    enter: () => false, cancel() { if (this.src) { this.src = null; return true; } return false; }
  };

  /* ---------- zaokrąglij narożnik (G) ---------- */
  T.fillet = {
    id: 'fillet', draw: false, first: null, r: 0, typeAnytime: true,
    base: () => null, label() { return _t('Promień'); }, reading() { return fmtLength(this.r); },
    hint() { return this.first ? _t('<b>Zaokrąglij:</b> kliknij drugą linię (po stronie, która ma zostać).') : _t`<b>Zaokrąglij:</b> kliknij pierwszą linię. Promień ${fmtLength(this.r)} — wpisz, żeby zmienić (0 — ostry narożnik).`; },
    start() { this.first = null; },
    down(p) {
      const s = app.pick(p); if (!s) return;
      if (s.t !== 'line') { app.toast(_t('Zaokrąglanie działa na pojedynczych liniach.')); return; }
      if (!this.first) { this.first = { e: s, p: [...p] }; return; }
      if (s.id === this.first.e.id) return;
      const f = this.first; this.first = null;
      const r = filletLines(f.e, f.p, s, p, this.r);
      if (r.error) { app.toast(r.error === 'parallel' ? _t('Linie są równoległe — nie mają narożnika.') : _t('Promień jest za duży dla tych linii.')); return; }
      app.edit(_t('Zaokrąglij'), tx => { tx.set(f.e.id, r.l1); tx.set(s.id, r.l2); if (r.arc) tx.add({ ...r.arc, layer: f.e.layer, w: f.e.w, lt: f.e.lt }); });
    },
    move() {}, typed(s) { const v = parseLength(s); if (!(v >= 0)) return false; this.r = v; return true; },
    highlight() { return this.first ? new Set([this.first.e.id]) : new Set(); },
    preview: () => [], enter: () => false, cancel() { if (this.first) { this.first = null; return true; } return false; }
  };

  /* ---------- przytnij / wydłuż (X): klik albo przeciągnięcie przez kilka kawałków, jak gumka ---------- */
  const CUTS = ['line', 'arc', 'circle', 'pline'];
  T.trim = {
    id: 'trim', draw: false, path: null, hits: [], marked: new Set(), mode: 'auto',
    base: () => null, label: () => null, reading: () => null,
    hint() {
      return this.mode === 'extend' ? _t('<b>Wydłuż:</b> kliknij koniec linii albo przeciągnij przez końce kilku — dosuną się do najbliższego elementu.')
        : this.mode === 'trim' ? _t('<b>Przytnij:</b> kliknij kawałek między przecięciami albo przeciągnij przez kilka — znikną wszystkie przecięte kawałki.')
        : _t('<b>Przytnij / wydłuż:</b> kliknij kawałek do usunięcia albo koniec linii do wydłużenia; przeciągnij, żeby zrobić to z kilkoma naraz.');
    },
    down(p) {
      this.path = [p]; this.hits = []; this.marked = new Set();
      const e = app.pick(p);
      if (e && CUTS.includes(e.t)) { this.hits.push({ e, p }); this.marked.add(e.id); }
      else if (e) app.toast(_t('Przycinać i wydłużać można linie, łuki, okręgi i polilinie.'));
    },
    move(p) {
      if (!this.path) return;
      const last = this.path[this.path.length - 1]; this.path.push(p);
      const seg = { t: 'line', a: last, b: p };
      for (const e of app.ents()) {
        if (!CUTS.includes(e.t) || !isLive(app.doc, e)) continue;
        for (const x of intersect(e, seg)) { this.hits.push({ e, p: x }); this.marked.add(e.id); }
      }
    },
    up() {
      const hits = this.hits; this.path = null; this.hits = []; this.marked = new Set();
      if (!hits.length) return;
      const others = app.ents().filter(o => isShown(app.doc, o) && !['text', 'vp'].includes(o.t));
      const res = trimMany(hits, others, this.mode, 14 / app.view.ppm);
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
    highlight() { return this.marked; },
    cancel() { if (this.path) { this.path = null; this.hits = []; this.marked = new Set(); return true; } return false; },
    typed: () => false, preview: () => [], enter: () => false
  };

  /* ---------- tekst (Y): klik i pisanie wprost na rysunku ---------- */
  T.text = {
    id: 'text', draw: true,
    base: () => null, label: () => null, reading: () => null,
    hint() { return _t`<b>Tekst:</b> kliknij miejsce i pisz. Enter kończy, ${app.shiftName} + Enter — nowy wiersz. Wysokość jest w milimetrach wydruku.`; },
    down(p) { const hit = app.pick(p); if (hit && hit.t === 'text') app.editText(hit); else app.editText(null, p); },
    move() {}, typed: () => false, preview: () => [], enter: () => false, cancel: () => false
  };

  /* ---------- wymiar (U): dwa punkty i miejsce linii, potem łańcuch ---------- */
  // kierunek: 'auto' wybiera poziomo / pionowo po położeniu kursora; Tab przełącza auto → poziomo → pionowo → równolegle
  T.dim = {
    id: 'dim', draw: true, a: null, b: null, chain: null, cur: null, mode: 'auto',
    base() { return this.chain ? this.chain.b : this.b || this.a; },
    label: () => null, reading() { const e = this.previewDim(); return e ? fmtLength(dimGeom(e).value) : null; },
    hint() {
      const m = { auto: _t('sam'), h: _t('poziomo'), v: _t('pionowo'), a: _t('równolegle') }[this.mode];
      if (this.chain) return _t`<b>Wymiar:</b> kliknij kolejny punkt — łańcuch ciągnie się dalej. Esc kończy. Kierunek: ${m} (Tab).`;
      if (this.b) return _t`<b>Wymiar:</b> kliknij miejsce linii wymiarowej. Kierunek: ${m} (Tab).`;
      return this.a ? _t('<b>Wymiar:</b> kliknij drugi punkt.') : _t('<b>Wymiar:</b> kliknij pierwszy punkt.');
    },
    dirFor(a, b, o) {
      if (this.mode !== 'auto') return this.mode;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
      const outY = o[1] > y1 || o[1] < y0, outX = o[0] > x1 || o[0] < x0;
      if (outY && !outX) return 'h'; if (outX && !outY) return 'v';
      return Math.abs(o[1] - my) >= Math.abs(o[0] - mx) ? 'h' : 'v';
    },
    toggle() { const o = ['auto', 'h', 'v', 'a']; this.mode = o[(o.indexOf(this.mode) + 1) % 4]; },
    previewDim() {
      if (!this.cur) return null;
      if (this.chain) return { t: 'dim', a: this.chain.b, b: this.cur, o: this.chain.o, dir: this.chain.dir };
      if (this.b) return { t: 'dim', a: this.a, b: this.b, o: this.cur, dir: this.dirFor(this.a, this.b, this.cur) };
      return null;
    },
    down(p) {
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
    enter() { if (this.chain || this.a) { this.chain = null; this.a = this.b = null; return true; } return false; },
    cancel() { return this.enter(); },
    undoInTool() { if (this.b && !this.chain) { this.b = null; return true; } if (this.a && !this.chain) { this.a = null; return true; } this.chain = null; return false; }
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

  return T;
}

export { lengthOf };
