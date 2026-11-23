// Na Macu podpisujemy program podpisem „ad-hoc”. Bez tego macOS na procesorach Apple
// uznaje niepodpisaną aplikację za uszkodzoną. To nie jest podpis Apple Developer —
// przy pierwszym uruchomieniu trzeba i tak raz zezwolić na otwarcie (patrz README).
const { execSync } = require('child_process');
exports.default = async ctx => {
  if (ctx.electronPlatformName !== 'darwin') return;
  const app = `${ctx.appOutDir}/${ctx.packager.appInfo.productFilename}.app`;
  execSync(`codesign --force --deep --sign - "${app}"`, { stdio: 'inherit' });
};
