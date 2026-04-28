import * as THREE from "three";
import { createPreloader } from "./preloader.js";
import { createPlayer } from "./player.js";
import { createWeaponSystem } from "./weapon.js";
import { createWorld } from "./world.js";
import { createEnemies } from "./enemies.js";
import { createHud } from "./hud.js";
import { createSounds } from "./sounds.js";
import { createImpactParticles } from "./impactParticles.js";
import { createBulletHoles } from "./bulletHoles.js";

const CONFIG = {
  playerHeight: 1.75,
  gravity: 26,
  jumpPower: 8,
  playerSpeed: 8.5,
  groundAcceleration: 55,
  airAcceleration: 12,
  friction: 14,
  airFriction: 0.4,
  stopSpeed: 1.2,
  walkMultiplier: 0.55,
  mouseSensitivity: 0.0022,
  dragSensitivity: 0.006,
  enemyHealth: 100,
  enemySpeed: 1.55,
  enemyDamage: 8,
  enemyAttackDistance: 1.65,
  enemyAttackCooldown: 900,
  arenaSize: 42
};

const state = {
  health: 100,
  score: 0,
  wave: 1,
  enemiesLeft: 0,
  isPlaying: false,
  isGameOver: false,
  isWaveComplete: false
};

const preloader = createPreloader();
let bootLoadingActive = true;

THREE.DefaultLoadingManager.onStart = () => {
  if (!bootLoadingActive) return;
  preloader.show();
  preloader.setProgress(0);
};

THREE.DefaultLoadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
  if (!bootLoadingActive || !itemsTotal) return;

  const progress = (itemsLoaded / itemsTotal) * 100;
  preloader.setProgress(progress);
};

THREE.DefaultLoadingManager.onLoad = () => {
  if (!bootLoadingActive) return;
  preloader.setProgress(100);
};

THREE.DefaultLoadingManager.onError = url => {
  console.warn("Asset failed to load:", url);
};

const sounds = createSounds();

const dom = {
  overlay: document.getElementById("overlay"),
  startButton: document.getElementById("startButton"),
  panel: document.getElementById("panel"),
  panelTitle: document.querySelector("#panel h1"),
  panelText: document.querySelector("#panel p"),
  damageFlash: document.getElementById("damageFlash"),
  moreGamesButton: null
};

const clock = new THREE.Clock();
const scene = new THREE.Scene();
const weaponScene = new THREE.Scene();

scene.background = new THREE.Color(0x87a7c7);
scene.fog = new THREE.Fog(0x87a7c7, 22, 75);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 20000);
camera.position.set(0, CONFIG.playerHeight, 8);
scene.add(camera);

const weaponCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.001, 100);
weaponScene.add(weaponCamera);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

const hud = createHud();
const world = createWorld({ THREE, scene, config: CONFIG });
const player = createPlayer({ THREE, camera, config: CONFIG, colliders: world.colliders });
let enemies = null;

const weapon = createWeaponSystem({ THREE, weaponScene, weaponCamera, playerVelocity: player.velocity });
const impacts = createImpactParticles({ THREE, scene });
const bulletHoles = createBulletHoles({ THREE, scene });

const impactRaycaster = new THREE.Raycaster();
const impactCenter = new THREE.Vector2(0, 0);

const cameraShake = {
  trauma: 0,
  time: 0,
  posAmp: 0.08,
  rotAmp: 0.035,
  decay: 4.8,
  positionOffset: new THREE.Vector3(),
  rotationOffsetZ: 0,
  deathShakeTime: 0,
  damageShakeTime: 0,
  impulsePos: new THREE.Vector3(),
  impulseRotZ: 0
};

const viewPunch = {
  pitch: 0,
  yaw: 0,
  pitchVelocity: 0,
  yawVelocity: 0,
  pitchKick: 0.008,
  yawKick: 0.003,
  returnSpeed: 30,
  damping: 20
};

boot();

async function boot() {
  setupLights();
  setupInput();
  setupOverlayButtons();

  try {
    await world.ready;
    await resetGame();
    preloader.setProgress(100);
    bootLoadingActive = false;
    requestAnimationFrame(() => preloader.hide());
    animate();
  } catch (error) {
    console.error("Game failed to initialize:", error);
    bootLoadingActive = false;
    preloader.hide();

    dom.overlay.style.display = "grid";
    dom.panelTitle.textContent = "Loading Error";
    dom.panelText.textContent = "The game could not load correctly. Please refresh the page.";
    dom.startButton.textContent = "Refresh";
    dom.startButton.onclick = () => window.location.reload();
  }
}

function setupLights() {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.5));

  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(10, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);

  weaponScene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 2.4));

  const weaponLight = new THREE.PointLight(0xffffff, 2.0, 5);
  weaponLight.position.set(0.3, -0.25, 0.5);
  weaponCamera.add(weaponLight);
}

function setupInput() {
  dom.startButton.addEventListener("click", startGame);
  window.addEventListener("resize", onResize);

  document.addEventListener("keydown", e => {
    if (/^Digit[1-9]$/.test(e.code)) switchWeapon(Number(e.code.replace("Digit", "")));
    if (/^Numpad[1-9]$/.test(e.code)) switchWeapon(Number(e.code.replace("Numpad", "")));
    if (e.code === "KeyR") reload();
    if (e.code === "Escape") pauseGame();
    player.onKeyDown(e);
  });

  document.addEventListener("keyup", e => player.onKeyUp(e));

  document.addEventListener("mousedown", e => {
    if (e.button !== 0 || state.isGameOver || state.isWaveComplete) return;
    sounds.resume();
    player.onMouseDown(e);
  });

  document.addEventListener("mouseup", e => player.onMouseUp(e));
  document.addEventListener("mousemove", e => player.onMouseMove(e));
  document.addEventListener("contextmenu", e => e.preventDefault());
  document.addEventListener("pointerlockchange", onPointerLockChange);
  document.addEventListener("pointerlockerror", enableFallbackLook);
  window.addEventListener("blur", player.clearMovement);
}

function setupOverlayButtons() {
  if (dom.startButton && !dom.startButton.classList.contains("cs-button")) {
    dom.startButton.classList.add("cs-button");
  }

  if (!dom.startButton || document.getElementById("moreGamesButton")) return;

  dom.moreGamesButton = document.createElement("a");
  dom.moreGamesButton.id = "moreGamesButton";
  dom.moreGamesButton.href = "https://g55.co/";
  dom.moreGamesButton.textContent = "More Games";
  dom.moreGamesButton.className = "cs-button";
  dom.moreGamesButton.target = "_blank";
  dom.moreGamesButton.rel = "noopener noreferrer";

  dom.startButton.insertAdjacentElement("afterend", dom.moreGamesButton);
}

async function startGame() {
  sounds.resume();

  if (state.isWaveComplete) {
    continueWave();
    return;
  }

  if (state.isGameOver) await resetGame();

  state.isPlaying = true;
  dom.overlay.style.display = "none";
  document.body.classList.remove("fallback-look");

  player.lockCursor();
  updateModeNote();
}

function pauseGame() {
  if (!state.isPlaying || state.isGameOver || state.isWaveComplete) return;

  state.isPlaying = false;
  player.clearMovement();
  document.body.classList.remove("cursor-locked", "fallback-look");

  if (document.pointerLockElement === document.body) document.exitPointerLock();

  dom.overlay.style.display = "grid";
  dom.panelTitle.textContent = "Paused";
  dom.panelText.textContent = "Click continue to lock the cursor again.";
  dom.startButton.textContent = "Continue";
}

function showWaveComplete() {
  state.isPlaying = false;
  state.isWaveComplete = true;

  player.clearMovement();

  if (document.pointerLockElement === document.body) document.exitPointerLock();

  document.body.classList.remove("cursor-locked", "fallback-look");

  weapon.addReserveAmmo(30);
  updateHud();

  dom.overlay.style.display = "grid";
  dom.panelTitle.textContent = `Wave ${state.wave} Complete`;
  dom.panelText.textContent = `Score: ${state.score}. Continue to start wave ${state.wave + 1}.`;
  dom.startButton.textContent = "Continue";
}

function continueWave() {
  if (!enemies) return;

  state.isWaveComplete = false;
  state.wave += 1;

  enemies.spawnWave(state.wave);
  updateHud();

  state.isPlaying = true;
  dom.overlay.style.display = "none";
  document.body.classList.remove("fallback-look");

  player.lockCursor();
  updateModeNote();
}

function onPointerLockChange() {
  const locked = document.pointerLockElement === document.body;

  player.setPointerLockActive(locked);
  document.body.classList.toggle("cursor-locked", locked);

  if (!locked && state.isPlaying && !state.isGameOver && !state.isWaveComplete && player.pointerLockSupported) {
    pauseGame();
  }

  updateModeNote();
}

function enableFallbackLook() {
  player.enableFallbackLook();
  document.body.classList.remove("cursor-locked");
  document.body.classList.add("fallback-look");
  updateModeNote();
}

function updateModeNote() {
  const modeNote = document.getElementById("modeNote");
  if (!modeNote) return;

  if (player.pointerLockActive) modeNote.textContent = "Cursor locked: mouse look active";
  else if (player.pointerLockSupported) modeNote.textContent = "Cursor lock: click start to lock";
  else modeNote.textContent = "Cursor lock blocked: hold left mouse button and drag";
}

function switchWeapon(slotNumber) {
  if (!state.isPlaying || state.isGameOver || state.isWaveComplete) return;
  if (weapon.switchSlot(slotNumber)) updateHud();
}

function updateHud() {
  state.enemiesLeft = enemies ? enemies.count : 0;
  hud.update({ ...state, ...weapon.getHudState() });
}

function shoot() {
  if (!enemies || state.isWaveComplete) return;

  const shot = weapon.shoot();

  if (!shot.ok) {
    if (shot.reason === "empty") sounds.playEmpty();
    return;
  }

  addViewPunch();
  sounds.playShoot(weapon.getCurrentAsset());
  if (hud.setCrosshairFire) hud.setCrosshairFire();
  spawnTracer();

  const hit = getBulletHit();

  if (hit?.type === "enemy") {
    const killed = enemies.damageEnemy(hit.enemy, shot.damage);

    impacts.spawnBlood(hit.point, hit.normal.clone().multiplyScalar(-1));

    if (killed) {
      sounds.playEnemyDie();
      state.score += 100;

      if (enemies.count === 0) {
        showWaveComplete();
      }
    } else {
      sounds.playEnemyHit();
    }
  } else if (hit?.type === "surface") {
    impacts.spawnSurface(hit.point, hit.normal);
    bulletHoles.spawn(hit.point, hit.normal);
  }

  updateHud();
}

function reload() {
  if (!state.isPlaying || state.isGameOver || state.isWaveComplete) return;

  const result = weapon.reload();
  if (!result.started) return;

  sounds.playReload();
  updateHud();

  setTimeout(() => updateHud(), result.duration);
}

function getBulletHit() {
  impactRaycaster.setFromCamera(impactCenter, camera);

  const enemyHit = enemies ? enemies.getHit(impactRaycaster) : null;
  const surfaceHit = getSurfaceImpact();

  if (enemyHit && surfaceHit) {
    return enemyHit.distance <= surfaceHit.distance ? enemyHit : surfaceHit;
  }

  return enemyHit || surfaceHit || null;
}

function getSurfaceImpact() {
  const hits = impactRaycaster.intersectObjects(world.colliders, true);
  if (!hits.length) return null;

  const hit = hits[0];

  return {
    type: "surface",
    point: hit.point,
    normal: hit.face?.normal?.clone()?.transformDirection(hit.object.matrixWorld) ?? new THREE.Vector3(0, 1, 0),
    distance: hit.distance
  };
}

function spawnTracer() {
  const direction = new THREE.Vector3();

  camera.getWorldDirection(direction);

  const start = camera.position.clone().add(direction.clone().multiplyScalar(0.8));
  const end = camera.position.clone().add(direction.clone().multiplyScalar(28));
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineBasicMaterial({
    color: 0xfff2a0,
    transparent: true,
    opacity: 0.85
  });

  const line = new THREE.Line(geometry, material);
  line.userData.life = 0.06;

  scene.add(line);
  world.tracers.push(line);
}

function updateTracers(delta) {
  for (let i = world.tracers.length - 1; i >= 0; i--) {
    const tracer = world.tracers[i];

    tracer.userData.life -= delta;
    tracer.material.opacity = Math.max(0, tracer.userData.life / 0.06);

    if (tracer.userData.life <= 0) {
      scene.remove(tracer);
      tracer.geometry.dispose();
      tracer.material.dispose();
      world.tracers.splice(i, 1);
    }
  }
}

function takeDamage(amount) {
  if (state.isGameOver || state.isWaveComplete) return;

  state.health = Math.max(0, state.health - amount);

  cameraShake.damageShakeTime = 0.14;
  cameraShake.impulsePos.set(
    (Math.random() - 0.5) * 0.08,
    (Math.random() - 0.5) * 0.055,
    (Math.random() - 0.5) * 0.035
  );
  cameraShake.impulseRotZ = (Math.random() - 0.5) * 0.035;

  viewPunch.pitchVelocity += 0.045;
  viewPunch.yawVelocity += (Math.random() - 0.5) * 0.035;

  if (state.health <= 0) {
    endGame();
    updateHud();
    return;
  }

  dom.damageFlash.style.transition = "opacity 0.12s ease";
  dom.damageFlash.style.background = "rgba(255, 0, 0, 0.35)";
  dom.damageFlash.style.opacity = "1";
  setTimeout(() => {
    if (!state.isGameOver && !state.isWaveComplete) dom.damageFlash.style.opacity = "0";
  }, 120);

  sounds.playPlayerHit();
  updateHud();
}

function endGame() {
  state.isGameOver = true;
  state.isPlaying = false;
  state.isWaveComplete = false;

  player.clearMovement();

  if (document.pointerLockElement === document.body) document.exitPointerLock();

  document.body.classList.remove("cursor-locked", "fallback-look");

  viewPunch.pitchVelocity += 0.18;
  viewPunch.yawVelocity += (Math.random() - 0.5) * 0.12;

  cameraShake.impulsePos.set(
    (Math.random() - 0.5) * 0.12,
    (Math.random() - 0.5) * 0.08,
    (Math.random() - 0.5) * 0.06
  );
  cameraShake.impulseRotZ = (Math.random() - 0.5) * 0.05;
  cameraShake.deathShakeTime = 0.2;

  dom.damageFlash.style.display = "block";
  dom.damageFlash.style.position = "fixed";
  dom.damageFlash.style.left = "0";
  dom.damageFlash.style.top = "0";
  dom.damageFlash.style.width = "100vw";
  dom.damageFlash.style.height = "100vh";
  dom.damageFlash.style.pointerEvents = "none";
  dom.damageFlash.style.zIndex = "2";
  dom.damageFlash.style.transition = "opacity 1.0s ease";
  dom.damageFlash.style.background = "rgba(160, 0, 0, 0.45)";
  dom.damageFlash.style.opacity = "0";

  requestAnimationFrame(() => {
    dom.damageFlash.style.opacity = "1";
  });

  sounds.playPlayerDie();

  setTimeout(() => {
    dom.overlay.style.display = "grid";
    dom.panelTitle.textContent = "Game Over";
    dom.panelText.textContent = `Final score: ${state.score}. Click restart to play again.`;
    dom.startButton.textContent = "Restart";
  }, 650);
}

async function resetGame() {
  state.health = 100;
  state.score = 0;
  state.wave = 1;
  state.isGameOver = false;
  state.isWaveComplete = false;

  cameraShake.trauma = 0;
  cameraShake.posAmp = 0.08;
  cameraShake.rotAmp = 0.035;
  cameraShake.decay = 4.8;
  cameraShake.deathShakeTime = 0;
  dom.damageFlash.style.transition = "opacity 0.12s ease";
  dom.damageFlash.style.background = "rgba(255, 0, 0, 0.35)";
  dom.damageFlash.style.opacity = "0";

  await world.ready;
  world.resetPlayer(player);

  if (!enemies) {
    enemies = createEnemies({
      THREE,
      scene,
      camera,
      config: CONFIG,
      state,
      floorObjects: world.floorObjects,
      colliders: world.colliders
    });
  }

  enemies.reset();
  enemies.spawnWave(state.wave);
  weapon.resetSlots();
  impacts.clear();
  bulletHoles.clear();
  weapon.play("idle");

  updateHud();

  dom.panelTitle.textContent = "FPS Template";
  dom.panelText.textContent = "Click start, then use WASD to move, mouse to look, left click to shoot, and R to reload.";
  dom.startButton.textContent = "Start Game";
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  weaponCamera.aspect = window.innerWidth / window.innerHeight;
  weaponCamera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function addViewPunch() {
  viewPunch.pitchVelocity += viewPunch.pitchKick;
  viewPunch.yawVelocity += (Math.random() - 0.5) * viewPunch.yawKick;
}

function updateViewPunch(delta) {
  viewPunch.pitchVelocity += -viewPunch.pitch * viewPunch.returnSpeed * delta;
  viewPunch.yawVelocity += -viewPunch.yaw * viewPunch.returnSpeed * delta;

  viewPunch.pitchVelocity *= Math.exp(-viewPunch.damping * delta);
  viewPunch.yawVelocity *= Math.exp(-viewPunch.damping * delta);

  viewPunch.pitch += viewPunch.pitchVelocity;
  viewPunch.yaw += viewPunch.yawVelocity;
}

function updateCameraShake(delta) {
  cameraShake.time += delta;

  if (cameraShake.deathShakeTime > 0) {
    cameraShake.deathShakeTime = Math.max(0, cameraShake.deathShakeTime - delta);

    const decay = Math.exp(-20 * delta);
    cameraShake.impulsePos.multiplyScalar(decay);
    cameraShake.impulseRotZ *= decay;

    cameraShake.positionOffset.copy(cameraShake.impulsePos);
    cameraShake.rotationOffsetZ = cameraShake.impulseRotZ;
    return;
  }

  if (cameraShake.damageShakeTime > 0) {
    cameraShake.damageShakeTime = Math.max(0, cameraShake.damageShakeTime - delta);

    const decay = Math.exp(-28 * delta);
    cameraShake.impulsePos.multiplyScalar(decay);
    cameraShake.impulseRotZ *= decay;

    cameraShake.positionOffset.copy(cameraShake.impulsePos);
    cameraShake.rotationOffsetZ = cameraShake.impulseRotZ;
    return;
  }

  cameraShake.positionOffset.set(0, 0, 0);
  cameraShake.rotationOffsetZ = 0;
}

function renderWithCameraShake() {
  camera.position.add(cameraShake.positionOffset);
  camera.rotation.x += viewPunch.pitch;
  camera.rotation.y += viewPunch.yaw;
  camera.rotation.z += cameraShake.rotationOffsetZ;

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(weaponScene, weaponCamera);

  camera.rotation.z -= cameraShake.rotationOffsetZ;
  camera.rotation.y -= viewPunch.yaw;
  camera.rotation.x -= viewPunch.pitch;
  camera.position.sub(cameraShake.positionOffset);
}

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);

  player.update(delta, state.isPlaying);

  if (state.isPlaying && player.inputState.jumped) {
    sounds.playJump();
  }

  if (state.isPlaying && player.inputState.footstep) {
    sounds.playFootstep(player.inputState.walking, player.inputState.speed01);
  }

  if (state.isPlaying && !state.isGameOver && !state.isWaveComplete && player.inputState.mouseDown) {
    shoot();
  }

  if (enemies) {
    enemies.update(delta, state.isPlaying, takeDamage);
  }

  weapon.update(delta, state.isPlaying, player.inputState);
  updateTracers(delta);
  impacts.update(delta);
  bulletHoles.update(delta);
  updateViewPunch(delta);
  updateCameraShake(delta);
  renderWithCameraShake();
}
