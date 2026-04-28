import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { MAP_GLB_BASE64 } from "../../assets/world/map.js";

export function createWorld({ THREE, scene }) {
  const colliders = [];
  const tracers = [];
  const floorObjects = [];

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