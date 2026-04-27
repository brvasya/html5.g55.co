import * as THREE from "three";
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
  isGameOver: false
};

const sounds = createSounds();

const dom = {
  overlay: document.getElementById("overlay"),
  startButton: document.getElementById("startButton"),
  panelTitle: document.querySelector("#panel h1"),
  panelText: document.querySelector("#panel p"),
  damageFlash: document.getElementById("damageFlash")
};

const clock = new THREE.Clock();
const scene = new THREE.Scene();
const weaponScene = new THREE.Scene();

scene.background = new THREE.Color(0x87a7c7);
scene.fog = new THREE.Fog(0x87a7c7, 22, 75);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 900);
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
const enemies = createEnemies({ THREE, scene, camera, config: CONFIG, state });
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
  rotationOffsetZ: 0
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

setupLights();
setupInput();
resetGame();
animate();

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
    if (e.button !== 0 || state.isGameOver) return;
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

function startGame() {
  if (state.isGameOver) resetGame();

  state.isPlaying = true;
  dom.overlay.style.display = "none";
  document.body.classList.remove("fallback-look");

  player.lockCursor();
  updateModeNote();
}

function pauseGame() {
  if (!state.isPlaying || state.isGameOver) return;

  state.isPlaying = false;
  player.clearMovement();
  document.body.classList.remove("cursor-locked", "fallback-look");

  if (document.pointerLockElement === document.body) document.exitPointerLock();

  dom.overlay.style.display = "grid";
  dom.panelTitle.textContent = "Paused";
  dom.panelText.textContent = "Click continue to lock the cursor again.";
  dom.startButton.textContent = "Continue";
}

function onPointerLockChange() {
  const locked = document.pointerLockElement === document.body;

  player.setPointerLockActive(locked);
  document.body.classList.toggle("cursor-locked", locked);

  if (!locked && state.isPlaying && !state.isGameOver && player.pointerLockSupported) {
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

  if (player.pointerLockActive) modeNote.textContent = "Cursor locked: mouse look active";
  else if (player.pointerLockSupported) modeNote.textContent = "Cursor lock: click start to lock";
  else modeNote.textContent = "Cursor lock blocked: hold left mouse button and drag";
}

function switchWeapon(slotNumber) {
  if (!state.isPlaying || state.isGameOver) return;
  if (weapon.switchSlot(slotNumber)) updateHud();
}

function updateHud() {
  state.enemiesLeft = enemies.count;
  hud.update({ ...state, ...weapon.getHudState() });
}

function shoot() {
  const shot = weapon.shoot();

  if (!shot.ok) {
    if (shot.reason === "empty") sounds.playEmpty();
    return;
  }

  addViewPunch();
  sounds.playShoot(weapon.getCurrentAsset());
  hud.setCrosshairFire?.();
  spawnTracer();

  const hit = getBulletHit();

  if (hit?.type === "enemy") {
    const killed = enemies.damageEnemy(hit.enemy, shot.damage);

    impacts.spawnBlood(hit.point, hit.normal.clone().multiplyScalar(-1));

    if (killed) {
      sounds.playEnemyDie();
      state.score += 100;

      if (enemies.count === 0) {
        state.wave += 1;
        weapon.addReserveAmmo(30);
        updateHud();

        setTimeout(() => {
          enemies.spawnWave(state.wave);
          updateHud();
        }, 700);
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
  if (!state.isPlaying || state.isGameOver) return;

  const result = weapon.reload();
  if (!result.started) return;

  sounds.playReload();
  updateHud();

  setTimeout(() => updateHud(), result.duration);
}

function getBulletHit() {
  impactRaycaster.setFromCamera(impactCenter, camera);

  const enemyHit = enemies.getHit(impactRaycaster);
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
  state.health = Math.max(0, state.health - amount);
  cameraShake.trauma = Math.min(1, cameraShake.trauma + 0.45);

  dom.damageFlash.style.opacity = "1";
  setTimeout(() => (dom.damageFlash.style.opacity = "0"), 120);

  sounds.playPlayerHit();

  if (state.health <= 0) endGame();

  updateHud();
}

function endGame() {
  state.isGameOver = true;
  state.isPlaying = false;

  player.clearMovement();

  if (document.pointerLockElement === document.body) document.exitPointerLock();

  document.body.classList.remove("cursor-locked", "fallback-look");

  dom.overlay.style.display = "grid";
  dom.panelTitle.textContent = "Game Over";
  dom.panelText.textContent = `Final score: ${state.score}. Click restart to play again.`;
  dom.startButton.textContent = "Restart";
}

function resetGame() {
  state.health = 100;
  state.score = 0;
  state.wave = 1;
  state.isGameOver = false;

  player.reset();
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
  cameraShake.trauma = Math.max(0, cameraShake.trauma - cameraShake.decay * delta);

  cameraShake.positionOffset.set(
    Math.sin(cameraShake.time * 71.0) * cameraShake.posAmp * cameraShake.trauma,
    Math.sin(cameraShake.time * 53.0) * cameraShake.posAmp * 0.45 * cameraShake.trauma,
    0
  );

  cameraShake.rotationOffsetZ = Math.sin(cameraShake.time * 83.0) * cameraShake.rotAmp * cameraShake.trauma;
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

  if (state.isPlaying && !state.isGameOver && player.inputState.mouseDown) {
    shoot();
  }

  enemies.update(delta, state.isPlaying, takeDamage);
  weapon.update(delta, state.isPlaying, player.inputState);
  updateTracers(delta);
  impacts.update(delta);
  bulletHoles.update(delta);
  updateViewPunch(delta);
  updateCameraShake(delta);
  renderWithCameraShake();
}