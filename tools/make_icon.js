// 生成应用图标 build/icon.png（1024x1024）：用 Electron 把卡通鹦鹉画在圆角方块上再截图。
// 用法：npx electron tools/make_icon.js [鸟种=roseicollis]
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const species = process.argv.find(a => !a.startsWith('-') && !a.endsWith('.js') && !a.includes('/')) || 'roseicollis';
const SRC = path.join(__dirname, '..', 'src');
const OUT = path.join(__dirname, '..', 'build', 'icon.png');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1024px;height:1024px;background:transparent;overflow:hidden}
  .tile{position:absolute;left:100px;top:100px;width:824px;height:824px;border-radius:185px;
    background:radial-gradient(circle at 35% 25%, #fffaf0 0%, #f6efe1 55%, #eadfca 100%);
    box-shadow:0 18px 40px rgba(60,40,20,.28), inset 0 0 0 2px rgba(255,255,255,.6)}
  svg{position:absolute;left:112px;top:150px;width:800px;height:800px;overflow:visible}
</style></head><body><div class="tile"></div><svg id="bird" viewBox="0 0 200 200"></svg>
<script src="${'file://' + path.join(SRC, 'catalog.js')}"></script>
<script src="${'file://' + path.join(SRC, 'parrot.js')}"></script>
<script>
  const sp = SPECIES['${species}'];
  const svg = document.getElementById('bird');
  svg.innerHTML = parrotSVG(sp.shape, sp.palette);
  const p = basePose();
  p.front = true; p.headX = -12; p.headRot = -8; p.shadow = 0.6; p.crest = 0.8;
  makeCartoon(svg, sp.shape)(p);
</script></body></html>`;

app.whenReady().then(async () => {
  const tmp = path.join(app.getPath('temp'), 'parrot_icon.html');
  fs.writeFileSync(tmp, html);
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false,
    webPreferences: { offscreen: true } });
  await win.loadFile(tmp);
  await new Promise(r => setTimeout(r, 600));
  const img = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, img.resize({ width: 1024, height: 1024 }).toPNG());
  console.log('写好了', OUT);
  app.quit();
});
