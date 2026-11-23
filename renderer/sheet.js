// Arkusz: ramka z tabelką, okna z modelem w skali i przeliczanie arkusz ↔ model. Działa z każdym piórem
// (ekran i PDF), więc wydruk składa się dokładnie tak jak widok arkusza.
// Współrzędne arkusza: metry papieru, początek w lewym dolnym rogu, oś Y w górę (1 mm = 0,001).
import { _t } from './i18n.js';
import { sheetSize, spaceOf, isShown, layerOf } from './model.js';
import { V, vpBox, bbox, boxHit, setAnno, ANNO } from './geom.js';
import { drawEnt } from './draw.js';

const MM = 0.001;
export const FRAME = { left: 20, right: 10, top: 10, bottom: 10 };   // marginesy ramki w mm (20 mm z lewej do wpięcia)
export const TITLE = { w: 180, rows: [14, 11, 11] };                // tabelka w prawym dolnym rogu ramki

// okno (element vp): środek okna na arkuszu i przeliczenia
export function vpMap(e) {
  const b = vpBox(e), cs = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  return {
    box: b, scale: e.scale,
    toSheet: p => [cs[0] + (p[0] - e.c[0]) / e.scale, cs[1] + (p[1] - e.c[1]) / e.scale],
    toModel: q => [e.c[0] + (q[0] - cs[0]) * e.scale, e.c[1] + (q[1] - cs[1]) * e.scale],
    // prostokąt modelu widoczny w oknie
    modelBox: () => [e.c[0] - (b[2] - b[0]) / 2 * e.scale, e.c[1] - (b[3] - b[1]) / 2 * e.scale, e.c[0] + (b[2] - b[0]) / 2 * e.scale, e.c[1] + (b[3] - b[1]) / 2 * e.scale]
  };
}
// okna arkusza, od najstarszego
export const sheetVps = (doc, sh) => doc.ents.filter(e => e.t === 'vp' && e.sp === sh.id);
// skale okien do tabelki: „1:100, 1:20”
export function titleScales(doc, sh) {
  const s = [...new Set(sheetVps(doc, sh).map(e => e.scale))].sort((a, b) => b - a);
  return s.map(k => '1:' + String(+k.toFixed(3)).replace('.', ',')).join(', ');
}

// zawartość okien: model przycięty do okna, w skali okna, bez warstw ukrytych w tym oknie
export function drawViewports(pen, doc, sh, o) {
  for (const e of sheetVps(doc, sh)) {
    if (!isShown(doc, e)) continue;
    const m = vpMap(e), sub = pen.sub(m.toSheet, 1 / e.scale), mb = m.modelBox(), keep = ANNO;
    setAnno(e.scale / 1000);
    pen.clip(m.box, () => {
      for (const x of doc.ents) {
        if (spaceOf(x) !== 0 || !isShown(doc, x) || e.hidden.includes(x.layer)) continue;
        if (!boxHit(bbox(x), mb)) continue;
        drawEnt(sub, doc, x, { ...o, scale: e.scale, fmt: o.fmtModel });
      }
    });
    setAnno(keep);
  }
}

// ramka i tabelka rysunkowa
export function drawFrame(pen, doc, sh, o) {
  if (!sh.frame) return;
  const [W, H] = sheetSize(sh), col = o.mono ? '#000000' : o.ink, gray = o.mono ? '#000000' : o.muted || o.ink;
  const f = pen.ppm / 1000, wpx = mm => o.exact ? mm * f : Math.max(0.6, mm * f);
  const x0 = FRAME.left * MM, y0 = FRAME.bottom * MM, x1 = W - FRAME.right * MM, y1 = H - FRAME.top * MM;
  pen.style({ width: wpx(0.5), color: col });
  pen.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
  // tabelka: trzy wiersze od góry — Projekt | Rysunek, Projektant | Skala, Data, Nr
  const tw = TITLE.w * MM, th = TITLE.rows.reduce((a, b) => a + b, 0) * MM, tx = x1 - tw, ty = y0;
  pen.poly([[tx, ty], [x1, ty], [x1, ty + th], [tx, ty + th]], true);
  pen.style({ width: wpx(0.25), color: col });
  const r3 = TITLE.rows[2] * MM, r2 = TITLE.rows[1] * MM;
  pen.line([tx, ty + r3], [x1, ty + r3]); pen.line([tx, ty + r3 + r2], [x1, ty + r3 + r2]);
  pen.line([tx + 120 * MM, ty + r3], [tx + 120 * MM, ty + r3 + r2]);
  pen.line([tx + 60 * MM, ty], [tx + 60 * MM, ty + r3]); pen.line([tx + 120 * MM, ty], [tx + 120 * MM, ty + r3]);
  const cell = (x, ytop, hmm, label, value, vh = 3) => {
    pen.style({ color: gray }); pen.text([x + 2.5 * MM, ytop - 3.2 * MM], label.toUpperCase(), 1.6 * MM);
    pen.style({ color: col }); if (value) pen.text([x + 2.5 * MM, ytop - hmm * MM + 2.6 * MM], value, vh * MM);
  };
  const p = doc.project || {}, t = sh.title || {}, top = ty + th;
  cell(tx, top, TITLE.rows[0], _t('Projekt'), p.projekt, 3.6);
  cell(tx, ty + r3 + r2, TITLE.rows[1], _t('Rysunek'), t.rysunek || sh.name);
  cell(tx + 120 * MM, ty + r3 + r2, TITLE.rows[1], _t('Projektant'), p.projektant, 2.6);
  cell(tx, ty + r3, TITLE.rows[2], _t('Skala'), titleScales(doc, sh), 2.8);
  cell(tx + 60 * MM, ty + r3, TITLE.rows[2], _t('Data'), p.data, 2.8);
  cell(tx + 120 * MM, ty + r3, TITLE.rows[2], _t('Nr'), t.nr, 3);
}

// elementy narysowane wprost na arkuszu (bez okien)
export function drawSheetEnts(pen, doc, sh, o, skip) {
  const keep = ANNO; setAnno(0.001);
  for (const e of doc.ents) {
    if (e.sp !== sh.id || e.t === 'vp' || !isShown(doc, e) || (skip && skip.has(e.id))) continue;
    drawEnt(pen, doc, e, { ...o, scale: 1, fmt: o.fmtSheet });
  }
  setAnno(keep);
}

// cały arkusz do wydruku: okna, ramka z tabelką, elementy arkusza
export function drawSheet(pen, doc, sh, o) {
  drawViewports(pen, doc, sh, o);
  drawFrame(pen, doc, sh, o);
  drawSheetEnts(pen, doc, sh, o);
}
export { layerOf };
