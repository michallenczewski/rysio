// Ikona programu: SVG → PNG 1024 px z przezroczystym tłem wokół kwadratu (bez tego macOS pokazuje białą ramkę).
// Uruchom Electronem:  <Electron> scripts/ikona.js build/icon.svg build/icon.png
// (qlmanage nie nadaje się do tego — wypełnia przezroczyste marginesy na biało.)
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const [src, out] = process.argv.slice(-2).map(p => path.resolve(p));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 200, height: 200, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const svg = fs.readFileSync(src, 'utf8');
  const b64 = await win.webContents.executeJavaScript(`new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 1024; c.getContext('2d').drawImage(img, 0, 0, 1024, 1024); res(c.toDataURL('image/png').split(',')[1]); };
    img.onerror = () => rej(new Error('nie wczytano SVG'));
    img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
  })`);
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log('zapisano', out);
  app.quit();
}).catch(e => { console.error(e); app.exit(1); });
