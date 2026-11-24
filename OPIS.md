# Mini CAD — opis programu

Nazwa robocza: „mini CAD”. Właściwą nazwę wybierzemy na początku (patrz „Pierwsze kroki”).

## Po co

Mam już Modo (szkicownik 3D), Gapę (przeglądarka obrazów) i Blat (tablica do wymiany z klientem). Brakuje mi lekkiego programu do rysunku 2D w skali: rzut, przekrój, schemat, detal, plansza. Ma wystarczyć do koncepcji i małych projektów. Nie ma zastępować AutoCAD-a ani Archicada i nie ma ich naśladować.

Najważniejsze założenie: **ma się w tym rysować, a nie obsługiwać program techniczny.** Bez wiersza poleceń, bez dziesiątek pasków, bez okien z tabelami ustawień. Kartka, kilka narzędzi, grubość i rodzaj kreski zawsze pod ręką.

## Narzędzia pierwszej wersji

Rysowanie:
- linia, polilinia, prostokąt, okrąg, łuk (przez trzy punkty oraz środek–początek–koniec)

Zmienianie:
- zaznacz, przesuń, kopiuj, obróć, odbij, skaluj, usuń
- schowek: ⌘C / ⌘X / ⌘V (Ctrl+C / Ctrl+X / Ctrl+V) — kopiowanie i wycinanie zaznaczenia także do innego rysunku i drugiego okna; wklejana kopia trzyma się kursora, między modelem a arkuszem przelicza się skala
- mierzenie odległości i pola (L), bez zapisu w rysunku
- odsunięcie (offset)
- zaokrąglenie narożnika (fillet) — z promieniem; promień 0 łączy linie w narożnik; także łuki i narożniki polilinii; fazowanie (chamfer) — drugie naciśnięcie G
- przytnij (trim) i wydłuż (extend) — klik w kawałek do usunięcia albo w koniec do wydłużenia, bez wcześniejszego wskazywania krawędzi tnących; to dwa osobne narzędzia — przytnij (X) i wydłuż (⇧X); przeciągnięcie przez kilka kawałków działa jak pędzel

Porządek:
- warstwy: nazwa, kolor, widoczność, blokada, domyślna grubość i rodzaj linii
- bloki: utwórz z zaznaczenia, wstaw, edytuj w miejscu (zmiana jednego zmienia wszystkie), rozbij
- kreskowanie (hatch): wypełnienie zamkniętego obszaru wskazanego kliknięciem — kilka wzorów (ukośne linie, krzyżowe, beton, izolacja, grunt, pełne) ze skalą i kątem
- ramka (border): obrys arkusza z tabelką rysunkową do wypełnienia

Pomoc w rysowaniu:
- przyciąganie (osnap): koniec, środek, przecięcie, prostopadle, środek okręgu, styczna, najbliższy punkt na linii — z czytelnym znaczkiem i podpisem
- siatka (wyłączona / kropki / linie) z przyciąganiem do węzłów — tylko w modelu, nie na wydruku
- uchwyty zaznaczonych elementów: przeciągnięcie końca, wierzchołka, środka albo kwadrantu okręgu
- kierunki i śledzenie (ortho + tracking): linie prowadzące w poziomie i w pionie, od wskazanego punktu, wzdłuż i prostopadle do istniejącej linii; przełącznik „tylko kąty proste”
- wymiary wpisywane z klawiatury w trakcie rysowania (długość, a dla prostokąta `szer;wys`), w jednostkach rysunku

## Grubości i rodzaje linii — ma być łatwo

- U góry dwie pastylki: warstwa i kreska. Kreska otwiera wybór: grubości pokazane jako prawdziwe kreski (0,13 · 0,18 · 0,25 · 0,35 · 0,5 · 0,7 mm) i rodzaje (ciągła, kreskowa, osiowa, punktowa). Wybór dotyczy następnych elementów albo zaznaczenia. Z zaznaczeniem pastylka warstwy przenosi je na wybraną warstwę.
- Pędzel (M): przemalowuje istniejące linie kliknięciem albo przeciągnięciem przez kilka naraz — kreskę, warstwę albo jedno i drugie — tym, co jest w pastylkach u góry (pastylki dostają obwódkę). Pipeta (przycisk na pasku pędzla albo ⌥ + klik na Macu, Ctrl + klik w Windows) bierze kreskę i warstwę innej linii, żeby nadać je kolejnym.
- Cyfry zawsze służą do wpisywania wartości (długość, `szer;wys`, promień, kąt) — nie zmieniają grubości.
- Kreska może być „jak warstwa” albo ustawiona osobno na elemencie.
- Na ekranie linie mają taką grubość jak na papierze w wybranej skali (z przełącznikiem „cienkie linie” do precyzyjnej pracy).

## Rysowanie w skali

- Rysunek jest w jednostkach rzeczywistych (m, cm, mm — do wyboru, jak w Modo).
- Skalę (1:20, 1:50, 1:100, 1:200, 1:500, własna) wybiera się na dole okna. Od skali zależy, jak grube są kreski na ekranie, jak duży jest tekst i gęstość kreskowania — tak, żeby na wydruku wyszły zadane milimetry.

## Układy wydruku (layouty) — od pierwszej wersji

- Zakładki na dole: „Model” i dowolna liczba arkuszy.
- Arkusz ma format (A4–A0, poziomo/pionowo) i ramkę z tabelką.
- Na arkuszu stawia się okna (rzutnie) pokazujące fragment modelu w zadanej skali; każde okno może mieć inną skalę i inne widoczne warstwy.
- Na arkuszu można też rysować i pisać bezpośrednio (tytuły, opisy, legenda).
- Wyjście: PDF wektorowy w skali, PNG i drukowanie na drukarce.

Prosty tekst (także w kilku wierszach) i wymiary (liniowy, łańcuch, kątowy, promień, średnica) są potrzebne, żeby arkusz dało się opisać — zaplanuj je razem z layoutami, w najprostszej postaci.

## Pliki

- Własny format (JSON, jeden plik na rysunek z arkuszami).
- Import i eksport DXF; import DWG. Czytnik DXF i DWG weź z Modo (`renderer/dxf.js`, `renderer/dwg.js`, `renderer/vendor/libredwg` w repozytorium michallenczewski/modo) — tam już działa.
- Docelowo Modo ma eksportować rzut i przekrój do DXF, a mini CAD ma dawać Modo podkład. Formatem wymiany jest DXF; wspólnego silnika nie potrzebujemy.

## Interfejs

- Ten sam język wizualny co Modo i Gapa: jasny papier, spokojne ikony, mało ramek, tryb ciemny.
- Lewy pasek narzędzi (jak w Modo), u góry pasek kresek i warstwa, u dołu podpowiedź, pole wymiaru, skala, zakładki arkuszy.
- Skróty w moim układzie (jak w Modo): Q zaznacz, W przesuń, E obróć, R skaluj, A linia, S gumka/usuń, D prostokąt, Z pokaż wszystko. Dla pozostałych narzędzi zaproponuj klawisze pod lewą rękę.
- Tryb minimalny (Tab): sama kartka i mała plakietka z narzędziem, warstwą i kreską; wymiar wpisywany przy kursorze.
- Opisy skrótów zgodne dla Maca (⌘/⌥) i Windows (Ctrl/Alt).

## Technika

- Tak jak Modo i Gapa: Electron, czysty JavaScript w modułach, bez kroku budowania; wersja przeglądarkowa do testów obok programu.
- Instalatory na Windows i Maca przez GitHub Actions, uruchamiane ręcznie; program sam sprawdza nowe wersje. Wzór: repozytorium Modo (`.github/workflows/build.yml`, `main.js`).
- Rysowanie na płótnie 2D albo w SVG — zaproponuj i uzasadnij, pamiętając o wektorowym PDF.
- Licencja GPL-3.0-or-later (dołączamy LibreDWG).

## Pierwsze kroki

1. Zaproponuj kilka nazw. Zasady z poprzednich programów: krótka, zrozumiała po polsku, ale dająca się używać w innych językach; bez włoskich i hiszpańskich stylizacji; pasująca do rodziny Modo, Gapa, Blat.
2. Pokaż makietę wyglądu (okno modelu i okno arkusza) — **zanim powstanie kod programu**.
3. Po akceptacji makiety spisz w `ARCHITEKTURA.md` model danych i podział na pliki, załóż repozytorium i zbuduj etap 1.

## Etapy

1. **Kartka i kreski.** Okno, przesuwanie i przybliżanie, linia, polilinia, prostokąt, okrąg, łuk, zaznaczanie, przesuń/kopiuj/usuń, cofanie, przyciąganie, kierunki, wpisywanie wymiarów, pasek kresek, warstwy, skala, zapis i otwieranie.
2. **Arkusze.** Zakładki, format, ramka z tabelką, okna w skali, tekst, PDF. (Wcześnie, bo chcę od razu widzieć wydruk.)
3. **Zmienianie.** Offset, fillet, trim, extend, obróć, odbij, skaluj.
4. **Bloki i kreskowanie.**
5. **Wymiana.** DXF w obie strony, DWG, wymiary.

Po każdym etapie: krótka informacja, co działa, czego jeszcze nie ma, i link do wersji przeglądarkowej albo instalator, jeśli o niego poproszę.
