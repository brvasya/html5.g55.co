import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { ZOMBIE } from "../../assets/enemies/zombie.js";
import { makeMaterialCrisp } from "./materials.js";

const ENEMY_TYPES = {
  zombie: {
    asset: ZOMBIE
  }
};

const DEFAULT_ENEMY_TYPE = "zombie";

export function createEnemies({ THREE, scene, camera, config, state, floorObjects = [], colliders = [] }) {
  const enemies = [];
  const toPlayer = new THREE.Vector3();

  const TERRAIN_TUNING = {
    rayExtraHeight: 2.0,
    rayLength: 8.0,
    stepHeight: 0.75,
    minWalkableNormalY: 0.45,
    enemyBaseOffset: 0
  };

  const NAV_TUNING = {
    obstacleRayHeight: 0.9,
    obstacleRayDistance: 1.25,
    targetReachDistance: 1.2,
    targetMaxAge: 3.0,
    repickDistance: 0.8,
    maxTargetTries: 20
  };

  const terrainRaycaster = new THREE.Raycaster();
  const terrainRayOrigin = new THREE.Vector3();
  const terrainRayDirection = new THREE.Vector3(0, -1, 0);

  const obstacleRaycaster = new THREE.Raycaster();
  const obstacleRayOrigin = new THREE.Vector3();
  const obstacleRayDirection = new THREE.Vector3();

  const modelCache = new Map();
  const audioCache = new Map();

  function preloadAll() {
    const tasks = [];

    Object.keys(ENEMY_TYPES).forEach(typeId => {
      tasks.push(preloadEnemyType(typeId));

      const asset = ENEMY_TYPES[typeId]?.asset;
      if (asset?.attackSound) tasks.push(preloadSound(asset.attackSound));
      if (asset?.hitSound) tasks.push(preloadSound(asset.hitSound));
      if (asset?.deathSound) tasks.push(preloadSound(asset.deathSound));
    });

    return Promise.all(tasks);
  }

  function preloadEnemyType(typeId) {
    const type = getEnemyType(typeId);
    const asset = type.asset;

    if (!asset || !asset.model) return Promise.resolve(null);

    let cached = modelCache.get(typeId);

    if (cached?.promise) return cached.promise;
    if (cached?.source || cached?.failed) return Promise.resolve(cached);

    cached = {
      source: null,
      animations: [],
      loading: true,
      failed: false,
      promise: null
    };

    modelCache.set(typeId, cached);

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    cached.promise = new Promise(resolve => {
      loader.load(
        asset.model,
        gltf => {
          cached.source = gltf.scene;
          cached.animations = gltf.animations || [];
          cached.loading = false;
          cached.failed = false;

          cached.source.traverse(object => {
            if (!object.isMesh) return;

            object.castShadow = true;
            object.receiveShadow = true;
            object.frustumCulled = false;

            if (object.material) makeMaterialCrisp(THREE, object.material);
          });

          enemies.forEach(enemy => {
            if (enemy.userData.typeId === typeId && !enemy.userData.model) {
              attachEnemyModel(enemy);
            }
          });

          resolve(cached);
        },
        undefined,
        error => {
          cached.loading = false;
          cached.failed = true;
          console.warn(`Enemy model failed to preload: ${typeId}`, error);
          resolve(cached);
        }
      );
    });

    return cached.promise;
  }

  function preloadSound(src) {
    if (!src) return Promise.resolve(null);

    const cached = audioCache.get(src);
    if (cached?.promise) return cached.promise;
    if (cached?.audio || cached?.failed) return Promise.resolve(cached);

    const audio = new Audio();

    const entry = {
      audio,
      failed: false,
      promise: null
    };

    audioCache.set(src, entry);

    entry.promise = new Promise(resolve => {
      const done = () => resolve(entry);
      const fail = () => {
        entry.failed = true;
        resolve(entry);
      };

      audio.preload = "auto";
      audio.src = src;
      audio.volume = 1.0;
      audio.addEventListener("canplaythrough", done, { once: true });
      audio.addEventListener("error", fail, { once: true });
      audio.load();
    });

    return entry.promise;
  }

  preloadEnemyType(DEFAULT_ENEMY_TYPE);

  function getEnemyType(typeId) {
    return ENEMY_TYPES[typeId] || ENEMY_TYPES[DEFAULT_ENEMY_TYPE];
  }

  function chooseEnemyTypeForWave() {
    return DEFAULT_ENEMY_TYPE;
  }

  function spawnWave(wave) {
    const count = Math.min(3 + wave * 3, 30);

    if (!floorObjects || floorObjects.length === 0) {
      console.warn("No G55FLR floor objects found for enemy spawning");
      return;
    }

    for (let i = 0; i < count; i++) {
      const point = getRandomFloorPoint();

      if (!point) continue;

      createEnemy(
        point.x,
        point.y,
        point.z,
        wave,
        chooseEnemyTypeForWave(wave)
      );
    }
  }

  function getRandomFloorPoint() {
    let point = null;
    let tries = NAV_TUNING.maxTargetTries;

    while (!point && tries-- > 0) {
      const mesh = floorObjects[Math.floor(Math.random() * floorObjects.length)];
      point = getRandomPointOnMesh(mesh);
    }

    return point;
  }

  function getRandomPointOnMesh(mesh) {
    if (!mesh || !mesh.geometry || !mesh.geometry.attributes.position) return null;

    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const index = geometry.index;

    let a;
    let b;
    let c;

    if (index) {
      const triangleIndex = Math.floor(Math.random() * (index.count / 3)) * 3;

      a = index.getX(triangleIndex);
      b = index.getX(triangleIndex + 1);
      c = index.getX(triangleIndex + 2);
    } else {
      const triangleIndex = Math.floor(Math.random() * (position.count / 3)) * 3;

      a = triangleIndex;
      b = triangleIndex + 1;
      c = triangleIndex + 2;
    }

    const vA = new THREE.Vector3().fromBufferAttribute(position, a);
    const vB = new THREE.Vector3().fromBufferAttribute(position, b);
    const vC = new THREE.Vector3().fromBufferAttribute(position, c);

    const r1 = Math.random();
    const r2 = Math.random();
    const sqrtR1 = Math.sqrt(r1);

    const point = new THREE.Vector3()
      .addScaledVector(vA, 1 - sqrtR1)
      .addScaledVector(vB, sqrtR1 * (1 - r2))
      .addScaledVector(vC, sqrtR1 * r2);

    mesh.updateWorldMatrix(true, false);
    point.applyMatrix4(mesh.matrixWorld);

    const terrainY = getTerrainY(point.x, point.y + TERRAIN_TUNING.rayExtraHeight, point.z, null);

    if (terrainY === null) return null;

    point.y = terrainY + TERRAIN_TUNING.enemyBaseOffset;
    return point;
  }

  function createEnemy(x, y, z, wave, typeId = DEFAULT_ENEMY_TYPE) {
    const type = getEnemyType(typeId);

    const group = new THREE.Group();
    group.position.set(x, y, z);

    const asset = type.asset || {};

    group.userData = {
      typeId: typeId,
      type,
      health: (config.enemyHealth + wave * 8) * (asset.healthMultiplier ?? 1),
      speed: config.enemySpeed * (asset.speedMultiplier ?? 1),
      damage: config.enemyDamage * (asset.damageMultiplier ?? 1),
      attackDistance: asset.attackDistance ?? config.enemyAttackDistance,
      attackDuration: 0,
      attackDamageDelay: asset.attackDamageDelay,
      lastAttack: 0,
      mixer: null,
      actions: {},
      currentAction: null,
      isAttacking: false,
      attackTimer: 0,
      attackElapsed: 0,
      pendingDamage: false,
      model: null,
      fallback: null,
      groundY: y,
      verticalVelocity: 0,
      navTarget: null,
      navTargetAge: 0
    };

    snapEnemyToTerrain(group, true);

    createFallbackEnemy(group);

    scene.add(group);
    enemies.push(group);

    attachEnemyModel(group);
    preloadEnemyType(typeId);
  }

  function createFallbackEnemy(group) {
    const fallback = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.3, 0.55),
      new THREE.MeshStandardMaterial({ color: 0xbb3333 })
    );

    body.position.y = 0.85;

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.62, 0.62),
      new THREE.MeshStandardMaterial({ color: 0xdd5555 })
    );

    head.position.y = 1.65;

    fallback.add(body);
    fallback.add(head);

    group.userData.fallback = fallback;
    group.add(fallback);
  }

  function attachEnemyModel(enemy) {
    const type = enemy.userData.type;
    const cached = modelCache.get(enemy.userData.typeId);

    if (!cached || !cached.source || enemy.userData.model) return;

    if (enemy.userData.fallback) {
      enemy.remove(enemy.userData.fallback);
      disposeObject(enemy.userData.fallback);
      enemy.userData.fallback = null;
    }

    const model = SkeletonUtils.clone(cached.source);

    const assetScale = type.asset.scale || [1, 1, 1];
    model.scale.set(assetScale[0], assetScale[1], assetScale[2]);

    const assetRotation = type.asset.rotation || [0, 0, 0];
    const assetPosition = type.asset.position || [0, 0, 0];

    model.rotation.set(assetRotation[0], assetRotation[1], assetRotation[2]);
    model.position.set(assetPosition[0], assetPosition[1], assetPosition[2]);

    model.traverse(object => {
      if (!object.isMesh || !object.material) return;

      if (Array.isArray(object.material)) {
        object.material = object.material.map(material => material.clone());
      } else {
        object.material = object.material.clone();
      }

      makeMaterialCrisp(THREE, object.material);
    });

    enemy.add(model);
    enemy.userData.model = model;

    if (cached.animations.length) {
      setupEnemyAnimations(enemy, model, cached.animations);
      if (!enemy.userData.isAttacking) playEnemyAnimation(enemy, "walk");
    }
  }

  function setupEnemyAnimations(enemy, model, animations) {
    const mixer = new THREE.AnimationMixer(model);
    const baseClip = animations[0];

    enemy.userData.mixer = mixer;
    enemy.userData.actions = {};

    Object.entries(enemy.userData.type.asset.anim || {}).forEach(([name, data]) => {
      const fps = 30;
      const clip = THREE.AnimationUtils.subclip(baseClip, name, data[0], data[1], fps);
      const action = mixer.clipAction(clip);

      if (name === "attack") {
        enemy.userData.attackDuration = clip.duration;
      }

      action.setLoop(data[2] ? THREE.LoopRepeat : THREE.LoopOnce, data[2] ? Infinity : 1);
      action.clampWhenFinished = !data[2];

      enemy.userData.actions[name] = action;
    });
  }

  function playEnemyAnimation(enemy, name) {
    const action = enemy.userData.actions[name];
    if (!action) return;
    if (enemy.userData.currentAction === action) return;

    if (enemy.userData.currentAction) {
      enemy.userData.currentAction.fadeOut(0.08);
    }

    action.reset().fadeIn(0.08).play();
    enemy.userData.currentAction = action;
  }

  function update(delta, isPlaying, takeDamage) {
    if (!isPlaying) return;

    const nowTime = performance.now();
    const playerPosition = camera.position;

    enemies.forEach(enemy => {
      if (enemy.userData.mixer) enemy.userData.mixer.update(delta);

      if (enemy.userData.isDying) {
        enemy.userData.deathTimer -= delta;

        if (enemy.userData.deathTimer <= 0) {
          removeEnemy(enemy);
        }

        return;
      }

      if (enemy.userData.attackTimer > 0) {
        enemy.userData.attackTimer = Math.max(0, enemy.userData.attackTimer - delta);
        enemy.userData.attackElapsed += delta;

        if (enemy.userData.attackTimer === 0) {
          enemy.userData.isAttacking = false;
          playEnemyAnimation(enemy, "walk");
        }
      }

      toPlayer.set(
        playerPosition.x - enemy.position.x,
        0,
        playerPosition.z - enemy.position.z
      );

      const distance = toPlayer.length();

      if (distance <= enemy.userData.attackDistance) {
        enemy.userData.navTarget = null;
        enemy.userData.navTargetAge = 0;
        enemy.lookAt(playerPosition.x, enemy.position.y, playerPosition.z);
      }

      if (distance > enemy.userData.attackDistance) {
        if (!enemy.userData.isAttacking) {
          moveEnemy(enemy, playerPosition, delta);
          playEnemyAnimation(enemy, "walk");
        }
      } else if (nowTime - enemy.userData.lastAttack > config.enemyAttackCooldown && !enemy.userData.isAttacking) {
        enemy.userData.lastAttack = nowTime;
        enemy.userData.isAttacking = true;
        enemy.userData.attackTimer = enemy.userData.attackDuration;
        enemy.userData.attackElapsed = 0;
        enemy.userData.pendingDamage = true;
        playEnemyAnimation(enemy, "attack");

        if (enemy.userData.type.asset.attackSound) {
          playAssetSound(enemy.userData.type.asset.attackSound, 1.0);
        }
      }

      if (
        enemy.userData.isAttacking &&
        enemy.userData.pendingDamage &&
        enemy.userData.attackElapsed >= enemy.userData.attackDamageDelay
      ) {
        enemy.userData.pendingDamage = false;
        takeDamage(enemy.userData.damage);
      }
    });
  }

  function moveEnemy(enemy, playerPosition, delta) {
    enemy.userData.navTargetAge += delta;

    const playerDirection = new THREE.Vector3(
      playerPosition.x - enemy.position.x,
      0,
      playerPosition.z - enemy.position.z
    );

    if (playerDirection.lengthSq() <= 0.0001) return;

    playerDirection.normalize();

    const directPathBlocked = hasObstacleAhead(enemy, playerDirection);

    if (directPathBlocked && !enemy.userData.navTarget) {
      enemy.userData.navTarget = getRandomFloorPoint();
      enemy.userData.navTargetAge = 0;
    }

    if (enemy.userData.navTarget && enemy.userData.navTargetAge > NAV_TUNING.targetMaxAge) {
      enemy.userData.navTarget = null;
      enemy.userData.navTargetAge = 0;
    }

    let moveTarget = playerPosition;

    if (enemy.userData.navTarget) {
      const navDistance = getFlatDistance(enemy.position, enemy.userData.navTarget);

      if (navDistance < NAV_TUNING.targetReachDistance) {
        enemy.userData.navTarget = null;
        enemy.userData.navTargetAge = 0;
      } else {
        moveTarget = enemy.userData.navTarget;
      }
    }

    const moveDirection = new THREE.Vector3(
      moveTarget.x - enemy.position.x,
      0,
      moveTarget.z - enemy.position.z
    );

    if (moveDirection.lengthSq() <= 0.0001) return;

    moveDirection.normalize();

    if (hasObstacleAhead(enemy, moveDirection)) {
      const newTarget = getRandomFloorPoint();

      if (newTarget && getFlatDistance(enemy.position, newTarget) > NAV_TUNING.repickDistance) {
        enemy.userData.navTarget = newTarget;
        enemy.userData.navTargetAge = 0;
      }

      return;
    }

    const oldX = enemy.position.x;
    const oldZ = enemy.position.z;

    const speed = enemy.userData.speed + state.wave * 0.08;

    enemy.position.x += moveDirection.x * speed * delta;
    enemy.position.z += moveDirection.z * speed * delta;

    if (!snapEnemyToTerrain(enemy, false)) {
      enemy.position.x = oldX;
      enemy.position.z = oldZ;

      enemy.userData.navTarget = getRandomFloorPoint();
      enemy.userData.navTargetAge = 0;
      return;
    }

    enemy.lookAt(moveTarget.x, enemy.position.y, moveTarget.z);
  }

  function hasObstacleAhead(enemy, direction) {
    if (!colliders || colliders.length === 0) return false;
    if (!direction || direction.lengthSq() <= 0.0001) return false;

    obstacleRayDirection.copy(direction).normalize();

    obstacleRayOrigin.set(
      enemy.position.x,
      enemy.position.y + NAV_TUNING.obstacleRayHeight,
      enemy.position.z
    );

    obstacleRaycaster.set(obstacleRayOrigin, obstacleRayDirection);
    obstacleRaycaster.near = 0;
    obstacleRaycaster.far = NAV_TUNING.obstacleRayDistance;

    const hits = obstacleRaycaster.intersectObjects(colliders, true);

    for (const hit of hits) {
      if (!hit.face) continue;

      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);

      if (normal.y >= TERRAIN_TUNING.minWalkableNormalY) continue;

      return true;
    }

    return false;
  }

  function getFlatDistance(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;

    return Math.sqrt(dx * dx + dz * dz);
  }

  function snapEnemyToTerrain(enemy, forceSnap) {
    const rayStartY = enemy.position.y + TERRAIN_TUNING.rayExtraHeight;
    const terrainY = getTerrainY(enemy.position.x, rayStartY, enemy.position.z, enemy);

    if (terrainY === null) return false;

    const targetY = terrainY + TERRAIN_TUNING.enemyBaseOffset;
    const deltaY = targetY - enemy.position.y;

    if (!forceSnap && deltaY > TERRAIN_TUNING.stepHeight) {
      return false;
    }

    enemy.position.y = targetY;
    enemy.userData.groundY = terrainY;
    enemy.userData.verticalVelocity = 0;

    return true;
  }

  function getTerrainY(x, y, z, enemy) {
    terrainRayOrigin.set(x, y, z);
    terrainRaycaster.set(terrainRayOrigin, terrainRayDirection);
    terrainRaycaster.far = TERRAIN_TUNING.rayLength;

    const terrainObjects = colliders.length ? colliders : floorObjects;
    const hits = terrainRaycaster.intersectObjects(terrainObjects, true);

    for (const hit of hits) {
      if (!hit.face) continue;

      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);

      if (normal.y < TERRAIN_TUNING.minWalkableNormalY) continue;

      if (enemy && hit.point.y > enemy.position.y + TERRAIN_TUNING.stepHeight) continue;

      return hit.point.y;
    }

    return null;
  }

  function getHit(activeRaycaster) {
    const activeEnemies = enemies.filter(enemy => !enemy.userData.isDying);
    const hits = activeRaycaster.intersectObjects(activeEnemies, true);
    if (!hits.length) return null;

    const hit = hits[0];
    const enemy = findEnemyRoot(hit.object);

    if (!enemy) return null;

    return {
      type: "enemy",
      enemy,
      point: hit.point,
      normal: hit.face
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        : new THREE.Vector3(0, 1, 0),
      distance: hit.distance
    };
  }

  function damageEnemy(enemy, damage) {
    if (!enemy || !enemies.includes(enemy)) return false;
    if (enemy.userData.isDying) return false;

    enemy.userData.health -= damage;
    flashEnemy(enemy);

    if (enemy.userData.health <= 0) {
      enemy.userData.isDying = true;

      if (enemy.userData.currentAction) {
        enemy.userData.currentAction.fadeOut(0.05);
      }

      const deathAction = enemy.userData.actions["death"];

      if (deathAction) {
        const deathSound = enemy.userData.type.asset.deathSound || enemy.userData.type.asset.attackSound;

        if (deathSound) {
          playAssetSound(deathSound, 1.0);
        }

        deathAction.reset();
        deathAction.clampWhenFinished = true;
        deathAction.setLoop(THREE.LoopOnce, 1);
        deathAction.play();

        enemy.userData.deathTimer = deathAction.getClip().duration;
      } else {
        removeEnemy(enemy);
        return true;
      }

      return true;
    }

    return false;
  }

  function flashEnemy(enemy) {
    enemy.traverse(object => {
      if (!object.material) return;

      const materials = Array.isArray(object.material) ? object.material : [object.material];

      materials.forEach(material => {
        if (!material.color) return;

        if (material.userData.hitFlashColor === undefined) {
          material.userData.hitFlashColor = material.color.getHex();
        }

        material.color.setHex(0xff3333);

        clearTimeout(material.userData.hitFlashTimer);
        material.userData.hitFlashTimer = setTimeout(() => {
          if (material.color && material.userData.hitFlashColor !== undefined) {
            material.color.setHex(material.userData.hitFlashColor);
          }
        }, 90);
      });
    });
  }

  function findEnemyRoot(object) {
    let current = object;

    while (current && !enemies.includes(current)) {
      current = current.parent;
    }

    return current;
  }

  function removeEnemy(enemy) {
    scene.remove(enemy);
    disposeObject(enemy);

    const index = enemies.indexOf(enemy);
    if (index !== -1) enemies.splice(index, 1);
  }

  function disposeObject(root) {
    root.traverse(object => {
      if (object.geometry) object.geometry.dispose();

      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }


  function playAssetSound(src, volume = 1.0) {
    if (!src) return;

    const cached = audioCache.get(src);
    const audio = cached?.audio ? cached.audio.cloneNode(true) : new Audio(src);

    audio.volume = volume;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  function reset() {
    while (enemies.length) removeEnemy(enemies[0]);
  }

  return {
    preloadAll,
    spawnWave,
    update,
    getHit,
    damageEnemy,
    reset,
    get count() {
      return enemies.filter(enemy => !enemy.userData.isDying).length;
    }
  };
}
