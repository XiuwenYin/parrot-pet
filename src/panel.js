// 控制面板的页面逻辑：所有改动都发给主进程，主进程改设置、通知桌宠，再把新状态推回来
const $ = (id) => document.getElementById(id);
let S = null;                 // 主进程给的状态
const TALKERS = ['budgie', 'cockatiel', 'monk', 'cockatoo', 'grey'];
const FAMILY_GROUPS = [
  ['牡丹', 'lovebird'], ['虎皮', 'budgie'], ['玄凤', 'cockatiel'], ['大一点的', 'monk', 'cockatoo', 'caique', 'grey'],
];
const ACT_ICON = {
  idle: '😶', walk: '🚶', fly: '🕊️', eat: '🌻', preen: '🪶', scratch: '🫳', stretch: '🙆', sing: '🎵', dance: '🪩',
  paper: '📜', mirror: '🪞', talk: '💬', scream: '📣', march: '🦵', mimic: '📱', footeat: '🦶', whistle: '🎶',
  heartwing: '💚', headdown: '🙇', peekaboo: '🙈', nest: '🪹', quake: '〰️', hang: '🙃', look: '👀', tall: '📏',
  climb: '🧗', perch: '🗂️', sleep: '💤', gnaw: '🦷',
};

// ---------- 画鸟 ----------
// 同一页面好几只鸟：SVG 里的 id 都加后缀，免得渐变、遮罩互相串
const DEFS = ['paint', 'soft1', 'soft3', 'soft4', 'headClip', 'stripeClip', 'stripeFadeGrad', 'stripeFade', 'stripeFadeFrontGrad', 'stripeFadeFront',
  'headFadeGrad', 'headFade', 'wingClip', 'bodyClip', 'bodyGrad', 'headGrad', 'faceGrad', 'wingGrad', 'flightGrad', 'beakGrad', 'tailGrad',
  'neckGrad', 'neckClip', 'headSoft', 'headSoftFull', 'headSoftGrad', 'maskBlur'];
let uid = 0;
function drawBird(el, id, act = 'idle', t = 1) {
  const sp = SPECIES[id] || SPECIES.roseicollis;
  const n = ++uid;
  let s = parrotSVG(sp.shape, { ...sp.palette, beanEyes: !!(S && S.settings.beanEyes) });
  for (const d of DEFS) s = s.split(`id="${d}"`).join(`id="${d}_${n}"`).split(`url(#${d})`).join(`url(#${d}_${n})`);
  el.innerHTML = `<svg viewBox="0 0 200 200">${s}</svg>`;
  const apply = makeCartoon(el.querySelector('svg'), sp.shape);
  const pose = (tt, a = act) => {
    const p = basePose();
    POSES[a](tt, { seed: 0.3 }, p);
    if (!['cockatiel', 'cockatoo'].includes(sp.shape)) p.crest = 0;
    apply(p);
  };
  pose(t);
  return pose;
}

// 预览：一直轻轻地发呆、偶尔歪头
let previewPose = null, previewT = 0, lastFrame = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0); lastFrame = now; previewT += dt;
  if (previewPose && $('bird').classList.contains('on')) previewPose(previewT, previewT % 9 > 6.5 ? 'look' : 'idle');
  requestAnimationFrame(loop);
}

// ---------- 渲染 ----------
let drawnKey = '';
function renderBirds() {
  const key = S.settings.species + '|' + S.settings.beanEyes;
  if (key === drawnKey) return;
  drawnKey = key;
  uid = 0;
  previewPose = drawBird($('preview'), S.settings.species);
  drawBird($('ava'), S.settings.species);
  drawBird($('aboutBird'), 'budgieGoldRainbow');
  const box = $('speciesBox');
  box.innerHTML = '';
  for (const [label, ...fams] of FAMILY_GROUPS) {
    const row = document.createElement('div'); row.className = 'fam';
    row.innerHTML = `<b>${label}</b><div class="chips"></div>`;
    const chips = row.querySelector('.chips');
    for (const [id, sp] of Object.entries(SPECIES)) {
      if (!fams.includes(sp.shape)) continue;
      const c = document.createElement('button');
      c.className = 'chip' + (id === S.settings.species ? ' on' : '');
      const b = document.createElement('span'); c.appendChild(b); c.append(sp.name);
      c.onclick = () => window.panel.set('species', id);
      chips.appendChild(c);
      drawBird(b, id);
    }
    box.appendChild(row);
  }
}

function seg(el, items, current, onPick) {
  el.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.textContent = it.name; b.className = it.id === current ? 'on' : '';
    b.onclick = () => onPick(it.id);
    el.appendChild(b);
  }
}
function sw(id, on) { $(id).classList.toggle('on', !!on); $(id).setAttribute('aria-checked', on ? 'true' : 'false'); }

function render() {
  const st = S.settings, fam = familyOf(st.species), sp = SPECIES[st.species];
  document.body.classList.toggle('win', S.platform === 'win32');
  $('ver').textContent = 'v' + S.version;
  $('meName').textContent = st.petName || sp.name;
  $('meSub').textContent = (st.petName ? sp.name + ' · ' : '') + `陪了你 ${st.days} 天`;
  renderBirds();

  // 我的鸟
  if (document.activeElement !== $('userName')) $('userName').value = st.userName;
  if (document.activeElement !== $('petName')) $('petName').value = st.petName;
  // 预览跟着"大小"一起变
  const sc = (SIZES.find(z => z.id === st.size) || { scale: 0.8 }).scale;
  $('preview').style.setProperty('--pv', Math.round(190 * sc) + 'px');
  seg($('modeSeg'), MODES.map(m => ({ id: m.id, name: m.id === 'real' ? '真实素材' : m.name })), st.mode, (v) => window.panel.set('mode', v));
  seg($('sizeSeg'), SIZES, st.size, (v) => window.panel.set('size', v));
  sw('beanEyes', st.beanEyes);

  // 互动
  const acts = ACTIONS.filter(a => a.menu && actionAllowed(a.id, fam));
  const key = acts.map(a => a.id).join();
  if ($('acts').dataset.key !== key) {
    $('acts').dataset.key = key;
    $('acts').innerHTML = '';
    for (const a of acts) {
      const b = document.createElement('button');
      b.className = 'act' + (a.only ? ' only' : '');
      b.innerHTML = `<em>${ACT_ICON[a.id] || '🐦'}</em>`;
      b.append(a.name.replace(/^Peekaboo /, ''));
      b.onclick = () => window.panel.cmd('act', a.id);
      $('acts').appendChild(b);
    }
  }
  const talks = TALKERS.includes(fam);
  $('teachCard').hidden = !talks; $('noTalk').hidden = talks;
  $('noTalkText').textContent = `${FAMILIES[fam].name}不太会学人说话，换成虎皮、玄凤、和尚、凤头或非洲灰就能教了。`;
  $('phrases').innerHTML = st.learned.length ? '' : '<span class="empty">还没教过，它会说几句自带的</span>';
  for (const t of st.learned) {
    const s = document.createElement('span'); s.textContent = t;
    const x = document.createElement('button'); x.textContent = '×'; x.title = '不让它说这句了';
    x.onclick = () => window.panel.forget(t).then(refresh);
    s.appendChild(x); $('phrases').appendChild(s);
  }
  sw('muted', st.muted); sw('followMusic', st.followMusic);
  $('musicRow').hidden = S.platform !== 'darwin';       // 检测"在放歌"目前只有 Mac 版做了

  // 素材
  const im = S.importer;
  $('importerStatus').textContent = !im ? '' : im.busy ? '正在处理素材…' : im.ready ? '自动抠图工具已就绪' : '第一次用要先下载自动抠图工具';
  $('importerBtn').textContent = im && !im.ready ? `下载抠图工具（${im.setupSize}）` : '重新处理全部素材';
  $('importerBtn').disabled = !im || im.busy;
  const ai = S.ai;
  if (ai) {
    const c = ai.counts || {};
    $('aiStatus').textContent = ai.busy ? `生成中 ${(c.done || 0) + (c.failed || 0)}/${c.total || 0}` : ai.ready ? '' : '还没填生成服务的密钥';
    $('aiGenerate').disabled = ai.busy;
    $('aiCancel').hidden = !ai.busy;
  }
  $('marksCard').hidden = !S.marks;

  // 设置（只在第一次填，免得把正在输入的冲掉）
  if (ai && !$('provider').options.length) fillAi(ai);

  // 关于与更新
  renderUpdate();
  sw('autoUpdate', st.autoUpdate);
  sw('showInTaskbar', st.showInTaskbar);
  $('winCard').hidden = S.platform !== 'win32';
}

const AI_FIELDS = { bailian: ['host', 'apiKey', 'model', 'resolution', 'pricePerSecond'], dishui: ['baseUrl', 'apiKey', 'model', 'pricePerSecond'] };
function fillAi(c) {
  for (const [k, name] of Object.entries(c.providers)) $('provider').add(new Option(name, k, false, k === c.provider));
  for (const [p, keys] of Object.entries(AI_FIELDS)) for (const k of keys) {
    const el = $(`${p}_${k}`);
    if (k === 'apiKey') el.placeholder = c[p].hasKey ? '已保存（不显示，留空就不修改）' : '粘贴你的 API Key';
    else el.value = c[p][k] ?? '';
  }
  showProvider();
}
function showProvider() {
  document.querySelectorAll('.card.ai').forEach(el => { el.hidden = el.dataset.provider !== $('provider').value; });
}

function renderUpdate() {
  const u = S.update, card = $('updCard');
  const has = u.status === 'available' || u.status === 'downloading' || u.status === 'ready';
  $('updDot').hidden = !has;
  card.className = 'card' + (has ? ' upd' : '');
  const list = (u.changes || []).map(c => `<li>${esc(c)}</li>`).join('');
  if (has) {
    const head = `<div class="head"><b class="big">发现新版本 v${esc(u.version)}</b><span class="badge">新</span><span class="hint" style="margin-left:auto">当前 v${esc(u.current)}</span></div>${list ? `<ul>${list}</ul>` : '<div style="height:8px"></div>'}`;
    if (u.status === 'available') {
      card.innerHTML = head + `<div class="row plain"><span class="hint">${S.canAutoUpdate ? '下载完会提示重启' : '下载新版本后，替换掉"应用程序"里的旧版本就好'}</span><span class="grow"></span>` +
        `<button class="btn primary" data-cmd="update-download">${S.canAutoUpdate ? '下载并更新' : '打开下载页'}</button></div>`;
    } else {
      const pct = u.status === 'ready' ? 100 : (u.percent || 0);
      card.innerHTML = head + `<div class="prog"><i style="width:${pct}%"></i></div><div class="row plain"><span class="hint">${u.status === 'ready' ? '下载好了' : `正在下载… ${pct}%`}</span><span class="grow"></span>` +
        `<button class="btn primary" data-cmd="update-install" ${u.status === 'ready' ? '' : 'disabled'}>重启并更新</button></div>`;
    }
  } else {
    const msg = { idle: '', checking: '正在检查…', none: '已经是最新版本', error: u.error || '检查失败' }[u.status] || '';
    card.innerHTML = `<div class="updhead"><div><b class="big">当前版本 v${esc(u.current)}</b><div class="hint">${esc(msg)}</div></div><span class="grow"></span>` +
      `<button class="btn" data-cmd="update-check" ${u.status === 'checking' ? 'disabled' : ''}>检查更新</button></div>`;
  }
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- 交互 ----------
function showTab(tab) {
  if (!document.getElementById(tab) || !document.getElementById(tab).classList.contains('content')) tab = 'bird';
  document.querySelectorAll('.content').forEach(c => c.classList.toggle('on', c.id === tab));
  document.querySelectorAll('.nav').forEach(n => n.classList.toggle('on', n.dataset.tab === tab));
  // 第一次打开"关于"就顺便检查一下
  if (tab === 'about' && S && S.update.status === 'idle') window.panel.cmd('update-check').then(setState);
}
document.querySelectorAll('.nav').forEach(n => { n.onclick = () => showTab(n.dataset.tab); });
$('comeBack').onclick = () => window.panel.cmd('come-back');

const saveNames = () => window.panel.saveNames({ userName: $('userName').value.trim(), petName: $('petName').value.trim() });
for (const id of ['userName', 'petName']) {
  $(id).addEventListener('change', saveNames);
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
}
for (const key of ['beanEyes', 'muted', 'followMusic', 'autoUpdate', 'showInTaskbar']) {
  $(key).onclick = () => window.panel.set(key, !S.settings[key]);
}

const teach = async () => {
  const t = $('teachInput').value.trim();
  if (!t) return;
  await window.panel.teach(t);
  $('teachInput').value = '';
  refresh();
};
$('teachBtn').onclick = teach;
$('teachInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') teach(); });
$('tryBtn').onclick = () => { const t = $('teachInput').value.trim(); if (t) window.panel.cmd('try-say', t); };

$('openFolder').onclick = () => window.panel.cmd('open-folder');
$('importerBtn').onclick = () => window.panel.cmd(S.importer && !S.importer.ready ? 'importer-setup' : 'reprocess').then(setState);
$('aiGenerate').onclick = () => window.panel.cmd('ai-generate');
$('aiCancel').onclick = () => window.panel.cmd('ai-cancel').then(setState);
$('clean').onclick = () => window.panel.cmd('clean').then(setState);

$('provider').onchange = showProvider;
$('aiSave').onclick = async () => {
  const out = { provider: $('provider').value };
  for (const [p, keys] of Object.entries(AI_FIELDS)) {
    out[p] = {};
    for (const k of keys) out[p][k] = k === 'pricePerSecond' ? Number($(`${p}_${k}`).value || 0) : $(`${p}_${k}`).value.trim();
  }
  await window.panel.aiSave(out);
  for (const p of Object.keys(AI_FIELDS)) $(`${p}_apiKey`).value = '';
  const s = await window.panel.get();
  $('provider').innerHTML = ''; fillAi(s.ai); setState(s);
  $('aiMsg').textContent = '已保存';
  setTimeout(() => { $('aiMsg').textContent = ''; }, 2000);
};

$('updCard').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cmd]');
  if (b && !b.disabled) window.panel.cmd(b.dataset.cmd).then(setState);
});
document.querySelectorAll('[data-link]').forEach(a => { a.onclick = () => window.panel.cmd('link', a.dataset.link); });

function setState(s) { if (s) { S = s; render(); } }
const refresh = () => window.panel.get().then(setState);
window.panel.onState(setState);
window.panel.onTab(showTab);

(async () => {
  S = await window.panel.get();
  render();
  showTab(location.hash.slice(1) || 'bird');
  requestAnimationFrame(loop);
})();
