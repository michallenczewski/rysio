// Język interfejsu. Napisy w kodzie są po polsku i same są kluczami słownika:
//   _t('Zaznacz')                  → zwykły napis
//   _t`Liczba boków: ${n}.`        → szablon; klucz to części dosłowne ze znacznikami {0}, {1}… („Liczba boków: {0}.”)
// Po angielsku napis bierze się ze słownika lang/en.js; brak tłumaczenia = napis polski (nic się nie psuje).
// Język wybiera się w menu Plik i zmienia go przeładowanie okna (napisy w tablicach modułów liczą się raz, przy starcie).
import EN from './lang/en.js';

const KEY = 'rysio.lang';
export const LANGS = [['pl', 'Polski'], ['en', 'English']];
export const lang = (() => { try { const l = localStorage.getItem(KEY); if (l === 'en' || l === 'pl') return l; } catch (e) {} return 'pl'; })();
const dict = lang === 'en' ? EN : null;

export function _t(s, ...vals) {
  if (Array.isArray(s) && s.raw) {
    const key = s.map((p, i) => p + (i < s.length - 1 ? '{' + i + '}' : '')).join('');
    const tpl = (dict && dict[key]) ?? key;
    return tpl.replace(/\{(\d+)\}/g, (m, i) => { const v = vals[+i]; return v === undefined ? m : String(v); });
  }
  return (dict && dict[s]) ?? s;
}

export function setLang(l) { try { localStorage.setItem(KEY, l); } catch (e) {} }

// Stałe napisy z index.html: teksty i podpowiedzi (title, aria-label, placeholder). Elementy z treścią użytkownika
// mają translate="no" i są pomijane.
export function translateDom(root = document.body) {
  document.documentElement.lang = lang;
  if (!dict) return;
  const walk = el => {
    if (el.nodeType === 3) { const t = el.nodeValue.trim(); if (t && dict[t]) el.nodeValue = el.nodeValue.replace(t, dict[t]); return; }
    if (el.nodeType !== 1 || el.getAttribute('translate') === 'no' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.namespaceURI === 'http://www.w3.org/2000/svg') return;
    for (const a of ['title', 'aria-label', 'placeholder']) { const v = el.getAttribute(a); if (v && dict[v]) el.setAttribute(a, dict[v]); }
    for (const c of el.childNodes) walk(c);
  };
  walk(root);
  if (dict['Rysio']) document.title = dict['Rysio'];
}
