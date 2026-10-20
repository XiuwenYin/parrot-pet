// 不在 Electron 里（直接用浏览器打开 index.html）时的假 API：
// 把整个网页当成"屏幕"，#win 当成桌宠窗口，方便调动作和配色。
function makeMockApi() {
  document.body.classList.add('mock');
  const winEl = document.getElementById('win');
  let x = Math.round(innerWidth * 0.5);
  let y = innerHeight - 260;
  const listeners = [];
  let cursor = { x: 0, y: 0 };
  addEventListener('mousemove', (e) => { cursor = { x: e.clientX, y: e.clientY }; });
  const place = () => { winEl.style.left = x + 'px'; winEl.style.top = y + 'px'; };
  place();
  return {
    move(nx, ny) { x = nx; y = ny; place(); },
    setIgnoreMouse() {},
    async getEnv() {
      return { x, y, w: 240, h: 260, workArea: { x: 0, y: 0, width: innerWidth, height: innerHeight }, cursor };
    },
    async getSettings() { return { species: 'roseicollis', mode: 'cartoon', size: 'medium', muted: true }; },
    async listRealAssets() { return {}; },
    async customSound() { return null; },
    showMenu() {},
    onMenu(fn) { listeners.push(fn); },
    // 假的桌面图标：画一个 64px 的方块，咬的位置画红点，用来检查嘴有没有对准
    async gnawTarget() {
      let ic = document.getElementById('mockIcon');
      if (!ic) {
        ic = document.createElement('div');
        ic.id = 'mockIcon';
        ic.style.cssText = 'position:fixed;left:180px;top:220px;width:64px;height:64px;border-radius:12px;background:linear-gradient(#7fb3ff,#3d7be0);box-shadow:0 2px 6px rgba(0,0,0,.2)';
        document.body.appendChild(ic);
      }
      return { name: 'mock', x: 212, y: 252, size: 64 };
    },
    desk(cmd, arg) {
      if (cmd !== 'bite') return;
      const d = document.createElement('div');
      d.className = 'mockBite';
      d.style.cssText = `position:fixed;left:${arg.bx - 3}px;top:${arg.by - 3}px;width:6px;height:6px;border-radius:3px;background:red;z-index:5`;
      document.body.appendChild(d);
    },
  };
}

function buildMockPanel(startAction, setSetting) {
  const panel = document.createElement('div');
  panel.id = 'mockPanel';
  const sel = document.createElement('select');
  Object.entries(SPECIES).forEach(([id, sp]) => sel.add(new Option(sp.name, id)));
  sel.onchange = () => setSetting('species', sel.value);
  panel.appendChild(sel);
  ACTIONS.filter(a => a.menu).forEach(a => {
    const b = document.createElement('button');
    b.textContent = a.name;
    b.dataset.action = a.id;
    b.onclick = () => startAction(a.id);
    panel.appendChild(b);
  });
  document.body.appendChild(panel);
}
