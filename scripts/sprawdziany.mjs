// Sprawdziany rysowania: geometria, przyciąganie, kierunki, cofanie i skala — na samym modelu, bez okna programu.
//
//   node scripts/sprawdziany.mjs            — wszystkie przypadki, kod wyjścia 1 przy błędzie
//   node scripts/sprawdziany.mjs łuk        — tylko przypadki, których nazwa zawiera „łuk”
//   node scripts/sprawdziany.mjs -v         — także szczegóły udanych przypadków
//
// Jeden przypadek = krótki scenariusz i dokładny oczekiwany wynik (liczby, współrzędne). Zasady: .claude/skills/sprawdziany-rysowania.
// Bez Node: ELECTRON_RUN_AS_NODE=1 <Electron> scripts/sprawdziany.mjs (Electron z node_modules działa jak Node).

globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
const R = new URL('../renderer/', import.meta.url).href;
const G = await import(R + 'geom.js');
const M = await import(R + 'model.js');
const { Snapper, gridStep } = await import(R + 'snap.js');
const D = await import(R + 'draw.js');
const U = await import(R + 'units.js');
const SH = await import(R + 'sheet.js');
const PDF = await import(R + 'pdf.js');
const ED = await import(R + 'edit.js');
const { V } = G;

const P = [];
const przypadek = (nazwa, opis, fn) => P.push({ nazwa, opis, fn });
const pt = (p, d = 6) => p ? `(${p.map(v => +v.toFixed(d)).join('; ')})` : 'brak';
const near = (got, want, tol = 1e-6) => {
  if (typeof want === 'number') return typeof got === 'number' && Math.abs(got - want) <= tol;
  if (Array.isArray(want) && want.length && want.every(v => typeof v === 'number')) return Array.isArray(got) && got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) <= tol);
  return JSON.stringify(got) === JSON.stringify(want);
};
const sortPts = a => [...a].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
const L = (a, b) => ({ t: 'line', a, b });

/* ---------- geometria ---------- */
przypadek('przecięcie dwóch linii', 'krzyż: (0,0)–(2,0) i (1,−1)–(1,1)', () => {
  const x = G.intersect(L([0, 0], [2, 0]), L([1, -1], [1, 1]));
  return { 'liczba punktów': [x.length, 1], 'punkt': [x[0], [1, 0]] };
});
przypadek('przecięcie: linie równoległe', 'dwie poziome linie nie mają punktu wspólnego', () => ({ 'liczba punktów': [G.intersect(L([0, 0], [2, 0]), L([0, 1], [2, 1])).length, 0] }));
przypadek('przecięcie: linie stykające się końcami', 'L-ka: wspólny narożnik liczy się jako przecięcie', () => {
  const x = G.intersect(L([0, 0], [2, 0]), L([2, 0], [2, 2]));
  return { 'liczba punktów': [x.length, 1], 'punkt': [x[0], [2, 0]] };
});
przypadek('przecięcie: linie nie sięgają się', 'odcinki leżą na przecinających się prostych, ale same się nie stykają', () => ({ 'liczba punktów': [G.intersect(L([0, 0], [1, 0]), L([2, -1], [2, 1])).length, 0] }));
przypadek('przecięcie linii z okręgiem', 'linia przez środek okręgu r = 1 daje dwa punkty', () => {
  const x = sortPts(G.intersect(L([-2, 0], [2, 0]), { t: 'circle', c: [0, 0], r: 1 }));
  return { 'liczba punktów': [x.length, 2], 'lewy': [x[0], [-1, 0]], 'prawy': [x[1], [1, 0]] };
});
przypadek('przecięcie linii z łukiem — poza łukiem', 'górny półłuk i linia pod środkiem: brak przecięcia', () => ({ 'liczba punktów': [G.intersect(L([-2, -0.5], [2, -0.5]), { t: 'arc', c: [0, 0], r: 1, a0: 0, a1: Math.PI }).length, 0] }));
przypadek('przecięcie dwóch okręgów', 'okręgi r = 1 o środkach (0,0) i (1,0)', () => {
  const x = sortPts(G.intersect({ t: 'circle', c: [0, 0], r: 1 }, { t: 'circle', c: [1, 0], r: 1 }));
  const h = Math.sqrt(3) / 2;
  return { 'liczba punktów': [x.length, 2], 'dolny': [x[0], [0.5, -h]], 'górny': [x[1], [0.5, h]] };
});
przypadek('łuk przez trzy punkty', '(1,0) → (0,1) → (−1,0): górny półokrąg', () => {
  const a = G.arc3([1, 0], [0, 1], [-1, 0]);
  return { 'środek': [a.c, [0, 0]], 'promień': [a.r, 1], 'rozpiętość (°)': [G.sweep(a.a0, a.a1) * 180 / Math.PI, 180], 'środek łuku': [G.arcMid(a), [0, 1]] };
});
przypadek('łuk przez trzy punkty — w drugą stronę', '(−1,0) → (0,−1) → (1,0): dolny półokrąg', () => {
  const a = G.arc3([-1, 0], [0, -1], [1, 0]);
  return { 'środek łuku': [G.arcMid(a), [0, -1]], 'rozpiętość (°)': [G.sweep(a.a0, a.a1) * 180 / Math.PI, 180] };
});
przypadek('łuk przez trzy punkty na prostej', 'trzy punkty w linii nie tworzą łuku', () => ({ 'łuk': [G.arc3([0, 0], [1, 0], [2, 0]), null] }));
przypadek('łuk ze środka', 'środek (0,0), początek (2,0), koniec w kierunku (0,5): ćwiartka r = 2', () => {
  const a = G.arcCSE([0, 0], [2, 0], [0, 5]);
  return { 'promień': [a.r, 2], 'koniec': [G.arcEnd(a), [0, 2]], 'rozpiętość (°)': [G.sweep(a.a0, a.a1) * 180 / Math.PI, 90] };
});
przypadek('obrys łuku', 'górny półokrąg r = 1: obrys sięga y = 1, nie y = −1', () => ({ 'obrys': [G.bbox({ t: 'arc', c: [0, 0], r: 1, a0: 0, a1: Math.PI }), [-1, 0, 1, 1]] }));
przypadek('prostopadle do linii', 'z punktu (1,3) na linię (0,0)–(4,0)', () => ({ 'spodek': [G.perpFeet(L([0, 0], [4, 0]), [1, 3])[0], [1, 0]] }));
przypadek('prostopadle — poza odcinkiem', 'z punktu (6,3) na linię (0,0)–(4,0): spodek poza odcinkiem się nie liczy', () => ({ 'liczba': [G.perpFeet(L([0, 0], [4, 0]), [6, 3]).length, 0] }));
przypadek('styczne do okręgu', 'z punktu (2,0) do okręgu r = 1 w (0,0)', () => {
  const x = sortPts(G.tangentPts({ t: 'circle', c: [0, 0], r: 1 }, [2, 0]));
  const h = Math.sqrt(3) / 2;
  return { 'liczba': [x.length, 2], 'dolna': [x[0], [0.5, -h]], 'górna': [x[1], [0.5, h]] };
});
przypadek('styczne — punkt w okręgu', 'z wnętrza okręgu nie ma stycznych', () => ({ 'liczba': [G.tangentPts({ t: 'circle', c: [0, 0], r: 1 }, [0.2, 0]).length, 0] }));
przypadek('ramka w prawo', 'linia (1,1)–(2,2): w ramce (0,0)–(3,3) cała, w ramce (0,0)–(1.5,3) nie cała', () => ({
  'cała w ramce': [G.insideRect(L([1, 1], [2, 2]), [0, 0, 3, 3]), true], 'częściowo': [G.insideRect(L([1, 1], [2, 2]), [0, 0, 1.5, 3]), false]
}));
przypadek('ramka w lewo', 'linia przechodząca przez ramkę bez końców w środku jest „dotknięta”', () => ({
  'przecina ramkę': [G.touchesRect(L([-1, 1], [5, 1]), [0, 0, 2, 2]), true], 'obok ramki': [G.touchesRect(L([-1, 3], [5, 3]), [0, 0, 2, 2]), false],
  'okrąg otaczający ramkę': [G.touchesRect({ t: 'circle', c: [1, 1], r: 10 }, [0, 0, 2, 2]), false]
}));
przypadek('linia zerowej długości', 'punkt jako linia: najbliższy punkt i brak przecięcia z samą sobą nie wywracają programu', () => ({
  'odległość': [G.distTo(L([1, 1], [1, 1]), [4, 5]), 5], 'przecięcia z linią obok': [G.intersect(L([1, 1], [1, 1]), L([0, 0], [2, 0])).length, 0]
}));

/* ---------- model i cofanie ---------- */
przypadek('cofanie i ponawianie', 'dwie linie, cofnij jedną, ponów', () => {
  const d = M.newDoc(), h = new M.History(d);
  h.edit('Linia', tx => tx.add(L([0, 0], [1, 0])));
  const e2 = h.edit('Linia', tx => tx.add(L([0, 0], [0, 1])));
  const po = d.ents.length; h.undo(); const cof = d.ents.length; h.redo();
  return { 'po narysowaniu': [po, 2], 'po cofnięciu': [cof, 1], 'po ponowieniu': [d.ents.length, 2], 'ten sam numer': [d.ents[1].id, e2.id], 'następny numer': [d.next, e2.id + 1] };
});
przypadek('cofanie zmiany kreski i warstwy', 'linia dostaje 0,5 i inną warstwę, potem cofnięcie', () => {
  const d = M.newDoc(), h = new M.History(d);
  const e = h.edit('Linia', tx => tx.add(L([0, 0], [1, 0])));
  const lay = h.edit('Warstwa', tx => tx.addLayer({ name: 'Ściany', w: 0.5 }));
  h.edit('Kreska', tx => tx.set(e.id, { w: 0.7, layer: lay.id }));
  const po = [e.w, d.ents[0].layer === lay.id];
  h.undo();
  return { 'grubość po zmianie': [po[0], 0.7], 'na nowej warstwie': [po[1], true], 'grubość po cofnięciu': [d.ents[0].w, null], 'warstwa po cofnięciu': [d.ents[0].layer, 1] };
});
przypadek('pusta zmiana nie trafia do historii', 'ustawienie tej samej wartości nie tworzy kroku cofania', () => {
  const d = M.newDoc(), h = new M.History(d);
  const e = h.edit('Linia', tx => tx.add(L([0, 0], [1, 0])));
  h.edit('Nic', tx => tx.set(e.id, { a: [0, 0] }));
  return { 'kroki cofania': [h.undoStack.length, 1] };
});
przypadek('błąd w trakcie zmiany', 'zmiana przerwana błędem nie zostawia połowy w rysunku', () => {
  const d = M.newDoc(), h = new M.History(d);
  try { h.edit('Zepsuta', tx => { tx.add(L([0, 0], [1, 0])); throw new Error('x'); }); } catch (e) {}
  return { 'elementy': [d.ents.length, 0], 'kroki cofania': [h.undoStack.length, 0], 'następny numer': [d.next, 2] };
});
przypadek('usuwanie warstwy', 'warstwy z elementami i bieżącej nie da się usunąć; pustą tak', () => {
  const d = M.newDoc(), h = new M.History(d);
  const a = h.edit('W', tx => tx.addLayer({ name: 'A' })), b = h.edit('W', tx => tx.addLayer({ name: 'B' }));
  h.edit('Linia', tx => tx.add({ ...L([0, 0], [1, 0]), layer: a.id }));
  const zA = h.edit('Usuń', tx => tx.delLayer(a.id)), zBiez = h.edit('Usuń', tx => tx.delLayer(1)), zB = h.edit('Usuń', tx => tx.delLayer(b.id));
  return { 'z elementami': [zA, false], 'bieżąca': [zBiez, false], 'pusta': [zB, true], 'warstwy': [d.layers.length, 2] };
});
przypadek('kreska jak warstwa', 'element bez własnej kreski bierze ją z warstwy; własna wygrywa', () => {
  const d = M.newDoc();
  d.layers[0].w = 0.5; d.layers[0].lt = 'dash';
  const a = { ...L([0, 0], [1, 0]), layer: 1, w: null, lt: null }, b = { ...a, w: 0.18, lt: 'center' };
  return { 'jak warstwa': [[M.strokeOf(d, a).w, M.strokeOf(d, a).lt], [0.5, 'dash']], 'własna': [[M.strokeOf(d, b).w, M.strokeOf(d, b).lt], [0.18, 'center']] };
});
przypadek('otwieranie starego pliku', 'plik bez warstw i z nieznanym elementem otwiera się z warstwą domyślną', () => {
  const d = M.fixDoc({ format: 'rysio', version: 1, ents: [{ t: 'line', a: [0, 0], b: [1, 0] }, { t: 'kosmita' }] });
  return { 'elementy': [d.ents.length, 1], 'warstwy': [d.layers.length, 1], 'numer elementu': [d.ents[0].id > 0, true], 'skala': [d.scale, 50] };
});
przypadek('plik z nowszej wersji', 'rysunek z przyszłej wersji formatu nie otwiera się po cichu', () => {
  let msg = null; try { M.fixDoc({ format: 'rysio', version: 99 }); } catch (e) { msg = e.message; }
  return { 'odmowa': [!!msg, true] };
});

/* ---------- przyciąganie i kierunki ---------- */
const sn = () => new Snapper();
przypadek('przyciąganie: koniec przed środkiem', 'krótka linia — kursor bliżej środka, ale w zasięgu końca: wygrywa koniec', () => {
  const r = sn().find([0.04, 0.01], { tol: 0.1, ents: [L([0, 0], [0.1, 0])] });
  return { 'rodzaj': [r.kind, 'end'], 'punkt': [r.p, [0, 0]] };
});
przypadek('przyciąganie: środek', 'kursor przy połowie linii 4 m', () => { const r = sn().find([2.03, 0.02], { tol: 0.1, ents: [L([0, 0], [4, 0])] }); return { 'rodzaj': [r.kind, 'mid'], 'punkt': [r.p, [2, 0]] }; });
przypadek('przyciąganie: przecięcie', 'kursor przy skrzyżowaniu dwóch linii', () => {
  const r = sn().find([1.05, 0.04], { tol: 0.1, ents: [L([0, 0], [4, 0]), L([1, -2], [1, 2])] });
  return { 'rodzaj': [r.kind, 'int'], 'punkt': [r.p, [1, 0]] };
});
przypadek('przyciąganie: środek okręgu', 'kursor przy środku okręgu r = 2 (daleko od obwodu)', () => { const r = sn().find([0.05, 0.05], { tol: 0.1, ents: [{ t: 'circle', c: [0, 0], r: 2 }] }); return { 'rodzaj': [r.kind, 'center'], 'punkt': [r.p, [0, 0]] }; });
przypadek('przyciąganie: prostopadle', 'linia od (1,3) w dół do ściany (0,0)–(4,0)', () => {
  const r = sn().find([1.06, 0.03], { tol: 0.1, base: [1, 3], ents: [L([0, 0], [4, 0])] });
  return { 'rodzaj': [r.kind, 'perp'], 'punkt': [r.p, [1, 0]] };
});
przypadek('przyciąganie: styczna', 'od (2,0) do okręgu r = 1', () => {
  const r = sn().find([0.52, 0.84], { tol: 0.1, base: [2, 0], ents: [{ t: 'circle', c: [0, 0], r: 1 }] });
  return { 'rodzaj': [r.kind, 'tan'], 'punkt': [r.p, [0.5, Math.sqrt(3) / 2]] };
});
przypadek('przyciąganie: najbliższy', 'kursor przy linii, z dala od jej punktów', () => { const r = sn().find([2.7, 0.05], { tol: 0.1, ents: [L([0, 0], [4, 0])] }); return { 'rodzaj': [r.kind, 'near'], 'punkt': [r.p, [2.7, 0]] }; });
przypadek('przyciąganie: nic w pobliżu', 'kursor w pustym miejscu zostaje tam, gdzie jest', () => { const r = sn().find([10, 10], { tol: 0.1, ents: [L([0, 0], [4, 0])] }); return { 'rodzaj': [r.kind, null], 'punkt': [r.p, [10, 10]] }; });
przypadek('kierunek: poziomo od punktu', 'kursor lekko nad poziomem od bazy (0,0)', () => {
  const r = sn().find([3, 0.05], { tol: 0.1, base: [0, 0], ents: [] });
  return { 'punkt': [r.p, [3, 0]], 'kierunek': [r.guides[0]?.kind, 'h'] };
});
przypadek('kierunek: tylko kąty proste', 'kursor pod kątem ~30° — punkt ląduje na poziomie', () => {
  const r = sn().find([3, 1.7], { tol: 0.1, base: [0, 0], ents: [], ortho: true });
  return { 'punkt': [r.p, [3, 0]] };
});
przypadek('kierunek: równolegle do linii', 'po najechaniu na skośną linię kierunek od bazy biegnie równolegle do niej', () => {
  const s = sn(), skos = L([0, 0], [4, 3]);
  s.find([2, 1.5], { tol: 0.1, ents: [skos] });            // kursor przejeżdża po linii
  // kursor 4 cm obok kierunku (prostopadle do niego), 4 m od bazy
  const r = s.find([10 + 4 * 0.8 - 0.04 * 0.6, 4 * 0.6 + 0.04 * 0.8], { tol: 0.1, base: [10, 0], ents: [skos] });
  return { 'rodzaj kierunku': [r.guides[0]?.kind, 'par'], 'punkt': [r.p, [10 + 3.2, 2.4]] };
});
przypadek('śledzenie od dwóch punktów', 'pion od końca jednej linii i poziom od bazy — punkt na ich przecięciu', () => {
  const s = sn(), a = L([0, 0], [2, 0]);
  s.find([2.02, 0.01], { tol: 0.1, ents: [a] });           // kursor przy końcu (2,0) — punkt śledzenia
  const r = s.find([2.04, 5.03], { tol: 0.1, base: [-3, 5], ents: [a] });
  return { 'rodzaj': [r.kind, 'track'], 'punkt': [r.p, [2, 5]] };
});
przypadek('blokada kierunku', 'z ⇧ punkt zostaje na zablokowanym kierunku, nawet przy końcu innej linii obok', () => {
  const r = sn().find([2.06, 1.04], { tol: 0.1, base: [0, 0], lockDir: [1, 0], ents: [L([2, 1], [3, 1])] });
  return { 'punkt': [r.p, [2, 0]] };
});

/* ---------- skala i kreski ---------- */
przypadek('skala: 1 m w 1:100', 'odcinek 1 m w skali 1:100 to na papierze 10 mm', () => ({ 'mm papieru': [1000 / 100, 10], 'px na mm przy 100 px/m i 1:100': [D.pxPerPaperMM(100, 100), 10] }));
przypadek('grubość kreski na ekranie', '0,5 mm w 1:50 przy powiększeniu „papier 1:1” (189 px/m) ≈ 1,89 px', () => {
  const ppm = 1000 / 50 * D.PX_PER_MM;   // 1 mm papieru = 3,78 px
  return { '0,5 mm': [D.strokePx(0.5, ppm, 50), 0.5 * D.PX_PER_MM], 'przy dużym oddaleniu nie znika': [D.strokePx(0.13, 1, 50), 0.6], 'przy dużym zbliżeniu ma granicę': [D.strokePx(0.5, 1e5, 50), 0.5 * D.PX_PER_MM * 3], 'cienkie linie': [D.strokePx(0.7, ppm, 50, true), 1] };
});
przypadek('wymiary z klawiatury', 'jednostka cm: „600;400” = 6 × 4 m, „3,5m” = 3,5 m, „35mm” = 0,035 m', () => {
  U.setUnit('cm', false);
  const r = { '600;400': [U.parseLengths('600;400'), [6, 4]], '3,5m': [U.parseLength('3,5m'), 3.5], '35mm': [U.parseLength('35mm'), 0.035], 'bzdura': [U.parseLength('abc'), null] };
  U.setUnit('m', false); return r;
});

/* ---------- arkusze, tekst, wymiar, PDF (etap 2) ---------- */
// rysunek z arkuszem A3 poziomo i jednym oknem 1:100 pokazującym odcinek 1 m
function arkusz() {
  const d = M.newDoc(), h = new M.History(d);
  h.edit('Linia', tx => tx.add(L([0, 0], [1, 0])));
  h.edit('Arkusz', tx => tx.setDoc({ sheets: [M.newSheet(50, 1)] }));
  h.edit('Okno', tx => tx.add({ t: 'vp', sp: 50, a: [0.05, 0.05], b: [0.25, 0.15], scale: 100, c: [0.5, 0], hidden: [] }));
  return { d, h, sh: d.sheets[0] };
}
przypadek('okno: 1 m w 1:100 = 10 mm na arkuszu', 'początek i koniec odcinka przeliczone na arkusz', () => {
  const { d } = arkusz(), vp = d.ents.find(e => e.t === 'vp'), m = SH.vpMap(vp);
  const a = m.toSheet([0, 0]), b = m.toSheet([1, 0]);
  return { 'długość na arkuszu (mm)': [G.V.dist(a, b) * 1000, 10], 'środek okna = środek widoku modelu': [m.toSheet([0.5, 0]), [0.15, 0.1]], 'i z powrotem': [m.toModel(b), [1, 0]] };
});
przypadek('PDF: odcinek 1 m w oknie 1:100 ma 10 mm', 'w wygenerowanym PDF-ie szukamy odcinka i mierzymy go w punktach', () => {
  const { d, sh } = arkusz();
  const pdf = new TextDecoder('latin1').decode(PDF.makePdf(d, [sh], { fmtModel: v => v.toFixed(2), fmtSheet: v => String(Math.round(v * 1000)) }));
  // odcinek w oknie: pierwsze „x y m x y l S” po przycięciu (q … re W n)
  const after = pdf.slice(pdf.indexOf(' re W n'));
  const m = /([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l S/.exec(after);
  const len = m ? Math.hypot(+m[3] - +m[1], +m[4] - +m[2]) * 25.4 / 72 : null;
  const media = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf);
  return { 'długość (mm, pomiar co 0,001 mm)': [len === null ? null : +len.toFixed(3), 10], 'A3 poziomo (mm)': [media ? [Math.round(+media[1] * 25.4 / 72), Math.round(+media[2] * 25.4 / 72)] : null, [420, 297]], 'koniec pliku': [pdf.trimEnd().endsWith('%%EOF'), true] };
});
przypadek('PDF: polskie litery', '„Łódź, żółć” trafia do PDF-u przez własną tablicę znaków', () => {
  const d = M.newDoc(), h = new M.History(d);
  h.edit('Arkusz', tx => tx.setDoc({ sheets: [M.newSheet(50, 1)] }));
  h.edit('Tekst', tx => tx.add({ t: 'text', sp: 50, p: [0.05, 0.2], s: 'Łódź, żółć', h: 5, align: 'l' }));
  const pdf = new TextDecoder('latin1').decode(PDF.makePdf(d, d.sheets, {}));
  return { 'tekst w PDF': [pdf.includes('(\\007\\363d\\016, \\020\\363\\010\\004)'), true], 'tablica znaków': [pdf.includes('/Differences [1 /Aogonek'), true] };
});
przypadek('tekst: wysokość w mm wydruku', 'tekst 2,5 mm w modelu 1:50 ma 0,125 m, na arkuszu 2,5 mm', () => {
  const t = { t: 'text', p: [0, 0], s: 'Ab', h: 2.5, align: 'l' };
  G.setAnno(0.05); const bm = G.textBox(t); G.setAnno(0.001); const bs = G.textBox(t); G.setAnno(0.05);
  return { 'wysokość w modelu 1:50 (m)': [bm[3], 0.125], 'wysokość na arkuszu (m)': [bs[3], 0.0025] };
});
przypadek('wymiar poziomy, pionowy i równoległy', 'odcinek (0,0)–(3,4): poziomo 3, pionowo 4, równolegle 5', () => {
  const w = dir => G.dimGeom({ t: 'dim', a: [0, 0], b: [3, 4], o: [-1, 6], dir }).value;
  return { 'poziomo': [w('h'), 3], 'pionowo': [w('v'), 4], 'równolegle': [w('a'), 5] };
});
przypadek('przesunięcie okna', 'okno przesunięte po arkuszu pokazuje ten sam fragment modelu', () => {
  const { d, h } = arkusz(), vp = d.ents.find(e => e.t === 'vp');
  h.edit('Przesuń', tx => tx.set(vp.id, G.moved(vp, [0.1, 0])));
  return { 'środek widoku modelu': [d.ents.find(e => e.t === 'vp').c, [0.5, 0]], 'okno przesunięte': [d.ents.find(e => e.t === 'vp').a, [0.15, 0.05]] };
});
przypadek('nowy element trafia na bieżący arkusz', 'gdy pracuje się na arkuszu, linia dostaje jego numer', () => {
  const { d, h } = arkusz();
  Object.defineProperty(d, '_space', { value: 50, writable: true, enumerable: false, configurable: true });
  const e = h.edit('Linia', tx => tx.add(L([0, 0], [0.1, 0])));
  return { 'przestrzeń': [e.sp, 50], 'nie trafia do pliku': [JSON.stringify(d).includes('_space'), false] };
});
przypadek('otwieranie: elementy usuniętego arkusza znikają', 'element z arkusza, którego nie ma w pliku, nie zostaje sierotą', () => {
  const d = M.fixDoc({ format: 'rysio', version: 1, sheets: [{ id: 7, name: 'A' }], ents: [{ t: 'line', a: [0, 0], b: [1, 0], sp: 9 }, { t: 'line', a: [0, 0], b: [1, 0], sp: 7 }, { t: 'vp', a: [0, 0], b: [1, 1], c: [0, 0], scale: 50 }] });
  return { 'elementy': [d.ents.length, 1], 'arkusz ma domyślne pola': [d.sheets[0].size, 'A3'] };
});
przypadek('skale do tabelki', 'dwa okna 1:100 i 1:20 → „1:100, 1:20”', () => {
  const { d, h, sh } = arkusz();
  h.edit('Okno', tx => tx.add({ t: 'vp', sp: 50, a: [0.3, 0.05], b: [0.4, 0.15], scale: 20, c: [0, 0], hidden: [] }));
  return { 'tabelka': [SH.titleScales(d, sh), '1:100, 1:20'] };
});

przypadek('PDF nie zostawia skali tekstu arkusza', 'po eksporcie skala tekstu wraca do skali modelu (inaczej teksty w modelu źle się zaznaczają)', () => {
  const { d, sh } = arkusz(); G.setAnno(0.05);
  PDF.makePdf(d, [sh], {});
  return { 'ANNO po eksporcie': [G.ANNO, 0.05] };
});
przypadek('okno nie znika z ukrytą warstwą', 'ukrycie bieżącej warstwy w modelu nie chowa okna na arkuszu', () => {
  const { d } = arkusz(), vp = d.ents.find(e => e.t === 'vp');
  d.layers[0].visible = false; d.layers[0].locked = true;
  return { 'okno widoczne': [M.isShown(d, vp), true], 'okno da się zaznaczyć': [M.isLive(d, vp), true] };
});
przypadek('numer po arkuszu', 'plik z zaniżonym „next” nie daje elementu o numerze arkusza', () => {
  const d = M.fixDoc({ format: 'rysio', version: 1, next: 2, sheets: [{ id: 40, name: 'A' }], ents: [] });
  return { 'następny numer większy od arkusza': [d.next > 40, true] };
});

/* ---------- zmienianie (etap 3) ---------- */
const r6 = p => p.map(v => +v.toFixed(6));
przypadek('grubości ISO do 2 mm', 'pasek grubości ma pełny szereg 0,13–2,0', () => ({ 'grubości': [M.WEIGHTS, [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1, 1.4, 2]] }));
przypadek('polilinia z łukiem', 'wybrzuszenie 1 między (0,0) a (2,0) to półokrąg pod spodem, środek (1,0)', () => {
  const e = { t: 'pline', pts: [[0, 0, 1], [2, 0]], closed: false }, q = G.plineParts(e)[0];
  return { 'część': [q.k, 'arc'], 'środek': [q.c, [1, 0]], 'promień': [q.r, 1], 'środek łuku': [G.midpoints(e)[0], [1, -1]], 'długość': [G.lengthOf(e), Math.PI] };
});
przypadek('przytnij linię między dwiema innymi', 'linia (0,0)–(10,0) przecięta pionami w x=3 i x=7; klik w środek wycina odcinek 3–7', () => {
  const e = L([0, 0], [10, 0]), r = ED.trimAt(e, [5, 0], [L([3, -1], [3, 1]), L([7, -1], [7, 1])]);
  return { 'kawałki': [r.replace.length, 2], 'lewy': [[...r.replace[0].a, ...r.replace[0].b], [0, 0, 3, 0]], 'prawy': [[...r.replace[1].a, ...r.replace[1].b], [7, 0, 10, 0]] };
});
przypadek('przytnij koniec linii', 'klik za ostatnim przecięciem obcina końcówkę', () => {
  const r = ED.trimAt(L([0, 0], [10, 0]), [9, 0], [L([7, -1], [7, 1])]);
  return { 'kawałki': [r.replace.length, 1], 'zostaje': [[...r.replace[0].a, ...r.replace[0].b], [0, 0, 7, 0]] };
});
przypadek('przytnij: nic do zrobienia', 'linia bez przecięć zostaje bez zmian', () => ({ 'wynik': [ED.trimAt(L([0, 0], [10, 0]), [5, 0], [L([0, 5], [10, 5])]), null] }));
przypadek('przytnij okrąg', 'okrąg przecięty linią przez środek — klik w górną połowę zostawia dolną', () => {
  const r = ED.trimAt({ t: 'circle', c: [0, 0], r: 1 }, [0, 1], [L([-2, 0], [2, 0])]), a = r.replace[0];
  return { 'zostaje łuk': [a.t, 'arc'], 'środek łuku (na dole)': [r6(G.arcMid(a)), [0, -1]] };
});
przypadek('przytnij zamkniętą polilinię', 'prostokąt 4×2 przecięty pionem x=1 — klik w lewy bok zostawia otwartą polilinię bez niego', () => {
  const e = { t: 'pline', pts: [[0, 0], [4, 0], [4, 2], [0, 2]], closed: true };
  const r = ED.trimAt(e, [0, 1], [L([1, -1], [1, 3])]), q = r.replace[0];
  return { 'kawałki': [r.replace.length, 1], 'otwarta': [q.closed, false], 'początek i koniec': [[...q.pts[0].slice(0, 2), ...q.pts[q.pts.length - 1].slice(0, 2)], [1, 0, 1, 2]], 'długość': [G.lengthOf(q), 3 + 2 + 3] };
});
przypadek('wydłuż do łuku', 'linia (0,0)–(2,0) wydłużona do łuku r=5 o środku w (0,0)', () => {
  const r = ED.extendAt(L([0, 0], [2, 0]), [1.9, 0], [{ t: 'arc', c: [0, 0], r: 5, a0: -0.5, a1: 0.5 }]);
  return { 'nowy koniec': [r6(r.b), [5, 0]] };
});
przypadek('wydłuż: nic na drodze', 'linia bez celu na przedłużeniu zostaje', () => ({ 'wynik': [ED.extendAt(L([0, 0], [2, 0]), [1.9, 0], [L([0, 5], [9, 5])]), null] }));
przypadek('wydłuż łuk do linii', 'ćwiartka okręgu r=1 dosunięta do pionu x=−0,5', () => {
  const r = ED.extendAt({ t: 'arc', c: [0, 0], r: 1, a0: 0, a1: Math.PI / 2 }, [0, 1], [L([-0.5, -2], [-0.5, 2])]);
  return { 'nowy kąt końca (°)': [+(r.a1 * 180 / Math.PI).toFixed(6), 120] };
});
przypadek('jedno kliknięcie: przytnij albo wydłuż', 'klik przy końcu bez przecięcia — wydłuża; klik w kawałek za przecięciem — przycina', () => {
  const sciana = L([5, -1], [5, 1]);
  const a = ED.trimOrExtend(L([0, 0], [3, 0]), [2.9, 0], [sciana]);
  const b = ED.trimOrExtend(L([0, 0], [8, 0]), [7, 0], [sciana]);
  return { 'krótka linia': [a.kind, 'extend'], 'koniec': [r6(a.set.b), [5, 0]], 'długa linia': [b.kind, 'trim'], 'zostaje': [[...b.replace[0].a, ...b.replace[0].b], [0, 0, 5, 0]] };
});
przypadek('zaokrąglij dwie linie promieniem', 'linie (0,0)–(5,0) i (0,0)–(0,5), r = 1: łuk od (1,0) do (0,1), środek (1,1)', () => {
  const r = ED.filletLines(L([0, 0], [5, 0]), [4, 0], L([0, 0], [0, 5]), [0, 4], 1);
  return { 'linia 1': [r6(r.l1.a), [1, 0]], 'linia 2': [r6(r.l2.a), [0, 1]], 'środek łuku': [r6(r.arc.c), [1, 1]], 'promień': [r.arc.r, 1], 'rozpiętość (°)': [+(G.sweep(r.arc.a0, r.arc.a1) * 180 / Math.PI).toFixed(6), 90] };
});
przypadek('zaokrąglij z promieniem 0', 'linie, które się nie stykają, dostają ostry narożnik w przecięciu', () => {
  const r = ED.filletLines(L([1, 0], [5, 0]), [4, 0], L([0, 1], [0, 5]), [0, 4], 0);
  return { 'linia 1 od narożnika': [r.l1.a, [0, 0]], 'linia 2 od narożnika': [r.l2.a, [0, 0]], 'bez łuku': [r.arc, undefined] };
});
przypadek('zaokrąglij: linie równoległe i za duży promień', 'równoległe nie mają narożnika; promień większy niż linie — odmowa', () => ({
  'równoległe': [ED.filletLines(L([0, 0], [5, 0]), [1, 0], L([0, 1], [5, 1]), [1, 1], 1).error, 'parallel'],
  'za duży': [ED.filletLines(L([0, 0], [1, 0]), [0.5, 0], L([0, 0], [0, 1]), [0, 0.5], 5).error, 'tooBig']
}));
// polilinia: kwadrat 4×4 z górnym bokiem jako półokrąg (wybrzuszenie)
const zLukiem = () => ({ t: 'pline', pts: [[0, 0], [4, 0], [4, 4, 1], [0, 4]], closed: true });
przypadek('odsuń polilinię z łukiem do środka', 'kształt z półokrągłym bokiem odsunięty o 0,5 do środka', () => {
  const r = ED.offsetEnt(zLukiem(), 0.5, [2, 2]), q = G.plineParts(r).find(x => x.k === 'arc');
  return { 'zamknięta': [r.closed, true], 'wierzchołki': [r.pts.length, 4], 'promień łuku': [+q.r.toFixed(6), 1.5], 'dół': [r6(r.pts[0].slice(0, 2)), [0.5, 0.5]] };
});
przypadek('odsuń polilinię z łukiem na zewnątrz', 'ten sam kształt odsunięty o 0,5 na zewnątrz', () => {
  const r = ED.offsetEnt(zLukiem(), 0.5, [2, -3]), q = G.plineParts(r).find(x => x.k === 'arc');
  return { 'promień łuku': [+q.r.toFixed(6), 2.5], 'dół': [r6(r.pts[0].slice(0, 2)), [-0.5, -0.5]] };
});
przypadek('odsuń linię i okrąg', 'linia o 1 w górę, okrąg r=2 o 0,5 do środka, okrąg za mały — odmowa', () => ({
  'linia': [[...ED.offsetEnt(L([0, 0], [3, 0]), 1, [1, 5]).a], [0, 1]],
  'okrąg': [ED.offsetEnt({ t: 'circle', c: [0, 0], r: 2 }, 0.5, [0.1, 0]).r, 1.5],
  'za mały': [ED.offsetEnt({ t: 'circle', c: [0, 0], r: 0.3 }, 0.5, [0.1, 0]).error, 'tooBig']
}));
przypadek('obróć', 'linia (1,0)–(2,0) obrócona o 90° wokół (0,0); wymiar poziomy staje się pionowy', () => {
  const T = ED.rotation([0, 0], Math.PI / 2), l = ED.transformed(L([1, 0], [2, 0]), T);
  const d = ED.transformed({ t: 'dim', a: [0, 0], b: [2, 0], o: [0, -1], dir: 'h' }, T);
  return { 'linia': [[...r6(l.a), ...r6(l.b)], [0, 1, 0, 2]], 'wymiar': [d.dir, 'v'], 'o 30° → równoległy': [ED.transformed({ t: 'dim', a: [0, 0], b: [2, 0], o: [0, -1], dir: 'h' }, ED.rotation([0, 0], Math.PI / 6)).dir, 'a'] };
});
przypadek('odbij', 'łuk górny odbity względem osi poziomej staje się dolny; polilinia z łukiem zmienia kierunek wybrzuszenia', () => {
  const T = ED.mirroring([0, 0], [1, 0]), a = ED.transformed({ t: 'arc', c: [0, 0], r: 1, a0: 0, a1: Math.PI }, T);
  const pl = ED.transformed({ t: 'pline', pts: [[0, 0, 0.5], [2, 0]] }, T);
  return { 'środek łuku': [r6(G.arcMid({ ...a, t: 'arc' })), [0, -1]], 'wybrzuszenie': [pl.pts[0][2], -0.5] };
});
przypadek('skaluj', 'okrąg r=1 w (2,0) skalowany ×2 wokół (0,0); tekst zachowuje wysokość', () => {
  const T = ED.scaling([0, 0], 2), c = ED.transformed({ t: 'circle', c: [2, 0], r: 1 }, T), t = ED.transformed({ t: 'text', p: [1, 1], s: 'A', h: 3.5 }, T);
  return { 'środek': [c.c, [4, 0]], 'promień': [c.r, 2], 'tekst': [[t.p, t.h], [[2, 2], undefined]] };
});

/* ---------- błędy z recenzji etapu 3 (najpierw przypadek, potem poprawka) ---------- */
const prost = () => ({ t: 'pline', pts: [[0, 0], [4, 0], [4, 2], [0, 2]], closed: true });
przypadek('przytnij zamkniętą: jedno przecięcie', 'prostokąt i linia wchodząca tylko w jeden bok — nic nie znika', () => ({
  'wynik': [ED.trimAt(prost(), [2, 0], [L([2, 1], [2, 5])]), null]
}));
przypadek('przytnij zamkniętą: przecięcie w pierwszym wierzchołku', 'przecięcia w narożniku (0,0) i na boku x=3 — klik w górny bok zostawia resztę', () => {
  const r = ED.trimAt(prost(), [2, 2], [L([-1, -1], [1, 1]), L([3, 3], [3, 1])]), q = r && r.replace[0];
  // końce bez względu na kierunek: (0,0) i (3,2); zostaje dół, prawy bok i kawałek góry: 4 + 2 + 1
  const ends = q ? [q.pts[0].slice(0, 2), q.pts[q.pts.length - 1].slice(0, 2)].sort((x, y) => x[0] - y[0]) : null;
  return { 'kawałki': [r ? r.replace.length : null, 1], 'końce': [ends ? ends.flat() : null, [0, 0, 3, 2]], 'długość': [q ? G.lengthOf(q) : null, 7] };
});
przypadek('przyciąganie do wierzchołka z łukiem', 'punkt przyciągnięty do wierzchołka nie niesie wybrzuszenia', () => {
  const r = new Snapper().find([0.001, 0.001], { tol: 0.05, ents: [{ t: 'pline', pts: [[0, 0, 0.5], [2, 0], [2, 2]] }] });
  return { 'punkt': [r.p, [0, 0]] };
});
przypadek('odsuń polilinię: ostry narożnik', 'bok prawie wraca po sobie — drugi bok odsunięty równolegle', () => {
  const r = ED.offsetEnt({ t: 'pline', pts: [[0, 0], [4, 0], [0, 0.2]] }, 1, [2, -1]);
  const last = r.pts[r.pts.length - 1], prev = r.pts[r.pts.length - 2];
  // odsunięty drugi bok: odległość jego końca od prostej oryginału (4,0)–(0,0.2) ma być 1
  const d = Math.abs(G.V.cross(G.V.norm(G.V.sub([0, 0.2], [4, 0])), G.V.sub(last, [4, 0])));
  const dp = Math.abs(G.V.cross(G.V.norm(G.V.sub([0, 0.2], [4, 0])), G.V.sub(prev, [4, 0])));
  return { 'koniec w odległości 1': [+d.toFixed(6), 1], 'początek boku w odległości 1': [+dp.toFixed(6), 1] };
});
przypadek('odsuń do środka za daleko', 'prostokąt 4×2 do środka o 1,5 — odmowa zamiast wywiniętej figury', () => ({
  'wynik': [ED.offsetEnt(prost(), 1.5, [2, 1]).error, 'tooBig']
}));
przypadek('przytnij / wydłuż: ten sam kawałek', 'klik w dowolne miejsce kawałka 0–8 (z dala od końca) przycina ten kawałek', () => {
  const others = [L([8, -1], [8, 1]), L([-2, -1], [-2, 1])];
  const a = ED.trimOrExtend(L([0, 0], [10, 0]), [4, 0], others, 0.2), b = ED.trimOrExtend(L([0, 0], [10, 0]), [6, 0], others, 0.2);
  const c = ED.trimOrExtend(L([0, 0], [10, 0]), [0.1, 0], others, 0.2);
  return { 'klik w 4': [a.kind, 'trim'], 'klik w 6': [b.kind, 'trim'], 'klik przy samym końcu': [c.kind, 'extend'] };
});
przypadek('zamknięta polilinia z dwoma wierzchołkami', 'dwa wierzchołki z wybrzuszeniem 1 i zamknięcie — pełny okrąg', () => {
  const e = { t: 'pline', closed: true, pts: [[0, 0, 1], [2, 0, 1]] };
  return { 'części': [G.plineParts(e).length, 2], 'obrys': [G.bbox(e).map(v => +v.toFixed(6)), [0, -1, 2, 1]] };
});

przypadek('przytnij kilka kawałków jednym przeciągnięciem', 'trzy poziome linie przecięte dwoma pionami; ślad przez środki usuwa trzy środkowe kawałki', () => {
  const pion1 = { ...L([3, -1], [3, 5]), id: 101 }, pion2 = { ...L([7, -1], [7, 5]), id: 102 };
  const hs = [0, 2, 4].map((y, i) => ({ ...L([0, y], [10, y]), id: i + 1 }));
  const r = ED.trimMany(hs.map(e => ({ e, p: [5, e.a[1]] })), [...hs, pion1, pion2], 'trim');
  return { 'zmienione linie': [r.length, 3], 'kawałki każdej': [r.map(x => x.replace.length), [2, 2, 2]], 'lewy kawałek pierwszej': [[...r[0].replace[0].a, ...r[0].replace[0].b], [0, 0, 3, 0]] };
});
przypadek('ten sam element przecięty dwa razy', 'ślad przecina linię w dwóch kawałkach — oba znikają', () => {
  const e = { ...L([0, 0], [10, 0]), id: 1 }, cut = [3, 6].map((x, i) => ({ ...L([x, -1], [x, 1]), id: 10 + i }));
  const r = ED.trimMany([{ e, p: [1.5, 0] }, { e, p: [8, 0] }], [e, ...cut], 'trim');
  return { 'zostaje jeden kawałek': [r[0].replace.length, 1], 'środek 3–6': [[...r[0].replace[0].a, ...r[0].replace[0].b], [3, 0, 6, 0]] };
});
przypadek('wydłuż kilka linii jednym przeciągnięciem', 'trzy krótkie linie wydłużone do ściany x=8', () => {
  const sciana = { ...L([8, -1], [8, 5]), id: 100 }, hs = [0, 2, 4].map((y, i) => ({ ...L([0, y], [5, y]), id: i + 1 }));
  const r = ED.trimMany(hs.map(e => ({ e, p: [4.9, e.a[1]] })), [...hs, sciana], 'extend');
  return { 'wydłużone': [r.map(x => x.kind), ['extend', 'extend', 'extend']], 'końce': [r.map(x => x.set.b[0]), [8, 8, 8]] };
});

przypadek('ślad trafia dwa razy w ten sam kawałek', 'klik i przeciągnięcie w obrębie jednego kawałka nie przycina sąsiedniego', () => {
  const e = { ...L([0, 0], [10, 0]), id: 1 }, cut = [3, 6].map((x, i) => ({ ...L([x, -1], [x, 1]), id: 10 + i }));
  const r = ED.trimMany([{ e, p: [4, 0] }, { e, p: [5, 0] }], [e, ...cut], 'auto', 0.05);
  return { 'zostają dwa kawałki': [r[0].replace.length, 2] };
});

przypadek('przyciąganie do siatki', 'kursor obok węzła siatki co 1 m trafia w węzeł; koniec linii ma pierwszeństwo', () => {
  const a = new Snapper().find([2.03, 0.98], { tol: 0.05, ents: [], grid: 1 });
  const b = new Snapper().find([2.03, 0.98], { tol: 0.05, ents: [{ ...L([2.04, 0.97], [5, 0.97]), id: 1 }], grid: 1 });
  const c = new Snapper().find([2.5, 0.5], { tol: 0.05, ents: [], grid: 1 });
  return { 'węzeł': [[...a.p, a.kind], [2, 1, 'grid']], 'koniec wygrywa': [b.kind, 'end'], 'z dala od węzła': [c.kind, null],
    'odstęp przy 60 px/m': [gridStep(60), 1],
    'poziom od punktu wygrywa z siatką': [(() => { const r = new Snapper().find([3.04, 0.07], { tol: 0.08, ents: [], base: [0, 0.037], grid: 1 }); return [r.kind, +r.p[1].toFixed(3)]; })(), ['guide', 0.037]],
    'punkt na linii wygrywa z siatką': [new Snapper().find([2.02, 0.97], { tol: 0.05, ents: [{ ...L([0, 0.95], [5, 0.95]), id: 1 }], grid: 1 }).kind, 'near'], 'przy 600 px/m': [gridStep(600), 0.1] };
});

przypadek('uchwyty: koniec, środek, wierzchołek, promień', 'przeciąganie uchwytów zmienia tylko to, co trzeba', () => {
  const ln = L([0, 0], [4, 0]);
  const mid = ED.gripMove(ln, 'mv', [2, 1]);
  const end = ED.gripMove(ln, 'b', [4, 3]);
  const pl = { t: 'pline', pts: [[0, 0, 0.5], [2, 0], [2, 2]] };
  const v0 = ED.gripMove(pl, 'v0', [1, -1]);
  const ci = ED.gripMove({ t: 'circle', c: [0, 0], r: 1 }, 'r', [0, 3]);
  const ar = ED.gripMove({ t: 'arc', c: [0, 0], r: 1, a0: 0, a1: Math.PI / 2 }, 'a1', [-1, 0]);
  return { 'środek przesuwa całą': [[...mid.a, ...mid.b], [0, 1, 4, 1]], 'koniec': [end.b, [4, 3]], 'wierzchołek z łukiem': [v0.pts[0], [1, -1, 0.5]],
    'promień': [ci.r, 3], 'kąt końca łuku': [+ar.a1.toFixed(6), +Math.PI.toFixed(6)], 'uchwyty linii': [ED.gripsOf(ln).length, 3],
    'koniec łuku na początek — odrzucone': [ED.gripMove({ t: 'arc', c: [0, 0], r: 1, a0: 0, a1: Math.PI / 2 }, 'a1', [1, 0]), null],
    'koniec linii na drugi koniec — odrzucone': [ED.gripMove(ln, 'b', [0, 0]), null] };
});

/* ---------- uruchomienie ---------- */
const args = process.argv.slice(2), verbose = args.includes('-v'), filt = args.find(a => a !== '-v')?.toLowerCase();
const fmt = x => typeof x === 'number' ? (Number.isInteger(x) ? String(x) : x.toFixed(6)) : Array.isArray(x) && x.length && x.every(v => typeof v === 'number') ? pt(x) : JSON.stringify(x);
let bad = 0, n = 0;
for (const c of P) {
  if (filt && !c.nazwa.toLowerCase().includes(filt)) continue;
  n++;
  let res, err = null;
  try { res = c.fn(); } catch (e) { err = e; }
  const fails = err ? [] : Object.entries(res).filter(([, [got, want]]) => !near(got, want));
  if (err || fails.length) {
    bad++;
    console.log(`✗ ${c.nazwa} — ${c.opis}`);
    if (err) console.log(`    błąd: ${err.stack || err.message}`);
    for (const [k, [got, want]] of fails) console.log(`    ${k}: jest ${fmt(got)}, powinno być ${fmt(want)}`);
  } else {
    console.log(`✓ ${c.nazwa}`);
    if (verbose) for (const [k, [got]] of Object.entries(res)) console.log(`    ${k}: ${fmt(got)}`);
  }
}
console.log(`\n${n - bad} z ${n} przypadków.`);
process.exit(bad ? 1 : 0);
