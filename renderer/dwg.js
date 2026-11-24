import { _t } from './i18n.js';
// Czytanie plików DWG wprost w programie przez LibreDWG (GNU GPL-3, skompilowany do WebAssembly).
// LibreDWG odczytuje rysunek do bazy encji; tu zamieniamy ją na prosty tekst DXF z tymi encjami, które rozumie
// nasz czytnik DXF (dxf.js) — dzięki temu DWG i DXF idą dalej tą samą, sprawdzoną drogą.
// Moduł (ok. 8 MB) ładuje się dopiero przy pierwszym pliku DWG.

let mod = null;
let withText = true;   // teksty z DWG: najpierw próbujemy z nimi; gdy LibreDWG się na nich wyłoży — bez nich
// Każdy plik dostaje świeży egzemplarz modułu: po nieudanym odczycie stan WASM bywa uszkodzony.
async function fresh() {
  if (!mod) {
    mod = await import('./vendor/libredwg/index.js');
    // z nagłówka rysunku potrzebujemy tylko jednostek; pełne czytanie nagłówka potrafi przerwać moduł na niektórych plikach
    const { LibreDwgConverter } = await import('./vendor/libredwg/converter/converter.js');
    LibreDwgConverter.prototype.convertHeader = function (data, header) { try { header.INSUNITS = this.libredwg.dwg_dynapi_header_data(data, 'INSUNITS'); } catch (e) {} };
    // do podkładu wystarczą linie, łuki, polilinie, wstawienia bloków i wymiary; pozostałe rodzaje encji (teksty, kreskowania,
    // bryły ACIS, tabele…) pomijamy już przy odczycie — to na nich LibreDWG najczęściej się wykłada
    const { LibreEntityConverter } = await import('./vendor/libredwg/converter/entityConverter.js');
    const keep = /^convert(3dFace|Arc|Circle|Ellise|Ellipse|Insert|Line|LWPolyline|Polyline2d|Polyline3d|Solid|Trace|Spline|Text|MText)?$/;
    for (const k of Object.getOwnPropertyNames(LibreEntityConverter.prototype)) if (/^convert/.test(k) && !keep.test(k)) LibreEntityConverter.prototype[k] = () => ({ type: 'POMINIETE' });
    // teksty: tylko pola, których potrzebujemy (pełny odczyt MTEXT z kolumnami i tłem bywa zawodny); każde pole osobno
    const field = (L, ent, name) => { try { return L.dwg_dynapi_entity_data(ent, name); } catch (e) { return undefined; } };
    LibreEntityConverter.prototype.convertText = function (ent, common) {
      if (!withText) return { type: 'POMINIETE' };
      const L = this.libredwg;
      return { ...common, type: 'TEXT', text: field(L, ent, 'text_value'), startPoint: field(L, ent, 'ins_pt'), endPoint: field(L, ent, 'alignment_pt'), textHeight: field(L, ent, 'height'), rotation: field(L, ent, 'rotation'), halign: field(L, ent, 'horiz_alignment'), valign: field(L, ent, 'vert_alignment') };
    };
    LibreEntityConverter.prototype.convertMText = function (ent, common) {
      if (!withText) return { type: 'POMINIETE' };
      const L = this.libredwg;
      return { ...common, type: 'MTEXT', text: field(L, ent, 'text'), insertionPoint: field(L, ent, 'ins_pt'), textHeight: field(L, ent, 'text_height'), attachmentPoint: field(L, ent, 'attachment'), direction: field(L, ent, 'x_axis_dir') };
    };
    // wymiar: wystarczy nazwa anonimowego bloku z jego rysunkiem (bez tekstów)
    const dim = function (entity, common) { return { ...common, type: 'DIMENSION', name: this.libredwg.dwg_entity_get_block_name(entity, 'block') }; };
    for (const k of Object.getOwnPropertyNames(LibreEntityConverter.prototype)) if (/^convert\w*Dimension$/.test(k)) LibreEntityConverter.prototype[k] = dim;
  }
  const warn = console.warn; console.warn = () => {};
  try { return await mod.LibreDwg.createByWasmInstance(await (await import('./vendor/libredwg/wasm/libredwg-web.js')).default({ print: () => {}, printErr: () => {} })); }
  finally { console.warn = warn; }
}

const deg = r => (r || 0) * 180 / Math.PI;
const n = x => { const v = +x; return Number.isFinite(v) ? String(Math.round(v * 1e9) / 1e9) : '0'; };

function writeEntity(o, e) {
  if (e.isVisible === false) return;
  const head = t => { o.push('0', t, '8', e.layer || '0'); };
  const ext = () => { const d = e.extrusionDirection; if (d && d.z < -0.5) o.push('210', '0', '220', '0', '230', '-1'); };
  switch (e.type) {
    case 'LINE': head('LINE'); o.push('10', n(e.startPoint.x), '20', n(e.startPoint.y), '11', n(e.endPoint.x), '21', n(e.endPoint.y)); break;
    case 'LWPOLYLINE':
      if (!e.vertices || e.vertices.length < 2) break;
      head('LWPOLYLINE'); o.push('70', String((e.flag || 0) & 1)); ext();
      for (const v of e.vertices) { o.push('10', n(v.x), '20', n(v.y)); if (v.bulge) o.push('42', n(v.bulge)); }
      break;
    case 'POLYLINE2D': case 'POLYLINE3D': {
      const vs = (e.vertices || []).filter(v => !((v.flag || 0) & 16));   // bez punktów kontrolnych splajnu
      if (vs.length < 2 || ((e.flag || 0) & 64)) break;                   // siatki wielościenne pomijamy
      head('POLYLINE'); o.push('70', String((e.flag || 0) & 1)); ext();
      for (const v of vs) { o.push('0', 'VERTEX', '8', e.layer || '0', '10', n(v.x), '20', n(v.y)); if (v.bulge) o.push('42', n(v.bulge)); }
      o.push('0', 'SEQEND');
      break;
    }
    case 'CIRCLE': head('CIRCLE'); o.push('10', n(e.center.x), '20', n(e.center.y), '40', n(e.radius)); ext(); break;
    case 'ARC': head('ARC'); o.push('10', n(e.center.x), '20', n(e.center.y), '40', n(e.radius), '50', n(deg(e.startAngle)), '51', n(deg(e.endAngle))); ext(); break;
    case 'ELLIPSE': head('ELLIPSE'); o.push('10', n(e.center.x), '20', n(e.center.y), '11', n(e.majorAxisEndPoint.x), '21', n(e.majorAxisEndPoint.y), '40', n(e.axisRatio || 1), '41', n(e.startAngle || 0), '42', n(e.endAngle || Math.PI * 2)); ext(); break;
    case 'SPLINE': {
      const fit = e.fitPoints || [], ctl = e.controlPoints || [];
      if (fit.length < 2 && ctl.length < 2) break;
      head('SPLINE'); o.push('70', String((e.flag || 0) & 1));
      for (const p of ctl) o.push('10', n(p.x), '20', n(p.y));
      for (const p of fit) o.push('11', n(p.x), '21', n(p.y));
      break;
    }
    case 'INSERT':
      if (!e.name) break;
      head('INSERT'); o.push('2', e.name, '10', n(e.insertionPoint.x), '20', n(e.insertionPoint.y), '41', n(e.xScale ?? 1), '42', n(e.yScale ?? 1), '50', n(deg(e.rotation))); ext();
      break;
    case 'DIMENSION':   // rysunek wymiaru leży w anonimowym bloku (*D…)
      if (e.name) { head('INSERT'); o.push('2', e.name, '10', '0', '20', '0'); }
      break;
    case 'TEXT': {
      const t = String(e.text ?? '').replace(/[\r\n]+/g, ' '), p = e.startPoint, q = e.endPoint;
      if (!t.trim() || !p || !(e.textHeight > 0)) break;
      head('TEXT'); o.push('10', n(p.x), '20', n(p.y), '40', n(e.textHeight), '1', t, '50', n(deg(e.rotation)));
      if ((e.halign || e.valign) && q) o.push('72', String(e.halign || 0), '73', String(e.valign || 0), '11', n(q.x), '21', n(q.y));
      ext(); break;
    }
    case 'MTEXT': {
      const t = String(e.text ?? '').replace(/\r?\n/g, '\\P'), p = e.insertionPoint, d = e.direction;
      if (!t.trim() || !p || !(e.textHeight > 0)) break;
      head('MTEXT'); o.push('10', n(p.x), '20', n(p.y), '40', n(e.textHeight), '71', String(e.attachmentPoint || 1));
      if (d && (d.x || d.y)) o.push('11', n(d.x), '21', n(d.y));
      for (let i = 0; i < t.length; i += 250) o.push(i + 250 < t.length ? '3' : '1', t.slice(i, i + 250));
      ext(); break;
    }
    case '3DFACE': case 'SOLID': case 'TRACE': {
      const c = [e.corner1, e.corner2, e.type === '3DFACE' ? e.corner3 : e.corner4, e.type === '3DFACE' ? e.corner4 : e.corner3].filter(Boolean);
      if (c.length < 3) break;
      head('LWPOLYLINE'); o.push('70', '1'); for (const p of c) o.push('10', n(p.x), '20', n(p.y));
      break;
    }
    default: break;
  }
}

// Droga 1: baza encji LibreDWG → nasz tekst DXF
async function viaDatabase(u8) {
  const L = await fresh();
  const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  const warn = console.warn, log = console.log; console.warn = console.log = () => {};
  let dwg;
  try { dwg = L.dwg_read_data(buf, mod.Dwg_File_Type.DWG); } finally { console.warn = warn; console.log = log; }
  if (!dwg) throw new Error(_t('LibreDWG nie odczytał tego pliku'));
  let db;
  try { db = L.convert(dwg); } finally { try { L.dwg_free(dwg); } catch (e) {} }
  const o = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', String(db.header?.INSUNITS || 0), '0', 'ENDSEC'];
  o.push('0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER');
  for (const l of db.tables?.LAYER?.entries || []) {
    const c = Math.abs(l.colorIndex || 7) || 7;
    o.push('0', 'LAYER', '2', l.name, '70', String(l.frozen ? 1 : 0), '62', String(l.off ? -c : c));
  }
  o.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'BLOCKS');
  const recs = db.tables?.BLOCK_RECORD?.entries || [];
  let model = null;
  for (const b of recs) {
    if (/^\*model_space$/i.test(b.name)) { model = b; continue; }
    if (/^\*paper_space/i.test(b.name)) continue;
    o.push('0', 'BLOCK', '2', b.name, '10', n(b.basePoint?.x), '20', n(b.basePoint?.y));
    for (const e of b.entities || []) writeEntity(o, e);
    o.push('0', 'ENDBLK');
  }
  o.push('0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
  const ents = model && model.entities && model.entities.length ? model.entities : (db.entities || []).filter(e => !model || e.ownerBlockRecordSoftId === model.handle);
  for (const e of ents) writeEntity(o, e);
  o.push('0', 'ENDSEC', '0', 'EOF', '');
  return o.join('\n');
}
// Droga 2: własny zapis DXF w LibreDWG (lepszy dla starych formatów R13–2000)
async function viaDxfWriter(u8) {
  const L = await fresh();
  const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  const W = L.wasmInstance;
  W.FS.writeFile('/in.dwg', new Uint8Array(buf));
  const rc = W.dwg_write_dxf('/in.dwg', '/out.dxf');
  if (rc >= 128 || !W.FS.analyzePath('/out.dxf', false).exists) throw new Error(_t('LibreDWG nie zapisał DXF (kod ') + rc + ')');
  return new TextDecoder().decode(W.FS.readFile('/out.dxf'));
}

// u8: zawartość pliku .dwg; parse: funkcja czytająca tekst DXF (parseDxf). Zwraca jej wynik.
// Próbujemy obu dróg i bierzemy pierwszą, która daje rysunek z liniami.
export async function readDwg(u8, parse) {
  let last = null;
  // 1) baza encji z tekstami, 2) zapis DXF w LibreDWG (ma teksty), 3) baza encji bez tekstów (gdy teksty psują odczyt)
  const ways = [[viaDatabase, true], [viaDxfWriter, true], [viaDatabase, false]];
  for (const [way, txt] of ways) {
    withText = txt;
    try { const d = parse(await way(u8)); if (d && (d.layers?.length || d.doc?.ents?.length)) { if (!txt && d.info) d.info.noText = true; return d; } }
    catch (e) { last = e; }
    finally { withText = true; }
  }
  throw new Error(_t('Nie udało się odczytać DWG') + (last && last.message ? ' (' + last.message + ')' : ''));
}
