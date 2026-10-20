// 鹦鹉桌宠 — Electron 主进程
// 窗口本身就是"鸟"：透明、无边框、置顶；渲染进程算物理，主进程负责挪窗口、菜单、读素材。
const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { SPECIES, FAMILIES, MODES, ACTIONS, SIZES, familyOf, actionAllowed } = require('./src/catalog');
const { createImporter } = require('./src/importer');
const { createDesk } = require('./src/desk');
const { createVideoGen } = require('./src/videogen');
const { aiActionList, AI_CORE } = require('./src/aiprompts');

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
let videogen;
let aiSettingsWin;
let namesWin;
let settingsPath;
// userName：主人叫什么；petNames：每只鸟（按鸟种）各自的名字
let settings = { species: 'roseicollis', mode: 'cartoon', size: 'medium', muted: false, userName: '', petNames: {} };

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
  return (SIZES.find(s => s.id === settings.size) || SIZES.find(s => s.id === 'medium')).scale;
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
    { label: '名字（你叫什么、它叫什么）…', click: () => openNames() },
    ...(['budgie', 'monk', 'cockatoo', 'grey', 'cockatiel'].includes(familyOf(settings.species))
      ? [{ label: '教它说一句话…', click: () => openTeach() }] : []),
    { label: '豆豆眼', type: 'checkbox', checked: !!settings.beanEyes, click: (item) => setSetting('beanEyes', item.checked) },
    { label: '静音', type: 'checkbox', checked: settings.muted, click: (item) => setSetting('muted', item.checked) },
    { type: 'separator' },
    {
      label: 'AI 生成动作',
      submenu: [
        { label: '用一张照片生成动作…', enabled: !!videogen && !videogen.busy(), click: () => startAiGenerate() },
        ...(videogen && videogen.busy()
          ? [{ label: `生成中 ${videogen.counts().done + videogen.counts().failed}/${videogen.counts().total}（取消还没开始的）`, click: () => { videogen.cancelQueued(); rebuildTray(); } }]
          : []),
        { label: '设置（服务、密钥）…', click: () => openAiSettings() },
      ],
    },
    { label: '叫它回来', click: () => send('come-back') },
    ...(desk && desk.hasMarks() ? [{ label: '打扫咬痕和纸屑', click: () => desk.onPet('clean') }] : []),
    {
      label: '真实素材',
      submenu: [
        { label: '打开素材文件夹（把视频、照片丢进来）', click: () => { fs.mkdirSync(REAL_DIR, { recursive: true }); require('electron').shell.openPath(REAL_DIR); } },
        importer && !importer.ready()
          ? { label: `下载自动抠图工具（${importer.setupSize}）`, click: () => importer.setup() }
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
  tray.setToolTip('鹦鹉桌宠（点一下叫它回来）');
  // Windows 上左键点托盘图标就叫回来，右键才是菜单（Mac 点一下照常弹菜单）
  if (!IS_MAC) tray.on('click', () => send('come-back'));
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

// ---------- AI 生成动作 ----------
// 电脑在放歌/放视频吗（Mac）：播放声音的程序会挂一个"Playing audio"之类的电源断言，pmset 能看到是谁挂的。
// 排除桌宠自己（它叫起来也会挂）。只看有没有，不读任何内容。
let musicOn = false;
function watchMusic() {
  if (process.platform !== 'darwin') return;
  setInterval(() => {
    const own = new Set(app.getAppMetrics().map(m => m.pid));
    require('child_process').execFile('pmset', ['-g', 'assertions'], { timeout: 3000 }, (err, out) => {
      if (err) return;
      let on = false;
      for (const line of out.split('\n')) {
        const m = line.match(/pid (\d+)\(([^)]*)\):.*named: "([^"]*)"/);
        if (!m || own.has(+m[1]) || m[2] === 'coreaudiod') continue;
        if (/playing audio|audio|music|media|video|播放/i.test(m[3])) { on = true; break; }
      }
      if (on !== musicOn) { musicOn = on; send('music', on); }
    });
  }, 6000);
}

// 教它说话：输入一句话，鸟以后学舌时会说（最多记 20 句）
let teachWin;
function openTeach() {
  if (teachWin && !teachWin.isDestroyed()) { teachWin.show(); teachWin.focus(); return; }
  teachWin = new BrowserWindow({
    width: 380, height: 300, title: '教它说话', resizable: false,
    webPreferences: { preload: path.join(__dirname, 'src', 'names_preload.js'), contextIsolation: true },
  });
  teachWin.setMenuBarVisibility(false);
  teachWin.loadFile(path.join(__dirname, 'src', 'teach.html'));
  app.focus({ steal: true });
}

function openNames() {
  if (namesWin && !namesWin.isDestroyed()) { namesWin.show(); namesWin.focus(); return; }
  namesWin = new BrowserWindow({
    width: 380, height: 330, title: '名字', resizable: false,
    webPreferences: { preload: path.join(__dirname, 'src', 'names_preload.js'), contextIsolation: true },
  });
  namesWin.setMenuBarVisibility(false);
  namesWin.loadFile(path.join(__dirname, 'src', 'names.html'));
  app.focus({ steal: true });
}

function openAiSettings() {
  if (aiSettingsWin && !aiSettingsWin.isDestroyed()) { aiSettingsWin.show(); aiSettingsWin.focus(); return; }
  aiSettingsWin = new BrowserWindow({
    width: 560, height: 640, title: 'AI 生成动作 · 设置', resizable: true,
    webPreferences: { preload: path.join(__dirname, 'src', 'aisettings_preload.js'), contextIsolation: true },
  });
  aiSettingsWin.setMenuBarVisibility(false);
  aiSettingsWin.loadFile(path.join(__dirname, 'src', 'aisettings.html'));
  app.focus({ steal: true });
}

async function startAiGenerate() {
  if (!videogen.ready()) {
    await dialog.showMessageBox({ type: 'info', message: '先填一下生成服务的密钥', detail: '在接下来的设置窗口里选服务、填 API Key，保存后再来。', buttons: ['好'] });
    return openAiSettings();
  }
  app.focus({ steal: true });
  const species = settings.species;
  const family = familyOf(species);
  const pick = await dialog.showOpenDialog({
    title: `选一张${SPECIES[species].name}的照片`,
    message: '整只鸟清楚入镜的照片最好；人和背景会先被自动去掉，不会发出去',
    properties: ['openFile'],
    filters: [{ name: '照片', extensions: ['jpg', 'jpeg', 'png', 'heic', 'webp', 'bmp'] }],
  });
  if (pick.canceled || !pick.filePaths[0]) return;
  const all = aiActionList(family);
  const eAll = videogen.estimate(all.length);
  const eCore = videogen.estimate(AI_CORE.length);
  const names = (ids) => ids.map(id => (ACTIONS.find(a => a.id === id) || { name: id }).name).join('、');
  const money = (e) => (e.yuan ? `约 ¥${e.yuan}` : '免费');
  const r = await dialog.showMessageBox({
    type: 'question',
    message: `用这张照片给「${SPECIES[species].name}」生成动作？`,
    detail: `服务：${eAll.provider}（${eAll.model}），每段 5 秒。\n` +
      `全部 ${all.length} 段：${names(all)}。\n核心 ${AI_CORE.length} 段：${names(AI_CORE)}。\n\n` +
      `费用按生成的视频秒数计，提交后取消不了。生成大约要几分钟，好了会自动抠图导入，气泡会告诉你进度。`,
    buttons: [`生成全部 ${all.length} 段（${money(eAll)}）`, `只生成核心 ${AI_CORE.length} 段（${money(eCore)}）`, '取消'],
    defaultId: 1,
    cancelId: 2,
  });
  if (r.response === 2) return;
  const actions = r.response === 0 ? all : AI_CORE;
  await videogen.start({ photo: pick.filePaths[0], species, family, actions });
  rebuildTray();
}

ipcMain.on('move', (_e, x, y) => {
  const ix = toInt(x);
  const iy = toInt(y);
  if (ix === null || iy === null) return;
  if (win && !win.isDestroyed()) win.setPosition(ix, iy);
});

ipcMain.on('set-ignore-mouse', (_e, ignore) => {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(ignore, { forward: true });
});

// 鸟"住"在哪块屏幕上：平时只认这一块的地面和边界，不按窗口离哪块屏幕近来算
// （多屏时鸟爬到屏幕顶上、窗口探出去一点，会被算到另一块屏幕，地面一换就"瞬间掉过去"）。
// 只有被拖到别的屏幕上松手（rehome）、或叫它回来时才换
let homeDisplayId = null;
function homeDisplay() {
  const all = screen.getAllDisplays();
  return all.find(d => d.id === homeDisplayId) || screen.getPrimaryDisplay();
}
ipcMain.handle('get-env', (_e, opts = {}) => {
  const [x, y] = win.getPosition();
  const [w, h] = win.getSize();
  if (opts.rehome || homeDisplayId === null) homeDisplayId = screen.getDisplayNearestPoint({ x: x + w / 2, y: y + h * 0.8 }).id;
  if (opts.toCursor) homeDisplayId = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
  return { x, y, w, h, workArea: homeDisplay().workArea, cursor: screen.getCursorScreenPoint(), debug: !!process.env.PET_DEBUG };
});

ipcMain.handle('get-settings', () => settings);
// 真实鹦鹉叫声（assets/sounds/<家族>/*.wav，出处见 CREDITS.md）：{ 家族: [file:// 地址, ...] }
ipcMain.handle('sound-bank', () => {
  // 素材文件夹里 sounds/<家族>/ 下自己放的录音（只在本机，不进仓库）优先，有的话整个替换掉自带的
  const bank = {};
  for (const root of [path.join(__dirname, 'assets', 'sounds'), path.join(REAL_DIR, 'sounds')]) {
    try {
      for (const fam of fs.readdirSync(root)) {
        const dir = path.join(root, fam);
        if (!fs.statSync(dir).isDirectory()) continue;
        const list = fs.readdirSync(dir).filter(f => /\.(wav|mp3|m4a|ogg)$/i.test(f)).map(f => 'file://' + path.join(dir, f));
        if (list.length) bank[fam] = list;
      }
    } catch (_) {}
  }
  return bank;
});
ipcMain.handle('names-get', () => ({
  userName: settings.userName || '',
  petName: (settings.petNames || {})[settings.species] || '',
  speciesName: SPECIES[settings.species].name,
}));
// 鹦鹉学舌：先用系统语音把这句话合成成一段 WAV（只在本机，不联网），交给桌宠加"鹦鹉嗓"再放。
// 中文用偏机器腔的 Eddy，比默认那个字正腔圆的女声更像鸟学的；没有就用系统默认。
ipcMain.handle('tts', async (_e, text) => {
  const t = String(text || '').replace(/[\r\n"]/g, ' ').slice(0, 80);
  if (!t.trim()) return null;
  const out = path.join(app.getPath('temp'), `parrot_tts_${Date.now()}.wav`);
  const zh = /[\u4e00-\u9fff]/.test(t);
  const run = (cmd, args) => new Promise((resolve) => require('child_process').execFile(cmd, args, { timeout: 8000 }, (err) => resolve(!err)));
  let ok = false;
  if (process.platform === 'darwin') {
    const base = ['-o', out, '--file-format=WAVE', '--data-format=LEI16@22050'];
    if (zh) ok = await run('say', ['-v', 'Eddy (中文（中国大陆）)', ...base, t]);
    if (!ok) ok = await run('say', [...base, t]);
  } else if (process.platform === 'win32') {
    const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${out.replace(/'/g, "''")}'); $s.Speak([Console]::In.ReadToEnd()); $s.Dispose()`;
    ok = await new Promise((resolve) => {
      const p = require('child_process').execFile('powershell', ['-NoProfile', '-Command', ps], { timeout: 10000 }, (err) => resolve(!err));
      p.stdin.end(t);
    });
  }
  if (!ok || !fs.existsSync(out)) return null;
  const b64 = fs.readFileSync(out).toString('base64');
  fs.unlink(out, () => {});
  return b64;
});

ipcMain.handle('teach-get', () => ({ learned: settings.learned || [], speciesName: SPECIES[settings.species].name }));
ipcMain.handle('teach-save', (_e, text) => {
  const t = String(text || '').replace(/[\r\n]/g, ' ').trim().slice(0, 30);
  if (!t) return false;
  settings.learned = [t, ...(settings.learned || []).filter(x => x !== t)].slice(0, 20);
  saveSettings();
  send('settings', settings);
  send('taught', t);
  return true;
});
ipcMain.handle('teach-forget', (_e, text) => {
  settings.learned = (settings.learned || []).filter(x => x !== text);
  saveSettings();
  send('settings', settings);
  return true;
});
ipcMain.handle('names-save', (_e, v) => {
  const clip = (x) => String(x || '').replace(/[\r\n]/g, '').slice(0, 12);
  settings.userName = clip(v.userName);
  settings.petNames = { ...(settings.petNames || {}), [settings.species]: clip(v.petName) };
  saveSettings();
  send('settings', settings);
  send('names-changed', { userName: settings.userName, petName: settings.petNames[settings.species] });
  return true;
});
ipcMain.handle('ai-config-get', () => videogen.publicConfig());
ipcMain.handle('ai-config-save', (_e, cfg) => { videogen.saveConfig(cfg); rebuildTray(); return true; });
// 自定义声音：素材文件夹 sounds/<名字>.mp3 等，存在就返回 file:// 地址
ipcMain.handle('custom-sound', (_e, name) => {
  for (const ext of ['mp3', 'm4a', 'wav', 'ogg', 'aac']) {
    const f = path.join(REAL_DIR, 'sounds', `${name}.${ext}`);
    if (fs.existsSync(f)) return 'file://' + f;
  }
  return null;
});
ipcMain.handle('gnaw-target', (_e, near) => desk.pickTarget(near));
ipcMain.handle('perch-target', (_e, near) => desk.pickPerch(near));
ipcMain.on('desk', (_e, cmd, arg) => { desk.onPet(cmd, arg); rebuildTray(); });
ipcMain.handle('list-real-assets', (_e, species) => listRealAssets(species));

ipcMain.on('context-menu', () => {
  // 菜单开着时让鸟原地停住，不然菜单跟着窗口跑，鼠标跟不上
  win.webContents.send('menu-cmd', 'menu-open', true);
  Menu.buildFromTemplate(buildMenuTemplate()).popup({
    window: win,
    callback: () => { if (!win.isDestroyed()) win.webContents.send('menu-cmd', 'menu-open', false); },
  });
});

// 只开一只鸟：再双击一次桌面/开始菜单里的图标，就把跑丢的鸟叫回到鼠标所在的屏幕
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => send('come-back'));

app.whenReady().then(() => {
  if (!gotLock) return;
  loadSettings();
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  createWindow();
  desk = createDesk({ root: TOOLS_ROOT, getPetWindow: () => win });
  desk.watchNewIcons((icon) => send('desk-new-icon', icon));
  watchMusic();
  videogen = createVideoGen({
    userDataDir: app.getPath('userData'),
    realDir: REAL_DIR,
    toolsRoot: TOOLS_ROOT,
    notify: (cmd, arg) => { send(cmd, arg); rebuildTray(); },
  });
  importer = createImporter({
    root: TOOLS_ROOT,
    realDir: REAL_DIR,
    supportDir: app.getPath('userData'),
    getSpecies: () => settings.species,
    speciesIds: Object.keys(SPECIES),
    actionIds: ACTIONS.map(a => a.id),
    notify: (cmd, arg) => { send(cmd, arg); if (cmd === 'setup-done') rebuildTray(); },
  });
  win.webContents.once('did-finish-load', () => importer.start());
  createTray();
  // 换显示器、改分辨率时让鸟重新找地面
  screen.on('display-metrics-changed', () => send('come-back'));
  screen.on('display-removed', () => send('come-back'));
});

app.on('window-all-closed', () => app.quit());
