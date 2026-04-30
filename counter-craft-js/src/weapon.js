import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { makeMaterialCrisp } from "./materials.js";
import { AK47 } from "../../assets/weapon/ak47.js";
import { P90 } from "../../assets/weapon/p90.js";

export function createWeaponSystem({ THREE, weaponScene, weaponCamera, weaponConfig = AK47, playerVelocity }) {
  const slots = createSlots(weaponConfig);

  const settings = {
    bobAmount: 0.018,
    bobSpeed: 10.5,
    swayAmount: 0.00085,
    swayMax: 0.035,
    tiltAmount: 0.045,
    lagAmount: 0.08,
    recoilKick: 0.075,
    recoilRotation: 0.12,
    returnSpeed: 12,
    motionBlend: 18
  };

  let currentSlotIndex = 0;
  let lastShotTime = 0;
  let isReloading = false;

  const rig = new THREE.Group();
  const modelCache = new Map();
  const audioCache = new Map();

  const muzzleFlashTexture = createMuzzleFlashTexture();

  const muzzleFlashMesh = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: muzzleFlashTexture,
      color: 0xffdd66,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    })
  );
  muzzleFlashMesh.renderOrder = 9999;
  muzzleFlashMesh.scale.set(0.28, 0.28, 1);
  rig.add(muzzleFlashMesh);

  const actions = new Map();
  const targetPosition = new THREE.Vector3();
  const targetRotation = new THREE.Euler();
  const shellGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.07, 8);
  const shellMaterial = new THREE.MeshBasicMaterial({ color: 0xc89b3c });
  const shells = [];
  const tempShellPosition = new THREE.Vector3();

  let model = null;
  let mixer = null;
  let activeAction = null;
  let returnTimer = null;
  let reloadTimer = null;
  let recoil = 0;
  let bobTime = 0;
  let swayX = 0;
  let swayY = 0;
  let currentState = "idle";
  let currentStateTime = 0;
  let flashIntensity = 0;
  const flashMaterials = new Set();

  rig.name = "FirstPersonWeaponRig";
  resetRigTransform();
  weaponScene.add(rig);

  preloadWeaponAsset(currentModelConfig()).then(() => {
    attachCurrentModel();
    play("idle");
  });

  function createMuzzleFlashTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.18, "rgba(255,230,120,0.95)");
    gradient.addColorStop(0.45, "rgba(255,130,0,0.55)");
    gradient.addColorStop(1, "rgba(255,130,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
  }

  function getNameFromConfig(config, fallback) {
    if (!config) return fallback;
    return (config.name || config.id || fallback).toString().toUpperCase();
  }

  function getBehaviorFromAsset(asset) {
    const behavior = asset.behavior;
    return {
      magazineSize: behavior.magazineSize,
      reserveAmmo: behavior.reserveAmmo,
      damage: behavior.damage,
      fireCooldownMs: behavior.fireCooldownMs,
      spread: behavior.spread,
      pellets: behavior.pellets ?? 1
    };
  }

  function getPriceFromAsset(asset, fallbackPrice) {
    const rawPrice = asset?.price ?? asset?.cost ?? asset?.shop?.price ?? fallbackPrice;
    return Math.max(0, Number(rawPrice) || 0);
  }

  function makeSlot(id, asset, options = {}) {
    const behavior = getBehaviorFromAsset(asset);
    const owned = Boolean(options.owned);
    const price = getPriceFromAsset(asset, options.price ?? 0);

    return {
      id,
      asset,
      name: getNameFromConfig(asset, `SLOT ${id}`),
      price,
      owned,
      defaultOwned: owned,
      magazineSize: behavior.magazineSize,
      ammo: behavior.magazineSize,
      reserveAmmo: behavior.reserveAmmo,
      defaultReserveAmmo: behavior.reserveAmmo,
      damage: behavior.damage,
      fireCooldownMs: behavior.fireCooldownMs,
      spread: behavior.spread,
      pellets: behavior.pellets
    };
  }

  function createSlots(fallbackAsset) {
    return [
      makeSlot(1, AK47, { owned: true, price: 0 }),
      makeSlot(2, P90, { price: 0 }),
      makeSlot(3, fallbackAsset, { price: 0 }),
      makeSlot(4, fallbackAsset, { price: 0 }),
      makeSlot(5, fallbackAsset, { price: 0 }),
      makeSlot(6, fallbackAsset, { price: 0 }),
      makeSlot(7, fallbackAsset, { price: 0 }),
      makeSlot(8, fallbackAsset, { price: 0 }),
      makeSlot(9, fallbackAsset, { price: 0 })
    ];
  }

  function currentSlot() {
    return slots[currentSlotIndex];
  }

  function currentModelConfig() {
    return currentSlot().asset;
  }

  function getAssetCacheKey(asset) {
    if (!asset) return "empty";
    return asset.id || asset.name || asset.model || "inline-weapon";
  }

  function preloadAll() {
    const tasks = [];
    const seenAssets = new Set();

    slots.forEach(slot => {
      const asset = slot.asset;
      const key = getAssetCacheKey(asset);

      if (seenAssets.has(key)) return;
      seenAssets.add(key);

      tasks.push(preloadWeaponAsset(asset));

      if (asset?.fireSound) tasks.push(preloadSound(asset.fireSound));
      if (asset?.shootSound) tasks.push(preloadSound(asset.shootSound));
      if (asset?.reloadSound) tasks.push(preloadSound(asset.reloadSound));
    });

    return Promise.all(tasks).then(() => {
      attachCurrentModel();
      play("idle");
    });
  }

  function preloadWeaponAsset(asset) {
    if (!asset || !asset.model) return Promise.resolve(null);

    const key = getAssetCacheKey(asset);
    let cached = modelCache.get(key);

    if (cached?.promise) return cached.promise;
    if (cached?.source || cached?.failed) return Promise.resolve(cached);

    cached = {
      source: null,
      animations: [],
      loading: true,
      failed: false,
      promise: null
    };

    modelCache.set(key, cached);

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
            object.frustumCulled = false;
            object.castShadow = false;
            object.receiveShadow = false;
            makeMaterialCrisp(THREE, object.material);
          });

          resolve(cached);
        },
        undefined,
        error => {
          cached.loading = false;
          cached.failed = true;
          console.warn("Weapon model failed to preload:", key, error);
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

  function switchSlot(slotNumber) {
    const index = slotNumber - 1;
    const slot = slots[index];

    if (!slot || !slot.owned || index === currentSlotIndex || isReloading) return false;

    currentSlotIndex = index;
    lastShotTime = 0;
    recoil = 0;

    attachCurrentModel();
    play("idle");

    return true;
  }

  function buySlot(slotNumber) {
    const index = slotNumber - 1;
    const slot = slots[index];

    if (!slot) return { ok: false, reason: "missing" };
    if (slot.owned) return { ok: false, reason: "owned", slot: getSlotShopState(slot) };

    slot.owned = true;
    slot.ammo = slot.magazineSize;
    slot.reserveAmmo = slot.defaultReserveAmmo;

    return { ok: true, slot: getSlotShopState(slot) };
  }

  function resetSlots() {
    slots.forEach(slot => {
      slot.owned = slot.defaultOwned;
      slot.ammo = slot.magazineSize;
      slot.reserveAmmo = slot.defaultReserveAmmo;
    });

    currentSlotIndex = 0;
    lastShotTime = 0;
    isReloading = false;
    clearTimeout(reloadTimer);
    attachCurrentModel();
    play("idle");
  }

  function shoot() {
    const slot = currentSlot();
    const now = performance.now();

    if (isReloading) return { ok: false, reason: "reloading" };
    if (now - lastShotTime < slot.fireCooldownMs) return { ok: false, reason: "cooldown" };
    if (slot.ammo <= 0) return { ok: false, reason: "empty" };

    lastShotTime = now;
    updateMuzzleFlashTransform();
    flashIntensity = getMuzzleFlashConfig().intensity;
    ejectShell();
    slot.ammo -= 1;
    play("shoot");
    addRecoil();

    return {
      ok: true,
      slot: slot.id,
      weaponName: slot.name,
      damage: slot.damage,
      spread: slot.spread,
      pellets: slot.pellets,
      ammo: slot.ammo,
      reserveAmmo: slot.reserveAmmo
    };
  }

  function reload() {
    const slot = currentSlot();
    if (isReloading || slot.ammo === slot.magazineSize || slot.reserveAmmo <= 0) {
      return { started: false, duration: 0 };
    }

    isReloading = true;
    const duration = play("reload");

    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      const needed = slot.magazineSize - slot.ammo;
      const loaded = Math.min(needed, slot.reserveAmmo);
      slot.ammo += loaded;
      slot.reserveAmmo -= loaded;
      isReloading = false;
      play("idle");
    }, duration);

    return { started: true, duration };
  }

  function addReserveAmmo(amount) {
    const slot = currentSlot();
    if (slot.id !== 9) slot.reserveAmmo += amount;
  }

  function getCurrentAsset() {
    return currentSlot().asset ?? null;
  }

  function getHudState() {
    const slot = currentSlot();
    return {
      weaponSlot: slot.id,
      weaponName: slot.name,
      ammo: slot.ammo,
      reserveAmmo: slot.reserveAmmo,
      isReloading
    };
  }

  function getSlotShopState(slot) {
    return {
      id: slot.id,
      name: slot.name,
      price: slot.price,
      owned: slot.owned,
      active: slot.id === currentSlot().id,
      ammo: slot.ammo,
      reserveAmmo: slot.reserveAmmo,
      damage: slot.damage,
      magazineSize: slot.magazineSize,
      fireCooldownMs: slot.fireCooldownMs,
      spread: slot.spread,
      pellets: slot.pellets
    };
  }

  function getShopState() {
    return slots.map(getSlotShopState);
  }

  function attachCurrentModel() {
    const config = currentModelConfig();

    if (!config.model) {
      clearModel();
      return;
    }

    const key = getAssetCacheKey(config);
    const cached = modelCache.get(key);

    if (!cached || !cached.source) {
      clearModel();
      preloadWeaponAsset(config).then(() => {
        if (currentModelConfig() === config) {
          attachCurrentModel();
          play("idle");
        }
      });
      return;
    }

    clearModel();

    model = SkeletonUtils.clone(cached.source);
    model.name = "WeaponGLB";

    model.traverse(object => {
      if (!object.isMesh) return;

      object.frustumCulled = false;
      object.castShadow = false;
      object.receiveShadow = false;

      if (Array.isArray(object.material)) {
        object.material = object.material.map(material => material.clone());
      } else if (object.material) {
        object.material = object.material.clone();
      }

      makeMaterialCrisp(THREE, object.material);
      registerFlashMaterial(object.material);
    });

    rig.add(model);
    resetRigTransform();
    setupAnimations(cached.animations);
  }

  function clearModel() {
    if (model) {
      rig.remove(model);
      disposeModel(model);
    }

    model = null;
    mixer = null;
    activeAction = null;
    actions.clear();
    flashMaterials.clear();
    clearTimeout(returnTimer);
  }

  function disposeModel(root) {
    root.traverse(object => {
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }

  function setupAnimations(clips) {
    const config = currentModelConfig();
    if (!clips.length || !config.anim) return;

    mixer = new THREE.AnimationMixer(model);
    const baseClip = clips[0];
    const fps = 30;

    Object.entries(config.anim).forEach(([name, [start, end, loop]]) => {
      const clip = THREE.AnimationUtils.subclip(baseClip, name, start, end, fps);
      const action = mixer.clipAction(clip);
      action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      action.clampWhenFinished = !loop;
      actions.set(name, action);
    });
  }

  function play(name) {
    currentState = name;
    currentStateTime = 0;

    const action = actions.get(name);
    if (!action) return getDuration(name);

    clearTimeout(returnTimer);
    if (activeAction && activeAction !== action) activeAction.fadeOut(0.06);

    const config = currentModelConfig();
    const loop = config.anim?.[name]?.[2] ?? false;
    action.reset();
    action.enabled = true;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.fadeIn(0.04).play();
    activeAction = action;

    const duration = action.getClip().duration * 1000;
    if (!loop) returnTimer = setTimeout(() => play("idle"), duration);

    return duration;
  }

  function getDuration(name) {
    const action = actions.get(name);
    if (action) return action.getClip().duration * 1000;

    const config = currentModelConfig();
    const range = config.anim?.[name];
    if (!range) return 300;

    const [start, end] = range;
    return Math.max(80, ((end - start) / 30) * 1000);
  }

  function addRecoil() {
    recoil = Math.min(1, recoil + 1);
  }

  function update(delta, isPlaying, inputState) {
    if (flashIntensity > 0.01) {
      const flash = getMuzzleFlashConfig();

      applyMuzzleIllumination(flashIntensity, flash.color);

      const opacity = Math.min(1, flashIntensity / 10);
      muzzleFlashMesh.material.opacity = opacity;

      const flashScale = flash.worldScale + flashIntensity * flash.worldScaleBoost;
      muzzleFlashMesh.scale.set(flashScale, flashScale, 1);

      flashIntensity = THREE.MathUtils.lerp(flashIntensity, 0, 1 - Math.exp(-30 * delta));
    } else {
      flashIntensity = 0;
      muzzleFlashMesh.material.opacity = 0;
      applyMuzzleIllumination(0);
    }

    updateShells(delta);
    if (mixer) mixer.update(delta);

    currentStateTime += delta;
    recoil = THREE.MathUtils.lerp(recoil, 0, 1 - Math.exp(-settings.returnSpeed * delta));

    const horizontalSpeed = Math.hypot(playerVelocity.x, playerVelocity.z);
    const moveFactor = Math.min(horizontalSpeed / 8.5, 1);
    const moving = Boolean(inputState?.moving && isPlaying);
    const walking = Boolean(inputState?.walking);

    if (moving && inputState?.grounded) bobTime += delta * settings.bobSpeed * (walking ? 0.72 : 1);
    else bobTime = THREE.MathUtils.lerp(bobTime, 0, 1 - Math.exp(-8 * delta));

    const swayTargetX = THREE.MathUtils.clamp(-(inputState?.mouseDeltaX ?? 0) * settings.swayAmount, -settings.swayMax, settings.swayMax);
    const swayTargetY = THREE.MathUtils.clamp(-(inputState?.mouseDeltaY ?? 0) * settings.swayAmount, -settings.swayMax, settings.swayMax);

    swayX = THREE.MathUtils.lerp(swayX, swayTargetX, 1 - Math.exp(-18 * delta));
    swayY = THREE.MathUtils.lerp(swayY, swayTargetY, 1 - Math.exp(-18 * delta));

    applyMotion(delta, moveFactor, inputState);
  }

  function applyMotion(delta, moveFactor, inputState) {
    getBasePosition(targetPosition);
    getBaseRotation(targetRotation);

    const bobX = Math.sin(bobTime) * settings.bobAmount * moveFactor;
    const bobY = Math.abs(Math.cos(bobTime * 2)) * settings.bobAmount * moveFactor;
    const lag = THREE.MathUtils.clamp(Math.hypot(playerVelocity.x, playerVelocity.z) / 8.5, 0, 1) * settings.lagAmount;
    const strafeTilt = THREE.MathUtils.clamp(playerVelocity.x / 8.5, -1, 1) * settings.tiltAmount * moveFactor;

    targetPosition.x += bobX + swayX;
    targetPosition.y += bobY + swayY - recoil * settings.recoilKick;
    targetPosition.z += lag + recoil * 0.04;

    targetRotation.x += recoil * settings.recoilRotation;
    targetRotation.y += swayX * 0.55;
    targetRotation.z += strafeTilt + swayX * 0.4;

    if (currentState === "reload") {
      const reloadDuration = Math.max(getDuration("reload") / 1000, 0.001);
      const k = Math.sin(Math.min(currentStateTime / reloadDuration, 1) * Math.PI);
      targetPosition.y -= 0.06 * k;
      targetRotation.z += 0.12 * k;
    }

    const blend = 1 - Math.exp(-settings.motionBlend * delta);
    rig.position.lerp(targetPosition, blend);
    rig.rotation.x = THREE.MathUtils.lerp(rig.rotation.x, targetRotation.x, blend);
    rig.rotation.y = THREE.MathUtils.lerp(rig.rotation.y, targetRotation.y, blend);
    rig.rotation.z = THREE.MathUtils.lerp(rig.rotation.z, targetRotation.z, blend);
  }

  function resetRigTransform() {
    getBasePosition(targetPosition);
    getBaseRotation(targetRotation);
    rig.position.copy(targetPosition);
    rig.rotation.copy(targetRotation);
    const view = getCurrentView();
    const scl = view.scl;
    rig.scale.set(
      scl[0],
      scl[1],
      scl[2]
    );
  }

  function getShellEjectConfig() {
    const config = currentModelConfig();
    const shell = config.shellEject ?? {};
    const isArray = Array.isArray(shell);

    return {
      offset: isArray ? shell : (shell.offset ?? [0.18, -0.02, -0.35]),
      velocity: isArray ? [1.7, 0.75, 0.25] : (shell.velocity ?? [1.7, 0.75, 0.25]),
      gravity: isArray ? 2.8 : (shell.gravity ?? 2.8),
      life: isArray ? 2.2 : (shell.life ?? 2.2),
      spin: isArray ? 18 : (shell.spin ?? 18),
      scale: isArray ? 1 : (shell.scale ?? 1)
    };
  }

  function ejectShell() {
    const shellConfig = getShellEjectConfig();
    const shell = new THREE.Mesh(shellGeometry, shellMaterial.clone());
    shell.material.transparent = true;
    shell.material.opacity = 1;

    tempShellPosition.set(...shellConfig.offset);
    rig.localToWorld(tempShellPosition);
    shell.position.copy(tempShellPosition);
    shell.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    shell.scale.setScalar(shellConfig.scale);
    shell.userData.velocity = new THREE.Vector3(...shellConfig.velocity);
    shell.userData.life = shellConfig.life;
    shell.userData.maxLife = shellConfig.life;
    shell.userData.gravity = shellConfig.gravity;
    shell.userData.spin = shellConfig.spin;

    weaponScene.add(shell);
    shells.push(shell);
  }

  function updateShells(delta) {
    for (let i = shells.length - 1; i >= 0; i--) {
      const shell = shells[i];
      shell.userData.life -= delta;
      shell.userData.velocity.y -= shell.userData.gravity * delta;
      shell.position.addScaledVector(shell.userData.velocity, delta);
      shell.rotation.x += shell.userData.spin * delta;
      shell.rotation.z += shell.userData.spin * 0.55 * delta;

      const fadeStart = shell.userData.maxLife * 0.35;
      const alpha = shell.userData.life > fadeStart ? 1 : Math.max(0, shell.userData.life / fadeStart);
      shell.material.opacity = alpha;

      if (shell.userData.life <= 0) {
        weaponScene.remove(shell);
        shell.material.dispose();
        shells.splice(i, 1);
      }
    }
  }

  function getMuzzleFlashConfig() {
    const config = currentModelConfig();
    const flash = config.muzzleFlash ?? {};
    const isArray = Array.isArray(flash);

    return {
      worldOffset: isArray ? flash : (flash.worldOffset ?? config.muzzleOffset ?? [0, 0.04, -0.55]),
      screenOffset: isArray ? [0, -0.13, -0.55] : (flash.screenOffset ?? [0, -0.13, -0.55]),
      worldScale: isArray ? 0.28 : (flash.worldScale ?? 0.28),
      screenScale: isArray ? 0.18 : (flash.screenScale ?? 0.18),
      worldScaleBoost: isArray ? 0.018 : (flash.worldScaleBoost ?? 0.018),
      screenScaleBoost: isArray ? 0.014 : (flash.screenScaleBoost ?? 0.014),
      intensity: isArray ? 10 : (flash.intensity ?? 10),
      color: isArray ? 0xffdd66 : (flash.color ?? 0xffdd66),
      lightColor: isArray ? 0xffdd88 : (flash.lightColor ?? 0xffdd88),
      lightDistance: isArray ? 12 : (flash.lightDistance ?? 12)
    };
  }

  function updateMuzzleFlashTransform() {
    const flash = getMuzzleFlashConfig();
    muzzleFlashMesh.position.set(...flash.worldOffset);
    muzzleFlashMesh.material.color.setHex(flash.color);
  }

  function getCurrentView() {
    const config = currentModelConfig();
    const assetView = config.view;

    return {
      posOffset: assetView.posOffset,
      rotOffset: assetView.rotOffset,
      scl: assetView.scl
    };
  }

  function getBasePosition(target) {
    const view = getCurrentView();
    return target.set(view.posOffset[0], view.posOffset[1], view.posOffset[2]);
  }

  function getBaseRotation(target) {
    const view = getCurrentView();
    return target.set(view.rotOffset[0], view.rotOffset[1], view.rotOffset[2]);
  }

  function registerFlashMaterial(material) {
    const materials = Array.isArray(material) ? material : [material];

    materials.forEach(item => {
      if (!item || !item.emissive) return;
      item.userData.baseEmissive = item.emissive.clone();
      item.userData.baseEmissiveIntensity = item.emissiveIntensity ?? 1;
      flashMaterials.add(item);
    });
  }

  function applyMuzzleIllumination(intensity, color = 0xffdd66) {
    const strength = Math.min(0.6, intensity * 0.06);

    flashMaterials.forEach(material => {
      if (!material.emissive) return;

      if (strength <= 0.01) {
        material.emissive.copy(material.userData.baseEmissive);
        material.emissiveIntensity = material.userData.baseEmissiveIntensity;
      } else {
        material.emissive.setHex(color);
        material.emissiveIntensity = strength;
      }

      material.needsUpdate = true;
    });
  }

  return {
    rig,
    preloadAll,
    play,
    update,
    shoot,
    reload,
    switchSlot,
    buySlot,
    resetSlots,
    addReserveAmmo,
    getHudState,
    getShopState,
    getCurrentAsset,
    addRecoil,
    getDuration
  };
}
