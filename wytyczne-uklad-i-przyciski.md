# Układ pod górnym paskiem, okienka, zakładki i przyciski — jak to zrobiono w Modo

Uzupełnienie do `WYTYCZNE_INTERAKCJE.md` i `wzorzec_przyciskow.html`. Opisuje poprawki z Modo (listopad 2026),
żeby powtórzyć je w innym programie z rodziny (np. Rysio). Nazwy klas w przykładach są z Modo — w innym programie
podmień je na swoje, ale **liczby, krzywe i kolejność kroków zostaw**.

Zanim zaczniesz: zmierz, jak jest (punkt 7). Bez pomiaru 1–6 px różnicy łatwo przeoczyć.

---

## 1. Jedna linia pod górnym paskiem

Wszystko, co zaczyna się pod górnym paskiem — pasek narzędzi po lewej, obszar roboczy (płótno / widok) i pierwsza
karta panelu po prawej — ma **tę samą górną krawędź**.

Pułapka: obrys rysowany cieniem (`box-shadow: 0 0 0 1px …`) wychodzi 1 px **na zewnątrz** elementu. Panel z kartami
ma zwykle 1 px wewnętrznego marginesu (żeby przewijany panel nie ucinał obrysu kart), więc karta zaczyna się 1 px niżej
niż obszar roboczy. Wyrównaj, dodając ten sam 1 px u góry obszaru roboczego i paska narzędzi:

```css
#panel { padding: 1px 12px 12px 1px; }          /* 1 px, żeby obrys kart nie był ucięty */
#view  { margin: 1px 12px 0 0; }                /* obszar roboczy: ten sam 1 px u góry */
#tools { margin: 1px 0 12px; }                  /* pasek narzędzi: też */
```

## 2. Okienka i menu spod górnego paska

Okienko (np. Widok, Słońce, Eksport) i menu (Plik, ustawienia) otwierane z przycisku na górnym pasku:

- **nie** zaczynają się tuż pod przyciskiem (wtedy nachodzą na pasek albo „wiszą” kilka pikseli nad linią z punktu 1),
- **unoszą się nad obszarem roboczym**: górna krawędź = górna krawędź obszaru roboczego **+ 12 px**
  (tyle, ile wynosi odstęp między obszarem roboczym a panelem — ten sam rytm),
- w poziomie: prawa krawędź okienka równo z prawą krawędzią przycisku, ale nie bliżej niż 8 px od brzegu okna,
- największa wysokość: `calc(100vh - 90px)`, z przewijaniem w środku.

```js
// górna krawędź okienka spod górnego paska
const POP_GAP = 12;
const belowBar = (anchor, r) => anchor.closest('header')
  ? document.querySelector('#view').getBoundingClientRect().top + POP_GAP
  : r.bottom + 6;                                    // okienko spod przycisku gdzie indziej — jak dotąd

function openPop(pop, anchor) {
  pop.hidden = false;
  const r = anchor.getBoundingClientRect(), w = pop.offsetWidth;
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
  pop.style.top = belowBar(anchor, r) + 'px';
}
```

```css
.pop { position: fixed; max-height: calc(100vh - 90px); overflow: auto; }
```

To samo `belowBar` stosuje się do **każdego** menu z górnego paska (Plik, ustawienia), nie tylko do okienek.

## 3. Zakładki (wybór jednej z kilku opcji: Szkic / Kreska / Model, rzut, rozmiar…)

Wybraną zakładkę zaznacza **jeden wspólny wskaźnik, który przeskakuje** pod nią ze sprężyną — tak samo jak wskaźnik
narzędzi (punkt 3 wytycznych). Samo przełączenie tła z jednej zakładki na drugą wygląda na „martwe”.

```css
.seg { position: relative; overflow: hidden; display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--soft); }
.seg > .ind { position: absolute; top: 2px; bottom: 2px; left: 0; border-radius: 6px; pointer-events: none;
  background: var(--pill); box-shadow: var(--pillsh);
  transition: transform .42s var(--spring), width .42s var(--spring); }
.seg > .ind.cicho { transition: none; }                       /* pierwsze ustawienie i zmiana rozmiaru — bez ruchu */
.seg.zind > button { position: relative; z-index: 1; white-space: nowrap; }
.seg.zind > button.on { background: transparent; box-shadow: none; }
.seg.stretch > button { flex: 1; padding: 0 6px; }
.seg > button:focus-visible { outline-width: 1.5px; outline-offset: -1.5px; }   /* ramka fokusu w środku kapsuły */
```

```js
// dla każdej grupy zakładek: wskaźnik idzie pod przycisk z klasą .on — bez względu na to, które miejsce w kodzie ją ustawia
for (const seg of document.querySelectorAll('.seg')) {
  const ind = document.createElement('div'); ind.className = 'ind cicho'; seg.prepend(ind); seg.classList.add('zind');
  let first = true;
  const move = () => {
    const on = seg.querySelector(':scope > button.on'); ind.style.opacity = on ? 1 : 0; if (!on || !on.offsetWidth) return;
    ind.style.width = on.offsetWidth + 'px'; ind.style.transform = `translateX(${on.offsetLeft}px)`;
    if (first) { first = false; requestAnimationFrame(() => requestAnimationFrame(() => ind.classList.remove('cicho'))); }
  };
  new MutationObserver(move).observe(seg, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  new ResizeObserver(() => { ind.classList.add('cicho'); move(); requestAnimationFrame(() => ind.classList.remove('cicho')); }).observe(seg);
  move();
}
```

Pułapki:
- `overflow: hidden` na kapsule jest potrzebne, bo sprężyna na chwilę wybija wskaźnik 2–3 px poza kapsułę.
- Przez `overflow: hidden` długi napis zakładki (np. „Widok ×2”) zawinie się w dwie linie i zostanie ucięty —
  stąd `white-space: nowrap` i mniejszy boczny margines w zakładkach rozciągniętych na całą szerokość.
- Zakładki w okienku, które otwiera się później, mają przy starcie szerokość 0 — ustawia je dopiero `ResizeObserver`
  przy pierwszym pokazaniu. Sprawdź to na zakładkach w okienku, nie tylko na górnym pasku.

## 4. Przyciski z samym tekstem

Według punktu 2b wytycznych (i bloku `.tx` we wzorcu): przycisk bez ikony ugina się **cały** do 0,97 tą samą klasą
`.wcis` co ikony. W programie trzeba objąć tym **wszystkie** rodzaje przycisków tekstowych, nie tylko jedną klasę:

```js
// selektor w kodzie .wcis ze wzorca: ikony + wszystkie przyciski z tekstem + zakładki + pozycje menu
const b = e.target.closest && e.target.closest('.ib, .tb, .primary, .menu button, .seg > button');
if (!b || e.button || b.disabled) return;
```

```css
.tb, .primary, .menu button, .seg > button { transition: background-color .15s, color .15s, opacity .15s, transform .35s var(--spring); }
.tb.wcis, .primary.wcis, .menu button.wcis, .seg > button.wcis { transform: scale(.97); transition: transform .09s ease-out; }
.tb.tak { animation: takTx .55s ease-out; }
@keyframes takTx { 0% { background: var(--hover); } }                 /* bez klatki końcowej — wraca do własnego tła */
.primary.tak { animation: takPri .55s ease-out; }
@keyframes takPri { 0% { opacity: .6; } 100% { opacity: 1; } }        /* ciemny główny przycisk: przezroczystość zamiast tła */
```

```js
// „tak” po kliknięciu przycisku z tekstem
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.tb, .primary'); if (b && !b.disabled) zagraj(b, 'tak');
});
```

Uwaga: przycisk z własnym szarym tłem (np. „Dodaj”) — animacja „tak” ze wzorca kończy się na `transparent`, więc na
koniec tło by mignęło. Dlatego `takTx` ma tylko klatkę początkową.

## 5. Fokus po kliknięciu myszą

Przycisk kliknięty myszą nie może zatrzymywać fokusu klawiatury. Inaczej następny skrót klawiszowy zapala na nim
grubą ramkę fokusu, a spacja albo Enter klikają go jeszcze raz (w programach, w których spacja jest skrótem, to błąd).

```js
document.addEventListener('click', e => {
  if (e.detail === 0) return;                                        // z klawiatury (Tab + Enter/spacja) fokus zostaje
  const b = e.target.closest && e.target.closest('button, input[type="checkbox"]');
  if (b && document.activeElement === b) b.blur();
}, true);
```

Nie dodawaj tu `input[type="color"]` — zdjęcie fokusu w chwili kliknięcia potrafi zamknąć systemowy wybór koloru.

## 6. Okienko z wieloma polami (np. Widok)

- **Jedna wysokość w całym okienku: 28 px** — przyciski-pola (Izometria, Góra…), zakładki (kapsuła 28 px, przyciski 24 px),
  pola liczbowe i przyciski z ikonami.
- **Bieżąca opcja lekko oznaczona**, w tym samym stylu co wybrana zakładka: jaśniejsze tło i delikatny obrys.

```css
#viewPop .views button { height: 28px; }
#viewPop .seg > button { height: 24px; }
.views button.on { background: var(--pill); box-shadow: 0 0 0 1px var(--cardline), var(--pillsh); }
```

W Modo „bieżący widok” to ten, w którym kierunek kamery zgadza się z widokiem standardowym (iloczyn skalarny > 0,9995);
po obróceniu kamery ręcznie oznaczenie znika. W innym programie „bieżąca opcja” to po prostu ta, która jest teraz
w użyciu — ważne, żeby oznaczenie liczyć przy każdym otwarciu okienka, a nie zapamiętywać kliknięcia.

## 7. Jak sprawdzić

Wklej w konsoli programu (albo wersji przeglądarkowej) — podmień selektory na swoje:

```js
const top = s => +document.querySelector(s).getBoundingClientRect().top.toFixed(1);
({ tools: top('#tools'), view: top('#view'), card: top('#panel .psec'), pop: top('.pop:not([hidden])') })
// oczekiwane: tools = view = card, pop = view + 12
```

I na oko, w jasnym i ciemnym motywie:
- zakładka: kliknij skrajną lewą i skrajną prawą — wskaźnik przeskakuje i nie wystaje poza kapsułę,
- przycisk z tekstem: szybkie kliknięcie — widać ugięcie i błysk,
- kliknij zakładkę myszą, potem naciśnij dowolny skrót — **nie** może pojawić się ramka fokusu,
- przejdź klawiszem Tab po przyciskach — ramka fokusu **ma** się pojawiać (cienka, w środku zakładki),
- długie napisy w zakładkach mieszczą się w jednej linii.

Jeśli nic się nie rusza — sprawdź „Ogranicz ruch” (macOS) / „Pokaż animacje” (Windows); wtedy wzorzec słusznie
wyłącza animacje.
