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
  // 牡丹：圆滚滚、大头、大嘴、短尾
  lovebird: { head: { s: 1.05, y: 80 }, body: { cx: 98, cy: 132, rx: 52, ry: 50 }, wing: { sx: 1, sy: 1 },
    beak: { s: 1, dx: 0, dy: 0 }, tail: 'short' },
  // 虎皮：苗条、小头小嘴（嘴大半藏在羽毛里）、长尾；蜡膜、喉斑、头背波浪纹、黑边翅膀
  budgie: { head: { s: 0.88, y: 86 }, body: { cx: 100, cy: 136, rx: 40, ry: 46 }, wing: { sx: 0.88, sy: 1.12 },
    beak: { s: 0.62, dx: -6, dy: 8 }, tail: 'long', cere: true, throatSpots: true, stripes: true, scallopDark: true },
  // 玄凤：中等身材、冠羽、橙色腮斑、翅膀上一道白斑、长尾
  cockatiel: { head: { s: 0.92, y: 82 }, body: { cx: 100, cy: 134, rx: 43, ry: 48 }, wing: { sx: 0.9, sy: 1.12 },
    beak: { s: 0.72, dx: -4, dy: 5 }, tail: 'long', crest: true, cheekSpot: true, wingBar: true },
  // 和尚：大头、灰脸灰胸带鳞片纹、长尾
  monk: { head: { s: 1.0, y: 80 }, body: { cx: 98, cy: 132, rx: 48, ry: 50 }, wing: { sx: 0.95, sy: 1.08 },
    beak: { s: 0.95, dx: -1, dy: 1 }, tail: 'long', breastScallops: true },
};

// k<0 变暗，k>0 变亮
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map(c =>
    Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k));
  return '#' + ch.map(v => v.toString(16).padStart(2, '0')).join('');
}

function parrotSVG(shapeId, p) {
  const S = SHAPES[shapeId] || SHAPES.lovebird;
  const B = S.body;
  const line = (c) => `stroke="${shade(c, -0.38)}" stroke-opacity="0.45" stroke-width="1.3"`;
  const cheek = p.cheek || '#ff8fa3';
  const ring = p.eyeRing
    ? `<circle cx="128" cy="70" r="9" fill="${p.eyeRing}" stroke="${shade(p.eyeRing, -0.2)}" stroke-opacity="0.4" stroke-width="0.8"/>`
    : '';
  const collar = p.collar
    ? `<path d="M78,100 C90,120 134,126 152,102 C153,118 136,134 114,134 C94,134 80,120 78,100 Z" fill="${p.collar}" opacity="0.96" filter="url(#soft1)"/>`
    : '';
  const headT = `translate(114 ${S.head.y}) scale(${S.head.s}) translate(-114 -74)`;
  const beakT = `translate(${144 + S.beak.dx} ${76 + S.beak.dy}) scale(${S.beak.s}) translate(-144 -76)`;
  const wingT = `translate(92 104) scale(${S.wing.sx} ${S.wing.sy}) translate(-92 -104)`;

  const tail = S.tail === 'long'
    ? `<path d="M80,154 L16,188 Q16,197 26,196 L90,168 Z" fill="url(#tailGrad)" ${line(p.tail)}/>
       <path d="M80,161 L24,192" stroke="${shade(p.tail, -0.35)}" stroke-width="1" opacity="0.45"/>`
    : `<path d="M72,158 L40,181 Q43,191 54,187 L84,170 Z" fill="url(#tailGrad)" ${line(p.tail)}/>
       <path d="M70,166 L48,184" stroke="${shade(p.tail, -0.35)}" stroke-width="1" opacity="0.4"/>`;

  // 冠羽（玄凤）：三根弯羽毛，转轴在头顶，crest 参数决定竖起多少
  const crestSide = S.crest ? `<g id="crest">
      <path d="M120,48 C114,30 104,16 92,8 C104,12 116,22 126,40 Z" fill="${p.crest || p.face}" ${line(p.crest || p.face)}/>
      <path d="M116,48 C106,34 94,26 82,22 C96,22 110,30 122,44 Z" fill="${shade(p.crest || p.face, -0.06)}" ${line(p.crest || p.face)}/>
      <path d="M124,46 C122,30 116,18 108,10 C118,16 126,28 130,42 Z" fill="${shade(p.crest || p.face, 0.08)}" ${line(p.crest || p.face)}/>
    </g>` : '';
  const crestFront = S.crest ? `<g id="crestFront">
      <path d="M110,44 C106,28 104,16 98,6 C108,14 114,28 116,42 Z" fill="${p.crest || p.face}" ${line(p.crest || p.face)}/>
      <path d="M118,42 C120,26 124,16 130,6 C130,18 126,30 122,44 Z" fill="${shade(p.crest || p.face, 0.06)}" ${line(p.crest || p.face)}/>
      <path d="M114,42 C113,26 114,12 114,2 C118,14 118,28 117,42 Z" fill="${shade(p.crest || p.face, -0.05)}" ${line(p.crest || p.face)}/>
    </g>` : '';
  // 虎皮头背后的细密波浪纹：只在头的轮廓里、眼睛后面，越靠近脸越淡（额头和脸是干净的）
  const wavy = (x0, x1, y, amp = 1.4, wl = 5) => {
    let d = `M${x0},${y}`;
    for (let x = x0; x < x1; x += wl) d += ` q${wl / 4},${-amp} ${wl / 2},0 t${wl / 2},0`;
    return d;
  };
  const barPaths = [];
  for (let y = 42; y <= 100; y += 5.6) barPaths.push(wavy(74, 124, y.toFixed(1), 1.1, 7));
  const stripes = S.stripes ? `<g clip-path="url(#headClip)"><g mask="url(#stripeFade)">
      <path d="${barPaths.join(' ')}" stroke="${p.stripe || '#1e1e1e'}" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="0.5"/>
    </g></g>` : '';
  const stripesFront = S.stripes ? `<g clip-path="url(#headClip)"><g mask="url(#stripeFadeFront)">
      <path d="${barPaths.slice(0, 6).join(' ')} ${barPaths.slice(0, 6).map(d => d.replace(/^M74/, 'M104')).join(' ')}" stroke="${p.stripe || '#1e1e1e'}" stroke-width="1.1" fill="none" stroke-linecap="round" opacity="0.5"/>
    </g></g>` : '';
  // 虎皮的蜡膜（鼻子那块）
  const cere = S.cere ? `<ellipse cx="146" cy="70" rx="5.5" ry="4" fill="${p.cere || '#6c8fd8'}" ${line(p.cere || '#6c8fd8')}/>` : '';
  const cereFront = S.cere ? `<ellipse cx="114" cy="80" rx="7" ry="3.6" fill="${p.cere || '#6c8fd8'}" ${line(p.cere || '#6c8fd8')}/>` : '';
  // 虎皮喉部黑点 + 脸颊紫斑
  const throat = S.throatSpots ? `
      <ellipse cx="139" cy="95" rx="4" ry="5.5" fill="${p.cheekPatch || '#6a5cc8'}" opacity="0.85"/>
      <circle cx="132" cy="104" r="2.3" fill="#1e1e1e"/><circle cx="124" cy="107" r="2.3" fill="#1e1e1e"/><circle cx="116" cy="106" r="2" fill="#1e1e1e"/>` : '';
  const throatFront = S.throatSpots ? `
      <ellipse cx="92" cy="96" rx="3.5" ry="5" fill="${p.cheekPatch || '#6a5cc8'}" opacity="0.85"/>
      <ellipse cx="136" cy="96" rx="3.5" ry="5" fill="${p.cheekPatch || '#6a5cc8'}" opacity="0.85"/>
      <circle cx="104" cy="106" r="2.2" fill="#1e1e1e"/><circle cx="114" cy="108" r="2.2" fill="#1e1e1e"/><circle cx="124" cy="106" r="2.2" fill="#1e1e1e"/>` : '';
  // 玄凤的橙色腮斑
  const cheekSpot = S.cheekSpot && p.cheekSpot ? `<circle cx="133" cy="88" r="9" fill="${p.cheekSpot}" opacity="0.92" filter="url(#soft1)"/>` : '';
  const cheekSpotFront = S.cheekSpot && p.cheekSpot ? `<circle cx="92" cy="90" r="8" fill="${p.cheekSpot}" opacity="0.92" filter="url(#soft1)"/>
      <circle cx="136" cy="90" r="8" fill="${p.cheekSpot}" opacity="0.92" filter="url(#soft1)"/>` : '';
  // 翅膀花纹：虎皮是黑边，其它是浅色的羽毛轮廓
  const scallopColor = S.scallopDark ? (p.scallop || '#1e1e1e') : shade(p.wing, -0.35);
  const scallopOpacity = S.scallopDark ? 0.85 : 0.45;
  const scallopWidth = S.scallopDark ? 1.5 : 1.1;
  // 虎皮翅膀：一排排错开的小鳞片（黑羽镶浅色边）
  const budgieScallops = (() => {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      const y = 112 + r * 6;
      const x0 = 86 - r * 3.2 + (r % 2 ? 3 : 0);
      const n = Math.max(2, 4 - Math.floor(r / 3));
      let d = `M${x0},${y}`;
      for (let i = 0; i < n; i++) d += ' q3,3.6 6,0';
      rows.push(d);
    }
    return rows.join(' ');
  })();
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
  <linearGradient id="stripeFadeGrad" gradientUnits="userSpaceOnUse" x1="86" y1="74" x2="114" y2="44">
    <stop offset="0" stop-color="#fff"/><stop offset="0.35" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
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
  <clipPath id="bodyClip"><ellipse cx="${B.cx}" cy="${B.cy}" rx="${B.rx}" ry="${B.ry}"/></clipPath>

  <radialGradient id="bodyGrad" cx="0.62" cy="0.42" r="0.72">
    <stop offset="0" stop-color="${shade(p.belly, 0.15)}"/>
    <stop offset="0.45" stop-color="${p.body}"/>
    <stop offset="1" stop-color="${shade(p.body, -0.2)}"/>
  </radialGradient>
  <radialGradient id="headGrad" cx="0.6" cy="0.36" r="0.75">
    <stop offset="0" stop-color="${shade(p.head, 0.18)}"/>
    <stop offset="0.6" stop-color="${p.head}"/>
    <stop offset="1" stop-color="${shade(p.head, -0.18)}"/>
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

<g id="pose" filter="url(#paint)">
  <g id="tail" class="hit">
    ${tail}
  </g>

  <g id="feet">
    <g id="footL">
      <path d="M88,172 L88,183" stroke="${p.feet}" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M79,186.5 Q83,182.5 88,183 Q93,182.5 97,186.5 M88,183 L87.5,187.5" stroke="${p.feet}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
    </g>
    <g id="footR">
      <path d="M108,172 L108,183" stroke="${p.feet}" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M99,186.5 Q103,182.5 108,183 Q113,182.5 117,186.5 M108,183 L107.5,187.5" stroke="${p.feet}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
    </g>
  </g>

  <g id="bodyG" class="hit">
    <ellipse cx="${B.cx - B.rx + 12}" cy="150" rx="16" ry="13" fill="${p.rump}" ${line(p.rump)}/>
    <ellipse cx="${B.cx}" cy="${B.cy}" rx="${B.rx}" ry="${B.ry}" fill="url(#bodyGrad)" ${line(p.body)}/>
    <g clip-path="url(#bodyClip)">
      ${bellyBlob}
      <ellipse cx="${B.cx - 2}" cy="${B.cy + B.ry}" rx="${B.rx}" ry="14" fill="${shade(p.body, -0.3)}" opacity="0.22" filter="url(#soft3)"/>
    </g>
    ${breast}
  </g>

  ${collar}

  <g id="wing" class="hit">
   <g transform="${wingT}">
    <path d="M92,100 C70,102 53,124 53,148 C53,164 59,175 67,181 C84,169 102,145 104,118 C105,108 100,101 92,100 Z" fill="url(#wingGrad)" ${line(p.wing)}/>
    ${wingBar}
    <path d="M57,157 C57,168 61,176 67,181 C75,173 82,165 87,156 C78,160 66,160 57,157 Z" fill="url(#flightGrad)"/>
    <path d="${S.scallopDark ? budgieScallops : 'M70,124 q6,6 12,0 q6,6 12,0 M64,138 q6,6 12,0 q6,6 12,0 M60,152 q6,6 12,0 q5,5 10,0'}"
          stroke="${scallopColor}" stroke-width="${scallopWidth}" fill="none" opacity="${scallopOpacity}" stroke-linecap="round"/>
    <path d="M63,162 L67,178 M70,161 L71.5,174 M77,160 L77,168" stroke="${shade(p.flight, -0.35)}" stroke-width="1" opacity="0.5" stroke-linecap="round"/>
    <path d="M90,106 C78,110 68,121 63,135" stroke="#fff" stroke-width="2.2" fill="none" opacity="0.28" stroke-linecap="round"/>
   </g>
  </g>

  <g id="head" class="hit">
   <g transform="${headT}">
   <g id="headSide">
    ${crestSide}
    <!-- 下巴往身体上晕开一点，头转动时接缝不生硬 -->
    <ellipse cx="118" cy="104" rx="26" ry="12" fill="${p.face}" opacity="0.55" filter="url(#soft3)"/>
    <circle cx="114" cy="74" r="36" fill="url(#headGrad)" mask="url(#headFade)"/>
    <path d="M78.9,82 A36,36 0 1 1 149.1,82" fill="none" ${line(p.head)}/>
    <g clip-path="url(#headClip)">
      <path d="M124,37 C142,38 158,56 157,78 C156,100 142,114 118,116 C104,112 96,100 98,88 C100,78 108,72 112,64 C115,54 116,44 124,37 Z" fill="url(#faceGrad)" filter="url(#soft4)"/>
      <ellipse cx="128" cy="46" rx="16" ry="8" fill="#fff" opacity="0.22" filter="url(#soft3)"/>
    </g>
    ${stripes}
    ${cheekSpot}
    ${throat}
    <ellipse id="blush" cx="135" cy="89" rx="9" ry="5.5" fill="${cheek}" opacity="0.3" filter="url(#soft1)"/>
    <g id="eye">
      ${ring}
      <ellipse cx="128" cy="70" rx="5.6" ry="6.3" fill="${p.eye}"/>
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
   <!-- 正脸：盯着你看的时候用 -->
   <g id="headFront">
    ${crestFront}
    <ellipse cx="114" cy="106" rx="28" ry="12" fill="${p.face}" opacity="0.55" filter="url(#soft3)"/>
    <circle cx="114" cy="74" r="36" fill="url(#headGrad)" mask="url(#headFade)"/>
    <path d="M78.9,82 A36,36 0 1 1 149.1,82" fill="none" ${line(p.head)}/>
    <g clip-path="url(#headClip)">
      <ellipse cx="114" cy="86" rx="35" ry="34" fill="url(#faceGrad)" filter="url(#soft4)"/>
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

  <g id="footFront">
    <path d="M114,124 L120,110" stroke="${p.feet}" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M114,104 L120,110 L127,106 M120,110 L124,113" stroke="${p.feet}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
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
  x = fx + (x - fx) * p.sx * p.puff; y = fy + (y - fy) * p.sy * p.puff;
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
    shadow: 1, scratchFoot: 0, front: false,
    crest: 0.35,            // 冠羽：0 贴在后脑，1 完全竖起
    mirror: false, beakTwig: false, twigGround: false, twigPile: 0,
  };
}

function makeCartoon(svg) {
  const $ = (id) => svg.querySelector('#' + id);
  const els = {
    pose: $('pose'), head: $('head'), wing: $('wing'), jaw: $('jaw'), eye: $('eye'),
    eyeHappy: $('eyeHappy'), eyeX: $('eyeX'), blush: $('blush'),
    footL: $('footL'), footR: $('footR'), feet: $('feet'), tail: $('tail'),
    seeds: $('seeds'), paperGround: $('paperGround'), beakPaper: $('beakPaper'),
    tailPaper: $('tailPaper'), shadow: $('shadow'), footFront: $('footFront'),
    headSide: $('headSide'), headFront: $('headFront'), eyesFront: $('eyesFront'),
    crest: $('crest'), crestFront: $('crestFront'),
    mirror: $('mirror'), beakTwig: $('beakTwig'), twigGround: $('twigGround'),
  };
  const strips = [...svg.querySelectorAll('#tailPaper .strip')];
  const twigs = [...svg.querySelectorAll('#twigPile .twig')];
  const P = PARROT_PIVOT;
  const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };

  return function apply(p) {
    const [fx, fy] = P.feet;
    els.pose.setAttribute('transform',
      `translate(0 ${p.y}) rotate(${p.rot} ${fx} ${fy - 50}) translate(${fx} ${fy}) scale(${p.sx * p.puff} ${p.sy * p.puff}) translate(${-fx} ${-fy})`);
    const [nx, ny] = P.neck;
    els.head.setAttribute('transform',
      `translate(${nx + p.headX} ${ny + p.headY}) scale(${p.headFlip * p.headPuff} ${p.headPuff}) rotate(${p.headRot}) translate(${-nx} ${-ny})`);
    els.wing.setAttribute('transform', `rotate(${p.wing} ${P.shoulder[0]} ${P.shoulder[1]})`);
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
    if (els.crest) els.crest.setAttribute('transform', `rotate(${-62 + 66 * c} ${P.crest[0]} ${P.crest[1]})`);
    if (els.crestFront) els.crestFront.setAttribute('transform', `translate(114 44) scale(1 ${0.35 + 0.65 * c}) translate(-114 -44)`);
    // 腮红常驻淡淡一层，开心时更红
    els.blush.setAttribute('opacity', 0.3 + 0.55 * p.blush);
    els.footL.setAttribute('transform', `translate(0 ${-p.legL})`);
    els.footR.setAttribute('transform', `translate(${p.legRX} ${-p.legR})`);
    show(els.footR, !p.scratchFoot);
    show(els.footFront, !!p.scratchFoot);
    if (p.scratchFoot) els.footFront.setAttribute('transform', `translate(${p.scratchFoot} ${-Math.abs(p.scratchFoot) * 0.6})`);
    els.feet.setAttribute('transform', p.tuckFeet ? 'translate(98 172) scale(1 0.4) translate(-98 -172)' : '');
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
