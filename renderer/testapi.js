// Stałe polecenia do testów (window.rysioTest) — dla asystenta i dla ręcznych sprawdzeń w konsoli. Na wzór window.modoTest z Modo.
// Zamiast klikać w obraz po współrzędnych, test woła te funkcje; każda zwraca zwykłe dane (liczby, tablice, napisy).
// Współrzędne w metrach (oś Y w górę). Opis i przykłady: .claude/skills/test-w-przegladarce/SKILL.md.
import { newDoc, fixDoc } from './model.js';

export function installTestApi(app, h) {
  const errors = [];
  window.addEventListener('error', e => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', e => errors.push('promise: ' + String(e.reason && e.reason.message || e.reason)));
  const ce = console.error.bind(console); console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 300)); ce(...a); };
  const view = document.querySelector('#view');
  // zdarzenie myszy w punkcie modelu (przechodzi przez zwykłą obsługę: przyciąganie, narzędzie)
  const fire = (type, p, opts = {}) => {
    const s = app.view.toScreen(p), r = view.getBoundingClientRect();
    view.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + s[0], clientY: r.top + s[1], button: opts.button ?? 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, shiftKey: !!opts.shift, altKey: !!opts.alt, ctrlKey: !!opts.ctrl }));
  };
  const key = (k, opts = {}) => {
    const code = opts.code || (/^[a-z]$/i.test(k) ? 'Key' + k.toUpperCase() : /^\d$/.test(k) ? 'Digit' + k : k);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true, shiftKey: !!opts.shift, metaKey: !!opts.meta, ctrlKey: !!opts.ctrl, altKey: !!opts.alt }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code, bubbles: true }));
  };
  const api = {
    app,
    // nowy pusty rysunek (bez pytania o zapis)
    reset({ dark = false, scale = 50, units = 'm' } = {}) { const d = newDoc(); d.scale = scale; d.units = units; h.loadDoc(d); app.view.fit([-1, -1, 10, 7]); h.frame(); return api.stats(); },
    load(doc) { h.loadDoc(fixDoc(typeof doc === 'string' ? JSON.parse(doc) : doc)); return api.stats(); },
    // element wprost (przez edit — z cofaniem)
    add(e) { return app.edit('test', tx => tx.add(e)).id; },
    ents: () => JSON.parse(JSON.stringify(app.doc.ents)),
    layers: () => JSON.parse(JSON.stringify(app.doc.layers)),
    doc: () => JSON.parse(JSON.stringify(app.doc)),
    sel: () => [...app.sel],
    tool(id) { app.run(id); return h.getTool().id; },
    // kliknięcie w punkcie modelu; opts: { shift, alt, ctrl, button }
    click(x, y, opts) { fire('pointermove', [x, y], opts); fire('pointerdown', [x, y], opts); fire('pointerup', [x, y], opts); h.frame(); return api.state(); },
    move(x, y, opts) { fire('pointermove', [x, y], opts); h.frame(); return api.state(); },
    // przeciągnięcie przez kolejne punkty [[x,y],…]
    drag(pts, opts) { fire('pointermove', pts[0], opts); fire('pointerdown', pts[0], opts); for (const p of pts.slice(1)) fire('pointermove', p, opts); fire('pointerup', pts[pts.length - 1], opts); h.frame(); return api.state(); },
    key(k, opts) { key(k, opts); h.frame(); return api.state(); },
    // wpisanie wymiaru z klawiatury i Enter
    type(s) { for (const ch of String(s)) key(ch); key('Enter'); h.frame(); return api.state(); },
    run(id) { app.run(id); h.frame(); return api.state(); },
    // przestrzeń: 0 — model, numer — arkusz; addSheet() dodaje arkusz i na niego przechodzi
    space(id) { h.setSpace(id); h.frame(); return app.space; },
    addSheet() { app.run('newSheet'); h.frame(); return app.space; },
    // stan: narzędzie, przyciąganie, podpowiedź, pole wymiaru
    state() {
      const sn = h.getSnap();
      return { tool: h.getTool().id, space: app.space, ents: app.doc.ents.length, sel: app.sel.size, snap: sn ? { kind: sn.kind, label: sn.label, p: sn.p.map(v => +v.toFixed(6)), guides: sn.guides.map(g => g.kind) } : null,
        hint: document.querySelector('#hint').textContent, vcb: document.querySelector('#vcb').textContent, undo: app.hist.undoStack.length, errors: errors.length };
    },
    stats() { return { ents: app.doc.ents.length, layers: app.doc.layers.length, undo: app.hist.undoStack.length, scale: app.doc.scale, units: app.doc.units, ppm: +app.view.ppm.toFixed(3), errors: errors.length }; },
    // widok: punkt modelu → piksel strony; ustawienie powiększenia
    screen(p) { const r = view.getBoundingClientRect(), s = app.view.toScreen(p); return { x: Math.round(r.left + s[0]), y: Math.round(r.top + s[1]) }; },
    zoom(ppm, center = [app.view.cx, app.view.cy]) { app.view.ppm = ppm; app.view.cx = center[0]; app.view.cy = center[1]; app.redraw(); h.frame(); return api.stats(); },
    fit(b) { app.view.fit(b); h.frame(); return api.stats(); },
    errors: () => errors.slice(),
    text: sel => { const e = document.querySelector(sel); return e ? e.textContent : null; }
  };
  window.rysioTest = api;
  return api;
}
