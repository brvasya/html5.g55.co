import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { MAP_GLB_BASE64 } from "../../assets/world/map.js";

export function createWorld({ THREE, scene }) {
  const colliders = [];
  const tracers = [];
  const floorObjects = [];
  const skyObjects = [];

  const SKY_COLOR_TOP = 0x6fb8ff;
  const SKY_COLOR_MID = 0xa8d8ff;
  const SKY_COLOR_HORIZON = 0xd8f0ff;
  const FOG_COLOR = 0xd8f0ff;
  const CLOUD_COLOR = 0xffffff;
  const SUN_COLOR = 0xfff4b0;
  const SUN_GLOW_COLOR = 0xffe7a0;

  createDaytimeSky();

  function resetPlayer(player) {
    if (!world.isLoaded || !world.spawn) return;

    player.reset({
      position: world.spawn.clone(),
      yaw: 0
    });
  }

  const world = {
    map: null,
    colliders,
    tracers,
    floorObjects,
    skyObjects,
    isLoaded: false,
    spawn: null,
    spawnObjectName: "G55START001",
    floorObjectPrefixes: ["G55FLR", "G55OUT0"],
    ready: null,
    addBox,
    resetPlayer,
    getRandomFloorPoint
  };

  world.ready = loadMap();

  function loadMap() {
    return new Promise(resolve => {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);

      loader.load(
        MAP_GLB_BASE64.model,
        gltf => {
          const map = gltf.scene;
          const mapScale = MAP_GLB_BASE64.scale;

          map.scale.set(mapScale[0], mapScale[1], mapScale[2]);

          map.traverse(object => {
            if (!object.isMesh) return;

            object.castShadow = true;
            object.receiveShadow = true;
            object.frustumCulled = false;

            makeMaterialCrisp(object.material);
            colliders.push(object);

            if (isFloorMesh(object)) {
              floorObjects.push(object);
            }
          });

          scene.add(map);

          world.map = map;
          world.isLoaded = true;

          const spawnObject = findSpawnObject(map);

          if (spawnObject) {
            const raw = new THREE.Vector3();
            spawnObject.getWorldPosition(raw);
            world.spawn = raw.clone();
          } else {
            console.warn(`Spawn object ${world.spawnObjectName} not found`);
          }

          resolve(world);
        },
        undefined,
        error => {
          console.error("Map GLB failed to load", error);
          world.isLoaded = true;
          resolve(world);
        }
      );
    });
  }

  function createDaytimeSky() {
    scene.background = new THREE.Color(FOG_COLOR);
    scene.fog = new THREE.Fog(FOG_COLOR, 10, 100);

    createGradientSkyDome();
    createSquareSun();
    createClouds();
  }

  function createGradientSkyDome() {
    const radius = 1400;
    const geometry = new THREE.SphereGeometry(radius, 32, 16);
    const colors = [];
    const topColor = new THREE.Color(SKY_COLOR_TOP);
    const midColor = new THREE.Color(SKY_COLOR_MID);
    const horizonColor = new THREE.Color(SKY_COLOR_HORIZON);
    const position = geometry.attributes.position;

    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      const t = THREE.MathUtils.clamp((y + radius * 0.15) / (radius * 1.15), 0, 1);
      const color = new THREE.Color();

      if (t < 0.45) {
        color.copy(horizonColor).lerp(midColor, t / 0.45);
      } else {
        color.copy(midColor).lerp(topColor, (t - 0.45) / 0.55);
      }

      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      vertexColors: true,
      depthWrite: false,
      fog: false
    });

    const skyDome = new THREE.Mesh(geometry, material);
    skyDome.name = "DaytimeGradientSky";
    skyDome.renderOrder = -1000;
    scene.add(skyDome);
    skyObjects.push(skyDome);
  }

  function createSquareSun() {
    const sunGroup = new THREE.Group();
    sunGroup.name = "SquareSun";
    sunGroup.position.set(160, 185, -320);
    sunGroup.lookAt(0, 40, 0);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(82, 82),
      new THREE.MeshBasicMaterial({
        color: SUN_GLOW_COLOR,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        fog: false
      })
    );
    glow.name = "SquareSunGlow";
    glow.renderOrder = -900;
    sunGroup.add(glow);

    const sun = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 42),
      new THREE.MeshBasicMaterial({
        color: SUN_COLOR,
        depthWrite: false,
        fog: false
      })
    );
    sun.name = "SquareSunCore";
    sun.position.z = 0.1;
    sun.renderOrder = -899;
    sunGroup.add(sun);

    scene.add(sunGroup);
    skyObjects.push(sunGroup);
  }

  function createClouds() {
    const cloudMaterial = new THREE.MeshBasicMaterial({
      color: CLOUD_COLOR,
      fog: true
    });

    const cloudCount = 42;
    const ringCount = 3;
    const cloudsPerRing = Math.ceil(cloudCount / ringCount);
    const ringDistances = [140, 230, 320];
    const sunAvoidPosition = new THREE.Vector3(160, 185, -320);
    const sunAvoidRadius = 95;

    for (let i = 0; i < cloudCount; i++) {
      const cloud = new THREE.Group();
      cloud.name = `BlockCloud${i + 1}`;

      const ringIndex = i % ringCount;
      const indexInRing = Math.floor(i / ringCount);
      const ringOffset = ringIndex * ((Math.PI * 2) / (cloudsPerRing * ringCount));
      const angle = (indexInRing / cloudsPerRing) * Math.PI * 2 + ringOffset;
      const distance = ringDistances[ringIndex] + THREE.MathUtils.randFloatSpread(34);
      let x = Math.cos(angle) * distance;
      let z = Math.sin(angle) * distance;
      let y = THREE.MathUtils.randFloat(62, 110);

      const cloudPosition = new THREE.Vector3(x, y, z);
      const distanceFromSun = cloudPosition.distanceTo(sunAvoidPosition);

      if (distanceFromSun < sunAvoidRadius) {
        const pushDirection = cloudPosition.clone().sub(sunAvoidPosition).normalize();
        const pushAmount = sunAvoidRadius - distanceFromSun + THREE.MathUtils.randFloat(18, 42);
        cloudPosition.addScaledVector(pushDirection, pushAmount);
        x = cloudPosition.x;
        y = cloudPosition.y;
        z = cloudPosition.z;
      }

      x += THREE.MathUtils.randFloatSpread(12);
      z += THREE.MathUtils.randFloatSpread(12);

      cloud.position.set(x, y, z);
      cloud.rotation.y = THREE.MathUtils.randFloat(0, Math.PI * 2);

      const blockCount = THREE.MathUtils.randInt(6, 11);
      const baseSize = THREE.MathUtils.randFloat(4.5, 7.5);

      for (let b = 0; b < blockCount; b++) {
        const sx = baseSize * THREE.MathUtils.randFloat(1.4, 3.2);
        const sy = baseSize * THREE.MathUtils.randFloat(0.35, 0.65);
        const sz = baseSize * THREE.MathUtils.randFloat(0.9, 1.7);

        const block = new THREE.Mesh(
          new THREE.BoxGeometry(sx, sy, sz),
          cloudMaterial
        );

        block.name = `CloudBlock${b + 1}`;
        block.position.set(
          THREE.MathUtils.randFloatSpread(baseSize * 6),
          THREE.MathUtils.randFloatSpread(baseSize * 0.45),
          THREE.MathUtils.randFloatSpread(baseSize * 3)
        );
        block.castShadow = false;
        block.receiveShadow = false;
        block.frustumCulled = false;
        cloud.add(block);
      }

      scene.add(cloud);
      skyObjects.push(cloud);
    }
  }

  function getRandomFloorPoint(maxTries = 20) {
    if (!floorObjects.length) return null;

    for (let i = 0; i < maxTries; i++) {
      const mesh = floorObjects[Math.floor(Math.random() * floorObjects.length)];

      mesh.updateWorldMatrix(true, false);

      if (!mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox();
      }

      const box = mesh.geometry.boundingBox.clone();
      box.applyMatrix4(mesh.matrixWorld);

      const x = THREE.MathUtils.lerp(box.min.x, box.max.x, Math.random());
      const z = THREE.MathUtils.lerp(box.min.z, box.max.z, Math.random());

      const rayOrigin = new THREE.Vector3(x, box.max.y + 50, z);
      const rayDirection = new THREE.Vector3(0, -1, 0);

      const raycaster = new THREE.Raycaster(rayOrigin, rayDirection, 0, 200);
      const hits = raycaster.intersectObject(mesh, true);

      if (hits.length) {
        return hits[0].point.clone();
      }
    }

    return null;
  }

  function isFloorMesh(object) {
    const prefixes = Array.isArray(world.floorObjectPrefixes)
      ? world.floorObjectPrefixes
      : [world.floorObjectPrefixes];

    let current = object;

    while (current) {
      const name = (current.name || "").trim().toLowerCase();

      for (let i = 0; i < prefixes.length; i++) {
        const prefix = prefixes[i].toLowerCase();

        if (name.startsWith(prefix)) {
          return true;
        }
      }

      current = current.parent;
    }

    return false;
  }

  function findSpawnObject(root) {
    let found = null;
    const targetName = world.spawnObjectName.toLowerCase();

    root.traverse(object => {
      if (found) return;

      const name = (object.name || "").trim().toLowerCase();

      if (name === targetName) {
        found = object;
      }
    });

    return found;
  }

  function makeMaterialCrisp(material) {
    if (!material) return;

    const materials = Array.isArray(material) ? material : [material];

    materials.forEach(mat => {
      if (!mat) return;

      [
        mat.map,
        mat.normalMap,
        mat.roughnessMap,
        mat.metalnessMap,
        mat.emissiveMap,
        mat.aoMap
      ]
        .filter(Boolean)
        .forEach(texture => {
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.generateMipmaps = false;
          texture.needsUpdate = true;
        });
    });
  }

  function addBox(x, y, z, sx, sy, sz, color, isCollider = false) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    if (isCollider) colliders.push(mesh);

    return mesh;
  }

  return world;
}
