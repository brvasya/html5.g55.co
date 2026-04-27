export function createSounds() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const ctx = AudioContextClass ? new AudioContextClass() : null;
  const masterGain = ctx ? ctx.createGain() : null;

  if (masterGain) {
    masterGain.gain.value = 1.0;
    masterGain.connect(ctx.destination);
  }

  function resume() {
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  function playShoot(asset) {
    if (!ctx) return;
    resume();

    if (asset?.fireSound) {
      playFromAsset(asset.fireSound, 1.0);
      return;
    }

    return;
  }

  function playReload() {
    if (!ctx) return;
    resume();
    const t = now();
    playClick(t, 1.0, 900, 0.08);
    playClick(t + 0.28, 1.0, 650, 0.08);
    playClick(t + 0.58, 1.0, 1200, 0.1);
  }

  function playEmpty() {
    if (!ctx) return;
    resume();
    playClick(now(), 1.0, 1400, 0.05);
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
    gain.gain.setValueAtTime(1.0, t);
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
    gain.gain.setValueAtTime(1.0, t);
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
    gain.gain.setValueAtTime(1.0, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  function playFootstep(walking = false, speed01 = 1) {
    if (!ctx) return;
    resume();

    const t = now();
    const low = ctx.createOscillator();
    const lowGain = ctx.createGain();
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    source.buffer = createNoiseBuffer(0.095);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(walking ? 150 : 230, t);
    filter.Q.setValueAtTime(0.9, t);

    const volume = 1.0;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume * Math.max(0.65, speed01), t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start(t);
    source.stop(t + 0.12);

    low.type = "sine";
    low.frequency.setValueAtTime(walking ? 85 : 105, t);
    low.frequency.exponentialRampToValueAtTime(walking ? 55 : 70, t + 0.06);
    lowGain.gain.setValueAtTime(0.6, t);
    lowGain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
    low.connect(lowGain);
    lowGain.connect(masterGain);
    low.start(t);
    low.stop(t + 0.085);
  }

  function playClick(startTime, volume, frequency, duration) {
    if (!ctx) return;

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

  function playFromAsset(src, volume = 1.0) {
    const audio = new Audio(src);
    audio.volume = volume;
    audio.currentTime = 0;
    audio.play().catch(() => {});
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
    playPlayerHit,
    playFootstep
  };
}
