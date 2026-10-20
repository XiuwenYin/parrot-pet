// AI 生成动作（主进程）：一张鸟的照片 → 每个动作生成一段视频 → 放进素材文件夹，交给自动导入。
//   1. 先把鸟抠出来放到纯色背景上（tools/prep_ai_photo.py；不行就用原图）
//   2. 按动作排队提交给生成服务（同时最多 2 个），每 15 秒查一次进度
//   3. 生成好就下载成 <鸟种>/<动作>.ai-<时间>.mp4，自动导入会按文件名归到对应动作
// 配置（服务、地址、密钥、模型）存在用户目录 videogen.json，不进代码仓库；队列存在 videogen-jobs.json，重启后接着查。
const { spawn } = require('child_process');
const { nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { AI_NEGATIVE, aiPrompt } = require('./aiprompts');

const CLIP_SECONDS = 5;
const POLL_MS = 15000;
const CONCURRENCY = 2;

const DEFAULT_CONFIG = {
  provider: 'bailian',
  bailian: {
    // 公共地址或带业务空间的地址（https://<业务空间ID>.cn-beijing.maas.aliyuncs.com）都可以
    host: 'https://dashscope.aliyuncs.com',
    apiKey: '',
    model: 'wan2.6-i2v-flash',
    resolution: '720P',
    pricePerSecond: 0.15,     // 元/秒，只用来生成前估算费用（wan2.6-i2v-flash 无声 720P 的官方价）
  },
  dishui: {
    baseUrl: 'https://www.dishuimodelcenter.com/gateway/ai-service/v1',
    apiKey: '',
    model: 'seedance-2.0-fast',
    pricePerSecond: 0,
  },
};

// ---------- 各家生成服务 ----------
const PROVIDERS = {
  // 阿里云百炼 · 通义万相 图生视频（异步任务）
  bailian: {
    name: '阿里云百炼（通义万相）',
    async submit(cfg, { image, prompt }) {
      const res = await fetch(`${cfg.host.replace(/\/+$/, '')}/api/v1/services/aigc/video-generation/video-synthesis`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' },
        body: JSON.stringify({
          model: cfg.model,
          input: { prompt, img_url: image, negative_prompt: AI_NEGATIVE },
          parameters: { resolution: cfg.resolution, duration: CLIP_SECONDS, prompt_extend: true, watermark: false, audio: false },
        }),
      });
      const data = await res.json().catch(() => ({}));
      const id = data.output && data.output.task_id;
      if (!res.ok || !id) throw new Error(data.message || data.code || `提交失败（${res.status}）`);
      return id;
    },
    async poll(cfg, taskId) {
      const res = await fetch(`${cfg.host.replace(/\/+$/, '')}/api/v1/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      });
      const data = await res.json().catch(() => ({}));
      const o = data.output || {};
      if (o.task_status === 'SUCCEEDED') return { state: 'done', url: o.video_url };
      if (['FAILED', 'CANCELED', 'UNKNOWN'].includes(o.task_status)) return { state: 'failed', error: o.message || o.code || o.task_status };
      return { state: 'running' };
    },
  },
  // 滴水模型中心：等拿到视频接口文档再接
  dishui: {
    name: '滴水模型中心',
    async submit() { throw new Error('滴水模型中心的视频接口还没接入（等接口文档）'); },
    async poll() { return { state: 'failed', error: '未接入' }; },
  },
};

function createVideoGen({ userDataDir, realDir, toolsRoot, notify }) {
  const cfgPath = path.join(userDataDir, 'videogen.json');
  const jobsPath = path.join(userDataDir, 'videogen-jobs.json');
  const python = path.join(os.homedir(), 'Library', 'Application Support', 'parrot-pet', 'venv', 'bin', 'python');
  let jobs = [];
  let timer = null;
  try { jobs = JSON.parse(fs.readFileSync(jobsPath, 'utf8')); } catch (_) {}
  // 上次被中断的：提交到一半的不知道成没成功，标失败（不重复提交，免得多花钱）；下载到一半的重新查一次再下
  for (const j of jobs) {
    if (j.status === 'submitting') { j.status = 'failed'; j.error = '提交时被中断'; }
    if (j.status === 'downloading') j.status = 'running';
  }

  function loadConfig() {
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (_) {}
    return {
      provider: saved.provider || DEFAULT_CONFIG.provider,
      bailian: { ...DEFAULT_CONFIG.bailian, ...(saved.bailian || {}) },
      dishui: { ...DEFAULT_CONFIG.dishui, ...(saved.dishui || {}) },
    };
  }

  function saveConfig(next) {
    const cur = loadConfig();
    // 密钥留空 = 不修改原来的
    for (const p of ['bailian', 'dishui']) {
      if (next[p] && !next[p].apiKey) next[p].apiKey = cur[p].apiKey;
    }
    const merged = { provider: next.provider || cur.provider, bailian: { ...cur.bailian, ...(next.bailian || {}) }, dishui: { ...cur.dishui, ...(next.dishui || {}) } };
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify(merged, null, 2), { mode: 0o600 });
    return merged;
  }

  // 给设置窗口看的版本：密钥只说有没有，不回传
  function publicConfig() {
    const c = loadConfig();
    const strip = (p) => ({ ...p, apiKey: '', hasKey: !!p.apiKey });
    return { provider: c.provider, bailian: strip(c.bailian), dishui: strip(c.dishui), providers: Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, v.name])) };
  }

  function ready() {
    const c = loadConfig();
    return !!(c[c.provider] && c[c.provider].apiKey);
  }

  function estimate(count) {
    const c = loadConfig();
    const p = c[c.provider] || {};
    return { provider: PROVIDERS[c.provider].name, model: p.model, seconds: count * CLIP_SECONDS, yuan: +(count * CLIP_SECONDS * (p.pricePerSecond || 0)).toFixed(2) };
  }

  const saveJobs = () => { try { fs.writeFileSync(jobsPath, JSON.stringify(jobs, null, 2)); } catch (_) {} };
  const active = () => jobs.filter(j => ['queued', 'submitting', 'running', 'downloading'].includes(j.status));

  // 照片 → 纯色背景上的鸟（JPEG data URI）
  function prepPhoto(photo) {
    return new Promise((resolve) => {
      const out = path.join(os.tmpdir(), `parrot_ai_${Date.now()}.jpg`);
      const script = path.join(toolsRoot, 'tools', 'prep_ai_photo.py');
      const fallback = () => {
        let img = nativeImage.createFromPath(photo);
        const { width, height } = img.getSize();
        if (Math.max(width, height) > 1600) img = img.resize(width > height ? { width: 1600 } : { height: 1600 });
        resolve({ image: 'data:image/jpeg;base64,' + img.toJPEG(90).toString('base64'), cut: false });
      };
      if (process.platform !== 'darwin' || !fs.existsSync(python)) return fallback();
      const p = spawn(python, [script, photo, out]);
      let buf = '';
      p.stdout.on('data', (d) => { buf += d; });
      p.on('close', () => {
        try {
          const r = JSON.parse(buf.trim().split('\n').pop());
          if (r.ok && fs.existsSync(out)) {
            const b64 = fs.readFileSync(out).toString('base64');
            fs.unlinkSync(out);
            return resolve({ image: 'data:image/jpeg;base64,' + b64, cut: true });
          }
        } catch (_) {}
        fallback();
      });
    });
  }

  async function start({ photo, species, family, actions }) {
    notify('ai-progress', { stage: '准备照片（把鸟抠出来）…' });
    const { image, cut } = await prepPhoto(photo);
    const batch = Date.now().toString(36);
    const imgFile = path.join(userDataDir, `videogen-${batch}.txt`);
    fs.writeFileSync(imgFile, image);           // 图很大，单独存，队列里只记路径
    for (const action of actions) {
      jobs.push({ id: `${batch}-${action}`, batch, action, species, family, imgFile, status: 'queued', created: Date.now() });
    }
    saveJobs();
    notify('ai-progress', { stage: `${cut ? '已把鸟抠到纯色背景上，' : ''}开始生成 ${actions.length} 段`, ...counts() });
    pump();
  }

  function counts() {
    const mine = jobs.filter(j => j.batch === (jobs[jobs.length - 1] || {}).batch);
    return { total: mine.length, done: mine.filter(j => j.status === 'done').length, failed: mine.filter(j => j.status === 'failed').length };
  }

  async function submitOne(job) {
    const c = loadConfig();
    const prov = PROVIDERS[c.provider];
    job.status = 'submitting';
    job.provider = c.provider;
    saveJobs();
    try {
      const image = fs.readFileSync(job.imgFile, 'utf8');
      job.taskId = await prov.submit(c[c.provider], { image, prompt: aiPrompt(job.family, job.action) });
      job.status = 'running';
      job.submitted = Date.now();
    } catch (e) {
      job.status = 'failed';
      job.error = String(e.message || e);
    }
    saveJobs();
  }

  async function pollOne(job) {
    const c = loadConfig();
    const prov = PROVIDERS[job.provider || c.provider];
    let r;
    try { r = await prov.poll(c[job.provider || c.provider], job.taskId); } catch (e) { return; }
    if (r.state === 'running') {
      if (Date.now() - job.submitted > 23 * 3600 * 1000) { job.status = 'failed'; job.error = '超时'; saveJobs(); }
      return;
    }
    if (r.state === 'failed') { job.status = 'failed'; job.error = r.error; saveJobs(); return; }
    // 下载成 <鸟种>/<动作>.ai-<时间>.mp4，自动导入会按文件名认出动作
    job.status = 'downloading';
    saveJobs();
    try {
      const res = await fetch(r.url);
      if (!res.ok) throw new Error(`下载失败（${res.status}）`);
      const dir = path.join(realDir, job.species);
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const file = path.join(dir, `${job.action}.ai-${stamp}.mp4`);
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      job.status = 'done';
      job.file = file;
    } catch (e) {
      job.status = 'failed';
      job.error = String(e.message || e);
    }
    saveJobs();
  }

  let pumping = false;
  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      for (const j of jobs.filter(x => x.status === 'running')) await pollOne(j);
      while (jobs.filter(x => x.status === 'running' || x.status === 'submitting').length < CONCURRENCY) {
        const next = jobs.find(x => x.status === 'queued');
        if (!next) break;
        await submitOne(next);
      }
    } finally {
      pumping = false;
    }
    const c = counts();
    const left = active().length;
    if (left) {
      notify('ai-progress', { stage: `AI 生成中 ${c.done + c.failed}/${c.total}`, ...c });
      clearTimeout(timer);
      timer = setTimeout(pump, POLL_MS);
    } else if (c.total) {
      const failed = jobs.filter(j => j.status === 'failed' && j.batch === (jobs[jobs.length - 1] || {}).batch);
      notify('ai-done', { ...c, errors: [...new Set(failed.map(j => j.error))].slice(0, 2) });
      // 收尾：这批的照片数据不用留了
      for (const f of new Set(jobs.filter(j => !['queued', 'running', 'submitting', 'downloading'].includes(j.status)).map(j => j.imgFile))) {
        if (!jobs.some(j => j.imgFile === f && ['queued', 'running', 'submitting', 'downloading'].includes(j.status))) {
          try { fs.unlinkSync(f); } catch (_) {}
        }
      }
      jobs = jobs.filter(j => Date.now() - j.created < 7 * 86400 * 1000);
      saveJobs();
    }
  }

  // 取消还没提交的（已经提交的取消不了，生成服务那边会照常完成）
  function cancelQueued() {
    let n = 0;
    for (const j of jobs) if (j.status === 'queued') { j.status = 'failed'; j.error = '已取消'; n++; }
    saveJobs();
    return n;
  }

  // 启动时接着查上次没完成的
  if (active().length) setTimeout(pump, 3000);

  return { loadConfig, saveConfig, publicConfig, ready, estimate, start, cancelQueued, busy: () => active().length > 0, counts };
}

module.exports = { createVideoGen, PROVIDERS };
