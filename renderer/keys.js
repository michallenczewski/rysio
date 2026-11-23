import { _t } from './i18n.js';
// Skróty klawiszowe. Domyślne to układ Michała (jak w Modo: Q W E R, A S D, Z X C); każdy można zmienić w oknie skrótów (klawisz ?).
// Zapis: kod klawisza (KeyboardEvent.code bez „Key”/„Digit”) z modyfikatorami, np. „L”, „Shift+B”, „Mod+S”.
// „Mod” to ⌘ na Macu i Ctrl na Windows. Zapis i wyświetlanie skrótów — z Modo 0.4.2 (renderer/keys.js).
// later: true — polecenie z kolejnego etapu (na pasku wyszarzone).

export const ACTIONS = [
  { group: _t('Rysowanie'), id: 'line', name: _t('Linia'), keys: ['A'] },
  { group: _t('Rysowanie'), id: 'pline', name: _t('Polilinia'), keys: ['F'] },
  { group: _t('Rysowanie'), id: 'rect', name: _t('Prostokąt'), keys: ['D'] },
  { group: _t('Rysowanie'), id: 'circle', name: _t('Okrąg'), keys: ['V'] },
  { group: _t('Rysowanie'), id: 'arc', name: _t('Łuk przez trzy punkty'), keys: ['B'] },
  { group: _t('Rysowanie'), id: 'arcC', name: _t('Łuk ze środka'), keys: ['Shift+B'] },
  { group: _t('Rysowanie'), id: 'text', name: _t('Tekst'), keys: ['Y'], later: true },
  { group: _t('Rysowanie'), id: 'dim', name: _t('Wymiar'), keys: ['U'], later: true },
  { group: _t('Rysowanie'), id: 'hatch', name: _t('Kreskowanie'), keys: ['H'], later: true },
  { group: _t('Rysowanie'), id: 'block', name: _t('Bloki'), keys: ['K'], later: true },
  { group: _t('Edycja'), id: 'select', name: _t('Zaznacz'), keys: ['Q'] },
  { group: _t('Edycja'), id: 'eraser', name: _t('Usuń (gumka)'), keys: ['S'] },
  { group: _t('Edycja'), id: 'brush', name: _t('Pędzel — przemaluj kreskę i warstwę'), keys: ['M'] },
  { group: _t('Edycja'), id: 'move', name: _t('Przesuń'), keys: ['W'] },
  { group: _t('Edycja'), id: 'copy', name: _t('Kopiuj'), keys: ['C'] },
  { group: _t('Edycja'), id: 'rotate', name: _t('Obróć'), keys: ['E'], later: true },
  { group: _t('Edycja'), id: 'mirror', name: _t('Odbij'), keys: ['Shift+E'], later: true },
  { group: _t('Edycja'), id: 'scale', name: _t('Skaluj'), keys: ['R'], later: true },
  { group: _t('Edycja'), id: 'offset', name: _t('Odsunięcie'), keys: ['T'], later: true },
  { group: _t('Edycja'), id: 'fillet', name: _t('Zaokrąglij narożnik'), keys: ['G'], later: true },
  { group: _t('Edycja'), id: 'trim', name: _t('Przytnij / wydłuż'), keys: ['X'], later: true },
  { group: _t('Edycja'), id: 'undo', name: _t('Cofnij'), keys: ['Mod+Z'] },
  { group: _t('Edycja'), id: 'redo', name: _t('Ponów'), keys: ['Mod+Shift+Z', 'Mod+Y'] },
  { group: _t('Edycja'), id: 'delete', name: _t('Usuń zaznaczone'), keys: ['Delete', 'Backspace'] },
  { group: _t('Edycja'), id: 'selectAll', name: _t('Zaznacz wszystko'), keys: ['Mod+A'] },
  { group: _t('Widok'), id: 'extents', name: _t('Pokaż wszystko'), keys: ['Z'] },
  { group: _t('Widok'), id: 'thin', name: _t('Cienkie linie'), keys: [] },
  { group: _t('Widok'), id: 'ortho', name: _t('Tylko kąty proste'), keys: [] },
  { group: _t('Widok'), id: 'snapToggle', name: _t('Przyciąganie włącz / wyłącz'), keys: [] },
  { group: _t('Widok'), id: 'theme', name: _t('Wygląd: automatyczny / jasny / ciemny'), keys: ['Mod+Shift+D'] },
  { group: _t('Plik'), id: 'new', name: _t('Nowy rysunek'), keys: ['Mod+N'] },
  { group: _t('Plik'), id: 'open', name: _t('Otwórz'), keys: ['Mod+O'] },
  { group: _t('Plik'), id: 'save', name: _t('Zapisz'), keys: ['Mod+S'] },
  { group: _t('Plik'), id: 'saveAs', name: _t('Zapisz jako'), keys: ['Mod+Shift+S'] },
  { group: _t('Plik'), id: 'keys', name: _t('Lista skrótów'), keys: ['Shift+Slash'] }
];

const STORE = 'rysio.keys';
export function loadKeys() {
  let over = {};
  try { over = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) {}
  const map = new Map();
  for (const a of ACTIONS) for (const k of (over[a.id] || a.keys)) map.set(k, a.id);
  return { map, over };
}
export function saveKeyOverride(over) { try { localStorage.setItem(STORE, JSON.stringify(over)); } catch (e) {} }
export function keysFor(id, over) { return (over && over[id]) || ACTIONS.find(a => a.id === id)?.keys || []; }

// zdarzenie → „Mod+Shift+S”
export function comboOf(e, isMac) {
  const code = e.code || '';
  if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(code)) return null;
  let k = code.replace(/^Key/, '').replace(/^Digit/, '');
  if (/^Numpad\d$/.test(code)) k = code.slice(6);
  const parts = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('Mod');
  if (isMac && e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(k);
  return parts.join('+');
}

// do wyświetlenia: „⌘⇧S” albo „Ctrl+Shift+S”
export function prettyCombo(c, isMac) {
  if (c === 'Shift+Slash') return '?';
  const name = { Mod: isMac ? '⌘' : 'Ctrl', Shift: isMac ? '⇧' : 'Shift', Alt: isMac ? '⌥' : 'Alt', Ctrl: '⌃', Space: _t('Spacja'), Delete: 'Delete', Backspace: isMac ? '⌫' : 'Backspace', Slash: '/', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', BracketLeft: '[', BracketRight: ']' };
  return c.split('+').map(p => name[p] || p).join(isMac ? '' : '+');
}
