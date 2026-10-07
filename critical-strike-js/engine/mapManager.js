import { createWorld as createOffice } from "../assets/office.js";
import { createWorld as createAssault } from "../assets/assault.js";

const mapFactories = { office: createOffice, assault: createAssault };
export const MAP_IDS = Object.freeze(Object.keys(mapFactories));

export function createMapWorld({ THREE, scene, mapId = "office" }) {
  // Gameplay systems retain these arrays and this navigation object across maps.
  const colliders = [], floorObjects = [], skyObjects = [], tracers = [];
  let active = null;
  const navigation = {
    updateTarget: (...args) => active.world.navigation.updateTarget(...args),
    getMoveTarget: (...args) => active.world.navigation.getMoveTarget(...args),
    getSpawnPoint: (...args) => active.world.navigation.getSpawnPoint(...args),
    hasLineOfSight: (...args) => active.world.navigation.hasLineOfSight(...args),
    isWalkable: (...args) => active.world.navigation.isWalkable(...args),
    get grid() { return active.world.navigation.grid; }
  };
  const world = {
    colliders, floorObjects, skyObjects, tracers, navigation,
    get mapId() { return active.id; },
    get map() { return active.world.map; },
    get spawn() { return active.world.spawn; },
    get lighting() { return active.world.lighting; },
    get isLoaded() { return active.world.isLoaded; },
    ready: null,
    selectMap,
    resetPlayer: player => active.world.resetPlayer(player),
    getRandomFloorPoint: () => active.world.getRandomFloorPoint(),
    update: (delta, camera) => active.world.update?.(delta, camera)
  };

  selectMap(MAP_IDS.includes(mapId) ? mapId : "office");
  world.ready = Promise.resolve(world);
  return world;

  function selectMap(id) {
    if (!MAP_IDS.includes(id)) throw new Error(`Unknown map: ${id}`);
    if (active?.id === id) return false;

    const previousChildren = new Set(scene.children);
    const previousBackground = scene.background, previousFog = scene.fog;
    let next;
    try {
      next = mapFactories[id]({ THREE, scene });
      // Own the shadow material with the map, so cached shadow uniforms cannot
      // keep uploading textures after that map has been disposed.
      let depthMaterial;
      next.map.traverse(object => {
        if (!object.isMesh || !object.castShadow || object.customDepthMaterial) return;
        depthMaterial ||= new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        object.customDepthMaterial = depthMaterial;
      });
    } catch (error) {
      disposeNodes(scene.children.filter(node => !previousChildren.has(node)));
      scene.background = previousBackground;
      scene.fog = previousFog;
      throw error;
    }

    const nodes = scene.children.filter(node => !previousChildren.has(node));
    if (active) disposeNodes(active.nodes);
    disposeNodes(tracers);
    tracers.length = 0;
    active = { id, world: next, nodes };
    colliders.splice(0, colliders.length, ...next.colliders);
    floorObjects.splice(0, floorObjects.length, ...next.floorObjects);
    skyObjects.splice(0, skyObjects.length, ...next.skyObjects);
    return true;
  }

  function disposeNodes(nodes) {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    for (const root of nodes) {
      root.removeFromParent();
      root.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        const objectMaterials = [].concat(object.material || []);
        if (object.customDepthMaterial) objectMaterials.push(object.customDepthMaterial);
        if (object.customDistanceMaterial) objectMaterials.push(object.customDistanceMaterial);
        for (const material of objectMaterials) {
          materials.add(material);
          for (const value of Object.values(material)) {
            if (value?.isTexture) textures.add(value);
          }
        }
        if (object.isInstancedMesh || object.isLight) object.dispose?.();
      });
      root.clear();
    }
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
  }
}
