// Ikona programu z jednego SVG 160 × 160 (build/icon.svg) — według wytycznych ikon rodziny:
//   build/icon-win.png — Windows: 1024 px, tło na całe płótno, bez marginesu (electron-builder robi z niego .ico),
//   build/icon.png     — Mac: ikona 824 px wklejona na przezroczyste 1024 px z przesunięciem 100 px (siatka Apple).
// Uruchom Electronem:  <Electron> scripts/ikona.js
// (qlmanage nie nadaje się do tego — wypełnia przezroczyste marginesy na biało.)
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'build');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 200, height: 200, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const svg = fs.readFileSync(path.join(dir, 'icon.svg'));
  const draw = (off, size) => win.webContents.executeJavaScript(`new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 1024; c.getContext('2d').drawImage(img, ${off}, ${off}, ${size}, ${size}); res(c.toDataURL('image/png').split(',')[1]); };
    img.onerror = () => rej(new Error('nie wczytano SVG'));
    img.src = 'data:image/svg+xml;base64,${svg.toString('base64')}';
  })`);
  for (const [name, off, size] of [['icon-win.png', 0, 1024], ['icon.png', 100, 824]]) {
    fs.writeFileSync(path.join(dir, name), Buffer.from(await draw(off, size), 'base64'));
    console.log('zapisano', path.join('build', name));
  }
  app.quit();
}).catch(e => { console.error(e); app.exit(1); });
