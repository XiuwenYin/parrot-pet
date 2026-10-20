// 用 WebAudio 合成叫声，不需要音频文件。每种鹦鹉一个"嗓音"（setVoice）：
//   lovebird 尖细短促的"啾"；budgie 叽叽喳喳的碎碎念；cockatiel 婉转口哨；monk 嘎嘎大嗓门
const Sound = (() => {
  let ctx;
  let muted = false;
  let voice = 'lovebird';
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
    g.gain.linearRampToValueAtTime(vol, start + 0.01);
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
    monk: {
      chirp(now, i) { syllable(now + i * 0.16, 0.13, rnd(700, 950), rnd(1400, 2200), 0.12); },
      song(now) { for (let i = 0; i < 5; i++) syllable(now + i * 0.17, 0.14, rnd(650, 1000), rnd(1200, 2600), 0.1); },
    },
  };

  return {
    setMuted(m) { muted = m; },
    setVoice(v) { voice = voices[v] ? v : 'lovebird'; },
    chirp(n = 2) {
      if (muted) return;
      const now = ac().currentTime;
      for (let i = 0; i < n; i++) voices[voice].chirp(now, i);
    },
    song() {
      if (muted) return;
      voices[voice].song(ac().currentTime);
    },
    // 学说话：一串含糊的"音节"，音高按嗓音调
    talk(syllables = 5) {
      if (muted) return;
      const now = ac().currentTime;
      const pitch = { lovebird: 900, budgie: 1100, cockatiel: 800, monk: 620 }[voice];
      for (let i = 0; i < syllables; i++) {
        syllable(now + i * 0.16, 0.13, pitch * rnd(0.85, 1.25), rnd(900, 2600), 0.09);
      }
    },
    // 玄凤吹口哨，返回曲子时长（秒）。有自定义录音就播录音
    whistle(customUrl) {
      if (muted) return 4;
      if (customUrl) {
        const a = new Audio(customUrl);
        a.volume = 0.8;
        a.play().catch(() => {});
        return 0;      // 时长等元数据加载后再定
      }
      return voices.cockatiel.tune(ac().currentTime);
    },
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
