// 大脑：状态机 + 物理 + 鼠标交互。窗口位置就是鸟的位置。
(async function main() {
  const api = window.pet || makeMockApi();
  const MOCK = !window.pet;

  const WIN_W = 240;
  const WIN_H = 260;
  const STAGE_TOP = 20;          // 舞台（240x240）在窗口里的上边距
  const VB = 240 / 200;          // viewBox → 舞台像素
  const FOOT_Y = STAGE_TOP + 186 * VB;            // 窗口顶到脚底
  const HANG_FOOT_Y = STAGE_TOP + 240 - 186 * VB; // 倒挂时窗口顶到脚
  const HEAD_TOP_Y = STAGE_TOP + 40 * VB;           // 正着时窗口顶到头顶
  const GRAVITY = 2400;

  const stage = document.getElementById('stage');
  const svg = document.getElementById('bird');
  const canvas = document.getElementById('realCanvas');
  const bubble = document.getElementById('bubble');
  const fxLayer = document.getElementById('fx');
  const real = makeReal(canvas);

  let settings = await api.getSettings();
  let env = await api.getEnv();
  let applyCartoon = null;
  let useReal = false;
  let realHintShown = false;

  const pos = { x: env.x, y: env.y };
  let dir = -1;                  // 1 朝右，-1 朝左
  let tailPaper = 0;      // 牡丹插在尾巴上的纸条
  let twigPile = 0;       // 和尚身后的树枝堆
  let family = 'lovebird';
  let traits = FAMILIES.lovebird;
  let hopT = 1;           // 点击时的小跳
  let flipAngle = 0;      // 倒挂时舞台的旋转角度（慢慢转过去）
  let lastInteract = performance.now();

  // ---------- 外观 ----------
  async function applySettings() {
    const sp = SPECIES[settings.species] || SPECIES.roseicollis;
    family = sp.shape;
    traits = FAMILIES[family] || FAMILIES.lovebird;
    svg.innerHTML = parrotSVG(family, sp.palette);
    Sound.setVoice(traits.voice);
    gnawTip = null;
    applyCartoon = makeCartoon(svg);
    Sound.setMuted(settings.muted);
    useReal = false;
    if (settings.mode === 'real') {
      real.setClips(await api.listRealAssets(settings.species));
      useReal = real.hasAny();
      if (!useReal && !realHintShown) {
        realHintShown = true;
        say(`${sp.name}还没有真实素材～\n右键 → 打开真实素材文件夹`, 4500);
      }
    }
    svg.style.display = useReal ? 'none' : '';
    canvas.style.display = useReal ? '' : 'none';
    env = await api.getEnv();
  }

  // ---------- 世界 ----------
  const scale = () => env.w / WIN_W;
  const wa = () => env.workArea;
  const groundY = () => wa().y + wa().height - FOOT_Y * scale();
  const ceilY = () => wa().y - HANG_FOOT_Y * scale() + 2;
  const minX = () => wa().x - 40 * scale();
  const maxX = () => wa().x + wa().width - 200 * scale();
  const onGround = () => Math.abs(pos.y - groundY()) < 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

  setInterval(async () => { env = await api.getEnv(); }, 2000);

  // ---------- 气泡和特效 ----------
  let bubbleTimer;
  function say(text, ms = 2200) {
    bubble.textContent = text;
    bubble.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms);
  }

  function headPoint() {
    if (flipAngle > 90) return { x: 120, y: 190 };
    const vx = dir > 0 ? 130 : 200 - 130;
    return { x: vx * VB, y: STAGE_TOP + 52 * VB };
  }

  function fx(char, opts = {}) {
    const el = document.createElement('span');
    el.className = 'fx ' + (opts.cls || 'float');
    el.textContent = char;
    const h = headPoint();
    el.style.left = h.x + (opts.dx || 0) + rand(-8, 8) + 'px';
    el.style.top = h.y + (opts.dy || 0) + 'px';
    if (opts.size) el.style.fontSize = opts.size + 'px';
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), opts.life || 1600);
  }

  // ---------- 状态机 ----------
  const LINES = {
    walk: ['溜达溜达～', '巡视领地！', '嘿咻嘿咻'],
    eat: ['咔嚓咔嚓', '瓜子真香', '再来一颗'],
    preen: ['整理一下发型', '羽毛要亮亮的'],
    sing: ['啾啾啾～♪', '叽叽喳喳！'],
    dance: ['动次打次！', '摇摆摇摆～'],
    paper: ['做个窝！', '纸条是我的'],
    look: ['你在干嘛？', '盯——', '歪头'],
    sleep: ['困了…'],
    click: ['啾！', '干嘛～', '啾啾？', '陪我玩！', '摸摸头', '我是牡丹！'],
    wake: ['哈欠～谁吵我', '再睡五分钟…'],
    drag: ['放我下来！', '啊啊啊', '我会飞的！'],
    warn: ['再不放我就咬了！', '放——开——', '我数到三！'],
    bite: ['咔！', '飞天老虎钳出击！', '叫你不放！'],
    free: ['自由啦～', '拜拜～', '我飞走咯'],
    flutter: ['扑棱扑棱', '慢慢降落～'],
    gnaw: ['嘎吱嘎吱', '这个文件好吃', '磨磨牙', '帮你整理文件（物理）'],
    gnawDone: ['吃饱了～', '呸，不好吃', '下次啃那个'],
    dizzy: ['晕晕的…', '天旋地转'],
    happy: ['好舒服～', '再摸摸'],
    angry: ['咬你哦！', '哼！'],
    hang: ['倒挂金钩！', '看我的！'],
  };

  const lines = (id) => (traits.lines && traits.lines[id]) || LINES[id];

  // dur: 持续秒数范围；w: 随机挑选权重（家族习性可覆盖）；enter/update: 进入时和每帧（管位置）
  const BEHAVIORS = {
    idle: { dur: [3, 7], w: 3, enter(s) { s.front = Math.random() < 0.3; } },
    walk: {
      dur: [2.5, 6], w: 3,
      enter(s) { if (Math.random() < 0.5) dir = -dir; },
      update(dt) {
        const ph = (cur.t % 0.34) / 0.34;
        if (ph > 0.15 && ph < 0.85) pos.x += dir * 70 * scale() * dt;
        if (pos.x < minX()) { pos.x = minX(); dir = 1; }
        if (pos.x > maxX()) { pos.x = maxX(); dir = -1; }
      },
    },
    fly: {
      dur: [30, 30], w: 2,
      enter(s) {
        s.phase = s.noCrouch ? 'cruise' : 'crouch';
        if (!s.waypoints) {
          const W = wa();
          const wps = [];
          const hops = Math.random() < 0.5 ? 1 : 2;
          for (let i = 0; i < hops; i++) {
            wps.push({ x: rand(minX(), maxX()), y: rand(W.y + W.height * 0.1, W.y + W.height * 0.65) });
          }
          // 飞到"头刚碰到屏幕顶"的位置；翻过去倒挂时鸟占的范围正好不变，不会跳
          if (s.thenHang) wps.push({ x: rand(minX(), maxX()), y: wa().y - HEAD_TOP_Y * scale() });
          else wps.push({ x: rand(minX(), maxX()), y: groundY() });
          s.waypoints = wps;
        }
      },
      update(dt, s) {
        if (s.phase === 'crouch') { if (cur.t > 0.35) { s.phase = 'cruise'; Sound.chirp(1); } return; }
        const wp = s.waypoints[0];
        const dx = wp.x - pos.x;
        const dy = wp.y - pos.y;
        const dist = Math.hypot(dx, dy);
        const speed = 300 * scale();
        const last = s.waypoints.length === 1;
        if (Math.abs(dx) > 4) dir = dx > 0 ? 1 : -1;
        s.lean = Math.max(-20, Math.min(20, dy / (dist || 1) * 18)) + 8;
        if (last && !s.thenHang && !s.then && dist < 60 * scale()) s.phase = 'land';
        const step = Math.min(dist, speed * dt);
        pos.x += (dx / (dist || 1)) * step;
        pos.y += (dy / (dist || 1)) * step + Math.sin(cur.t * 9) * 0.8 * scale();
        if (dist < 3) {
          s.waypoints.shift();
          if (!s.waypoints.length) {
            if (s.thenHang) setState('hang');
            else if (s.then) setState(s.then.id, s.then.opts);
            else { pos.y = groundY(); setState('idle', { dur: 1.5 }); }
          }
        }
      },
    },
    eat: {
      dur: [4, 8], w: 1.5,
      update(dt, s) {
        // 和 actions.js 里 eat 的啄击节奏一致（1.6 次/秒，sin 波峰时嘴碰到瓜子）
        const k = Math.floor(cur.t * 1.6 - 0.25);
        if (k !== s.peck) {
          s.peck = k;
          if (k >= 0 && Math.random() < 0.75) Sound.crack();
        }
      },
    },
    preen: { dur: [3, 6], w: 1.5 },
    scratch: { dur: [1.6, 2.4], w: 1 },
    stretch: { dur: [2.6, 2.6], w: 1 },
    sing: {
      dur: [3, 4.5], w: 1,
      update(dt, s) {
        s.note = (s.note || 0) - dt;
        if (s.note <= 0) { Sound.song(); fx(pickOne(['♪', '♫', '♬']), { cls: 'note' }); s.note = 0.9; }
      },
    },
    dance: {
      dur: [4, 6], w: 1,
      update(dt, s) {
        s.note = (s.note || 0) - dt;
        if (s.note <= 0) { fx(pickOne(['♪', '♫']), { cls: 'note' }); s.note = 0.6; }
      },
    },
    paper: {
      dur: [4.4, 4.4], w: 0.8,
      exit() { tailPaper = Math.min(3, tailPaper + 1); },
    },
    look: {
      dur: [3, 5], w: 1,
      update(dt, s) {
        const c = env.cursor;
        // 用身体中心判断（不随朝向变化），否则一转身参考点就跳到另一边，来回鬼畜
        const cx = pos.x + 120 * scale();
        const hy = pos.y + headPoint().y * scale();
        const dx = c.x - cx;
        // 鼠标在正前方附近 → 正脸；离开得更远才转回侧脸（留缓冲，防抖）
        if (s.front) { if (Math.abs(dx) > 190 * scale()) s.front = false; }
        else if (Math.abs(dx) < 120 * scale()) s.front = true;
        if (!s.front) {
          const want = dx > 0 ? 1 : -1;
          if (want !== dir && cur.t - (s.turnAt ?? -9) > 0.8) { dir = want; s.turnAt = cur.t; }
        }
        s.lookTilt = Math.max(-25, Math.min(25, (c.y - hy) / 20));
        s.poll = (s.poll || 0) - dt;
        if (s.poll <= 0) { api.getEnv().then(e => { env = e; }); s.poll = 0.15; }
      },
    },
    sleep: {
      dur: [12, 30], w: 0.7,
      update(dt, s) {
        s.z = (s.z || 0) - dt;
        if (s.z <= 0) { fx('Z', { cls: 'zzz', dx: dir > 0 ? -40 : 40, size: 16 + Math.random() * 8, life: 2400 }); s.z = 1.1; }
      },
    },
    hang: {
      dur: [5, 10], w: 0.6,
      update(dt) { pos.y += (ceilY() - pos.y) * Math.min(1, dt * 5); },
      next() { setState('fly', { noCrouch: true, waypoints: [{ x: pos.x + dir * 120 * scale(), y: groundY() }] }); },
    },
    happy: {
      dur: [1.8, 1.8], w: 0,
      enter() { fx('❤', { cls: 'heart' }); setTimeout(() => fx('❤', { cls: 'heart' }), 400); },
    },
    angry: { dur: [1.6, 1.6], w: 0, enter() { Sound.squawk(); fx('💢', { cls: 'pop', dx: 10, dy: -10 }); } },
    drag: {
      dur: [999, 999], w: 0,
      enter(s) { s.hold = 0; s.warnAt = rand(1.8, 2.6); s.biteAt = s.warnAt + rand(1.4, 2.4); },
      update(dt, s) {
        s.hold += dt;
        if (!s.warned && s.hold > s.warnAt) {
          s.warned = true;
          if (traits.hold === 'hiss') Sound.hiss(); else Sound.squawk();
          say(pickOne(lines('warn')), 2400);
        }
        if (s.hold > s.biteAt) bite(traits.hold);
      },
    },
    // 咬一口然后挣脱
    bite: {
      dur: [0.7, 0.7], w: 0,
      enter() {
        Sound.snap();
        setTimeout(() => Sound.snap(), 130);
        Sound.squawk();
        say(pickOne(lines('bite')), 1800);
        fx('💢', { cls: 'pop', dx: 14, dy: -6 });
        fx('咔!', { cls: 'pop', dx: -30, dy: 40, size: 22 });
      },
      next() { setState('fly', { noCrouch: true, quiet: true }); },
    },
    // ---------- 各家族的习性 ----------
    mirror: {
      dur: [5, 8], w: 0,
      update(dt, s) {
        s.c = (s.c || 0.4) - dt;
        if (s.c <= 0) {
          s.c = rand(0.9, 1.6);
          Sound.chirp(Math.random() < 0.5 ? 2 : 3);
          if (Math.random() < 0.3) say(pickOne(lines('mirror')), 1800);
        }
        // 每次碰镜子"叮"一下
        const k = Math.floor((cur.t - 1.65) / 1.8);
        if (k !== s.tap) { s.tap = k; if (k >= 0) Sound.snap(); }
      },
    },
    talk: {
      dur: [2.6, 3.6], w: 0,
      enter(s) {
        const text = pickOne(lines('talk') || ['你好']);
        say(text, 2600);
        Sound.talk(Math.max(3, Math.min(8, text.length)));
      },
    },
    whistle: {
      dur: [6, 6], w: 0,
      enter(s) {
        say(pickOne(lines('whistle')), 2500);
        const me = cur;
        api.customSound(family + '-whistle').then((url) => {
          if (cur !== me) return;
          const d = Sound.whistle(url);
          if (d) me.dur = d + 0.4;
          else { const a = new Audio(url); a.onloadedmetadata = () => { if (cur === me) me.dur = Math.min(30, a.duration + 0.4); }; }
        });
      },
      update(dt, s) {
        s.note = (s.note || 0) - dt;
        if (s.note <= 0) { fx(pickOne(['♪', '♫']), { cls: 'note' }); s.note = 0.55; }
      },
    },
    heartwing: {
      dur: [2.6, 3.2], w: 0,
      enter() { Sound.chirp(2); setTimeout(() => fx('❤', { cls: 'heart', size: 26 }), 500); },
    },
    headdown: {
      dur: [3, 5], w: 0,
      enter() { say(pickOne(['挠挠这里～', '这边这边', '舒服～'])); fx('❤', { cls: 'heart' }); },
    },
    // 躲到屏幕下边缘后面只露冠羽，过一会儿冒出来，玩两轮
    peekaboo: {
      dur: [6.2, 6.2], w: 0,
      enter(s) { s.base = groundY(); s.popped = false; },
      update(dt, s) {
        const hide = (FOOT_Y - HEAD_TOP_Y + 6) * scale();
        const cyc = cur.t % 3.1;          // 每轮：0.4 缩下去，1.6 躲着，0.15 冒出来，停一会
        let off;
        if (cyc < 0.4) off = hide * (cyc / 0.4);
        else if (cyc < 2.0) off = hide;
        else if (cyc < 2.15) off = hide * (1 - (cyc - 2.0) / 0.15);
        else off = 0;
        const popped = cyc >= 2.0;
        if (popped && !s.popped) { say(pickOne(lines('peekaboo')), 1500); Sound.chirp(2); }
        s.popped = popped;
        pos.y = s.base + off;
      },
      exit() { pos.y = groundY(); },
    },
    nest: {
      dur: [4, 4], w: 0,
      exit() { twigPile = Math.min(5, twigPile + 1); },
    },
    quake: {
      dur: [1.8, 2.8], w: 0,
      enter() { Sound.talk(2); },
    },
    nibble: {
      dur: [0.6, 0.6], w: 0,
      enter() { Sound.snap(); say(pickOne(['啄你一下！', '哼！', '叽！']), 1600); },
      next() { setState('fly', { noCrouch: true, quiet: true }); },
    },
    hiss: {
      dur: [1.1, 1.1], w: 0,
      enter() { Sound.hiss(); say('嘶——！', 1600); fx('💢', { cls: 'pop', dx: 14, dy: -6 }); },
      next() { setState('fly', { noCrouch: true, quiet: true }); },
    },
    fright: {
      dur: [3, 3], w: 0,
      enter() { Sound.squawk(); setTimeout(() => Sound.chirp(4), 300); say('！！吓死了', 2000); },
    },

    // 悬停在桌面图标旁边，一口一口啃（咬痕是画出来的，不碰真实文件）
    gnaw: {
      dur: [7, 10], w: 0.4,
      enter(s) { dir = s.dir; s.bite = 0; s.nextBite = 0.97; },
      update(dt, s) {
        const pt = s.points[Math.min(s.bite, s.points.length - 1)];
        const want = alignBeak(pt);
        const k = Math.min(1, dt * 6);
        pos.x += (want.x - pos.x) * k;
        pos.y += (want.y - pos.y) * k;
        s.nextBite -= dt;
        if (s.nextBite <= 0) {
          s.nextBite = 1.1;
          api.desk('bite', { name: s.icon.name, icon: s.icon, bx: pt.x, by: pt.y });
          Sound.crack();
          setTimeout(() => Sound.crack(), 90);
          if (s.bite === 1 && Math.random() < 0.7) say(pickOne(lines('gnaw')));
          s.bite++;
        }
      },
      next(s) {
        if (Math.random() < 0.6) say(pickOne(lines('gnawDone')));
        setState('fly', { noCrouch: true, quiet: true, waypoints: [{ x: pos.x - dir * 90 * scale(), y: groundY() }] });
      },
    },
    // 张开翅膀慢慢降落（不像物件那样直直掉下去）
    flutter: {
      dur: [999, 999], w: 0,
      update(dt, s) {
        s.vx *= Math.pow(0.25, dt);
        s.vy += GRAVITY * 0.18 * scale() * dt;
        s.vy = Math.min(s.vy, 110 * scale());
        pos.x += (s.vx + Math.sin(cur.t * 2.2) * 25 * scale()) * dt;
        pos.y += s.vy * dt;
        if (Math.abs(s.vx) > 20) dir = s.vx > 0 ? 1 : -1;
        if (pos.x < minX()) { pos.x = minX(); s.vx = Math.abs(s.vx); }
        if (pos.x > maxX()) { pos.x = maxX(); s.vx = -Math.abs(s.vx); }
        if (pos.y < wa().y - 40 * scale()) { pos.y = wa().y - 40 * scale(); s.vy = 0; }
        if (pos.y >= groundY()) {
          pos.y = groundY();
          Sound.chirp(1);
          setState('idle', { dur: 1.5, quiet: true });
        }
      },
    },
    thrown: {
      dur: [999, 999], w: 0,
      update(dt, s) {
        s.vy += GRAVITY * scale() * dt;
        pos.x += s.vx * dt;
        pos.y += s.vy * dt;
        s.spin = (s.spin || 0) + s.vx * dt * 0.6;
        s.air = (s.air || 0) + dt;
        if (pos.x < minX()) { pos.x = minX(); s.vx = -s.vx * 0.6; s.hit = true; }
        if (pos.x > maxX()) { pos.x = maxX(); s.vx = -s.vx * 0.6; s.hit = true; }
        if (pos.y < wa().y - 40 * scale()) { pos.y = wa().y - 40 * scale(); s.vy = -s.vy * 0.5; s.hit = true; }
        if (pos.y >= groundY()) {
          pos.y = groundY();
          const impact = Math.abs(s.vy);
          if (impact > 500 * scale()) { s.vy = -impact * 0.45; s.vx *= 0.75; s.hit = true; }
          else {
            s.vy = 0;
            s.vx *= Math.pow(0.02, dt);
            s.spin *= Math.pow(0.001, dt);
            if (Math.abs(s.vx) < 40 * scale()) {
              if (s.hit) setState('dizzy'); else setState('idle', { dur: 1 });
            }
          }
        } else if (s.air > (s.recoverAt || 0.45)) {
          // 毕竟是鸟：翻滚一下就张开翅膀，要么慢慢落下，要么直接飞走
          recover(s.vx, s.vy);
        }
      },
    },
    dizzy: {
      dur: [2.6, 2.6], w: 0,
      enter() { say(pickOne(lines('dizzy'))); },
      update(dt, s) {
        s.star = (s.star || 0) - dt;
        if (s.star <= 0) { fx('💫', { cls: 'orbit', dy: -8 }); s.star = 0.7; }
      },
    },
  };

  let cur = { id: 'idle', t: 0, dur: 2, s: { seed: Math.random() } };

  function recover(vx, vy) {
    if (Math.random() < 0.5) {
      setState('flutter', { vx: vx * 0.4, vy: Math.min(vy * 0.3, 0) });
    } else {
      setState('fly', { noCrouch: true, quiet: true });
      say(pickOne(lines('free')));
    }
  }

  // 被拎太久：bite 狠咬（牡丹、和尚）/ nibble 轻啄（虎皮）/ hiss 哈气（玄凤），然后挣脱
  function bite(kind = 'bite') {
    press = null;
    dragging = false;
    lastInteract = performance.now();
    setState(kind, { quiet: true });
  }

  function setState(id, opts = {}) {
    const b = BEHAVIORS[id];
    if (!b) return;
    const prev = BEHAVIORS[cur.id];
    if (prev && prev.exit && cur.id !== id) prev.exit(cur.s);
    const [a, z] = b.dur;
    cur = { id, t: 0, dur: opts.dur || rand(a, z), s: { seed: Math.random(), ...opts } };
    if (b.enter) b.enter(cur.s);
    if (lines(id) && !opts.quiet && Math.random() < 0.55 && !['dizzy', 'talk', 'whistle'].includes(id)) say(pickOne(lines(id)));
  }

  function chooseNext() {
    const hour = new Date().getHours();
    const night = hour >= 23 || hour < 7;
    const bored = performance.now() - lastInteract > 5 * 60 * 1000;
    const entries = Object.entries(BEHAVIORS)
      .filter(([id, b]) => b.w > 0 && id !== cur.id)
      .filter(([id]) => actionAllowed(id, family))
      .map(([id, b]) => [id, (traits.weights[id] ?? b.w) * (id === 'sleep' && (night || bored) ? 6 : 1)])
      .filter(([, w]) => w > 0);
    // 玄凤夜惊：夜里睡着睡着突然惊醒
    if (traits.nightFright && night && cur.id === 'sleep' && Math.random() < 0.25) return 'fright';
    let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
    for (const [id, w] of entries) { if ((r -= w) <= 0) return id; }
    return 'idle';
  }

  // 嘴尖对准某个屏幕坐标时，窗口应该放在哪
  let gnawTip = null;
  function alignBeak(pt, d = dir) {
    if (!gnawTip) { const p = basePose(); POSES.gnaw(0, {}, p); gnawTip = parrotBeakTip(family, p); }
    const wx = (d > 0 ? gnawTip.x : 200 - gnawTip.x) * VB;
    const wy = STAGE_TOP + gnawTip.y * VB;
    return { x: pt.x - wx * scale(), y: pt.y - wy * scale() };
  }

  let gnawPending = false;
  async function startGnaw(random) {
    if (gnawPending) return;
    gnawPending = true;
    const center = { x: pos.x + 120 * scale(), y: pos.y + 140 * scale() };
    let t;
    try { t = await api.gnawTarget(center); } catch (e) { t = { error: String(e) }; }
    gnawPending = false;
    if (!t || t.error) {
      if (t && t.error) console.warn('gnaw:', t.error);
      if (!random) say(t && t.error ? t.error : '没找到能啃的', 4500);
      return;
    }
    if (['drag', 'thrown', 'bite'].includes(cur.id)) return;
    const d = center.x < t.x ? 1 : -1;      // 从哪边过去，就朝哪边
    const h = t.size / 2;
    const ex = t.x - d * h;                 // 靠近鸟这一侧的边
    const top = t.y - h;
    // 从靠近的上角开始，沿着上边往里啃，最后再啃一下侧边
    const points = [
      { x: ex + d * t.size * 0.1, y: top + t.size * 0.1 },
      { x: ex + d * t.size * 0.28, y: top + t.size * 0.04 },
      { x: ex + d * t.size * 0.48, y: top + t.size * 0.02 },
      { x: ex + d * t.size * 0.04, y: top + t.size * 0.32 },
      { x: ex + d * t.size * 0.66, y: top + t.size * 0.03 },
      { x: ex + d * t.size * 0.06, y: top + t.size * 0.52 },
      { x: ex + d * t.size * 0.82, y: top + t.size * 0.06 },
      { x: ex + d * t.size * 0.2, y: top + t.size * 0.2 },
    ];
    const first = alignBeak(points[0], d);
    setState('fly', { noCrouch: !onGround(), quiet: true, waypoints: [first],
      then: { id: 'gnaw', opts: { points, icon: t, dir: d, quiet: true } } });
  }

  function startAction(id) {
    lastInteract = performance.now();
    if (!actionAllowed(id, family)) { say(`${traits.name}不会这个哦`); return; }
    if (id === 'gnaw') return startGnaw(false);
    if (id === 'hang') return setState('fly', { thenHang: true });
    if (id === 'fly') return setState('fly');
    if (!onGround()) {
      // 在空中被点了地面动作：先飞下来
      return setState('fly', { noCrouch: true, waypoints: [{ x: pos.x, y: groundY() }] });
    }
    setState(id);
  }

  // ---------- 鼠标 ----------
  let ignoring = true;
  let press = null;
  let dragging = false;
  let samples = [];
  let petDist = 0;
  let petTimer;
  const clickTimes = [];

  const screenPt = (e) => (MOCK ? { x: e.clientX, y: e.clientY } : { x: e.screenX, y: e.screenY });

  // 把窗口坐标换算回舞台（未翻转/未倒挂）坐标，给真实模式做命中测试
  function toStage(cx, cy) {
    let x = cx;
    let y = cy - STAGE_TOP;
    if (flipAngle > 90) { x = 240 - x; y = 240 - y; }
    if (dir < 0) x = 240 - x;
    return { x: x * (canvas.width / 240), y: y * (canvas.height / 240) };
  }

  function isHit(e) {
    if (e.target.closest && e.target.closest('#bubble.show')) return true;
    if (useReal) {
      const p = toStage(e.clientX, e.clientY);
      return real.hit(p.x, p.y);
    }
    return !!(e.target.closest && e.target.closest('.hit'));
  }

  function setIgnore(v) {
    if (v !== ignoring) { ignoring = v; api.setIgnoreMouse(v); }
  }

  document.addEventListener('mousemove', (e) => {
    if (press && cur.id !== 'drag' && dragging) { press = null; dragging = false; }
    if (press) {
      const p = screenPt(e);
      if (!dragging && Math.hypot(p.x - press.sx, p.y - press.sy) > 5) {
        dragging = true;
        setState('drag', { quiet: true });
        say(pickOne(lines('drag')));
        Sound.chirp(3);
      }
      if (dragging) {
        const nx = press.wx + (p.x - press.sx);
        const ny = press.wy + (p.y - press.sy);
        const now = performance.now();
        samples.push({ x: nx, y: ny, t: now });
        samples = samples.filter(s => now - s.t < 90);
        cur.s.vx = samples.length > 1 ? (nx - samples[0].x) / ((now - samples[0].t) / 1000 || 1) : 0;
        pos.x = nx; pos.y = ny;
      }
      return;
    }
    const hit = isHit(e);
    setIgnore(!hit);
    // 在头上来回蹭 = 摸摸
    const onHead = useReal ? hit && toStage(e.clientX, e.clientY).y < canvas.height * 0.55
                           : !!(e.target.closest && e.target.closest('#head'));
    if (onHead && !['drag', 'thrown', 'fly', 'hang'].includes(cur.id)) {
      petDist += Math.hypot(e.movementX, e.movementY);
      clearTimeout(petTimer);
      petTimer = setTimeout(() => { petDist = 0; }, 700);
      if (petDist > 260 && cur.id !== 'happy') {
        petDist = 0;
        lastInteract = performance.now();
        setState(traits.petted || 'happy');
      }
    }
  });

  document.addEventListener('mouseleave', () => { if (!press) setIgnore(true); });

  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !isHit(e)) return;
    const p = screenPt(e);
    press = { sx: p.x, sy: p.y, wx: pos.x, wy: pos.y };
    samples = [];
  });

  document.addEventListener('mouseup', (e) => {
    if (!press) return;
    const wasDrag = dragging;
    press = null;
    dragging = false;
    lastInteract = performance.now();
    if (wasDrag) {
      const now = performance.now();
      const s0 = samples[0];
      const s1 = samples[samples.length - 1];
      const dt = s0 && s1 && s1.t > s0.t ? (s1.t - s0.t) / 1000 : 1;
      const vx = s0 ? (s1.x - s0.x) / dt : 0;
      const vy = s0 ? (s1.y - s0.y) / dt : 0;
      const cap = 4000 * scale();
      const cvx = Number.isFinite(vx) ? Math.max(-cap, Math.min(cap, vx)) : 0;
      const cvy = Number.isFinite(vy) ? Math.max(-cap, Math.min(cap, vy)) : 0;
      if (Math.hypot(cvx, cvy) > 450 * scale()) {
        setState('thrown', { vx: cvx, vy: cvy, spin: 0, quiet: true, recoverAt: rand(0.3, 0.6) });
      } else {
        recover(cvx, cvy);
      }
      return;
    }
    onClick();
  });

  document.addEventListener('dblclick', (e) => { if (isHit(e)) startAction('dance'); });
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); api.showMenu(); });

  function onClick() {
    const now = performance.now();
    clickTimes.push(now);
    while (clickTimes.length && now - clickTimes[0] > 2500) clickTimes.shift();
    if (cur.id === 'sleep') { setState('idle', { quiet: true }); say(pickOne(lines('wake'))); return; }
    if (clickTimes.length >= 5) { clickTimes.length = 0; if (onGround()) setState('angry'); say(pickOne(lines('angry'))); return; }
    Sound.chirp(2);
    say(pickOne(lines('click')), 1600);
    hopT = 0;
  }

  // ---------- 菜单命令 ----------
  api.onMenu(async (cmd, arg) => {
    if (cmd === 'settings') { settings = arg; await applySettings(); }
    else if (cmd === 'action') startAction(arg);
    else if (cmd === 'import-need-setup') {
      say(`看到 ${arg.count} 个新素材啦～\n要先下载抠图工具：\n右键 → 真实素材 → 下载自动抠图工具`, 7000);
    } else if (cmd === 'setup-progress') {
      say(arg.stage, 30000);
    } else if (cmd === 'setup-done') {
      say(arg.ok ? '抠图工具准备好啦！' : '下载失败了，检查一下网络再试试', 4000);
    } else if (cmd === 'import-start') {
      say(`在学新素材：${shortName(arg.name)}` + (arg.left ? `\n（后面还有 ${arg.left} 个）` : ''), 4000);
    } else if (cmd === 'import-progress') {
      // 不刷屏：只在空闲状态偶尔报一下进度
      if (!bubble.classList.contains('show') && ['idle', 'look', 'preen', 'eat'].includes(cur.id) && Math.random() < 0.15) {
        say(`学习中 ${Math.round(arg.progress * 100)}%…`, 1500);
      }
    } else if (cmd === 'import-done') {
      const lines = [];
      if (arg.clips && arg.clips.length) {
        lines.push(`${shortName(arg.name)}：${arg.message || '学会啦'}`);
        if (settings.mode !== 'real') lines.push('右键 → 形象 → 真实 就能看');
      } else {
        lines.push(`${shortName(arg.name)}：${arg.error || '没学会'}`);
      }
      if (arg.hint) lines.push(arg.hint);
      say(lines.join('\n'), 9000);
      if (settings.mode === 'real' && arg.species === settings.species) await applySettings();
    } else if (cmd === 'come-back') {
      env = await api.getEnv();
      pos.x = wa().x + wa().width * 0.7;
      pos.y = wa().y;
      setState('thrown', { vx: 0, vy: 0, quiet: true });
      say('我回来啦！');
    }
  });

  function shortName(n) {
    return n.length > 14 ? n.slice(0, 6) + '…' + n.slice(-6) : n;
  }

  // ---------- 主循环 ----------
  let last = performance.now();
  let sentX = Infinity;
  let sentY = Infinity;

  let paused = false;
  function frame(now) {
    const dt = paused ? 0 : Math.min(0.05, (now - last) / 1000);
    last = now;
    cur.t += dt;
    const b = BEHAVIORS[cur.id];
    if (b.update) b.update(dt, cur.s);

    // 地面动作却悬在空中（比如换了显示器）→ 掉下去
    const airborneOk = ['fly', 'hang', 'drag', 'thrown', 'flutter', 'bite', 'gnaw', 'peekaboo'].includes(cur.id);
    if (!airborneOk && pos.y < groundY() - 2) setState('thrown', { vx: 0, vy: 0, quiet: true });
    // 越界时慢慢挪回来（硬夹会瞬移）；飞行、悬停、被扔的时候各自管边界
    const settle = Math.min(1, dt * 6);
    if (!airborneOk && pos.y > groundY() + 2) pos.y += (groundY() - pos.y) * settle;
    if (!airborneOk) {
      const cx = Math.max(minX(), Math.min(maxX(), pos.x));
      pos.x += (cx - pos.x) * settle;
    }

    if (cur.t >= cur.dur) {
      if (b.next) b.next(cur.s);
      else {
        const n = chooseNext();
        if (n === 'gnaw') { setState('idle', { quiet: true, dur: 3 }); startGnaw(true); }
        else if (n === 'hang') setState('fly', { thenHang: true });
        else setState(n);
      }
    }

    // 姿态
    const p = basePose();
    POSES[cur.id](cur.t, cur.s, p);
    p.tailPaper = family === 'lovebird' ? Math.max(p.tailPaper, tailPaper) : 0;
    p.twigPile = family === 'monk' && onGround() && !['fly', 'flutter', 'gnaw'].includes(cur.id) ? twigPile : 0;
    if (family !== 'cockatiel') p.crest = 0;
    if (hopT < 0.3) { hopT += dt; p.y += -Math.sin((hopT / 0.3) * Math.PI) * 10; }

    // 倒挂/翻回来都转过去，不一下子跳
    const flipTarget = cur.id === 'hang' ? 180 : 0;
    flipAngle += Math.sign(flipTarget - flipAngle) * Math.min(Math.abs(flipTarget - flipAngle), 540 * dt);
    stage.style.transform = (flipAngle ? `rotate(${flipAngle.toFixed(1)}deg) ` : '') + `scaleX(${dir})`;
    bubble.classList.toggle('below', flipAngle > 90);
    if (useReal) real.draw(cur.id, cur.t, p, cur.s.seed);
    else applyCartoon(p);

    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
      console.warn('位置异常，重置', cur.id, pos.x, pos.y);
      pos.x = wa().x + wa().width * 0.7;
      pos.y = groundY();
      setState('idle', { quiet: true });
    }
    if (Math.abs(pos.x - sentX) >= 0.5 || Math.abs(pos.y - sentY) >= 0.5) {
      api.move(pos.x, pos.y);
      sentX = pos.x; sentY = pos.y;
    }
    requestAnimationFrame(frame);
  }

  // 纸条不会一直插着
  setInterval(() => {
    if (tailPaper > 0 && Math.random() < 0.3) tailPaper--;
    if (twigPile > 0 && Math.random() < 0.15) twigPile--;
  }, 60 * 1000);

  await applySettings();
  pos.y = Math.min(pos.y, groundY());
  setState('idle', { quiet: true });
  say(pickOne(lines('click')) + ' 我是' + (SPECIES[settings.species] || SPECIES.roseicollis).name, 2500);
  requestAnimationFrame(frame);

  if (MOCK) window.__petDebug = { setState, cur: () => cur, pause: (v) => { paused = v; }, at: (id, t) => { setState(id, { quiet: true, dur: 99 }); cur.t = t; paused = true; } };
  if (MOCK) buildMockPanel(startAction, async (k, v) => { settings = { ...settings, [k]: v }; await applySettings(); });
})();
