export function createSounds() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const ctx = AudioContextClass ? new AudioContextClass() : null;
  const masterGain = ctx ? ctx.createGain() : null;

  if (masterGain) {
    masterGain.gain.value = 1.0;
    masterGain.connect(ctx.destination);
  }

  const JUMP_SOUND = "data:audio/ogg;base64,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";

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

  function playJump() {
    if (!ctx) return;
    resume();
    playFromAsset(JUMP_SOUND, 1.0);
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
    playFootstep,
    playJump
  };
}