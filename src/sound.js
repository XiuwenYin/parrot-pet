// 用 WebAudio 合成叫声，不需要音频文件。每种鹦鹉一个"嗓音"（setVoice）：
//   lovebird 尖细短促的"啾"；budgie 叽叽喳喳的碎碎念；cockatiel 婉转口哨；monk 嘎嘎大嗓门
const Sound = (() => {
  let ctx;
  let muted = false;
  let voice = 'lovebird';
  let ttsFn = null;
  // 真实叫声：{ 家族: [地址] }；凯克没有录音，借和尚的、调高音调
  let bank = {};
  const BORROW = { caique: ['monk', 1.32] };
  function sample(fam, rate = 1, vol = 0.5, pick) {
    const [src, shift] = bank[fam] && bank[fam].length ? [fam, 1] : BORROW[fam] && bank[BORROW[fam][0]] ? BORROW[fam] : [null];
    if (!src) return 0;
    const list = pick ? bank[src].filter(u => u.includes(pick)) : bank[src];
    const url = (list.length ? list : bank[src])[Math.floor(Math.random() * (list.length || bank[src].length))];
    const a = new Audio(url);
    a.preservesPitch = false;
    a.playbackRate = rate * shift * rnd(0.93, 1.08);
    a.volume = vol;
    a.play().catch(() => {});
    return 0.45 / a.playbackRate;
  }        // 学舌用：主进程把文字合成成 WAV（base64）
  const ac = () => (ctx = ctx || new AudioContext());
  const rnd = (a, b) => a + Math.random() * (b - a);

  function tone(start, dur, f0, f1, vol = 0.12, type = 'sine', vibrato = 0) {
    const a = ac();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    o.frequency.exponentialRampToValueAtTime(f1, start + dur);
    if (vibrato) {
      const lfo = a.createOscillator();
      const lg = a.createGain();
      lfo.frequency.value = 7;
      lg.gain.value = vibrato;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(start);
      lfo.stop(start + dur + 0.02);
    }
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + Math.min(0.025, dur * 0.25));   // 起音别太陡，不然有咔哒声
    g.gain.setValueAtTime(vol, start + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    o.connect(g).connect(a.destination);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  // 带共振峰的"嗓音"：锯齿波过带通滤波器，用来模仿鹦鹉学说话的含糊音节
  function syllable(start, dur, pitch, formant, vol = 0.1) {
    const a = ac();
    const o = a.createOscillator();
    const f = a.createBiquadFilter();
    const g = a.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(pitch, start);
    o.frequency.linearRampToValueAtTime(pitch * rnd(0.85, 1.2), start + dur);
    f.type = 'bandpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(formant, start);
    f.frequency.linearRampToValueAtTime(formant * rnd(0.7, 1.4), start + dur);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    o.connect(f).connect(g).connect(a.destination);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  function noise(start, dur, freq, vol, type = 'highpass', q = 1) {
    const a = ac();
    const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    const src = a.createBufferSource();
    const f = a.createBiquadFilter();
    const g = a.createGain();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    src.buffer = buf;
    src.connect(f).connect(g).connect(a.destination);
    src.start(start);
  }

  // 玄凤口哨：原创的一段"咕叽咕叽"风格小调（音高=相对主音的半音，拍长）。
  // 想听真正的"玄凤国歌"：把录音放进素材文件夹 sounds/cockatiel-whistle.mp3，会优先播放。
  const TUNE = [[7, 0.5], [12, 0.5], [7, 1], [4, 0.5], [7, 0.5], [9, 1],
    [7, 0.5], [4, 0.5], [2, 1], [4, 0.5], [7, 0.5], [12, 1.5],
    [11, 0.5], [9, 0.5], [7, 0.5], [9, 0.5], [7, 2]];

  // 下面两首是照着玄凤录音里鸟自己吹的版本扒下来的（不是原曲）：音高用 MIDI 音号（带小数，鸟本来就吹得有点偏），
  // [开始秒, 时长秒, 音高, 颤音幅度Hz]
  // 第一首：先一个低音起头，往上一跳拉长颤音；第二句更高、再一路往下走
  const TUNE_A = [
    [0.00, 0.36, 89.4, 0], [0.42, 0.70, 97.8, 60],
    [1.75, 0.26, 89.4, 0], [2.03, 0.22, 97.8, 0], [2.30, 0.22, 97.8, 0], [2.58, 0.22, 97.6, 0], [2.84, 0.24, 96.7, 25],
    [3.13, 0.24, 97.6, 0], [3.44, 0.88, 99.1, 70],
    [4.75, 0.20, 99.0, 0], [5.02, 0.24, 97.8, 0], [5.30, 0.22, 96.0, 0], [5.60, 0.22, 96.0, 0], [5.88, 0.14, 96.0, 0],
    [6.00, 0.16, 98.0, 0], [6.18, 0.24, 95.7, 0], [6.48, 0.14, 95.6, 0], [6.64, 0.12, 94.5, 0], [6.80, 0.13, 96.1, 0],
    [6.94, 0.15, 98.3, 0], [7.12, 0.50, 95.1, 50],
  ];
  // 第二首"玄凤国歌"：一串短促上挑的"叽"，中间夹着拐个弯的"咕"（[开始秒, 'j' 叽 / 'g' 咕]）
  const TUNE_B = [
    [0.00, 'j'], [0.33, 'j'], [0.53, 'j'], [0.67, 'j'],
    [1.14, 'j'], [1.22, 'g'], [1.53, 'j'], [1.72, 'j'], [1.89, 'j'], [2.03, 'g'], [2.33, 'j'], [2.69, 'g'], [2.78, 'j'],
    [3.17, 'j'], [3.39, 'j'], [3.56, 'j'], [3.83, 'j'], [3.92, 'j'], [3.97, 'j'], [4.36, 'j'],
    [4.72, 'j'], [4.89, 'j'], [5.11, 'j'], [5.47, 'j'], [5.56, 'j'], [5.72, 'j'], [5.97, 'j'],
    [6.33, 'j'], [6.53, 'j'], [6.69, 'g'], [6.81, 'j'], [7.11, 'j'], [7.39, 'g'], [7.47, 'j'],
    [7.83, 'j'], [8.00, 'j'], [8.25, 'j'], [8.56, 'j'], [8.67, 'j'], [8.86, 'j'],
  ];
  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const voices = {
    lovebird: {
      chirp(now, i) { const b = rnd(2600, 3500); tone(now + i * 0.11, 0.07, b, b * rnd(1.25, 1.55), 0.1, 'triangle'); },
      song(now) { for (let i = 0; i < 6; i++) { const b = rnd(2200, 3800); tone(now + i * 0.13, 0.09, b, b * (Math.random() > 0.5 ? 1.4 : 0.75), 0.08); } },
    },
    budgie: {
      chirp(now, i) { const b = rnd(2400, 3200); tone(now + i * 0.08, 0.06, b, b * rnd(0.8, 1.3), 0.08, 'sine', 120); },
      // 虎皮的碎碎念：一长串快速、忽高忽低的小音
      song(now) { for (let i = 0; i < 14; i++) { const b = rnd(1900, 3600); tone(now + i * 0.075, 0.06, b, b * rnd(0.7, 1.4), 0.06, i % 3 ? 'sine' : 'triangle', 80); } },
    },
    cockatiel: {
      // 玄凤的"哔～哦"：先升后降的口哨
      chirp(now, i) { const b = rnd(1700, 2100); tone(now + i * 0.3, 0.12, b, b * 1.35, 0.09, 'sine', 30); tone(now + i * 0.3 + 0.12, 0.16, b * 1.35, b * 0.85, 0.08, 'sine', 30); },
      song(now) { return voices.cockatiel.tune(now); },
      tuneA(now) {
        for (const [t, d, m, vib] of TUNE_A) {
          const f = midiHz(m);
          tone(now + t, d, f * 0.96, f, 0.08, 'sine', vib);
        }
        return 7.7;
      },
      tuneB(now) {
        for (const [t, k] of TUNE_B) {
          const b = rnd(1330, 1450);
          if (k === 'j') tone(now + t, 0.07, b, b * 1.32, 0.09, 'sine');          // 叽：短促往上挑
          else { tone(now + t, 0.06, b * 1.1, b * 0.88, 0.08, 'sine'); tone(now + t + 0.06, 0.07, b * 0.88, b * 1.25, 0.08, 'sine'); }  // 咕：先下后上拐个弯
        }
        return 9.1;
      },
      tune(now) {
        const base = 1250;
        let t = now;
        for (const [semi, beats] of TUNE) {
          const f = base * Math.pow(2, semi / 12);
          // 口哨的滑音：每个音从下面一点滑上来
          tone(t, 0.3 * beats - 0.04, f * 0.94, f, 0.08, 'sine', 16);
          t += 0.3 * beats;
        }
        return t - now;
      },
    },
    // 凤头：沙哑的大嗓门"嗷"
    cockatoo: {
      chirp(now, i) { syllable(now + i * 0.22, 0.18, rnd(420, 560), rnd(1500, 2400), 0.12); noise(now + i * 0.22, 0.16, 2600, 0.05, 'bandpass', 1.2); },
      song(now) { for (let i = 0; i < 4; i++) { syllable(now + i * 0.25, 0.2, rnd(400, 600), rnd(1300, 2600), 0.1); noise(now + i * 0.25, 0.18, 2400, 0.04, 'bandpass', 1.2); } },
    },
    // 凯克：尖细响亮的哨音，忽高忽低
    caique: {
      chirp(now, i) { const b = rnd(2800, 3600); tone(now + i * 0.12, 0.09, b, b * rnd(0.7, 1.3), 0.09, 'triangle'); },
      song(now) { for (let i = 0; i < 8; i++) { const b = rnd(2400, 3800); tone(now + i * 0.11, 0.08, b, b * (i % 2 ? 1.35 : 0.75), 0.07); } },
    },
    // 非洲灰：低沉一点的口哨和咕哝
    grey: {
      chirp(now, i) { const b = rnd(1400, 1900); tone(now + i * 0.2, 0.14, b, b * 1.25, 0.08, 'sine', 20); },
      song(now) { for (let i = 0; i < 5; i++) { const b = rnd(1200, 2200); tone(now + i * 0.18, 0.15, b, b * (i % 2 ? 1.3 : 0.8), 0.07, 'sine', 15); } },
    },
    monk: {
      chirp(now, i) { syllable(now + i * 0.16, 0.13, rnd(700, 950), rnd(1400, 2200), 0.12); },
      song(now) { for (let i = 0; i < 5; i++) syllable(now + i * 0.17, 0.14, rnd(650, 1000), rnd(1200, 2600), 0.1); },
    },
  };

  return {
    setMuted(m) { muted = m; },
    setVoice(v) { voice = voices[v] ? v : 'lovebird'; },
    setBank(b) { bank = b || {}; },
    // 叫一声：有真实录音的鸟大多用录音（凯克借和尚的），偶尔混一下合成音
    chirp(n = 2) {
      if (muted) return;
      if ((bank[voice] || BORROW[voice]) && Math.random() < 0.8) {
        let t = 0;
        for (let i = 0; i < Math.min(n, 2); i++) { setTimeout(() => sample(voice), t * 1000); t += 0.32; }
        return;
      }
      const now = ac().currentTime;
      for (let i = 0; i < n; i++) voices[voice].chirp(now, i);
    },
    song() {
      if (muted) return;
      // 唱歌：几段录音接起来（虎皮用长一点的 song 段）
      if ((bank[voice] || BORROW[voice]) && Math.random() < 0.7) {
        const k = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < k; i++) setTimeout(() => sample(voice, 1, 0.45, voice === 'budgie' && i % 2 ? 'song' : null), i * 380);
        return;
      }
      voices[voice].song(ac().currentTime);
    },
    // 学说话：一串含糊的"音节"，音高按嗓音调
    talk(syllables = 5) {
      if (muted) return;
      const now = ac().currentTime;
      const pitch = { lovebird: 900, budgie: 1100, cockatiel: 800, monk: 620, cockatoo: 560, caique: 1000, grey: 700 }[voice] || 800;
      for (let i = 0; i < syllables; i++) {
        syllable(now + i * 0.16, 0.13, pitch * rnd(0.85, 1.25), rnd(900, 2600), 0.09);
      }
    },
    // 玄凤吹口哨，返回曲子时长（秒）。有自定义录音就播录音；which：'a' 第一首、'b' 玄凤国歌、'c' 原来那段小调
    whistle(customUrl, which = 'b') {
      if (muted) return 4;
      if (customUrl) {
        const a = new Audio(customUrl);
        a.volume = 0.8;
        a.play().catch(() => {});
        return 0;      // 时长等元数据加载后再定
      }
      const now = ac().currentTime, v = voices.cockatiel;
      return which === 'a' ? v.tuneA(now) : which === 'c' ? v.tune(now) : v.tuneB(now);
    },
    // 凤头尖叫：一长声沙哑的"啊——"，带噪音
    scream(dur = 1.2) {
      if (muted) return;
      if (bank.cockatoo && bank.cockatoo.length) {       // 用真凤头的尖叫
        sample('cockatoo', 1, 0.6);
        if (dur > 0.9) setTimeout(() => sample('cockatoo', 0.95, 0.6), 520);
        return;
      }
      const now = ac().currentTime;
      syllable(now, dur, 520, 2200, 0.16);
      syllable(now + 0.02, dur * 0.95, 780, 3200, 0.08);
      noise(now, dur, 2800, 0.09, 'bandpass', 0.9);
    },
    // 非洲灰模仿：手机铃声 / 微波炉"叮" / 门铃 / 口哨
    mimic(kind) {
      if (muted) return 2;
      const now = ac().currentTime;
      if (kind === 'phone') {
        for (let r = 0; r < 2; r++) for (let i = 0; i < 10; i++) tone(now + r * 1.0 + i * 0.05, 0.045, i % 2 ? 1320 : 1760, i % 2 ? 1320 : 1760, 0.06, 'square');
        return 2.2;
      }
      if (kind === 'microwave') { tone(now, 0.05, 2000, 2000, 0.05); tone(now + 0.6, 0.9, 1568, 1560, 0.09, 'sine'); return 1.8; }
      if (kind === 'doorbell') { tone(now, 0.5, 1318, 1318, 0.09, 'triangle'); tone(now + 0.45, 0.8, 1046, 1046, 0.09, 'triangle'); return 1.6; }
      // 两声口哨"嘘～哟"
      tone(now, 0.35, 1400, 2600, 0.08); tone(now + 0.45, 0.45, 2600, 1300, 0.08);
      return 1.2;
    },
    // 鹦鹉学舌：系统语音先合成成音频（setTts 传进来的函数，主进程用 say/系统语音），再加"鹦鹉嗓"：
    // 音调和语速提一点、削掉低频的人声厚度、突出 2～4kHz 的尖鼻音、加一点 30Hz 左右的沙哑颤动和轻微失真
    async speak(text) {
      if (muted || !text || !ttsFn) return;
      let b64;
      try { b64 = await ttsFn(String(text)); } catch (_) { return; }
      if (!b64) return;
      try {
        const a = ac();
        const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const buf = await a.decodeAudioData(bin.buffer);
        const src = a.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = 1.22;
        const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 650; hp.Q.value = 0.8;
        const nasal = a.createBiquadFilter(); nasal.type = 'peaking'; nasal.frequency.value = 2900; nasal.Q.value = 1.4; nasal.gain.value = 9;
        const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
        const shaper = a.createWaveShaper();
        const curve = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(2.2 * x); }
        shaper.curve = curve;
        const trem = a.createGain(); trem.gain.value = 0.75;
        const lfo = a.createOscillator(); lfo.frequency.value = 31;
        const lfoGain = a.createGain(); lfoGain.gain.value = 0.25;
        lfo.connect(lfoGain).connect(trem.gain);
        const out = a.createGain(); out.gain.value = 1.4;
        src.connect(hp).connect(nasal).connect(shaper).connect(lp).connect(trem).connect(out).connect(a.destination);
        const now = a.currentTime;
        lfo.start(now); src.start(now);
        lfo.stop(now + buf.duration / 1.22 + 0.1);
      } catch (_) {}
    },
    setTts(fn) { ttsFn = fn; },
    // 玄凤哈气
    hiss() {
      if (muted) return;
      noise(ac().currentTime, 0.55, 3500, 0.18, 'bandpass', 0.8);
    },
    // 嗑瓜子
    crack() {
      if (muted) return;
      noise(ac().currentTime, 0.03, 2500, 0.25);
    },
    // 咬合"咔"的一声
    snap() {
      if (muted) return;
      tone(ac().currentTime, 0.035, 900, 300, 0.25, 'square');
    },
    // 生气的尖叫（和尚更粗）
    squawk() {
      if (muted) return;
      const now = ac().currentTime;
      if (voice === 'monk') {
        syllable(now, 0.2, 520, 1600, 0.16);
        syllable(now + 0.22, 0.18, 560, 1400, 0.14);
        return;
      }
      tone(now, 0.18, 1800, 3200, 0.09, 'sawtooth');
      tone(now + 0.2, 0.16, 2000, 3000, 0.08, 'sawtooth');
    },
  };
})();
