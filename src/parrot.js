// 插画风鹦鹉：圆滚滚的身形 + 水彩质感（手绘抖边、纸纹、晕染），全部用 SVG 画。
// 各种鹦鹉共用一套部件和转轴（所以所有动作通用），外形差异由 SHAPES 里的参数决定：
// 体型、尾巴长短、头和嘴的大小，以及冠羽、蜡膜、喉斑、头部波浪纹、胸前鳞片纹、腮斑等特征。
// 坐标系：viewBox 0 0 200 200，鸟面朝右，脚踩在 y≈185。

const PARROT_PIVOT = {
  feet: [100, 185],
  neck: [110, 108],
  shoulder: [92, 104],
  jaw: [144, 84],
  eye: [128, 70],
  tail: [70, 166],
  crest: [118, 44],
};

const SHAPES = {
  // scale：整只鸟的高矮胖瘦；tail：short 短 / mid 中等偏宽 / long 细长 / xlong 特别长
  // 牡丹：圆滚滚、大头、大嘴、短尾
  lovebird: { head: { s: 1.05, y: 80 }, body: { cx: 98, cy: 132, rx: 52, ry: 50 }, wing: { sx: 1, sy: 1 },
    beak: { s: 1, dx: 0, dy: 0 }, tail: 'short', scale: { x: 1, y: 1 }, legTop: 171 },
  // 虎皮：苗条、小头小嘴（嘴大半藏在羽毛里）、长尾；蜡膜、喉斑、头背波浪纹、黑边翅膀
  budgie: { head: { s: 0.84, y: 88 }, body: { cx: 101, cy: 138, rx: 36, ry: 47 }, wing: { sx: 0.84, sy: 1.14 }, ringR: 7.6,
    beak: { s: 0.62, dx: -6, dy: 8 }, tail: 'long', scale: { x: 0.95, y: 1 }, legTop: 170,
    cere: true, throatSpots: true, stripes: true, scallopDark: true },
  // 玄凤：修长——身子高而窄、脖子长（头更高）、翅膀和尾巴都长；冠羽、橙色腮斑、翅膀白斑
  cockatiel: { head: { s: 0.88, y: 66 }, body: { cx: 102, cy: 121, rx: 35, ry: 53 }, wing: { sx: 0.8, sy: 1.12 },
    beak: { s: 0.72, dx: -4, dy: 5 }, tail: 'xlong', scale: { x: 0.95, y: 1.05 }, legTop: 163, crest: true, cheekSpot: true, wingBar: true },
  // 和尚：敦实——大头、胸脯饱满、身子宽，尾巴中等偏宽；灰脸灰胸带鳞片纹
  monk: { head: { s: 1.06, y: 84 }, body: { cx: 97, cy: 136, rx: 51, ry: 48 }, wing: { sx: 1, sy: 1.02 },
    beak: { s: 0.95, dx: -1, dy: 1 }, tail: 'mid', scale: { x: 1.03, y: 0.97 }, legTop: 172, breastScallops: true },
  // 葵花凤头：大个子、通体白；一大撮往前卷的黄冠羽，深色大嘴，眼圈一圈淡蓝白的裸皮，耳羽一抹淡黄
  cockatoo: { head: { s: 1.0, y: 78 }, body: { cx: 99, cy: 132, rx: 50, ry: 52 }, wing: { sx: 1, sy: 1.06 }, ringR: 10.5,
    beak: { s: 1.1, dx: 0, dy: 1 }, tail: 'mid', scale: { x: 1.08, y: 1.08 }, legTop: 171, crest: 'cockatoo', cheekSpot: true },
  // 凯克：矮壮、大圆头、短方尾；白肚子、黄大腿
  caique: { head: { s: 1.03, y: 84 }, body: { cx: 98, cy: 136, rx: 50, ry: 47 }, wing: { sx: 0.98, sy: 0.98 },
    beak: { s: 0.9, dx: 0, dy: 2 }, tail: 'short', scale: { x: 1.02, y: 0.96 }, legTop: 172, thighs: true },
  // 非洲灰：一身灰色鳞片纹、眼睛周围一大圈白色裸皮、浅黄眼珠、黑嘴、短短的大红尾巴
  grey: { head: { s: 1.0, y: 80 }, body: { cx: 98, cy: 133, rx: 47, ry: 50 }, wing: { sx: 1, sy: 1.04 }, ringR: 12.5,
    beak: { s: 1.04, dx: 0, dy: 1 }, tail: 'short', scale: { x: 1.03, y: 1.03 }, legTop: 171, breastScallops: true },
};

// k<0 变暗，k>0 变亮
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map(c =>
    Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k));
  return '#' + ch.map(v => v.toString(16).padStart(2, '0')).join('');
}

// 带脖子画法（"一颗豆子"）：头小一点、抬高一截，露出脖子；头、脖子、身子共用一条外轮廓
function shapeOf(shapeId, neckStyle) {
  const S = SHAPES[shapeId] || SHAPES.lovebird;
  if (!neckStyle) return S;
  return { ...S, head: { s: S.head.s * 0.9, y: S.head.y - 15 } };
}

function parrotSVG(shapeId, p) {
  const NS = p.neckStyle !== false;   // 默认都用一颗豆子的画法；neckStyle:false 回到旧画法
  const S = shapeOf(shapeId, NS);
  const B = S.body;
  const line = (c) => `stroke="${shade(c, -0.38)}" stroke-opacity="0.45" stroke-width="1.3"`;
  // 带脖子画法：各部分自己不描边，外轮廓由最底下一层"剪影"统一描（内部的线被上面的填色盖住）
  const ownLine = (c) => (NS ? '' : line(c));
  const silLine = (c) => `stroke="${shade(c, -0.38)}" stroke-opacity="0.45" stroke-width="2.6"`;
  const cheek = p.cheek || '#ff8fa3';
  const ring = p.eyeRing
    ? `<circle cx="128" cy="70" r="${S.ringR || 9}" fill="${p.eyeRing}" stroke="${shade(p.eyeRing, -0.2)}" stroke-opacity="0.4" stroke-width="0.8"/>`
    : '';
  const collar = p.collar
    ? `<path d="M78,100 C90,120 134,126 152,102 C153,118 136,134 114,134 C94,134 80,120 78,100 Z" fill="${p.collar}" opacity="0.96" filter="url(#soft1)"/>`
    : '';
  const headT = `translate(114 ${S.head.y}) scale(${S.head.s}) translate(-114 -74)`;
  const beakT = `translate(${144 + S.beak.dx} ${76 + S.beak.dy}) scale(${S.beak.s}) translate(-144 -76)`;
  const wingT = `translate(92 104) scale(${S.wing.sx} ${S.wing.sy}) translate(-92 -104)`;

  // 挠头时抬起来的腿：大腿从肚子前下方抬起，膝盖往前顶出身体，小腿弯回来，脚停在脸颊下面（头会低下来凑过去）
  const scratchLeg = (() => {
    const R = 36 * S.head.s;
    const fx = 121, fy = S.head.y + R * 0.8;                 // 脚：脸颊下方
    const tx = B.cx + B.rx * 0.5, ty = B.cy + B.ry * 0.08;    // 大腿根
    const kx = B.cx + B.rx - 1, ky = ty - (ty - fy) * 0.3;    // 膝盖：刚好顶到肚子边
    return `<g id="footFront">
    <ellipse cx="${tx}" cy="${ty}" rx="11" ry="13" fill="${shade(p.belly, -0.06)}" transform="rotate(-35 ${tx} ${ty})" filter="url(#soft1)" opacity="0.95"/>
    <path d="M${tx + 4},${ty - 4} Q${kx - 2},${ty - 2} ${kx},${ky} Q${kx - 1},${(ky + fy) / 2} ${fx + 3},${fy + 2}" stroke="${p.feet}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M${fx},${fy} Q${fx + 5},${fy - 5} ${fx + 8},${fy - 3} M${fx},${fy} Q${fx + 5},${fy + 1} ${fx + 7},${fy + 4} M${fx},${fy} Q${fx - 3},${fy - 5} ${fx - 2},${fy - 9}"
          stroke="${p.feet}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
  </g>`;
  })();

  // 单脚抓着吃（大中型鹦鹉的习惯）：大腿从肚子前抬起，脚举到嘴下面，脚趾攥着一颗坚果
  const holdLeg = (() => {
    const R = 36 * S.head.s;
    const fx = 138, fy = S.head.y + R * 1.0;
    const tx = B.cx + B.rx * 0.78, ty = B.cy - B.ry * 0.3;     // 大腿藏在胸前羽毛里，只露一小截脚
    const kx = B.cx + B.rx + 2, ky = ty - (ty - fy) * 0.4;
    return `<g id="footHold">
    <path d="M${tx + 5},${ty - 2} Q${kx},${ty - 3} ${kx},${ky} L${fx - 2},${fy + 4}" stroke="${p.feet}" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <ellipse cx="${fx + 2}" cy="${fy - 3}" rx="6.5" ry="5" fill="#B98A55" stroke="#7D5A33" stroke-width="0.9"/>
    <path d="M${fx - 3},${fy + 2} Q${fx + 2},${fy - 9} ${fx + 8},${fy - 6} M${fx - 3},${fy + 2} Q${fx + 4},${fy + 3} ${fx + 9},${fy} M${fx - 3},${fy + 2} Q${fx - 6},${fy - 4} ${fx - 3},${fy - 8}"
          stroke="${p.feet}" stroke-width="2.8" stroke-linecap="round" fill="none"/>
  </g>`;
  })();

  const TAILS = {
    short: `<path d="M72,158 L40,181 Q43,191 54,187 L84,170 Z" fill="url(#tailGrad)" ${line(p.tail)}/>
       <path d="M70,166 L48,184" stroke="${shade(p.tail, -0.35)}" stroke-width="1" opacity="0.4"/>`,
    mid: `<path d="M76,152 L26,182 Q24,194 36,193 L88,170 Z" fill="url(#tailGrad)" ${line(p.tail)}/>
       <path d="M78,160 L32,188" stroke="${shade(p.tail, -0.35)}" stroke-width="1.1" opacity="0.45"/>`,
    long: `<path d="M80,154 L16,188 Q16,197 26,196 L90,168 Z" fill="url(#tailGrad)" ${line(p.tail)}/>
       <path d="M80,161 L24,192" stroke="${shade(p.tail, -0.35)}" stroke-width="1" opacity="0.45"/>`,
    // 玄凤：又细又长，中间两根尾羽更长
    xlong: `<path d="M86,150 L2,190 Q0,197 9,197 L94,166 Z" fill="url(#tailGrad)" ${line(p.tail)}/>
       <path d="M84,156 L8,193" stroke="${shade(p.tail, -0.35)}" stroke-width="1" opacity="0.45"/>`,
  };
  const tail = TAILS[S.tail] || TAILS.short;

  // 冠羽（玄凤）：三根弯羽毛，转轴在头顶，crest 参数决定竖起多少
  // 葵花凤头的冠：五根宽羽，从头顶长出、尖端往前卷；放下时贴在后脑，只露出翘起的黄尖
  const cockatooFeathers = (front) => [0, 1, 2, 3, 4].map((i) => {
    const c = p.crest || '#F5D24A';
    if (front) {
      const a = (i - 2) * 16, bx = 114 + (i - 2) * 5, by = 44, h = 40 - Math.abs(i - 2) * 6;
      return `<path d="M${bx - 5},${by} C${bx - 7},${by - h * 0.6} ${bx - 2},${by - h} ${bx + 4},${by - h - 2} C${bx + 2},${by - h * 0.6} ${bx + 5},${by - h * 0.3} ${bx + 5},${by} Z"
        transform="rotate(${a} ${bx} ${by})" fill="${shade(c, (i % 2) * 0.08)}" ${line(c)}/>`;
    }
    const bx = 104 + i * 5, by = 47 - i * 0.6, h = 46 - i * 5;
    return `<path d="M${bx - 5},${by} C${bx - 14},${by - h * 0.55} ${bx - 8},${by - h * 1.02} ${bx + 14},${by - h * 0.9} C${bx + 4},${by - h * 0.8} ${bx + 2},${by - h * 0.45} ${bx + 6},${by} Z"
      fill="${shade(c, (i % 2) * 0.08 - 0.03 * i)}" ${line(c)}/>`;
  }).join('');
  // 平时：一根"蒜苗"——几根冠羽并成一束，从额头往后上方翘着；激动时才炸开成扇形
  const cc = p.crest || '#F5D24A';
  const crestSide = S.crest === 'cockatoo' ? `<g id="crest">
      <g id="crestRest">
        <!-- 平时：整束冠羽从额头顺着头顶贴到后脑，尖端在脑后往上翘 -->
        <path d="M140,48 C131,36 114,29 97,33 C87,35 81,40 77,35 C74,30 71,24 64,16 C73,22 79,30 83,38 C85,44 84,49 82,54 C90,44 104,39 118,39 C127,40 134,43 140,48 Z" fill="${cc}" ${line(cc)}/>
        <path d="M134,41 C122,34 106,34 92,38 M88,40 C82,36 78,30 72,22" stroke="${shade(cc, 0.28)}" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="0.85"/>
      </g>
      <g id="crestFan">${cockatooFeathers(false)}</g></g>` : S.crest ? `<g id="crest">
      <path d="M120,48 C114,30 104,16 92,8 C104,12 116,22 126,40 Z" fill="${p.crest || p.face}" ${line(p.crest || p.face)}/>
      <path d="M116,48 C106,34 94,26 82,22 C96,22 110,30 122,44 Z" fill="${shade(p.crest || p.face, -0.06)}" ${line(p.crest || p.face)}/>
      <path d="M124,46 C122,30 116,18 108,10 C118,16 126,28 130,42 Z" fill="${shade(p.crest || p.face, 0.08)}" ${line(p.crest || p.face)}/>
    </g>` : '';
  const crestFront = S.crest === 'cockatoo' ? `<g id="crestFront">
      <g id="crestRestFront"><path d="M104,42 C104,34 109,29 114,28 C119,29 124,34 124,42 C120,38 116,36 114,36 C111,36 107,38 104,42 Z" fill="${cc}" ${line(cc)}/></g>
      <g id="crestFanFront">${cockatooFeathers(true)}</g></g>` : S.crest ? `<g id="crestFront">
      <path d="M110,44 C106,28 104,16 98,6 C108,14 114,28 116,42 Z" fill="${p.crest || p.face}" ${line(p.crest || p.face)}/>
      <path d="M118,42 C120,26 124,16 130,6 C130,18 126,30 122,44 Z" fill="${shade(p.crest || p.face, 0.06)}" ${line(p.crest || p.face)}/>
      <path d="M114,42 C113,26 114,12 114,2 C118,14 118,28 117,42 Z" fill="${shade(p.crest || p.face, -0.05)}" ${line(p.crest || p.face)}/>
    </g>` : '';
  // 虎皮头纹：顺着后脑弧度一圈圈排的短弧线（像一片片小羽毛的边），外圈粗、内圈细、交错排列，
  // 颜色用头色压暗，往额头和脸的方向渐渐消失
  const arcRows = (cx, cy, rows) => rows.map((row, ri) => {
    const rad = (d) => d * Math.PI / 180;
    // 长一点的细弧，偶尔断开；每段半径和长短有一点点变化，看着像羽毛纹理而不是虚线
    const stepDeg = (19 / row.r) * 180 / Math.PI;
    let d = '';
    let k = ri * 7 + 3;
    const jitter = () => { k = (k * 9301 + 49297) % 233280; return k / 233280 - 0.5; };
    for (let a = row.a0 + (ri % 2 ? stepDeg / 2 : 0); a < row.a1; a += stepDeg) {
      const span = ((14 + 4 * jitter()) / row.r) * 180 / Math.PI;
      const a2 = Math.min(row.a1, a + span);
      const rr = row.r + 0.8 * jitter();
      const x1 = cx + rr * Math.cos(rad(a)), y1 = cy + rr * Math.sin(rad(a));
      const x2 = cx + rr * Math.cos(rad(a2)), y2 = cy + rr * Math.sin(rad(a2));
      d += `M${x1.toFixed(1)},${y1.toFixed(1)} A${rr.toFixed(1)},${rr.toFixed(1)} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)} `;
    }
    return `<path d="${d}" stroke-width="${row.w}"/>`;
  }).join('');
  const barColor = p.stripe || shade(p.head, -0.75);
  const stripes = S.stripes ? `<g clip-path="url(#headClip)"><g mask="url(#stripeFade)" stroke="${barColor}" fill="none" stroke-linecap="round" opacity="0.68">
      ${arcRows(116, 78, [
        { r: 34, a0: 140, a1: 282, w: 1.35 }, { r: 30, a0: 148, a1: 284, w: 1.25 }, { r: 26, a0: 158, a1: 286, w: 1.15 },
        { r: 22, a0: 172, a1: 288, w: 1.0 }, { r: 18, a0: 190, a1: 288, w: 0.9 }, { r: 14, a0: 212, a1: 286, w: 0.8 },
      ])}
    </g></g>` : '';
  const stripesFront = S.stripes ? `<g clip-path="url(#headClip)"><g mask="url(#stripeFadeFront)" stroke="${barColor}" fill="none" stroke-linecap="round" opacity="0.6">
      ${arcRows(114, 80, [{ r: 38, a0: 205, a1: 335, w: 1.4 }, { r: 33.5, a0: 212, a1: 328, w: 1.2 }, { r: 29, a0: 222, a1: 318, w: 1 }])}
    </g></g>` : '';
  // 虎皮的蜡膜（鼻子那块）
  const cere = S.cere ? `<ellipse cx="146" cy="70" rx="5.5" ry="4" fill="${p.cere || '#6c8fd8'}" ${line(p.cere || '#6c8fd8')}/>` : '';
  const cereFront = S.cere ? `<ellipse cx="114" cy="80" rx="7" ry="3.6" fill="${p.cere || '#6c8fd8'}" ${line(p.cere || '#6c8fd8')}/>` : '';
  // 虎皮喉部黑点 + 脸颊紫斑
  const throat = S.throatSpots ? `
      <ellipse cx="141" cy="94" rx="3.2" ry="5.2" fill="${p.cheekPatch || '#6a5cc8'}" transform="rotate(-12 141 94)"/>
      <circle cx="137" cy="103.5" r="2.1" fill="${p.throatSpot || '#1e1e1e'}"/><circle cx="129.5" cy="107" r="2.1" fill="${p.throatSpot || '#1e1e1e'}"/><circle cx="121.5" cy="108" r="2" fill="${p.throatSpot || '#1e1e1e'}"/>` : '';
  const throatFront = S.throatSpots ? `
      <ellipse cx="92" cy="96" rx="3.5" ry="5" fill="${p.cheekPatch || '#6a5cc8'}" opacity="0.85"/>
      <ellipse cx="136" cy="96" rx="3.5" ry="5" fill="${p.cheekPatch || '#6a5cc8'}" opacity="0.85"/>
      <circle cx="104" cy="106" r="2.2" fill="${p.throatSpot || '#1e1e1e'}"/><circle cx="114" cy="108" r="2.2" fill="${p.throatSpot || '#1e1e1e'}"/><circle cx="124" cy="106" r="2.2" fill="${p.throatSpot || '#1e1e1e'}"/>` : '';
  // 玄凤的橙色腮斑
  const cheekSpot = S.cheekSpot && p.cheekSpot ? `<circle cx="133" cy="88" r="9" fill="${p.cheekSpot}" opacity="0.92" filter="url(#soft1)"/>` : '';
  const cheekSpotFront = S.cheekSpot && p.cheekSpot ? `<circle cx="92" cy="90" r="8" fill="${p.cheekSpot}" opacity="0.92" filter="url(#soft1)"/>
      <circle cx="136" cy="90" r="8" fill="${p.cheekSpot}" opacity="0.92" filter="url(#soft1)"/>` : '';
  // 翅膀花纹：虎皮是黑边，其它是浅色的羽毛轮廓
  const scallopColor = S.scallopDark ? (p.scallop || '#1e1e1e') : shade(p.wing, -0.35);
  const scallopOpacity = S.scallopDark ? 0.85 : 0.45;
  const scallopWidth = S.scallopDark ? 1.5 : 1.1;
  // 虎皮翅膀：一片片水滴形的小覆羽（深色芯 + 浅色边），一排排错开，越靠肩膀越小
  const budgieWing = (() => {
    const out = [];
    const rows = 9;
    // 从下往上画，让上面一排压住下面一排的根部，形成叠压的鳞片
    for (let r = rows - 1; r >= 0; r--) {
      const y = 106 + r * 6.2;
      const size = 7 + r * 0.6;                       // 往下越来越大
      const right = 103 - r * 2.4;                    // 每排的右端（贴着翅膀前缘）
      const left = 58 + Math.max(0, 4 - r) * 4.5;     // 每排的左端
      const step = size * 0.95;
      for (let x = right - (r % 2 ? step / 2 : 0); x > left; x -= step) {
        const w = size * 0.62, h = size;
        out.push(`<path d="M${x.toFixed(1)},${(y - h * 0.45).toFixed(1)} C${(x + w).toFixed(1)},${(y - h * 0.45).toFixed(1)} ${(x + w * 0.9).toFixed(1)},${(y + h * 0.35).toFixed(1)} ${(x - w * 0.15).toFixed(1)},${(y + h * 0.6).toFixed(1)} C${(x - w * 0.9).toFixed(1)},${(y + h * 0.3).toFixed(1)} ${(x - w).toFixed(1)},${(y - h * 0.45).toFixed(1)} ${x.toFixed(1)},${(y - h * 0.45).toFixed(1)} Z" transform="rotate(18 ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
      }
    }
    return `<g clip-path="url(#wingClip)" fill="${p.scallop || '#1e1e1e'}" stroke="${shade(p.wing, 0.3)}" stroke-width="1.5" stroke-linejoin="round" opacity="0.9">${out.join('')}</g>`;
  })();
  // 虎皮长飞羽：深色、带浅色羽缘
  const budgieFlights = `<g clip-path="url(#wingClip)">
      <path d="M58,152 C58,168 62,178 68,183 C76,174 84,164 90,152 C80,158 68,158 58,152 Z" fill="${shade(p.scallop || '#1e1e1e', 0.18)}" opacity="0.9"/>
      <path d="M63,158 L68,180 M70,157 L73,176 M77,156 L78,170 M84,155 L83,164" stroke="${shade(p.wing, 0.35)}" stroke-width="1.1" stroke-linecap="round" opacity="0.8"/>
    </g>`;
  const wingBar = S.wingBar ? `<path d="M96,104 C84,110 74,124 70,142 C76,138 84,124 100,112 Z" fill="${p.wingBar || '#f4f2ec'}" opacity="0.95"/>` : '';
  const breast = S.breastScallops ? `<g clip-path="url(#bodyClip)" opacity="0.5">
      <path d="M112,104 q4,4 8,0 q4,4 8,0 q4,4 8,0 M106,114 q4,4 8,0 q4,4 8,0 q4,4 8,0 q4,4 8,0 M108,124 q4,4 8,0 q4,4 8,0 q4,4 8,0 q4,4 8,0 M112,134 q4,4 8,0 q4,4 8,0 q4,4 8,0"
            stroke="${shade(p.belly, -0.3)}" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    </g>` : `<path d="M114,124 q3,3 6,0 M126,134 q3,3 6,0 M112,140 q3,3 6,0 M124,152 q3,3 6,0 M110,158 q3,3 6,0 M134,146 q2.5,2.5 5,0"
          stroke="${shade(p.belly, -0.35)}" stroke-width="1" fill="none" opacity="0.35" stroke-linecap="round"/>`;
  // 和尚的灰色胸口一直连到脸
  const bellyBlob = S.breastScallops
    ? `<ellipse cx="122" cy="128" rx="30" ry="40" fill="${p.belly}" opacity="0.85" filter="url(#soft3)"/>`
    : `<ellipse cx="${B.cx + 22}" cy="${B.cy + 8}" rx="${B.rx * 0.5}" ry="${B.ry * 0.64}" fill="${p.belly}" opacity="0.5" filter="url(#soft3)"/>`;

  return `
<defs>
  <!-- 水彩：抖边 + 低频晕染 + 纸纹 -->
  <filter id="paint" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="wob"/>
    <feDisplacementMap in="SourceGraphic" in2="wob" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="shape"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="11" result="blot"/>
    <feColorMatrix in="blot" type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.16  0 0 0 0 0.14  0 0 0 -0.3 0.17" result="blotA"/>
    <feComposite in="blotA" in2="shape" operator="in" result="blotIn"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="1" seed="5" result="grain"/>
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.97  0 0 0 -0.45 0.24" result="grainA"/>
    <feComposite in="grainA" in2="shape" operator="in" result="grainIn"/>
    <feMerge><feMergeNode in="shape"/><feMergeNode in="blotIn"/><feMergeNode in="grainIn"/></feMerge>
  </filter>
  <filter id="soft1" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.2"/></filter>
  <filter id="soft4" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.5"/></filter>
  <filter id="soft3" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>
  <clipPath id="headClip"><circle cx="114" cy="74" r="36"/></clipPath>
  <!-- 虎皮波浪纹：后脑最清楚，往脸和额头方向渐渐消失 -->
  <linearGradient id="stripeFadeGrad" gradientUnits="userSpaceOnUse" x1="90" y1="70" x2="122" y2="52">
    <stop offset="0" stop-color="#fff"/><stop offset="0.45" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
  </linearGradient>
  <mask id="stripeFade" maskUnits="userSpaceOnUse" x="60" y="30" width="80" height="80">
    <rect x="60" y="30" width="80" height="80" fill="url(#stripeFadeGrad)"/>
  </mask>
  <linearGradient id="stripeFadeFrontGrad" gradientUnits="userSpaceOnUse" x1="0" y1="38" x2="0" y2="62">
    <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
  </linearGradient>
  <mask id="stripeFadeFront" maskUnits="userSpaceOnUse" x="60" y="30" width="110" height="40">
    <rect x="60" y="30" width="110" height="40" fill="url(#stripeFadeFrontGrad)"/>
  </mask>
  <!-- 头的下缘渐隐，和身体融成一团 -->
  <linearGradient id="headFadeGrad" gradientUnits="userSpaceOnUse" x1="0" y1="90" x2="0" y2="112">
    <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
  </linearGradient>
  <mask id="headFade" maskUnits="userSpaceOnUse" x="60" y="20" width="120" height="110">
    <rect x="60" y="20" width="120" height="110" fill="url(#headFadeGrad)"/>
  </mask>
  <clipPath id="wingClip"><path d="M92,100 C70,102 53,124 53,148 C53,164 59,175 67,181 C84,169 102,145 104,118 C105,108 100,101 92,100 Z"/></clipPath>
  <clipPath id="bodyClip"><ellipse cx="${B.cx}" cy="${B.cy}" rx="${B.rx}" ry="${B.ry}"/></clipPath>

  <radialGradient id="bodyGrad" cx="0.62" cy="0.42" r="0.72">
    <stop offset="0" stop-color="${shade(p.belly, 0.15)}"/>
    <stop offset="0.45" stop-color="${p.body}"/>
    <stop offset="1" stop-color="${shade(p.body, -0.2)}"/>
  </radialGradient>
  <radialGradient id="headGrad" cx="0.6" cy="0.36" r="0.75">
    <stop offset="0" stop-color="${shade(p.head, 0.18)}"/>
    <stop offset="0.6" stop-color="${p.head}"/>
    <stop offset="1" stop-color="${NS ? p.head : shade(p.head, -0.18)}"/>
  </radialGradient>
  <linearGradient id="faceGrad" x1="0" y1="0" x2="0.2" y2="1">
    <stop offset="0" stop-color="${p.forehead}"/>
    <stop offset="0.45" stop-color="${p.face}"/>
    <stop offset="1" stop-color="${shade(p.face, 0.12)}"/>
  </linearGradient>
  <linearGradient id="wingGrad" x1="0.9" y1="0" x2="0.1" y2="1">
    <stop offset="0" stop-color="${shade(p.wing, 0.14)}"/>
    <stop offset="0.55" stop-color="${p.wing}"/>
    <stop offset="1" stop-color="${shade(p.wing, -0.2)}"/>
  </linearGradient>
  <linearGradient id="flightGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${p.flight}" stop-opacity="0.7"/>
    <stop offset="1" stop-color="${shade(p.flight, -0.25)}"/>
  </linearGradient>
  <linearGradient id="beakGrad" x1="0.2" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="${shade(p.beak, 0.35)}"/>
    <stop offset="0.5" stop-color="${p.beak}"/>
    <stop offset="1" stop-color="${p.beakDark}"/>
  </linearGradient>
  <!-- 带脖子画法：脸上的颜色不按圆硬裁，四周软边、往下越来越淡，没有"下颌线" -->
  <filter id="maskBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.5"/></filter>
  <linearGradient id="headSoftGrad" gradientUnits="userSpaceOnUse" x1="0" y1="82" x2="0" y2="114">
    <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
  </linearGradient>
  <mask id="headSoftFull" maskUnits="userSpaceOnUse" x="60" y="20" width="120" height="110">
    <circle cx="114" cy="74" r="35.5" fill="url(#headFadeGrad)" filter="url(#maskBlur)"/>
  </mask>
  <mask id="headSoft" maskUnits="userSpaceOnUse" x="60" y="20" width="120" height="110">
    <circle cx="114" cy="74" r="35" fill="url(#headSoftGrad)" filter="url(#maskBlur)"/>
  </mask>
  <!-- 领圈只画在脖子和身体范围内 -->
  <clipPath id="neckClip"><path id="neckClipPath"/><ellipse cx="${B.cx}" cy="${B.cy}" rx="${B.rx}" ry="${B.ry}"/></clipPath>
  <radialGradient id="neckGrad" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="60">
    <stop offset="0" stop-color="${p.head}"/>
    <stop offset="0.4" stop-color="${p.head}"/>
    <stop offset="0.6" stop-color="${p.body}"/>
    <stop offset="0.8" stop-color="${p.body}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="tailGrad" x1="1" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${p.tail}"/>
    <stop offset="1" stop-color="${shade(p.tail, -0.25)}"/>
  </linearGradient>
</defs>

<g id="ground">
  <ellipse id="shadow" cx="100" cy="188" rx="44" ry="5" fill="#3a3030" opacity="0.14" filter="url(#soft3)"/>
  <g id="seeds" filter="url(#paint)">
    <ellipse cx="152" cy="185" rx="3.4" ry="1.9" fill="#5a4636"/>
    <ellipse cx="160" cy="186" rx="3.4" ry="1.9" fill="#eadfc6" transform="rotate(25 160 186)"/>
    <ellipse cx="168" cy="184.5" rx="3.4" ry="1.9" fill="#5a4636" transform="rotate(-15 168 184)"/>
    <ellipse cx="175" cy="186" rx="3.4" ry="1.9" fill="#eadfc6"/>
    <ellipse cx="146" cy="187" rx="2" ry="1.2" fill="#cdb894"/>
  </g>
  <g id="paperGround" filter="url(#paint)">
    <path d="M142,186 L186,186 L184,178 L144,180 Z" fill="#fbfaf4" stroke="#cfcabd" stroke-width="1"/>
  </g>
  <!-- 小镜子（虎皮照镜子用） -->
  <g id="mirror" filter="url(#paint)">
    <path d="M170,186 L170,170" stroke="#a88a62" stroke-width="3"/>
    <ellipse cx="170" cy="186" rx="9" ry="2.5" fill="#a88a62"/>
    <circle cx="170" cy="152" r="17" fill="#d9b25a" stroke="#a88a62" stroke-width="1.5"/>
    <circle cx="170" cy="152" r="13.5" fill="#cfe6f2"/>
    <path d="M162,146 L168,140 M164,152 L174,142" stroke="#fff" stroke-width="2" opacity="0.8" stroke-linecap="round"/>
    <circle cx="170" cy="172" r="3.5" fill="#e7c25a" stroke="#a88a62" stroke-width="0.8"/>
  </g>
  <!-- 树枝堆（和尚搭窝用），在身后 -->
  <g id="twigPile" filter="url(#paint)">
    <path class="twig" d="M14,186 L52,180" stroke="#8a6440" stroke-width="3" stroke-linecap="round"/>
    <path class="twig" d="M20,180 L58,186" stroke="#7a5636" stroke-width="3" stroke-linecap="round"/>
    <path class="twig" d="M10,182 L44,176 M30,178 L34,172" stroke="#946c46" stroke-width="2.6" stroke-linecap="round"/>
    <path class="twig" d="M18,176 L54,174" stroke="#82603e" stroke-width="2.8" stroke-linecap="round"/>
    <path class="twig" d="M24,172 L50,168 M40,170 L46,164" stroke="#8a6440" stroke-width="2.4" stroke-linecap="round"/>
  </g>
  <path id="twigGround" d="M150,186 L184,182 M170,183 L176,178" stroke="#8a6440" stroke-width="3" stroke-linecap="round" filter="url(#paint)"/>
</g>

<g id="pose" filter="url(#paint)"${NS ? ' data-neckstyle="1"' : ''}>
  <g id="upperBack">
  <g id="tail" class="hit">
    ${tail}
  </g>
  </g>

  <g id="feet">
    <!-- 远处那只脚：在后面、颜色暗一点、略高 -->
    <g id="footL">
      <path id="legLineL" d="M96,${(S.legTop || 171)} L96.5,181.5" stroke="${shade(p.feet, -0.18)}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <path d="M96.5,181.5 Q101.5,181.5 104.5,184.5 M96.5,181.5 Q100.5,183.5 102.5,186.5 M96.5,181.5 Q92.5,182.5 90.5,185"
            stroke="${shade(p.feet, -0.18)}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    </g>
    <!-- 近处那只脚：两趾朝前、一趾朝后 -->
    <g id="footR">
      <path id="legLineR" d="M104,${(S.legTop || 171) + 1} L104.5,183" stroke="${p.feet}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <path d="M104.5,183 Q109.5,183 112.5,186.5 M104.5,183 Q108.5,185.5 110.5,188.5 M104.5,183 Q100,184 98,187"
            stroke="${p.feet}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
    </g>
  </g>

  <g id="upper">
  ${NS ? `<g id="silhouette">
    <ellipse cx="${B.cx}" cy="${B.cy}" rx="${B.rx}" ry="${B.ry}" fill="${p.body}" ${silLine(p.body)}/>
    <path id="neckSil" fill="${p.body}" ${silLine(p.body)}/>
    <g id="headSil"><g transform="translate(114 ${S.head.y}) scale(${S.head.s}) translate(-114 -74)">
      <circle cx="114" cy="74" r="36" fill="url(#neckGrad)" ${silLine(p.head)}/></g></g>
  </g>` : ''}
  <g id="bodyG" class="hit">
    <ellipse cx="${B.cx - B.rx + 12}" cy="150" rx="16" ry="13" fill="${p.rump}" ${line(p.rump)}/>
    <ellipse cx="${B.cx}" cy="${B.cy}" rx="${B.rx}" ry="${B.ry}" fill="url(#bodyGrad)" ${ownLine(p.body)}/>
    <g clip-path="url(#bodyClip)">
      ${bellyBlob}
      <ellipse cx="${B.cx - 2}" cy="${B.cy + B.ry}" rx="${B.rx}" ry="14" fill="${shade(p.body, -0.3)}" opacity="0.22" filter="url(#soft3)"/>
    </g>
    ${breast}
    ${S.thighs ? `<ellipse cx="${B.cx + 6}" cy="${B.cy + B.ry * 0.74}" rx="17" ry="9" fill="${p.thigh || p.belly}" opacity="0.95" filter="url(#soft3)"/>` : ''}
  </g>

  ${NS ? '' : collar}

  <!-- 脖子：每帧按头的位置重算，把头和肩膀连成一整块（头低下、伸长、转动都不会"断开"） -->
  ${NS ? `<g id="neck"><path id="neckFill" fill="url(#neckGrad)"/>
    <ellipse id="collarBand" rx="30" ry="${p.collar ? 10 : 16}" fill="${p.collar || shade(p.face, 0.2)}" opacity="${p.collar ? 1 : 0.32}" filter="url(#soft4)" clip-path="url(#neckClip)"/></g>` : ''}

  <g id="wing" class="hit">
   <g transform="${wingT}">
    <path d="M92,100 C70,102 53,124 53,148 C53,164 59,175 67,181 C84,169 102,145 104,118 C105,108 100,101 92,100 Z" fill="url(#wingGrad)" ${line(p.wing)}/>
    ${wingBar}
    ${S.scallopDark ? budgieFlights + budgieWing : `
    <path d="M57,157 C57,168 61,176 67,181 C75,173 82,165 87,156 C78,160 66,160 57,157 Z" fill="url(#flightGrad)"/>
    <path d="M70,124 q6,6 12,0 q6,6 12,0 M64,138 q6,6 12,0 q6,6 12,0 M60,152 q6,6 12,0 q5,5 10,0"
          stroke="${scallopColor}" stroke-width="${scallopWidth}" fill="none" opacity="${scallopOpacity}" stroke-linecap="round"/>
    <path d="M63,162 L67,178 M70,161 L71.5,174 M77,160 L77,168" stroke="${shade(p.flight, -0.35)}" stroke-width="1" opacity="0.5" stroke-linecap="round"/>`}
    <path d="M90,106 C78,110 68,121 63,135" stroke="#fff" stroke-width="2.2" fill="none" opacity="0.28" stroke-linecap="round"/>
   </g>
  </g>

  <g id="head" class="hit">
   <g transform="${headT}">
   <g id="headSide">
    ${crestSide}
    <!-- 下巴往身体上晕开一点，头转动时接缝不生硬 -->
    ${NS ? '' : `<ellipse cx="118" cy="104" rx="26" ry="12" fill="${p.face}" opacity="0.55" filter="url(#soft3)"/>`}
    <circle cx="114" cy="74" r="36" fill="url(#headGrad)" mask="url(#${NS ? 'headSoftFull' : 'headFade'})"/>
    ${NS ? '' : `<path d="M78.9,82 A36,36 0 1 1 149.1,82" fill="none" ${line(p.head)}/>`}
    <!-- 五官：转头时只把它们压扁、淡出，头本身保持圆的（转到一半看到的是后脑勺），脖子不会断 -->
    <g id="headFeat">
    <g ${NS ? 'mask="url(#headSoft)"' : 'clip-path="url(#headClip)"'}>
      <path d="M124,37 C142,38 158,56 157,78 C156,100 142,114 118,116 C104,112 96,100 98,88 C100,78 108,72 112,64 C115,54 116,44 124,37 Z" fill="url(#faceGrad)" filter="url(#${p.faceSoft || 'soft4'})"/>
      <ellipse cx="128" cy="46" rx="16" ry="8" fill="#fff" opacity="0.22" filter="url(#soft3)"/>
    </g>
    ${stripes}
    ${cheekSpot}
    ${throat}
    <ellipse id="blush" cx="135" cy="89" rx="9" ry="5.5" fill="${cheek}" opacity="0.3" filter="url(#soft1)"/>
    <g id="eye">
      ${ring}
      <ellipse cx="128" cy="70" rx="5.6" ry="6.3" fill="${p.eye}"/>
      ${p.pupil ? `<circle cx="128.6" cy="70.4" r="2.9" fill="${p.pupil}"/>` : ''}
      <circle cx="130.2" cy="67.2" r="2.3" fill="#fff"/>
      <circle cx="126.4" cy="72.6" r="1" fill="#fff" opacity="0.8"/>
    </g>
    <path id="eyeHappy" d="M121.5,72 Q128,64 134.5,72" stroke="${p.eye}" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <path id="eyeX" d="M123.5,65.5 L132.5,74.5 M132.5,65.5 L123.5,74.5" stroke="${p.eye}" stroke-width="2.4" stroke-linecap="round"/>
    ${cere}
    <g id="beak" transform="${beakT}">
      <g id="jaw">
        <path d="M143,82 C150,82 155,86 154,92 C149,95.5 144,93 141,87.5 Z" fill="${p.beakDark}" ${line(p.beakDark)}/>
      </g>
      <path d="M140,61 C154,59 163.5,69 162.5,83 C162,89.5 158,93 154.5,91 C154.5,84 150.5,79 142,81.5 C138.5,75 138,67 140,61 Z" fill="url(#beakGrad)" ${line(p.beak)}/>
      <path d="M146,64.5 C153,66 157,71 158.5,77" stroke="#fff" stroke-width="1.6" fill="none" opacity="0.45" stroke-linecap="round"/>
      <rect id="beakPaper" x="150" y="88" width="34" height="5" rx="1" fill="#fbfaf4" stroke="#cfcabd" stroke-width="0.8" transform="rotate(28 150 88)"/>
      <path id="beakTwig" d="M146,90 L196,104 M176,98 L184,90" stroke="#8a6440" stroke-width="3.4" stroke-linecap="round"/>
    </g>
    </g>
   </g>
   <!-- 正脸：盯着你看的时候用 -->
   <g id="headFront">
    ${crestFront}
    ${NS ? '' : `<ellipse cx="114" cy="106" rx="28" ry="12" fill="${p.face}" opacity="0.55" filter="url(#soft3)"/>`}
    <circle cx="114" cy="74" r="36" fill="url(#headGrad)" mask="url(#${NS ? 'headSoftFull' : 'headFade'})"/>
    ${NS ? '' : `<path d="M78.9,82 A36,36 0 1 1 149.1,82" fill="none" ${line(p.head)}/>`}
    <g ${NS ? 'mask="url(#headSoft)"' : 'clip-path="url(#headClip)"'}>
      <ellipse cx="114" cy="86" rx="35" ry="34" fill="url(#faceGrad)" filter="url(#${p.faceSoft || 'soft4'})"/>
      <ellipse cx="114" cy="46" rx="18" ry="8" fill="#fff" opacity="0.2" filter="url(#soft3)"/>
    </g>
    ${stripesFront}
    ${cheekSpotFront}
    ${throatFront}
    <ellipse cx="92" cy="90" rx="8" ry="5" fill="${cheek}" opacity="0.32" filter="url(#soft1)"/>
    <ellipse cx="136" cy="90" rx="8" ry="5" fill="${cheek}" opacity="0.32" filter="url(#soft1)"/>
    <g id="eyesFront">
      ${p.eyeRing ? `<circle cx="99" cy="71" r="8.5" fill="${p.eyeRing}"/><circle cx="129" cy="71" r="8.5" fill="${p.eyeRing}"/>` : ''}
      <ellipse cx="99" cy="71" rx="5.4" ry="6.1" fill="${p.eye}"/>
      <ellipse cx="129" cy="71" rx="5.4" ry="6.1" fill="${p.eye}"/>
      ${p.pupil ? `<circle cx="99" cy="71.4" r="2.8" fill="${p.pupil}"/><circle cx="129" cy="71.4" r="2.8" fill="${p.pupil}"/>` : ''}
      <circle cx="101" cy="68.2" r="2.2" fill="#fff"/>
      <circle cx="131" cy="68.2" r="2.2" fill="#fff"/>
      <circle cx="97.4" cy="73.6" r="0.9" fill="#fff" opacity="0.8"/>
      <circle cx="127.4" cy="73.6" r="0.9" fill="#fff" opacity="0.8"/>
    </g>
    ${cereFront}
    <g transform="translate(114 ${80 + S.beak.dy}) scale(${S.beak.s}) translate(-114 -80)">
      <path d="M104.5,79 C105.5,72.5 122.5,72.5 123.5,79 C123.5,89.5 119.5,97.5 114,101.5 C108.5,97.5 104.5,89.5 104.5,79 Z" fill="url(#beakGrad)" ${line(p.beak)}/>
      <path d="M108.5,94 C111,98.5 117,98.5 119.5,94" stroke="${p.beakDark}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M110,77 C111,82 111,87 110.5,91" stroke="#fff" stroke-width="1.5" fill="none" opacity="0.45" stroke-linecap="round"/>
    </g>
   </g>
   </g>
  </g>

  <g id="tailPaper">
    <rect class="strip" x="28" y="146" width="34" height="5" rx="1" fill="#fbfaf4" stroke="#cfcabd" stroke-width="0.8" transform="rotate(-24 54 148)"/>
    <rect class="strip" x="26" y="155" width="36" height="5" rx="1" fill="#fbfaf4" stroke="#cfcabd" stroke-width="0.8" transform="rotate(-10 54 157)"/>
    <rect class="strip" x="30" y="163" width="32" height="5" rx="1" fill="#fbfaf4" stroke="#cfcabd" stroke-width="0.8" transform="rotate(6 54 165)"/>
  </g>

  ${scratchLeg}
  ${holdLeg}
  <!-- 高抬腿时近处那条腿挪到这里，画在身子前面 -->
  <g id="feetFront"></g>
  </g>
</g>`;
}

// 按姿态算嘴尖在 viewBox 里的位置（啃东西时用来对准）。和 makeCartoon 里的变换保持一致。
function parrotBeakTip(shapeId, p) {
  const S = SHAPES[shapeId] || SHAPES.lovebird;
  const rad = (d) => d * Math.PI / 180;
  // 嘴的缩放 → 头部内层缩放
  let x = 144 + S.beak.dx + (163 - 144) * S.beak.s;
  let y = 76 + S.beak.dy + (86 - 76) * S.beak.s;
  x = 114 + (x - 114) * S.head.s;
  y = S.head.y + (y - 74) * S.head.s;
  // 头：translate(N+h) scale(flip*puff, puff) rotate(r) translate(-N)
  const [nx, ny] = PARROT_PIVOT.neck;
  let vx = x - nx, vy = y - ny;
  const c = Math.cos(rad(p.headRot)), s = Math.sin(rad(p.headRot));
  [vx, vy] = [vx * c - vy * s, vx * s + vy * c];
  vx *= p.headFlip * p.headPuff; vy *= p.headPuff;
  x = vx + nx + p.headX; y = vy + ny + p.headY;
  // 身体：translate(0 y) rotate(rot fx fy-50) translate(F) scale(...) translate(-F)
  const [fx, fy] = PARROT_PIVOT.feet;
  const SC = S.scale || { x: 1, y: 1 };
  x = fx + (x - fx) * p.sx * p.puff * SC.x; y = fy + (y - fy) * p.sy * p.puff * SC.y;
  const c2 = Math.cos(rad(p.rot)), s2 = Math.sin(rad(p.rot));
  const ox = fx, oy = fy - 50;
  [x, y] = [ox + (x - ox) * c2 - (y - oy) * s2, oy + (x - ox) * s2 + (y - oy) * c2];
  return { x, y: y + p.y };
}

// 默认姿态，每个动作只改它关心的字段
function basePose() {
  return {
    y: 0, rot: 0, sx: 1, sy: 1, puff: 1,
    headRot: 0, headX: 0, headY: 0, headFlip: 1, headPuff: 1,
    wing: 0, jaw: 0, eye: 1, happyEyes: false, xEyes: false, blush: 0,
    legL: 0, legR: 0, legRX: 0, tuckFeet: false, tail: 0,
    seeds: false, paperGround: false, beakPaper: false, tailPaper: 0,
    shadow: 1, scratchFoot: 0, holdFoot: false, front: false,
    legExt: 0,              // 伸长腿：0 平常，1 腿全伸直（藏在羽毛里的"大长腿"露出来）
    legLX: 0,               // 远处那只脚往前/后迈的距离
    crest: 0.35,            // 冠羽：0 贴在后脑，1 完全竖起
    mirror: false, beakTwig: false, twigGround: false, twigPile: 0,
  };
}

function makeCartoon(svg, shapeId) {
  const NS = !!svg.querySelector('[data-neckstyle]');
  const SH = shapeOf(shapeId, NS);
  const SC = SH.scale || { x: 1, y: 1 };
  const LEG_TOP = SH.legTop || 171;
  const LEG_LIFT = 15;      // 腿全伸直时身子抬高多少
  const $ = (id) => svg.querySelector('#' + id);
  const els = {
    pose: $('pose'), head: $('head'), wing: $('wing'), jaw: $('jaw'), eye: $('eye'),
    eyeHappy: $('eyeHappy'), eyeX: $('eyeX'), blush: $('blush'),
    footL: $('footL'), footR: $('footR'), feet: $('feet'), tail: $('tail'),
    seeds: $('seeds'), paperGround: $('paperGround'), beakPaper: $('beakPaper'),
    tailPaper: $('tailPaper'), shadow: $('shadow'), footFront: $('footFront'),
    headSide: $('headSide'), headFront: $('headFront'), eyesFront: $('eyesFront'),
    crest: $('crest'), crestFront: $('crestFront'),
    upper: $('upper'), upperBack: $('upperBack'), legLineL: $('legLineL'), legLineR: $('legLineR'),
    mirror: $('mirror'), beakTwig: $('beakTwig'), twigGround: $('twigGround'),
    footHold: $('footHold'), feetFront: $('feetFront'),
    crestRest: $('crestRest'), crestFan: $('crestFan'), crestRestFront: $('crestRestFront'), crestFanFront: $('crestFanFront'),
    neckFill: $('neckFill'), neckSil: $('neckSil'), headSil: $('headSil'), headFeat: $('headFeat'),
    neckGrad: svg.querySelector('radialGradient[id^="neckGrad"]'),
  };
  const strips = [...svg.querySelectorAll('#tailPaper .strip')];
  const twigs = [...svg.querySelectorAll('#twigPile .twig')];
  const P = PARROT_PIVOT;
  const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };

  // 脖子：头（圆）和肩膀（身体上部的圆）之间的外公切线围成的一段，两条边稍微往外鼓一点，显得肉乎乎
  const B = SH.body;
  const HEAD_R = 36 * SH.head.s;
  // 肩膀圆：大一点、贴近身体上半部的弧度，脖子的轮廓才能顺着滑进身体，不出折角
  const BASE = { x: B.cx + 0.1 * B.rx, y: B.cy - 0.12 * B.ry, r: 0.82 * Math.min(B.rx, B.ry) };
  const stops = els.neckGrad ? [...els.neckGrad.querySelectorAll('stop')] : [];
  const neckClipPath = $('neckClipPath'), collarBand = $('collarBand');
  const setNeck = (d) => { els.neckFill.setAttribute('d', d); els.neckSil.setAttribute('d', d); if (neckClipPath) neckClipPath.setAttribute('d', d); };
  // 头的圆心：先按 headT 放好（114, head.y），再绕脖子转、按 headFlip 左右移、平移
  function headCenter(p) {
    const [nx, ny] = P.neck;
    const qx = 114 - nx, qy = SH.head.y - ny;
    const a = p.headRot * Math.PI / 180;
    const rx = qx * Math.cos(a) - qy * Math.sin(a), ry = qx * Math.sin(a) + qy * Math.cos(a);
    return { x: nx + p.headX + rx * p.headFlip * p.headPuff, y: ny + p.headY + ry * p.headPuff };
  }
  function drawNeck(p) {
    const { x: hx, y: hy } = headCenter(p);
    // 脖子和头一样宽：轮廓从头两侧直接顺下去，整只鸟是一颗"豆子"，不在头下面收腰
    const r1 = HEAD_R * p.headPuff, r2 = BASE.r;
    const dx = BASE.x - hx, dy = BASE.y - hy, d = Math.hypot(dx, dy);
    if (d <= Math.abs(r1 - r2) + 0.5) { setNeck(''); return; }
    const th = Math.atan2(dy, dx), al = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / d)));
    const pt = (cx, cy, r, ang) => [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
    const a1 = pt(hx, hy, r1, th + al), b1 = pt(BASE.x, BASE.y, r2, th + al);
    const a2 = pt(hx, hy, r1, th - al), b2 = pt(BASE.x, BASE.y, r2, th - al);
    // 两条边往外鼓：控制点放在边的中点再往外推
    const bulge = (u, v, sgn) => {
      const mx = (u[0] + v[0]) / 2, my = (u[1] + v[1]) / 2;
      const k = 0.06 * Math.hypot(v[0] - u[0], v[1] - u[1]);
      return [mx + Math.cos(th + sgn * Math.PI / 2) * k, my + Math.sin(th + sgn * Math.PI / 2) * k];
    };
    const c1 = bulge(a1, b1, 1), c2 = bulge(a2, b2, -1);
    const f = (q) => q[0].toFixed(1) + ',' + q[1].toFixed(1);
    setNeck(`M${f(a1)} Q${f(c1)} ${f(b1)} L${f(b2)} Q${f(c2)} ${f(a2)} Z`);
    // 颜色从头往身体过渡
    // 颜色按"离头中心多远"：头里面是头色，出了头就是身体色（头转到背后时两侧也不会冒出头色的尖角）
    const GR = HEAD_R * p.headPuff + 30;
    els.neckGrad.setAttribute('cx', hx.toFixed(1)); els.neckGrad.setAttribute('cy', hy.toFixed(1));
    els.neckGrad.setAttribute('r', GR.toFixed(1));
    // 渐变的位置按头的大小算：头底下先是领圈色，再过渡到身体色，最后透明（露出身体本来的明暗）
    const R = HEAD_R * p.headPuff, o = (v) => Math.max(0, Math.min(1, v / GR)).toFixed(3);
    const offs = [o(R * 0.5), o(R * 0.8), o(R + 6), o(R + 28)];
    // 领圈：头底下一条横着的晕染带，垂直于脖子方向
    if (collarBand) {
      const ux = dx / d, uy = dy / d, cd = R + 3;
      collarBand.setAttribute('cx', (hx + ux * cd).toFixed(1));
      collarBand.setAttribute('cy', (hy + uy * cd).toFixed(1));
      collarBand.setAttribute('rx', (r1 * 1.05).toFixed(1));
      collarBand.setAttribute('transform', `rotate(${(Math.atan2(uy, ux) * 180 / Math.PI - 90).toFixed(1)} ${(hx + ux * cd).toFixed(1)} ${(hy + uy * cd).toFixed(1)})`);
    }
    stops.forEach((st, i) => st.setAttribute('offset', offs[i]));
  }

  let legRFront = false;
  return function apply(p) {
    const [fx, fy] = P.feet;
    els.pose.setAttribute('transform',
      `translate(0 ${p.y}) rotate(${p.rot} ${fx} ${fy - 50}) translate(${fx} ${fy}) scale(${p.sx * p.puff * SC.x} ${p.sy * p.puff * SC.y}) translate(${-fx} ${-fy})`);
    const [nx, ny] = P.neck;
    // 头的中心照常跟着 headFlip 连续移动；但头只按正负号镜像，不压扁（压扁会只剩一条缝，和脖子断开）
    const hc = headCenter(p);
    const sg = p.headFlip >= 0 ? 1 : -1, af = Math.abs(p.headFlip);
    const headTf = `translate(${hc.x} ${hc.y}) scale(${sg * p.headPuff} ${p.headPuff}) rotate(${p.headRot}) translate(-114 ${-SH.head.y})`;
    if (els.headFeat) {
      els.headFeat.setAttribute('transform', af < 0.999 ? `translate(114 74) scale(${Math.max(0.05, af).toFixed(3)} 1) translate(-114 -74)` : '');
      const k = Math.max(0, Math.min(1, (af - 0.2) / 0.35));
      els.headFeat.setAttribute('opacity', (k * k * (3 - 2 * k)).toFixed(3));
    }
    els.head.setAttribute('transform', headTf);
    if (els.headSil) els.headSil.setAttribute('transform', headTf);
    els.wing.setAttribute('transform', `rotate(${p.wing} ${P.shoulder[0]} ${P.shoulder[1]})`);
    if (els.neckFill) drawNeck(p);
    els.jaw.setAttribute('transform', `rotate(${p.jaw} ${P.jaw[0]} ${P.jaw[1]})`);
    const [ex, ey] = P.eye;
    els.eye.setAttribute('transform', `translate(${ex} ${ey}) scale(1 ${Math.max(0.08, p.eye)}) translate(${-ex} ${-ey})`);
    const front = p.front && !p.happyEyes && !p.xEyes && !p.beakPaper && !p.beakTwig;
    show(els.headSide, !front);
    show(els.headFront, front);
    els.eyesFront.setAttribute('transform', `translate(0 71) scale(1 ${Math.max(0.08, p.eye)}) translate(0 -71)`);
    show(els.eye, !p.happyEyes && !p.xEyes);
    show(els.eyeHappy, p.happyEyes);
    show(els.eyeX, p.xEyes);
    // 冠羽：0 往后贴，1 竖直
    const c = Math.max(0, Math.min(1, p.crest));
    if (SH.crest === 'cockatoo') {
      // 激动（crest 拉满：尖叫、蹦迪、炸毛、受惊）才炸开：扇形冠羽从后往前竖起来；平时只是一根蒜苗，稍微跟着翘一翘
      const fan = Math.max(0, Math.min(1, (c - 0.9) / 0.1));
      show(els.crestRest, fan < 0.15); show(els.crestRestFront, fan < 0.15);
      show(els.crestFan, fan >= 0.15); show(els.crestFanFront, fan >= 0.15);
      els.crestFan.setAttribute('transform', `rotate(${-60 + 95 * fan} ${P.crest[0]} ${P.crest[1] + 4})`);   // 炸开时往前倾，罩到头顶前面
      els.crestRest.setAttribute('transform', `rotate(${-4 + 6 * Math.min(1, c / 0.6)} 110 50)`);
      if (els.crestFanFront) els.crestFanFront.setAttribute('transform', `translate(114 44) scale(${0.4 + 0.6 * fan}) translate(-114 -44)`);
    } else if (els.crest) els.crest.setAttribute('transform', `rotate(${-62 + 66 * c} ${P.crest[0]} ${P.crest[1]})`);
    if (els.crestFront && SH.crest !== 'cockatoo') els.crestFront.setAttribute('transform', `translate(114 44) scale(1 ${0.35 + 0.65 * c}) translate(-114 -44)`);
    // 腮红常驻淡淡一层，开心时更红
    els.blush.setAttribute('opacity', 0.3 + 0.55 * p.blush);
    // 伸长腿：上半身抬高，腿线跟着拉长，脚趾不动
    const lift = LEG_LIFT * Math.max(0, Math.min(1.5, p.legExt));
    els.upper.setAttribute('transform', lift ? `translate(0 ${-lift})` : '');
    els.upperBack.setAttribute('transform', lift ? `translate(0 ${-lift})` : '');
    // 腿：髋部固定在身子底下，脚抬起来时中间弯出一个往前顶的膝盖（高抬腿），而不是整条腿平移上去
    // （腿线在脚的组里，组被平移了 legX、-legY，所以髋部坐标要反着减回去）
    const legPath = (hx, hy, fx, fy, dx, up) => {
      const x0 = hx - dx, y0 = hy + up;
      if (up < 1.5 || p.kick) return `M${x0.toFixed(1)},${y0.toFixed(1)} L${fx},${fy}`;   // 正步：直腿踢出去
      // 高抬腿：膝盖是最高点，在脚的上方偏前；小腿从膝盖垂下来，脚吊在下面
      const kx = fx + 4 + Math.min(10, up * 0.25), ky = fy - Math.min(22, up * 0.7);
      return `M${x0.toFixed(1)},${y0.toFixed(1)} L${kx.toFixed(1)},${ky.toFixed(1)} L${fx},${fy}`;
    };
    els.legLineL.setAttribute('d', legPath(96, LEG_TOP - lift, 96.5, 181.5, p.legLX, p.legL));
    els.legLineR.setAttribute('d', legPath(104, LEG_TOP + 1 - lift, 104.5, 183, p.legRX, p.legR));
    // 近处那条腿高抬（膝盖要顶到肚子前面）时，挪到身子前面画；放下再挪回去
    const rFront = p.legR > 8;
    if (rFront !== legRFront) { legRFront = rFront; (rFront ? els.feetFront : els.feet).appendChild(els.footR); }
    els.footL.setAttribute('transform', `translate(${p.legLX} ${-p.legL})`);
    els.footR.setAttribute('transform', `translate(${p.legRX} ${-p.legR})`);
    show(els.footR, !p.scratchFoot && !p.holdFoot);
    show(els.footHold, !!p.holdFoot);
    show(els.footFront, !!p.scratchFoot);
    if (p.scratchFoot) els.footFront.setAttribute('transform', `translate(${p.scratchFoot} ${-Math.abs(p.scratchFoot) * 0.6})`);
    show(els.feet, !p.tuckFeet);
    els.tail.setAttribute('transform', `rotate(${p.tail} ${P.tail[0]} ${P.tail[1]})`);
    show(els.seeds, p.seeds);
    show(els.paperGround, p.paperGround);
    show(els.beakPaper, p.beakPaper);
    show(els.mirror, p.mirror);
    show(els.beakTwig, p.beakTwig);
    show(els.twigGround, p.twigGround);
    strips.forEach((s, i) => show(s, i < p.tailPaper));
    twigs.forEach((s, i) => show(s, i < p.twigPile));
    els.shadow.setAttribute('opacity', 0.14 * p.shadow);
  };
}
