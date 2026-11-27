# Mini CAD — wskazówki dla asystenta

Tu są tylko zasady Rysia. Zasady wspólne dla wszystkich programów Michała (współpraca, interfejs, wydania, technika) są w `../rodzina/claude/CLAUDE.md` — na Macu wczytują się same jako `~/.claude/CLAUDE.md`; jeśli ich nie widzisz, przeczytaj ten plik. Co budujemy — `OPIS.md`. Jak jest zbudowane — `ARCHITEKTURA.md`. Procedury krok po kroku są w umiejętnościach (`.claude/skills/`), a stali pomocnicy w `.claude/agents/`.

## Współpraca z Michałem

- Skróty z `OPIS.md` (Q, W, E, R, A, S, D, Z) to układ Michała — nie zmieniaj ich bez jego prośby; nowe polecenia dostają wolne klawisze albo żadnego.
- Program ma zostać prosty. Jeśli pomysł wykracza poza `OPIS.md`, zapytaj, zamiast dokładać. Nie dodawaj wiersza poleceń, okien z tabelami ustawień ani narzędzi „bo CAD je ma”.

## Jak pracujemy

- Przed większą zmianą przeczytaj `ARCHITEKTURA.md`; po zmianie, która ją dezaktualizuje, popraw ją w tym samym zapisie.
- Każdą zmianę w geometrii i narzędziach (przyciąganie, trim, extend, fillet, offset, kreskowanie, bloki, skala) sprawdź umiejętnością `sprawdziany-rysowania` — sprawdziany muszą przejść. Zgłoszony błąd rysowania najpierw dopisz jako przypadek, potem naprawiaj.
- Każdą zmianę widoczną w interfejsie sprawdź w wersji przeglądarkowej — umiejętność `test-w-przegladarce`; wygląd i zachowanie według umiejętności `rodzina-interfejs` (wytyczne i wzorzec przycisków leżą w `../rodzina/`). Wydruk (PDF) sprawdzaj, mierząc w nim wymiary: odcinek 1 m w skali 1:100 ma mieć 10 mm.
- Zmianę zrobioną skryptem albo dużą zmianę daj przed zapisem pomocnikowi `recenzent`; scenariusz do przeklikania — pomocnikowi `tester`.

## Zasady kodu

- Model rysunku jest w jednostkach rzeczywistych (metry); skala i grubości w milimetrach papieru należą do widoku i arkusza, nie do geometrii.
- Każda zmiana modelu przechodzi przez jedno miejsce z cofaniem (bez zmian „z boku”).
- Każdy napis widoczny dla użytkownika idzie przez funkcję tłumaczenia (`_t`) — także zanim powstanie wersja angielska.
- Gotowe części bierz z Modo, zamiast pisać od nowa: czytnik DXF i DWG, jednostki, okno skrótów, sprawdzanie aktualizacji, budowanie instalatorów. Zapisz w `ARCHITEKTURA.md`, co i z której wersji Modo zostało skopiowane.

## Biblioteki i licencje

- Program jest na licencji GPL-3.0-or-later (dołącza LibreDWG). Nie dodawaj zależności, których licencja kłóci się z GPL-3.
- Biblioteki zewnętrzne trzymaj w `renderer/vendor/` jako gotowe pliki, z plikiem licencji i notatką w `ARCHITEKTURA.md`, skąd pochodzą i jak je odświeżyć.
- ODA File Converter nie może być dołączany do programu (jego licencja zabrania rozpowszechniania).
