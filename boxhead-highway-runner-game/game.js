import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js";

const LANES = [-5.5, 0, 5.5];
const SEGMENT_LENGTH = 42;
const SEGMENT_COUNT = 10;
const PLAYER_WIDTH = 1.55;
const PLAYER_HEIGHT = 4.1;
const PLAYER_DEPTH = 1.55;
const GRAVITY = 42;
const JUMP_VELOCITY = 19.5;
const HIGH_JUMP_VELOCITY = 24;
const MIN_RUN_SPEED = 18;
const MAX_RUN_SPEED = 46;
const BASE_OBSTACLE_Z = -135;
const BASE_POWERUP_Z = -110;
const BASE_COIN_Z = -90;
const CLEAR_Z = 12;
const LEVEL_DISTANCE = 240;

const scoreNode = document.getElementById("score");
const bestScoreNode = document.getElementById("best-score");
const coinCountNode = document.getElementById("coin-count");
const statusNode = document.getElementById("status");
const overlayNode = document.getElementById("overlay");
const startButtonNode = document.getElementById("start-button");
const touchControlsNode = document.querySelector(".touch-controls");
const panelCopyNode = document.getElementById("panel-copy");
const gameOverStatsNode = document.getElementById("game-over-stats");
const finalScoreNode = document.getElementById("final-score");
const finalDistanceNode = document.getElementById("final-distance");
const finalLevelNode = document.getElementById("final-level");

const audioState = {
  context: null,
  masterGain: null,
};

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdceeff, 34, 155);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(0, 11, 17);

const clock = new THREE.Clock();

const world = {
  score: 0,
  coinsCollected: 0,
  nextHighJumpCoins: 100,
  bestScore: Number(window.localStorage.getItem("runner-best-score") || 0),
  speed: MIN_RUN_SPEED,
  level: 1,
  distance: 0,
  isRunning: false,
  laneIndex: 1,
  laneTargetX: LANES[1],
  playerVelocityY: 0,
  groundY: 1.9,
  obstacles: [],
  powerups: [],
  coins: [],
  segments: [],
  decorative: [],
  props: [],
  debris: [],
  activeEffects: {
    shield: 0,
    magnet: 0,
    boost: 0,
    highJump: 0,
  },
  deathTimer: 0,
  pendingGameOver: null,
  wasGrounded: true,
  announcementTimer: 0,
  announcementText: "",
};

bestScoreNode.textContent = String(world.bestScore);

function ensureAudio() {
  if (!audioState.context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    const context = new AudioContextClass();
    const masterGain = context.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(context.destination);
    audioState.context = context;
    audioState.masterGain = masterGain;
  }

  if (audioState.context.state === "suspended") {
    audioState.context.resume().catch(() => {});
  }

  return audioState.context;
}

function playSound({ frequency, duration = 0.12, type = "sine", volume = 0.2, slideTo = null }) {
  const context = ensureAudio();
  if (!context || !audioState.masterGain) {
    return;
  }

  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), now + duration);
  }

  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(volume, now + 0.015);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gainNode);
  gainNode.connect(audioState.masterGain);

  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playChord(notes, type = "triangle", volume = 0.12, duration = 0.16) {
  for (const frequency of notes) {
    playSound({ frequency, type, volume, duration });
  }
}

function playNoiseBurst(duration = 0.08, volume = 0.035, highpass = 500) {
  const context = ensureAudio();
  if (!context || !audioState.masterGain) {
    return;
  }

  const sampleRate = context.sampleRate;
  const frameCount = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = context.createBuffer(1, frameCount, sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i += 1) {
    channel[i] = Math.random() * 2 - 1;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;

  const filter = context.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = highpass;

  const gainNode = context.createGain();
  const now = context.currentTime;
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(audioState.masterGain);
  source.start(now);
  source.stop(now + duration + 0.02);
}

function createCanvasTexture(width, height, painter, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  painter(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

const roadTexture = createCanvasTexture(512, 512, (ctx, width, height) => {
  ctx.fillStyle = "#525d66";
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 120; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${0.015 + Math.random() * 0.03})`;
    ctx.fillRect(Math.random() * width, Math.random() * height, 3 + Math.random() * 7, 3 + Math.random() * 7);
  }
  ctx.fillStyle = "#f4f5ef";
  ctx.fillRect(width * 0.485, 0, width * 0.03, height);
  ctx.fillStyle = "#d7d9cf";
  for (let y = 0; y < height; y += 78) {
    ctx.fillRect(width * 0.49, y + 12, width * 0.02, 42);
  }
}, 1, 6);

const sidewalkTexture = createCanvasTexture(256, 256, (ctx, width, height) => {
  ctx.fillStyle = "#d7c3a1";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(126, 102, 79, 0.35)";
  ctx.lineWidth = 4;
  for (let x = 0; x <= width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}, 2, 4);

const windowTexture = createCanvasTexture(256, 512, (ctx, width, height) => {
  ctx.fillStyle = "#6f8898";
  ctx.fillRect(0, 0, width, height);
  for (let y = 18; y < height; y += 42) {
    for (let x = 18; x < width; x += 42) {
      const lit = Math.random() > 0.32;
      ctx.fillStyle = lit ? "#f9d77a" : "#9db8ca";
      ctx.fillRect(x, y, 22, 24);
    }
  }
}, 1, 2);

const billboardTexture = createCanvasTexture(512, 256, (ctx, width, height) => {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#ff8f5a");
  gradient.addColorStop(1, "#ffdb6e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(18,50,74,0.15)";
  for (let i = 0; i < 16; i += 1) {
    ctx.fillRect(i * 40, 0, 18, height);
  }
  ctx.fillStyle = "#12324a";
  ctx.font = "bold 108px sans-serif";
  ctx.fillText("G55.CO", 82, 154);
}, 1, 1);

const skyTexture = createCanvasTexture(32, 512, (ctx, width, height) => {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#8fd1ff");
  gradient.addColorStop(0.55, "#dff3ff");
  gradient.addColorStop(1, "#f7e7cb");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}, 1, 1);

scene.background = skyTexture;

const palette = {
  ground: new THREE.MeshStandardMaterial({ color: 0xf1c98d, flatShading: true, map: sidewalkTexture }),
  path: new THREE.MeshStandardMaterial({ color: 0x687680, flatShading: true, map: roadTexture }),
  rail: new THREE.MeshStandardMaterial({ color: 0xf3f5ef, flatShading: true }),
  skin: new THREE.MeshStandardMaterial({ color: 0xf2c39b, flatShading: true }),
  hoodie: new THREE.MeshStandardMaterial({ color: 0x2f79c0, flatShading: true }),
  pants: new THREE.MeshStandardMaterial({ color: 0x27415f, flatShading: true }),
  shoe: new THREE.MeshStandardMaterial({ color: 0x22303b, flatShading: true }),
  hair: new THREE.MeshStandardMaterial({ color: 0x4b2c1a, flatShading: true }),
  obstacleA: new THREE.MeshStandardMaterial({ color: 0x385069, flatShading: true }),
  obstacleB: new THREE.MeshStandardMaterial({ color: 0xffb84d, flatShading: true }),
  obstacleC: new THREE.MeshStandardMaterial({ color: 0xd86651, flatShading: true }),
  powerShield: new THREE.MeshStandardMaterial({ color: 0x8ce1ff, flatShading: true }),
  powerMagnet: new THREE.MeshStandardMaterial({ color: 0xa4ff8d, flatShading: true }),
  powerBoost: new THREE.MeshStandardMaterial({ color: 0xfff07d, flatShading: true }),
  coin: new THREE.MeshStandardMaterial({ color: 0xffd34d, flatShading: true, emissive: 0xf6c343, emissiveIntensity: 0.45 }),
  coinEdge: new THREE.MeshStandardMaterial({ color: 0xe39b12, flatShading: true }),
  towerA: new THREE.MeshStandardMaterial({ color: 0xd18b63, flatShading: true, map: windowTexture }),
  towerB: new THREE.MeshStandardMaterial({ color: 0x8eb7d0, flatShading: true, map: windowTexture }),
  towerC: new THREE.MeshStandardMaterial({ color: 0xa4b69a, flatShading: true, map: windowTexture }),
  glass: new THREE.MeshStandardMaterial({ color: 0xf6fbff, flatShading: true }),
  billboard: new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, map: billboardTexture }),
  pole: new THREE.MeshStandardMaterial({ color: 0x43515d, flatShading: true }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xfff3b5, flatShading: true, emissive: 0xffe08a, emissiveIntensity: 0.35 }),
};

scene.add(new THREE.AmbientLight(0xffffff, 1.9));

const sunLight = new THREE.DirectionalLight(0xfffaf0, 2.4);
sunLight.position.set(20, 35, 14);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -40;
sunLight.shadow.camera.right = 40;
sunLight.shadow.camera.top = 40;
sunLight.shadow.camera.bottom = -40;
scene.add(sunLight);

const rimLight = new THREE.DirectionalLight(0x8ec5ff, 1.2);
rimLight.position.set(-24, 16, -18);
scene.add(rimLight);

const skylineGroup = new THREE.Group();
scene.add(skylineGroup);

function setStatus(message) {
  statusNode.textContent = message;
}

function durationText(seconds) {
  return `${seconds.toFixed(1)}s`;
}

function createRoadSegment(index) {
  const group = new THREE.Group();
  const z = -index * SEGMENT_LENGTH;

  const base = new THREE.Mesh(new THREE.BoxGeometry(36, 2.2, SEGMENT_LENGTH), palette.ground);
  base.receiveShadow = true;
  group.add(base);

  const road = new THREE.Mesh(new THREE.BoxGeometry(18, 0.6, SEGMENT_LENGTH - 2), palette.path);
  road.position.y = 1.2;
  road.receiveShadow = true;
  group.add(road);

  const sidewalkGeometry = new THREE.BoxGeometry(7.5, 0.7, SEGMENT_LENGTH - 1);
  for (const side of [-1, 1]) {
    const sidewalk = new THREE.Mesh(sidewalkGeometry, palette.ground);
    sidewalk.position.set(side * 12.9, 1.5, 0);
    sidewalk.receiveShadow = true;
    group.add(sidewalk);
  }

  const stripeGeometry = new THREE.BoxGeometry(0.45, 0.12, 3.8);
  for (let i = -4; i <= 4; i += 2) {
    const stripe = new THREE.Mesh(stripeGeometry, palette.rail);
    stripe.position.set(0, 1.55, i * 4);
    group.add(stripe);
  }

  const edgeGeometry = new THREE.BoxGeometry(0.7, 1.2, SEGMENT_LENGTH);
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(edgeGeometry, palette.rail);
    edge.position.set(side * 9.6, 1.7, 0);
    edge.castShadow = true;
    edge.receiveShadow = true;
    group.add(edge);
  }

  group.position.z = z;
  scene.add(group);
  world.segments.push(group);
}

function createTower(x, z, colorMaterial) {
  const tower = new THREE.Group();
  const height = 8 + Math.random() * 16;

  const base = new THREE.Mesh(new THREE.BoxGeometry(4, height, 4), colorMaterial);
  base.position.y = height / 2 - 0.4;
  base.castShadow = true;
  base.receiveShadow = true;
  tower.add(base);

  tower.position.set(x, -0.3, z);
  skylineGroup.add(tower);
  world.decorative.push(tower);
}

function createStreetlight(x, z) {
  const group = new THREE.Group();

  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.35, 8, 0.35), palette.pole);
  pole.position.y = 4;
  pole.castShadow = true;
  group.add(pole);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 0.25), palette.pole);
  arm.position.set(1.1 * Math.sign(-x), 7.6, 0);
  arm.castShadow = true;
  group.add(arm);

  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.8), palette.lamp);
  lamp.position.set(2.1 * Math.sign(-x), 7.2, 0);
  group.add(lamp);

  group.position.set(x, 1.9, z);
  skylineGroup.add(group);
  world.props.push(group);
}

function createBillboard(x, z) {
  const group = new THREE.Group();

  const poles = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.2, 0.35), palette.pole);
  poles.position.set(0, 3.1, 0);
  group.add(poles);

  const sign = new THREE.Mesh(new THREE.BoxGeometry(8.2, 3.8, 0.35), palette.billboard);
  sign.position.set(0, 7.2, 0);
  sign.castShadow = true;
  sign.receiveShadow = true;
  group.add(sign);

  group.position.set(x, 1.9, z);
  skylineGroup.add(group);
  world.props.push(group);
}

function populateSkyline() {
  const towerMaterials = [palette.towerA, palette.towerB, palette.towerC];
  for (let i = 0; i < 48; i += 1) {
    const z = -i * 12 - 20;
    const leftX = -22 - Math.random() * 16;
    const rightX = 22 + Math.random() * 16;
    createTower(leftX, z, towerMaterials[i % towerMaterials.length]);
    createTower(rightX, z - 6, towerMaterials[(i + 1) % towerMaterials.length]);
    if (i < 18) {
      createStreetlight(-14.5, z + 2);
      createStreetlight(14.5, z - 4);
    }
    if (i % 8 === 0) {
      createBillboard(i % 16 === 0 ? -18.5 : 18.5, z - 10);
    }
  }
}

function createBlockLimb(width, height, depth, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createPlayer() {
  const player = new THREE.Group();
  player.scale.setScalar(0.76);

  const torso = createBlockLimb(2.5, 2.8, 1.4, palette.hoodie);
  torso.position.y = 3.85;
  player.add(torso);

  const hood = createBlockLimb(2.15, 0.42, 1.55, palette.hoodie);
  hood.position.y = 5.02;
  player.add(hood);

  const head = createBlockLimb(2, 2, 2, palette.skin);
  head.position.y = 6.02;
  player.add(head);

  const hair = createBlockLimb(2.1, 0.6, 2.1, palette.hair);
  hair.position.y = 7.08;
  player.add(hair);

  const armLeftPivot = new THREE.Group();
  armLeftPivot.position.set(-1.68, 4.92, 0);
  const armLeft = createBlockLimb(0.8, 2.6, 0.8, palette.hoodie);
  armLeft.position.y = -1.3;
  armLeftPivot.add(armLeft);
  player.add(armLeftPivot);

  const armRightPivot = new THREE.Group();
  armRightPivot.position.set(1.68, 4.92, 0);
  const armRight = createBlockLimb(0.8, 2.6, 0.8, palette.hoodie);
  armRight.position.y = -1.3;
  armRightPivot.add(armRight);
  player.add(armRightPivot);

  const legLeftPivot = new THREE.Group();
  legLeftPivot.position.set(-0.65, 2.5, 0);
  const legLeft = createBlockLimb(0.9, 2.8, 0.9, palette.pants);
  legLeft.position.y = -1.4;
  legLeftPivot.add(legLeft);
  const shoeLeft = createBlockLimb(1, 0.45, 1.3, palette.shoe);
  shoeLeft.position.set(0, -2.65, 0.1);
  legLeftPivot.add(shoeLeft);
  player.add(legLeftPivot);

  const legRightPivot = new THREE.Group();
  legRightPivot.position.set(0.65, 2.5, 0);
  const legRight = createBlockLimb(0.9, 2.8, 0.9, palette.pants);
  legRight.position.y = -1.4;
  legRightPivot.add(legRight);
  const shoeRight = createBlockLimb(1, 0.45, 1.3, palette.shoe);
  shoeRight.position.set(0, -2.65, 0.1);
  legRightPivot.add(shoeRight);
  player.add(legRightPivot);

  const shieldAura = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.8, 0),
    new THREE.MeshBasicMaterial({ color: 0x8ce1ff, wireframe: true, transparent: true, opacity: 0.0 })
  );
  shieldAura.position.y = 4.5;
  player.add(shieldAura);

  player.position.set(world.laneTargetX, world.groundY, 4);
  scene.add(player);

  return {
    root: player,
    torso,
    hood,
    head,
    hair,
    armLeftPivot,
    armLeft,
    armRightPivot,
    armRight,
    legLeftPivot,
    legLeft,
    shoeLeft,
    legRightPivot,
    legRight,
    shoeRight,
    shieldAura,
  };
}

function clearDebris() {
  for (const piece of world.debris) {
    scene.remove(piece.mesh);
  }
  world.debris = [];
}

function spawnDebrisPiece(size, material, position, velocity, spin) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  world.debris.push({ mesh, velocity, spin, bounced: false });
}

function spawnPlayerDebris() {
  clearDebris();

  const rootPosition = playerRig.root.position.clone();
  const laneDrift = (world.laneTargetX - playerRig.root.position.x) * 1.4;
  const burstForward = 7 + world.speed * 0.12;
  const parts = [
    { size: new THREE.Vector3(1.9, 2.1, 1.1), material: palette.hoodie, offset: new THREE.Vector3(0, 3.1, 0), impulse: new THREE.Vector3(0, 7.8, burstForward) },
    { size: new THREE.Vector3(2.1, 0.7, 1.3), material: palette.hoodie, offset: new THREE.Vector3(0, 4.3, 0), impulse: new THREE.Vector3(0, 8.6, burstForward - 1) },
    { size: new THREE.Vector3(1.55, 1.55, 1.55), material: palette.skin, offset: new THREE.Vector3(0, 5.1, 0), impulse: new THREE.Vector3(0, 10.2, burstForward + 1.5) },
    { size: new THREE.Vector3(1.6, 0.45, 1.6), material: palette.hair, offset: new THREE.Vector3(0, 5.9, 0), impulse: new THREE.Vector3(0, 11, burstForward) },
    { size: new THREE.Vector3(0.62, 2.05, 0.62), material: palette.hoodie, offset: new THREE.Vector3(-1.25, 3.7, 0), impulse: new THREE.Vector3(-3.4, 7.4, burstForward - 0.8) },
    { size: new THREE.Vector3(0.62, 2.05, 0.62), material: palette.hoodie, offset: new THREE.Vector3(1.25, 3.7, 0), impulse: new THREE.Vector3(3.4, 7.4, burstForward - 0.8) },
    { size: new THREE.Vector3(0.7, 2.15, 0.7), material: palette.pants, offset: new THREE.Vector3(-0.45, 1.8, 0), impulse: new THREE.Vector3(-2.2, 6.2, burstForward - 1.6) },
    { size: new THREE.Vector3(0.7, 2.15, 0.7), material: palette.pants, offset: new THREE.Vector3(0.45, 1.8, 0), impulse: new THREE.Vector3(2.2, 6.2, burstForward - 1.6) },
    { size: new THREE.Vector3(0.78, 0.35, 1), material: palette.shoe, offset: new THREE.Vector3(-0.45, 0.55, 0.1), impulse: new THREE.Vector3(-2.8, 5.1, burstForward - 2.2) },
    { size: new THREE.Vector3(0.78, 0.35, 1), material: palette.shoe, offset: new THREE.Vector3(0.45, 0.55, 0.1), impulse: new THREE.Vector3(2.8, 5.1, burstForward - 2.2) },
  ];

  for (const part of parts) {
    const position = rootPosition.clone().add(part.offset.multiplyScalar(playerRig.root.scale.x));
    const velocity = part.impulse.clone();
    velocity.x += laneDrift + (Math.random() - 0.5) * 1.6;
    velocity.y += (Math.random() - 0.5) * 1.2;
    velocity.z += (Math.random() - 0.5) * 1.5;
    const spin = new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8
    );
    spawnDebrisPiece(part.size.multiplyScalar(playerRig.root.scale.x), part.material, position, velocity, spin);
  }
}

function updateDebris(delta) {
  for (const piece of world.debris) {
    piece.velocity.y -= GRAVITY * delta * 0.9;
    piece.mesh.position.addScaledVector(piece.velocity, delta);
    piece.mesh.rotation.x += piece.spin.x * delta;
    piece.mesh.rotation.y += piece.spin.y * delta;
    piece.mesh.rotation.z += piece.spin.z * delta;

    const halfHeight = piece.mesh.geometry.parameters.height / 2;
    const floorY = world.groundY + halfHeight * 0.35;
    if (piece.mesh.position.y <= floorY) {
      piece.mesh.position.y = floorY;
      if (!piece.bounced) {
        piece.velocity.y *= -0.24;
        piece.velocity.x *= 0.82;
        piece.velocity.z *= 0.72;
        piece.spin.multiplyScalar(0.7);
        piece.bounced = true;
      } else {
        piece.velocity.y = 0;
        piece.velocity.x *= 0.96;
        piece.velocity.z *= 0.94;
        piece.spin.multiplyScalar(0.94);
      }
    }
  }
}

function setEntityTransform(entity, laneIndex, z) {
  entity.position.set(LANES[laneIndex], 1.2, z);
}

function decorateBarrier(group, width, height, depth, material) {
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
}

function createObstacle(type, register = true) {
  const obstacle = new THREE.Group();
  let width = 3;
  let height = 3.4;
  let depth = 3;

  if (type === "crate") {
    width = 3.2;
    height = 3.1;
    depth = 3.2;
    decorateBarrier(obstacle, width, height, depth, palette.obstacleA);

    const slatGeometry = new THREE.BoxGeometry(0.12, 2.9, 0.18);
    for (const x of [-1.05, -0.35, 0.35, 1.05]) {
      const frontSlat = new THREE.Mesh(slatGeometry, palette.rail);
      frontSlat.position.set(x, 1.55, 1.68);
      obstacle.add(frontSlat);

      const backSlat = new THREE.Mesh(slatGeometry, palette.rail);
      backSlat.position.set(x, 1.55, -1.68);
      obstacle.add(backSlat);
    }

    const bandGeometry = new THREE.BoxGeometry(2.9, 0.14, 0.18);
    for (const y of [0.65, 1.55, 2.45]) {
      const frontBand = new THREE.Mesh(bandGeometry, palette.rail);
      frontBand.position.set(0, y, 1.68);
      obstacle.add(frontBand);

      const backBand = new THREE.Mesh(bandGeometry, palette.rail);
      backBand.position.set(0, y, -1.68);
      obstacle.add(backBand);
    }
  } else if (type === "barrier") {
    width = 4.4;
    height = 2.1;
    depth = 1.8;

    const body = new THREE.Mesh(new THREE.BoxGeometry(width, 1.5, depth), palette.obstacleB);
    body.position.y = 0.95;
    body.castShadow = true;
    body.receiveShadow = true;
    obstacle.add(body);

    for (let i = -1; i <= 1; i += 1) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.08), palette.rail);
      stripe.position.set(i * 1.28, 1.1, 0.95);
      stripe.rotation.z = -0.35;
      obstacle.add(stripe);
    }

    for (const x of [-1.7, 1.7]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 1.1), palette.obstacleA);
      foot.position.set(x, 0.25, 0);
      foot.castShadow = true;
      foot.receiveShadow = true;
      obstacle.add(foot);

      const flasher = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.18), palette.obstacleC);
      flasher.position.set(x, 1.85, 0.95);
      obstacle.add(flasher);
    }
  } else if (type === "pillar") {
    width = 4.8;
    height = 4.2;
    depth = 10.5;
    decorateBarrier(obstacle, width, height, depth, palette.obstacleC);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.25, 10.7), palette.obstacleA);
    roof.position.y = 4.35;
    roof.castShadow = true;
    obstacle.add(roof);

    const doorGeometry = new THREE.BoxGeometry(1.65, 3.45, 0.12);
    for (const x of [-1.22, 1.22]) {
      const frontDoor = new THREE.Mesh(doorGeometry, palette.rail);
      frontDoor.position.set(x, 2.05, 5.31);
      obstacle.add(frontDoor);

      const backDoor = new THREE.Mesh(doorGeometry, palette.rail);
      backDoor.position.set(x, 2.05, -5.31);
      obstacle.add(backDoor);
    }

    const lockBarGeometry = new THREE.BoxGeometry(0.12, 3.3, 0.18);
    for (const x of [-1.95, -0.65, 0.65, 1.95]) {
      const frontLockBar = new THREE.Mesh(lockBarGeometry, palette.obstacleA);
      frontLockBar.position.set(x, 2.05, 5.34);
      obstacle.add(frontLockBar);

      const backLockBar = new THREE.Mesh(lockBarGeometry, palette.obstacleA);
      backLockBar.position.set(x, 2.05, -5.34);
      obstacle.add(backLockBar);
    }
  } else if (type === "double") {
    width = 4.6;
    height = 2.6;
    depth = 5.8;

    for (const x of [-1.45, 1.45]) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.4, 2.2), palette.obstacleA);
      crate.position.set(x, 1.2, 0);
      crate.castShadow = true;
      crate.receiveShadow = true;
      obstacle.add(crate);
    }

    const barrierTop = new THREE.Mesh(new THREE.BoxGeometry(width, 0.55, 0.65), palette.obstacleB);
    barrierTop.position.set(0, 2.35, 0);
    barrierTop.castShadow = true;
    obstacle.add(barrierTop);

    for (const x of [-1.85, 0, 1.85]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.15, 0.08), palette.rail);
      stripe.position.set(x, 2.35, 0.38);
      stripe.rotation.z = -0.35;
      obstacle.add(stripe);
    }
  }

  obstacle.userData = { kind: "obstacle", type, width, height, depth, passed: false };
  scene.add(obstacle);
  if (register) {
    world.obstacles.push(obstacle);
  }
  return obstacle;
}

function createPowerup(type, register = true) {
  const group = new THREE.Group();

  const coreMaterial =
    type === "shield" ? palette.powerShield :
    type === "magnet" ? palette.powerMagnet :
    palette.powerBoost;

  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.05, 0), coreMaterial);
  core.castShadow = true;
  group.add(core);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.6, 0.18, 8, 18),
    new THREE.MeshStandardMaterial({ color: 0xfafcff, emissive: coreMaterial.color, emissiveIntensity: 0.45, flatShading: true })
  );
  halo.rotation.x = Math.PI / 2;
  group.add(halo);

  group.userData = { kind: "powerup", type, radius: 1.8, collected: false };
  scene.add(group);
  if (register) {
    world.powerups.push(group);
  }
  return group;
}

function createCoin(register = true) {
  const group = new THREE.Group();

  const faceFront = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.16, 18), palette.coin);
  faceFront.rotation.z = Math.PI / 2;
  faceFront.castShadow = true;
  group.add(faceFront);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.1, 8, 18), palette.coinEdge);
  rim.rotation.y = Math.PI / 2;
  group.add(rim);

  const stamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.95, 0.12), palette.coinEdge);
  stamp.position.z = 0.1;
  group.add(stamp);

  group.userData = { kind: "coin", radius: 1.35, collected: false };
  scene.add(group);
  if (register) {
    world.coins.push(group);
  }
  return group;
}

function randomObstacleType() {
  const pool = ["crate", "barrier", "pillar"];
  if (world.level >= 2) {
    pool.push("double");
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomPowerupType() {
  const roll = Math.random();
  if (roll < 0.34) return "shield";
  if (roll < 0.67) return "magnet";
  return "boost";
}

function placeObstacle(obstacle, offsetIndex = 0) {
  const laneIndex = Math.floor(Math.random() * LANES.length);
  const gap = 16 + Math.random() * 18 - Math.min(world.level * 0.9, 7);
  const z = BASE_OBSTACLE_Z - offsetIndex * gap - Math.random() * 40;
  setEntityTransform(obstacle, laneIndex, z);
  obstacle.userData.laneIndex = laneIndex;
  obstacle.userData.passed = false;
}

function placePowerup(powerup, offsetIndex = 0) {
  const laneIndex = Math.floor(Math.random() * LANES.length);
  const z = BASE_POWERUP_Z - offsetIndex * (34 + Math.random() * 18) - Math.random() * 55;
  powerup.position.set(LANES[laneIndex], 4.2, z);
  powerup.userData.laneIndex = laneIndex;
  powerup.userData.collected = false;
}

function placeCoin(coin, offsetIndex = 0) {
  const laneIndex = Math.floor(Math.random() * LANES.length);
  const pattern = Math.random();
  let y = 3.7;
  if (pattern > 0.7) {
    y = 6.2;
  } else if (pattern > 0.4) {
    y = 4.8;
  }
  const z = BASE_COIN_Z - offsetIndex * (18 + Math.random() * 10) - Math.random() * 30;
  coin.position.set(LANES[laneIndex], y, z);
  coin.userData.laneIndex = laneIndex;
  coin.userData.collected = false;
}

function seedEntities() {
  world.obstacles.forEach((obstacle) => scene.remove(obstacle));
  world.powerups.forEach((powerup) => scene.remove(powerup));
  world.coins.forEach((coin) => scene.remove(coin));
  world.obstacles = [];
  world.powerups = [];
  world.coins = [];

  for (let i = 0; i < 14; i += 1) {
    const obstacle = createObstacle(randomObstacleType());
    placeObstacle(obstacle, i);
  }

  for (let i = 0; i < 5; i += 1) {
    const powerup = createPowerup(randomPowerupType());
    placePowerup(powerup, i);
  }

  for (let i = 0; i < 18; i += 1) {
    const coin = createCoin();
    placeCoin(coin, i);
  }
}

const playerRig = createPlayer();

function effectSummary() {
  const active = [];
  if (world.activeEffects.shield > 0) active.push(`shield ${durationText(world.activeEffects.shield)}`);
  if (world.activeEffects.magnet > 0) active.push(`magnet ${durationText(world.activeEffects.magnet)}`);
  if (world.activeEffects.boost > 0) active.push(`boost ${durationText(world.activeEffects.boost)}`);
  if (world.activeEffects.highJump > 0) active.push(`high jump ${durationText(world.activeEffects.highJump)}`);
  return active.join(" | ");
}

function refreshStatus() {
  if (world.announcementTimer > 0 && world.announcementText) {
    setStatus(world.announcementText);
    return;
  }

  const effects = effectSummary();
  if (effects) {
    setStatus(`Level ${world.level} | ${effects}`);
    return;
  }

  if (!world.isRunning) {
  setStatus("Run the highway.");
    return;
  }

  const speedRatio = (world.speed - MIN_RUN_SPEED) / (MAX_RUN_SPEED - MIN_RUN_SPEED);
  setStatus(
    speedRatio > 0.72
      ? `Level ${world.level} | Top speed. Keep lanes clean.`
      : `Level ${world.level} | Distance ${Math.floor(world.distance)}m`
  );
}

function resetRun() {
  world.score = 0;
  world.coinsCollected = 0;
  world.nextHighJumpCoins = 100;
  world.speed = MIN_RUN_SPEED;
  world.level = 1;
  world.distance = 0;
  world.laneIndex = 1;
  world.laneTargetX = LANES[1];
  world.playerVelocityY = 0;
  world.activeEffects.shield = 0;
  world.activeEffects.magnet = 0;
  world.activeEffects.boost = 0;
  world.activeEffects.highJump = 0;
  world.deathTimer = 0;
  world.pendingGameOver = null;
  world.wasGrounded = true;
  world.announcementTimer = 0;
  world.announcementText = "";
  playerRig.root.position.set(world.laneTargetX, world.groundY, 4);
  playerRig.root.rotation.set(0, 0, 0);
  playerRig.root.rotation.y = 0;
  playerRig.root.visible = true;
  playerRig.armLeftPivot.rotation.set(0, 0, 0);
  playerRig.armRightPivot.rotation.set(0, 0, 0);
  playerRig.legLeftPivot.rotation.set(0, 0, 0);
  playerRig.legRightPivot.rotation.set(0, 0, 0);
  playerRig.shieldAura.material.opacity = 0;
  playerRig.torso.position.y = 3.85;
  playerRig.head.position.y = 6.02;
  clearDebris();
  seedEntities();
  scoreNode.textContent = "0";
  coinCountNode.textContent = "0";
  gameOverStatsNode.hidden = true;
  startButtonNode.textContent = "Start Run";
  overlayNode.querySelector("h1").textContent = "Boxhead Highway Runner Game";
  panelCopyNode.textContent = "Dodge highway obstacles, switch lanes, and survive as the city speeds up.";
  refreshStatus();
}

function startRun() {
  ensureAudio();
  resetRun();
  world.isRunning = true;
  panelCopyNode.textContent = "Shield blocks one crash, magnet pulls nearby power-ups, and boost surges your speed for a short burst.";
  overlayNode.classList.add("is-hidden");
  startButtonNode.blur();
  setStatus("Level 1 | Build speed and survive.");
  clock.start();
  playChord([220, 277, 330], "triangle", 0.08, 0.22);
}

function endRun() {
  world.isRunning = false;
  overlayNode.classList.remove("is-hidden");
  overlayNode.querySelector("h1").textContent = "Game Over";
  panelCopyNode.textContent = "You clipped an obstacle. Restart the run or check out more games.";
  gameOverStatsNode.hidden = false;
  finalScoreNode.textContent = String(Math.floor(world.score));
  finalDistanceNode.textContent = `${Math.floor(world.distance)}m`;
  finalLevelNode.textContent = String(world.level);
  startButtonNode.textContent = "Try Again";
  if (world.score > world.bestScore) {
    world.bestScore = Math.floor(world.score);
    window.localStorage.setItem("runner-best-score", String(world.bestScore));
    bestScoreNode.textContent = String(world.bestScore);
  }
  refreshStatus();
}

function triggerDeathSequence() {
  world.isRunning = false;
  world.deathTimer = 1.4;
  world.pendingGameOver = {
    score: Math.floor(world.score),
    distance: Math.floor(world.distance),
    level: world.level,
  };
  playerRig.root.visible = false;
  spawnPlayerDebris();
  setStatus("Crash. Pieces scattered across the road.");
  playSound({ frequency: 180, slideTo: 55, duration: 0.5, type: "sawtooth", volume: 0.14 });
  playNoiseBurst(0.14, 0.05, 420);
}

function shiftLane(direction) {
  if (!world.isRunning) return;
  world.laneIndex = THREE.MathUtils.clamp(world.laneIndex + direction, 0, LANES.length - 1);
  world.laneTargetX = LANES[world.laneIndex];
  playSound({ frequency: 320 + world.laneIndex * 60, slideTo: 240 + world.laneIndex * 30, duration: 0.09, type: "square", volume: 0.045 });
  playNoiseBurst(0.03, 0.012, 1200);
}

function jump() {
  if (!world.isRunning) return;
  const grounded = Math.abs(playerRig.root.position.y - currentSupportY()) < 0.05;
  if (grounded) {
    world.playerVelocityY = world.activeEffects.highJump > 0 ? HIGH_JUMP_VELOCITY : JUMP_VELOCITY;
    playSound({ frequency: 420, slideTo: 680, duration: 0.16, type: "triangle", volume: 0.08 });
  }
}

function fastDrop() {
  if (!world.isRunning) return;
  if (playerRig.root.position.y > world.groundY + 0.4) {
    world.playerVelocityY -= 18;
    playSound({ frequency: 240, slideTo: 140, duration: 0.12, type: "square", volume: 0.05 });
  }
}

function handleKeydown(event) {
  if (event.code === "Space") {
    event.preventDefault();
    if (!world.isRunning) {
      return;
    }
  }

  switch (event.code) {
    case "ArrowLeft":
    case "KeyA":
      shiftLane(-1);
      break;
    case "ArrowRight":
    case "KeyD":
      shiftLane(1);
      break;
    case "ArrowUp":
    case "KeyW":
    case "Space":
      jump();
      break;
    case "ArrowDown":
    case "KeyS":
      fastDrop();
      break;
    case "Enter":
      if (!world.isRunning) {
        startRun();
      }
      break;
    default:
      break;
  }
}

function updateSegments(delta) {
  for (const segment of world.segments) {
    segment.position.z += world.speed * delta;
    if (segment.position.z > SEGMENT_LENGTH) {
      segment.position.z -= SEGMENT_LENGTH * SEGMENT_COUNT;
    }
  }

  for (const tower of world.decorative) {
    tower.position.z += world.speed * delta * 0.88;
    if (tower.position.z > 26) {
      tower.position.z -= 620;
    }
  }

  for (const prop of world.props) {
    prop.position.z += world.speed * delta * 0.92;
    if (prop.position.z > 28) {
      prop.position.z -= 620;
    }
  }
}

function updatePlayerAnimation(delta) {
  playerRig.root.position.x = THREE.MathUtils.damp(playerRig.root.position.x, world.laneTargetX, 12, delta);
  world.playerVelocityY -= GRAVITY * delta;
  playerRig.root.position.y += world.playerVelocityY * delta;

  const supportY = currentSupportY();
  if (playerRig.root.position.y < supportY) {
    playerRig.root.position.y = supportY;
    world.playerVelocityY = 0;
  }

  const grounded = Math.abs(playerRig.root.position.y - supportY) < 0.05;
  if (grounded && !world.wasGrounded) {
    playSound({ frequency: 160, slideTo: 110, duration: 0.08, type: "triangle", volume: 0.045 });
    playNoiseBurst(0.04, 0.018, 800);
  }
  world.wasGrounded = grounded;
  const motion = clock.elapsedTime * (grounded ? 13 : 6);
  const armSwing = Math.sin(motion) * (grounded ? 0.9 : 0.25);
  const legSwing = Math.sin(motion + Math.PI) * (grounded ? 0.9 : 0.2);
  const bob = grounded ? Math.abs(Math.sin(motion)) * 0.12 : 0.35;

  playerRig.armLeftPivot.rotation.x = armSwing;
  playerRig.armRightPivot.rotation.x = -armSwing;
  playerRig.legLeftPivot.rotation.x = legSwing;
  playerRig.legRightPivot.rotation.x = -legSwing;
  playerRig.head.rotation.y = Math.sin(clock.elapsedTime * 2.2) * 0.06;
  playerRig.torso.position.y = 3.85 + bob * 0.35;
  playerRig.head.position.y = 6.02 + bob * 0.5;
  playerRig.torso.rotation.z = THREE.MathUtils.damp(playerRig.torso.rotation.z, (world.laneTargetX - playerRig.root.position.x) * 0.03, 5, delta);
  playerRig.root.rotation.z = Math.sin(clock.elapsedTime * 10) * 0.015;

  const shieldPulse = world.activeEffects.shield > 0 ? 0.22 + Math.sin(clock.elapsedTime * 8) * 0.08 : 0;
  playerRig.shieldAura.material.opacity = shieldPulse;
  playerRig.shieldAura.rotation.y += delta * 1.8;
}

function updateCamera(delta) {
  camera.position.x = THREE.MathUtils.damp(camera.position.x, playerRig.root.position.x * 0.35, 5, delta);
  camera.position.y = THREE.MathUtils.damp(camera.position.y, 10.5 + playerRig.root.position.y * 0.06, 4, delta);
  camera.lookAt(playerRig.root.position.x, 4.3, -18);
}

function playerBounds() {
  return {
    minX: playerRig.root.position.x - PLAYER_WIDTH / 2,
    maxX: playerRig.root.position.x + PLAYER_WIDTH / 2,
    minY: playerRig.root.position.y,
    maxY: playerRig.root.position.y + PLAYER_HEIGHT,
    minZ: playerRig.root.position.z - PLAYER_DEPTH / 2,
    maxZ: playerRig.root.position.z + PLAYER_DEPTH / 2,
  };
}

function currentSupportY() {
  let supportY = world.groundY;
  const playerX = playerRig.root.position.x;
  const playerZ = playerRig.root.position.z;

  for (const obstacle of world.obstacles) {
    const data = obstacle.userData;
    if (data.type !== "pillar") {
      continue;
    }

    const withinX = Math.abs(playerX - obstacle.position.x) <= data.width / 2 - 0.15;
    const withinZ = Math.abs(playerZ - obstacle.position.z) <= data.depth / 2 - 0.2;
    if (!withinX || !withinZ) {
      continue;
    }

    const topY = 1.2 + data.height;
    if (playerRig.root.position.y >= topY - 0.6) {
      supportY = Math.max(supportY, topY);
    }
  }

  return supportY;
}

function entityBounds(entity, y, width, height, depth) {
  return {
    minX: entity.position.x - width / 2,
    maxX: entity.position.x + width / 2,
    minY: y,
    maxY: y + height,
    minZ: entity.position.z - depth / 2,
    maxZ: entity.position.z + depth / 2,
  };
}

function intersects(a, b) {
  return (
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minY <= b.maxY &&
    a.maxY >= b.minY &&
    a.minZ <= b.maxZ &&
    a.maxZ >= b.minZ
  );
}

function recycleObstacle(obstacle) {
  obstacle.userData.type = randomObstacleType();
  obstacle.clear();
  const refreshed = createObstacle(obstacle.userData.type, false);
  scene.remove(obstacle);
  const index = world.obstacles.indexOf(obstacle);
  if (index !== -1) {
    world.obstacles[index] = refreshed;
  }
  placeObstacle(refreshed, index);
}

function recyclePowerup(powerup) {
  powerup.userData.type = randomPowerupType();
  powerup.clear();
  const refreshed = createPowerup(powerup.userData.type, false);
  scene.remove(powerup);
  const index = world.powerups.indexOf(powerup);
  if (index !== -1) {
    world.powerups[index] = refreshed;
  }
  placePowerup(refreshed, index);
}

function recycleCoin(coin) {
  const refreshed = createCoin(false);
  scene.remove(coin);
  const index = world.coins.indexOf(coin);
  if (index !== -1) {
    world.coins[index] = refreshed;
  }
  placeCoin(refreshed, index);
}

function activatePowerup(type) {
  if (type === "shield") {
    world.activeEffects.shield = 8;
    playChord([440, 554, 659], "triangle", 0.06, 0.2);
  } else if (type === "magnet") {
    world.activeEffects.magnet = 10;
    playChord([392, 494, 587], "sine", 0.05, 0.22);
  } else if (type === "boost") {
    world.activeEffects.boost = 6;
    playChord([330, 440, 660], "square", 0.04, 0.18);
  }
  refreshStatus();
}

function updateEffects(delta) {
  const active = world.activeEffects;
  active.shield = Math.max(0, active.shield - delta);
  active.magnet = Math.max(0, active.magnet - delta);
  active.boost = Math.max(0, active.boost - delta);
  active.highJump = Math.max(0, active.highJump - delta);
  world.announcementTimer = Math.max(0, world.announcementTimer - delta);
  if (world.announcementTimer === 0) {
    world.announcementText = "";
  }
}

function updateObstacles(delta) {
  const playerBox = playerBounds();
  for (let i = 0; i < world.obstacles.length; i += 1) {
    const obstacle = world.obstacles[i];
    obstacle.position.z += world.speed * delta;

    const data = obstacle.userData;
    const obstacleBox = entityBounds(obstacle, 1.2, data.width, data.height, data.depth);
    if (intersects(playerBox, obstacleBox)) {
      if (data.type === "pillar") {
        const topY = 1.2 + data.height;
        const feetY = playerRig.root.position.y;
        const descending = world.playerVelocityY <= 0;
        const overTopSurface = feetY >= topY - 0.75;
        if (descending && overTopSurface) {
          playerRig.root.position.y = topY;
          world.playerVelocityY = 0;
          world.wasGrounded = true;
          continue;
        }
      }

      if (world.activeEffects.shield > 0) {
        world.activeEffects.shield = 0;
        playChord([220, 196, 164], "sawtooth", 0.05, 0.18);
        playNoiseBurst(0.06, 0.026, 900);
        recycleObstacle(obstacle);
        refreshStatus();
        continue;
      }
      triggerDeathSequence();
      return true;
    }

    if (!data.passed && obstacle.position.z > playerRig.root.position.z) {
      data.passed = true;
      world.score += 16;
      scoreNode.textContent = String(Math.floor(world.score));
    }

    if (obstacle.position.z > CLEAR_Z) {
      recycleObstacle(obstacle);
    }
  }
  return false;
}

function updatePowerups(delta) {
  const playerBox = playerBounds();
  for (const powerup of world.powerups) {
    powerup.position.z += world.speed * delta;
    powerup.rotation.y += delta * 2.6;
    powerup.position.y = 4.2 + Math.sin(clock.elapsedTime * 4 + powerup.position.z * 0.02) * 0.55;

    if (world.activeEffects.magnet > 0 && powerup.position.z > -18) {
      powerup.position.x = THREE.MathUtils.damp(powerup.position.x, playerRig.root.position.x, 4, delta);
    }

    const bounds = entityBounds(powerup, powerup.position.y - 1, 2, 2, 2);
    if (intersects(playerBox, bounds)) {
      activatePowerup(powerup.userData.type);
      world.score += 25;
      scoreNode.textContent = String(Math.floor(world.score));
      recyclePowerup(powerup);
      continue;
    }

    if (powerup.position.z > CLEAR_Z) {
      recyclePowerup(powerup);
    }
  }
}

function updateCoins(delta) {
  const playerBox = playerBounds();
  for (const coin of world.coins) {
    coin.position.z += world.speed * delta;
    coin.rotation.y += delta * 4.8;
    coin.rotation.z = Math.sin(clock.elapsedTime * 8 + coin.position.z * 0.02) * 0.22;

    if (world.activeEffects.magnet > 0 && coin.position.z > -26) {
      coin.position.x = THREE.MathUtils.damp(coin.position.x, playerRig.root.position.x, 5.6, delta);
      coin.position.y = THREE.MathUtils.damp(coin.position.y, playerRig.root.position.y + 2.4, 4.4, delta);
    }

    const bounds = entityBounds(coin, coin.position.y - 1, 1.9, 1.9, 1.2);
    if (intersects(playerBox, bounds)) {
      world.score += 12;
      world.coinsCollected += 1;
      scoreNode.textContent = String(Math.floor(world.score));
      coinCountNode.textContent = String(world.coinsCollected);
      playSound({ frequency: 880, slideTo: 1120, duration: 0.08, type: "triangle", volume: 0.085 });
      if (world.coinsCollected >= world.nextHighJumpCoins) {
        world.activeEffects.highJump = 8;
        world.nextHighJumpCoins += 100;
        world.announcementTimer = 2.2;
        world.announcementText = "High Jump Awarded!";
        playChord([392, 523, 659], "triangle", 0.08, 0.22);
        refreshStatus();
      }
      recycleCoin(coin);
      continue;
    }

    if (coin.position.z > CLEAR_Z) {
      recycleCoin(coin);
    }
  }
}

function updateLevelProgression() {
  const targetLevel = Math.min(6, 1 + Math.floor(world.distance / LEVEL_DISTANCE));
  if (targetLevel !== world.level) {
    world.level = targetLevel;
    playChord([262, 330, 392, 523], "triangle", 0.055, 0.24);
    refreshStatus();
  }
}

function updateGame(delta) {
  updateEffects(delta);

  const boostMultiplier = world.activeEffects.boost > 0 ? 1.35 : 1;
  const targetSpeed = Math.min(MAX_RUN_SPEED, MIN_RUN_SPEED + world.level * 4 + world.distance * 0.007);
  world.speed = THREE.MathUtils.damp(world.speed, Math.min(MAX_RUN_SPEED, targetSpeed * boostMultiplier), 2, delta);
  world.distance += world.speed * delta * 0.75;
  world.score += delta * (8 + world.level * 2);
  scoreNode.textContent = String(Math.floor(world.score));

  updateLevelProgression();
  updateSegments(delta);
  updatePlayerAnimation(delta);
  updateCamera(delta);

  const crashed = updateObstacles(delta);
  if (crashed) {
    return;
  }

  updatePowerups(delta);
  updateCoins(delta);
  refreshStatus();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  if (world.isRunning) {
    updateGame(delta);
  } else if (world.deathTimer > 0) {
    world.deathTimer = Math.max(0, world.deathTimer - delta);
    updateSegments(delta * 0.45);
    updateDebris(delta);
    updateCamera(delta);
    if (world.deathTimer === 0 && world.pendingGameOver) {
      endRun();
      world.pendingGameOver = null;
    }
  } else {
    updateCamera(delta);
    playerRig.head.rotation.y = Math.sin(clock.elapsedTime * 1.7) * 0.18;
    playerRig.root.rotation.y += delta * 0.5;
    skylineGroup.rotation.y = Math.sin(clock.elapsedTime * 0.08) * 0.015;
  }

  renderer.render(scene, camera);
}

function buildWorld() {
  for (let i = 0; i < SEGMENT_COUNT; i += 1) {
    createRoadSegment(i);
  }
  populateSkyline();
  resetRun();
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", handleKeydown);
startButtonNode.addEventListener("click", () => {
  playSound({ frequency: 520, slideTo: 680, duration: 0.08, type: "triangle", volume: 0.05 });
  startRun();
});
touchControlsNode.addEventListener("pointerdown", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;

  playSound({ frequency: 460, slideTo: 520, duration: 0.05, type: "triangle", volume: 0.03 });

  if (action === "left") shiftLane(-1);
  if (action === "right") shiftLane(1);
  if (action === "jump") jump();
  if (action === "drop") fastDrop();
});

buildWorld();
animate();
