// Wersja w przeglądarce (do testów): zastępuje most do procesu głównego Electrona.
// W programie window.api ustawia preload.js, więc ten plik nic nie robi. Na wzór Modo 0.4.2.
(function () {
  if (window.api) return;
  const pick = accept => new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = () => res(i.files[0] || null); i.click();
  });
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  const AUTO = 'rysio.autozapis', LIB = 'rysio.biblioteka';
  const lib = () => { try { return JSON.parse(localStorage.getItem(LIB) || 'null'); } catch (e) { return null; } };
  const libPut = L => { try { localStorage.setItem(LIB, JSON.stringify(L)); return true; } catch (e) { return false; } };
  window.api = {
    web: true,
    platform: /Mac/.test(navigator.platform) ? 'darwin' : /Win/.test(navigator.platform) ? 'win32' : 'linux',
    async setLang() { return true; },
    async openFile() {
      const f = await pick('.rysio,.dxf,.dwg'); if (!f) return null;
      const cad = (/\.(dxf|dwg)$/i.exec(f.name) || [])[1];
      if (cad) return { path: null, name: f.name.replace(/\.(dxf|dwg)$/i, ''), cad: cad.toLowerCase(), data: new Uint8Array(await f.arrayBuffer()) };
      return { path: null, name: f.name.replace(/\.rysio$/i, ''), text: await f.text() };
    },
    async saveFile(p, text, suggested) { download(new Blob([text], { type: 'application/json' }), (suggested || 'Rysunek') + '.rysio'); return { path: null, name: suggested || 'Rysunek' }; },
    async recentList() { return []; },
    async saveBinary(data, suggested, ext) { download(new Blob([data], { type: ext === 'pdf' ? 'application/pdf' : ext === 'dxf' ? 'application/dxf' : 'image/png' }), (suggested || 'Rysunek') + '.' + ext); return true; },
    // autozapis w przeglądarce: jedna kopia w pamięci przeglądarki
    async autosave(key, rec) { try { localStorage.setItem(AUTO, JSON.stringify({ key, ...rec })); return true; } catch (e) { return false; } },
    async autosaveClear(key) { try { const r = JSON.parse(localStorage.getItem(AUTO) || 'null'); if (r && r.key === key) localStorage.removeItem(AUTO); } catch (e) {} return true; },
    async autosaveRead(key) { try { const r = JSON.parse(localStorage.getItem(AUTO) || 'null'); return r && r.key === key ? r : null; } catch (e) { return null; } },
    async autosaveList(mine) { try { const r = JSON.parse(localStorage.getItem(AUTO) || 'null'); return r && r.key !== mine ? [{ key: r.key, name: r.name, path: null, time: r.time }] : []; } catch (e) { return []; } },
    openExternal(url) { window.open(url, '_blank'); },
    // biblioteka bloków w przeglądarce: pliki w pamięci przeglądarki zamiast folderu (do testów)
    async libInfo() { const L = lib(); return { dir: L ? L.dir : null, ok: !!L }; },
    async libChoose() { const L = lib() || { dir: 'web', files: {} }; libPut(L); return { dir: L.dir, ok: true }; },
    async libList() { const L = lib(); return L ? Object.entries(L.files).map(([rel, f]) => ({ rel, name: rel.split('/').pop().replace(/\.dxf$/i, ''), cat: rel.includes('/') ? rel.split('/')[0] : '', mtime: f.mtime })) : null; },
    async libEmpty() { const L = lib(); return !!L && !Object.keys(L.files).length; },
    async libRead(rel) { const f = lib()?.files[rel]; if (!f) throw new Error('?'); return f.text; },
    async libWrite(rel, text, overwrite) { const L = lib(); if (!L) throw new Error('?'); if (L.files[rel] && !overwrite) return { exists: true }; L.files[rel] = { text, mtime: Date.now() }; if (!libPut(L)) throw new Error('FULL'); return { ok: true }; },
    async libShow() {},
    setDirty() {}, closeNow() {}, newWindow() { window.open(location.pathname, '_blank'); }, setTheme() {},
    onSaveThenClose() {}, onFullscreen() {}, onUpdate() {},
    async updateGet() { return { state: 'idle' }; }, async updateCheck() { return { state: 'idle' }; }, async updateInstall() { return false; }
  };
})();
