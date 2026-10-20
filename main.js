// 鹦鹉桌宠 — Electron 主进程
// 窗口本身就是"鸟"：透明、无边框、置顶；渲染进程算物理，主进程负责挪窗口、菜单、读素材。
const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { SPECIES, FAMILIES, MODES, ACTIONS, SIZES, familyOf, actionAllowed } = require('./src/catalog');
const { createImporter } = require('./src/importer');
const { createDesk } = require('./src/desk');

const BASE_W = 240;
const BASE_H = 260;
const IS_MAC = process.platform === 'darwin';
// 设置、模型、Python 环境统一放在 …/parrot-pet（开发和安装版一致）
app.setPath('userData', path.join(app.getPath('appData'), 'parrot-pet'));
// 打包后程序目录只读：素材放用户目录；小工具（Swift 编译的二进制、Python 脚本）在 asar 外面
const REAL_DIR = app.isPackaged ? path.join(app.getPath('userData'), 'real') : path.join(__dirname, 'assets', 'real');
const TOOLS_ROOT = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked') : __dirname;
const IMG_EXT = /\.(png|webp|gif)$/i;

// 叫声用 WebAudio 合成，不等用户手势就要能出声
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win;
let tray;
let importer;
let desk;
let settingsPath;
let settings = { species: 'roseicollis', mode: 'cartoon', size: 'medium', muted: false };

function loadSettings() {
  settingsPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    Object.assign(settings, JSON.parse(fs.readFileSync(settingsPath, 'utf8')));
  } catch (_) { /* 第一次运行没有设置文件 */ }
  if (!SPECIES[settings.species]) settings.species = 'roseicollis';
}

function saveSettings() {
  try { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2)); } catch (_) {}
}

function sizeScale() {
  return (SIZES.find(s => s.id === settings.size) || SIZES[1]).scale;
}

function createWindow() {
  const scale = sizeScale();
  const { workArea } = screen.getPrimaryDisplay();
  const w = Math.round(BASE_W * scale);
  const h = Math.round(BASE_H * scale);
  win = new BrowserWindow({
    width: w,
    height: h,
    x: Math.round(workArea.x + workArea.width * 0.7),
    y: workArea.y + workArea.height - h,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    // 允许窗口伸到菜单栏上方/屏幕外（倒挂、啃顶部图标时需要），否则系统会把窗口硬按回来，看起来像瞬移
    enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 默认鼠标穿透透明区域，渲染进程在鼠标落到鸟身上时再关掉穿透
  win.setIgnoreMouseEvents(true, { forward: true });
  // 页面按 240x260 设计，用缩放适配"大小"设置
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(scale));
  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  // PET_DEBUG=1 npm start：渲染进程日志打到终端，并每 3 秒把窗口画面存到 /tmp/parrot_pet_*.png
  if (process.env.PET_DEBUG) {
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      console.log(`[renderer:${level}] ${message} (${path.basename(source)}:${line})`);
    });
    // PET_DEBUG_ACTION=gnaw：启动 4 秒后自动做这个动作
    if (process.env.PET_DEBUG_ACTION) setTimeout(() => send('action', process.env.PET_DEBUG_ACTION), 4000);
    let n = 0;
    setInterval(async () => {
      if (desk) desk.debugCapture('/tmp/parrot_pet_overlay.png');
      const img = await win.webContents.capturePage();
      fs.writeFileSync(`/tmp/parrot_pet_${n++ % 4}.png`, img.toPNG());
      console.log('[debug] pos', win.getPosition().join(','));
    }, 3000);
  }
}

function send(cmd, arg) {
  if (win && !win.isDestroyed()) win.webContents.send('menu-cmd', cmd, arg);
}

function setSetting(key, value) {
  settings[key] = value;
  saveSettings();
  if (key === 'size') {
    const scale = sizeScale();
    const [x, y] = win.getPosition();
    const w = Math.round(BASE_W * scale);
    const h = Math.round(BASE_H * scale);
    // 保持脚底位置不变
    const [, oldH] = win.getSize();
    win.setBounds({ x: toInt(x), y: toInt(y + oldH - h), width: w, height: h });
    win.webContents.setZoomFactor(scale);
  }
  send('settings', settings);
  rebuildTray();
}

function buildMenuTemplate() {
  return [
    {
      label: '鸟种',
      submenu: Object.entries(FAMILIES).map(([fam, f]) => ({
        label: f.name + (familyOf(settings.species) === fam ? ' ✓' : ''),
        submenu: Object.entries(SPECIES).filter(([, sp]) => sp.shape === fam).map(([id, sp]) => ({
          label: sp.name,
          type: 'radio',
          checked: settings.species === id,
          click: () => setSetting('species', id),
        })),
      })),
    },
    {
      label: '形象',
      submenu: MODES.map(m => ({
        label: m.name,
        type: 'radio',
        checked: settings.mode === m.id,
        click: () => setSetting('mode', m.id),
      })),
    },
    {
      label: '做个动作',
      submenu: ACTIONS.filter(a => a.menu && actionAllowed(a.id, familyOf(settings.species))).map(a => ({
        label: a.name,
        click: () => send('action', a.id),
      })),
    },
    {
      label: '大小',
      submenu: SIZES.map(s => ({
        label: s.name,
        type: 'radio',
        checked: settings.size === s.id,
        click: () => setSetting('size', s.id),
      })),
    },
    { label: '静音', type: 'checkbox', checked: settings.muted, click: (item) => setSetting('muted', item.checked) },
    { type: 'separator' },
    { label: '叫它回来', click: () => send('come-back') },
    ...(desk && desk.hasMarks() ? [{ label: '打扫咬痕和纸屑', click: () => desk.onPet('clean') }] : []),
    {
      label: '真实素材',
      submenu: [
        { label: '打开素材文件夹（把视频、照片丢进来）', click: () => { fs.mkdirSync(REAL_DIR, { recursive: true }); require('electron').shell.openPath(REAL_DIR); } },
        !IS_MAC
          ? { label: '自动抠图目前只支持 Mac（可以手动放抠好的 PNG）', enabled: false }
          : importer && !importer.ready()
            ? { label: '下载自动抠图工具（约 60MB）', click: () => importer.setup() }
            : { label: '重新处理全部素材', click: () => importer && importer.reprocessAll() },
      ],
    },
    { type: 'separator' },
    { label: '再见啦（退出）', click: () => app.quit() },
  ];
}

function rebuildTray() {
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate()));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', IS_MAC ? 'trayTemplate.png' : 'tray.png'));
  if (IS_MAC) icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('鹦鹉桌宠');
  rebuildTray();
}

// 读一个素材目录（里面直接是 PNG 帧）
function readClip(dir) {
  const frames = fs.readdirSync(dir).filter(f => IMG_EXT.test(f)).sort();
  if (!frames.length) return null;
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); } catch (_) {}
  return {
    frames: frames.map(f => 'file://' + path.join(dir, f)),
    fps: meta.fps || 12,
    facing: meta.facing || 'right',
  };
}

// 扫描 assets/real/<species>/<action>/ ，返回 { action: [clip, ...] }。
// 帧可以直接放在动作目录里（一段），也可以每段一个子目录（自动导入就是这样存的）。
function listRealAssets(species) {
  const dir = path.join(REAL_DIR, species);
  const result = {};
  if (!fs.existsSync(dir)) return result;
  for (const action of fs.readdirSync(dir)) {
    const actionDir = path.join(dir, action);
    if (action.startsWith('.') || !fs.statSync(actionDir).isDirectory()) continue;
    const clips = [];
    const direct = readClip(actionDir);
    if (direct) clips.push(direct);
    for (const sub of fs.readdirSync(actionDir)) {
      const subDir = path.join(actionDir, sub);
      if (sub.startsWith('.') || !fs.statSync(subDir).isDirectory()) continue;
      const c = readClip(subDir);
      if (c) clips.push(c);
    }
    if (clips.length) result[action] = clips;
  }
  return result;
}

// 窗口坐标必须是 32 位整数：-0（比如 Math.round(-0.3)）和越界的数都会让 Electron 直接报错
const toInt = (v) => (Number.isFinite(v) ? Math.max(-1e6, Math.min(1e6, Math.round(v))) || 0 : null);

ipcMain.on('move', (_e, x, y) => {
  const ix = toInt(x);
  const iy = toInt(y);
  if (ix === null || iy === null) return;
  if (win && !win.isDestroyed()) win.setPosition(ix, iy);
});

ipcMain.on('set-ignore-mouse', (_e, ignore) => {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.handle('get-env', () => {
  const [x, y] = win.getPosition();
  const [w, h] = win.getSize();
  const display = screen.getDisplayNearestPoint({ x: x + w / 2, y: y + h / 2 });
  return { x, y, w, h, workArea: display.workArea, cursor: screen.getCursorScreenPoint() };
});

ipcMain.handle('get-settings', () => settings);
// 自定义声音：素材文件夹 sounds/<名字>.mp3 等，存在就返回 file:// 地址
ipcMain.handle('custom-sound', (_e, name) => {
  for (const ext of ['mp3', 'm4a', 'wav', 'ogg', 'aac']) {
    const f = path.join(REAL_DIR, 'sounds', `${name}.${ext}`);
    if (fs.existsSync(f)) return 'file://' + f;
  }
  return null;
});
ipcMain.handle('gnaw-target', (_e, near) => desk.pickTarget(near));
ipcMain.on('desk', (_e, cmd, arg) => { desk.onPet(cmd, arg); rebuildTray(); });
ipcMain.handle('list-real-assets', (_e, species) => listRealAssets(species));

ipcMain.on('context-menu', () => {
  Menu.buildFromTemplate(buildMenuTemplate()).popup({ window: win });
});

app.whenReady().then(() => {
  loadSettings();
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  createWindow();
  desk = createDesk({ root: TOOLS_ROOT, getPetWindow: () => win });
  importer = createImporter({
    root: TOOLS_ROOT,
    realDir: REAL_DIR,
    getSpecies: () => settings.species,
    speciesIds: Object.keys(SPECIES),
    notify: (cmd, arg) => { send(cmd, arg); if (cmd === 'setup-done') rebuildTray(); },
  });
  if (IS_MAC) win.webContents.once('did-finish-load', () => importer.start());
  createTray();
  // 换显示器、改分辨率时让鸟重新找地面
  screen.on('display-metrics-changed', () => send('come-back'));
  screen.on('display-removed', () => send('come-back'));
});

app.on('window-all-closed', () => app.quit());
