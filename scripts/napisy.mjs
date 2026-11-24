// Napisy do tłumaczenia: wszystkie _t('…') i _t`…` z renderer/*.js oraz stałe teksty z renderer/index.html.
//   node scripts/napisy.mjs            — lista napisów bez tłumaczenia w renderer/lang/en.js (kod wyjścia 1, gdy są)
//   node scripts/napisy.mjs --json     — wszystkie klucze jako JSON (do uzupełniania słownika)
// Klucz szablonu to części dosłowne ze znacznikami {0}, {1}… — tak jak liczy go _t w renderer/i18n.js.
import fs from 'fs';
import path from 'path';

const R = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'renderer');
const keys = new Map();   // klucz → plik
const add = (k, f) => { if (k && k.trim() && !keys.has(k)) keys.set(k, f); };

// wartość literału JS ('…' albo fragment szablonu) — tylko typowe sekwencje ucieczki
const unesc = s => s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (m, c) => c[0] === 'u' ? String.fromCodePoint(parseInt(c.replace(/[u{}]/g, ''), 16)) : c[0] === 'x' ? String.fromCharCode(parseInt(c.slice(1), 16)) : ({ n: '\n', t: '\t', r: '\r', '0': '\0' })[c] ?? c);

function scanJs(src, f) {
  let i = 0;
  while ((i = src.indexOf('_t', i)) >= 0) {
    const prev = src[i - 1];
    if (prev && /[\w$.]/.test(prev)) { i += 2; continue; }
    let j = i + 2;
    if (src[j] === '`') { const r = tpl(src, j); if (r) { add(r.key, f); i = r.end; continue; } }
    if (src[j] === '(') {
      let k = j + 1; while (/\s/.test(src[k])) k++;
      const q = src[k];
      if (q === "'" || q === '"') {
        let m = k + 1, s = '';
        while (m < src.length && src[m] !== q) { if (src[m] === '\\') { s += src[m] + src[m + 1]; m += 2; } else s += src[m++]; }
        let n = m + 1; while (/\s/.test(src[n])) n++;
        if (src[n] === ')') add(unesc(s), f);
        i = m + 1; continue;
      }
      if (q === '`') { const r = tpl(src, k); if (r) { const parts = r.key; if (!/\{\d+\}/.test(parts)) add(parts, f); i = r.end; continue; } }
    }
    i = j;
  }
}
// szablon od znaku ` na pozycji p: części dosłowne + {n} w miejscu ${…} (z liczeniem nawiasów i zagnieżdżonych napisów)
function tpl(src, p) {
  let i = p + 1, key = '', lit = '', n = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { lit += c + src[i + 1]; i += 2; continue; }
    if (c === '`') { key += unesc(lit); return { key, end: i + 1 }; }
    if (c === '$' && src[i + 1] === '{') {
      key += unesc(lit) + '{' + n++ + '}'; lit = '';
      i = skipExpr(src, i + 2); continue;
    }
    lit += c; i++;
  }
  return null;
}
function skipExpr(src, i) {
  let depth = 1;
  while (i < src.length && depth) {
    const c = src[i];
    if (c === "'" || c === '"') { const q = c; i++; while (i < src.length && src[i] !== q) i += src[i] === '\\' ? 2 : 1; i++; continue; }
    if (c === '`') { const r = tpl(src, i); i = r ? r.end : i + 1; continue; }
    if (c === '{') depth++; else if (c === '}') depth--;
    i++;
  }
  return i;
}

for (const f of fs.readdirSync(R).filter(f => f.endsWith('.js'))) scanJs(fs.readFileSync(path.join(R, f), 'utf8'), f);

// index.html: teksty między znacznikami i atrybuty title / aria-label / placeholder (bez translate="no", skryptów, stylów i SVG)
{
  const html = fs.readFileSync(path.join(R, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|<!--[\s\S]*?-->/g, '');
  const ent = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d));
  // usuwamy elementy z translate="no" (proste, bez zagnieżdżeń tego samego znacznika)
  const clean = html.replace(/<(\w+)[^>]*translate="no"[^>]*>[\s\S]*?<\/\1>/g, '');
  for (const m of clean.matchAll(/\b(?:title|aria-label|placeholder)="([^"]*)"/g)) add(ent(m[1]).trim(), 'index.html');
  for (const m of clean.matchAll(/>([^<>]+)</g)) { const t = ent(m[1]).trim(); if (t && /\p{L}/u.test(t)) add(t, 'index.html'); }
}

const EN = (await import(path.join(R, 'lang', 'en.js'))).default;
if (process.argv.includes('--json')) { console.log(JSON.stringify([...keys.keys()], null, 1)); process.exit(0); }
const missing = [...keys].filter(([k]) => !(k in EN));
const extra = Object.keys(EN).filter(k => !keys.has(k));
for (const [k, f] of missing) console.log(`brak: ${JSON.stringify(k)}  (${f})`);
if (extra.length) console.log(`\nw słowniku, a nie w kodzie: ${extra.length}` + extra.slice(0, 20).map(k => '\n  ' + JSON.stringify(k)).join(''));
console.log(`\n${keys.size - missing.length} z ${keys.size} napisów przetłumaczonych.`);
process.exit(missing.length ? 1 : 0);
