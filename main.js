// Rysio — proces główny: okno, pliki .rysio, autozapis, aktualizacje. Na wzór Modo 0.4.2 (main.js).
const { app, BrowserWindow, ipcMain, dialog, shell, net, protocol, Menu } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { spawn } = require('child_process');

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

// Okno ładujemy z rysio://app/ zamiast file:// — moduły JavaScript (import) z file:// Chromium blokuje.
protocol.registerSchemesAsPrivileged([{ scheme: 'rysio', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const RENDERER = path.join(__dirname, 'renderer');
function serveRenderer() {
  protocol.handle('rysio', req => {
    const u = new URL(req.url);
    const file = path.normalize(path.join(RENDERER, decodeURIComponent(u.pathname)));
    if (!file.startsWith(RENDERER)) return new Response('', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

/* ---------- ustawienia ---------- */
const settingsFile = () => path.join(app.getPath('userData'), 'ustawienia.json');
let settings = { bounds: null, maximized: false, recent: [], lang: 'pl' };
// napisy okienek systemowych po angielsku (język wybiera okno programu, zob. renderer/i18n.js)
const EN = {
  'Zapisz': 'Save', 'Nie zapisuj': "Don't Save", 'Anuluj': 'Cancel',
  'Zapisać zmiany w rysunku?': 'Save changes to the drawing?', 'Jeśli nie zapiszesz, zmiany przepadną.': "If you don't save, your changes will be lost.",
  'Rysunek Rysia': 'Rysio drawing', 'Rysunek': 'Drawing', 'Bez nazwy': 'Untitled',
  'GitHub odpowiedział ': 'GitHub responded ', 'pobieranie nie powiodło się (': 'download failed ('
};
const _t = s => (settings.lang === 'en' && EN[s]) || s;
function loadSettings() { try { Object.assign(settings, JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))); } catch (e) {} }
function saveSettings() { try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (e) {} }

/* ---------- okno ---------- */
const wins = new Set();
const dirty = new WeakMap();    // okno → czy są niezapisane zmiany
const autoKeys = new WeakMap(); // okno → klucz jego autozapisu
const liveKeys = new Set();     // klucze autozapisu okien, które teraz działają
const crashed = new WeakSet();  // okna, w których padł proces rysujący (ich autozapis zostaje)
function createWindow(openPath) {
  const b = settings.bounds || { width: 1440, height: 900 };
  const win = new BrowserWindow({
    ...b, minWidth: 900, minHeight: 560, show: false,
    title: 'Rysio', backgroundColor: '#f7f7f5', autoHideMenuBar: true,
    // pasek tytułu schowany — przyciski okna rysuje system w górnym pasku programu (jak w Modo i Gapie)
    ...(isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 19 } }
      : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#f7f7f5', symbolColor: '#4a4945', height: 52 } }),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  wins.add(win);
  if (settings.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadURL('rysio://app/index.html' + (openPath ? '?p=' + encodeURIComponent(openPath) : ''));
  const remember = () => { if (!win.isMaximized() && !win.isMinimized() && !win.isFullScreen()) settings.bounds = win.getBounds(); settings.maximized = win.isMaximized(); };
  win.on('resize', remember); win.on('move', remember);
  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false));
  // niezapisane zmiany: pytamy przed zamknięciem
  win.on('close', e => {
    remember(); saveSettings();
    if (!dirty.get(win)) return;
    const r = dialog.showMessageBoxSync(win, {
      type: process.platform === 'win32' ? 'none' : 'question', buttons: [_t('Zapisz'), _t('Nie zapisuj'), _t('Anuluj')], defaultId: 0, cancelId: 2, noLink: true,   // noLink — w Windows zwykłe przyciski zamiast „linków poleceń” ze strzałkami
      message: _t('Zapisać zmiany w rysunku?'), detail: _t('Jeśli nie zapiszesz, zmiany przepadną.')
    });
    if (r === 2) { e.preventDefault(); return; }
    if (r === 0) { e.preventDefault(); win.webContents.send('save-then-close'); }
  });
  win.webContents.on('render-process-gone', () => crashed.add(win));
  // zwykłe zamknięcie okna kasuje jego autozapis; po awarii plik zostaje i program zaproponuje przywrócenie
  win.on('closed', () => {
    wins.delete(win);
    const k = autoKeys.get(win);
    if (k) { liveKeys.delete(k); if (!crashed.has(win)) try { fs.unlinkSync(autoFile(k)); } catch (e) {} }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  return win;
}
ipcMain.on('dirty', (e, v) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) { dirty.set(w, !!v); if (isMac) w.setDocumentEdited(!!v); } });
ipcMain.on('close-now', e => { const w = BrowserWindow.fromWebContents(e.sender); if (w) { dirty.set(w, false); w.close(); } });
ipcMain.on('new-window', () => createWindow(null));
// tryb ciemny: kolor tła okna i przycisków okna na Windows
ipcMain.on('theme', (e, dark) => {
  const w = BrowserWindow.fromWebContents(e.sender); if (!w) return;
  w.setBackgroundColor(dark ? '#161616' : '#f7f7f5');
  if (isWin) try { w.setTitleBarOverlay({ color: dark ? '#161616' : '#f7f7f5', symbolColor: dark ? '#c4c4c1' : '#4a4945' }); } catch (err) {}
});
ipcMain.handle('set-lang', (e, l) => { if (l === 'en' || l === 'pl') { settings.lang = l; saveSettings(); } return true; });

/* ---------- pliki .rysio ---------- */
const FILTER = () => [{ name: _t('Rysunek Rysia'), extensions: ['rysio'] }];
function addRecent(p) { settings.recent = [p, ...(settings.recent || []).filter(x => x !== p)].slice(0, 12); saveSettings(); if (isMac || isWin) app.addRecentDocument(p); }
ipcMain.handle('file-open', async (e, p) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!p) {
    const r = await dialog.showOpenDialog(win, { filters: [{ name: _t('Rysunek Rysia, DXF, DWG'), extensions: ['rysio', 'dxf', 'dwg'] }, ...FILTER(), { name: 'DXF / DWG', extensions: ['dxf', 'dwg'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    p = r.filePaths[0];
  }
  // DXF i DWG czyta okno programu (dxf.js, dwg.js) — tu tylko bajty pliku
  const cad = (/\.(dxf|dwg)$/i.exec(p) || [])[1];
  if (cad) { addRecent(p); return { path: p, name: path.basename(p).replace(/\.(dxf|dwg)$/i, ''), cad: cad.toLowerCase(), data: new Uint8Array(await fsp.readFile(p)) }; }
  const text = await fsp.readFile(p, 'utf8');
  addRecent(p);
  return { path: p, name: path.basename(p, '.rysio'), text };
});
ipcMain.handle('file-save', async (e, p, text, suggested) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!p) {
    const r = await dialog.showSaveDialog(win, { filters: FILTER(), defaultPath: (suggested || _t('Rysunek')) + '.rysio' });
    if (r.canceled || !r.filePath) return null;
    p = r.filePath;
  }
  // zapis przez plik tymczasowy: przerwany zapis nie niszczy poprzedniej wersji
  const tmp = p + '.zapis';
  await fsp.writeFile(tmp, text, 'utf8');
  await fsp.rename(tmp, p);
  addRecent(p);
  return { path: p, name: path.basename(p, '.rysio') };
});
// ostatnio otwierane i zapisywane pliki, które nadal istnieją
ipcMain.handle('recent-list', () => (settings.recent || []).filter(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } })
  .map(p => ({ path: p, name: path.basename(p, '.rysio'), dir: path.basename(path.dirname(p)) })));

// PDF i PNG z arkuszy
ipcMain.handle('binary-save', async (e, data, suggested, ext) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const filters = { pdf: [{ name: 'PDF', extensions: ['pdf'] }], png: [{ name: 'PNG', extensions: ['png'] }], dxf: [{ name: 'DXF', extensions: ['dxf'] }] }[ext] || [];
  const r = await dialog.showSaveDialog(win, { filters, defaultPath: path.join(app.getPath('documents'), (suggested || _t('Rysunek')).replace(/[\\/:*?"<>|]/g, '-') + '.' + ext) });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, Buffer.from(data));
  return r.filePath;
});

/* ---------- autozapis ---------- */
// Każde okno zapisuje niezapisany rysunek do własnego pliku w folderze ustawień. Plik znika przy zapisie
// i przy zwykłym zamknięciu okna, więc to, co tu zostaje po starcie programu, pochodzi z awarii.
const autoDir = () => path.join(app.getPath('userData'), 'autozapis');
const autoFile = k => path.join(autoDir(), String(k).replace(/[^a-z0-9]/gi, '') + '.json');
ipcMain.handle('autosave', async (e, key, rec) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) autoKeys.set(w, key);
  liveKeys.add(key);
  await fsp.mkdir(autoDir(), { recursive: true });
  const f = autoFile(key);
  await fsp.writeFile(f + '.zapis', JSON.stringify(rec), 'utf8');
  await fsp.rename(f + '.zapis', f);
  return true;
});
ipcMain.handle('autosave-clear', async (e, key) => { try { await fsp.unlink(autoFile(key)); } catch (err) {} return true; });
ipcMain.handle('autosave-read', async (e, key) => { try { return JSON.parse(await fsp.readFile(autoFile(key), 'utf8')); } catch (err) { return null; } });
ipcMain.handle('autosave-list', async () => {
  const out = [];
  let names = []; try { names = await fsp.readdir(autoDir()); } catch (err) { return out; }
  for (const n of names) {
    if (!/\.json$/.test(n)) continue;
    const key = n.slice(0, -5), f = path.join(autoDir(), n);
    if (liveKeys.has(key)) continue;
    try {
      const st = await fsp.stat(f);
      // kopie starsze niż dwa tygodnie nie są już nikomu potrzebne
      if (Date.now() - st.mtimeMs > 14 * 24 * 3600 * 1000) { await fsp.unlink(f); continue; }
      const rec = JSON.parse(await fsp.readFile(f, 'utf8'));
      out.push({ key, name: rec.name || _t('Bez nazwy'), path: rec.path || null, time: rec.time || st.mtimeMs });
    } catch (err) {}
  }
  return out.sort((a, b) => b.time - a.time);
});
ipcMain.handle('open-external', (e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });

/* ---------- biblioteka bloków ---------- */
// Zwykły folder wskazany przez użytkownika: pliki DXF (jeden plik = jeden blok), podfoldery = kategorie.
// Ścieżki od okna są względne i nie mogą wyjść poza folder biblioteki.
const libDir = () => settings.libDir || null;
const inLib = rel => {
  const d = libDir(); if (!d || typeof rel !== 'string') return null;
  const root = path.resolve(d), f = path.resolve(root, rel), pre = root.endsWith(path.sep) ? root : root + path.sep;   // dysk Z:\ albo / kończy się już separatorem
  return f.startsWith(pre) && f.length > pre.length && /\.dxf$/i.test(f) ? f : null;
};
const libExists = async () => { try { return (await fsp.stat(libDir())).isDirectory(); } catch (e) { return false; } };
ipcMain.handle('lib-info', async () => ({ dir: libDir(), ok: !!libDir() && await libExists() }));
ipcMain.handle('lib-choose', async e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: libDir() || app.getPath('documents') });
  if (r.canceled || !r.filePaths[0]) return null;
  settings.libDir = r.filePaths[0]; saveSettings();
  return { dir: settings.libDir, ok: true };
});
// pliki DXF w folderze i w podfolderach (kategoria = pierwszy podfolder), bez ukrytych
ipcMain.handle('lib-list', async () => {
  const root = libDir(), out = [];
  if (!root || !await libExists()) return null;
  const walk = async (dir, rel, depth) => {
    let items = []; try { items = await fsp.readdir(dir, { withFileTypes: true }); } catch (err) { return; }
    for (const it of items) {
      if (it.name.startsWith('.') || out.length >= 2000) continue;
      const r = rel ? rel + '/' + it.name : it.name, f = path.join(dir, it.name);
      if (it.isDirectory() && depth < 3) await walk(f, r, depth + 1);
      else if (it.isFile() && /\.dxf$/i.test(it.name)) {
        try { const st = await fsp.stat(f); out.push({ rel: r, name: it.name.replace(/\.dxf$/i, ''), cat: rel ? rel.split('/')[0] : '', mtime: st.mtimeMs }); } catch (err) {}
      }
    }
  };
  await walk(root, '', 0);
  return out;
});
// czy folder jest zupełnie pusty (bez plików i podfolderów, nie licząc ukrytych) — tylko do takiego wgrywamy bloki na start
ipcMain.handle('lib-empty', async () => { try { return (await fsp.readdir(libDir())).filter(n => !n.startsWith('.')).length === 0; } catch (err) { return false; } });
ipcMain.handle('lib-read', async (e, rel) => { const f = inLib(rel); if (!f) throw new Error('?'); return new Uint8Array(await fsp.readFile(f)); });
// zapis pliku bloku; gdy plik już jest, a overwrite nie jest ustawione — { exists: true } bez zapisu
ipcMain.handle('lib-write', async (e, rel, text, overwrite) => {
  const f = inLib(rel); if (!f) throw new Error('?');
  if (!overwrite) { try { await fsp.stat(f); return { exists: true }; } catch (err) {} }
  await fsp.mkdir(path.dirname(f), { recursive: true });
  await fsp.writeFile(f + '.zapis', text, 'utf8');
  await fsp.rename(f + '.zapis', f);
  return { ok: true };
});
ipcMain.handle('lib-show', async () => { if (libDir()) await shell.openPath(libDir()); });

/* ---------- aktualizacje z wydań na GitHubie (jak w Modo i Gapie) ---------- */
const REPO = 'michallenczewski/rysio';
let upd = { state: 'idle', version: null, url: null, name: null, size: 0, got: 0, error: '' };
const verNum = v => String(v || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
const newer = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
function updTell() { const s = { ...upd, current: app.getVersion() }; for (const w of wins) w.webContents.send('update-status', s); }
async function updCheck() {
  if (upd.state === 'downloading') return upd;
  try {
    const r = await net.fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { 'User-Agent': 'Rysio', Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(_t('GitHub odpowiedział ') + r.status);
    const j = await r.json(), v = String(j.tag_name || '').replace(/^v/, '');
    const want = isWin ? /-win-x64\.exe$/ : isMac ? new RegExp('-mac-' + process.arch + '\\.dmg$') : null;
    const a = want && (j.assets || []).find(x => want.test(x.name));
    if (a && newer(v, app.getVersion())) Object.assign(upd, { state: 'available', version: v, url: a.browser_download_url, name: a.name, size: a.size, error: '' });
    else Object.assign(upd, { state: 'none', version: v, error: '' });
  } catch (err) { upd.state = 'error'; upd.error = err.message; }
  updTell(); return { ...upd, current: app.getVersion() };
}
async function updInstall() {
  if (upd.state !== 'available' || !upd.url) return false;
  const file = path.join(isMac ? app.getPath('downloads') : app.getPath('temp'), upd.name);
  upd.state = 'downloading'; upd.got = 0; updTell();
  try {
    const r = await net.fetch(upd.url, { headers: { 'User-Agent': 'Rysio' } });
    if (!r.ok || !r.body) throw new Error(_t('pobieranie nie powiodło się (') + r.status + ')');
    const out = fs.createWriteStream(file + '.part'); let last = 0;
    for await (const chunk of r.body) { out.write(chunk); upd.got += chunk.length; if (Date.now() - last > 400) { last = Date.now(); updTell(); } }
    await new Promise((res, rej) => out.end(err => (err ? rej(err) : res())));
    await fsp.rename(file + '.part', file);
  } catch (err) { upd.state = 'available'; upd.error = err.message; updTell(); return false; }
  upd.state = 'ready'; updTell();
  if (isWin) { spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref(); setTimeout(() => app.quit(), 400); }
  else if (isMac) shell.openPath(file);
  return true;
}
ipcMain.handle('update-get', () => ({ ...upd, current: app.getVersion() }));
ipcMain.handle('update-check', () => updCheck());
ipcMain.handle('update-install', () => updInstall());

/* ---------- start ---------- */
// plik .rysio podany przy uruchomieniu (Windows: argument, Mac: zdarzenie open-file)
let pendingOpen = process.argv.slice(1).find(a => /\.rysio$/i.test(a)) || null;
app.on('open-file', (e, p) => { e.preventDefault(); if (app.isReady()) createWindow(p); else pendingOpen = p; });
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (e, argv) => { const p = argv.find(a => /\.rysio$/i.test(a)); createWindow(p || null); });
// Własne menu bez „Przeładuj” (⌘R / Ctrl+R): przeładowanie okna gubiłoby niezapisany rysunek.
// Na Macu zostaje menu programu i edycja tekstu (kopiuj / wklej w polach); w Windows menu nie ma wcale.
function setMenu() {
  if (!isMac) return Menu.setApplicationMenu(null);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edycja', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }] },
    { role: 'windowMenu' }
  ]));
}
app.whenReady().then(() => {
  loadSettings();
  setMenu();
  serveRenderer();
  createWindow(pendingOpen);
  // sprawdzanie przy starcie (z opóźnieniem, żeby nie spowalniać otwierania) i potem co sześć godzin
  setTimeout(updCheck, 8000); setInterval(updCheck, 6 * 3600 * 1000);
});
app.on('activate', () => { if (!wins.size) createWindow(null); });
app.on('window-all-closed', () => { if (!isMac) app.quit(); });
