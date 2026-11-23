---
name: test-w-przegladarce
description: Jak sprawdzić zmianę w Rysiu w wersji przeglądarkowej. Używaj po każdej zmianie widocznej w interfejsie, przed zapisem zmian w repozytorium.
---

# Test w przeglądarce

Program ma wersję przeglądarkową z tych samych plików (zamiast Electrona działa zastępczy most `renderer/web-api.js`).

## Uruchomienie

1. Serwer w tle: `node scripts/serve-web.js` → http://localhost:8766 (8765 zajmuje wersja przeglądarkowa Modo).
   Jeśli na komputerze nie ma `node`, Electron z Modo działa jak Node:
   `ELECTRON_RUN_AS_NODE=1 /Users/michal/Documents/Claude/modo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/serve-web.js`
2. Okno testowe w stałym rozmiarze 1280×800 (wróć potem do zwykłego rozmiaru).

## Polecenia testowe — `window.rysioTest`

Współrzędne w metrach, oś Y w górę. Każde polecenie zwraca zwykłe dane.

| polecenie | co robi |
|---|---|
| `reset({ scale, units })` | nowy pusty rysunek bez pytania o zapis |
| `load(doc)` | wczytuje rysunek (obiekt albo tekst pliku `.rysio`) |
| `add(element)` | dodaje element przez `edit()` (z cofaniem), zwraca numer |
| `tool(id)` / `run(id)` | wybiera narzędzie / wykonuje polecenie z listy skrótów (`undo`, `delete`, `extents`…) |
| `click(x, y, { shift, alt, ctrl })` | kliknięcie w punkcie modelu — przez zwykłe przyciąganie i narzędzie |
| `move(x, y)`, `drag([[x,y]…])` | ruch kursora, przeciągnięcie (ramka, gumka, pędzel) |
| `type('6;4')` | wpisanie wymiaru z klawiatury i Enter |
| `key('Escape', { shift })` | klawisz |
| `state()` | narzędzie, przyciąganie (rodzaj, punkt, kierunki), podpowiedź, pole wymiaru, liczba kroków cofania, błędy |
| `ents()`, `layers()`, `doc()`, `sel()`, `stats()` | stan rysunku |
| `fit([x0,y0,x1,y1])`, `zoom(ppm, [cx,cy])`, `screen([x,y])` | widok; punkt modelu → piksel strony |
| `errors()` | błędy z konsoli od wczytania strony |

Przykład: `t = rysioTest; t.reset(); t.tool('rect'); t.click(0,0); t.move(1,1); t.type('6;4'); t.ents()`.

## Po zmianie

- wykonaj scenariusz poleceniami testowymi i porównaj stan z oczekiwanym;
- zrób zrzut i **obejrzyj go** — grubości kresek, wzory linii, układ okienek widać tylko na obrazie;
- sprawdź `errors()` i konsolę;
- sprawdź tryb jasny i ciemny, jeśli zmiana dotyczy wyglądu (`localStorage.setItem('rysio.theme','light'|'dark')` i przeładowanie);
- wydruk (od etapu 2): wyeksportuj PDF i zmierz w nim odcinek o znanej długości.

## Program w Electronie

`<Electron> . --remote-debugging-port=9333 --user-data-dir=<folder tymczasowy>` uruchamia prawdziwy program; `scripts/cdp.mjs 9333 '<wyrażenie>'` wykonuje w nim polecenie (np. `rysioTest.stats()`). Zamknij go potem (`pkill -f remote-debugging-port=9333`).

W odpowiedzi dla Michała napisz, co sprawdziłeś w ten sposób, a czego nie (np. zachowania zainstalowanego programu na Windows).
