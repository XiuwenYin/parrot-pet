// 咬痕层：画咬出来的缺口和飞出来的纸屑。只是画在透明窗口上的图，不碰真实文件。
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const layer = document.getElementById('layer');
  const groups = {};         // 图标名 → <g>
  const flying = [];         // 正在飞的纸屑
  let origin = { x: 0, y: 0 };
  const rand = (a, b) => a + Math.random() * (b - a);
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };

  function group(name) {
    if (!groups[name]) {
      const g = el('g', { class: 'mark' }, layer);
      g.dataset.dx = 0;
      g.dataset.dy = 0;
      groups[name] = g;
    }
    return groups[name];
  }

  // 锯齿状的缺口轮廓：半径随机起伏，像被一口一口啃掉
  function jagged(cx, cy, r, n = 22) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (i % 2 ? rand(0.78, 0.95) : rand(0.98, 1.12));
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85]);
    }
    return 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(',')).join('L') + 'Z';
  }

  function addBite(g, x, y, size) {
    const r = size * rand(0.11, 0.16);
    const d = jagged(x, y, r);
    // 缺口
    el('path', { d, fill: 'rgba(28,22,18,0.42)', filter: 'url(#inner)' }, g);
    // 撕开的纸边：白色不规则描边 + 几根纤维
    el('path', { d, fill: 'none', stroke: 'rgba(255,253,246,0.92)', 'stroke-width': 1.6,
      'stroke-dasharray': `${rand(2, 4).toFixed(1)} ${rand(0.6, 1.6).toFixed(1)}`, filter: 'url(#soft)' }, g);
    for (let i = 0; i < 4; i++) {
      const a = rand(0, Math.PI * 2);
      const x0 = x + Math.cos(a) * r, y0 = y + Math.sin(a) * r * 0.85;
      const len = rand(1.2, 3);
      el('path', { d: `M${x0},${y0} l${Math.cos(a) * len},${Math.sin(a) * len}`,
        stroke: 'rgba(255,255,250,0.85)', 'stroke-width': 0.8, 'stroke-linecap': 'round' }, g);
    }
    // 牙印：缺口旁边两三个小弧
    for (let i = 0; i < 3; i++) {
      const a = rand(0.2, Math.PI - 0.2);
      const tx = x + Math.cos(a) * (r + 3), ty = y + Math.sin(a) * (r * 0.85 + 3);
      el('path', { d: `M${tx - 2},${ty} q2,${rand(1.5, 2.5)} 4,0`, fill: 'none',
        stroke: 'rgba(40,30,25,0.45)', 'stroke-width': 1, 'stroke-linecap': 'round' }, g);
    }
  }

  const SCRAP_COLORS = ['#fffdf6', '#f6f1e4', '#ffffff', '#e9eef5', '#f3e9d2'];
  function spawnScraps(g, x, y, size, n) {
    for (let i = 0; i < n; i++) {
      const s = rand(2.5, 6);
      const pts = [];
      const k = 4 + Math.floor(rand(0, 3));
      for (let j = 0; j < k; j++) {
        const a = (j / k) * Math.PI * 2 + rand(-0.3, 0.3);
        pts.push([Math.cos(a) * s * rand(0.5, 1.1), Math.sin(a) * s * rand(0.4, 1)]);
      }
      const p = el('path', {
        d: 'M' + pts.map(q => q.map(v => v.toFixed(1)).join(',')).join('L') + 'Z',
        fill: SCRAP_COLORS[Math.floor(rand(0, SCRAP_COLORS.length))],
        stroke: 'rgba(0,0,0,0.18)', 'stroke-width': 0.5,
      }, g);
      flying.push({
        el: p, x, y, vx: rand(-90, 90), vy: rand(-160, -40), rot: rand(0, 360), vr: rand(-400, 400),
        floor: y + size * rand(0.7, 1.6),     // 落在图标下面一点（文件名附近）
      });
    }
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      f.vy += 520 * dt;
      f.vx *= Math.pow(0.4, dt);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
      if (f.y >= f.floor) { f.y = f.floor; f.vr = 0; flying.splice(i, 1); }
      f.el.setAttribute('transform', `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${f.rot.toFixed(0)})`);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.pet.onMenu((cmd, arg) => {
    if (cmd === 'bite') {
      origin = arg.origin;
      const g = group(arg.name);
      g.classList.remove('fading', 'hidden');
      const x = arg.bx - origin.x - Number(g.dataset.dx);
      const y = arg.by - origin.y - Number(g.dataset.dy);
      addBite(g, x, y, arg.icon.size);
      spawnScraps(g, x, y, arg.icon.size, Math.round(rand(4, 8)));
    } else if (cmd === 'state') {
      origin = arg.origin;
      for (const [name, g] of Object.entries(groups)) g.classList.toggle('hidden', arg.hidden.includes(name));
    } else if (cmd === 'move') {
      const g = groups[arg.name];
      if (!g) return;
      g.dataset.dx = Number(g.dataset.dx) + arg.dx;
      g.dataset.dy = Number(g.dataset.dy) + arg.dy;
      g.setAttribute('transform', `translate(${g.dataset.dx} ${g.dataset.dy})`);
    } else if (cmd === 'forget') {
      const g = groups[arg.name];
      if (!g) return;
      g.classList.add('fading');
      setTimeout(() => { g.remove(); delete groups[arg.name]; }, 3200);
    } else if (cmd === 'clean') {
      for (const name of Object.keys(groups)) {
        groups[name].classList.add('fading');
        const g = groups[name];
        setTimeout(() => g.remove(), 3200);
        delete groups[name];
      }
      flying.length = 0;
    }
  });
})();
