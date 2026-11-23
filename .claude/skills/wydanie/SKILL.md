---
name: wydanie
description: Wydanie nowej wersji mini CAD-a (instalatory Windows i Mac przez GitHub Actions). Używaj WYŁĄCZNIE wtedy, gdy Michał wprost prosi o nową wersję — nigdy po zwykłej poprawce.
---

# Wydanie wersji

Instalatory budują się tylko po ręcznym uruchomieniu workflow w GitHub Actions. Workflow: `.github/workflows/build.yml` („Buduj instalatory”, wejście `os`: win / mac / oba). Instalatory: `Rysio-X.Y.Z-win-x64.exe`, `Rysio-X.Y.Z-mac-arm64.dmg`, `Rysio-X.Y.Z-mac-x64.dmg` — tych nazw szuka program przy sprawdzaniu aktualizacji (`main.js`, repozytorium `michallenczewski/rysio`).

1. Wszystko zapisane i wypchnięte; sprawdziany rysowania przeszły; zmiany widoczne w interfejsie sprawdzone w przeglądarce.
2. Podbij wersję w `package.json` (zwykle trzecia liczba; nowe narzędzia albo większe zmiany — druga). Zapis: „Wersja X.Y.Z”, wypchnij.
3. Uruchom budowanie dla obu systemów (`gh workflow run build.yml -f os=oba`) i śledź przebieg do końca (`gh run watch`).
4. Sprawdź wydanie: muszą być instalatory dla Windows i dla Maca (procesor Apple i Intel) o nazwach, których szuka program.
5. Napisz Michałowi krótko, co weszło do wersji (zwykłymi słowami) i czego w zainstalowanym programie nikt jeszcze nie sprawdził.

Nigdy nie wpisuj za Michała hasła ani klucza. Jeśli `gh` nie jest zalogowany, poproś go o `gh auth login`.
