// Wersja w przeglądarce (do testów): zastępuje most do procesu głównego Electrona.
// W programie window.api ustawia preload.js, więc ten plik nic nie robi. Na wzór Modo 0.4.2.
(function () {
  if (window.api) return;
  const pick = accept => new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = () => res(i.files[0] || null); i.click();
  });
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  const AUTO = 'rysio.autozapis';
  window.api = {
    web: true,
    platform: /Mac/.test(navigator.platform) ? 'darwin' : /Win/.test(navigator.platform) ? 'win32' : 'linux',
    async setLang() { return true; },
    async openFile() { const f = await pick('.rysio'); return f ? { path: null, name: f.name.replace(/\.rysio$/i, ''), text: await f.text() } : null; },
    async saveFile(p, text, suggested) { download(new Blob([text], { type: 'application/json' }), (suggested || 'Rysunek') + '.rysio'); return { path: null, name: suggested || 'Rysunek' }; },
    async recentList() { return []; },
    // autozapis w przeglądarce: jedna kopia w pamięci przeglądarki
    async autosave(key, rec) { try { localStorage.setItem(AUTO, JSON.stringify({ key, ...rec })); return true; } catch (e) { return false; } },
    async autosaveClear(key) { try { const r = JSON.parse(localStorage.getItem(AUTO) || 'null'); if (r && r.key === key) localStorage.removeItem(AUTO); } catch (e) {} return true; },
    async autosaveRead(key) { try { const r = JSON.parse(localStorage.getItem(AUTO) || 'null'); return r && r.key === key ? r : null; } catch (e) { return null; } },
    async autosaveList(mine) { try { const r = JSON.parse(localStorage.getItem(AUTO) || 'null'); return r && r.key !== mine ? [{ key: r.key, name: r.name, path: null, time: r.time }] : []; } catch (e) { return []; } },
    openExternal(url) { window.open(url, '_blank'); },
    setDirty() {}, closeNow() {}, newWindow() { window.open(location.pathname, '_blank'); }, setTheme() {},
    onSaveThenClose() {}, onFullscreen() {}, onUpdate() {},
    async updateGet() { return { state: 'idle' }; }, async updateCheck() { return { state: 'idle' }; }, async updateInstall() { return false; }
  };
})();
