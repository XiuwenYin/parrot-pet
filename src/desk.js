// 啃桌面图标（主进程）。纯视觉效果：咬痕和纸屑画在一层透明窗口上，不碰任何真实文件。
//   - 图标位置：优先用 tools/.bin/deskicons；
//     没有辅助功能权限时退回问 Finder（

//   - 有没有被挡：tools/.bin/deskinfo 
//   - 咬痕层：全屏透明、鼠标穿透的窗口
const { BrowserWindow, screen } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const ICON_SCRIPT = `tell application "Finder"
set ps to desktop position of every item of desktop
set ns to name of every item of desktop
set out to ""
repeat with i from 1 to count of ps
  set p to item i of ps
  set out to out & (item 1 of p) & "," & (item 2 of p) & "," & (item i of ns) & linefeed
end repeat
set isz to 64
try
  set isz to icon size of icon view options of window of desktop
end try
return (isz as string) & linefeed & out
end tell`;

function createDesk({ root, getPetWindow }) {
  const deskinfo = path.join(root, 'tools', '.bin', 'deskinfo');
  const deskicons = path.join(root, 'tools', '.bin', 'deskicons');
  let axPrompted = false;
  let overlay = null;
  let marks = {};            // name → { x, y, size, at }
  let windows = [];
  let icons = [];
  let pollTimer = null;

  // 安装版自带编好的；开发时缺了就现编
  function ensureTool(bin, name) {
    return new Promise((resolve) => {
      const src = path.join(root, 'tools', name + '.swift');
      if (fs.existsSync(bin)) return resolve(true);
      fs.mkdirSync(path.dirname(bin), { recursive: true });
      execFile('swiftc', ['-O', src, '-o', bin], (err) => {
        if (err) return resolve(false);
        execFile('codesign', ['-s', '-', '--force', bin], () => resolve(true));
      });
    });
  }
  const ensureDeskinfo = async () => (await ensureTool(deskinfo, 'deskinfo')) && (await ensureTool(deskicons, 'deskicons'), true);

  function getWindows() {
    return new Promise((resolve) => {
      execFile(deskinfo, [String(process.pid)], { timeout: 3000 }, (err, out) => {
        if (err) return resolve(windows);
        try { windows = JSON.parse(out); } catch (_) {}
        resolve(windows);
      });
    });
  }

  // 先用辅助功能接口；没权限再看 Finder 脚本能不能用
  async function getIcons() {
    const ax = await new Promise((resolve) => {
      if (!fs.existsSync(deskicons)) return resolve(null);
      execFile(deskicons, axPrompted ? [] : ['prompt'], { timeout: 4000 }, (err, out) => {
        axPrompted = true;      // 系统授权提示只弹一次
        if (err) return resolve(null);
        try { resolve(JSON.parse(out)); } catch (_) { resolve(null); }
      });
    });
    if (ax && ax.icons) { icons = ax.icons.filter(i => i.name && i.size > 0); return { icons }; }
    const arranged = await new Promise((resolve) => {
      execFile('osascript', ['-e', 'tell application "Finder" to get arrangement of icon view options of window of desktop'],
        { timeout: 4000 }, (err, out) => resolve(!err && !/not arranged|未排列/.test(out) && out.trim() !== ''));
    });
    if (arranged) return { error: 'arranged' };
    return getIconsFinder();
  }

  function getIconsFinder() {
    return new Promise((resolve) => {
      execFile('osascript', ['-e', ICON_SCRIPT], { timeout: 6000 }, (err, out) => {
        if (err) return resolve({ error: String(err.message || err) });
        const lines = out.trim().split('\n');
        const size = parseInt(lines.shift(), 10) || 64;
        icons = [];
        for (const line of lines) {
          const m = line.match(/^(-?\d+),(-?\d+),(.*)$/);
          if (!m) continue;
          const x = +m[1], y = +m[2];
          if (x < 0 || y < 0) continue;      // 收在"叠放"里的没有位置
          icons.push({ name: m[3], x, y, size });
        }
        resolve({ icons });
      });
    });
  }

  // Finder 给的是图标图片中心（全局坐标，单位点，和 Electron 一致）
  const iconRect = (ic) => ({ x: ic.x - ic.size / 2, y: ic.y - ic.size / 2, w: ic.size, h: ic.size });
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  // PET_DEBUG_IGNORE_COVER=1：调试用，忽略窗口遮挡
  const covered = (ic) => !process.env.PET_DEBUG_IGNORE_COVER && windows.some(w => overlap(iconRect(ic), w));

  const iconError = (e) => e === 'arranged'
    ? '桌面开着"自动排列"，我找不准图标在哪：\n系统设置 → 隐私与安全性 → 辅助功能，允许鹦鹉桌宠'
    : /not allowed|不允许|-1743/.test(e)
      ? '没有权限看桌面图标：系统设置 → 隐私与安全性 → 自动化，允许它控制"访达"'
      : '读不到桌面图标';

  async function pickTarget(near) {
    if (process.platform !== 'darwin') return { error: '啃图标目前只支持 Mac' };
    if (!(await ensureDeskinfo())) return { error: '准备工具失败' };
    const res = await getIcons();
    if (res.error) {
      return { error: iconError(res.error) };
    }
    await getWindows();
    const free = icons.filter(ic => !covered(ic));
    if (!free.length) return { error: icons.length ? '桌面图标都被窗口挡住啦' : '桌面上没有图标' };
    // 偏向离鸟近的
    free.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
    const pool = free.slice(0, Math.min(4, free.length));
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // 爬图标：挑一个离鸟近、没被窗口挡住的图标，再找它正上方同一列、也没被挡住、挨得够近的图标（最多 3 个），
  // 鸟会站上最下面那个，再一个一个往上爬。图标都被挡住（桌面太乱）就不爬。
  async function pickPerch(near) {
    if (process.platform !== 'darwin') return { error: '爬图标目前只支持 Mac' };
    if (!(await ensureDeskinfo())) return { error: '准备工具失败' };
    const res = await getIcons();
    if (res.error) return { error: iconError(res.error) };
    await getWindows();
    const free = icons.filter(ic => !covered(ic));
    if (!free.length) return { error: icons.length ? '桌面图标都被窗口挡住啦' : '桌面上没有图标' };
    free.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
    const start = free[Math.floor(Math.random() * Math.min(3, free.length))];
    const stack = [start];
    for (;;) {
      const top = stack[stack.length - 1];
      const above = free
        .filter(ic => Math.abs(ic.x - top.x) < top.size * 0.6 && ic.y < top.y && top.y - ic.y < top.size * 2.4)
        .sort((a, b) => b.y - a.y)[0];
      if (!above || stack.length >= 4) break;
      stack.push(above);
    }
    return { stack };
  }

  // 桌面上新出现的文件：每 25 秒问一次 Finder（只在之前读成功过、有权限时才问，不会反复弹授权）
  let watchTimer = null;
  let known = null;
  function watchNewIcons(onNew) {
    if (process.platform !== 'darwin' || watchTimer) return;
    watchTimer = setInterval(async () => {
      if (!icons.length && known === null) return;        // 还没成功读过图标（没权限或没用过），先不打扰
      const res = await getIcons();
      if (res.error) return;
      const names = new Set(icons.map(i => i.name));
      if (known) {
        await getWindows();
        const fresh = icons.filter(i => !known.has(i.name) && !covered(i));
        if (fresh.length) onNew(fresh[0]);
      }
      known = names;
    }, 25000);
  }

  function ensureOverlay() {
    if (overlay && !overlay.isDestroyed()) return overlay;
    const b = screen.getPrimaryDisplay().bounds;
    overlay = new BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height,
      transparent: true, frame: false, resizable: false, hasShadow: false,
      focusable: false, skipTaskbar: true, alwaysOnTop: true, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
    });
    overlay.setAlwaysOnTop(true, 'floating');
    overlay.setVisibleOnAllWorkspaces(true);
    overlay.setIgnoreMouseEvents(true);
    overlay.loadFile(path.join(__dirname, 'overlay.html'));
    overlay.once('ready-to-show', () => {
      overlay.showInactive();
      const pet = getPetWindow();
      if (pet && !pet.isDestroyed()) pet.moveTop();   // 桌宠在咬痕上面
      pushState();
    });
    return overlay;
  }

  function send(cmd, arg) {
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('menu-cmd', cmd, arg);
  }

  // 告诉咬痕层：哪些图标被挡住了要藏起来（坐标转成窗口内坐标）
  function pushState() {
    const b = screen.getPrimaryDisplay().bounds;
    const hidden = Object.keys(marks).filter(name => covered(marks[name]));
    send('state', { origin: { x: b.x, y: b.y }, hidden });
  }

  // 桌宠渲染进程发来的事件
  function onPet(cmd, arg) {
    if (cmd === 'bite') {
      ensureOverlay();
      const m = marks[arg.name] || (marks[arg.name] = { ...arg.icon, at: Date.now() });
      m.at = Date.now();
      send('bite', { ...arg, origin: screen.getPrimaryDisplay().bounds });
      startPolling();
    } else if (cmd === 'clean') {
      marks = {};
      send('clean');
    }
  }

  function startPolling() {
    if (pollTimer) return;
    let n = 0;
    pollTimer = setInterval(async () => {
      // 15 分钟没再啃的咬痕自动淡掉
      for (const [name, m] of Object.entries(marks)) {
        if (Date.now() - m.at > 15 * 60 * 1000) { delete marks[name]; send('forget', { name }); }
      }
      if (!Object.keys(marks).length) { clearInterval(pollTimer); pollTimer = null; return; }
      await getWindows();
      // 图标被挪走了：每 10 秒对一下位置
      if (n++ % 7 === 0) {
        const res = await getIcons();
        if (!res.error) {
          for (const [name, m] of Object.entries(marks)) {
            const ic = icons.find(i => i.name === name);
            if (!ic) { delete marks[name]; send('forget', { name }); }
            else if (ic.x !== m.x || ic.y !== m.y) {
              send('move', { name, dx: ic.x - m.x, dy: ic.y - m.y });
              m.x = ic.x; m.y = ic.y;
            }
          }
        }
      }
      pushState();
    }, 1500);
  }

  async function debugCapture(file) {
    if (!overlay || overlay.isDestroyed()) return;
    const img = await overlay.webContents.capturePage();
    fs.writeFileSync(file, img.toPNG());
  }

  return { pickTarget, pickPerch, watchNewIcons, onPet, debugCapture, hasMarks: () => Object.keys(marks).length > 0 };
}

module.exports = { createDesk };
