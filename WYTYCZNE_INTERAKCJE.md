# Wytyczne języka interakcji

Dotyczy wszystkich programów z rodziny (Gapa, Blat, Modo, Ryś, Lux i kolejnych).
Cel: przyciski, przełączniki i podpowiedzi zachowują się wszędzie **tak samo** — ta sama krzywa,
te same czasy, ta sama reakcja na najechanie, wciśnięcie i powodzenie. Wzorem jest Blat
(repozytorium michallenczewski/blat-app, `renderer/index.html` i `renderer/app.js`).

Zasada ogólna: ruch jest krótki, sprężysty i służy informacji (coś się włączyło, udało, nie udało).
Żadnych ozdobnych animacji bez powodu, żadnych pętli, nic dłuższego niż pół sekundy.

## 1. Jedna krzywa: „sprężyna”

```css
:root { --spring: cubic-bezier(.34, 1.56, .64, 1); }   /* lekkie przestrzelenie i powrót */
```

Używamy jej do wszystkiego, co się przesuwa, skaluje albo wskakuje na miejsce.
Do samego przenikania kolorów i przezroczystości — zwykłe `ease` / `ease-out`.

| ruch | czas | krzywa |
|---|---|---|
| kolor tła przycisku przy najechaniu | 0,15 s | ease |
| ikona: uniesienie przy najechaniu, powrót po wciśnięciu | 0,35 s | sprężyna |
| ikona: ugięcie przy wciśnięciu (trzymane co najmniej 90 ms) | 0,09 s | ease-out |
| przycisk z samym tekstem: ugięcie całego do 0,97 / powrót | 0,09 s / 0,35 s | ease-out / sprężyna |
| wskaźnik wybranego narzędzia (przeskok) | 0,42 s | sprężyna |
| wysuwana grupa opcji (np. kolory mazaka) | 0,42 s | sprężyna (max-width) + 0,2 s przezroczystość |
| włączenie przełącznika (wypełnienie od środka) | 0,42 s | sprężyna |
| „tak” — reakcja na udaną akcję | 0,5–0,55 s | sprężyna + ease-out |
| „nie” — potrząśnięcie | 0,38 s | ease-out |
| podpowiedź pod przyciskiem | pojawia się po 1,5 s; 0,12 s przezroczystość, 0,2 s przesunięcie | ease / sprężyna |

## 2. Przycisk z ikoną: najechanie i wciśnięcie

Gotowy, działający kod jest w `projekt/wzorzec_przyciskow.html`. **Kopiuj go stamtąd dosłownie**
(bloki oznaczone „KOPIUJ”), zamiast odtwarzać z opisu.

```css
.ib { transition: background-color .15s, color .15s; }
.ib:hover { background: var(--hover); color: var(--text); }
.ib > svg { transition: transform .35s var(--spring); }
.ib:hover > svg { transform: translateY(-1px); }                                /* ikona lekko się unosi */
.ib.wcis > svg { transform: scale(.84); transition: transform .09s ease-out; }  /* ugina się przy wciśnięciu */
```

```js
// klasa .wcis zamiast :active — :active trwa tyle co kliknięcie (~0,1 s), więc ugięcia prawie nie widać
document.addEventListener('pointerdown', e => {
  const b = e.target.closest && e.target.closest('.ib'); if (!b || e.button) return;
  b.classList.add('wcis'); const t0 = performance.now();
  const up = () => { removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    setTimeout(() => b.classList.remove('wcis'), Math.max(0, 90 - (performance.now() - t0))); };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
});
```

Pułapki, przez które animacja „nie działa”:

- Ikona musi być **bezpośrednim dzieckiem** przycisku (`<button class="ib"><svg>`). Jeśli jest owinięta w `span`
  albo to `img`, zmień selektor tak, żeby trafiał w element ikony.
- Na ikonie nie może być żadnego innego `transform` ani `transition` (np. z biblioteki ikon albo z Tailwinda) —
  nadpisze ugięcie.
- Nie zastępuj klasy `.wcis` samym `:active`.
- Po wdrożeniu sprawdź szybkim kliknięciem: ikona ma się wyraźnie zmniejszyć i sprężyście wrócić.
  Jeśli nic się nie rusza, sprawdź też, czy w systemie nie jest włączone „Ogranicz ruch” (macOS) /
  „Pokaż animacje” wyłączone (Windows) — wtedy reguła z punktu 9 słusznie wyłącza ruch.

### 2b. Przycisk z samym tekstem

Przycisk bez ikony (czynność w panelu, wiersz listy, pozycja menu, przycisk w oknie potwierdzenia) nie ma czego
ugiąć, więc **ugina się cały**: do 0,97 w 0,09 s (ease-out), po puszczeniu wraca sprężyną w 0,35 s. Tę samą klasę
`.wcis` dodaje ten sam kod JS co przy ikonach (dopisz selektor przycisków tekstowych). Po kliknięciu, jak wszędzie,
„tak”: tło błyska kolorem najechania i gaśnie (na ciemnym głównym przycisku zamiast tła — przezroczystość 0,6 → 1).

```css
.act { transition: background-color .15s, color .15s, opacity .15s, transform .35s var(--spring); }
.act.wcis { transform: scale(.97); transition: transform .09s ease-out; }
```

Ikona przycisku: 15 px, kreska 1,3 px, zaokrąglone końce, **najwyżej 2–3 proste kształty**
(w tej wielkości szczegóły znikają). Przycisk 30 × 28 px, zaokrąglenie 7 px.

## 3. Grupa narzędzi z przeskakującym wskaźnikiem

Narzędzia leżą w jednej „kapsule” (`background: var(--soft)`, zaokrąglenie 9 px, odstęp 2 px).
Wybrane narzędzie zaznacza **jeden wspólny wskaźnik**, który przeskakuje pod nie ze sprężyną
(zamiast przełączać tło na każdym przycisku osobno).

```css
.tools { position: relative; display: flex; gap: 2px; padding: 2px; border-radius: 9px; background: var(--soft); }
.tools .ind { position: absolute; top: 2px; left: 0; width: 30px; height: 28px; border-radius: 7px;
  background: var(--toolon); box-shadow: 0 0 0 1px var(--cardline), 0 1px 2px rgba(0,0,0,.06);
  transition: transform .42s var(--spring); pointer-events: none; }
.tools .ib { position: relative; z-index: 1; }
.tools .ib.on, .tools .ib:hover { background: transparent; color: var(--text); }
```

```js
const on = tools.querySelector('.ib.on'), ind = tools.querySelector('.ind');
ind.style.transform = 'translateX(' + on.offsetLeft + 'px)';
```

**Kolor wskaźnika musi być wyraźnie jaśniejszy od kapsuły w obu motywach**
(jasny: `#fff`, ciemny: `#3a3a38` — nie kolor kart, bo w ciemnym motywie znika).

## 4. Przełącznik „włączone” (np. przypięcie na wierzchu)

Stan włączony ma być widoczny od razu: tło w kolorze akcentu programu, ikona biała i **pełna**
(wypełniona), wyłączony — zwykły szary kontur. Wypełnienie wyrasta od środka:

```css
.ib.on-state { position: relative; background: transparent; color: #fff; }
.ib.on-state::before { content: ""; position: absolute; inset: 0; border-radius: inherit; background: var(--accent); }
.ib.on-state svg { position: relative; }
.ib.wlacza::before { animation: wypelnij .42s var(--spring); }
@keyframes wypelnij { from { transform: scale(.4); opacity: 0; } to { transform: none; opacity: 1; } }
```

Ikona może dodatkowo zrobić mały, znaczący ruch (pinezka „wbija się”: przesunięcie −5 px i obrót −28° → 0,
0,48 s sprężyna; przy wyłączeniu lekko wyskakuje, 0,32 s). Animację włączamy tylko przy zmianie przez
użytkownika, nie przy starcie programu.

## 5. „Tak” i „nie” — reakcja na akcję

- **Udało się** (np. porządkowanie): tło przycisku błyska kolorem najechania i gaśnie (0,55 s),
  a elementy ikony krótko „wskakują” na miejsce (z przesunięcia ~2 px, obrotu ~±10° i skali ~0,6, sprężyna,
  kolejne kształty z opóźnieniem 30 ms).
- **Nie da się** (np. nic nie zaznaczono): przycisk potrząsa się w poziomie, **plus** krótka podpowiedź
  tekstowa u dołu okna, co zrobić.

```css
.ib.nie { animation: nie .38s ease-out; }
@keyframes nie { 20% { transform: translateX(-3px); } 45% { transform: translateX(3px); } 70% { transform: translateX(-2px); } }
.ib.tak { animation: tak .55s ease-out; }
@keyframes tak { 0% { background: var(--hover); } 100% { background: transparent; } }
```

```js
// ponowne odpalenie animacji przy kolejnym kliknięciu
b.classList.remove('tak', 'nie'); void b.offsetWidth; b.classList.add('tak');
```

## 6. Podpowiedź po zatrzymaniu kursora

Zamiast systemowego dymka (`title`) — własna, mała etykieta pod przyciskiem: **nazwa** i obok,
przygaszony, **skrót**. Pojawia się po **1,5 s** bez ruchu; po przejściu na sąsiedni przycisk
(w ciągu 0,4 s od zniknięcia poprzedniej) — **od razu**. Znika przy zjechaniu, kliknięciu i kółku myszy.
Gdy pod przyciskiem brak miejsca, staje nad nim. Skróty piszemy zgodnie z systemem (⌘ ⌥ ⇧ na Macu, Ctrl Alt Shift na Windows).

```css
#hint { position: fixed; z-index: 95; display: flex; gap: 7px; align-items: center; left: -999px;
  background: var(--text); color: var(--bg); font-size: 11.5px; line-height: 1; padding: 5px 8px; border-radius: 6px;
  opacity: 0; transform: translateY(-2px); transition: opacity .12s, transform .2s var(--spring);
  pointer-events: none; white-space: nowrap; }
#hint.on { opacity: .94; transform: none; }
#hint kbd { font: inherit; font-size: 10.5px; opacity: .6; }
```

```js
// przyciski mają title="Nazwa (Skrót)"; przy pierwszym najechaniu przenosimy go do data-tip
let hintT = 0, hintEl = null, hintLast = 0;
function hintShow(el) {
  const h = document.getElementById('hint'), t = el.dataset.tip || ''; if (!t) return;
  const m = t.match(/^(.*?)\s*\(([^)]+)\)$/);
  h.innerHTML = ''; const n = document.createElement('span'); n.textContent = m ? m[1] : t; h.appendChild(n);
  if (m) { const k = document.createElement('kbd'); k.textContent = m[2]; h.appendChild(k); }
  h.classList.add('on'); const r = el.getBoundingClientRect(), w = h.offsetWidth, hh = h.offsetHeight;
  const below = r.bottom + 8 + hh < innerHeight;
  h.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + 'px';
  h.style.top = (below ? r.bottom + 6 : r.top - hh - 6) + 'px';
}
function hintHide() { clearTimeout(hintT); if (hintEl) hintLast = Date.now(); hintEl = null; document.getElementById('hint').classList.remove('on'); }
document.addEventListener('pointerover', e => {
  const el = e.target.closest && e.target.closest('.ib'); if (!el || el === hintEl) return;
  if (el.title) { el.dataset.tip = el.title; el.removeAttribute('title'); }   // także gdy program zmieni title później
  hintHide(); hintEl = el;
  hintT = setTimeout(() => { if (hintEl === el) hintShow(el); }, Date.now() - hintLast < 400 ? 0 : 1500);
});
document.addEventListener('pointerout', e => { const el = e.target.closest && e.target.closest('.ib'); if (el && el === hintEl && !el.contains(e.relatedTarget)) hintHide(); });
addEventListener('pointerdown', hintHide, true); addEventListener('wheel', hintHide, { passive: true });
```

```html
<div id="hint" role="tooltip"></div>
```

## 7. Wysuwana grupa opcji

Opcje zależne od narzędzia (np. kolory i grubości mazaka) chowają się, gdy narzędzie jest wyłączone,
i **wysuwają się** obok niego (max-width 0 → szerokość, 0,42 s sprężyna, przezroczystość 0,2 s).
Wybrana opcja ma ten sam wygląd co wskaźnik narzędzi (`--toolon` + delikatny cień).

## 8. Ustawienia: jeden przycisk w prawym górnym rogu

We wszystkich programach z rodziny ustawienia są w **tym samym miejscu i pod tą samą ikoną**:

- Jeden przycisk ustawień z ikoną dwóch suwaków, **ostatni na prawym końcu górnego paska**
  (na Windows tuż przed systemowymi przyciskami okna). Żadnych przycisków ustawień na dole bocznego paska.
- Ikona suwaków (15 px, kreska 1,3 px):
  `<path d="M2.5 5.5h11M2.5 10.5h11"/><circle cx="6" cy="5.5" r="1.8" fill="var(--bg)"/><circle cx="10.5" cy="10.5" r="1.8" fill="var(--bg)"/>`
- Menu otwiera się **pod przyciskiem, wyrównane do jego prawej krawędzi**. Zawsze w tej kolejności,
  grupy oddzielone kreską:
  1. **Jasny motyw / Ciemny motyw / Motyw jak w systemie** (zaznaczony ✓; „jak w systemie” to domyślny
     i reaguje na zmianę motywu w systemie). Osobnego przycisku motywu nie ma.
  2. **Skróty klawiszowe** (skrót `?`). Osobnego przycisku ściągi nie ma; klawisz `?` działa zawsze.
  3. Opcje danego programu (np. w Blacie: kółko myszy, aktywowanie po najechaniu).
  4. Na dole, przygaszony, **numer wersji** („Blat 0.2.5”), a pod nim **Sprawdź aktualizacje** albo
     **Zainstaluj wersję X**, gdy jest nowsza.
- Dół bocznego paska (jeśli program go ma) jest tylko na treść, np. ścieżkę do folderu.
- W bardzo wąskim oknie przycisk ustawień zostaje widoczny do końca; wcześniej chowają się nazwa
  dokumentu i przyciski z własnym skrótem klawiszowym.

## 9. Mniej ruchu, gdy system o to prosi

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
```

## 10. Sprawdzenie przed commitem

- Najechanie, wciśnięcie, włączenie i podpowiedź sprawdzone w **jasnym i ciemnym** motywie.
- Wskaźnik wybranego narzędzia wyraźnie widoczny w obu motywach (różnica jasności z kapsułą co najmniej ~12/255).
- Podpowiedzi: każda ma nazwę i skrót zgodny z systemem; nie wraca systemowy dymek.
- Przycisk ustawień jest ostatni w górnym pasku, menu ma motyw, skróty, wersję i aktualizacje w opisanej kolejności.
- Płynność bez zmian (animujemy tylko `transform` i `opacity`, poza krótkimi przejściami koloru).
