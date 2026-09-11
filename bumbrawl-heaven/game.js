/* Rendering, controls, and procedural audio. Artwork is local; no runtime services. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const moreGamesButtons = [...document.querySelectorAll('.more-games-button')];
  for (const moreGamesButton of moreGamesButtons) {
    moreGamesButton.href = `https://g55.co/?utm_source=moreGamesButton&utm_medium=${encodeURIComponent(document.title)}`;
  }
  const canvas = $('game'), ctx = canvas.getContext('2d', { alpha: false });
  const frame = $('gameFrame'), engine = new HaloEngine();
  const ink = '#17242c', gold = '#ffda46';
  let W = 1280, H = 720, scale = 1, now = 0, lastTime = 0, loaded = false;
  let best = 0, bestCombo = 0, muted = false, audioContext = null, audioGain = null;
  let bannerTime = 0, endTime = -1, shake = 0, flash = 0, specialRing = null;
  let lastHud = '', musicBeat = 0, nextBeat = 0;
  let particles = [], labels = [], sparks = [];
  const keys = new Set(), heldActions = new Set(), stick = { x: 0, y: 0, pointer: null };
  const coarse = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
  const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
  try { best = +localStorage.getItem('halo-havoc-best') || 0; bestCombo = +localStorage.getItem('halo-havoc-combo') || 0; muted = localStorage.getItem('halo-havoc-muted') === 'true'; } catch (_) {}
  const locations = [
    { id: 'golden-gates', name: 'GOLDEN GATES', src: 'assets/halo-havoc-arena.png', colors: ['#fff48b', '#ffffff'] },
    { id: 'cloud-gardens', name: 'CLOUD GARDENS', src: 'assets/cloud-gardens.png', colors: ['#ffb7cf', '#e7fff0'] },
    { id: 'celestial-archives', name: 'CELESTIAL ARCHIVES', src: 'assets/celestial-archives.png', colors: ['#ffdba6', '#ffefa0'] },
    { id: 'storm-bridge', name: 'STORM BRIDGE', src: 'assets/storm-bridge.png', colors: ['#d7e9ff', '#bfb7ff'] },
    { id: 'throne-of-heaven', name: 'THRONE OF HEAVEN', src: 'assets/throne-of-heaven.png', colors: ['#ffe9ab', '#ffcbcc'] }
  ].map(location => ({ ...location, image: new Image() }));
  const atlas = new Image(), combatAtlas = new Image(), bossAtlas = new Image();
  let combatSprites = null;
  const bossSprites = [];
  const bossFrames = [
    // source bounds and foot pivots: idle, walk, wind-up, strike, hurt, defeated.
    [8,95,419,506,198,598], [430,116,438,484,640,598], [846,12,399,589,1083,599],
    [7,730,464,405,194,1124], [476,705,391,430,674,1132], [795,962,449,213,1020,1173]
  ];
  const combatFrames = [
    [12,6,291,329,135,325], [309,4,310,330,465,325], [632,7,376,326,790,325], [1010,7,244,329,1147,325],
    [4,343,298,321,146,659], [307,344,317,321,465,659], [627,344,381,321,780,659], [1010,344,244,321,1145,659],
    [9,670,294,328,143,991], [307,670,316,328,472,991], [630,670,379,328,789,991], [1010,670,244,328,1147,991],
    [24,1013,243,229], [351,1008,241,231], [660,996,279,245], [998,1009,229,233]
  ];
  const enemyArt = { runner: { row: 0, name: 'RUNNER', color: '#ff8061' }, sentinel: { row: 1, name: 'SENTINEL', color: '#68d7ff' }, scribe: { row: 2, name: 'SCRIBE', color: '#d5a3ff' } };
  const pickupArt = {
    health: { frame: 12, label: 'HEALTH +30', color: '#ff777d' },
    halo: { frame: 13, label: 'HALO +50', color: '#ffdf59' },
    fury: { frame: 14, label: '2× DAMAGE', color: '#ffa34b' },
    shield: { frame: 15, label: 'SHIELD 8s', color: '#7ce8ff' }
  };
  let activeLocation = 0, previousLocation = 0, locationFade = 0;
  const frames = [
    // source x/y/width/height, foot pivot x/y (atlas coordinates)
    [66,8,221,342,174,346], [403,20,283,327,554,343],
    [768,19,312,335,870,348], [1140,18,286,334,1240,348],
    [1487,36,298,320,1615,350], [1891,6,217,347,2004,349],
    [37,373,263,339,171,706], [367,380,319,325,550,701],
    [731,382,349,330,876,708], [1109,383,348,329,1256,708],
    [1476,396,322,316,1628,708], [1846,384,308,328,2001,708]
  ];
  function persist() { try { localStorage.setItem('halo-havoc-best', best); localStorage.setItem('halo-havoc-combo', bestCombo); } catch (_) {} }
  function unlockAudio() {
    try {
      if (!audioContext) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        audioContext = new Audio(); audioGain = audioContext.createGain();
        audioGain.gain.value = muted ? 0 : .6; audioGain.connect(audioContext.destination);
      }
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch (_) {}
  }
  function tone(freq, duration = .1, type = 'square', volume = .05, endFreq = freq) {
    if (!audioContext || muted || audioContext.state !== 'running') return;
    const t = audioContext.currentTime, o = audioContext.createOscillator(), g = audioContext.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
    g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration);
    o.connect(g); g.connect(audioGain); o.start(t); o.stop(t + duration + .01);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  function noise(duration = .1, volume = .06) {
    if (!audioContext || muted || audioContext.state !== 'running') return;
    const buffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * duration), audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const src = audioContext.createBufferSource(), g = audioContext.createGain();
    src.buffer = buffer; g.gain.value = volume; src.connect(g); g.connect(audioGain); src.start();
    src.onended = () => { src.disconnect(); g.disconnect(); };
  }
  function sound(kind) {
    if (kind === 'punch' || kind === 'uppercut') { tone(150, .11, 'triangle', .13, 42); noise(.1, .1); }
    else if (kind === 'kick') { tone(105, .18, 'triangle', .19, 30); noise(.16, .14); }
    else if (kind === 'swing') noise(.065, .025);
    else if (kind === 'hurt') { tone(130, .24, 'sawtooth', .04, 45); noise(.12, .08); }
    else if (kind === 'jump') tone(170, .15, 'square', .024, 480);
    else if (kind === 'ko') { tone(440, .12, 'square', .025, 660); tone(880, .2, 'triangle', .035); }
    else if (kind === 'special') { tone(120, .65, 'sawtooth', .07, 850); noise(.45, .12); tone(660, .7, 'triangle', .09, 220); }
    else if (kind === 'ready') { tone(523, .2, 'square', .025); tone(784, .38, 'triangle', .07); }
    else if (kind === 'wave') { tone(220, .28, 'square', .03); tone(330, .35, 'triangle', .07); }
    else if (kind === 'win') { [262,330,392,523].forEach((f, i) => tone(f, .6 + i * .12, 'triangle', .045)); }
    else if (kind === 'lose') { tone(180, .8, 'triangle', .15, 50); }
    else if (kind === 'pickup') { tone(660, .12, 'triangle', .1, 880); tone(1047, .3, 'triangle', .07); }
    else if (kind === 'block') { tone(720, .1, 'triangle', .055, 350); noise(.04, .035); }
    else if (kind === 'bolt') { tone(820, .16, 'sine', .04, 280); }
  }
  function music() {
    if (engine.time < nextBeat) return;
    nextBeat = engine.time + .29;
    const bass = [130.81,0,130.81,155.56,0,130.81,196,155.56,116.54,0,116.54,130.81,0,155.56,116.54,98];
    const n = bass[musicBeat++ % bass.length];
    if (n) tone(n, .13, 'triangle', .034);
    if (musicBeat % 4 === 0) noise(.035, .018);
  }
  function resize() {
    const width = Math.max(1, frame.clientWidth), height = Math.max(1, frame.clientHeight);
    frame.style.setProperty('--u', Math.min(width / 100, height / 56.25) + 'px');
    W = Math.round(720 * width / height); H = 720;
    scale = Math.min(devicePixelRatio || 1, 2) * height / H;
    canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
    engine.resize(W);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  }
  new ResizeObserver(resize).observe(frame);
  function setLocation(index, animate = false) {
    previousLocation = activeLocation; activeLocation = index;
    locationFade = animate && previousLocation !== activeLocation && !reduceMotion ? .75 : 0;
    frame.dataset.location = locations[index].id;
  }
  function showBanner(kicker, title, duration = 2.2) {
    $('bannerKicker').textContent = kicker; $('bannerTitle').textContent = title;
    $('banner').hidden = false; bannerTime = duration;
    $('announcer').textContent = title;
  }
  function clearInput() { keys.clear(); heldActions.clear(); stick.x = stick.y = 0; stick.pointer = null; $('joystickKnob').style.transform = ''; }
  function focusGame() { canvas.focus({ preventScroll: true }); }
  function updateSoundButton() {
    $('soundButton').classList.toggle('muted', muted);
    $('soundButton').setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
    $('soundButton').title = muted ? 'Sound off (M)' : 'Sound on (M)';
  }
  function toggleSound() {
    muted = !muted; unlockAudio(); if (audioGain) audioGain.gain.value = muted ? 0 : .6;
    try { localStorage.setItem('halo-havoc-muted', muted); } catch (_) {}
    updateSoundButton();
  }
  function startGame() {
    if (!loaded) return;
    unlockAudio(); clearInput(); particles = []; labels = []; sparks = []; specialRing = null;
    shake = flash = 0; endTime = -1; nextBeat = 0; musicBeat = 0; lastHud = '';
    setLocation(0);
    $('menuScreen').hidden = $('pauseScreen').hidden = $('endScreen').hidden = true;
    $('hud').hidden = false; $('pauseButton').disabled = false;
    $('pauseButton').setAttribute('aria-label', 'Pause game');
    $('pauseButton').title = 'Pause (P)';
    $('mobileControls').hidden = !coarse; engine.start(); focusGame();
  }
  function showTitle() {
    engine.mode = 'title'; clearInput(); bannerTime = 0; endTime = -1;
    setLocation(0);
    particles = []; labels = []; sparks = []; shake = flash = 0; specialRing = null;
    for (const id of ['hud','pauseScreen','endScreen','banner','combo','specialReady','mobileControls']) $(id).hidden = true;
    $('menuScreen').hidden = false; $('pauseButton').disabled = true;
    $('startButton').focus({ preventScroll: true });
  }
  function pauseGame(force) {
    if (engine.mode !== 'playing' && engine.mode !== 'paused') return;
    const pause = typeof force === 'boolean' ? force : engine.mode === 'playing';
    engine.mode = pause ? 'paused' : 'playing'; clearInput();
    $('pauseScreen').hidden = !pause; $('mobileControls').hidden = pause || !coarse;
    $('pauseButton').setAttribute('aria-label', pause ? 'Resume game' : 'Pause game');
    $('pauseButton').title = pause ? 'Resume (P)' : 'Pause (P)';
    if (pause) $('resumeButton').focus({ preventScroll: true }); else focusGame();
  }
  function showEnd(won) {
    best = Math.max(best, engine.score); bestCombo = Math.max(bestCombo, engine.maxCombo); persist();
    $('endKicker').textContent = won ? 'PARADISE, PROPERLY CRASHED' : 'BACK TO EARTH';
    $('endTitle').textContent = won ? 'HEAVEN IS YOURS!' : 'KNOCKED OUT!';
    $('endDescription').textContent = won ? 'Sixty angels down. They really should have let you in.' : 'Kick to break shields. Jump over bolts. Collect power-ups and come back swinging.';
    $('finalScore').textContent = String(engine.score).padStart(6, '0');
    $('finalCombo').textContent = engine.maxCombo + ' HITS';
    $('endScreen').hidden = false; $('mobileControls').hidden = true; $('pauseButton').disabled = true;
    $('banner').hidden = $('combo').hidden = $('specialReady').hidden = true;
    $('retryButton').focus({ preventScroll: true });
    $('announcer').textContent = (won ? 'Victory! ' : 'Knocked out. ') + 'Score ' + engine.score;
  }
  function burst(x, y, count, colors, strength = 1) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, speed = (70 + Math.random() * 260) * strength;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: .35 + Math.random() * .25, max: .6, size: 3 + Math.random() * 5,
        color: colors[i % colors.length], rotation: Math.random() * 6 });
    }
  }
  function floatText(text, x, y, color = gold, size = 29, life = .7) { labels.push({ text, x, y, color, size, life, max: life, rotate: (Math.random() - .5) * .25 }); }
  function events() {
    for (const e of engine.drainEvents()) {
      if (e.type === 'wave') {
        setLocation(e.number - 1, true);
        const waveLabel = e.boss ? 'FINAL WAVE' : `WAVE ${String(e.number).padStart(2,'0')} / 05`;
        showBanner(`${waveLabel} · ${locations[activeLocation].name}`, e.name, 2.4); sound('wave');
      }
      else if (e.type === 'clear') { showBanner(e.final ? 'ALL FIVE WAVES COMPLETE' : 'WAVE CLEAR' + (e.heal ? ` · +${e.heal} HEALTH` : ''), e.final ? 'GATES: CRASHED.' : ['NICE ENTRANCE!','STILL NOT SORRY.','BAD DAY FOR ANGELS.','ONE MORE TO GO!'][e.number - 1], 2.5); sound('win'); }
      else if (e.type === 'hit' || e.type === 'hurt') {
        const hurt = e.type === 'hurt'; shake = Math.max(shake, hurt ? 7 : e.heavy ? 9 : 4);
        burst(e.x, e.y, e.heavy ? 16 : 10, hurt ? ['#ff8f72','#fff6c9'] : [gold,'#fff9df','#ffa62f'], e.heavy ? 1.25 : .8);
        sparks.push({ x: e.x, y: e.y, life: .18, size: e.heavy ? 67 : 45, angle: Math.random() });
        sound(hurt ? 'hurt' : e.heavy ? 'kick' : 'punch');
        if (hurt) { flash = .12; floatText('−' + e.damage, e.x, e.y - 42, '#ff7563', 25); }
        else if (e.heavy || e.combo % 3 === 0) floatText(e.special ? 'HALO BLAST!' : ['POW!','WHAM!','BONK!','THWACK!'][Math.floor(Math.random() * 4)], e.x, e.y - 50, gold, e.special ? 42 : 32);
      }
      else if (e.type === 'swing') sound('swing');
      else if (e.type === 'ko') { floatText(e.boss ? 'BIG GUY. BIG FALL.' : 'K.O.!', e.x, e.y, '#fffce8', e.boss ? 40 : 35, .9); sound('ko'); }
      else if (e.type === 'jump') { burst(e.x, e.y, 7, ['#edfaff','#b9dce7'], .5); sound('jump'); }
      else if (e.type === 'special') { specialRing = { x: e.x, y: e.y, life: .65 }; shake = 15; flash = .1; sound('special'); burst(e.x,e.y,45,[gold,'#fffce8','#7cf6ff'],1.7); }
      else if (e.type === 'ready') { sound('ready'); floatText('HALO READY!', engine.player.x, engine.player.y - 280, gold, 28, 1.1); }
      else if (e.type === 'drop') { burst(e.x, e.y - 30, 9, [pickupArt[e.kind].color, '#fff9df'], .55); }
      else if (e.type === 'pickup') {
        const art = pickupArt[e.kind];
        const message = e.kind === 'health' ? '+' + e.amount + ' HEALTH' : e.kind === 'halo' ? '+' + e.amount + ' HALO' : e.kind === 'shield' ? 'SHIELD · 8s' : art.label + ' · 8s';
        floatText(message, e.x, e.y, art.color, 29, 1.4); burst(e.x, e.y + 75, 18, [art.color, '#fff9df'], .9); sound('pickup');
        $('announcer').textContent = message;
      }
      else if (e.type === 'block') { floatText('BLOCKED', e.x, e.y - 45, '#8adfff', 22, .5); sound('block'); burst(e.x, e.y, 5, ['#8adfff', '#fff9df'], .45); }
      else if (e.type === 'guardBreak') { floatText('GUARD BROKEN!', e.x, e.y - 70, '#8adfff', 26, 1); burst(e.x, e.y, 14, ['#8adfff', '#fff9df'], .8); sound('kick'); }
      else if (e.type === 'shieldBlock') { burst(e.x, e.y, 8, ['#7ce8ff', '#fff9df'], .8); sound('block'); }
      else if (e.type === 'bolt') sound('bolt');
      else if (e.type === 'end') { clearInput(); endTime = .75; sound(e.won ? 'win' : 'lose'); }
    }
  }
  function prepareCombatSprites() {
    // Color-key the supplied sheet once for transparent runtime compositing.
    const surface = document.createElement('canvas');
    const width = surface.width = combatAtlas.width, height = surface.height = combatAtlas.height;
    const context = surface.getContext('2d', { willReadFrequently: true });
    context.drawImage(combatAtlas, 0, 0);
    const pixels = context.getImageData(0, 0, width, height), data = pixels.data, count = width * height;
    const gray = new Uint8Array(count), seen = new Uint32Array(count), queue = new Int32Array(count);
    for (let i = 0; i < count; i++) {
      const o = i * 4, r = data[o], g = data[o + 1], b = data[o + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) <= 18 && g >= 102 && g <= 224) gray[i] = 1;
    }
    for (let seed = 0; seed < count; seed++) {
      if (!gray[seed] || seen[seed]) continue;
      let head = 0, tail = 1, edge = false, checks = 0;
      const region = seed + 1;
      queue[0] = seed; seen[seed] = region;
      while (head < tail) {
        const i = queue[head++], x = i % width, y = Math.floor(i / width);
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edge = true;
        for (const n of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) {
          if (n >= 0 && gray[n] && !seen[n]) { seen[n] = region; queue[tail++] = n; }
        }
      }
      if (!edge) {
        // A repeated pattern must occupy this region itself, not nearby armor or background.
        for (let j = 0; j < tail; j++) {
          const i = queue[j];
          if (i % width < width - 20 && seen[i + 10] === region && seen[i + 20] === region &&
            Math.abs(data[i * 4 + 1] - data[(i + 10) * 4 + 1]) > 32 && Math.abs(data[i * 4 + 1] - data[(i + 20) * 4 + 1]) < 18) checks++;
        }
      }
      if (edge || checks >= Math.max(3, tail * .08)) for (let i = 0; i < tail; i++) data[queue[i] * 4 + 3] = 0;
    }
    context.putImageData(pixels, 0, 0); combatSprites = surface;
  }
  function drawCombatSprite(type, pose, x, y, facing, size, rotation, alpha) {
    const row = enemyArt[type].row, f = combatFrames[row * 4 + (pose === 4 ? 3 : pose >= 2 ? 2 : pose)];
    const normal = 342 / combatFrames[row * 4][3];
    ctx.save(); ctx.translate(x, y); ctx.scale(facing * size * normal, size * normal); ctx.rotate(rotation); ctx.globalAlpha = alpha;
    ctx.drawImage(combatSprites, f[0], f[1], f[2], f[3], f[0] - f[4], f[1] - f[5], f[2], f[3]); ctx.restore();
  }
  function prepareBossSprites() {
    const surface = document.createElement('canvas');
    surface.width = bossAtlas.width; surface.height = bossAtlas.height;
    const context = surface.getContext('2d', { willReadFrequently: true });
    context.drawImage(bossAtlas, 0, 0);
    const pixels = context.getImageData(0, 0, surface.width, surface.height), data = pixels.data;
    // The boss uses a dedicated magenta key, keeping every armor and beard color opaque.
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (Math.min(r, b) - g > 35 && Math.abs(r - b) < 70) data[i + 3] = 0;
    }
    // Isolate each connected pose so oversized keys never bleed into a neighboring frame.
    const width = surface.width, count = width * surface.height;
    const seen = new Uint8Array(count), queue = new Int32Array(count);
    const seeds = [[200,310], [637,310], [1085,300], [209,900], [641,919], [1090,1040]];
    for (let pose = 0; pose < bossFrames.length; pose++) {
      const f = bossFrames[pose], sprite = document.createElement('canvas');
      sprite.width = f[2]; sprite.height = f[3];
      const spriteContext = sprite.getContext('2d'), output = spriteContext.createImageData(f[2], f[3]);
      const seed = seeds[pose][1] * width + seeds[pose][0];
      let head = 0, tail = 1; queue[0] = seed; seen[seed] = 1;
      while (head < tail) {
        const i = queue[head++], x = i % width, y = Math.floor(i / width), offset = i * 4;
        if (x >= f[0] && x < f[0] + f[2] && y >= f[1] && y < f[1] + f[3]) {
          const target = ((y - f[1]) * f[2] + x - f[0]) * 4;
          for (let channel = 0; channel < 4; channel++) output.data[target + channel] = data[offset + channel];
        }
        for (const n of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i >= width ? i - width : -1, i < count - width ? i + width : -1]) {
          if (n >= 0 && !seen[n] && data[n * 4 + 3] > 0) { seen[n] = 1; queue[tail++] = n; }
        }
      }
      spriteContext.putImageData(output, 0, 0); bossSprites.push(sprite);
    }
  }
  function drawBossSprite(pose, x, y, facing, size, rotation, alpha) {
    const f = bossFrames[pose], normal = 342 / bossFrames[0][3];
    ctx.save(); ctx.translate(x, y); ctx.scale(facing * size * normal, size * normal); ctx.rotate(rotation); ctx.globalAlpha = alpha;
    ctx.drawImage(bossSprites[pose], 0, 0, f[2], f[3], f[0] - f[4], f[1] - f[5], f[2], f[3]); ctx.restore();
  }
  function drawPickup(item) {
    const art = pickupArt[item.kind], f = combatFrames[art.frame], bob = Math.sin(engine.time * 4 + item.id) * 5;
    const ratio = 54 / Math.max(f[2], f[3]);
    ctx.save(); ctx.globalAlpha = item.life < 4 ? .55 + Math.sin(engine.time * 12) * .35 : 1;
    ellipse(item.x, item.y + 3, 29, 8, '#17242c40');
    ctx.strokeStyle = art.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(item.x, item.y, 32, 10, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.drawImage(combatSprites, f[0], f[1], f[2], f[3], item.x - f[2] * ratio / 2, item.y - 65 + bob, f[2] * ratio, f[3] * ratio);
    outlinedText(art.label, item.x, item.y + 20, 14, art.color); ctx.restore();
  }
  function drawBolt(bolt) {
    const y = bolt.y - bolt.z;
    ctx.save(); ctx.strokeStyle = '#c591ff'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.globalAlpha = .65;
    ctx.beginPath(); ctx.moveTo(bolt.x - bolt.dir * 33, y); ctx.lineTo(bolt.x, y); ctx.stroke(); ctx.globalAlpha = 1;
    ellipse(bolt.x, y, 13, 10, '#bf78ee'); ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();
    ellipse(bolt.x + bolt.dir * 2, y - 1, 7, 6, '#fff5b7'); ctx.restore();
  }
  function drawSprite(row, pose, x, y, facing = 1, size = 1, rotation = 0, alpha = 1, tint = '') {
    const f = frames[row * 6 + pose];
    ctx.save(); ctx.translate(x, y); ctx.scale(facing * size, size); ctx.rotate(rotation);
    ctx.globalAlpha = alpha;
    if (tint) ctx.filter = tint;
    ctx.drawImage(atlas, f[0],f[1],f[2],f[3], f[0]-f[4],f[1]-f[5],f[2],f[3]);
    ctx.restore();
  }
  function ellipse(x,y,rx,ry,fill) { ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2); ctx.fillStyle = fill; ctx.fill(); }
  function outlinedText(text,x,y,size,color=gold,rotation=0) {
    ctx.save(); ctx.translate(x,y); ctx.rotate(rotation); ctx.font = `900 ${size}px Impact, 'Arial Black', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * .14);
    ctx.strokeStyle = ink; ctx.strokeText(text,0,0); ctx.fillStyle = color; ctx.fillText(text,0,0); ctx.restore();
  }
  function paintLocation(index) {
    const background = locations[index].image;
    const s = Math.max(W / background.width, H / background.height);
    const width = background.width * s, height = background.height * s;
    // Keep the fighting floor aligned when the iframe is wider than the artwork.
    ctx.drawImage(background, (W - width) / 2, (H - height) * .62, width, height);
  }
  function drawBackground() {
    const location = locations[activeLocation];
    paintLocation(activeLocation);
    if (locationFade > 0) {
      ctx.save(); ctx.globalAlpha = locationFade / .75;
      paintLocation(previousLocation); ctx.restore();
    }
    // Slow floating flecks add depth without distracting from the fighting plane.
    ctx.save();
    for (let i=0;i<16;i++) {
      const x = ((i*173.7 + now * ((location.id === 'storm-bridge' ? 75 : 5) + i%3)) % (W+50))-25;
      const y = 190 + (i*89)%385 + Math.sin(now*.65 + i)*13;
      ctx.globalAlpha = .35 + Math.sin(now+i)*.15;
      ctx.fillStyle = location.colors[i%3===0 ? 0 : 1]; ctx.fillRect(x,y,i%3+2,i%3+2);
    }
    ctx.restore();
  }
  function drawActor(a, hero = false) {
    const depth = .91 + (a.y - 493) / 162 * .09, size = .72 * depth * (a.size || 1);
    const down = a.dead !== undefined && a.dead !== null;
    let pose = 0, tilt = 0, alpha = 1, y = a.y - a.z;
    if (down) { pose = a.type === 'boss' ? 5 : 4; tilt = a.type === 'boss' ? 0 : Math.min(1.55, (.85-a.dead)*3); alpha = Math.min(1,a.dead*2.6); }
    else if (a.stun > 0) pose = 4;
    else if (a.action) {
      if (hero) {
        const {kind,t} = a.action;
        pose = kind === 'special' || kind === 'uppercut' ? 5 : kind === 'kick' ? 3 : 2;
        if (t < (kind === 'kick' ? .10 : .04)) pose = 0;
      } else {
        const windup = a.windup;
        pose = a.action.t < windup ? 0 : a.type === 'clerk' ? 2 : 3;
        if (a.type === 'boss' && a.action.t < windup) pose = 2;
        if (a.type === 'runner' && a.action.t >= windup - .16 && a.action.t < windup) pose = 1;
        if (a.action.t < windup) tilt = -.06;
      }
    } else if (a.moving) { pose = Math.sin(a.walk) > -.25 ? 1 : 0; y -= Math.abs(Math.sin(a.walk))*4; }
    else y -= Math.sin(now*3 + (a.id || 0)) * 1.7;
    if (hero && a.z > 0 && !a.action) pose = 1;
    if (hero && engine.mode === 'lost') { pose = 4; tilt = .5; }
    ellipse(a.x,a.y+2,(hero ? 46 : 48)*(a.size||1)*depth*(1-a.z/300),10*depth,hero?'#327b895c':'#3471814a');
    if (hero && a.power>=100 && engine.mode==='playing') {
      ctx.save(); ctx.globalAlpha = .5 + Math.sin(now*5)*.2; ctx.strokeStyle=gold;ctx.lineWidth=3;
      ctx.beginPath();ctx.ellipse(a.x,a.y,59,13,0,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
    if (hero && a.fury > 0) {
      ctx.save(); ctx.globalAlpha = .6; ctx.strokeStyle = '#ff974d'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(a.x, a.y, 67, 17, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (hero && a.invul > 0 && a.stun === 0 && !a.action && Math.sin(now*45) > .3) alpha *= .5;
    const tint = !hero && a.type==='heavy' ? 'sepia(.18) saturate(.8)' : '';
    if (!hero && a.type === 'boss') drawBossSprite(pose, a.x, y, a.dir, size, tilt, alpha);
    else if (!hero && enemyArt[a.type]) drawCombatSprite(a.type, pose, a.x, y, a.dir, size, tilt, alpha);
    else drawSprite(hero?0:1,pose,a.x,y,a.dir,size,tilt,alpha,tint);
    if (hero && a.shield > 0) {
      ctx.save(); ctx.globalAlpha = a.shield < 2 ? .35 + Math.sin(engine.time * 12) * .2 : .55;
      ctx.strokeStyle = '#91efff'; ctx.fillStyle = '#70ddff18'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(a.x, y - 115, 79, 132, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    if (!hero && !down) {
      const top = y-252*(a.size||1)*depth;
      if (a.hp < a.maxHp || a.type==='boss' || enemyArt[a.type]) {
        const barWidth = a.type==='boss'?110:62;
        ctx.fillStyle=ink;ctx.fillRect(a.x-barWidth/2-2,top-3,barWidth+4,9);
        ctx.fillStyle=a.type==='boss'?gold:enemyArt[a.type]?.color||'#ef6757';ctx.fillRect(a.x-barWidth/2,top-1,barWidth*a.hp/a.maxHp,5);
        if(a.type==='boss') outlinedText('GATEKEEPER',a.x,top-17,16,'#fff9df');
        else if(enemyArt[a.type]) outlinedText(enemyArt[a.type].name,a.x,top-16,13,enemyArt[a.type].color);
      }
      if(a.action&&!a.action.hit) {
        const r=14+Math.sin(now*28)*2;
        ellipse(a.x,top-32,r,r,gold);ctx.strokeStyle=ink;ctx.lineWidth=3;ctx.stroke();
        outlinedText('!',a.x,top-31,24,'#fff9df');
        // The ground cue marks the attack lane before the strike lands.
        const reach = a.type === 'scribe' ? Math.min(a.reach, W * .8) : a.type === 'runner' ? 250 : a.reach;
        ctx.save();ctx.globalAlpha=.18;ctx.fillStyle=a.type==='scribe'?'#ba7dff':'#eb7043';
        ctx.beginPath();ctx.ellipse(a.x+a.dir*reach/2,a.y,reach/2,25,0,0,Math.PI*2);ctx.fill();ctx.restore();
      }
    }
  }
  function drawTitle() {
    const narrow=W<800;
    const hx=W*(narrow?.55:.68), hy=H*(narrow?.88:.87);
    const ex=W*(narrow?.88:.89), ey=H*(narrow?.84:.87);
    const hs=narrow?.74:1.02, es=narrow?.65:.85;
    ellipse(ex,ey+2,55*es,12,'#327b8945');
    drawSprite(1,0,ex,ey+Math.sin(now*2)*2,-1,es);
    ellipse(hx,hy+4,64*hs,14,'#327b8955');
    drawSprite(0,0,hx,hy+Math.sin(now*2.5)*2,1,hs);
  }
  function drawEffects(dt) {
    for (const p of particles) {
      p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=420*dt;
      ctx.save();ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.translate(p.x,p.y);ctx.rotate(p.rotation+p.life*6);
      ctx.fillStyle=p.color;ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);ctx.restore();
    }
    particles=particles.filter(p=>p.life>0);
    for(const s of sparks) {
      s.life-=dt;ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.angle);ctx.globalAlpha=Math.max(0,s.life/.18);
      const radius=s.size*(1.2-s.life/.4);ctx.beginPath();
      for(let i=0;i<14;i++){const r=i%2?radius*.32:radius,a=i*Math.PI/7;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
      ctx.closePath();ctx.fillStyle='#fffde0';ctx.strokeStyle='#e79d21';ctx.lineWidth=3;ctx.fill();ctx.stroke();ctx.restore();
    }
    sparks=sparks.filter(s=>s.life>0);
    if(specialRing) {
      const s=specialRing;s.life-=dt;const p=1-s.life/.65;
      ctx.save();ctx.globalAlpha=Math.max(0,s.life/.65);ctx.strokeStyle=gold;ctx.lineWidth=16*(1-p)+3;
      ctx.beginPath();ctx.ellipse(s.x,s.y,50+p*390,35+p*170,-.15,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle='#fffce8';ctx.lineWidth=4;ctx.stroke();ctx.restore();
      if(s.life<=0)specialRing=null;
    }
    for(const l of labels){l.life-=dt;l.y-=dt*54;ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,l.life*4));outlinedText(l.text,l.x,l.y,l.size,l.color,l.rotate);ctx.restore();}
    labels=labels.filter(l=>l.life>0);
  }
  function updateHud() {
    const p=engine.player;
    const state=[p.hp,p.power,Math.ceil(p.fury),Math.ceil(p.shield),engine.wave,engine.score,engine.combo,engine.remaining,best].join('/');
    if(state===lastHud)return;lastHud=state;
    $('healthText').textContent=p.hp;$('healthFill').style.width=p.hp+'%';
    $('healthFill').style.backgroundColor=p.hp<30?'#ed3947':'#e85349';
    $('specialFill').style.width=p.power+'%';$('specialText').textContent=p.power>=100?'READY! [L]':'HALO POWER';
    $('specialReady').hidden=p.power<100||engine.mode!=='playing';
    $('furyStatus').hidden=p.fury<=0; $('furyStatus').textContent='2× DAMAGE · '+Math.ceil(p.fury)+'s';
    $('shieldStatus').hidden=p.shield<=0; $('shieldStatus').textContent='SHIELD · '+Math.ceil(p.shield)+'s';
    $('waveLabel').textContent='WAVE '+String(engine.wave+1).padStart(2,'0')+' / 05';
    $('waveName').textContent=locations[engine.wave].name;
    $('enemyCount').textContent=engine.remaining===0?'GATES CLEARED':engine.remaining+' ANGEL'+(engine.remaining===1?'':'S')+' LEFT';
    $('score').textContent=String(engine.score).padStart(6,'0');
    $('bestScore').textContent='BEST '+String(Math.max(best,engine.score)).padStart(6,'0');
    $('combo').hidden=engine.combo<2||engine.mode!=='playing';$('comboCount').textContent=engine.combo;
  }
  function loop(timestamp) {
    const raw=lastTime?(timestamp-lastTime)/1000:0;lastTime=timestamp;
    const dt=Math.min(raw,.04);now+=dt;
    ctx.setTransform(scale,0,0,scale,0,0);
    if(!loaded){requestAnimationFrame(loop);return;}
    const live=engine.mode==='playing';
    if(live) {
      const x=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0)+stick.x;
      const y=(keys.has('ArrowDown')||keys.has('KeyS')?1:0)-(keys.has('ArrowUp')||keys.has('KeyW')?1:0)+stick.y;
      if(keys.has('KeyL')||heldActions.has('special'))engine.attack('special');
      else if(keys.has('KeyK')||heldActions.has('kick'))engine.attack('kick');
      else if(keys.has('KeyJ')||heldActions.has('punch'))engine.attack('punch');
      engine.update(dt,{x,y});events();music();
    }
    if(engine.mode!=='paused'){
      locationFade=Math.max(0,locationFade-dt);
      if(bannerTime>0){bannerTime-=dt;if(bannerTime<=0)$('banner').hidden=true;}
      if(endTime>=0){endTime-=dt;if(endTime<0)showEnd(engine.mode==='won');}
    }
    ctx.save();
    if(!reduceMotion&&shake>0&&engine.mode!=='paused'){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake=Math.max(0,shake-dt*35);}
    drawBackground();
    if(engine.mode==='title')drawTitle();
    else{
      const actors=[...engine.enemies,engine.player,...engine.pickups,...engine.projectiles].sort((a,b)=>a.y-b.y);
      for(const a of actors) { if(a.kind) drawPickup(a); else if(a.life!==undefined) drawBolt(a); else drawActor(a,a===engine.player); }
      drawEffects(engine.mode==='paused'?0:dt);
    }
    if(flash>0&&engine.mode!=='paused'){if(!reduceMotion){ctx.fillStyle=engine.player.stun>0?'#ef6251':'#fff8c9';ctx.globalAlpha=flash*1.2;ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;}flash=Math.max(0,flash-dt);}
    ctx.restore();updateHud();requestAnimationFrame(loop);
  }
  const handled=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','KeyJ','KeyK','KeyL','Space','KeyP','KeyM','Enter','Escape']);
  window.addEventListener('keydown',e=>{
    if(e.code==='Enter'&&moreGamesButtons.includes(e.target))return;
    if(!handled.has(e.code)||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.code==='KeyM'&&!e.repeat){toggleSound();return;}
    if(e.code==='KeyP'||e.code==='Escape'){if(!e.repeat)pauseGame();return;}
    if(e.code==='Enter'&&!e.repeat){
      e.preventDefault();if(engine.mode==='title'||engine.mode==='won'||engine.mode==='lost')startGame();else if(engine.mode==='paused')pauseGame(false);return;
    }
    if(engine.mode!=='playing')return;
    e.preventDefault();keys.add(e.code);unlockAudio();
    if(e.code==='Space'&&!e.repeat)engine.jump();
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{clearInput();if(engine.mode==='playing')pauseGame(true);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&engine.mode==='playing')pauseGame(true);});
  canvas.addEventListener('pointerdown',()=>{unlockAudio();focusGame();});
  $('startButton').addEventListener('click',startGame);$('retryButton').addEventListener('click',startGame);
  $('resumeButton').addEventListener('click',()=>pauseGame(false));$('pauseButton').addEventListener('click',()=>pauseGame());
  $('quitButton').addEventListener('click',showTitle);$('endMenuButton').addEventListener('click',showTitle);
  $('soundButton').addEventListener('click',toggleSound);
  $('fullscreenButton').addEventListener('click',async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await frame.requestFullscreen();}catch(_){$('announcer').textContent='Fullscreen is unavailable in this embed.';}
    focusGame();
  });
  if(!frame.requestFullscreen)$('fullscreenButton').disabled=true;
  document.addEventListener('fullscreenchange',()=>{
    const label=document.fullscreenElement?'Exit fullscreen':'Enter fullscreen';
    $('fullscreenButton').setAttribute('aria-label',label);$('fullscreenButton').title=label;resize();
  });
  const joystick=$('joystick');
  function moveStick(e){const r=joystick.getBoundingClientRect(),max=r.width*.34;let x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;const d=Math.hypot(x,y);if(d>max){x=x/d*max;y=y/d*max;}stick.x=Math.abs(x/max)<.13?0:x/max;stick.y=Math.abs(y/max)<.13?0:y/max;$('joystickKnob').style.transform=`translate(${x}px,${y}px)`;}
  joystick.addEventListener('pointerdown',e=>{e.preventDefault();stick.pointer=e.pointerId;joystick.setPointerCapture(e.pointerId);moveStick(e);unlockAudio();});
  joystick.addEventListener('pointermove',e=>{if(e.pointerId===stick.pointer){e.preventDefault();moveStick(e);}});
  const resetStick=e=>{if(e.pointerId===stick.pointer){stick.pointer=null;stick.x=stick.y=0;$('joystickKnob').style.transform='';}};
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>joystick.addEventListener(type,resetStick));
  for(const b of document.querySelectorAll('[data-action]')){
    const action=b.dataset.action;
    b.addEventListener('pointerdown',e=>{e.preventDefault();unlockAudio();b.setPointerCapture(e.pointerId);if(action==='jump')engine.jump();else {heldActions.add(action);engine.attack(action);}});
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>b.addEventListener(type,()=>heldActions.delete(action)));
  }
  if(coarse)$('playHint').textContent='DRAG TO MOVE · TAP TO FIGHT · ↑ TO JUMP';
  updateSoundButton();resize();requestAnimationFrame(loop);
  async function loadImage(img, url, onProgress, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('Artwork could not load');
    const total = Number(response.headers.get('content-length')) || 0;
    let blob;
    if (response.body?.getReader) {
      const reader = response.body.getReader(), chunks = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); received += value.byteLength;
        if (total > 0) onProgress(Math.min(.95, received / total * .95));
      }
      blob = new Blob(chunks, { type: response.headers.get('content-type') || 'image/png' });
    } else blob = await response.blob();
    const objectURL = URL.createObjectURL(blob);
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve; img.onerror = () => reject(new Error('Artwork could not decode')); img.src = objectURL;
      });
      onProgress(1);
    } finally {
      img.onload = img.onerror = null; URL.revokeObjectURL(objectURL);
    }
  }
  async function preloadGame() {
    const assets = [...locations.map(location => ({ image: location.image, src: location.src })),
      { image: atlas, src: 'assets/halo-havoc-sprite-atlas.png' },
      { image: combatAtlas, src: 'assets/halo-havoc-combat-atlas.png' },
      { image: bossAtlas, src: 'assets/halo-havoc-gatekeeper.png' }];
    const progress = Array(assets.length + 2).fill(0), controller = new AbortController();
    let displayed = -1, failed = false;
    const updateProgress = () => {
      if (failed) return;
      const percent = Math.max(displayed, Math.floor(progress.reduce((sum, value) => sum + value, 0) / progress.length * 100));
      if (percent === displayed) return;
      displayed = percent;
      $('loadingPercent').textContent = percent + '%'; $('loadingFill').style.width = percent + '%';
      $('loadingProgress').setAttribute('aria-valuenow', String(percent));
      if (percent === 100) $('loadingFill').style.transition = 'none';
    };
    const paintProgress = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    updateProgress();
    try {
      await Promise.all(assets.map((asset, i) => loadImage(asset.image, asset.src, value => { progress[i] = value; updateProgress(); }, controller.signal)));
      $('loadingDetail').textContent = 'PREPARING FIGHTERS'; await paintProgress();
      prepareCombatSprites(); progress[assets.length] = 1; updateProgress();
      $('loadingDetail').textContent = 'PREPARING GATEKEEPER'; await paintProgress();
      prepareBossSprites(); progress[assets.length + 1] = 1; updateProgress();
      $('loadingDetail').textContent = 'READY TO BRAWL'; await paintProgress();
      loaded = true; $('loading').setAttribute('aria-busy', 'false'); $('loading').hidden = true; showTitle();
    } catch (_) {
      failed = true; controller.abort(); $('loading').setAttribute('aria-busy', 'false'); $('loading').replaceChildren();
      const message = document.createElement('strong'); message.textContent = 'THE GATES GOT STUCK.'; message.setAttribute('role', 'alert');
      const retry = document.createElement('button'); retry.className = 'big-button'; retry.textContent = 'RELOAD GAME';
      retry.addEventListener('click', () => location.reload()); $('loading').append(message, retry);
    }
  }
  preloadGame();
})();
