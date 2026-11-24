# Rysio

Lekki program do rysunku 2D w skali — rzut, przekrój, schemat, detal, plansza — dla Windows i Maca. Czwarty w rodzinie obok Modo, Gapy i Blatu. Ma się w nim rysować, a nie obsługiwać program techniczny: kartka, kilka narzędzi, grubość i rodzaj kreski zawsze pod ręką.

## Co już potrafi (etap 1)

- Rysowanie: linia (A), polilinia (F), prostokąt (D), okrąg (V), łuk przez trzy punkty (B) i ze środka (⇧B; drugie naciśnięcie B przełącza sposób).
- Zmienianie: zaznacz (Q) — klik, ⇧ + klik, ramka w prawo (całe w ramce) i w lewo (wszystko, czego dotknie); przesuń (W), kopiuj (C), usuń (S albo Delete), cofnij i ponów.
- Schowek: ⌘C / ⌘V (Ctrl+C / Ctrl+V w Windows) — kopiuje zaznaczenie (⌘X / Ctrl+X wycina: kopiuje i usuwa) razem z jego warstwami i blokami; wklejana kopia trzyma się kursora lewym dolnym rogiem, klik ją kładzie. Wkleja się też w innym rysunku i w drugim oknie Rysia; między modelem a arkuszem kopia przelicza się według skali rysunku (tekst zostaje tej samej wysokości). Warstwy i bloki o tej samej nazwie łączą się z istniejącymi.
- Pędzel (M): przemalowuje istniejące linie tym, co jest w pastylkach u góry — kreskę, warstwę albo jedno i drugie — kliknięciem albo przeciągnięciem przez kilka naraz; przycisk „Pipeta” na pasku pędzla (albo ⌥ + klik na Macu, Ctrl + klik w Windows) bierze kreskę i warstwę z innej linii, a potem pędzel nadaje je kolejnym.
- Przyciąganie z czytelnym znaczkiem i podpisem: koniec, środek, przecięcie, prostopadle, środek okręgu, styczna, najbliższy.
- Tryb minimalny (Tab): znikają paski, zostaje kartka i plakietka w rogu z narzędziem, warstwą i kreską (kliknięcie otwiera wybór); wpisywany wymiar pokazuje się przy kursorze. Tab wraca do pełnego widoku, program pamięta wybór.
- Siatka (I albo przełącznik na dole): wyłączona → kropki → linie; oczka co 1 cm … 10 m zależnie od przybliżenia, co dziesiąte wyraźniejsze; rysowanie przyciąga do węzłów. Tylko w modelu, nie trafia na wydruk.
- Uchwyty: zaznaczone elementy mają kwadraciki na końcach, wierzchołkach, środkach i kwadrantach — przeciągnij albo kliknij i kliknij nowe miejsce (z przyciąganiem). Środek linii i środek okręgu przesuwają cały element.
- Kierunki: poziom i pion od punktu, równolegle i prostopadle do linii, przy której był kursor, śledzenie od punktów; ⇧ trzyma kierunek; przełącznik „Kąty proste”.
- Wymiary wpisywane w trakcie: długość, `szer;wys` dla prostokąta, promień, kąt łuku; liczba bez jednostki jest w jednostce rysunku (m, cm, mm).
- Warstwy: nazwa, kolor, widoczność, blokada, domyślna kreska; przenoszenie zaznaczenia na warstwę jednym kliknięciem.
- Kreska „jak warstwa” albo własna na elemencie; dziewięć grubości z szeregu ISO (0,13–2,0 mm) i cztery rodzaje linii; na ekranie grubość jak na papierze w skali rysunku, przełącznik „cienkie linie”.
- Skala rysunku (1:1 … 1:1000 albo własna).
- Zapis i otwieranie plików `.rysio`, autozapis i przywracanie po awarii, tryb jasny i ciemny, skróty do zmiany w oknie skrótów (`?`).

## Arkusze (etap 2)

- Zakładki na dole: Model i dowolna liczba arkuszy (+). Arkusz ma format A4–A0, poziomo albo pionowo, i ramkę z tabelką; nazwę, format i ramkę zmienia przycisk formatu na dole, a pola tabelki — przycisk „Tabelka” (projekt, projektant i data są wspólne dla wszystkich arkuszy, rysunek i numer — osobne).
- Okno (O) pokazuje fragment modelu w swojej skali; pasek nad zaznaczonym oknem zmienia skalę, ukrywa warstwy tylko w tym oknie i blokuje widok. Dwuklik w okno pozwala przesunąć w nim model.
- Tekst (Y) i wymiar (U) w modelu i na arkuszu; wysokość w milimetrach wydruku, taka sama w każdym oknie i skali. Wymiar: dwa punkty i miejsce linii, potem łańcuch; drugie naciśnięcie U — poziomo, pionowo albo równolegle.
- Eksport (⌘P / Ctrl+P): wektorowy PDF w skali (ten arkusz albo wszystkie w jednym pliku, czarno-biały albo w kolorach warstw) i PNG 200 dpi.

## Zmienianie (etap 3)

- Obróć (E), odbij (⇧E / Shift+E), skaluj (R) — na zaznaczeniu; kąt i skala z klawiatury albo myszą; ⌥ (Ctrl w Windows) robi kopię.
- Odsunięcie (T): linie, łuki, okręgi i polilinie (także z łukami); odległość wpisana z klawiatury.
- Zaokrąglij narożnik (G): dwie linie, promień wpisany z klawiatury; promień 0 łączy linie w ostry narożnik.
- Przytnij (X): klik w kawałek między przecięciami go usuwa. Wydłuż (⇧X / Shift+X): klik w linię blisko końca dosuwa ją do najbliższego elementu. W obu przeciągnięcie przez kilka kawałków robi to z nimi wszystkimi naraz.
- Polilinie mogą mieć łuki (powstają przy odsunięciu, przycinaniu i z plików DXF).

- DXF i DWG: Plik → Otwórz wczytuje rysunek CAD jako nowy rysunek (warstwy z kolorami, rodzajami i grubościami linii; nazwane bloki zostają blokami, wymiary są rozbijane na linie i teksty; kreskowania wchodzą z wzorem i kątem; z DWG teksty mogą nie przejść). Plik → Eksport DXF zapisuje model w jednostkach rysunku (DXF R12 — bez grubości linii i bez arkuszy; bloki jako bloki, kreskowania jako kreski; nazwy warstw bez polskich liter i spacji, bo R12 ich nie przyjmuje).

- Kreskowanie (H): klik wewnątrz zamkniętego obszaru (także z otworami — np. ściana między dwoma obrysami); obrys podświetla się przed kliknięciem. Sześć wzorów (ukośne, krzyżowe, beton, izolacja, grunt, pełne), skala i kąt na pasku u góry; gęstość w milimetrach wydruku. Zaznaczone kreskowania zmienia ten sam pasek.
- Bloki (K): z zaznaczeniem — nowy blok (nazwa na pasku, klik w punkt wstawienia); bez zaznaczenia — wstawianie (wybór z miniaturami, cyfry wpisują obrót). Zaznaczony blok: nazwa, Edytuj w miejscu (też dwuklik), Rozbij, Zamień na… W edycji reszta rysunku jest przygaszona; Gotowe albo Esc kończy, Anuluj cofa zmiany. Przesuń, obróć, odbij, skaluj i kopiuj działają na blokach.

## Nawigacja

Kółko myszy przybliża do kursora; na gładziku dwa palce przesuwają, szczypanie przybliża. Środkowy przycisk albo spacja + przeciąganie przesuwa widok. Z pokazuje cały rysunek.

## Dla programisty

- `npm start` — program; `npm run web` — wersja przeglądarkowa na http://localhost:8766; `npm test` — sprawdziany rysowania.
- Budowa programu: `ARCHITEKTURA.md`; zasady pracy: `CLAUDE.md`.

## Licencja

GPL-3.0-or-later. Część rozwiązań (aktualizacje, okno skrótów, jednostki, tłumaczenia) pochodzi z [Modo](https://github.com/michallenczewski/modo).
