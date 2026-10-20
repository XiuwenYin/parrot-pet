// 检查更新：看 GitHub 上最新发布的版本号。
// Windows：用 electron-updater 在后台下载安装包，下载完点"重启并更新"就装好了。
// Mac：安装包没有苹果开发者签名，系统不让应用自己替换自己，只能提示有新版、打开下载页。
const { app, shell, net } = require('electron');

const REPO = 'XiuwenYin/parrot-pet';
const RELEASES = `https://github.com/${REPO}/releases`;

function newer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

// 发布说明里"更新内容："下面的几行
function changes(body) {
  const m = String(body || '').split(/更新内容[:：]\s*\n/)[1];
  if (!m) return [];
  return m.split(/\n\s*\n/)[0].split('\n').map(s => s.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean).slice(0, 6);
}

function createUpdater({ notify }) {
  let state = { status: 'idle', current: app.getVersion() };   // idle checking none available downloading ready error
  const set = (patch) => { state = { ...state, ...patch }; notify(state); };

  // 只有 Windows 安装版才能自己下载替换
  let au = null;
  if (process.platform === 'win32' && app.isPackaged) {
    try {
      au = require('electron-updater').autoUpdater;
      au.autoDownload = false;
      au.autoInstallOnAppQuit = true;
      au.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round(p.percent || 0) }));
      au.on('update-downloaded', () => set({ status: 'ready', percent: 100 }));
      au.on('error', (e) => { if (state.status === 'downloading') set({ status: 'error', error: '下载没成功，可以到下载页手动下载', detail: String(e && e.message || e).slice(0, 200) }); });
    } catch (_) { au = null; }
  }

  async function check() {
    if (['checking', 'downloading', 'ready'].includes(state.status)) return state;
    set({ status: 'checking', error: null });
    try {
      const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'parrot-pet', Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const version = String(j.tag_name || '').replace(/^v/, '');
      if (!newer(version, state.current)) set({ status: 'none', checkedAt: Date.now() });
      else set({ status: 'available', version, changes: changes(j.body), url: j.html_url || RELEASES, auto: !!au, checkedAt: Date.now() });
    } catch (e) {
      set({ status: 'error', error: '连不上 GitHub，过会儿再试', detail: String(e && e.message || e).slice(0, 200) });
    }
    return state;
  }

  async function download() {
    if (!au) { shell.openExternal(state.url || RELEASES); return; }
    set({ status: 'downloading', percent: 0 });
    try {
      await au.checkForUpdates();
      await au.downloadUpdate();
    } catch (e) {
      set({ status: 'error', error: '下载没成功，可以到下载页手动下载', detail: String(e && e.message || e).slice(0, 200) });
    }
  }

  function install() { if (au && state.status === 'ready') au.quitAndInstall(); }

  return { check, download, install, state: () => state, canAuto: () => !!au, releasesUrl: RELEASES };
}

module.exports = { createUpdater, REPO };
