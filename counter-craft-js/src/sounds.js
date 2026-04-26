export function createSounds() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const ctx = AudioContextClass ? new AudioContextClass() : null;
  const masterGain = ctx ? ctx.createGain() : null;

  if (masterGain) {
    masterGain.gain.value = 0.45;
    masterGain.connect(ctx.destination);
  }

  function resume() {
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  function playShoot() {
    if (!ctx) return;
    resume();

    const t = now();
    const noise = createNoiseBuffer(0.11);
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    source.buffer = noise;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1800, t);
    filter.Q.setValueAtTime(0.9, t);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.65, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.02, t + 0.11);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start(t);
    source.stop(t + 0.12);

    const punch = ctx.createOscillator();
    const punchGain = ctx.createGain();
    punch.type = "triangle";
    punch.frequency.setValueAtTime(95, t);
    punch.frequency.exponentialRampToValueAtTime(42, t + 0.055);
    punchGain.gain.setValueAtTime(0.5, t);
    punchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    punch.connect(punchGain);
    punchGain.connect(masterGain);
    punch.start(t);
    punch.stop(t + 0.08);
  }

  function playReload() {
    if (!ctx) return;
    resume();

    const t = now();
    playClick(t, 0.16, 900, 0.08);
    playClick(t + 0.28, 0.12, 650, 0.08);
    playClick(t + 0.58, 0.18, 1200, 0.1);
  }

  function playEmpty() {
    if (!ctx) return;
    resume();
    playClick(now(), 0.11, 1400, 0.05);
  }

  function playEnemyHit() {
    if (!ctx) return;
    resume();

    const t = now();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.12);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  function playEnemyDie() {
    if (!ctx) return;
    resume();

    const t = now();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(155, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.28);
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.34);
  }

  function playPlayerHit() {
    if (!ctx) return;
    resume();

    const t = now();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  function playClick(startTime, volume, frequency, duration) {
    const noise = createNoiseBuffer(duration);
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    source.buffer = noise;
    filter.type = "highpass";
    filter.frequency.setValueAtTime(frequency, startTime);
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start(startTime);
    source.stop(startTime + duration);
  }

  function createNoiseBuffer(duration) {
    const sampleRate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    return buffer;
  }

  return {
    resume,
    playShoot,
    playReload,
    playEmpty,
    playEnemyHit,
    playEnemyDie,
    playPlayerHit
  };
}
