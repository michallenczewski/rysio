---
name: sprawdziany-rysowania
description: Automatyczne sprawdziany geometrii mini CAD-a (bez przeglądarki) — przyciąganie, trim, extend, fillet, offset, kreskowanie, bloki, skala. Uruchamiaj przed zapisem KAŻDEJ zmiany w geometrii i narzędziach; dopisuj nowy przypadek przy każdym zgłoszonym błędzie rysowania.
---

# Sprawdziany rysowania

Sprawdziany działają na samym modelu i funkcjach geometrii, bez okna programu, więc trwają sekundy.

```bash
node scripts/sprawdziany.mjs          # wszystkie
node scripts/sprawdziany.mjs łuk      # tylko przypadki z „łuk” w nazwie
```

Jeśli na komputerze nie ma `node`, Electron z Modo działa jak Node:
`ELECTRON_RUN_AS_NODE=1 /Users/michal/Documents/Claude/modo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/sprawdziany.mjs`

## Zasady

- Jeden przypadek = krótki scenariusz (co narysowano, jakie polecenie) i dokładny oczekiwany wynik: liczba elementów, współrzędne końców, długości, pole kreskowania.
- Każde narzędzie ma co najmniej: przypadek zwykły, przypadek graniczny (elementy stykające się, równoległe, zerowej długości, łuk pełny) i przypadek „nic do zrobienia”.
- Przypadki, które muszą być od początku: trim linii między dwiema innymi; extend do łuku; fillet dwóch linii z promieniem i z promieniem 0; offset poliliny z łukiem do środka i na zewnątrz; kreskowanie obszaru z wyspą; zmiana definicji bloku widoczna we wszystkich wstawieniach; odcinek 1 m w skali 1:100 = 10 mm na arkuszu.
- Błąd zgłoszony przez Michała: najpierw przypadek, który go pokazuje (i nie przechodzi), dopiero potem poprawka.
- Nie zmieniaj oczekiwanego wyniku po to, żeby sprawdzian przeszedł — chyba że Michał potwierdzi, że to oczekiwanie było błędne.
- Wynik podawaj liczbą: „N z M przypadków”. Zapis do repozytorium tylko przy komplecie.
