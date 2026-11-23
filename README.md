# Rysio

Lekki program do rysunku 2D w skali — rzut, przekrój, schemat, detal, plansza — dla Windows i Maca. Czwarty w rodzinie obok Modo, Gapy i Blatu. Ma się w nim rysować, a nie obsługiwać program techniczny: kartka, kilka narzędzi, grubość i rodzaj kreski zawsze pod ręką.

## Co już potrafi (etap 1)

- Rysowanie: linia (A), polilinia (F), prostokąt (D), okrąg (V), łuk przez trzy punkty (B) i ze środka (⇧B; Tab przełącza sposób).
- Zmienianie: zaznacz (Q) — klik, ⇧ + klik, ramka w prawo (całe w ramce) i w lewo (wszystko, czego dotknie); przesuń (W), kopiuj (C), usuń (S albo Delete), cofnij i ponów.
- Pędzel (M): przemalowuje istniejące linie — kreskę, warstwę albo jedno i drugie — kliknięciem albo przeciągnięciem przez kilka naraz; ⌥ + klik na Macu (Ctrl + klik w Windows) pobiera kreskę i warstwę z linii.
- Przyciąganie z czytelnym znaczkiem i podpisem: koniec, środek, przecięcie, prostopadle, środek okręgu, styczna, najbliższy.
- Kierunki: poziom i pion od punktu, równolegle i prostopadle do linii, przy której był kursor, śledzenie od punktów; ⇧ trzyma kierunek; przełącznik „Kąty proste”.
- Wymiary wpisywane w trakcie: długość, `szer;wys` dla prostokąta, promień, kąt łuku; liczba bez jednostki jest w jednostce rysunku (m, cm, mm).
- Warstwy: nazwa, kolor, widoczność, blokada, domyślna kreska; przenoszenie zaznaczenia na warstwę jednym kliknięciem.
- Kreska „jak warstwa” albo własna na elemencie; sześć grubości (0,13–0,7 mm) i cztery rodzaje linii; na ekranie grubość jak na papierze w skali rysunku, przełącznik „cienkie linie”.
- Skala rysunku (1:1 … 1:1000 albo własna).
- Zapis i otwieranie plików `.rysio`, autozapis i przywracanie po awarii, tryb jasny i ciemny, skróty do zmiany w oknie skrótów (`?`).

Następne etapy: arkusze i PDF, zmienianie (offset, fillet, trim, extend, obrót, odbicie, skalowanie), bloki i kreskowanie, wymiana DXF/DWG — patrz `OPIS.md`.

## Nawigacja

Kółko myszy przybliża do kursora; na gładziku dwa palce przesuwają, szczypanie przybliża. Środkowy przycisk albo spacja + przeciąganie przesuwa widok. Z pokazuje cały rysunek.

## Dla programisty

- `npm start` — program; `npm run web` — wersja przeglądarkowa na http://localhost:8766; `npm test` — sprawdziany rysowania.
- Budowa programu: `ARCHITEKTURA.md`; zasady pracy: `CLAUDE.md`.

## Licencja

GPL-3.0-or-later. Część rozwiązań (aktualizacje, okno skrótów, jednostki, tłumaczenia) pochodzi z [Modo](https://github.com/michallenczewski/modo).
