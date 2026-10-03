import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/loaders/DRACOLoader.js';
import { gameConfig } from './gameConfig.js';
import { createWorld } from './world.js';

const canvas = document.querySelector('#game');
const startBtn = document.querySelector('#startBtn');
const restartBtn = document.querySelector('#restartBtn');
const menuBtn = document.querySelector('#menuBtn');
const menu = document.querySelector('#menu');
const gameOver = document.querySelector('#gameOver');
const hud = document.querySelector('#hud');
const touchControls = document.querySelector('#touchControls');
const speedValue = document.querySelector('#speedValue');
const nitroFill = document.querySelector('#nitroFill');
const scoreValue = document.querySelector('#scoreValue');
const comboValue = document.querySelector('#comboValue');
const eventValue = document.querySelector('#eventValue');
const distanceValue = document.querySelector('#distanceValue');
const timeValue = document.querySelector('#timeValue');
const message = document.querySelector('#message');
const finalScore = document.querySelector('#finalScore');
const finalStats = document.querySelector('#finalStats');
const bestScore = document.querySelector('#bestScore');
const crashFlash = document.querySelector('#crashFlash');
const locationValue = document.querySelector('#locationValue');
const healthSegments = [...document.querySelectorAll('#healthSegments span')];
const nitroStatus = document.querySelector('#nitroStatus');
const nitroMeter = document.querySelector('#nitroMeter');
const speedCluster = document.querySelector('#speedCluster');
const finalBadge = document.querySelector('#finalBadge');
const pauseMenu = document.querySelector('#pauseMenu');
const resumeBtn = document.querySelector('#resumeBtn');
const pauseMenuBtn = document.querySelector('#pauseMenuBtn');
const garage = document.querySelector('#garage');
const garageBtn = document.querySelector('#garageBtn');
const pauseGarageBtn = document.querySelector('#pauseGarageBtn');
const gameOverGarageBtn = document.querySelector('#gameOverGarageBtn');
const garageActionBtn = document.querySelector('#garageActionBtn');
const garageBackBtn = document.querySelector('#garageBackBtn');
const garageCarLevel = document.querySelector('#garageCarLevel');
const carBest = document.querySelector('#carBest');
const garageProgress = document.querySelector('#garageProgress');
const upgradePointsValue = document.querySelector('#upgradePoints');
const upgradeButtons = [...document.querySelectorAll('.upgrade-button[data-upgrade]')];
const paintButtons = [...document.querySelectorAll('.paint-swatch[data-paint]')];
const customPaintPicker = document.querySelector('#customPaintPicker');
const paintColorValue = document.querySelector('#paintColorValue');
const muteBtn = document.querySelector('#muteBtn');
let garageOrigin = 'menu';
let assetsLoaded = false;
const rotatePrompt = document.getElementById('rotatePrompt');
const rewardCue = document.getElementById('rewardCue');
const rewardTitle = rewardCue.querySelector('strong');
const rewardTarget = rewardCue.querySelector('span');
const isTouchDevice = () => document.documentElement.classList.contains('touch');
const needsLandscape = () => isTouchDevice() && innerHeight > innerWidth;

const scoreFitCache = new WeakMap();
function fitScoreText(element, force = false) {
  const width = element.clientWidth;
  if (!width) return;
  const length = element.textContent.length;
  const previous = scoreFitCache.get(element);
  if (!force && previous?.width === width && previous?.length === length) return;

  // Measure at the responsive base size; only long values need smaller text.
  element.style.removeProperty('--fit-score-size');
  const fontSize = parseFloat(getComputedStyle(element).fontSize);
  const range = document.createRange();
  range.selectNodeContents(element);
  const textWidth = range.getBoundingClientRect().width;
  const available = Math.max(1, width - 4);
  if (textWidth > available) {
    const fittedSize = Math.floor(fontSize * available / textWidth * 100) / 100;
    element.style.setProperty('--fit-score-size', `${fittedSize}px`);
  }
  scoreFitCache.set(element, { width, length });
}

const MORE_GAMES_URL = `https://g55.co/?utm_source=moreGamesButton&utm_medium=${encodeURIComponent(document.title)}`;
document.querySelectorAll('.more-games-link').forEach(link => {
  link.href = MORE_GAMES_URL;
  link.target = '_blank';
  link.rel = 'noopener';
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const MAX_PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 1.35);
let qualityPixelRatio = MAX_PIXEL_RATIO;
renderer.setPixelRatio(qualityPixelRatio);
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

// Lightweight static studio/sky reflection map dedicated to the player car paint.
// Generated once at load so metallic chassis.0 stays glossy without any per-frame
// reflection texture updates or extra scene render passes.
function createCarPaintEnvironment() {
  const envCanvas = document.createElement('canvas');
  envCanvas.width = 512;
  envCanvas.height = 256;
  const ctx = envCanvas.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, 150);
  sky.addColorStop(0, '#225f9f');
  sky.addColorStop(.55, '#7fc5f5');
  sky.addColorStop(1, '#eaf7ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 150);

  const ground = ctx.createLinearGradient(0, 145, 0, 256);
  ground.addColorStop(0, '#8fa4a6');
  ground.addColorStop(.18, '#586b63');
  ground.addColorStop(1, '#17201f');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 145, 512, 111);

  const horizon = ctx.createLinearGradient(0, 128, 0, 168);
  horizon.addColorStop(0, 'rgba(255,255,255,0)');
  horizon.addColorStop(.48, 'rgba(255,255,255,.82)');
  horizon.addColorStop(.58, 'rgba(255,244,220,.42)');
  horizon.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, 122, 512, 52);

  for (const [x, y, r, alpha] of [[106, 82, 48, .9], [382, 102, 68, .35]]) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, `rgba(255,248,225,${alpha})`);
    glow.addColorStop(.22, `rgba(255,238,198,${alpha * .55})`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x-r, y-r, r*2, r*2);
  }

  const source = new THREE.CanvasTexture(envCanvas);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.SRGBColorSpace;
  source.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const target = pmrem.fromEquirectangular(source);
  pmrem.dispose();
  source.dispose();
  return target;
}
const carPaintEnvironmentTarget = createCarPaintEnvironment();
const carPaintEnvironmentMap = carPaintEnvironmentTarget.texture;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91c8ff);
scene.fog = new THREE.FogExp2(0xa9c6d4, 0.0058);

const camera = new THREE.PerspectiveCamera(61, innerWidth / innerHeight, 0.1, 700);
camera.position.set(0, 4.4, 10.5);
camera.rotation.x = -0.12;
scene.add(camera);

const state = {
  mode: 'menu',
  speed: 0,
  targetSpeed: 0,
  nitro: .72,
  score: 0,
  combo: 1,
  comboHold: 0,
  distance: 0,
  time: 0,
  health: 1,
  laneX: 0,
  steer: 0,
  shake: 0,
  overtakes: 0,
  nearMisses: 0,
  lastNearAt: -10,
  draftTime: 0,
  drafting: false,
  draftAnnounced: false,
  nextEventTime: 17,
  event: null,
  previousEvent: '',
  densityTimer: 0,
  crashSlow: 0,
  endDelay: 0,
  milestones: new Set(),
  zoneIndex: 0,
  announcedZone: -1,
  ended: false,
  visualPrevSpeed: 0,
  dayTimeHours: 8.5,
  boosting: false,
  boostVisual: 0,
  fatalCrash: null,
  wreckDodges: 0,
  pileupEscapes: 0,
  cleanKm: 0,
  nextCleanDistance: 1000,
  highSpeedTime: 0,
  progressBaseMeters: 0,
  lastProgressSave: 0,
};

const input = { left: false, right: false, up: false, down: false, nitro: false };
const heldKeyboard = new Set();
const heldPointers = new Map();
const keyActions = { ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right', ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down', Space:'nitro' };
function syncHeldInput() {
  Object.keys(input).forEach(key => { input[key] = false; });
  heldKeyboard.forEach(code => { if (keyActions[code]) input[keyActions[code]] = true; });
  heldPointers.forEach(({ key }) => { input[key] = true; });
}
function clearHeldInput() {
  heldKeyboard.clear();
  const pointers = [...heldPointers];
  heldPointers.clear();
  for (const [id, { element }] of pointers) {
    element.classList.remove('held');
    try { if (element.hasPointerCapture(id)) element.releasePointerCapture(id); } catch {}
  }
  Object.keys(input).forEach(key => { input[key] = false; });
}
function clearFeedback() {
  clearTimeout(showMessage.t);
  message.classList.remove('show');
  message.textContent = '';
  crashFlash.classList.remove('show');
}
const environment = createWorld({ scene, camera, renderer });
const world = new THREE.Group();
scene.add(world); // Vehicles and crash effects belong to gameplay, not the environment.
const traffic = [];
const { laneCenters: laneXs, playerZ: PLAYER_Z, centerAt: roadCenterAtZ,
  heightAt: roadHeightAtZ, yawAt: roadYawAtZ, pitchAt: roadPitchAtZ } = environment.road;

function routeDistanceAtZ(z) { return state.distance + PLAYER_Z - z; }
function routePacing(distance = state.distance) { return environment.getTrafficSettings(distance); }
function zoneAtDistance(distance) { return environment.getLocation(distance).index; }
function currentZone() { return environment.getLocation(state.distance); }
function updateRoad(dt, speed) {
  environment.update({ dt, distance: state.distance, speed, lateralOffset: state.laneX });
}
function updateEnvironment(dt) {
  environment.updateLocation({ dt, distance: state.distance });
  const location = environment.getLocation(state.distance);
  state.zoneIndex = location.index;
  if (state.mode === 'playing' && state.distance > 120 && state.announcedZone !== location.index) {
    state.announcedZone = location.index; showMessage(location.name, 900);
  }
}
function updateMood(dt = 0) {
  environment.updateAtmosphere({ dt, timeOfDay: state.dayTimeHours, fog: state.event?.type === 'fog' });
}
function resetRouteScenery() {
  environment.reset({ distance: state.distance, timeOfDay: state.dayTimeHours, lateralOffset: state.laneX, fog: state.event?.type === 'fog' });
}
function playerInsideTunnel() { return environment.isInsideTunnel(PLAYER_Z); }

const mats = {
  dark: new THREE.MeshStandardMaterial({ color: 0x111820, roughness: .3, metalness: .35 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x83b5d6, roughness: .08, metalness: .08, transparent: true, opacity: .86, transmission: .08, clearcoat: .55, clearcoatRoughness: .16 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x101214, roughness: .85 }),
  trailer: new THREE.MeshStandardMaterial({ color: 0xd8dde0, roughness: .62, metalness: .18 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xaab2b7, roughness: .3, metalness: .82 })
};

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  // finalizeVehicle enables shadow casting on the appropriate vehicle pieces.
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}

function disposeGroupGeometry(group) {
  const disposed = new Set();
  group.traverse(o => {
    if (o.isMesh && o.geometry && !disposed.has(o.geometry)) { disposed.add(o.geometry); o.geometry.dispose(); }
    if (o.isInstancedMesh) o.dispose();
  });
  while (group.children.length) group.remove(group.children[0]);
}

function carMaterial(color) { return new THREE.MeshPhysicalMaterial({ color, roughness: .22, metalness: .62, clearcoat: .82, clearcoatRoughness: .12 }); }

function finalizeVehicle(g) {
  const shadowMeshes = [];
  g.traverse(o => {
    if (!o.isMesh) return;
    o.receiveShadow = true;
    const mat = o.material;
    const transparent = !!mat?.transparent;
    const emissive = !!(mat?.emissive && mat.emissive.getHex() !== 0);
    o.castShadow = !transparent && !emissive;
    if (o.castShadow) shadowMeshes.push(o);
  });
  g.userData.shadowMeshes = shadowMeshes;
  g.userData.shadowState = true;
  return g;
}

function updateVehicleShadowRange(g, z) {
  const enabled = z > -125 && z < 32;
  if (g.userData.shadowState === enabled) return;
  g.userData.shadowState = enabled;
  for (const m of g.userData.shadowMeshes || []) m.castShadow = enabled;
}

function createWheel(radius = .42, width = .34) {
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 14), mats.tire); tire.rotation.z = Math.PI / 2; tire.castShadow = true; wheel.add(tire);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * .52, radius * .52, width + .015, 10), mats.rim); rim.rotation.z = Math.PI / 2; wheel.add(rim);
  wheel.userData.radius = radius;
  return wheel;
}

function addRearIndicators(g, x = .92, y = .74, z = 2.19) {
  const indicatorLeft = new THREE.MeshStandardMaterial({ color: 0x7a4b00, emissive: 0xffa21a, emissiveIntensity: 0, roughness: .35 });
  const indicatorRight = indicatorLeft.clone();
  for (const [xx, mat] of [[-x, indicatorLeft], [x, indicatorRight]]) { const a = box(.18, .12, .045, mat); a.position.set(xx, y, z); g.add(a); }
  g.userData.indicatorLeft = indicatorLeft; g.userData.indicatorRight = indicatorRight;
}

function createCar(color = 0x2ba4ff, playerCar = false) {
  const g = new THREE.Group();
  const paint = carMaterial(color);
  const lower = box(2.05, .58, 4.3, paint); lower.position.y = .58; g.add(lower);
  const hood = box(1.96, .30, 1.34, paint); hood.position.set(0, .95, -1.25); hood.rotation.x = -.05; g.add(hood);
  const cabin = box(1.7, .82, 1.92, paint); cabin.position.set(0, 1.21, .25); g.add(cabin);
  const windshield = box(1.48, .53, .07, mats.glass); windshield.position.set(0, 1.34, -.75); windshield.rotation.x = .33; g.add(windshield);
  const rearGlass = windshield.clone(); rearGlass.position.z = 1.27; rearGlass.rotation.x = -.33; g.add(rearGlass);
  const bumper = box(2.0, .22, .25, mats.dark); bumper.position.set(0, .45, 2.15); g.add(bumper);
  const splitter = box(2.15, .13, .45, mats.dark); splitter.position.set(0, .3, -2.03); g.add(splitter);
  const wheels = [];
  for (const x of [-1.04, 1.04]) for (const z of [-1.35, 1.35]) { const w = createWheel(.42, .34); w.position.set(x, .44, z); g.add(w); wheels.push(w); }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x74152a, emissive: 0xff214a, emissiveIntensity: .16, roughness: .28 });
  for (const x of [-.64, .64]) { const t = box(.48, .16, .04, tailMat); t.position.set(x, .77, 2.18); g.add(t); }
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdff7ff, emissive: 0xdaf5ff, emissiveIntensity: .06, roughness: .18 });
  for (const x of [-.64, .64]) { const h = box(.52, .13, .04, headMat); h.position.set(x, .77, -2.18); g.add(h); }
  addRearIndicators(g, .92, .74, 2.19);
  const grille = box(1.25, .24, .05, mats.dark); grille.position.set(0, .58, -2.19); g.add(grille);
  for (const x of [-1.08, 1.08]) {
    const mirror = box(.28, .16, .38, paint); mirror.position.set(x, 1.28, -.22); g.add(mirror);
    const skirt = box(.14, .18, 2.55, mats.dark); skirt.position.set(x * .98, .35, .05); g.add(skirt);
  }
  for (const x of [-.52, .52]) { const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .32, 8), mats.dark); exhaust.rotation.x = Math.PI / 2; exhaust.position.set(x, .38, 2.31); g.add(exhaust); }
  const roofGlass = box(1.15, .035, .9, mats.glass); roofGlass.position.set(0, 1.64, .25); g.add(roofGlass);
  if (playerCar) {
    const spoiler = box(1.7, .12, .30, mats.dark); spoiler.position.set(0, 1.05, 2.0); g.add(spoiler);
    const st1 = box(.12, .48, .12, mats.dark); st1.position.set(-.62, .82, 1.92); g.add(st1);
    const st2 = st1.clone(); st2.position.x = .62; g.add(st2);
    const diffuser = box(1.6, .12, .32, mats.dark); diffuser.position.set(0, .3, 2.17); g.add(diffuser);
  }
  g.userData.wheels = wheels; g.userData.tailMat = tailMat; g.userData.headMat = headMat;
  return finalizeVehicle(g);
}

function createTruck(color = 0xffc342) {
  const g = new THREE.Group();
  const paint = carMaterial(color);
  const cab = box(2.35, 1.85, 2.35, paint); cab.position.set(0, 1.22, -1.95); g.add(cab);
  const glass = box(1.8, .58, .08, mats.glass); glass.position.set(0, 1.52, -3.14); glass.rotation.x = .07; g.add(glass);
  const trailer = box(2.5, 2.55, 4.25, mats.trailer); trailer.position.set(0, 1.55, 1.35); g.add(trailer);
  const bumper = box(2.45, .24, .28, mats.dark); bumper.position.set(0, .5, 3.52); g.add(bumper);
  const wheels = [];
  for (const x of [-1.18, 1.18]) for (const z of [-2.2, 1.75, 2.65]) { const w = createWheel(.46, .36); w.position.set(x, .48, z); g.add(w); wheels.push(w); }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x74152a, emissive: 0xff214a, emissiveIntensity: .16, roughness: .3 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdff7ff, emissive: 0xdaf5ff, emissiveIntensity: .06, roughness: .2 });
  for (const x of [-.73, .73]) { const t = box(.48, .18, .04, tailMat); t.position.set(x, .84, 3.5); g.add(t); const h = box(.48, .18, .04, headMat); h.position.set(x, .9, -3.16); g.add(h); }
  addRearIndicators(g, 1.0, .80, 3.51);
  g.userData.wheels = wheels; g.userData.tailMat = tailMat; g.userData.headMat = headMat;
  return finalizeVehicle(g);
}

function createSUV(color = 0x5f6f7d) {
  const g = new THREE.Group(), paint = carMaterial(color);
  const body = box(2.18, .78, 4.45, paint); body.position.y = .68; g.add(body);
  const cabin = box(1.92, 1.10, 2.35, paint); cabin.position.set(0, 1.43, .25); g.add(cabin);
  const windshield = box(1.68, .64, .07, mats.glass); windshield.position.set(0, 1.55, -.96); windshield.rotation.x = .25; g.add(windshield);
  const rear = windshield.clone(); rear.position.z = 1.45; rear.rotation.x = -.18; g.add(rear);
  const wheels = []; for (const x of [-1.12, 1.12]) for (const z of [-1.38, 1.38]) { const w = createWheel(.48, .36); w.position.set(x, .48, z); g.add(w); wheels.push(w); }
  const rail1 = box(.08, .10, 2.1, mats.dark); rail1.position.set(-.65, 2.02, .22); g.add(rail1); const rail2 = rail1.clone(); rail2.position.x = .65; g.add(rail2);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x74152a, emissive: 0xff214a, emissiveIntensity: .16, roughness: .3 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdff7ff, emissive: 0xdaf5ff, emissiveIntensity: .06, roughness: .2 });
  for (const x of [-.7, .7]) { const t = box(.46, .16, .04, tailMat); t.position.set(x, .88, 2.24); g.add(t); const h = box(.50, .16, .04, headMat); h.position.set(x, .9, -2.24); g.add(h); }
  addRearIndicators(g, .96, .85, 2.25);
  g.userData.wheels = wheels; g.userData.tailMat = tailMat; g.userData.headMat = headMat;
  return finalizeVehicle(g);
}

function createVan(color = 0xd7dce0) {
  const g = new THREE.Group(), paint = carMaterial(color);
  const body = box(2.25, 1.55, 4.8, paint); body.position.y = 1.06; g.add(body);
  const nose = box(2.15, .72, 1.05, paint); nose.position.set(0, .78, -2.42); g.add(nose);
  const glass = box(1.8, .68, .07, mats.glass); glass.position.set(0, 1.55, -2.44); glass.rotation.x = .12; g.add(glass);
  const sideGlassMat = new THREE.MeshPhysicalMaterial({ color: 0x638aa3, roughness: .1, metalness: .08, transparent: true, opacity: .84, clearcoat: .4 });
  for (const x of [-1.14, 1.14]) { const sw = box(.06, .62, 1.7, sideGlassMat); sw.position.set(x, 1.56, -.35); g.add(sw); }
  const wheels = []; for (const x of [-1.17, 1.17]) for (const z of [-1.45, 1.48]) { const w = createWheel(.44, .36); w.position.set(x, .46, z); g.add(w); wheels.push(w); }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x74152a, emissive: 0xff214a, emissiveIntensity: .16, roughness: .3 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdff7ff, emissive: 0xdaf5ff, emissiveIntensity: .06, roughness: .2 });
  for (const x of [-.72, .72]) { const t = box(.44, .17, .04, tailMat); t.position.set(x, .75, 2.42); g.add(t); const h = box(.48, .18, .04, headMat); h.position.set(x, .85, -2.96); g.add(h); }
  addRearIndicators(g, 1.0, .78, 2.43);
  g.userData.wheels = wheels; g.userData.tailMat = tailMat; g.userData.headMat = headMat;
  return finalizeVehicle(g);
}

const PLAYER_CARS = [
  { id: 'falcon-s', name: 'FALCON S', modelFile: 'assets/car1.glb', color: 0xf41d7b, shape: [1.00, 1.00, 1.00] }
];
const MAX_UPGRADE_LEVEL = 5;
const UPGRADE_KEYS = ['engine', 'handling', 'nitro', 'armor'];

const dracoLoader = new DRACOLoader();
// Required for GLB files using KHR_draco_mesh_compression.
// Decoder files are pinned to the same Three.js release as GLTFLoader.
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/libs/draco/');
dracoLoader.setDecoderConfig({ type: 'wasm' });

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

const optionalPlayerModels = new Map();
const optionalPlayerModelStatus = new Map();

function normalizeOptionalCarModel(model, def) {
  // Ideal export: Y-up, nose toward -Z. Common X-axis car exports are auto-rotated.
  model.updateMatrixWorld(true);
  let bounds = new THREE.Box3().setFromObject(model);
  let size = bounds.getSize(new THREE.Vector3());

  if (size.x > size.z * 1.18) {
    model.rotation.y -= Math.PI / 2;
    model.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(model);
    size = bounds.getSize(new THREE.Vector3());
  }

  const targetWidth = 2.15 * def.shape[0];
  const targetHeight = 1.80 * def.shape[1];
  const targetLength = 4.45 * def.shape[2];
  const safeX = Math.max(size.x, 0.001);
  const safeY = Math.max(size.y, 0.001);
  const safeZ = Math.max(size.z, 0.001);
  const fitScale = Math.min(targetWidth / safeX, targetHeight / safeY, targetLength / safeZ) * gameConfig.playerCar.scale;
  model.scale.multiplyScalar(fitScale);
  model.updateMatrixWorld(true);

  bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= bounds.min.y;
  model.position.y += 0.09; // Keep the GLB tires just above the road surface (road top is ~0.075).
  model.updateMatrixWorld(true);

  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of materials) {
      if (!mat) continue;
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      if ('envMapIntensity' in mat) mat.envMapIntensity = Math.max(mat.envMapIntensity || 0, .75);
      mat.needsUpdate = true;
    }
  });
  model.userData.isOptionalGLB = true;
  return model;
}

function cloneOptionalCarModel(def) {
  const source = optionalPlayerModels.get(def.id);
  if (!source) return null;
  const clone = source.clone(true);
  clone.userData.isOptionalGLB = true;
  return clone;
}

async function loadOptionalPlayerCar(def, onProgress = null) {
  optionalPlayerModelStatus.set(def.id, 'loading');
  try {
    const gltf = await gltfLoader.loadAsync(def.modelFile, event => {
      if (!onProgress) return;
      const total = Number(event?.total || 0);
      const loaded = Number(event?.loaded || 0);
      if (total > 0) onProgress(THREE.MathUtils.clamp(loaded / total, 0, 1));
    });
    const sceneRoot = gltf.scene || gltf.scenes?.[0];
    if (!sceneRoot) throw new Error('GLB contains no scene');
    const normalized = normalizeOptionalCarModel(sceneRoot, def);
    optionalPlayerModels.set(def.id, normalized);
    optionalPlayerModelStatus.set(def.id, 'loaded');
    if (currentCarDef().id === def.id) replacePlayerVehicle(selectedCarIndex);
    console.info(`[cars] Loaded optional ${def.modelFile} for ${def.name}.`);
  } catch (err) {
    optionalPlayerModelStatus.set(def.id, 'fallback');
    console.warn(`[cars] Failed to load ${def.modelFile}; using procedural ${def.name}.`, err);
  }
}

async function loadOptionalPlayerCars(onOverallProgress = null) {
  const defs = PLAYER_CARS.filter(def => def.modelFile);
  if (!defs.length) {
    onOverallProgress?.(1);
    return;
  }

  // Preload every GLB referenced by the game before enabling Start. Missing
  // optional files fail gracefully and keep their procedural fallback.
  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const base = i / defs.length;
    const span = 1 / defs.length;
    await loadOptionalPlayerCar(def, assetProgress => {
      onOverallProgress?.(base + assetProgress * span);
    });
    onOverallProgress?.((i + 1) / defs.length);
  }
}

function clampUpgradeLevel(value) {
  return THREE.MathUtils.clamp(Math.round(Number(value) || 1), 1, MAX_UPGRADE_LEVEL);
}
function normalizePaintColor(value) {
  const text = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : '#f41d7b';
}
function paintColorNumber(value = '#f41d7b') {
  return Number.parseInt(normalizePaintColor(value).slice(1), 16);
}
function loadProgressionProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem('g55HighwayProgression') || '{}');
    const oldBests = raw.bests || {};
    const upgrades = raw.upgrades || {};
    const totalDistance = Math.max(0, Number(raw.totalDistance || 0));
    const isLegacyProfile = !raw.upgrades && raw.upgradePoints == null;
    const migratedPoints = isLegacyProfile ? Math.min(8, Math.floor(totalDistance / 10000)) : 0;
    return {
      totalDistance,
      bestScore: Math.max(0, Number(raw.bestScore || oldBests['falcon-s'] || 0)),
      upgradePoints: Math.max(0, Math.floor(Number(raw.upgradePoints ?? migratedPoints))),
      paintColor: normalizePaintColor(raw.paintColor),
      upgrades: {
        engine: clampUpgradeLevel(upgrades.engine),
        handling: clampUpgradeLevel(upgrades.handling),
        nitro: clampUpgradeLevel(upgrades.nitro),
        armor: clampUpgradeLevel(upgrades.armor)
      }
    };
  } catch {
    return { totalDistance: 0, bestScore: 0, upgradePoints: 0, paintColor: '#f41d7b', upgrades: { engine: 1, handling: 1, nitro: 1, armor: 1 } };
  }
}
function saveProgressionProfile() {
  try { localStorage.setItem('g55HighwayProgression', JSON.stringify(progressionProfile)); }
  catch { /* embeds/private mode can block storage */ }
}
const progressionProfile = loadProgressionProfile();
let selectedCarIndex = 0;
function currentCarDef() {
  const base = PLAYER_CARS[0];
  const u = progressionProfile.upgrades;
  return {
    ...base,
    color: paintColorNumber(progressionProfile.paintColor),
    speedMul: 1 + (u.engine - 1) * .035,
    accelMul: 1 + (u.engine - 1) * .050,
    handlingMul: 1 + (u.handling - 1) * .060,
    nitroMul: 1 + (u.nitro - 1) * .110
  };
}
function armorLevel() { return progressionProfile.upgrades.armor; }
function maxCarHealth() { return THREE.MathUtils.clamp(armorLevel(), 1, MAX_UPGRADE_LEVEL); }
function armorCrashSpeedRetention() { return .54 + (armorLevel() - 1) * .035; }
function armorCrashNitroRetention() { return .62 + (armorLevel() - 1) * .045; }
function armorCrashSlowTime() { return Math.max(.13, .24 - (armorLevel() - 1) * .022); }
function upgradeCost(level) { return level >= MAX_UPGRADE_LEVEL ? 0 : level; }

const exhaustFlameOuterGeo = new THREE.ConeGeometry(.13, 1.05, 7, 1, true);
const exhaustFlameCoreGeo = new THREE.ConeGeometry(.075, .66, 7, 1, true);
const exhaustFlameOuterMat = new THREE.MeshBasicMaterial({
  color: 0xff7a18,
  transparent: true,
  opacity: .88,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  toneMapped: false
});
const exhaustFlameCoreMat = new THREE.MeshBasicMaterial({
  color: 0x7edbff,
  transparent: true,
  opacity: .96,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  toneMapped: false
});

function createBoostExhaustFlame(anchorNode) {
  const flame = new THREE.Group();
  flame.name = 'boost_exhaust_flame';
  flame.visible = false;

  const outer = new THREE.Mesh(exhaustFlameOuterGeo, exhaustFlameOuterMat);
  outer.rotation.x = Math.PI / 2;
  outer.position.z = .525;
  outer.frustumCulled = false;
  flame.add(outer);

  const core = new THREE.Mesh(exhaustFlameCoreGeo, exhaustFlameCoreMat);
  core.rotation.x = Math.PI / 2;
  core.position.z = .33;
  core.frustumCulled = false;
  flame.add(core);

  anchorNode.add(flame);
  return flame;
}

function bindGLBPaintMaterials(model, colorValue) {
  const targetName = 'chassis.0';
  const targetColor = new THREE.Color(colorValue);
  const cloneMap = new Map();
  const paintMaterials = [];

  model.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const sourceMaterials = Array.isArray(o.material) ? o.material : [o.material];
    let changed = false;
    const nextMaterials = sourceMaterials.map(mat => {
      if (!mat || String(mat.name || '').toLowerCase() !== targetName) return mat;
      changed = true;
      let copy = cloneMap.get(mat);
      if (!copy) {
        // Convert the chassis paint to a dedicated automotive MeshPhysicalMaterial.
        // Reuse any useful texture/normal data from the source GLB while forcing
        // predictable metallic/clearcoat behavior for every production car.
        copy = new THREE.MeshPhysicalMaterial({
          name: mat.name,
          color: targetColor.clone(),
          map: mat.map || null,
          normalMap: mat.normalMap || null,
          normalScale: mat.normalScale?.clone ? mat.normalScale.clone() : undefined,
          aoMap: mat.aoMap || null,
          aoMapIntensity: mat.aoMapIntensity ?? 1,
          alphaMap: mat.alphaMap || null,
          transparent: mat.transparent || false,
          opacity: mat.opacity ?? 1,
          side: mat.side,
          depthWrite: mat.depthWrite,
          depthTest: mat.depthTest,
          metalness: .78,
          roughness: .16,
          clearcoat: 1.0,
          clearcoatRoughness: .055,
          envMap: carPaintEnvironmentMap,
          envMapIntensity: 1.35
        });
        copy.dithering = true;
        copy.needsUpdate = true;
        cloneMap.set(mat, copy);
        paintMaterials.push(copy);
      }
      return copy;
    });
    if (changed) o.material = Array.isArray(o.material) ? nextMaterials : nextMaterials[0];
  });

  return paintMaterials;
}

function createPlayerVehicle(def) {
  const root = new THREE.Group();
  const optionalModel = cloneOptionalCarModel(def);
  if (optionalModel) {
    root.add(optionalModel);
    root.userData.glbPaintMaterials = bindGLBPaintMaterials(optionalModel, def.color);
    root.userData.modelType = 'glb';
    root.userData.modelFile = def.modelFile;
    let cockpitAnchor = optionalModel.getObjectByName('windscreen_dummy');
    if (!cockpitAnchor) optionalModel.traverse(o => {
      if (!cockpitAnchor && typeof o.name === 'string' && o.name.toLowerCase() === 'windscreen_dummy') cockpitAnchor = o;
    });
    root.userData.cockpitAnchor = cockpitAnchor || null;

    const glbWheelNames = ['wheel_rf_dummy', 'wheel_rb_dummy', 'wheel_lf_dummy', 'wheel_lb_dummy'];
    const glbWheels = [];
    for (const wheelName of glbWheelNames) {
      let node = optionalModel.getObjectByName(wheelName);
      if (!node) optionalModel.traverse(o => {
        if (!node && typeof o.name === 'string' && o.name.toLowerCase() === wheelName) node = o;
      });
      if (!node) continue;
      optionalModel.updateMatrixWorld(true);
      const wheelBounds = new THREE.Box3().setFromObject(node);
      const wheelSize = wheelBounds.getSize(new THREE.Vector3());
      const radius = Number.isFinite(wheelSize.y) && wheelSize.y > .08
        ? THREE.MathUtils.clamp(Math.max(wheelSize.y, wheelSize.z) * .5, .25, .85)
        : .44;
      glbWheels.push({ node, baseQuaternion: node.quaternion.clone(), radius, spin: 0, isFront: wheelName === 'wheel_rf_dummy' || wheelName === 'wheel_lf_dummy' });
    }
    root.userData.glbWheels = glbWheels;

    // Attach real road-illuminating SpotLights to the GLB headlight anchors.
    // Expected Blender object names: headlights and headlights001.
    const glbHeadlights = [];
    for (const headlightName of ['headlights', 'headlights001']) {
      let headlightNode = optionalModel.getObjectByName(headlightName);
      if (!headlightNode) optionalModel.traverse(o => {
        if (!headlightNode && typeof o.name === 'string' && o.name.toLowerCase() === headlightName) headlightNode = o;
      });
      if (!headlightNode) continue;

      const spot = new THREE.SpotLight(0xe8f6ff, 0, 225, .39, .58, 1.12);
      spot.name = `${headlightName}_spot`;
      spot.position.set(0, 0, 0);
      spot.castShadow = false;

      const target = new THREE.Object3D();
      target.name = `${headlightName}_target`;
      // Car forward is -Z. Keep a slight downward pitch so the beam lands on the road.
      target.position.set(0, -2.35, -112);
      headlightNode.add(target);
      spot.target = target;
      headlightNode.add(spot);

      glbHeadlights.push({ node: headlightNode, light: spot, target });
    }
    root.userData.glbHeadlights = glbHeadlights;

    const exhaustFlames = [];
    for (const exhaustName of ['exhaust', 'exhaust001']) {
      let exhaustNode = optionalModel.getObjectByName(exhaustName);
      if (!exhaustNode) optionalModel.traverse(o => {
        if (!exhaustNode && typeof o.name === 'string' && o.name.toLowerCase() === exhaustName) exhaustNode = o;
      });
      if (exhaustNode) exhaustFlames.push(createBoostExhaustFlame(exhaustNode));
    }
    root.userData.exhaustFlames = exhaustFlames;

    // Use the GLB's actual rear-lamp meshes for brake lights when available.
    // Blender object name expected: lights.
    const glbBrakeLightMaterials = [];
    for (const lightName of ['lights']) {
      let lightNode = optionalModel.getObjectByName(lightName);
      if (!lightNode) optionalModel.traverse(o => {
        if (!lightNode && typeof o.name === 'string' && o.name.toLowerCase() === lightName) lightNode = o;
      });
      if (!lightNode) continue;
      lightNode.traverse(o => {
        if (!o.isMesh || !o.material) return;
        const original = Array.isArray(o.material) ? o.material : [o.material];
        const cloned = original.map(mat => {
          const m = mat.clone();
          if (m.emissive?.set) {
            m.emissive.set(0xff163d);
            m.emissiveIntensity = .22;
            glbBrakeLightMaterials.push({ material: m, emissive: true });
          } else if (m.color?.clone) {
            glbBrakeLightMaterials.push({ material: m, emissive: false, baseColor: m.color.clone() });
          }
          return m;
        });
        o.material = Array.isArray(o.material) ? cloned : cloned[0];
      });
    }
    root.userData.glbBrakeLightMaterials = glbBrakeLightMaterials;

    // Gameplay dimensions/stats remain tied to this car slot, independent of visual model.
    root.userData.wheels = null;
    root.userData.tailMat = null;
    root.userData.headMat = null;
    root.userData.indicatorLeft = null;
    root.userData.indicatorRight = null;
  } else {
    const model = createCar(def.color, true);
    model.scale.set(def.shape[0], def.shape[1], def.shape[2]);
    // Match the GLB size adjustment while preserving the fallback's default size.
    model.scale.multiplyScalar(gameConfig.playerCar.scale / 1.30);
    root.add(model);
    root.userData.modelType = 'procedural';
    root.userData.modelFile = null;
    root.userData.wheels = model.userData.wheels;
    root.userData.glbWheels = null;
    root.userData.glbHeadlights = null;
    root.userData.exhaustFlames = null;
    root.userData.glbBrakeLightMaterials = null;
    root.userData.glbPaintMaterials = null;
    root.userData.tailMat = model.userData.tailMat;
    root.userData.headMat = model.userData.headMat;
    root.userData.indicatorLeft = model.userData.indicatorLeft;
    root.userData.indicatorRight = model.userData.indicatorRight;
    root.userData.cockpitAnchor = null;
  }
  return root;
}

let player = createPlayerVehicle(currentCarDef());
player.position.set(0, 0, PLAYER_Z);
const playerHeadlight = new THREE.SpotLight(0xdff2ff, 0, 165, .34, .70, 1.25);
playerHeadlight.position.set(0, 1.08, -1.65);
const headlightTarget = new THREE.Object3D();
headlightTarget.position.set(0, -.55, -88);
if (!player.userData.glbHeadlights?.length) {
  playerHeadlight.visible = true;
  player.add(headlightTarget);
  playerHeadlight.target = headlightTarget;
  player.add(playerHeadlight);
} else {
  // GLB-mounted headlights are authoritative. Keep the legacy centered beam
  // fully detached/hidden so it cannot overlap the two real lamp beams.
  playerHeadlight.intensity = 0;
  playerHeadlight.visible = false;
}
player.visible = assetsLoaded;
world.add(player);

let cameraMode = 'chase';
const cockpitWorldScale = new THREE.Vector3(1, 1, 1);

function setCameraMode(mode, announce = true) {
  if (mode === 'cockpit') {
    const anchor = player?.userData?.cockpitAnchor;
    if (!anchor) {
      if (announce) showMessage('COCKPIT VIEW UNAVAILABLE', 850);
      return false;
    }
    anchor.add(camera);
    cameraMode = 'cockpit';
    camera.rotation.set(0, 0, 0);
    anchor.getWorldScale(cockpitWorldScale);
    camera.position.set(
      gameConfig.cockpitCamera.position.x / Math.max(Math.abs(cockpitWorldScale.x), .0001),
      gameConfig.cockpitCamera.position.y / Math.max(Math.abs(cockpitWorldScale.y), .0001),
      gameConfig.cockpitCamera.position.z / Math.max(Math.abs(cockpitWorldScale.z), .0001)
    );
    camera.scale.set(
      1 / Math.max(Math.abs(cockpitWorldScale.x), .0001),
      1 / Math.max(Math.abs(cockpitWorldScale.y), .0001),
      1 / Math.max(Math.abs(cockpitWorldScale.z), .0001)
    );
    camera.near = .035;
    camera.fov = 70;
    camera.updateProjectionMatrix();
    if (announce) showMessage('COCKPIT VIEW', 650);
    return true;
  }

  if (camera.parent !== scene) scene.attach(camera);
  cameraMode = 'chase';
  camera.scale.set(1, 1, 1);
  camera.near = .1;
  camera.position.set(player.position.x, player.position.y + 4.25, 10.3);
  camera.rotation.set(-.12, 0, 0);
  camera.fov = 61;
  camera.updateProjectionMatrix();
  if (announce) showMessage('CHASE VIEW', 650);
  return true;
}

function toggleCameraMode() {
  if (cameraMode === 'cockpit') setCameraMode('chase');
  else setCameraMode('cockpit');
}

function replacePlayerVehicle(index = selectedCarIndex) {
  selectedCarIndex = index;
  const def = currentCarDef();
  const requestedCameraMode = cameraMode;
  if (camera.parent !== scene) scene.attach(camera);
  camera.scale.set(1, 1, 1);
  const pos = player.position.clone();
  const rot = player.rotation.clone();
  player.remove(playerHeadlight);
  player.remove(headlightTarget);
  world.remove(player);
  player = createPlayerVehicle(def);
  player.position.copy(pos);
  player.rotation.copy(rot);
  if (!player.userData.glbHeadlights?.length) {
    playerHeadlight.visible = true;
    player.add(headlightTarget);
    playerHeadlight.target = headlightTarget;
    player.add(playerHeadlight);
  } else {
    // Do not leave the centered fallback beam attached when the GLB provides
    // headlights/headlights001.
    if (playerHeadlight.parent) playerHeadlight.parent.remove(playerHeadlight);
    if (headlightTarget.parent) headlightTarget.parent.remove(headlightTarget);
    playerHeadlight.intensity = 0;
    playerHeadlight.visible = false;
  }
  player.visible = assetsLoaded;
  world.add(player);
  if (requestedCameraMode === 'cockpit' && player.userData.cockpitAnchor) setCameraMode('cockpit', false);
  else setCameraMode('chase', false);
}


// FINAL WRECK FX -------------------------------------------------------------
// Lightweight particles/debris used only for the collision that consumes the
// player's final Armor life. They stay dormant during normal gameplay.
const fatalSparkCount = 42;
const fatalSparkPositions = new Float32Array(fatalSparkCount * 3);
const fatalSparkGeometry = new THREE.BufferGeometry();
fatalSparkGeometry.setAttribute('position', new THREE.BufferAttribute(fatalSparkPositions, 3));
const fatalSparkMaterial = new THREE.PointsMaterial({
  color: 0xffc86a, size: .18, sizeAttenuation: true, transparent: true, opacity: 0,
  depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
});
const fatalSparks = new THREE.Points(fatalSparkGeometry, fatalSparkMaterial);
fatalSparks.frustumCulled = false;
fatalSparks.visible = false;
world.add(fatalSparks);
const fatalSparkVelocities = Array.from({ length: fatalSparkCount }, () => new THREE.Vector3());
const fatalSparkLife = new Float32Array(fatalSparkCount);

const fatalDebrisGeometry = new THREE.BoxGeometry(.18, .08, .34);
const fatalDebrisMaterial = new THREE.MeshStandardMaterial({ color: 0x343941, roughness: .72, metalness: .42 });
const fatalDebris = Array.from({ length: 9 }, (_, i) => {
  const mesh = new THREE.Mesh(fatalDebrisGeometry, fatalDebrisMaterial);
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.userData.velocity = new THREE.Vector3();
  mesh.userData.spin = new THREE.Vector3();
  mesh.userData.life = 0;
  mesh.scale.setScalar(.75 + (i % 3) * .18);
  world.add(mesh);
  return mesh;
});

function burstFatalSparks(x, y, z, side = 1, strength = 1) {
  fatalSparks.visible = true;
  fatalSparkMaterial.opacity = 1;
  for (let i = 0; i < fatalSparkCount; i++) {
    const o = i * 3;
    fatalSparkPositions[o] = x + (Math.random() - .5) * .55;
    fatalSparkPositions[o + 1] = y + .38 + Math.random() * .55;
    fatalSparkPositions[o + 2] = z + (Math.random() - .5) * .45;
    fatalSparkVelocities[i].set(
      (-side * (2.2 + Math.random() * 5.6) + (Math.random() - .5) * 3.1) * strength,
      (2.1 + Math.random() * 5.4) * strength,
      ((Math.random() - .5) * 7.2 - 1.1) * strength
    );
    fatalSparkLife[i] = .42 + Math.random() * .62;
  }
  fatalSparkGeometry.attributes.position.needsUpdate = true;
}

function spawnFatalDebris(side = 1, boost = false) {
  for (let i = 0; i < fatalDebris.length; i++) {
    const d = fatalDebris[i];
    d.visible = true;
    d.position.set(
      player.position.x + (Math.random() - .5) * 1.35,
      player.position.y + .42 + Math.random() * .72,
      PLAYER_Z + (Math.random() - .5) * 1.3
    );
    d.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    d.userData.velocity.set(
      (-side * (1.4 + Math.random() * 3.8) + (Math.random() - .5) * 2.0) * (boost ? 1.25 : 1),
      1.8 + Math.random() * 3.8,
      -2.4 + (Math.random() - .5) * 4.5
    );
    d.userData.spin.set((Math.random() - .5) * 9, (Math.random() - .5) * 12, (Math.random() - .5) * 10);
    d.userData.life = 2.8 + Math.random() * 1.2;
  }
}

function resetFatalCrashEffects() {
  fatalSparks.visible = false;
  fatalSparkMaterial.opacity = 0;
  fatalSparkLife.fill(0);
  for (const d of fatalDebris) { d.visible = false; d.userData.life = 0; }
}

function updateFatalCrashEffects(dt, worldSpeed) {
  let maxLife = 0;
  if (fatalSparks.visible) {
    for (let i = 0; i < fatalSparkCount; i++) {
      if (fatalSparkLife[i] <= 0) continue;
      fatalSparkLife[i] -= dt;
      maxLife = Math.max(maxLife, fatalSparkLife[i]);
      const o = i * 3;
      const v = fatalSparkVelocities[i];
      v.y -= 12.5 * dt;
      fatalSparkPositions[o] += v.x * dt;
      fatalSparkPositions[o + 1] += v.y * dt;
      fatalSparkPositions[o + 2] += (worldSpeed + v.z) * dt;
      const ground = roadHeightAtZ(fatalSparkPositions[o + 2]) + .08;
      if (fatalSparkPositions[o + 1] < ground) {
        fatalSparkPositions[o + 1] = ground;
        v.y = Math.abs(v.y) * .18;
        v.x *= .72; v.z *= .72;
      }
    }
    fatalSparkGeometry.attributes.position.needsUpdate = true;
    fatalSparkMaterial.opacity = THREE.MathUtils.clamp(maxLife * 1.6, 0, 1);
    if (maxLife <= 0) fatalSparks.visible = false;
  }

  for (const d of fatalDebris) {
    if (!d.visible || d.userData.life <= 0) continue;
    d.userData.life -= dt;
    const v = d.userData.velocity;
    v.y -= 9.8 * dt;
    d.position.x += v.x * dt;
    d.position.y += v.y * dt;
    d.position.z += (worldSpeed + v.z) * dt;
    d.rotation.x += d.userData.spin.x * dt;
    d.rotation.y += d.userData.spin.y * dt;
    d.rotation.z += d.userData.spin.z * dt;
    const ground = roadHeightAtZ(d.position.z) + .07;
    if (d.position.y < ground) {
      d.position.y = ground;
      if (Math.abs(v.y) > .45) v.y = Math.abs(v.y) * .24; else v.y = 0;
      v.x *= Math.exp(-4.5 * dt);
      v.z *= Math.exp(-4.5 * dt);
      d.userData.spin.multiplyScalar(Math.exp(-4.0 * dt));
    }
    if (d.userData.life <= 0) d.visible = false;
  }
}

function formatPercent(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
}

function upgradeEffectText(key, level) {
  const step = level - 1;
  if (key === 'engine') return `${Math.round(292 * (1 + step * .035))} km/h`;
  if (key === 'handling') return `${100 + step * 6}% steering`;
  if (key === 'nitro') return `${((1 + step * .11) / .245).toFixed(1)} s boost`;
  if (key === 'armor') return `${level} collision ${level === 1 ? 'life' : 'lives'}`;
  return '';
}

function updatePaintUI() {
  const selected = normalizePaintColor(progressionProfile.paintColor);
  if (paintColorValue) paintColorValue.textContent = selected.toUpperCase();
  if (customPaintPicker) customPaintPicker.value = selected;
  for (const btn of paintButtons) {
    const active = normalizePaintColor(btn.dataset.paint) === selected;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  }
}

function applyPaintColor(value, announce = true) {
  const selected = normalizePaintColor(value);
  progressionProfile.paintColor = selected;
  saveProgressionProfile();

  const paintMaterials = player?.userData?.glbPaintMaterials || [];
  if (paintMaterials.length) {
    const color = new THREE.Color(selected);
    for (const mat of paintMaterials) {
      if (mat.color?.copy) mat.color.copy(color);
      mat.needsUpdate = true;
    }
  } else if (player?.userData?.modelType === 'procedural') {
    replacePlayerVehicle(0);
  } else if (announce) {
    showMessage('CHASSIS.0 MATERIAL NOT FOUND', 900);
  }

  updatePaintUI();
  if (announce && audio) beep(660, .07, .035, 'triangle');
}

function updateGarageUI(rebuildPlayer = false) {
  updatePaintUI();
  if (garageProgress) garageProgress.textContent = `${(progressionProfile.totalDistance / 1000).toFixed(1)} KM`;
  if (carBest) carBest.textContent = Math.max(Number(progressionProfile.bestScore || 0), readBest()).toLocaleString();
  if (upgradePointsValue) upgradePointsValue.textContent = `${progressionProfile.upgradePoints}`;
  if (garageCarLevel) {
    const totalLevels = UPGRADE_KEYS.reduce((sum, key) => sum + progressionProfile.upgrades[key], 0);
    garageCarLevel.textContent = `${totalLevels} / ${MAX_UPGRADE_LEVEL * UPGRADE_KEYS.length}`;
  }

  for (const key of UPGRADE_KEYS) {
    const level = progressionProfile.upgrades[key];
    const levelEl = document.querySelector(`[data-level="${key}"]`);
    const effectEl = document.querySelector(`[data-effect="${key}"]`);
    if (levelEl) levelEl.textContent = `LV ${level}/${MAX_UPGRADE_LEVEL}`;
    if (effectEl) effectEl.textContent = upgradeEffectText(key, level);
  }

  for (const btn of upgradeButtons) {
    const key = btn.dataset.upgrade;
    const level = progressionProfile.upgrades[key];
    const maxed = level >= MAX_UPGRADE_LEVEL;
    const cost = upgradeCost(level);
    const affordable = !maxed && progressionProfile.upgradePoints >= cost;
    const row = btn.closest('.upgrade-row');
    btn.disabled = maxed || !affordable;
    btn.classList.toggle('maxed', maxed);
    row?.classList.toggle('affordable', affordable);
    row?.classList.toggle('maxed', maxed);
    btn.textContent = maxed ? 'MAXED' : `UPGRADE · ${cost} PT${cost === 1 ? '' : 'S'}`;
    btn.setAttribute('aria-label', maxed ? `${key}, maximum level` : `Upgrade ${key} for ${cost} point${cost === 1 ? '' : 's'}${affordable ? '' : ', not enough points'}`);
  }

  // Keep the main-menu label geometry stable as the saved balance changes.
  if (garageBtn) garageBtn.textContent = 'GARAGE';
  if (pauseGarageBtn) pauseGarageBtn.textContent = 'GARAGE';
  if (rebuildPlayer) replacePlayerVehicle(0);
}

function purchaseUpgrade(key) {
  if (!UPGRADE_KEYS.includes(key)) return;
  const level = progressionProfile.upgrades[key];
  if (level >= MAX_UPGRADE_LEVEL) return;
  const cost = upgradeCost(level);
  if (progressionProfile.upgradePoints < cost) return;
  progressionProfile.upgradePoints -= cost;
  progressionProfile.upgrades[key] = level + 1;
  if (key === 'armor' && (state.mode === 'playing' || state.mode === 'paused') && !state.ended) {
    state.health = Math.min(maxCarHealth(), state.health + 1);
    updateHUD();
    showMessage(`ARMOR · ${maxCarHealth()} STATUS`, 900);
  }
  saveProgressionProfile();
  updateGarageUI(false);
  const row = document.querySelector(`[data-upgrade-row="${key}"]`);
  if (row) {
    row.classList.remove('upgrade-flash');
    void row.offsetWidth;
    row.classList.add('upgrade-flash');
  }
  if (audio) beep(780 + progressionProfile.upgrades[key] * 55, .10, .045, 'triangle');
}

function openGarage(origin = 'menu') {
  if (!assetsLoaded) return;
  clearHeldInput();
  clearFeedback();
  setGarageTab('upgrades');
  garageOrigin = origin;
  updateGarageUI(false);
  menu.classList.remove('visible');
  pauseMenu.classList.remove('visible');
  gameOver.classList.remove('visible');
  garage.classList.add('visible');
  if (origin === 'paused') {
    garageActionBtn.textContent = 'RESUME DRIVE';
    garageBackBtn.setAttribute('aria-label', 'Back to pause');
  } else if (origin === 'gameover') {
    garageActionBtn.textContent = 'DRIVE AGAIN';
    garageBackBtn.setAttribute('aria-label', 'Back to results');
  } else {
    garageActionBtn.textContent = 'START DRIVE';
    garageBackBtn.setAttribute('aria-label', 'Back to menu');
  }
  window.G55UI.syncDialogs();
}

function closeGarage() {
  garage.classList.remove('visible');
  if (garageOrigin === 'paused') pauseMenu.classList.add('visible');
  else if (garageOrigin === 'gameover') {
    gameOver.classList.add('visible');
    fitScoreText(finalScore, true);
  }
  else menu.classList.add('visible');
  updateOrientation();
  window.G55UI.syncDialogs();
}

function garagePrimaryAction() {
  garage.classList.remove('visible');
  if (garageOrigin === 'paused') resumeGame();
  else resetGame();
}

function commitRunProgress() {
  if (!state.progressBaseMeters && state.distance <= 0) return;
  const liveTotal = state.progressBaseMeters + state.distance;
  if (liveTotal > progressionProfile.totalDistance) progressionProfile.totalDistance = liveTotal;
  saveProgressionProfile();
}

const trafficColors = [0x29b6f6, 0xffc342, 0xef5350, 0x7e57c2, 0x66bb6a, 0xe0e4e8, 0x263238, 0xff7043];

function pickTrafficKind(distance = state.distance) {
  if (state.event?.type === 'convoy' && Math.random() < .65) return 'truck';
  const weights = environment.getTrafficSettings(distance).weights;
  let r = Math.random() * Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  for (const [kind, weight] of Object.entries(weights)) { r -= weight; if (r < 0) return kind; }
  return 'sedan';
}
function chooseTrafficLane(z, ignore = null) {
  const lanes = [0, 1, 2, 3].sort(() => Math.random() - .5);
  return lanes.find(lane => !traffic.some(t => t !== ignore && Math.abs(t.mesh.position.z - z) < 23 && Math.abs(t.laneOffset - laneXs[lane]) < 1.4)) ?? lanes[0];
}
function createTrafficVehicle(kind, color) {
  const mesh = kind === 'truck' ? createTruck(color) : kind === 'suv' ? createSUV(color) : kind === 'van' ? createVan(color) : createCar(color);
  if (kind === 'sport') mesh.scale.set(.96, .86, .98);
  return mesh;
}
function disposeTrafficVehicle(mesh) {
  const shared = new Set(Object.values(mats)), materials = new Set();
  mesh.traverse(o => {
    if (!o.isMesh) return;
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) if (mat && !shared.has(mat)) materials.add(mat);
  });
  world.remove(mesh);
  disposeGroupGeometry(mesh);
  materials.forEach(mat => mat.dispose());
}
function spawnTraffic(forceZ = null, forcedKind = null, forcedLane = null) {
  const z = forceZ ?? (-220 - Math.random() * 130);
  const kind = forcedKind || pickTrafficKind(routeDistanceAtZ(z));
  const color = trafficColors[Math.floor(Math.random() * trafficColors.length)];
  const mesh = createTrafficVehicle(kind, color);
  const laneIndex = forcedLane ?? chooseTrafficLane(z);
  let baseSpeed;
  if (kind === 'truck') baseSpeed = 72 + Math.random() * 58;
  else if (kind === 'sport') baseSpeed = 145 + Math.random() * 90;
  else if (kind === 'suv') baseSpeed = 98 + Math.random() * 78;
  else if (kind === 'van') baseSpeed = 82 + Math.random() * 68;
  else baseSpeed = 92 + Math.random() * 92;
  mesh.position.set(roadCenterAtZ(z) + laneXs[laneIndex], roadHeightAtZ(z), z);
  world.add(mesh);
  traffic.push({
    mesh, kind, baseSpeed, routeZone: zoneAtDistance(routeDistanceAtZ(z)),
    laneIndex, laneOffset: laneXs[laneIndex], targetLane: laneIndex,
    laneChangeTimer: 2.5 + Math.random() * 5.5,
    nearChecked: false, wreckDodgeChecked: false, passed: false,
    halfWidth: kind === 'truck' ? 1.25 : kind === 'van' ? 1.14 : kind === 'suv' ? 1.10 : 1.03,
    halfLength: kind === 'truck' ? 3.45 : kind === 'van' ? 2.55 : kind === 'suv' ? 2.35 : 2.15,
    wobble: Math.random() * Math.PI * 2,
    physicsActive: false,
    physVx: 0,
    physForward: baseSpeed / 3.6,
    physYawVel: 0,
    physicsAge: 0,
    collisionCooldown: 0,
    physicsSettled: false,
    playerContact: false
  });
}
for (let i = 0; i < 10; i++) spawnTraffic(-65 - i * 32 - Math.random() * 18);

let audio = null;
const AUDIO_MUTED_KEY = 'g55HighwayMuted';
const AUDIO_MASTER_LEVEL = 1.75;

let audioMuted = false;
try { audioMuted = localStorage.getItem(AUDIO_MUTED_KEY) === '1'; }
catch { audioMuted = false; }

function updateMuteButton() {
  window.G55UI.setSoundMuted(audioMuted);
}

function gameAudioShouldBeAudible() {
  return !audioMuted && state.mode === 'playing' && !state.ended;
}

function syncAudioState(immediate = false) {
  updateMuteButton();
  if (!audio) return;
  const now = audio.ctx.currentTime;
  const target = gameAudioShouldBeAudible() ? AUDIO_MASTER_LEVEL : 0;
  audio.master.gain.cancelScheduledValues(now);
  if (immediate) audio.master.gain.setValueAtTime(target, now);
  else {
    audio.master.gain.setValueAtTime(audio.master.gain.value, now);
    audio.master.gain.linearRampToValueAtTime(target, now + .035);
  }
}

function setMuted(value) {
  audioMuted = !!value;
  try { localStorage.setItem(AUDIO_MUTED_KEY, audioMuted ? '1' : '0'); }
  catch { /* storage can be unavailable in private embeds */ }
  if (!audioMuted && state.mode === 'playing') ensureAudio();
  syncAudioState(true);
}

function toggleMute() { setMuted(!audioMuted); }

function makeNoiseBuffer(ctx, seconds = 2) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = last * .72 + white * .28;
    data[i] = last;
  }
  return buffer;
}

function ensureAudio() {
  if (audio) { syncAudioState(true); return; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  const mix = ctx.createGain();
  const engineBus = ctx.createGain();
  const ambienceBus = ctx.createGain();
  const sfxBus = ctx.createGain();
  const tunnelDelay = ctx.createDelay(.14);
  const tunnelFeedback = ctx.createGain();
  const tunnelWet = ctx.createGain();
  const engineFilter = ctx.createBiquadFilter();
  const limiter = ctx.createDynamicsCompressor();

  master.gain.value = 0;
  mix.gain.value = 1;
  engineBus.gain.value = 1.15;
  ambienceBus.gain.value = 1.10;
  sfxBus.gain.value = 1.18;
  tunnelDelay.delayTime.value = .062;
  tunnelFeedback.gain.value = .17;
  tunnelWet.gain.value = 0;
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 4200;
  engineFilter.Q.value = .35;
  limiter.threshold.value = -10;
  limiter.knee.value = 12;
  limiter.ratio.value = 5;
  limiter.attack.value = .003;
  limiter.release.value = .18;

  mix.connect(master);
  mix.connect(tunnelDelay);
  tunnelDelay.connect(tunnelWet).connect(master);
  tunnelDelay.connect(tunnelFeedback).connect(tunnelDelay);
  master.connect(limiter).connect(ctx.destination);
  engineBus.connect(engineFilter).connect(mix);
  ambienceBus.connect(mix);
  sfxBus.connect(mix);

  const engine = ctx.createOscillator();
  const engine2 = ctx.createOscillator();
  const engine3 = ctx.createOscillator();
  const gain = ctx.createGain();
  const gain2 = ctx.createGain();
  const gain3 = ctx.createGain();
  engine.type = 'sawtooth';
  engine2.type = 'triangle';
  engine3.type = 'sine';
  gain.gain.value = .02;
  gain2.gain.value = .008;
  gain3.gain.value = .003;
  engine.connect(gain).connect(engineBus);
  engine2.connect(gain2).connect(engineBus);
  engine3.connect(gain3).connect(engineBus);
  engine.start(); engine2.start(); engine3.start();

  const noiseBuffer = makeNoiseBuffer(ctx);
  const wind = ctx.createBufferSource();
  const windFilter = ctx.createBiquadFilter();
  const windGain = ctx.createGain();
  wind.buffer = noiseBuffer; wind.loop = true;
  windFilter.type = 'highpass'; windFilter.frequency.value = 620; windFilter.Q.value = .28;
  windGain.gain.value = 0;
  wind.connect(windFilter).connect(windGain).connect(ambienceBus);
  wind.start();

  const boostNoise = ctx.createBufferSource();
  const boostFilter = ctx.createBiquadFilter();
  const boostGain = ctx.createGain();
  boostNoise.buffer = noiseBuffer; boostNoise.loop = true;
  boostFilter.type = 'bandpass'; boostFilter.frequency.value = 980; boostFilter.Q.value = .5;
  boostGain.gain.value = 0;
  boostNoise.connect(boostFilter).connect(boostGain).connect(ambienceBus);
  boostNoise.start();

  const skidNoise = ctx.createBufferSource();
  const skidFilter = ctx.createBiquadFilter();
  const skidGain = ctx.createGain();
  skidNoise.buffer = noiseBuffer; skidNoise.loop = true;
  skidFilter.type = 'bandpass'; skidFilter.frequency.value = 1450; skidFilter.Q.value = 1.1;
  skidGain.gain.value = 0;
  skidNoise.connect(skidFilter).connect(skidGain).connect(ambienceBus);
  skidNoise.start();

  audio = {
    ctx, master, limiter, mix, engineBus, ambienceBus, sfxBus,
    tunnelDelay, tunnelFeedback, tunnelWet, engineFilter,
    engine, engine2, engine3, gain, gain2, gain3,
    noiseBuffer, wind, windFilter, windGain,
    boostNoise, boostFilter, boostGain,
    skidNoise, skidFilter, skidGain,
    currentGear: 2, shiftDip: 0, wasBoosting: false
  };
  syncAudioState(true);
}

function beep(freq = 440, duration = .08, vol = .05, type = 'sine') {
  if (!audio || !gameAudioShouldBeAudible()) return;
  const o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, audio.ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(.001, audio.ctx.currentTime + duration);
  o.connect(g).connect(audio.sfxBus); o.start(); o.stop(audio.ctx.currentTime + duration);
}

function playNoiseBurst(duration = .22, vol = .035, filterType = 'bandpass', frequency = 1400, pan = 0) {
  if (!audio || !gameAudioShouldBeAudible()) return;
  const now = audio.ctx.currentTime;
  const src = audio.ctx.createBufferSource();
  const filter = audio.ctx.createBiquadFilter();
  const gain = audio.ctx.createGain();
  const panner = audio.ctx.createStereoPanner ? audio.ctx.createStereoPanner() : null;
  src.buffer = audio.noiseBuffer;
  filter.type = filterType;
  filter.frequency.value = frequency;
  filter.Q.value = filterType === 'bandpass' ? .72 : .35;
  gain.gain.setValueAtTime(.001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(.001, vol), now + Math.min(.028, duration * .2));
  gain.gain.exponentialRampToValueAtTime(.001, now + duration);
  if (panner) panner.pan.value = THREE.MathUtils.clamp(pan, -1, 1);
  src.connect(filter).connect(gain);
  if (panner) gain.connect(panner).connect(audio.sfxBus); else gain.connect(audio.sfxBus);
  src.start(now); src.stop(now + duration + .02);
}

function playPassWhoosh(relativeX = 0, kind = 'sedan', strength = 1) {
  if (!audio || !gameAudioShouldBeAudible()) return;
  const pan = THREE.MathUtils.clamp(relativeX / 5.5, -1, 1);
  const truck = kind === 'truck';
  playNoiseBurst(truck ? .38 : .27, (truck ? .052 : .035) * strength, 'bandpass', truck ? 650 : 1550, pan);
  if (truck) {
    const now = audio.ctx.currentTime;
    const o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
    const p = audio.ctx.createStereoPanner ? audio.ctx.createStereoPanner() : null;
    o.type = 'sine';
    o.frequency.setValueAtTime(122, now);
    o.frequency.exponentialRampToValueAtTime(72, now + .34);
    g.gain.setValueAtTime(.026 * strength, now);
    g.gain.exponentialRampToValueAtTime(.001, now + .36);
    if (p) p.pan.value = pan;
    o.connect(g); if (p) g.connect(p).connect(audio.sfxBus); else g.connect(audio.sfxBus);
    o.start(now); o.stop(now + .37);
  }
}

function playCrashImpact(strength = 1, heavy = false, nitro = false) {
  if (!audio || !gameAudioShouldBeAudible()) return;
  const s = THREE.MathUtils.clamp(strength, .25, 1.7);
  playNoiseBurst(.22 + s * .05, .048 * s, 'lowpass', heavy ? 820 : 1250, 0);
  playNoiseBurst(.12, .014 * s, 'highpass', 3400, (Math.random() - .5) * .5);
  const now = audio.ctx.currentTime;
  const o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(heavy ? 47 : 62, now);
  o.frequency.exponentialRampToValueAtTime(31, now + .24);
  g.gain.setValueAtTime(.062 * s, now);
  g.gain.exponentialRampToValueAtTime(.001, now + .28);
  o.connect(g).connect(audio.sfxBus); o.start(now); o.stop(now + .29);
  if (nitro) playNoiseBurst(.30, .032 * s, 'bandpass', 930, 0);
}

function playGearShift(up = true) {
  if (!audio || !gameAudioShouldBeAudible()) return;
  const now = audio.ctx.currentTime;
  const o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(up ? 118 : 92, now);
  o.frequency.exponentialRampToValueAtTime(up ? 72 : 118, now + .075);
  g.gain.setValueAtTime(.024, now);
  g.gain.exponentialRampToValueAtTime(.001, now + .09);
  o.connect(g).connect(audio.sfxBus); o.start(now); o.stop(now + .1);
  playNoiseBurst(.07, .013, 'lowpass', 780, 0);
}

function playBoostIgnition() {
  if (!audio || !gameAudioShouldBeAudible()) return;
  playNoiseBurst(.16, .035, 'bandpass', 1100, 0);
  const now = audio.ctx.currentTime;
  const o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(145, now);
  o.frequency.exponentialRampToValueAtTime(285, now + .13);
  g.gain.setValueAtTime(.026, now);
  g.gain.exponentialRampToValueAtTime(.001, now + .15);
  o.connect(g).connect(audio.sfxBus); o.start(now); o.stop(now + .16);
}

function updateDrivingAudio(dt, boost = state.boosting) {
  if (!audio) return;
  const ctx = audio.ctx;
  const now = ctx.currentTime;
  const speed = Math.max(0, state.speed);
  const gearStops = [0, 62, 108, 155, 205, 260, 325, 380];
  let gear = 1;
  while (gear < 6 && speed >= gearStops[gear]) gear++;
  if (gear !== audio.currentGear && speed > 24) {
    if (gear > audio.currentGear) playGearShift(true);
    else if (audio.currentGear - gear >= 2) playGearShift(false);
    audio.shiftDip = .105;
    audio.currentGear = gear;
  }
  audio.shiftDip = Math.max(0, audio.shiftDip - dt);
  const lower = gearStops[Math.max(0, gear - 1)];
  const upper = gearStops[Math.min(gearStops.length - 1, gear)];
  const rpm = THREE.MathUtils.clamp((speed - lower) / Math.max(30, upper - lower), 0, 1);
  const shiftFactor = audio.shiftDip > 0 ? THREE.MathUtils.lerp(.72, 1, 1 - audio.shiftDip / .105) : 1;
  const baseFreq = (54 + gear * 3.8 + rpm * 92) * shiftFactor;
  audio.engine.frequency.setTargetAtTime(baseFreq, now, .025);
  audio.engine2.frequency.setTargetAtTime(baseFreq * .505, now, .03);
  audio.engine3.frequency.setTargetAtTime(baseFreq * 1.92, now, .025);

  const cockpit = cameraMode === 'cockpit';
  const speedRatio = THREE.MathUtils.clamp(speed / 330, 0, 1.15);
  audio.gain.gain.setTargetAtTime((.016 + speedRatio * .022 + (boost ? .007 : 0)) * (cockpit ? 1.18 : 1), now, .04);
  audio.gain2.gain.setTargetAtTime((.005 + rpm * .008) * (cockpit ? 1.12 : 1), now, .04);
  audio.gain3.gain.setTargetAtTime((.0018 + rpm * .004 + (boost ? .002 : 0)) * (cockpit ? 1.1 : 1), now, .04);
  audio.engineFilter.frequency.setTargetAtTime(cockpit ? 2450 : 4300, now, .08);

  const windAmount = Math.pow(THREE.MathUtils.clamp((speed - 55) / 285, 0, 1), 1.45);
  audio.windGain.gain.setTargetAtTime(windAmount * (cockpit ? .022 : .040) + (boost ? .008 : 0), now, .07);
  audio.windFilter.frequency.setTargetAtTime(680 + speed * 5.2, now, .09);

  if (boost && !audio.wasBoosting) playBoostIgnition();
  audio.wasBoosting = !!boost;
  audio.boostGain.gain.setTargetAtTime(boost ? (cockpit ? .042 : .048) : 0, now, boost ? .045 : .10);
  audio.boostFilter.frequency.setTargetAtTime(880 + speed * 1.25, now, .06);

  let skidAmount = 0;
  if (state.fatalCrash?.active) skidAmount = THREE.MathUtils.clamp(.025 + Math.abs(state.fatalCrash.vx || 0) * .0035, .025, .07);
  else if (speed > 155) {
    skidAmount += Math.max(0, Math.abs(state.steer) - .68) * .035;
    if (input.down) skidAmount += THREE.MathUtils.clamp((speed - 155) / 180, 0, 1) * .025;
  }
  audio.skidGain.gain.setTargetAtTime(skidAmount, now, .035);
  audio.skidFilter.frequency.setTargetAtTime(1100 + speed * 1.2, now, .08);

  const inTunnel = playerInsideTunnel();
  audio.tunnelWet.gain.setTargetAtTime(inTunnel ? .16 : 0, now, .08);
  audio.tunnelFeedback.gain.setTargetAtTime(inTunnel ? .21 : .12, now, .08);
}

function showMessage(text, duration = 650) {
  message.textContent = text;
  message.classList.add('show');
  clearTimeout(showMessage.t);
  showMessage.t = setTimeout(() => message.classList.remove('show'), duration);
}

function readBest() {
  try { return Number(localStorage.getItem('g55HighwayBest') || 0); }
  catch { return 0; }
}
function writeBest(value) {
  try { localStorage.setItem('g55HighwayBest', String(Math.floor(value))); }
  catch { /* storage can be unavailable in private embeds */ }
}

function eventMultiplier() {
  if (!state.event) return 1;
  if (state.event.type === 'speedzone' && state.speed >= 220) return 1.5;
  if (state.event.type === 'rush') return 1.12;
  if (state.event.type === 'convoy') return 1.18;
  if (state.event.type === 'fog') return 1.22;
  return 1;
}

function awardRisk(label, basePoints = 500, nitroGain = .10, comboGain = .22) {
  state.combo = Math.min(5, state.combo + comboGain);
  state.comboHold = 4.8;
  state.nitro = Math.min(1, state.nitro + nitroGain * currentCarDef().nitroMul);
  state.score += basePoints * state.combo * eventMultiplier();
  showMessage(`${label}  x${state.combo.toFixed(2)}`);
  beep(560 + state.combo * 72, .085, .04, 'triangle');
}

function clearTraffic() {
  for (const t of traffic) disposeTrafficVehicle(t.mesh);
  traffic.length = 0;
}

function resetGame() {
  if (!window.G55Boot.isReady) return;
  clearHeldInput();
  clearFeedback();
  rotatePrompt.classList.remove('visible');
  if (state.mode === 'playing' || state.mode === 'paused' || state.mode === 'gameover') commitRunProgress();
  selectedCarIndex = 0;
  saveProgressionProfile();
  replacePlayerVehicle(0);
  state.mode = 'playing';
  state.speed = 96; state.targetSpeed = 96; state.nitro = .72; state.score = 0; state.combo = 1; state.comboHold = 0;
  state.distance = 0; state.time = 0; state.health = maxCarHealth(); state.laneX = 0; state.steer = 0; state.shake = 0;
  state.overtakes = 0; state.nearMisses = 0; state.lastNearAt = -10;
  state.draftTime = 0; state.drafting = false; state.draftAnnounced = false;
  state.nextEventTime = 17; state.event = null; state.previousEvent = ''; state.densityTimer = 0;
  state.crashSlow = 0; state.endDelay = 0; state.milestones = new Set(); state.zoneIndex = 0; state.announcedZone = -1; state.ended = false; state.visualPrevSpeed = 0; state.boosting = false; state.boostVisual = 0; state.fatalCrash = null;
  if (audio) { audio.currentGear = 2; audio.shiftDip = 0; audio.wasBoosting = false; }
  resetFatalCrashEffects();
  state.wreckDodges = 0; state.pileupEscapes = 0; state.cleanKm = 0; state.nextCleanDistance = 1000; state.highSpeedTime = 0;
  state.progressBaseMeters = progressionProfile.totalDistance; state.lastProgressSave = 0;
  player.position.x = roadCenterAtZ(PLAYER_Z); player.position.y = roadHeightAtZ(PLAYER_Z); player.rotation.set(0, 0, 0);
  resetRouteScenery();
  clearTraffic();
  for (let i = 0; i < 10; i++) spawnTraffic(-70 - i * 32 - Math.random() * 20);
  
  menu.classList.remove('visible'); gameOver.classList.remove('visible'); pauseMenu.classList.remove('visible'); garage.classList.remove('visible');
  hud.classList.remove('hidden'); touchControls.classList.remove('hidden');
  eventValue.textContent = '';
  ensureAudio();
  if (audio?.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
  updateHUD();
  updateOrientation();
  window.G55UI.syncDialogs();
  syncAudioState(true);
}

function calculateRunUpgradePoints(score, distanceMeters) {
  if (distanceMeters < 750 && score < 1200) return 0;
  const points = 1 + Math.floor(score / 12000) + Math.floor(distanceMeters / 8000);
  return Math.min(4, points);
}

function endGame() {
  if (state.ended) return;
  clearFeedback();
  rotatePrompt.classList.remove('visible');
  state.ended = true; state.mode = 'gameover';
  syncAudioState(true);
  if (state.fatalCrash) state.fatalCrash.active = false;
  state.boosting = false;
  state.shake = 0;
  state.crashSlow = 0;
  clearHeldInput();
  hud.classList.add('hidden'); touchControls.classList.add('hidden');
  const score = Math.floor(state.score);
  const oldBest = Math.max(readBest(), Number(progressionProfile.bestScore || 0));
  commitRunProgress();
  const earnedUpgradePoints = calculateRunUpgradePoints(score, state.distance);
  progressionProfile.upgradePoints += earnedUpgradePoints;
  const newBest = Math.max(oldBest, score);
  const isNewBest = score > oldBest;
  progressionProfile.bestScore = newBest;
  saveProgressionProfile();
  updateGarageUI(false);
  if (isNewBest) writeBest(newBest);
  finalScore.textContent = score.toLocaleString();
  const upgradeText = earnedUpgradePoints > 0 ? ` · +${earnedUpgradePoints} upgrade point${earnedUpgradePoints === 1 ? '' : 's'}` : '';
  finalStats.textContent = `${(state.distance / 1000).toFixed(1)} km · ${state.wreckDodges} wreck dodges · ${state.nearMisses} near misses${upgradeText}`;
  if (gameOverGarageBtn) gameOverGarageBtn.textContent = earnedUpgradePoints > 0 ? `SPEND ${earnedUpgradePoints} PT${earnedUpgradePoints === 1 ? '' : 'S'}` : 'GARAGE';
  if (finalBadge) {
    finalBadge.textContent = isNewBest ? 'NEW PERSONAL BEST' : earnedUpgradePoints > 0 ? `+${earnedUpgradePoints} UPGRADE POINT${earnedUpgradePoints === 1 ? '' : 'S'}` : 'RUN COMPLETE';
    finalBadge.classList.toggle('new-best', isNewBest);
  }
  bestScore.textContent = newBest.toLocaleString();
  gameOver.classList.add('visible');
  fitScoreText(finalScore, true);
  window.G55UI.syncDialogs();
}

function pauseGame() {
  if (state.mode !== 'playing' || state.ended) return;
  state.mode = 'paused';
  state.boosting = false;
  clearHeldInput();
  clearFeedback();
  touchControls.classList.add('hidden');
  pauseMenu.classList.add('visible');
  syncAudioState(true);
  window.G55UI.syncDialogs();
}

function resumeGame() {
  if (state.mode !== 'paused') return;
  if (needsLandscape()) { updateOrientation(); return; }
  clearHeldInput();
  rotatePrompt.classList.remove('visible');
  state.mode = 'playing';
  pauseMenu.classList.remove('visible');
  if (!state.fatalCrash?.active) touchControls.classList.remove('hidden');
  if (audio?.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
  syncAudioState(true);
  clock.getDelta();
  window.G55UI.syncDialogs();
}

function updateOrientation() {
  const activeRun = state.mode === 'playing' || state.mode === 'paused';
  const rotate = needsLandscape() && activeRun && !garage.classList.contains('visible');
  if (rotate) pauseGame();
  rotatePrompt.classList.toggle('visible', rotate);
  window.G55UI.syncDialogs();
}

function resetMenuPreviewState() {
  // Returning from Game Over must discard every part of the cinematic wreck.
  // The menu is a fresh preview state, not a continuation of the final crash.
  state.fatalCrash = null;
  state.crashSlow = 0;
  state.endDelay = 0;
  state.shake = 0;
  state.ended = false;
  state.speed = 0;
  state.targetSpeed = 0;
  state.steer = 0;
  state.laneX = 0;
  state.boosting = false;
  state.boostVisual = 0;
  state.event = null;
  resetFatalCrashEffects();

  const roadX = roadCenterAtZ(PLAYER_Z);
  const roadY = roadHeightAtZ(PLAYER_Z);
  player.position.set(roadX, roadY, PLAYER_Z);
  player.rotation.set(0, roadYawAtZ(PLAYER_Z), 0);
  player.scale.set(1, 1, 1);

  // Restore GLB presentation pieces that the wreck sequence can leave behind.
  if (player.userData.exhaustFlames) {
    for (const flame of player.userData.exhaustFlames) flame.visible = false;
  }
  if (player.userData.glbWheels) {
    for (const wheel of player.userData.glbWheels) {
      wheel.spin = 0;
      wheel.node.quaternion.copy(wheel.baseQuaternion);
    }
  }
  if (player.userData.indicatorLeft) player.userData.indicatorLeft.emissiveIntensity = 0;
  if (player.userData.indicatorRight) player.userData.indicatorRight.emissiveIntensity = 0;
  if (player.userData.tailMat) player.userData.tailMat.emissiveIntensity = .18 + environment.lighting.nightFactor * 1.25;
  if (player.userData.glbBrakeLightMaterials) {
    const idleBrakeStrength = .24 + environment.lighting.nightFactor * .95;
    for (const entry of player.userData.glbBrakeLightMaterials) {
      if (entry.emissive) entry.material.emissiveIntensity = idleBrakeStrength;
      else if (entry.baseColor && entry.material.color) entry.material.color.copy(entry.baseColor);
    }
  }

  // Do not carry crashed/settled traffic into the menu preview.
  clearTraffic();
  for (let i = 0; i < 10; i++) spawnTraffic(-65 - i * 32 - Math.random() * 18);
}

function goToMainMenu() {
  clearFeedback();
  rotatePrompt.classList.remove('visible');
  if (state.mode === 'playing' || state.mode === 'paused' || state.mode === 'gameover') commitRunProgress();
  updateGarageUI(false);
  gameOver.classList.remove('visible');
  pauseMenu.classList.remove('visible');
  garage.classList.remove('visible');
  menu.classList.add('visible');
  hud.classList.add('hidden');
  touchControls.classList.add('hidden');
  state.mode = 'menu';
  resetMenuPreviewState();
  setCameraMode('chase', false);
  clearHeldInput();
  syncAudioState(true);
  window.G55UI.syncDialogs();
}

function bindKey(code, on) {
  if (!keyActions[code]) return;
  if (on) heldKeyboard.add(code); else heldKeyboard.delete(code);
  syncHeldInput();
}
addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,[contenteditable="true"]')) return;
  if (['KeyM','Escape','KeyC'].includes(e.code) && e.repeat) return;
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (e.code === 'Escape') {
    e.preventDefault();
    if (garage.classList.contains('visible')) { closeGarage(); return; }
    if (state.mode === 'playing') pauseGame();
    else if (state.mode === 'paused') resumeGame();
    return;
  }
  if (e.code === 'KeyC' && !state.fatalCrash?.active && !garage.classList.contains('visible') && !rotatePrompt.classList.contains('visible') && (state.mode === 'playing' || state.mode === 'paused')) {
    toggleCameraMode(); return;
  }
  const enterOutsideControl = e.code === 'Enter' && !e.target.closest('button,a,input');
  if (!e.repeat && (enterOutsideControl || e.code === 'KeyR') && state.mode === 'gameover' && !garage.classList.contains('visible')) { e.preventDefault(); resetGame(); return; }
  if (state.mode === 'playing' && !state.fatalCrash?.active && keyActions[e.code]) {
    e.preventDefault(); bindKey(e.code, true);
  }
});
addEventListener('keyup', e => bindKey(e.code, false));
function suspendActiveRun() {
  clearHeldInput();
  if (state.mode === 'playing') pauseGame();
}
addEventListener('blur', suspendActiveRun);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspendActiveRun(); });
addEventListener('orientationchange', () => { suspendActiveRun(); updateOrientation(); });

function touchButton(id, key) {
  const element = document.getElementById(id);
  element.addEventListener('pointerdown', e => {
    if (state.mode !== 'playing' || state.fatalCrash?.active) return;
    e.preventDefault();
    heldPointers.set(e.pointerId, { key, element });
    element.classList.add('held');
    try { element.setPointerCapture(e.pointerId); } catch {}
    syncHeldInput();
  });
  const release = e => {
    if (heldPointers.get(e.pointerId)?.element !== element) return;
    heldPointers.delete(e.pointerId);
    if (![...heldPointers.values()].some(p => p.element === element)) element.classList.remove('held');
    syncHeldInput();
  };
  ['pointerup','pointercancel','lostpointercapture'].forEach(type => element.addEventListener(type, release));
}
touchButton('touchLeft','left'); touchButton('touchRight','right');
touchButton('touchBrake','down'); touchButton('touchAccelerate','up'); touchButton('touchNitro','nitro');

function setGarageTab(tab) {
  const paint = tab === 'paint';
  document.querySelector('.paint-customizer').hidden = !paint;
  document.querySelector('.upgrade-list').hidden = paint;
  document.getElementById('paintToggle').textContent = paint ? 'UPGRADES' : 'PAINT';
  document.querySelectorAll('[data-garage-tab]').forEach(button => {
    const selected = button.dataset.garageTab === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
}
document.querySelectorAll('[data-garage-tab]').forEach(button => button.addEventListener('click', () => setGarageTab(button.dataset.garageTab)));
document.querySelector('.garage-tabs').addEventListener('keydown', e => {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
  e.preventDefault();
  const tabs = [...document.querySelectorAll('[data-garage-tab]')];
  const current = tabs.indexOf(document.activeElement);
  const index = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (current + (e.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
  setGarageTab(tabs[index].dataset.garageTab);
  tabs[index].focus();
});
document.getElementById('paintToggle').addEventListener('click', () => setGarageTab(document.querySelector('.paint-customizer').hidden ? 'paint' : 'upgrades'));
document.getElementById('rotateMenuBtn').addEventListener('click', goToMainMenu);


const touchPauseBtn = document.getElementById('touchPause');
const touchCameraBtn = document.getElementById('touchCamera');
if (touchPauseBtn) {
  touchPauseBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    if (state.mode === 'playing') pauseGame();
  });
}
if (touchCameraBtn) {
  touchCameraBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    if (state.mode === 'playing' && !state.fatalCrash?.active && !garage.classList.contains('visible')) toggleCameraMode();
  });
}

window.G55UI.onSoundToggle = toggleMute;
updateMuteButton();

startBtn.addEventListener('click', resetGame);
restartBtn.addEventListener('click', resetGame);
menuBtn.addEventListener('click', goToMainMenu);
resumeBtn.addEventListener('click', resumeGame);
pauseMenuBtn.addEventListener('click', goToMainMenu);
garageBtn.addEventListener('click', () => openGarage('menu'));
pauseGarageBtn.addEventListener('click', () => openGarage('paused'));
gameOverGarageBtn.addEventListener('click', () => openGarage('gameover'));
garageBackBtn.addEventListener('click', closeGarage);
garageActionBtn.addEventListener('click', garagePrimaryAction);
for (const btn of upgradeButtons) btn.addEventListener('click', () => purchaseUpgrade(btn.dataset.upgrade));
for (const btn of paintButtons) btn.addEventListener('click', () => applyPaintColor(btn.dataset.paint));
if (customPaintPicker) {
  customPaintPicker.addEventListener('input', () => applyPaintColor(customPaintPicker.value, false));
  customPaintPicker.addEventListener('change', () => applyPaintColor(customPaintPicker.value, true));
}

function updatePlayer(dt) {
  const car = currentCarDef();
  const boost = input.nitro && !input.down && state.nitro > .015 && state.speed > 120;
  state.boosting = boost;
  const cruiseMax = 292 * car.speedMul;
  const boostMax = 350 * car.speedMul;
  const maxSpeed = boost ? boostMax : cruiseMax;
  if (input.down) state.targetSpeed = 68;
  else if (input.up) state.targetSpeed = maxSpeed;
  else state.targetSpeed = 178 * Math.min(1.06, car.speedMul);
  if (boost) {
    state.nitro = Math.max(0, state.nitro - (.245 / car.nitroMul) * dt);
    state.targetSpeed = boostMax;
  }
  const accel = (state.targetSpeed > state.speed ? (boost ? 82 : 47) : 74) * car.accelMul;
  state.speed += THREE.MathUtils.clamp(state.targetSpeed - state.speed, -accel * dt, accel * dt);

  const steerInput = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  state.steer = THREE.MathUtils.lerp(state.steer, steerInput, 1 - Math.pow(.001, dt));
  const steerRate = (5.25 + state.speed / 88) * car.handlingMul;
  state.laneX += state.steer * steerRate * dt;
  state.laneX = THREE.MathUtils.clamp(state.laneX, -7.15, 7.15);

  const roadX = roadCenterAtZ(PLAYER_Z);
  const roadY = roadHeightAtZ(PLAYER_Z);
  const targetX = roadX + state.laneX;
  const speedDelta = state.speed - state.visualPrevSpeed;
  state.visualPrevSpeed = state.speed;
  const suspensionBob = Math.sin(state.time * (5.2 + state.speed * .018)) * .012 * Math.min(1, state.speed / 120);
  player.position.x = THREE.MathUtils.lerp(player.position.x, targetX, .16);
  player.position.y = THREE.MathUtils.lerp(player.position.y, roadY + suspensionBob, .14);
  player.rotation.z = THREE.MathUtils.lerp(player.rotation.z, -state.steer * .11, .12);
  player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, roadYawAtZ(PLAYER_Z) + state.steer * .035, .12);
  const pitchFromAcceleration = THREE.MathUtils.clamp(speedDelta * .012, -.07, .055);
  player.rotation.x = THREE.MathUtils.lerp(player.rotation.x, roadPitchAtZ(PLAYER_Z) + pitchFromAcceleration, .10);
  if (player.userData.wheels) for (const w of player.userData.wheels) w.rotation.x -= (state.speed / 3.6) * dt / (w.userData.radius || .42);
  if (player.userData.glbWheels) {
    const travelSpeed = state.speed / 3.6;
    for (const wheel of player.userData.glbWheels) {
      wheel.spin -= travelSpeed * dt / (wheel.radius || .44);
      const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), wheel.spin);
      if (wheel.isFront) {
        const steerAngle = -state.steer * 0.46; // ~26 degrees maximum visual steering; inverted to match vehicle turn direction.
        const steerQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), steerAngle);
        wheel.node.quaternion.copy(wheel.baseQuaternion).multiply(steerQ).multiply(spinQ);
      } else {
        wheel.node.quaternion.copy(wheel.baseQuaternion).multiply(spinQ);
      }
    }
  }
  if (player.userData.exhaustFlames) {
    const flameStrength = boost ? THREE.MathUtils.clamp((state.speed - 110) / 200, .55, 1) : 0;
    const flicker = .88 + Math.sin(state.time * 39) * .08 + Math.sin(state.time * 67) * .04;
    for (let i = 0; i < player.userData.exhaustFlames.length; i++) {
      const flame = player.userData.exhaustFlames[i];
      flame.visible = boost;
      if (!boost) continue;
      const sidePulse = 1 + Math.sin(state.time * (51 + i * 7)) * .08;
      flame.scale.set(
        (.88 + flameStrength * .22) * sidePulse,
        (.88 + flameStrength * .18) * sidePulse,
        (.74 + flameStrength * .62) * flicker
      );
    }
  }
  const playerHeadlightFactor = Math.max(environment.lighting.nightFactor, environment.lighting.fogBankFactor * .82);
  if (player.userData.glbHeadlights?.length) {
    // Two physical GLB-mounted beams only. The centered fallback is fully disabled.
    if (playerHeadlight.parent) playerHeadlight.parent.remove(playerHeadlight);
    if (headlightTarget.parent) headlightTarget.parent.remove(headlightTarget);
    playerHeadlight.intensity = 0;
    playerHeadlight.visible = false;
    const perLampIntensity = THREE.MathUtils.lerp(0, 185, playerHeadlightFactor);
    for (const entry of player.userData.glbHeadlights) entry.light.intensity = perLampIntensity;
  } else {
    playerHeadlight.visible = true;
    if (playerHeadlight.parent !== player) {
      player.add(headlightTarget);
      playerHeadlight.target = headlightTarget;
      player.add(playerHeadlight);
    }
    playerHeadlight.intensity = THREE.MathUtils.lerp(0, 52, playerHeadlightFactor);
  }
  if (player.userData.headMat) player.userData.headMat.emissiveIntensity = .08 + playerHeadlightFactor * 3.1;
  if (player.userData.tailMat) player.userData.tailMat.emissiveIntensity = .18 + environment.lighting.nightFactor * 1.25 + (input.down ? 2.4 : 0);
  if (player.userData.glbBrakeLightMaterials) {
    const brakeStrength = input.down ? 4.2 : (.24 + environment.lighting.nightFactor * .95);
    for (const entry of player.userData.glbBrakeLightMaterials) {
      if (entry.emissive) {
        entry.material.emissiveIntensity = brakeStrength;
      } else if (entry.baseColor && entry.material.color) {
        entry.material.color.copy(entry.baseColor).lerp(new THREE.Color(0xff1738), input.down ? .78 : (.10 + environment.lighting.nightFactor * .16));
      }
    }
  }
  const playerBlink = Math.abs(state.steer) > .62 && (Math.floor(state.time * 3.6) % 2 === 0);
  if (player.userData.indicatorLeft) player.userData.indicatorLeft.emissiveIntensity = playerBlink && state.steer < 0 ? 4.0 : 0;
  if (player.userData.indicatorRight) player.userData.indicatorRight.emissiveIntensity = playerBlink && state.steer > 0 ? 4.0 : 0;

  const speedRatio = state.speed / Math.max(350, 350 * car.speedMul);
  const cockpitAnchor = player.userData.cockpitAnchor;
  if (cameraMode === 'cockpit' && cockpitAnchor) {
    if (camera.parent !== cockpitAnchor) cockpitAnchor.add(camera);
    camera.rotation.set(0, 0, 0);
    cockpitAnchor.getWorldScale(cockpitWorldScale);
    camera.position.set(
      gameConfig.cockpitCamera.position.x / Math.max(Math.abs(cockpitWorldScale.x), .0001),
      gameConfig.cockpitCamera.position.y / Math.max(Math.abs(cockpitWorldScale.y), .0001),
      gameConfig.cockpitCamera.position.z / Math.max(Math.abs(cockpitWorldScale.z), .0001)
    );
    camera.scale.set(
      1 / Math.max(Math.abs(cockpitWorldScale.x), .0001),
      1 / Math.max(Math.abs(cockpitWorldScale.y), .0001),
      1 / Math.max(Math.abs(cockpitWorldScale.z), .0001)
    );
    camera.near = .035;
    camera.fov = THREE.MathUtils.lerp(camera.fov, 70 + speedRatio * 3 + (boost ? 9 : 0), boost ? .13 : .09);
  } else {
    if (cameraMode === 'cockpit') setCameraMode('chase', false);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, roadX + state.laneX * .27, .065);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, roadY + 4.25 + speedRatio * .34, .065);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, 10.3 + speedRatio * .95, .065);
    camera.rotation.y = THREE.MathUtils.lerp(camera.rotation.y, roadYawAtZ(PLAYER_Z) * .55, .05);
    camera.rotation.x = THREE.MathUtils.lerp(camera.rotation.x, -.12 + roadPitchAtZ(PLAYER_Z) * .35, .05);
    camera.fov = THREE.MathUtils.lerp(camera.fov, 61 + speedRatio * 9 + (boost ? 12 : 0), boost ? .115 : .08);
  }
  camera.updateProjectionMatrix();

  for (const threshold of [200, 250, 300]) {
    if (state.speed >= threshold && !state.milestones.has(threshold)) {
      state.milestones.add(threshold);
      showMessage(`${threshold} KM/H`, 540);
      state.score += threshold * state.combo;
    }
  }

  if (audio) updateDrivingAudio(dt, boost);
}

function flashCrash() {
  crashFlash.classList.remove('show');
  void crashFlash.offsetWidth;
  crashFlash.classList.add('show');
}

function trafficMass(t) {
  if (t.kind === 'truck') return 3.4;
  if (t.kind === 'van') return 2.0;
  if (t.kind === 'suv') return 1.75;
  return t.kind === 'sport' ? 1.05 : 1.35;
}

function startTrafficPhysics(t, lateralKick = 0, forwardKick = 0, yawKick = 0) {
  if (!t.physicsActive) {
    t.physicsActive = true;
    t.physVx = 0;
    t.physForward = Math.max(0, t.baseSpeed / 3.6);
    t.physYawVel = 0;
    t.physicsAge = 0;
  }
  t.physicsSettled = false;
  t.physVx += lateralKick;
  t.physForward = THREE.MathUtils.clamp(t.physForward + forwardKick, 0, 88);
  t.physYawVel += yawKick;
  t.collisionCooldown = Math.max(t.collisionCooldown || 0, .11);
  t.laneChangeTimer = 999;
}

function playerTrafficImpactMultiplier(t, incomingKmh, boosting) {
  // Arcade impact: normal hits are ~40% stronger, high-speed hits are stronger
  // again, and nitro impacts are the most dramatic. Heavy traffic resists the
  // shove so trucks still feel substantially heavier than cars.
  let power = boosting ? 2.0 : (incomingKmh >= 220 ? 1.6 : 1.4);
  if (t.kind === 'truck') power *= .45;
  else if (t.kind === 'van') power *= .78;
  else if (t.kind === 'suv') power *= .82;
  else if (t.kind === 'sport') power *= 1.0;
  else power *= .95;
  return power;
}

function collideTraffic(t) {
  const incomingKmh = state.speed;
  const wasBoosting = state.boosting;
  const impactMul = playerTrafficImpactMultiplier(t, incomingKmh, wasBoosting);
  const incomingMs = incomingKmh / 3.6;

  state.speed *= armorCrashSpeedRetention();
  state.targetSpeed = 78;
  state.combo = 1;
  state.comboHold = 0;
  state.nitro *= armorCrashNitroRetention();
  state.health--;
  state.shake = .72;
  state.crashSlow = armorCrashSlowTime();
  state.cleanKm = 0;
  state.nextCleanDistance = state.distance + 1000;
  state.highSpeedTime = 0;
  const side = t.mesh.position.x >= player.position.x ? 1 : -1;
  startTrafficPhysics(
    t,
    side * (3.8 + incomingMs * .035) * impactMul,
    incomingMs * .34 * impactMul,
    side * (1.15 + Math.random() * .45) * Math.min(1.65, impactMul)
  );
  flashCrash();
  if (state.health <= 0) {
    startFatalCrash(t, incomingKmh, wasBoosting, side);
  } else {
    showMessage(wasBoosting ? 'BOOST IMPACT!' : 'CRASH!', 720);
    playCrashImpact(wasBoosting ? 1.15 : .92, t.kind === 'truck', wasBoosting);
  }
}

function startFatalCrash(t, incomingKmh, wasBoosting, side) {
  if (state.fatalCrash?.active) return;
  const incomingMs = Math.max(22, incomingKmh / 3.6);
  if (camera.parent !== scene) scene.attach(camera);
  cameraMode = 'chase';
  camera.scale.set(1, 1, 1);
  camera.near = .1;
  camera.fov = 68;
  camera.updateProjectionMatrix();

  state.crashSlow = 0;
  state.endDelay = 0;
  state.boosting = false;
  state.targetSpeed = 0;
  state.shake = 1.05;
  clearHeldInput();
  touchControls.classList.add('hidden');

  const kickScale = wasBoosting ? 1.28 : 1;
  state.fatalCrash = {
    active: true, elapsed: 0, hitStop: .105, duration: 2.65,
    speedKmh: Math.max(112, incomingKmh * .88),
    vx: -side * (4.1 + incomingMs * .065) * kickScale,
    yawVel: -side * (2.15 + Math.random() * 1.2) * kickScale,
    rollVel: side * (.72 + Math.random() * .55) * kickScale,
    pitchVel: (Math.random() - .35) * 1.15,
    yOffset: 0, yVel: (1.25 + Math.min(1.5, incomingMs * .018)) * kickScale,
    side, wasBoosting, secondaryHits: 0
  };

  burstFatalSparks(player.position.x + side * .72, player.position.y, PLAYER_Z - .2, side, wasBoosting ? 1.28 : 1);
  spawnFatalDebris(side, wasBoosting);
  showMessage(wasBoosting ? 'NITRO WRECK!' : 'TOTAL WRECK!', 1450);
  playCrashImpact(wasBoosting ? 1.65 : 1.42, t.kind === 'truck', wasBoosting);
  beep(54, .42, .055, 'sine');
}

function fatalWreckTrafficImpact(t) {
  const f = state.fatalCrash;
  if (!f?.active) return;
  const signed = t.mesh.position.x >= player.position.x ? 1 : -1;
  const massResistance = Math.max(.32, 1 / trafficMass(t));
  const incomingMs = Math.max(14, f.speedKmh / 3.6);
  startTrafficPhysics(
    t,
    signed * (3.0 + incomingMs * .06) * massResistance * 2.0,
    incomingMs * .30 * massResistance * 1.7,
    signed * 1.4 * massResistance
  );
  f.vx -= signed * (1.0 + massResistance * 1.8);
  f.yawVel -= signed * (.28 + massResistance * .58);
  f.rollVel += signed * .22;
  f.speedKmh *= .84;
  f.yVel = Math.max(f.yVel, .75);
  f.secondaryHits++;
  burstFatalSparks((player.position.x + t.mesh.position.x) * .5, player.position.y, PLAYER_Z, signed, .72);
  state.shake = Math.max(state.shake, .64);
  playCrashImpact(.62, t.kind === 'truck', false);
}

function updateFatalCrash(realDt) {
  const f = state.fatalCrash;
  if (!f?.active) return;
  f.elapsed += realDt;

  // Short impact freeze before the slow-motion wreck unfolds.
  if (f.elapsed <= f.hitStop) {
    updateFatalCrashCamera(realDt);
    return;
  }

  const slowScale = f.elapsed < 1.85 ? .28 : THREE.MathUtils.lerp(.28, .52, THREE.MathUtils.clamp((f.elapsed - 1.85) / .7, 0, 1));
  const dt = realDt * slowScale;
  state.time += dt;

  f.speedKmh *= Math.exp(-.62 * dt);
  f.speedKmh = Math.max(22, f.speedKmh - 8.5 * dt);
  state.speed = f.speedKmh;
  if (audio) updateDrivingAudio(dt, false);
  const worldSpeed = state.speed / 3.6;

  updateRoad(dt, worldSpeed);
  updateTraffic(dt, worldSpeed);
  updateEnvironment(dt);

  f.vx *= Math.exp(-1.18 * dt);
  f.yawVel *= Math.exp(-.74 * dt);
  f.rollVel *= Math.exp(-1.35 * dt);
  f.pitchVel *= Math.exp(-1.5 * dt);
  f.yVel -= 9.4 * dt;
  f.yOffset += f.yVel * dt;
  if (f.yOffset < 0) {
    f.yOffset = 0;
    if (Math.abs(f.yVel) > .7) f.yVel = Math.abs(f.yVel) * .22; else f.yVel = 0;
  }

  const roadX = roadCenterAtZ(PLAYER_Z);
  const roadY = roadHeightAtZ(PLAYER_Z);
  player.position.x += f.vx * dt;
  const edge = 7.05;
  if (player.position.x > roadX + edge) { player.position.x = roadX + edge; f.vx = -Math.abs(f.vx) * .32; f.yawVel -= .45; }
  else if (player.position.x < roadX - edge) { player.position.x = roadX - edge; f.vx = Math.abs(f.vx) * .32; f.yawVel += .45; }
  player.position.y = roadY + f.yOffset;
  player.position.z = PLAYER_Z;
  player.rotation.y += f.yawVel * dt;
  player.rotation.z += f.rollVel * dt;
  player.rotation.x += f.pitchVel * dt;
  player.rotation.z = THREE.MathUtils.clamp(player.rotation.z, -.62, .62);
  player.rotation.x = THREE.MathUtils.clamp(player.rotation.x, -.34, .34);

  // Keep wheels visibly moving while the wreck is sliding.
  if (player.userData.wheels) for (const w of player.userData.wheels) w.rotation.x -= worldSpeed * dt / (w.userData.radius || .42);
  if (player.userData.glbWheels) {
    for (const wheel of player.userData.glbWheels) {
      wheel.spin -= worldSpeed * dt / (wheel.radius || .44);
      const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), wheel.spin);
      wheel.node.quaternion.copy(wheel.baseQuaternion).multiply(spinQ);
    }
  }
  if (player.userData.exhaustFlames) {
    const showFlame = f.wasBoosting && f.elapsed < .42;
    for (const flame of player.userData.exhaustFlames) flame.visible = showFlame;
  }
  if (player.userData.tailMat) player.userData.tailMat.emissiveIntensity = 3.1;
  if (player.userData.glbBrakeLightMaterials) {
    for (const entry of player.userData.glbBrakeLightMaterials) if (entry.emissive) entry.material.emissiveIntensity = 4.4;
  }

  updateFatalCrashEffects(dt, worldSpeed);
  updateFatalCrashCamera(realDt);

  if (f.elapsed >= f.duration) {
    f.active = false;
    state.speed = 0;
    state.targetSpeed = 0;
    if (player.userData.exhaustFlames) for (const flame of player.userData.exhaustFlames) flame.visible = false;
    endGame();
  }
}

const fatalCameraTarget = new THREE.Vector3();
const fatalCameraDesired = new THREE.Vector3();
function updateFatalCrashCamera(realDt) {
  const f = state.fatalCrash;
  if (!f) return;
  if (camera.parent !== scene) scene.attach(camera);
  const orbit = Math.min(.64, Math.max(0, f.elapsed - .04) * .22) * -f.side;
  const distance = 9.1 + Math.min(2.2, f.elapsed * .72);
  fatalCameraDesired.set(
    player.position.x + Math.sin(orbit) * distance - f.side * 1.15,
    player.position.y + 3.15 + Math.min(.75, f.elapsed * .24),
    player.position.z + Math.cos(orbit) * distance
  );
  const follow = 1 - Math.exp(-4.6 * realDt);
  camera.position.lerp(fatalCameraDesired, follow);
  fatalCameraTarget.set(player.position.x, player.position.y + .72, player.position.z - 1.0);
  camera.lookAt(fatalCameraTarget);
  camera.fov = THREE.MathUtils.lerp(camera.fov, 69, follow);
  camera.updateProjectionMatrix();
  const shake = Math.max(0, 1 - f.elapsed / 1.15) * .28;
  if (shake > 0) {
    camera.position.x += (Math.random() - .5) * shake;
    camera.position.y += (Math.random() - .5) * shake * .55;
  }
}

// Keep player/traffic contact physically solid while the per-car contact guard is active.
// This prevents a previously-hit wreck from becoming a "ghost" on a second contact.
function resolvePlayerTrafficOverlap(t, collisionWidth, collisionZ) {
  const signedDx = t.mesh.position.x - player.position.x;
  const signedDz = t.mesh.position.z - PLAYER_Z;
  const adx = Math.abs(signedDx);
  const adz = Math.abs(signedDz);
  if (adx >= collisionWidth || adz >= collisionZ) return false;

  const xPen = collisionWidth - adx;
  const zPen = collisionZ - adz;
  const xNorm = xPen / Math.max(collisionWidth, .001);
  const zNorm = zPen / Math.max(collisionZ, .001);

  // Resolve on the shallowest penetration axis. The player is kinematic, so
  // the traffic body is moved out and receives a small matching impulse.
  if (zNorm <= xNorm) {
    const dir = signedDz >= 0 ? 1 : -1;
    const correction = zPen + .16;
    t.mesh.position.z += dir * correction;
    if (!t.physicsActive) startTrafficPhysics(t);
    // A car struck from behind is pushed forward down-road rather than allowed
    // to tunnel through the player on the next frame.
    if (dir < 0) t.physForward = Math.max(t.physForward, Math.min(34, state.speed / 3.6 * .28));
    else t.physForward *= .72;
  } else {
    const dir = signedDx >= 0 ? 1 : -1;
    const correction = xPen + .12;
    t.mesh.position.x += dir * correction;
    if (!t.physicsActive) startTrafficPhysics(t);
    t.physVx += dir * (1.15 + Math.min(2.4, state.speed / 180));
    t.physYawVel += dir * .18;
  }
  return true;
}

function laneIsClear(t, laneIndex) {
  const lane = laneXs[laneIndex];
  const playerLane = state.laneX;
  if (Math.abs(t.mesh.position.z - PLAYER_Z) < 17 && Math.abs(playerLane - lane) < 1.25) return false;
  return !traffic.some(o => o !== t && Math.abs(o.mesh.position.z - t.mesh.position.z) < 15 && Math.abs(o.laneOffset - lane) < .85);
}

function desiredTrafficCount() {
  let count = Math.round(Math.min(17, 10 + Math.floor(state.time / 24)) * routePacing().density);
  if (state.event?.type === 'rush') count += 3;
  if (state.event?.type === 'convoy') count = Math.max(count, 17);
  if (state.event?.type === 'fog') count = Math.min(count, 12);
  return Math.max(7, Math.min(19, count));
}

const TRAFFIC_NEAR_SPAWN = -105;
const TRAFFIC_FAR_SPAWN = -345;
const TRAFFIC_DESPAWN_BEHIND = 46;
const TRAFFIC_DESPAWN_AHEAD = -430;

function trafficSpawnZ(ignore = null) {
  // Keep traffic inside a fixed corridor in front of the player. The previous
  // implementation chained new spawns to the absolute farthest car, allowing
  // the whole traffic field to drift beyond the visible highway over time.
  const activeAhead = traffic
    .filter(o => o !== ignore && o.mesh.position.z < PLAYER_Z - 18 && o.mesh.position.z > TRAFFIC_DESPAWN_AHEAD)
    .map(o => o.mesh.position.z);
  if (!activeAhead.length) return -155 - Math.random() * 105;

  const farthestVisible = Math.min(...activeAhead);
  let z = farthestVisible - 27 - Math.random() * 38;
  if (z < TRAFFIC_FAR_SPAWN) z = -205 - Math.random() * 125;
  return THREE.MathUtils.clamp(z, TRAFFIC_FAR_SPAWN, TRAFFIC_NEAR_SPAWN);
}

function recycleTraffic(t, forceZ = null) {
  t.mesh.position.z = forceZ ?? trafficSpawnZ(t);
  const routeZone = zoneAtDistance(routeDistanceAtZ(t.mesh.position.z));
  if (routeZone !== t.routeZone) {
    const kind = pickTrafficKind(routeDistanceAtZ(t.mesh.position.z));
    if (kind !== t.kind) {
      const mesh = createTrafficVehicle(kind, trafficColors[Math.floor(Math.random() * trafficColors.length)]);
      mesh.position.copy(t.mesh.position);
      disposeTrafficVehicle(t.mesh); t.mesh = mesh; t.kind = kind; world.add(mesh);
      t.halfWidth = kind === 'truck' ? 1.25 : kind === 'van' ? 1.14 : kind === 'suv' ? 1.10 : 1.03;
      t.halfLength = kind === 'truck' ? 3.45 : kind === 'van' ? 2.55 : kind === 'suv' ? 2.35 : 2.15;
    }
    t.routeZone = routeZone;
  }
  let laneIndex = Math.floor(Math.random() * laneXs.length);
  for (let tries = 0; tries < 7; tries++) {
    if (laneIsClear(t, laneIndex)) break;
    laneIndex = Math.floor(Math.random() * laneXs.length);
  }
  t.laneIndex = laneIndex;
  t.targetLane = laneIndex;
  t.laneOffset = laneXs[laneIndex];
  t.mesh.position.x = roadCenterAtZ(t.mesh.position.z) + t.laneOffset;
  t.mesh.position.y = roadHeightAtZ(t.mesh.position.z);
  if (t.kind === 'truck') t.baseSpeed = 68 + Math.random() * 58 + Math.min(12, state.time * .08);
  else if (t.kind === 'sport') t.baseSpeed = 132 + Math.random() * 86 + Math.min(18, state.time * .10);
  else if (t.kind === 'suv') t.baseSpeed = 88 + Math.random() * 72 + Math.min(14, state.time * .09);
  else if (t.kind === 'van') t.baseSpeed = 78 + Math.random() * 62 + Math.min(12, state.time * .08);
  else t.baseSpeed = 82 + Math.random() * 78 + Math.min(16, state.time * .10);
  t.nearChecked = false;
  t.wreckDodgeChecked = false;
  t.passed = false;
  t.laneChangeTimer = 1.8 + Math.random() * 5.4;
  t.physicsActive = false;
  t.physVx = 0;
  t.physForward = t.baseSpeed / 3.6;
  t.physYawVel = 0;
  t.physicsAge = 0;
  t.collisionCooldown = 0;
  t.physicsSettled = false;
  t.playerContact = false;
  t.mesh.rotation.x = roadPitchAtZ(t.mesh.position.z);
  t.mesh.rotation.y = roadYawAtZ(t.mesh.position.z);
  t.mesh.rotation.z = 0;
}

function activeTrafficAheadCount() {
  return traffic.reduce((n, t) => n + (t.mesh.position.z < PLAYER_Z - 12 && t.mesh.position.z > TRAFFIC_DESPAWN_AHEAD ? 1 : 0), 0);
}

function updateTrafficRigidBody(t, dt, worldSpeed) {
  t.physicsAge += dt;
  t.collisionCooldown = Math.max(0, (t.collisionCooldown || 0) - dt);

  // Collision disables the AI drivetrain. Cars keep a brief amount of impact
  // momentum, then rapidly scrub speed and become stationary wrecks on the road.
  const forwardDrag = t.physicsAge < .22 ? .75 : 2.65;
  t.physForward *= Math.exp(-forwardDrag * dt);
  if (t.physicsAge > .28) t.physForward = Math.max(0, t.physForward - 5.5 * dt);
  t.physVx *= Math.exp(-1.85 * dt);
  t.physYawVel *= Math.exp(-1.45 * dt);
  if (t.physForward < .7) t.physForward = 0;
  if (Math.abs(t.physVx) < .055) t.physVx = 0;
  if (Math.abs(t.physYawVel) < .018) t.physYawVel = 0;
  t.physicsSettled = t.physForward === 0 && t.physVx === 0 && t.physYawVel === 0;

  // A settled wreck moves only with the scrolling road; it no longer drives itself.
  t.mesh.position.z += (worldSpeed - t.physForward) * dt;
  t.mesh.position.x += t.physVx * dt;

  const roadX = roadCenterAtZ(t.mesh.position.z);
  const roadEdge = 7.72 - t.halfWidth * .45;
  const localX = t.mesh.position.x - roadX;
  if (localX > roadEdge) {
    t.mesh.position.x = roadX + roadEdge;
    t.physVx = -Math.abs(t.physVx) * .46;
    t.physYawVel -= .58;
    t.physForward *= .88;
  } else if (localX < -roadEdge) {
    t.mesh.position.x = roadX - roadEdge;
    t.physVx = Math.abs(t.physVx) * .46;
    t.physYawVel += .58;
    t.physForward *= .88;
  }

  t.mesh.position.y = roadHeightAtZ(t.mesh.position.z);
  t.mesh.rotation.y += t.physYawVel * dt;
  t.mesh.rotation.z = THREE.MathUtils.damp(t.mesh.rotation.z, THREE.MathUtils.clamp(-t.physVx * .026, -.22, .22), 4.5, dt);
  t.mesh.rotation.x = roadPitchAtZ(t.mesh.position.z) + Math.sin(t.physicsAge * 10) * Math.min(.035, Math.abs(t.physVx) * .003);

  if (t.mesh.userData.wheels) {
    for (const w of t.mesh.userData.wheels) w.rotation.x -= t.physForward * dt / (w.userData.radius || (t.kind === 'truck' ? .46 : .44));
  }
  if (t.mesh.userData.headMat) t.mesh.userData.headMat.emissiveIntensity = .08 + Math.max(environment.lighting.nightFactor, environment.lighting.fogBankFactor * .82) * 2.35;
  if (t.mesh.userData.tailMat) t.mesh.userData.tailMat.emissiveIntensity = .55 + environment.lighting.nightFactor * 1.25 + (t.physicsSettled ? .65 : 2.0) + Math.min(1.4, Math.abs(t.physVx) * .12);
  if (t.mesh.userData.indicatorLeft) t.mesh.userData.indicatorLeft.emissiveIntensity = 0;
  if (t.mesh.userData.indicatorRight) t.mesh.userData.indicatorRight.emissiveIntensity = 0;
}

function resolveTrafficAccidents() {
  for (let i = 0; i < traffic.length; i++) {
    const a = traffic[i];
    for (let j = i + 1; j < traffic.length; j++) {
      const b = traffic[j];
      const dx = b.mesh.position.x - a.mesh.position.x;
      const dz = b.mesh.position.z - a.mesh.position.z;
      const xLimit = (a.halfWidth + b.halfWidth) * .88;
      const zLimit = (a.halfLength + b.halfLength) * .76;
      const adx = Math.abs(dx), adz = Math.abs(dz);
      if (adx >= xLimit || adz >= zLimit) continue;
      if ((a.collisionCooldown || 0) > 0 && (b.collisionCooldown || 0) > 0) continue;

      const wasActive = a.physicsActive || b.physicsActive;
      startTrafficPhysics(a);
      startTrafficPhysics(b);
      a.physicsSettled = false;
      b.physicsSettled = false;

      // Resolve along the axis with the least normalized penetration.
      const px = xLimit - adx;
      const pz = zLimit - adz;
      let nx = 0, nz = 0, penetration;
      if (px / xLimit < pz / zLimit) {
        nx = dx >= 0 ? 1 : -1;
        penetration = px;
      } else {
        nz = dz >= 0 ? 1 : -1;
        penetration = pz;
      }

      const ma = trafficMass(a), mb = trafficMass(b);
      const ia = 1 / ma, ib = 1 / mb;
      const vaX = a.physVx, vaZ = -a.physForward;
      const vbX = b.physVx, vbZ = -b.physForward;
      const relX = vbX - vaX, relZ = vbZ - vaZ;
      const closing = relX * nx + relZ * nz;

      if (closing < 0) {
        const restitution = .24;
        const impulse = -(1 + restitution) * closing / (ia + ib);
        a.physVx -= impulse * ia * nx;
        b.physVx += impulse * ib * nx;
        a.physForward = THREE.MathUtils.clamp(-(vaZ - impulse * ia * nz), 0, 88);
        b.physForward = THREE.MathUtils.clamp(-(vbZ + impulse * ib * nz), 0, 88);
      }

      // Separate intersecting bodies so they cannot keep tunnelling through each other.
      const correction = Math.max(0, penetration - .03) / (ia + ib) * .72;
      a.mesh.position.x -= correction * ia * nx;
      b.mesh.position.x += correction * ib * nx;
      a.mesh.position.z -= correction * ia * nz;
      b.mesh.position.z += correction * ib * nz;

      const sideKick = nz !== 0 ? (Math.random() < .5 ? -1 : 1) * (1.25 + Math.min(3.2, Math.abs(closing) * .08)) : 0;
      a.physVx -= sideKick * ib;
      b.physVx += sideKick * ia;
      const spin = THREE.MathUtils.clamp((dx * .15 + sideKick * .22), -1.8, 1.8);
      a.physYawVel -= spin * ib * 1.7;
      b.physYawVel += spin * ia * 1.7;
      a.collisionCooldown = b.collisionCooldown = .14;

      if (!wasActive && Math.max(a.mesh.position.z, b.mesh.position.z) > -115) {
        showMessage('TRAFFIC ACCIDENT!', 650);
        playCrashImpact(.38, a.kind === 'truck' || b.kind === 'truck', false);
      }
    }
  }
}

function updateTraffic(dt, worldSpeed) {
  let draftingNow = false;

  for (let i = traffic.length - 1; i >= 0; i--) {
    const t = traffic[i];
    const rel = worldSpeed - (t.baseSpeed / 3.6);
    t.collisionCooldown = Math.max(0, (t.collisionCooldown || 0) - dt);

    if (t.physicsActive) {
      updateTrafficRigidBody(t, dt, worldSpeed);
    } else {
      t.mesh.position.z += rel * dt;
      t.wobble += dt * .7;
      t.laneChangeTimer -= dt * (state.event?.type === 'rush' ? 1.4 : 1);

      if (t.laneChangeTimer <= 0 && t.mesh.position.z < -8) {
        const options = [t.laneIndex - 1, t.laneIndex + 1].filter(v => v >= 0 && v < laneXs.length && laneIsClear(t, v));
        if (options.length && Math.random() < (t.kind === 'sport' ? .72 : .46)) {
          t.targetLane = options[Math.floor(Math.random() * options.length)];
        }
        t.laneChangeTimer = 2.2 + Math.random() * (t.kind === 'sport' ? 3.2 : 5.2);
      }

      const targetLaneX = laneXs[t.targetLane];
      t.laneOffset = THREE.MathUtils.damp(t.laneOffset, targetLaneX, t.kind === 'sport' ? 2.25 : 1.55, dt);
      if (Math.abs(t.laneOffset - targetLaneX) < .05) t.laneIndex = t.targetLane;

      const roadX = roadCenterAtZ(t.mesh.position.z);
      t.mesh.position.x = roadX + t.laneOffset + Math.sin(t.wobble) * .012;
      t.mesh.position.y = roadHeightAtZ(t.mesh.position.z);
      const laneTurn = THREE.MathUtils.clamp((targetLaneX - t.laneOffset) * .045, -.10, .10);
      t.mesh.rotation.y = roadYawAtZ(t.mesh.position.z) + laneTurn;
      t.mesh.rotation.x = roadPitchAtZ(t.mesh.position.z);
      t.mesh.rotation.z = THREE.MathUtils.damp(t.mesh.rotation.z, 0, 7, dt);
      const changingLane = Math.abs(targetLaneX - t.laneOffset) > .10;
      if (t.mesh.userData.headMat) t.mesh.userData.headMat.emissiveIntensity = .08 + Math.max(environment.lighting.nightFactor, environment.lighting.fogBankFactor * .82) * 2.35;
      if (t.mesh.userData.tailMat) {
        const braking = rel > 30 || (t.mesh.position.z > -8 && Math.abs(t.mesh.position.x - player.position.x) < 1.5);
        t.mesh.userData.tailMat.emissiveIntensity = .18 + environment.lighting.nightFactor * .95 + (braking ? 2.25 : 0);
      }
      const blink = changingLane && (Math.floor(state.time * 3.4) % 2 === 0);
      if (t.mesh.userData.indicatorLeft) t.mesh.userData.indicatorLeft.emissiveIntensity = blink && t.targetLane < t.laneIndex ? 4.2 : 0;
      if (t.mesh.userData.indicatorRight) t.mesh.userData.indicatorRight.emissiveIntensity = blink && t.targetLane > t.laneIndex ? 4.2 : 0;
      if (t.mesh.userData.wheels) for (const w of t.mesh.userData.wheels) w.rotation.x -= (t.baseSpeed / 3.6) * dt / (w.userData.radius || (t.kind === 'truck' ? .46 : .44));
    }

    updateVehicleShadowRange(t.mesh, t.mesh.position.z);
    let dz = t.mesh.position.z - PLAYER_Z;
    let dx = Math.abs(t.mesh.position.x - player.position.x);
    const collisionWidth = .95 + t.halfWidth;
    const collisionZ = 2.0 + t.halfLength * .66;
    const playerOverlap = Math.abs(dz) < collisionZ && dx < collisionWidth;

    if (playerOverlap) {
      // Each new vehicle contact deals damage immediately; continuous contact
      // with the same vehicle only deals damage once. Separation happens every
      // frame. During the final cinematic wreck, contacts stay solid and
      // can launch secondary pileups without consuming additional lives.
      if (state.fatalCrash?.active) {
        if (!t.playerContact) fatalWreckTrafficImpact(t);
      } else if (!t.playerContact) {
        collideTraffic(t);
      }
      t.playerContact = true;
      resolvePlayerTrafficOverlap(t, collisionWidth, collisionZ);
      dz = t.mesh.position.z - PLAYER_Z;
      dx = Math.abs(t.mesh.position.x - player.position.x);
    } else if (t.playerContact && (Math.abs(dz) > collisionZ + .65 || dx > collisionWidth + .38)) {
      t.playerContact = false;
    }

    if (!state.fatalCrash?.active && !t.nearChecked && dz > .1 && dz < 5.5) {
      t.nearChecked = true;
      t.passed = true;
      state.overtakes++;
      state.score += 95 * state.combo * eventMultiplier();
      const closePass = dx >= collisionWidth && dx < collisionWidth + 1.85;
      if (t.physicsActive && closePass && state.speed > 105) {
        t.wreckDodgeChecked = true;
        state.wreckDodges++;
        const pileupCars = traffic.reduce((n, o) => n + (o.physicsActive && Math.abs(o.mesh.position.z - t.mesh.position.z) < 18 ? 1 : 0), 0);
        playPassWhoosh(t.mesh.position.x - player.position.x, t.kind, 1.18);
        if (pileupCars >= 3) {
          state.pileupEscapes++;
          awardRisk('PILEUP ESCAPE', 1650, .30, .36);
        } else {
          awardRisk('WRECK DODGE', 920, .18, .25);
        }
      } else if (dx >= collisionWidth && dx < collisionWidth + 1.38 && state.speed > 138) {
        state.nearMisses++;
        const threaded = state.time - state.lastNearAt < .24;
        state.lastNearAt = state.time;
        playPassWhoosh(t.mesh.position.x - player.position.x, t.kind, threaded ? 1.18 : 1);
        if (threaded) awardRisk('THREAD THE NEEDLE', 1250, .22, .38);
        else awardRisk(t.kind === 'truck' ? 'TRUCK NEAR MISS' : 'NEAR MISS', t.kind === 'truck' ? 820 : 640, t.kind === 'truck' ? .16 : .125, t.kind === 'truck' ? .30 : .24);
      }
    }

    if (!state.fatalCrash?.active && dz < -5 && dz > -21 && dx < Math.max(1.15, t.halfWidth * .95) && state.speed > 135 && state.speed > t.baseSpeed - 12) {
      draftingNow = true;
    }

    if (dz > TRAFFIC_DESPAWN_BEHIND || t.mesh.position.z < TRAFFIC_DESPAWN_AHEAD) {
      const desired = desiredTrafficCount();
      if (traffic.length > desired + 2) {
        disposeTrafficVehicle(t.mesh);
        traffic.splice(i, 1);
        continue;
      }
      recycleTraffic(t);
    }
  }

  resolveTrafficAccidents();

  // Replenish based on cars that are actually in the playable road corridor,
  // not merely the number of traffic objects that happen to exist in memory.
  // This guarantees recurring highway traffic during long runs and at low speed.
  state.densityTimer -= dt;
  if (state.densityTimer <= 0) {
    state.densityTimer = .45 + Math.random() * .30;
    const desired = desiredTrafficCount();
    let activeAhead = activeTrafficAheadCount();
    let safety = 0;
    while (activeAhead < desired && traffic.length < desired + 4 && safety++ < 3) {
      spawnTraffic(trafficSpawnZ());
      activeAhead++;
    }
  }

  if (draftingNow) {
    state.draftTime += dt;
    state.nitro = Math.min(1, state.nitro + .032 * currentCarDef().nitroMul * dt);
    state.score += 35 * dt * state.combo;
    if (state.draftTime > .9 && !state.draftAnnounced) {
      state.draftAnnounced = true;
      awardRisk('SLIPSTREAM', 280, .06, .10);
    }
  } else {
    state.draftTime = Math.max(0, state.draftTime - dt * 2.2);
    if (state.draftTime < .15) state.draftAnnounced = false;
  }
  state.drafting = draftingNow;
}

function updateProgression(dt) {
  const liveTotal = state.progressBaseMeters + state.distance;

  if (state.distance >= state.nextCleanDistance) {
    state.cleanKm++;
    state.nextCleanDistance += 1000;
    awardRisk(`CLEAN ${state.cleanKm} KM`, 650 + state.cleanKm * 90, .14, .10);
  }

  if (state.speed >= 250) {
    state.highSpeedTime += dt;
    if (state.highSpeedTime >= 6) {
      state.highSpeedTime = 0;
      awardRisk('HIGH SPEED', 560, .09, .10);
    }
  } else if (state.speed < 235) {
    state.highSpeedTime = Math.max(0, state.highSpeedTime - dt * 2.5);
  }

  if (state.distance - state.lastProgressSave >= 500) {
    state.lastProgressSave = state.distance;
    progressionProfile.totalDistance = Math.max(progressionProfile.totalDistance, liveTotal);
    saveProgressionProfile();
  }
}

function startEvent() {
  const events = [
    { type: 'rush', label: 'RUSH HOUR', duration: 13 },
    { type: 'convoy', label: 'TRUCK CONVOY', duration: 14 },
    { type: 'fog', label: 'FOG BANK', duration: 14 },
    { type: 'speedzone', label: 'SPEED ZONE · 220+', duration: 13 }
  ].filter(e => e.type !== state.previousEvent);
  const event = events[Math.floor(Math.random() * events.length)];
  state.event = { ...event, remaining: event.duration };
  state.previousEvent = event.type;
  eventValue.textContent = event.label;
  eventValue.classList.add('show');
  showMessage(event.label, 1100);
  beep(760, .10, .045, 'triangle');
  if (event.type === 'convoy') {
    spawnTraffic(-95, 'truck', 1);
    spawnTraffic(-122, 'truck', 2);
    spawnTraffic(-151, 'truck', 3);
  }
}

function updateEvents(dt) {
  if (state.event) {
    state.event.remaining -= dt;
    if (state.event.remaining <= 0) {
      state.event = null;
      eventValue.classList.remove('show');
      state.nextEventTime = state.time + 18 + Math.random() * 13;
      showMessage('OPEN ROAD', 620);
    }
  } else if (state.time >= state.nextEventTime && routePacing().phase === 'traffic') {
    startEvent();
  }
}


function updateHUD() {
  const earned = calculateRunUpgradePoints(state.score, state.distance);
  rewardTitle.textContent = `RUN REWARD · ${earned} PT${earned === 1 ? '' : 'S'}`;
  if (earned >= 4) rewardTarget.textContent = 'Maximum run reward';
  else {
    const nextScore = earned ? (Math.floor(state.score / 12000) + 1) * 12000 : 1200;
    const nextDistance = earned ? (Math.floor(state.distance / 8000) + 1) * 8000 : 750;
    const scoreProgress = earned ? (state.score % 12000) / 12000 : state.score / 1200;
    const distanceProgress = earned ? (state.distance % 8000) / 8000 : state.distance / 750;
    const target = distanceProgress > scoreProgress ? `${(nextDistance / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} km` : `${nextScore.toLocaleString()} score`;
    rewardTarget.textContent = `${earned ? 'Next PT' : '1 PT'} at ${target}`;
  }
  speedValue.textContent = Math.round(state.speed);
  nitroFill.style.transform = `scaleX(${state.nitro})`;
  scoreValue.textContent = Math.floor(state.score).toLocaleString();
  fitScoreText(scoreValue);
  comboValue.textContent = `×${state.combo.toFixed(2)}`;
  distanceValue.textContent = `${(state.distance / 1000).toFixed(1)} KM`;
  if (locationValue) locationValue.textContent = currentZone().name;
  if (healthSegments.length) {
    const maxHealth = maxCarHealth();
    healthSegments.forEach((seg, i) => {
      seg.classList.toggle('unused', i >= maxHealth);
      seg.classList.toggle('lost', i < maxHealth && i >= state.health);
    });
  }
  if (nitroStatus) nitroStatus.textContent = state.nitro >= .985 ? 'READY' : `${Math.round(state.nitro * 100)}%`;
  if (nitroMeter) {
    nitroMeter.classList.toggle('ready', state.nitro >= .985);
    nitroMeter.classList.toggle('active', state.boosting);
  }
  if (speedCluster) speedCluster.classList.toggle('boosting', state.boosting);
  if (timeValue) {
    const totalMinutes = Math.floor(state.dayTimeHours * 60) % 1440;
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    timeValue.textContent = `${hh}:${mm} · ${environment.getDayPhase(state.dayTimeHours)}`;
  }
  if (state.event?.type === 'speedzone') {
    eventValue.textContent = state.speed >= 220 ? 'SPEED ZONE · ×1.5' : 'SPEED ZONE · 220+';
  }
}

const clock = new THREE.Clock();
let hudAccumulator = 0;
let atmosphereAccumulator = 0;
let perfFrames = 0;
let perfSeconds = 0;
function updateAdaptiveQuality(dt) {
  if (dt <= 0 || dt > .12) return;
  perfFrames++;
  perfSeconds += dt;
  if (perfSeconds < 2.5) return;
  const fps = perfFrames / perfSeconds;
  let next = qualityPixelRatio;
  if (fps < 47 && qualityPixelRatio > 1.0) next = Math.max(1.0, qualityPixelRatio - .15);
  else if (fps > 58 && qualityPixelRatio < MAX_PIXEL_RATIO) next = Math.min(MAX_PIXEL_RATIO, qualityPixelRatio + .08);
  if (Math.abs(next - qualityPixelRatio) > .04) {
    qualityPixelRatio = next;
    renderer.setPixelRatio(qualityPixelRatio);
    renderer.setSize(innerWidth, innerHeight, false);
  }
  perfFrames = 0;
  perfSeconds = 0;
}


function animate() {
  requestAnimationFrame(animate);
  const realDt = Math.min(.035, clock.getDelta());
  updateAdaptiveQuality(realDt);
  let dt = realDt;
  if (state.mode === 'playing' && state.crashSlow > 0) {
    state.crashSlow = Math.max(0, state.crashSlow - realDt);
    dt *= .28;
  }

  // Time of day belongs to the world, not to an individual run, so restarting
  // never resets it. Pause and Game Over intentionally freeze the entire world.
  if (state.mode === 'playing' || state.mode === 'menu') {
    state.dayTimeHours = environment.advanceTime(state.dayTimeHours, realDt);
    atmosphereAccumulator += realDt;
    if (atmosphereAccumulator >= .065) {
      updateMood(atmosphereAccumulator);
      atmosphereAccumulator = 0;
    }
  }

  if (state.mode === 'playing' && !state.ended) {
    if (state.fatalCrash?.active) {
      updateFatalCrash(realDt);
    } else {
      state.time += dt;
      if (state.comboHold > 0) state.comboHold -= dt;
      else state.combo = Math.max(1, state.combo - .18 * dt);

      updatePlayer(dt);
      const worldSpeed = state.speed / 3.6;
      state.distance += worldSpeed * dt;
      updateRoad(dt, worldSpeed);
      updateTraffic(dt, worldSpeed);
      updateProgression(dt);
      updateEvents(dt);
      updateEnvironment(dt);

      const speedZone = state.event?.type === 'speedzone' && state.speed >= 220 ? 1.5 : 1;
      state.score += state.speed * dt * .72 * state.combo * speedZone;

      if (state.endDelay > 0) {
        state.endDelay -= realDt;
        if (state.endDelay <= 0) endGame();
      }
      hudAccumulator += dt;
      if (hudAccumulator >= .08) { updateHUD(); hudAccumulator = 0; }
    }
  } else if (state.mode === 'menu') {
    const previewSpeed = 12;
    // Only the main-menu background moves. Pause and Game Over freeze the world.
    updateRoad(realDt, previewSpeed);
  }

  if (state.mode !== 'playing' || state.ended) state.boosting = false;

  if (state.mode === 'playing' && !state.ended && !state.fatalCrash?.active && state.shake > 0) {
    state.shake = Math.max(0, state.shake - realDt * 2.6);
    camera.position.x += (Math.random() - .5) * state.shake;
    camera.position.y += (Math.random() - .5) * state.shake * .52;
  }
  renderer.render(scene, camera);
}
animate();

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setPixelRatio(qualityPixelRatio);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  fitScoreText(scoreValue, true);
  fitScoreText(finalScore, true);
}
addEventListener('resize', () => { resize(); clearHeldInput(); updateOrientation(); });

bestScore.textContent = Math.max(readBest(), Number(progressionProfile.bestScore || 0)).toLocaleString();
function setPreloadProgress(value) {
  window.G55Boot.progress(value);
}

async function preloadGameAssets() {
  assetsLoaded = false;
  setPreloadProgress(0);
  await loadOptionalPlayerCars(progress => setPreloadProgress(progress));
  assetsLoaded = true;
  player.visible = true;
  updateGarageUI(false);
  await window.G55Boot.ready();
}

updateGarageUI(false);
preloadGameAssets().catch(err => {
  console.error('[preload]', err);
  window.G55Boot.fail();
});
