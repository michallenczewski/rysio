# Rysio

Lekki program do rysunku 2D w skali — rzut, przekrój, schemat, detal, plansza — dla Windows i Maca. Czwarty w rodzinie obok Modo, Gapy i Blatu. Ma się w nim rysować, a nie obsługiwać program techniczny: kartka, kilka narzędzi, grubość i rodzaj kreski zawsze pod ręką.

## Co już potrafi (etap 1)

- Rysowanie: linia (A), polilinia (F), prostokąt (D), okrąg (V), łuk przez trzy punkty (B) i ze środka (⇧B; Tab przełącza sposób).
- Zmienianie: zaznacz (Q) — klik, ⇧ + klik, ramka w prawo (całe w ramce) i w lewo (wszystko, czego dotknie); przesuń (W), kopiuj (C), usuń (S albo Delete), cofnij i ponów.
- Pędzel (M): przemalowuje istniejące linie tym, co jest w pastylkach u góry — kreskę, warstwę albo jedno i drugie — kliknięciem albo przeciągnięciem przez kilka naraz; ⌥ + klik na Macu (Ctrl + klik w Windows) to pipeta: przepisuje kreskę i warstwę linii do pastylek.
- Przyciąganie z czytelnym znaczkiem i podpisem: koniec, środek, przecięcie, prostopadle, środek okręgu, styczna, najbliższy.
- Kierunki: poziom i pion od punktu, równolegle i prostopadle do linii, przy której był kursor, śledzenie od punktów; ⇧ trzyma kierunek; przełącznik „Kąty proste”.
- Wymiary wpisywane w trakcie: długość, `szer;wys` dla prostokąta, promień, kąt łuku; liczba bez jednostki jest w jednostce rysunku (m, cm, mm).
- Warstwy: nazwa, kolor, widoczność, blokada, domyślna kreska; przenoszenie zaznaczenia na warstwę jednym kliknięciem.
- Kreska „jak warstwa” albo własna na elemencie; dziewięć grubości z szeregu ISO (0,13–2,0 mm) i cztery rodzaje linii; na ekranie grubość jak na papierze w skali rysunku, przełącznik „cienkie linie”.
- Skala rysunku (1:1 … 1:1000 albo własna).
- Zapis i otwieranie plików `.rysio`, autozapis i przywracanie po awarii, tryb jasny i ciemny, skróty do zmiany w oknie skrótów (`?`).

## Arkusze (etap 2)

- Zakładki na dole: Model i dowolna liczba arkuszy (+). Arkusz ma format A4–A0, poziomo albo pionowo, i ramkę z tabelką; nazwę, format i ramkę zmienia przycisk formatu na dole, a pola tabelki — przycisk „Tabelka” (projekt, projektant i data są wspólne dla wszystkich arkuszy, rysunek i numer — osobne).
- Okno (O) pokazuje fragment modelu w swojej skali; pasek nad zaznaczonym oknem zmienia skalę, ukrywa warstwy tylko w tym oknie i blokuje widok. Dwuklik w okno pozwala przesunąć w nim model.
- Tekst (Y) i wymiar (U) w modelu i na arkuszu; wysokość w milimetrach wydruku, taka sama w każdym oknie i skali. Wymiar: dwa punkty i miejsce linii, potem łańcuch; Tab — poziomo, pionowo albo równolegle.
- Eksport (⌘P / Ctrl+P): wektorowy PDF w skali (ten arkusz albo wszystkie w jednym pliku, czarno-biały albo w kolorach warstw) i PNG 200 dpi.

## Zmienianie (etap 3)

- Obróć (E), odbij (⇧E / Shift+E), skaluj (R) — na zaznaczeniu; kąt i skala z klawiatury albo myszą; ⌥ (Ctrl w Windows) robi kopię.
- Odsunięcie (T): linie, łuki, okręgi i polilinie (także z łukami); odległość wpisana z klawiatury.
- Zaokrąglij narożnik (G): dwie linie, promień wpisany z klawiatury; promień 0 łączy linie w ostry narożnik.
- Przytnij / wydłuż (X): klik w kawałek między przecięciami go usuwa, klik przy końcu linii dosuwa ją do najbliższego elementu.
- Polilinie mogą mieć łuki (powstają przy odsunięciu, przycinaniu i z plików DXF).

Następne etapy: bloki i kreskowanie, wymiana DXF/DWG — patrz `OPIS.md`.

## Nawigacja

Kółko myszy przybliża do kursora; na gładziku dwa palce przesuwają, szczypanie przybliża. Środkowy przycisk albo spacja + przeciąganie przesuwa widok. Z pokazuje cały rysunek.

## Dla programisty

- `npm start` — program; `npm run web` — wersja przeglądarkowa na http://localhost:8766; `npm test` — sprawdziany rysowania.
- Budowa programu: `ARCHITEKTURA.md`; zasady pracy: `CLAUDE.md`.

## Licencja

GPL-3.0-or-later. Część rozwiązań (aktualizacje, okno skrótów, jednostki, tłumaczenia) pochodzi z [Modo](https://github.com/michallenczewski/modo).
