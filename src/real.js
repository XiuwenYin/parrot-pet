// 真实形象：播放 assets/real/<鸟种>/<动作>/ 下抠好图的 PNG 序列。
// 某个动作没素材时，借用相近动作（最后退到 idle）的帧，再叠加整体的位移/旋转/缩放，让它也能"动"。

const REAL_FALLBACK = {
  walk: ['walk', 'idle'],
  fly: ['fly', 'idle'],
  eat: ['eat', 'idle'],
  preen: ['preen', 'idle'],
  scratch: ['scratch', 'preen', 'idle'],
  stretch: ['stretch', 'idle'],
  sing: ['sing', 'idle'],
  dance: ['dance', 'sing', 'idle'],
  paper: ['paper', 'eat', 'idle'],
  look: ['look', 'idle'],
  sleep: ['sleep', 'preen', 'idle'],
  happy: ['happy', 'idle'],
  angry: ['angry', 'idle'],
  drag: ['drag', 'fly', 'idle'],
  thrown: ['thrown', 'fly', 'idle'],
  dizzy: ['dizzy', 'idle'],
  flutter: ['flutter', 'fly', 'idle'],
  mirror: ['mirror', 'sing', 'idle'],
  talk: ['talk', 'sing', 'idle'],
  whistle: ['whistle', 'sing', 'idle'],
  heartwing: ['heartwing', 'stretch', 'idle'],
  headdown: ['headdown', 'happy', 'idle'],
  nest: ['nest', 'eat', 'idle'],
  quake: ['quake', 'idle'],
  nibble: ['nibble', 'bite', 'angry', 'idle'],
  hiss: ['hiss', 'angry', 'idle'],
  fright: ['fright', 'fly', 'idle'],
  peekaboo: ['peekaboo', 'look', 'idle'],
  bite: ['bite', 'angry', 'idle'],
  hang: ['hang', 'idle'],
  gnaw: ['gnaw', 'eat', 'fly', 'idle'],
  idle: ['idle'],
};

function makeReal(canvas) {
  const ctx = canvas.getContext('2d');
  const VB = canvas.width / 200; // 和卡通 viewBox 对齐
  let clips = {};
  const cache = new Map();
  let lastRect = null;

  function img(url) {
    if (!cache.has(url)) {
      const im = new Image();
      im.src = url;
      cache.set(url, im);
    }
    return cache.get(url);
  }

  // clips: { action: [clip, ...] }；同一动作有多段时按 seed 挑一段（同一次动作里保持不变）
  function pick(action, seed) {
    const choose = (id) => clips[id][Math.floor((seed || 0) * clips[id].length) % clips[id].length];
    for (const id of REAL_FALLBACK[action] || [action, 'idle']) if (clips[id]) return { id, clip: choose(id) };
    const any = Object.keys(clips)[0];
    return any ? { id: any, clip: choose(any) } : null;
  }

  return {
    setClips(c) {
      clips = c || {};
      cache.clear();
      // 先把每个动作的第一帧加载上
      Object.values(clips).forEach(list => list.forEach(cl => img(cl.frames[0])));
    },
    hasAny: () => Object.keys(clips).length > 0,

    draw(action, t, p, seed) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const got = pick(action, seed);
      if (!got) return;
      const { clip } = got;
      // 来回播放（乒乓），循环接缝处不会跳
      const n = clip.frames.length;
      const k = Math.floor(t * clip.fps) % Math.max(1, 2 * n - 2);
      const i = n > 1 && k >= n ? 2 * n - 2 - k : k;
      const im = img(clip.frames[i]);
      if (!im.complete || !im.naturalWidth) return;

      // 放进 170x165 的框，脚踩 y=186
      const box = Math.min((170 * VB) / im.naturalWidth, (165 * VB) / im.naturalHeight);
      const w = im.naturalWidth * box;
      const h = im.naturalHeight * box;
      const cx = 102 * VB;
      const footY = (186 + p.y) * VB;

      if (p.shadow > 0) {
        ctx.fillStyle = `rgba(0,0,0,${0.12 * p.shadow})`;
        ctx.beginPath();
        ctx.ellipse(cx, 188 * VB, w * 0.32, 5 * VB, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(cx, footY);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.scale(p.sx * p.puff, p.sy * p.puff);
      if (clip.facing === 'left') ctx.scale(-1, 1);
      ctx.drawImage(im, -w / 2, -h, w, h);
      ctx.restore();
      lastRect = { x: cx - w / 2, y: footY - h, w, h };
    },

    // 命中测试：画出来的图的内切椭圆（canvas 坐标）
    hit(x, y) {
      if (!lastRect) return false;
      const { x: rx, y: ry, w, h } = lastRect;
      const dx = (x - (rx + w / 2)) / (w / 2);
      const dy = (y - (ry + h / 2)) / (h / 2);
      return dx * dx + dy * dy <= 1;
    },
  };
}
