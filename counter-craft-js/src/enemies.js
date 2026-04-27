import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { ZOMBIE } from "../assets/zombie.js";

const ENEMY_TYPES = {
  zombie: {
    asset: ZOMBIE
  }
};

const DEFAULT_ENEMY_TYPE = "zombie";

export function createEnemies({ THREE, scene, camera, config, state }) {
  const enemies = [];
  const raycaster = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  const toPlayer = new THREE.Vector3();

  const modelCache = new Map();

  preloadEnemyType(DEFAULT_ENEMY_TYPE);

  function preloadEnemyType(typeId) {
    const type = getEnemyType(typeId);
    const asset = type.asset;

    if (!asset || !asset.model) return;

    let cached = modelCache.get(typeId);
    if (cached) return;

    cached = {
      source: null,
      animations: [],
      loading: true,
      failed: false
    };

    modelCache.set(typeId, cached);

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    loader.load(
      asset.model,
      gltf => {
        cached.source = gltf.scene;
        cached.animations = gltf.animations || [];
        cached.loading = false;

        cached.source.traverse(object => {
          if (!object.isMesh) return;

          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = false;

          if (object.material) makeMaterialCrisp(object.material);
        });

        enemies.forEach(enemy => {
          if (enemy.userData.typeId === typeId && !enemy.userData.model) {
            attachEnemyModel(enemy);
          }
        });
      },
      undefined,
      () => {
        cached.loading = false;
        cached.failed = true;
      }
    );
  }

  function getEnemyType(typeId) {
    return ENEMY_TYPES[typeId] || ENEMY_TYPES[DEFAULT_ENEMY_TYPE];
  }

  function chooseEnemyTypeForWave() {
    return DEFAULT_ENEMY_TYPE;
  }

  function spawnWave(wave) {
    const count = Math.min(4 + wave, 14);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 12 + Math.random() * 7;

      createEnemy(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        wave,
        chooseEnemyTypeForWave(wave)
      );
    }
  }

  function createEnemy(x, z, wave, typeId = DEFAULT_ENEMY_TYPE) {
    const type = getEnemyType(typeId);

    const group = new THREE.Group();
    group.position.set(x, 0, z);

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
      fallback: null
    };

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

    // Important: cloned GLB meshes can still share material instances.
    // Clone materials per enemy so hit flash affects only this enemy.
    model.traverse(object => {
      if (!object.isMesh || !object.material) return;

      if (Array.isArray(object.material)) {
        object.material = object.material.map(material => material.clone());
      } else {
        object.material = object.material.clone();
      }

      makeMaterialCrisp(object.material);
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

      // derive attack duration from animation clip
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
      enemy.lookAt(playerPosition.x, enemy.position.y, playerPosition.z);

      if (distance > enemy.userData.attackDistance) {
        // DO NOT move while attacking
        if (!enemy.userData.isAttacking) {
          toPlayer.normalize();
          enemy.position.add(toPlayer.multiplyScalar((enemy.userData.speed + state.wave * 0.08) * delta));
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

      // apply delayed damage
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

    // already dying
    if (enemy.userData.isDying) return false;

    enemy.userData.health -= damage;
    flashEnemy(enemy);

    if (enemy.userData.health <= 0) {
      enemy.userData.isDying = true;

      // stop all actions
      if (enemy.userData.currentAction) {
        enemy.userData.currentAction.fadeOut(0.05);
      }

      // play death animation if exists
      const deathAction = enemy.userData.actions["death"];

      if (deathAction) {
        if (enemy.userData.type.asset.attackSound) {
          playAssetSound(enemy.userData.type.asset.attackSound, 1.0);
        }
        deathAction.reset();
        deathAction.clampWhenFinished = true;
        deathAction.setLoop(THREE.LoopOnce, 1);
        deathAction.play();

        enemy.userData.deathTimer = deathAction.getClip().duration;
      } else {
        // fallback instant remove if no animation
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
      if (object.material) object.material.dispose();
    });
  }

  function makeMaterialCrisp(material) {
    if (!material.map) return;

    material.map.magFilter = THREE.NearestFilter;
    material.map.minFilter = THREE.NearestFilter;
    material.map.needsUpdate = true;
  }

  function playAssetSound(src, volume = 1.0) {
    if (!src) return;

    const audio = new Audio(src);
    audio.volume = volume;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  function reset() {
    while (enemies.length) removeEnemy(enemies[0]);
  }

  return {
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
