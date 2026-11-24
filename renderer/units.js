import { DEC } from './i18n.js';
// Wymiary wpisywane w pole na dole okna. Liczba bez jednostki jest w jednostce rysunku (m, cm albo mm,
// przełącznik obok pola wymiarów); przecinek i kropka działają jako separator dziesiętny.
// Przykłady przy jednostce „cm”: „350” = 3,5 m, „3,5m” = 3,5 m, „35mm” = 3,5 cm. Dwa wymiary (prostokąt): „600;400”, „6 x 4”.
// Wewnętrznie wszystko jest w metrach.

const UNIT = { mm: 0.001, cm: 0.01, dm: 0.1, m: 1, km: 1000, '"': 0.0254, in: 0.0254, "'": 0.3048, ft: 0.3048 };
export const UNITS = ['m', 'cm', 'mm'];
const DIGITS = { m: 2, cm: 1, mm: 0 };

let unit = 'm';
try { const u = localStorage.getItem('rysio.unit'); if (UNITS.includes(u)) unit = u; } catch (e) {}
export const getUnit = () => unit;
export function setUnit(u, remember = true) {
  if (!UNITS.includes(u)) return;
  unit = u;
  if (remember) try { localStorage.setItem('rysio.unit', u); } catch (e) {}
}

export function parseLength(s) {
  if (s == null) return null;
  s = String(s).trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  const m = s.match(/^([-+]?\d*(?:[.,]\d*)?)(mm|cm|dm|m|km|in|ft|"|')?$/);
  if (!m || m[1] === '' || m[1] === '-' || m[1] === '+' || m[1] === '.' || m[1] === ',') return null;
  const v = parseFloat(m[1].replace(',', '.'));
  if (!isFinite(v)) return null;
  return v * UNIT[m[2] || unit];
}

// zwraca tablicę długości albo null; pojedyncza wartość daje tablicę jednoelementową
export function parseLengths(s) {
  const parts = String(s).split(/[;x×*]/i).map(t => t.trim()).filter((t, i, a) => t !== '' || a.length === 1);
  const out = parts.map(parseLength);
  return out.some(v => v === null) ? null : out;
}

// liczba w jednostce rysunku, bez jej nazwy (do pola wymiarów i par „6; 4”)
export function fmtNum(m) {
  if (!isFinite(m)) return '';
  const v = m / UNIT[unit];
  return (Math.abs(v) < 1e-9 ? 0 : v).toFixed(DIGITS[unit]).replace('.', DEC);
}
export const fmtLength = m => isFinite(m) ? fmtNum(m) + ' ' + unit : '';
