# Architektura Rysia

Ten plik poprawia się przy każdej zmianie, która go dezaktualizuje. Co budujemy — `OPIS.md`; zasady — `CLAUDE.md`.

## Decyzje

### Rysowanie na ekranie: płótno 2D

Ekran rysuje jedno płótno (`<canvas>`), przerysowywane w całości przy zmianie widoku albo rysunku. SVG odrzuciliśmy, bo:

- podkład z DWG ma dziesiątki tysięcy linii — każda linia jako element strony zatyka przeglądarkę przy przesuwaniu i przybliżaniu, a płótno rysuje je w jednym przebiegu;
- „SVG jest wektorowe” nie daje PDF-u za darmo — PDF i tak trzeba złożyć osobno, z właściwą skalą, czcionkami i formatem arkusza.

Rysowanie idzie przez jedno miejsce (`renderer/draw.js`), które dostaje „pióro” z prostymi poleceniami (linia, łuk, okrąg, kreska, tekst). Pióro ekranowe rysuje na płótnie; w etapie 2 dojdzie pióro PDF, które tymi samymi poleceniami zapisze wektorowy plik w skali. Dzięki temu ekran i wydruk nie rozjadą się.

Szybkość przy dużych podkładach: każdy element ma zapamiętany prostokąt obrysu; przerysowanie i przyciąganie pomijają elementy poza widokiem. Gdyby to nie wystarczyło (podkład > 100 tys. elementów), następny krok to siatka kubełków (indeks przestrzenny) — miejsce jest w `geom.js` / `snap.js`.

### Model danych

Rysunek (`doc`) to zwykły obiekt JSON:

```
doc = {
  format: 'rysio', version: 1,
  units: 'm',                 // jednostka wpisywania i pokazywania wymiarów (m | cm | mm)
  scale: 50,                  // skala rysunku 1:scale — od niej zależą kreski na ekranie
  layers: [ { id, name, color, visible, locked, w, lt } ],   // w — grubość w mm papieru, lt — rodzaj linii
  cur: { layer, w, lt },      // warstwa i kreska dla nowych elementów (w/lt = null → „jak warstwa”)
  ents: [ element… ],
  next: 1                     // następny wolny numer elementu
}
```

Elementy (współrzędne w metrach, oś Y w górę jak w DXF):

| `t` | pola |
|---|---|
| `line` | `a: [x,y]`, `b: [x,y]` |
| `pline` | `pts: [[x,y]…]`, `closed` (prostokąt to zamknięta polilinia) |
| `circle` | `c: [x,y]`, `r` |
| `arc` | `c`, `r`, `a0`, `a1` — kąty w radianach, łuk biegnie przeciwnie do wskazówek zegara od `a0` do `a1` |

Każdy element ma też `id`, `layer` (id warstwy) oraz `w` i `lt`: `null` znaczy „jak warstwa”, liczba / nazwa — kreska ustawiona na elemencie. Rodzaje linii: `solid`, `dash`, `center`, `dot`.

Etap 2 dodał:

| `t` | pola |
|---|---|
| `text` | `p` (początek linii bazowej), `s` (tekst, wiersze przez `\n`), `h` — wysokość w **mm wydruku**, `align` l/c/r |
| `dim` | `a`, `b` — mierzone punkty, `o` — punkt na linii wymiarowej, `dir` h/v/a (poziomo, pionowo, równolegle) |
| `vp` | okno na arkuszu: `a`, `b` — narożniki na arkuszu, `scale`, `c` — punkt modelu w środku okna, `hidden` — warstwy ukryte w tym oknie, `locked` |

**Arkusze.** `doc.sheets = [{ id, name, size: 'A4'…'A0', land, frame, title: { rysunek, nr } }]`, `doc.project = { projekt, projektant, data }` (wspólne pola tabelki). Elementy arkusza leżą w tym samym `doc.ents` z polem `sp` = numer arkusza; elementy modelu nie mają `sp`. Dzięki temu zaznaczanie, przesuwanie, kopiowanie, usuwanie i cofanie działają na arkuszu bez osobnego kodu. Współrzędne arkusza to metry papieru (1 mm = 0,001), początek w lewym dolnym rogu; arkusz ma skalę 1:1. Program trzyma bieżącą przestrzeń w `doc._space` (niewidoczne dla zapisu) — z niego `tx.add` bierze `sp` nowych elementów.

**Tekst i wymiary w każdej skali.** Wysokość tekstu i liczby wymiaru jest w milimetrach wydruku i przelicza się według skali przestrzeni: w modelu 1:50 napis 3,5 mm ma 0,175 m, w oknie 1:100 ma na papierze nadal 3,5 mm. Geometria liczy to przez `ANNO` z `geom.js` (metry na mm papieru), które program ustawia przy zmianie przestrzeni, a rysowanie okna — na czas rysowania zawartości.

**Bloki (etap 4).** Definicja bloku to `doc.blocks: [{ id, name }]`; jej elementy leżą w zwykłym `doc.ents` z `sp: 'b' + id`, we własnym układzie (punkt wstawienia w zerze). Dzięki temu edycja w miejscu to po prostu praca w innej „przestrzeni” (`app.spaceKey()`), z cofaniem i wszystkimi narzędziami bez zmian. Wstawienie to `{ t: 'ins', b, p, rot, s, mx }` — punkt, obrót, skala jednakowa w obu kierunkach i odbicie w osi X bloku. Geometria wstawienia (`partsOf`, końce, środki, obrys) liczy się z elementów bloku przeniesionych przekształceniem `insXf` i jest pamiętana do następnej zmiany rysunku (`setBlocks` po każdej zmianie); dlatego przyciąganie, zaznaczanie, przecięcia i gumka działają na blokach bez osobnego kodu. Rysowanie: pióro z przekształceniem (`pen.sub(f, k, tr)`), łuki jako krzywe Béziera przez przeliczone punkty, więc obrót i odbicie nie psują łuków; odbity tekst zostaje czytelny. Elementy bloku mają własne warstwy i kreski (bez „warstwy 0” jak w AutoCAD-zie). Bloki są tylko w modelu.

**Kreskowanie (etap 4).** `{ t: 'hatch', loops, pat, ps, ang }` — pętle punktów (zasada parzystości: otwory), wzór (`diag`, `cross`, `conc`, `ins`, `soil`, `solid`), mnożnik gęstości i kąt. Wzory są w milimetrach wydruku (`hatch.js`), kreski liczą się przy rysowaniu i są pamiętane. Obszar pod kliknięciem: wszystkie widoczne krzywe → odcinki, podział w przecięciach, usunięcie wiszących końców, obejście ścian grafu; obszar to najmniejsza ściana z punktem, a osobne kształty w niej to otwory. Kreskowanie nie jest związane z liniami (przesunięcie ściany go nie zmienia).

**Łuki w polilinii (etap 3).** Wierzchołek polilinii może mieć trzeci element: `[x, y, b]`, gdzie `b` to wybrzuszenie jak w DXF (`tan(θ/4)`, dodatnie — przeciwnie do wskazówek zegara) dla odcinka do następnego wierzchołka. `plineParts()` w `geom.js` zamienia polilinię na kolejne odcinki i łuki; z tego korzystają rysowanie, przyciąganie, przecięcia, odsunięcie i przycinanie. Prostokąt i zwykła polilinia nadal mają same punkty `[x, y]`.

`hatch`, `insert` + `blocks` — etap 4.

### Jednostki i skala

- Geometria zawsze w metrach. Jednostka (m / cm / mm) dotyczy tylko wpisywania i pokazywania liczb (`renderer/units.js`).
- Skala (`doc.scale`) i grubości w milimetrach papieru należą do widoku: piksel ekranu na milimetr papieru = `px/m × scale / 1000`.
- Kreska na ekranie ma grubość jak na papierze przy tym przeliczeniu, z dwoma ograniczeniami: nie cieńsza niż 0,6 px (żeby nie znikała przy oddaleniu) i nie grubsza niż 3× rzeczywista grubość przy 96 dpi (żeby przy dużym przybliżeniu ściany nie zalewały rysunku). Przełącznik „cienkie linie” rysuje wszystko jednakowo cienko.
- Wzory kresek (kreskowa, osiowa, punktowa) są w milimetrach papieru i skalują się tak samo.

### Cofanie: jedna droga zmiany modelu

Rysunek zmienia wyłącznie `edit(nazwa, fn)` z `renderer/model.js`. Funkcja `fn` dostaje „transakcję” z poleceniami `add`, `del`, `set` (zmiana pól elementu), `setLayer`, `addLayer`, `delLayer`, `setDoc`. Transakcja zapisuje każdą zmianę razem z jej odwrotnością; cofnięcie i ponowienie odtwarzają te zapisy. Nie kopiujemy całego rysunku przy każdym kroku — ważne przy dużych podkładach.

Zmiany widoku (przesunięcie, przybliżenie, zaznaczenie) nie są cofane.

### Format pliku

Plik `.rysio` to JSON: `{ format: 'rysio', version: 1, … }` jak wyżej. Otwieranie przechodzi przez `fixDoc()`: uzupełnia brakujące pola i podnosi starsze wersje formatu krok po kroku (`version` 1 → 2 → …). Nowa wersja formatu = nowy krok w `fixDoc()`, nigdy zmiana starego.

### PDF

PDF składa `renderer/pdf.js` bez zewnętrznych bibliotek (zmiana względem planu z pdf-lib, zatwierdzona 23.11.2026). `PdfPen` ma te same polecenia co pióro ekranowe, a `sheet.js` rysuje arkusz jednym kodem dla ekranu, PNG i PDF. 1 mm papieru = 72/25,4 pt; grubości kresek i wzory w milimetrach bez ekranowych ograniczeń. Tekst używa wbudowanej czcionki Helvetica (każdy czytnik PDF ją ma); polskie litery spoza WinAnsi dostają kody 1–16 przez `/Differences` z nazwami glifów (`Aogonek`, `lslash`…). Ograniczenie: jedna czcionka. Okna przycina `re W n`. Domyślnie wydruk czarno-biały, na życzenie w kolorach warstw.

Skala jest sprawdzana pomiarem: sprawdzian szuka w wygenerowanym PDF-ie odcinka 1 m z okna 1:100 i mierzy go w punktach (10 mm), drugi — wymiary strony A3. PNG to ten sam rysunek na płótnie w 200 dpi.

### Duże współrzędne (podkłady geodezyjne)

Mapy w układzie 2000 mają współrzędne rzędu 5 500 000 m — przy takich liczbach obraz drga i traci dokładność. Przy imporcie DXF/DWG, gdy środek rysunku leży dalej niż 100 km od zera, geometria trafia do modelu przesunięta do okolic zera (o pełne kilometry), a przesunięcie leży w `doc.origin` i zapis DXF dodaje je z powrotem.

### Wersja przeglądarkowa

Te same pliki z `renderer/` działają w przeglądarce. Zamiast mostu Electrona (`preload.js`) działa `renderer/web-api.js` (zapis = pobranie pliku, otwieranie = wybór pliku). Serwer testowy: `node scripts/serve-web.js` → http://localhost:8766 (8765 zajmuje Modo).

## Pliki

| plik | co robi |
|---|---|
| `main.js` | proces główny Electrona: okno, pliki `.rysio`, autozapis, aktualizacje z wydań na GitHubie |
| `preload.js` | most między oknem a procesem głównym (`window.api`) |
| `renderer/index.html`, `style.css` | okno programu |
| `renderer/app.js` | stan programu, klawiatura i mysz, paski, okienka (warstwy, kreska, skala, ustawienia, skróty), zapis |
| `renderer/model.js` | rysunek, warstwy, kreski, `edit()` i historia cofania, `fixDoc()` |
| `renderer/geom.js` | geometria bez okna: odległości, przecięcia, rzuty, styczne, łuk przez trzy punkty, obrysy, trafienia |
| `renderer/draw.js` | rysowanie elementów przez „pióro” (płótno albo PDF): kreski, tekst, wymiar |
| `renderer/dxf.js` | odczyt DXF do elementów (warstwy z kolorem, rodzajem i grubością linii; nazwane bloki bez zniekształceń jako bloki, pozostałe i wymiary rozbite; kreskowania; jednostki z `$INSUNITS`) i zapis do DXF R2000 (`writeDxf`: model, arkusze jako LAYOUT + VIEWPORT, bloki, HATCH z rodzinami linii wzoru `patFamilies`, DIMENSION z blokiem *D, grubości 370) |
| `renderer/hatch.js` | kreskowanie: wzory w mm wydruku, kreski przycięte do pętli, szukanie obszaru pod kliknięciem |
| `renderer/dwg.js` | DWG przez LibreDWG → tekst DXF → `dxf.js` (z Modo); teksty (TEXT, MTEXT) czytane własnymi, oszczędnymi funkcjami (tylko potrzebne pola); kolejność prób: baza encji z tekstami → zapis DXF LibreDWG → baza encji bez tekstów (wtedy komunikat) |
| `renderer/edit.js` | zmienianie geometrii: obrót, odbicie, skala (`transformed`), odsunięcie (`offsetEnt`, także polilinii z łukami), zaokrąglenie dwóch linii (`filletLines`), linii, łuków i okręgów (`filletCurves`: środek z przecięcia krzywych odsuniętych o r), narożnika polilinii (`plineCorner`, też fazowanie), fazowanie dwóch linii (`chamferLines`), przycinanie i wydłużanie jednym kliknięciem (`trimOrExtend`) i wielu kawałków jednym przeciągnięciem (`trimMany`, tryb auto / trim / extend), uchwyty (`gripsOf`, `gripMove`) |
| `renderer/clip.js` | schowek: zaznaczenie → JSON w schowku systemu (`packClip`; warstwy i bloki po nazwie, także zagnieżdżone), wklejenie w jednej transakcji (`pasteClip`; brakujące warstwy powstają, istniejące o tej samej nazwie są używane; blok o tej samej nazwie i treści jest używany, o innej treści — powstaje „nazwa (2)”; bloki tylko do modelu; ukryte warstwy okna arkusza po nazwie), mnożnik model ↔ arkusz (`clipFactor`), podgląd (`clipGhosts`). ⌘C / ⌘X / ⌘V idą przez zdarzenia `copy` / `cut` / `paste` (bez pytania o zgodę; w Electronie na Macu wyzwala je menu Edycja); gdy zdarzenie nie przyjdzie w 250 ms albo skrót jest inny — `navigator.clipboard`, a w ostateczności pamięć okna |
| `renderer/sheet.js` | arkusz: okna z modelem w skali (przeliczanie arkusz ↔ model), ramka z tabelką, skale do tabelki |
| `renderer/pdf.js` | wektorowy PDF arkuszy (`PdfPen`, `makePdf`) |
| `renderer/view.js` | płótno, przesuwanie i przybliżanie, przeliczanie metry ↔ piksele, kreski w skali, siatka modelu (`drawGrid`, odstęp z `gridStep`), uchwyty |
| `renderer/snap.js` | przyciąganie (koniec, środek, przecięcie, prostopadle, środek okręgu, styczna, węzeł siatki, najbliższy) i kierunki (poziom, pion, wzdłuż i prostopadle do linii, śledzenie od punktów) |
| `renderer/tools.js` | narzędzia: zaznacz, usuń, pędzel, linia, polilinia, prostokąt, okrąg, łuk, przesuń, kopiuj, wklej (ze schowka), obróć, odbij, skaluj, odsunięcie, zaokrąglij, przytnij, wydłuż, kreskowanie, bloki, tekst, wymiar, okno na arkuszu |
| `renderer/units.js` | wpisywanie i pokazywanie wymiarów w jednostce rysunku |
| `renderer/keys.js` | skróty klawiszowe i ich zmiana |
| `renderer/i18n.js`, `lang/en.js` | tłumaczenie napisów (`_t`) |
| `renderer/web-api.js` | zastępczy most dla wersji przeglądarkowej |
| `renderer/testapi.js` | `window.rysioTest` — polecenia testowe bez klikania |
| `scripts/serve-web.js` | serwer wersji przeglądarkowej |
| `scripts/sprawdziany.mjs` | sprawdziany geometrii i modelu (bez przeglądarki) |
| `makieta/makieta.html` | zaakceptowana makieta wyglądu (23.11.2026) |
| `.github/workflows/build.yml` | instalatory Windows i Mac, uruchamiane ręcznie |
| `build/icon.svg` → `build/icon.png` | ikona programu: miękka czarna pętla z kwadracikiem na złamanej bieli (wybór 23.11.2026, `makieta/znak.html`); PNG 1024 px z przezroczystym marginesem robi `scripts/ikona.js` (Electronem; `qlmanage` wypełniał margines na biało i macOS pokazywał białą ramkę) |

## Skopiowane z Modo

Z Modo 0.4.2 (commit `4f530f1`, 23.11.2026):

| co | zmiany |
|---|---|
| `renderer/units.js` | klucz pamięci `rysio.unit`; jednostka należy do rysunku |
| `renderer/i18n.js` | klucz `rysio.lang`, tytuł okna |
| `renderer/keys.js` — zapis i wyświetlanie skrótów (`comboOf`, `prettyCombo`, nadpisania) | lista poleceń Rysia |
| okno skrótów (z `app.js` i `style.css`) | bez zmian w działaniu |
| `renderer/web-api.js`, `preload.js` | tylko polecenia potrzebne Rysiowi |
| `main.js` — okno, pliki, autozapis, aktualizacje | schemat `rysio://`, rozszerzenie `.rysio`, repozytorium `michallenczewski/rysio`; bez Gemini, OBJ i ODA |
| `scripts/serve-web.js` | port 8766 |
| `.github/workflows/build.yml`, `build/adhoc.js` | nazwy Rysia |
| wygląd: kolory, ikony, pasek górny, pasek stanu, okienka | z `style.css` i ikon z `app.js` |

Z Modo 0.4.2 (commit `591d8d9`, 24.11.2026), etap 5:

| co | zmiany |
|---|---|
| `renderer/dwg.js` | bez zmian poza warunkiem „czy coś wczytano” (Rysio dostaje elementy, nie odcinki podkładu); z DWG nadal nie przechodzą teksty i kreskowania — na nich LibreDWG najczęściej się wykłada |
| `renderer/vendor/libredwg/` | bez zmian (z plikiem `COPYING`) |
| `renderer/dxf.js` | z Modo tylko rozkład pliku na sekcje, tabelę warstw i bloki; zamiana na elementy Rysia (linie, polilinie z łukami, okręgi, łuki, teksty i MTEXT, elipsy i splajny jako polilinie, bloki i wymiary rozbite) oraz zapis DXF R2000 — nowe |

## Biblioteki zewnętrzne

| biblioteka | wersja, skąd | jak odświeżyć |
|---|---|---|
| `renderer/vendor/libredwg/` | libredwg-web (GPL-3, licencja w `COPYING`), commit 8e307b3 — kopia z Modo 0.4.2 | jak w Modo: `bindings/javascript/wasm/` bez zmian oraz `bindings/javascript/src` skompilowane `tsc`; w `libredwg.js` import modułu WASM wskazuje `./wasm/`. Moduł (8 MB) ładuje się dopiero przy pierwszym DWG. Wymaga w CSP `'wasm-unsafe-eval' 'unsafe-eval'`. |

PDF powstaje bez biblioteki (zob. wyżej).

**DXF zapisujemy w wersji R2000 (AC1015)** (zmiana z R12, 24.11.2026, na prośbę Michała o grubości linii, kreskowania i arkusze). Struktura jak w najprostszym pliku AutoCAD 2000: wszystkie tabele z uchwytami, słowniki `ACAD_GROUP`, `ACAD_LAYOUT`, `ACAD_PLOTSTYLENAME` (z `Normal` → `ACDBPLACEHOLDER`), układ `Model` i po jednym `LAYOUT` na arkusz (pierwszy w `*Paper_Space` z elementami w sekcji ENTITIES, kolejne w blokach `*Paper_Space0…`), w każdym okno nr 1 (cały arkusz) i nasze okna jako `VIEWPORT` (skala z wysokości widoku, ukryte warstwy kodem 341). Model w jednostkach rysunku, arkusze w milimetrach. Kreskowania to `HATCH` z własnym wzorem `RYSIO_…` (rodziny linii liczone tak, żeby dawały ten sam rysunek co na ekranie; beton jako powtarzalny wzór trójkątów i kropek, bo losowego rozrzutu DXF nie opisze). Wymiar to `DIMENSION` z blokiem `*D…` narysowanym tak jak w Rysiu i tekstem nadpisanym naszą liczbą. Komentarz `999 Rysio - jednostki …` zostaje. Sprawdzone: ponowny odczyt w Rysiu i odczyt LibreDWG (`dxf_read_file`, kod błędu 0). **Nie sprawdzone w AutoCAD-zie** — przy pierwszym otwarciu w biurze patrzymy, czy nie ma komunikatu o naprawie pliku.

## Sygnały, że trzeba wrócić do tematu

- **Przerysowanie całości przy każdym ruchu myszy** — wystarczy do kilkunastu tysięcy elementów. Przy podkładach (etap 5) trzeba będzie rysować rysunek do bufora, a na wierzch tylko kursor i podgląd, oraz dodać indeks przestrzenny.
- **Kreskowanie nie jest skojarzone** z obrysem — po zmianie ścian trzeba je narysować na nowo. Szukanie obszaru bierze pod uwagę widoczną część rysunku (z zapasem 15%).
- **Wstawienie bloku ma jedną skalę** (bez osobnej X i Y); takie wstawienia z DXF są rozbijane.
- **Uchwyty** nie mają wpisywania długości z klawiatury — tylko przeciąganie albo klik w nowe miejsce, z przyciąganiem i kierunkami.
- **Zaokrąglanie działa na dwóch pojedynczych liniach** — nie na wierzchołkach polilinii ani na łukach. Polilinię trzeba by najpierw rozbić (polecenie, którego jeszcze nie ma).
- **Odsunięcie polilinii** łączy części przez przecięcie ich przedłużeń (ostre narożniki); gdy przedłużenia się nie przecinają (np. łuk i odcinek, które się rozjechały), oba odsunięte końce łączy prosty odcinek. Odsunięcie, przy którym któraś część zmieniłaby kierunek (figura by się wywinęła), program odrzuca.
- **Wydłużanie polilinii** działa tylko wtedy, gdy kończy się ona odcinkiem (nie łukiem).
- **Skala nie zmienia wysokości tekstu i wymiarów** — są w mm wydruku; odbity tekst zostaje czytelny (przesuwa się tylko jego punkt).
- **Okno na arkuszu pokazuje model tylko do oglądania** — rysuje się w zakładce Model; w oknie można tylko przesunąć widok (dwuklik). Zmiana skali okna przez przybliżanie celowo nie istnieje.
- **Tekst stoi poziomo** (może mieć kilka wierszy; obrót `rot` jest w modelu danych, ale nie ma jeszcze narzędzia do obracania); szerokość tekstu do zaznaczania jest szacowana (0,56 wysokości na znak).
- **Cofanie przełącza zakładkę**: cofnięcie zmiany z innej przestrzeni (model / arkusz) pokazuje tę przestrzeń, żeby było widać, co się cofnęło.
- **Wymiar to pojedynczy odcinek**; łańcuch to kilka wymiarów na jednej linii (tak też trafią do DXF w etapie 5).
- **PDF ma jedną czcionkę** (Helvetica); inna wymagałaby osadzania pliku czcionki.
