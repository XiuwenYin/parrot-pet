// 素材自动导入（主进程）：盯着 assets/real/，有人丢进视频或照片就排队交给 tools/import_media.py 处理。
//   assets/real/xxx.mp4                → 归到当前选中的鸟种
//   assets/real/<鸟种>/xxx.mp4         → 归到那个鸟种
// 处理过的文件记在 assets/real/.imported.json 里，原文件不动。
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MEDIA_EXT = /\.(mp4|mov|m4v|avi|mkv|webm|jpe?g|png|heic|webp)$/i;

// 从文件名认动作：AI 生成的叫 <动作>.ai-<时间>.mp4；手动丢的视频文件名里带中文动作名也行（"理毛.mp4"）
const NAME_ACTIONS = [
  ['理毛', 'preen'], ['梳毛', 'preen'], ['挠', 'scratch'], ['懒腰', 'stretch'], ['伸展', 'stretch'],
  ['瓜子', 'eat'], ['吃', 'eat'], ['唱', 'sing'], ['叫', 'sing'], ['跳舞', 'dance'], ['摇头', 'dance'],
  ['睡', 'sleep'], ['盯', 'look'], ['歪头', 'look'], ['开心', 'happy'], ['舒服', 'happy'],
  ['溜达', 'walk'], ['走', 'walk'], ['炸毛', 'angry'], ['生气', 'angry'], ['纸', 'paper'],
  ['镜子', 'mirror'], ['说话', 'talk'], ['口哨', 'whistle'], ['国歌', 'whistle'], ['心形', 'heartwing'],
  ['讨挠', 'headdown'], ['低头', 'headdown'], ['树枝', 'nest'], ['搭窝', 'nest'], ['抖', 'quake'],
  ['飞', 'fly'], ['发呆', 'idle'], ['站', 'idle'],
];
function actionFromName(name, actionIds) {
  const m = name.match(/^([a-z]+)\.ai-/i);
  if (m && actionIds.includes(m[1])) return m[1];
  const base = name.replace(/\.[^.]+$/, '');
  if (actionIds.includes(base)) return base;
  for (const [word, id] of NAME_ACTIONS) if (base.includes(word)) return id;
  return null;
}
const SUPPORT = path.join(os.homedir(), 'Library', 'Application Support', 'parrot-pet');  // 和 main.js 的 userData 一致
const PYTHON = path.join(SUPPORT, 'venv', 'bin', 'python');
const MODEL = path.join(SUPPORT, 'models', 'mobile_sam_image_encoder.onnx');

function createImporter({ root, realDir, getSpecies, speciesIds, actionIds = [], notify }) {
  const recordPath = path.join(realDir, '.imported.json');
  const birdcut = path.join(root, 'tools', '.bin', 'birdcut');
  let record = {};
  try { record = JSON.parse(fs.readFileSync(recordPath, 'utf8')); } catch (_) {}
  const queue = [];
  const claimed = new Set();     // 已经被某次扫描认领（等待稳定 / 排队 / 处理中）的文件
  let busy = false;
  let setupRunning = false;
  let scanTimer;

  const saveRecord = () => {
    try { fs.writeFileSync(recordPath, JSON.stringify(record, null, 2)); } catch (_) {}
  };
  const ready = () => fs.existsSync(PYTHON) && fs.existsSync(MODEL) && fs.existsSync(birdcut);
  const keyOf = (file, st) => `${path.relative(realDir, file)}|${st.size}|${Math.round(st.mtimeMs)}`;

  // 找出还没处理过的媒体文件：根目录 + 各鸟种目录的第一层
  function pending() {
    const out = [];
    const scan = (dir, species) => {
      if (!fs.existsSync(dir)) return;
      for (const name of fs.readdirSync(dir)) {
        if (name.startsWith('.') || !MEDIA_EXT.test(name)) continue;
        const file = path.join(dir, name);
        const st = fs.statSync(file);
        if (!st.isFile()) continue;
        if (record[keyOf(file, st)]) continue;
        if (claimed.has(file)) continue;
        out.push({ file, species, size: st.size });
      }
    };
    scan(realDir, null);
    for (const sp of speciesIds) scan(path.join(realDir, sp), sp);
    return out;
  }

  // 文件可能还在复制中：大小 2 秒内没变才处理
  async function stable(file, size) {
    await new Promise(r => setTimeout(r, 2000));
    try { return fs.statSync(file).size === size; } catch (_) { return false; }
  }

  async function scan() {
    const found = pending();
    if (!found.length) return;
    if (!ready()) {
      notify('import-need-setup', { count: found.length });
      return;
    }
    found.forEach(f => claimed.add(f.file));
    for (const f of found) {
      if (await stable(f.file, f.size)) queue.push(f);
      else claimed.delete(f.file);      // 还在复制，下次扫描再说
    }
    run();
  }

  function run() {
    if (busy || !queue.length) return;
    busy = true;
    // 小文件先做：AI 生成的几秒短片不要被很长的视频堵在后面
    queue.sort((x, y) => x.size - y.size);
    const job = queue.shift();
    const species = job.species || getSpecies();
    const name = path.basename(job.file);
    notify('import-start', { name, left: queue.length });
    const action = actionFromName(name, actionIds);
    const args = [path.join(root, 'tools', 'import_media.py'), job.file, '--species', species, '--out', realDir];
    if (action) args.push('--action', action);
    const p = spawn(PYTHON, args);
    let buf = '';
    let result = null;
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let msg;
        try { msg = JSON.parse(line); } catch (_) { continue; }
        if (msg.done) result = msg;
        else if (msg.progress != null) notify('import-progress', { name, progress: msg.progress, stage: msg.stage, left: queue.length });
      }
    });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      busy = false;
      if (!result) result = { done: true, clips: [], error: `处理失败（${code}）`, detail: err.slice(-400) };
      try {
        const st = fs.statSync(job.file);
        record[keyOf(job.file, st)] = { species, at: new Date().toISOString(), clips: result.clips, error: result.error || null };
        saveRecord();
      } catch (_) {}
      claimed.delete(job.file);
      notify('import-done', { name, species, left: queue.length, ...result });
      run();
    });
  }

  // 一键准备环境：建 Python 虚拟环境、装依赖、下载模型、编译工具
  function setup() {
    if (setupRunning) return;
    setupRunning = true;
    notify('setup-progress', { stage: '开始准备…' });
    const p = spawn('/bin/zsh', [path.join(root, 'tools', 'setup.sh')]);
    const onLine = (d) => {
      for (const line of String(d).split('\n')) if (line.startsWith('>> ')) notify('setup-progress', { stage: line.slice(3) });
    };
    p.stdout.on('data', onLine);
    p.stderr.on('data', () => {});
    p.on('close', (code) => {
      setupRunning = false;
      notify('setup-done', { ok: code === 0 });
      if (code === 0) scan();
    });
  }

  function reprocessAll() {
    if (busy) return;
    record = {};
    saveRecord();
    scan();
  }

  function start() {
    fs.mkdirSync(realDir, { recursive: true });
    try {
      fs.watch(realDir, { recursive: true }, (_ev, name) => {
        if (!name || !MEDIA_EXT.test(name) || name.includes(`${path.sep}.`)) return;
        clearTimeout(scanTimer);
        scanTimer = setTimeout(scan, 1500);
      });
    } catch (_) {}
    setTimeout(scan, 3000);
  }

  return { start, scan, setup, reprocessAll, ready, busy: () => busy || queue.length > 0 };
}

module.exports = { createImporter, actionFromName };
