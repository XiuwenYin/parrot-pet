// 每个动作的姿态函数：(t 秒, s 动作状态, pose) → 改 pose。只管"长什么样"，不管位置移动。
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const GNAW_HEAD = 34;
const EAT_CYCLE = 1.6;
const WALK_STEP = 0.9;
const CLIMB_CYCLE = 1.1; // 爬墙一步（勾、拉、蹬）的时长  // 鸭子步一个周期（两只脚各迈一步）  // 吃瓜子一轮的时长（pet.js 用它对齐咔嚓声和掉壳）   // 啃的时候头往下压的角度；对准用的就是这个姿态

// 每 ~3.5 秒眨一次眼
function blink(t, seed = 0) {
  const period = 3.3 + (seed % 1) * 1.4;
  const k = (t + seed * 7) % period;
  return k < 0.13 ? Math.abs(k - 0.065) / 0.065 : 1;
}

// 把头扭到背后（理毛、睡觉、塞纸条都用）
function headToBack(p, depth = 1) {
  p.headFlip = -1;
  p.headRot = -18 * depth;
  p.headX = -14 * depth;
  p.headY = 18 * depth;
}

const POSES = {
  idle(t, s, p) {
    if (s.front) { p.front = true; p.headX = -12; }
    p.sy = 1 + 0.018 * Math.sin(t * 2.4);
    p.sx = 1 - 0.01 * Math.sin(t * 2.4);
    // 慢慢歪头、偶尔回正
    p.headRot = 12 * Math.sin(t * 0.8 + s.seed * 5) * (Math.sin(t * 0.33 + s.seed) > 0 ? 1 : 0.25);
    p.eye = blink(t, s.seed);
    p.tail = 2 * Math.sin(t * 3);
  },

  // 走路：鹦鹉在地上是两脚交替、身子摇摇摆摆地走（鸭子步）；s.hop 为真时是小跳（虎皮偶尔这样）
  walk(t, s, p) {
    p.eye = blink(t, s.seed);
    if (s.hop) {
      const ph = (t % 0.34) / 0.34;
      p.y = -Math.sin(ph * Math.PI) * 8;
      p.rot = 5;
      p.sy = ph < 0.1 ? 0.94 : 1;
      p.headRot = -4 * Math.sin(ph * TAU);
      p.tail = 6 * Math.sin(ph * TAU);
      return;
    }
    const ph = (t % WALK_STEP) / WALK_STEP;             // 一个周期：先迈远处的脚，再迈近处的脚
    const a = Math.sin(ph * TAU);
    const liftL = ph < 0.5 ? Math.sin(ph * 2 * Math.PI) : 0;
    const liftR = ph >= 0.5 ? Math.sin((ph - 0.5) * 2 * Math.PI) : 0;
    p.legL = 3.5 * liftL;
    p.legLX = 4 * Math.cos(ph * TAU);                    // 两只脚前后交替
    p.legR = 3.5 * liftR;
    p.legRX = -4 * Math.cos(ph * TAU);
    p.rot = 4 + 4 * a;                                   // 一步一摇
    p.y = -1.5 * Math.abs(a);
    p.headRot = -5 * a;
    p.tail = -7 * a;
  },

  fly(t, s, p) {
    if (s.phase === 'crouch') {
      p.sy = 0.86; p.sx = 1.06; p.wing = 25; p.rot = 6;
      return;
    }
    p.wing = 95 + 55 * Math.sin(t * TAU * 7);
    p.tuckFeet = true;
    p.crest = 0.1;   // 飞的时候冠羽被风压平
    p.rot = s.lean || 0;
    p.headRot = -6;
    p.tail = -8;
    p.shadow = 0;
    p.eye = blink(t, s.seed);
    if (s.phase === 'land') { p.wing = 130 + 15 * Math.sin(t * TAU * 10); p.tuckFeet = false; p.rot = -10; }
  },

  // 吃瓜子：俯身 → 啄 → 叼起来坐回 → 嗑（嘴快速开合、头小晃）→ 再俯身。每轮 EAT_CYCLE 秒，全身都参与
  eat(t, s, p) {
    p.seeds = true;
    const c = t % EAT_CYCLE;
    const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
    let down;                                   // 0 = 坐直，1 = 俯身到底
    if (c < 0.45) down = sm(c / 0.45);
    else if (c < 0.6) down = 1;
    else if (c < 0.95) down = 1 - sm((c - 0.6) / 0.35);
    else down = 0;
    const jab = c >= 0.45 && c < 0.6 ? Math.sin((c - 0.45) / 0.15 * Math.PI) : 0;
    const chew = c >= 0.95 ? 1 : 0;
    p.rot = 3 + 20 * down;
    p.headRot = -6 + 56 * down + 10 * jab + chew * 4 * Math.sin(t * TAU * 2.2);
    p.headY = 3 * down + 2 * jab;
    p.headX = 2 * down;
    p.sy = 1 - 0.05 * down + chew * 0.012 * Math.sin(t * TAU * 7);
    p.sx = 1 + 0.03 * down;
    p.tail = 14 * down;                         // 俯身时尾巴翘起来
    p.wing = 6 * down;
    p.legL = 0; p.legR = 0;
    p.jaw = chew ? 11 * Math.abs(Math.sin(t * TAU * 6.5)) : 8 * jab;
    p.eye = chew ? 0.82 + 0.18 * blink(t, s.seed) : blink(t, s.seed);
    // 每隔一轮挪一下脚
    if (Math.floor(t / EAT_CYCLE) % 2 === 1 && c > 1.1 && c < 1.4) p.legL = 4 * Math.sin((c - 1.1) / 0.3 * Math.PI);
  },

  preen(t, s, p) {
    headToBack(p, 1);
    p.headRot += 6 * Math.sin(t * TAU * 3);
    p.headY += 2 * Math.sin(t * TAU * 1.5);
    p.wing = -6 + 4 * Math.sin(t * TAU * 1.5);
    p.puff = 1.03;
    p.eye = 0.7;
  },

  scratch(t, s, p) {
    p.scratchFoot = 0.01 + 3 * Math.sin(t * TAU * 14);
    p.headRot = 22 + 3 * Math.sin(t * TAU * 14);
    p.eye = 0.35;
    p.rot = -4;
    p.wing = -6;
  },

  stretch(t, s, p) {
    if (t < 1.3) {
      p.wing = 42 * clamp(t / 0.4, 0, 1);
      p.legL = 4; p.rot = -5;
      p.eye = 0.5;
    } else {
      const k = clamp((t - 1.3) / 0.3, 0, 1);
      p.wing = 42 + (150 - 42) * k + 6 * Math.sin(t * 9);
      p.sy = 1 + 0.06 * k;
      p.headRot = -10 * k;
      p.eye = 0.4;
    }
  },

  sing(t, s, p) {
    p.crest = 0.6;
    p.jaw = 16 * Math.abs(Math.sin(t * TAU * 3));
    p.headRot = -14 + 6 * Math.sin(t * TAU * 1.5);
    p.y = -2 * Math.abs(Math.sin(t * TAU * 1.5));
    p.puff = 1 + 0.02 * Math.sin(t * TAU * 3);
    p.eye = blink(t, s.seed);
  },

  dance(t, s, p) {
    const b = Math.sin(t * TAU * 2);
    p.headRot = 18 * b;
    p.headX = 6 * b;
    p.rot = 6 * Math.sin(t * TAU);
    p.y = -Math.abs(b) * 6;
    p.wing = 12 + 18 * Math.abs(b);
    p.legL = b > 0 ? 3 : 0;
    p.legR = b < 0 ? 3 : 0;
    p.eye = blink(t, s.seed);
  },

  paper(t, s, p) {
    if (t < 1.8) {
      // 啄纸
      const peck = Math.pow(Math.max(0, Math.sin(t * TAU * 1.8)), 3);
      p.paperGround = true;
      p.rot = 14;
      p.headRot = 30 + 20 * peck;
      p.jaw = 12 * peck;
      p.beakPaper = t > 1.2;
    } else if (t < 2.8) {
      // 叼着纸条抬头
      p.beakPaper = true;
      p.headRot = -10 + 4 * Math.sin(t * 8);
    } else {
      // 塞到屁股的羽毛里
      headToBack(p, 1.15);
      p.headY += 4 * Math.sin(t * TAU * 2);
      p.beakPaper = t < 3.9;
      p.wing = -10;
    }
    p.eye = blink(t, s.seed);
  },

  look(t, s, p) {
    p.crest = 0.75;
    // 慢慢左右歪头（平滑过渡，不再一下一下跳）
    const tilt = 16 * Math.sin(t * TAU / 2.8);
    if (s.front) {
      p.front = true;
      p.headX = -12;
      p.headRot = clamp(tilt + (s.lookTilt || 0) * 0.4, -24, 24);
    } else {
      p.headRot = clamp((s.lookTilt || 0) + tilt, -40, 40);
    }
    p.eye = blink(t, s.seed);
    p.sy = 1 + 0.015 * Math.sin(t * 2.4);
  },

  // 犯困（眼皮越来越沉、脑袋一点一点）→ 慢慢把头转到背后埋进羽毛 → 睡着（单脚站、呼吸慢）
  sleep(t, s, p) {
    p.crest = 0;
    const DROWSY = 2.6, TUCK = 1.0;
    if (t < DROWSY) {
      const k = t / DROWSY;
      const nod = Math.pow(Math.max(0, Math.sin(t * TAU * 0.85)), 4);
      p.eye = Math.max(0.12, 1 - 0.8 * k - 0.35 * nod * k);
      p.headRot = 4 + 10 * k + 16 * nod * k;
      p.headY = 3 * nod * k;
      p.puff = 1 + 0.06 * k;
      p.crest = 0.35 * (1 - k);
      return;
    }
    const k = Math.min(1, (t - DROWSY) / TUCK);
    const e = k * k * (3 - 2 * k);
    // 从犯困的低头姿势插值到"头埋到背后"
    p.headFlip = 1 - 2 * e;
    p.headRot = 14 + (-18.9 - 14) * e;
    p.headX = -14.7 * e;
    p.headY = 18.9 * e;
    p.puff = 1.06;
    p.headPuff = 1 + 0.04 * e;
    p.eye = 0.12 - 0.04 * e;
    p.sy = 1 + 0.025 * Math.sin(t * TAU / 4) * e;
    // 埋好头之后才把一只脚收进肚子
    const leg = Math.max(0, (t - DROWSY - TUCK) / 0.6);
    p.legR = 14 * Math.min(1, leg);
    p.legRX = -4 * Math.min(1, leg);
  },

  // 醒来：头从背上抬出来 → 迷糊地眨眼 → 打哈欠、伸翅膀 → 抖抖羽毛
  wake(t, s, p) {
    const out = Math.min(1, t / 0.7);
    const e = out * out * (3 - 2 * out);
    p.headFlip = -1 + 2 * e;
    p.headRot = -18.9 + (18.9 - 6) * e;
    p.headX = -14.7 * (1 - e);
    p.headY = 18.9 * (1 - e);
    p.puff = 1.06 - 0.06 * e;
    p.crest = 0.5 * e;
    p.eye = t < 0.7 ? 0.1 : 0.4 + 0.45 * Math.abs(Math.sin((t - 0.7) * TAU * 1.6));
    // 打哈欠
    if (t > 0.9 && t < 1.7) {
      const y = Math.sin(Math.PI * (t - 0.9) / 0.8);
      p.jaw = 24 * y;
      p.headRot -= 14 * y;
      p.eye = Math.min(p.eye, 1 - 0.8 * y);
    }
    // 伸一下翅膀
    if (t > 1.2 && t < 2.0) p.wing = 42 * Math.sin(Math.PI * (t - 1.2) / 0.8);
    // 抖羽毛
    if (t > 2.0) {
      const k = Math.min(1, (t - 2.0) / 0.7);
      p.puff = 1 + 0.12 * (1 - k);
      p.rot = 7 * Math.sin(t * TAU * 9) * (1 - k);
      p.headRot += 8 * Math.sin(t * TAU * 9 + 1) * (1 - k);
      p.eye = 1;
      p.crest = 0.5 + 0.4 * (1 - k);
    }
  },

  happy(t, s, p) {
    p.crest = 0.55;
    p.happyEyes = true;
    p.blush = 0.75;
    p.puff = 1.05;
    p.rot = 4 * Math.sin(t * 10);
    p.headRot = 10 * Math.sin(t * 6);
  },

  angry(t, s, p) {
    p.crest = 1;
    p.puff = 1.14;
    p.headPuff = 1.1;
    p.jaw = 18;
    p.rot = 12;
    p.headRot = 10 + 4 * Math.sin(t * 40);
    p.wing = 14;
    p.tail = 12;
  },


  drag(t, s, p) {
    p.crest = 1;
    p.rot = clamp(-(s.vx || 0) * 0.025, -35, 35);
    p.wing = 100 + 50 * Math.sin(t * TAU * 9);
    p.legL = 4 * Math.max(0, Math.sin(t * 20));
    p.legR = 4 * Math.max(0, -Math.sin(t * 20));
    p.jaw = 10;
    p.shadow = 0;
    if (s.warned) {
      // 生气了：炸毛、张嘴、甩头
      p.puff = 1.1; p.headPuff = 1.08;
      p.jaw = 14 + 8 * Math.abs(Math.sin(t * TAU * 4));
      p.headRot = 12 * Math.sin(t * TAU * 5);
    }
  },

  bite(t, s, p) {
    // 猛地低头一口
    const k = Math.min(1, t / 0.12);
    p.puff = 1.12; p.headPuff = 1.1;
    p.headRot = 45 * k + 6 * Math.sin(t * 60);
    p.headX = 10 * k; p.headY = 8 * k;
    p.jaw = t < 0.15 ? 26 : 26 * Math.abs(Math.sin(t * TAU * 6));
    p.wing = 60 + 40 * Math.sin(t * TAU * 8);
    p.shadow = 0;
  },

  flutter(t, s, p) {
    // 张开翅膀慢慢落，脚伸出来准备着陆
    p.wing = 110 + 40 * Math.sin(t * TAU * 5);
    p.rot = -6 + 3 * Math.sin(t * TAU * 1.1);
    p.tail = -12;
    p.headRot = -8;
    p.shadow = 0;
    p.eye = blink(t, s.seed);
  },

  // 悬停在图标旁边探头啃：翅膀小幅扑动，头往前下方伸，嘴一张一合，隔一会儿用力一扯
  gnaw(t, s, p) {
    const cyc = t % 1.1;
    const tug = cyc > 0.85 ? Math.sin((cyc - 0.85) / 0.25 * Math.PI) : 0;
    p.wing = 95 + 35 * Math.sin(t * TAU * 6);
    p.tuckFeet = true;
    p.rot = 16;
    p.headRot = GNAW_HEAD - 14 * tug;
    p.headX = 4; p.headY = 6;
    p.jaw = 6 + 14 * Math.abs(Math.sin(t * TAU * 4));
    p.tail = -10;
    p.shadow = 0;
    p.eye = 0.75;
  },

  // 伸长腿站高：好奇、警觉时腿一下子伸直，露出平时藏在羽毛里的"大长腿"，左右看看再蹲回去
  tall(t, s, p) {
    const up = clamp(t / 0.35, 0, 1), down = clamp((t - 2.6) / 0.4, 0, 1);
    const e = (x) => x * x * (3 - 2 * x);
    p.legExt = e(up) * (1 - e(down));
    p.sy = 1 + 0.03 * p.legExt;
    p.headRot = p.legExt * 12 * Math.sin(t * TAU * 0.7);
    p.crest = 0.4 + 0.5 * p.legExt;
    p.eye = blink(t, s.seed) * (1 + 0.1 * p.legExt);
    p.puff = 1 - 0.03 * p.legExt;                      // 站直时羽毛贴紧
  },

  walkto(t, s, p) { POSES.walk(t, {}, p); },

  // 爬墙（画面上整只鸟转成竖直、脚朝墙；这里的"前方"就是往上，"脚那边"就是墙）：
  // 嘴往前伸、低头勾住墙 → 身子往上拉 → 两只脚交替往上蹬。嘴当第三只脚用。
  climb(t, s, p) {
    // 身子竖着贴墙（舞台整体往后仰一点），脚往前蹬住墙；
    // 一个循环：脖子往上伸、嘴张开 → 勾住墙往下一压、身子被拉上去 → 两只脚轮流往上挪
    const c = t % CLIMB_CYCLE;
    const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
    const reach = c < 0.35 ? sm(c / 0.35) : c < 0.75 ? 1 - sm((c - 0.35) / 0.4) : 0;
    const hook = c < 0.35 ? 0 : c < 0.75 ? sm((c - 0.35) / 0.15) : 1 - sm((c - 0.75) / 0.35);
    p.headY = -7 * reach;
    p.headX = 5 * reach;
    p.headRot = -22 * reach + 26 * hook;               // 先仰头够高处，勾住后低头把身子拉上来
    p.jaw = reach > 0.5 && hook < 0.2 ? 10 * reach : 0;
    p.rot = 3 * hook;
    p.tail = 12;                                       // 尾巴往下抵着墙撑住
    p.wing = 6 + 6 * hook;
    p.legLX = 12; p.legRX = 14;                        // 脚往前伸到墙上
    const step = c >= 0.75 ? (c - 0.75) / (CLIMB_CYCLE - 0.75) : -1;
    const alt = Math.floor(t / CLIMB_CYCLE) % 2;
    if (step >= 0) {
      const lift = Math.sin(step * Math.PI) * 6;
      if (alt) p.legL = lift; else p.legR = lift;
    }
    p.shadow = 0;
    p.eye = blink(t, s.seed);
  },

  // ---------- 各家族的习性动作 ----------

  // 虎皮：对着小镜子点头、碎碎念，时不时用嘴碰一下镜子
  mirror(t, s, p) {
    p.mirror = true;
    const tap = (t % 1.8) > 1.5 ? Math.sin(((t % 1.8) - 1.5) / 0.3 * Math.PI) : 0;
    const bob = Math.sin(t * TAU * 2.4);
    p.headRot = 8 + 6 * bob + 24 * tap;
    p.headX = 4 * tap;
    p.rot = 4 + 6 * tap;
    p.y = -Math.abs(bob) * 2;
    p.jaw = 8 * Math.abs(Math.sin(t * TAU * 5));
    p.eye = blink(t, s.seed);
  },

  // 说话：嘴随音节一张一合，脑袋配合着歪
  talk(t, s, p) {
    const syl = Math.abs(Math.sin(t * TAU * 3.2)) * (Math.sin(t * TAU * 0.7) > -0.6 ? 1 : 0.2);
    p.jaw = 14 * syl;
    p.headRot = -6 + 10 * Math.sin(t * TAU * 0.6);
    p.puff = 1 + 0.03 * syl;
    p.crest = 0.65;
    p.eye = blink(t, s.seed);
  },

  // 玄凤吹口哨：抬头、嘴微张、身子跟着节奏晃
  whistle(t, s, p) {
    const beat = Math.sin(t * TAU * 1.2);
    p.headRot = -18 + 5 * beat;
    p.jaw = 5 + 4 * Math.abs(Math.sin(t * TAU * 2.4));
    p.rot = 3 * beat;
    p.y = -1.5 * Math.abs(beat);
    p.puff = 1.03;
    p.crest = 0.7 + 0.2 * Math.abs(beat);
    p.eye = blink(t, s.seed);
  },

  // 玄凤心形翅膀：挺胸、两翅张开往前包（侧面看是翅膀高举成弧形）
  heartwing(t, s, p) {
    const k = Math.min(1, t / 0.5);
    p.wing = 128 * k + 4 * Math.sin(t * TAU * 1.5);
    p.sy = 1 + 0.05 * k;
    p.puff = 1.06;
    p.headRot = -10;
    p.crest = 0.95;
    p.front = t > 0.6;
    p.headX = p.front ? -12 : 0;
    p.happyEyes = false;
    p.eye = blink(t, s.seed);
  },

  // 玄凤低头讨挠：把脑袋低下来凑过来，眼睛眯着
  headdown(t, s, p) {
    const k = Math.min(1, t / 0.6);
    p.headRot = 48 * k + 4 * Math.sin(t * TAU * 0.8);
    p.headY = 8 * k;
    p.headX = 4 * k;
    p.rot = 8 * k;
    p.puff = 1.05;
    p.crest = 0.35;
    p.eye = 0.35;
  },

  // 玄凤 Peekaboo：缩下去只露冠羽，再"噌"地冒出来（位置移动在 pet.js 里）
  peekaboo(t, s, p) {
    p.crest = 1;
    p.eye = s.popped ? 1.1 : blink(t, s.seed);
    p.jaw = s.popped ? 14 : 0;
    p.headRot = s.popped ? -10 : 6;
    p.happyEyes = !!s.popped && Math.floor(t * 3) % 3 === 0;
    p.shadow = 0;
  },

  // 和尚叼树枝搭窝：先在前面啄起一根，抬头，再扭头放到身后的树枝堆上
  nest(t, s, p) {
    if (t < 1.4) {
      const peck = Math.pow(Math.max(0, Math.sin(t * TAU * 1.6)), 3);
      p.twigGround = t < 1.0;
      p.beakTwig = t >= 1.0;
      p.rot = 14;
      p.headRot = 30 + 20 * peck;
      p.jaw = 10 * peck;
    } else if (t < 2.4) {
      p.beakTwig = true;
      p.headRot = -8 + 4 * Math.sin(t * 8);
    } else {
      headToBack(p, 1.2);
      p.headY += 10;
      p.beakTwig = t < 3.3;
      p.rot = -6;
    }
    p.eye = blink(t, s.seed);
  },

  // 和尚抖：低着身子、半张翅膀快速抖动
  quake(t, s, p) {
    p.rot = 6 + 3.5 * Math.sin(t * TAU * 11);
    p.headRot = 14 + 3 * Math.sin(t * TAU * 11 + 1);
    p.wing = 22 + 6 * Math.sin(t * TAU * 11);
    p.puff = 1.07;
    p.sy = 0.96;
    p.jaw = 6;
    p.eye = 0.6;
  },

  // 虎皮被拎太久：轻轻啄一口，不疼
  nibble(t, s, p) {
    const k = Math.min(1, t / 0.15);
    p.headRot = 30 * k + 3 * Math.sin(t * 40);
    p.headX = 5 * k;
    p.jaw = t < 0.2 ? 12 : 12 * Math.abs(Math.sin(t * TAU * 5));
    p.wing = 80 + 30 * Math.sin(t * TAU * 8);
    p.shadow = 0;
  },

  // 玄凤被拎太久：冠羽全竖、张嘴哈气、张翅
  hiss(t, s, p) {
    p.crest = 1;
    p.jaw = 22;
    p.headRot = 20;
    p.headX = 6;
    p.puff = 1.1;
    p.wing = 70 + 25 * Math.sin(t * TAU * 6);
    p.shadow = 0;
  },

  // 玄凤夜惊：突然惊醒乱扑腾
  fright(t, s, p) {
    const k = t < 1.8 ? 1 : Math.max(0, 1 - (t - 1.8) / 1.2);
    p.crest = 1;
    p.wing = 100 * k + 50 * k * Math.sin(t * TAU * 9);
    p.rot = 8 * k * Math.sin(t * TAU * 3.3);
    p.y = -6 * k * Math.abs(Math.sin(t * TAU * 2.1));
    p.eye = 1.15;
    p.jaw = 10 * k;
    p.tail = 10 * k * Math.sin(t * TAU * 4);
  },

  thrown(t, s, p) {
    p.crest = 1;
    p.rot = s.spin || 0;
    p.wing = 110 + 45 * Math.sin(t * TAU * 10);
    p.eye = 0.3;
    p.jaw = 14;
    p.shadow = 0;
  },

  dizzy(t, s, p) {
    p.crest = 0.9;
    p.xEyes = true;
    p.rot = 7 * Math.sin(t * 4);
    p.headRot = 12 * Math.sin(t * 4 + 1);
    p.wing = 25;
  },

  hang(t, s, p) {
    p.wing = Math.sin(t * 0.7) > 0.85 ? 100 + 50 * Math.sin(t * TAU * 8) : 8;
    p.headRot = 15 * Math.sin(t * 1.2);
    p.eye = blink(t, s.seed);
    p.shadow = 0;
  },
};
