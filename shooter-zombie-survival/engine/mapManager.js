export function resolveMapConfig(config) {
  if (!Array.isArray(config?.items) || !config.items.length) {
    throw new Error("GAME_CONFIG.maps.items must contain at least one map.");
  }
  const ids = new Set();
  const items = config.items.map(item => {
    if (typeof item?.id !== "string" || !item.id.trim() || ids.has(item.id) ||
        typeof item.name !== "string" || !item.name.trim() || typeof item.load !== "function") {
      throw new Error("Each map needs a unique id, a name, and a load function.");
    }
    ids.add(item.id);
    return { id: item.id, name: item.name, load: item.load };
  });
  return {
    items,
    defaultId: ids.has(config.defaultId) ? config.defaultId : items[0].id,
    rememberSelection: config.rememberSelection !== false
  };
}

export function createMapWorld({ THREE, scene, maps, mapId }) {
  const config = resolveMapConfig(maps);
  const definitions = new Map(config.items.map(item => [item.id, item]));
  const initialId = definitions.has(mapId) ? mapId : config.defaultId;
  // Gameplay systems retain these arrays and this navigation object across maps.
  const colliders = [], floorObjects = [], skyObjects = [], tracers = [];
  let active = null, loading = false;
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
    mapIds: Object.freeze([...definitions.keys()]),
    get mapId() { return active?.id ?? initialId; },
    get map() { return active?.world.map; },
    get spawn() { return active?.world.spawn; },
    get lighting() { return active?.world.lighting; },
    get isLoaded() { return Boolean(active?.world.isLoaded); },
    get isLoading() { return loading; },
    ready: null,
    selectMap,
    resetPlayer: player => active.world.resetPlayer(player),
    getRandomFloorPoint: () => active.world.getRandomFloorPoint(),
    update: (delta, camera) => active.world.update?.(delta, camera)
  };

  world.ready = selectMap(initialId).then(() => world);
  return world;

  async function selectMap(id) {
    if (!definitions.has(id)) throw new Error(`Unknown map: ${id}`);
    if (loading) throw new Error("A map is already loading.");
    if (active?.id === id) return false;
    loading = true;
    try {
      const module = await definitions.get(id).load();
      if (typeof module?.createWorld !== "function") {
        throw new Error(`Map ${id} must export createWorld({ THREE, scene }).`);
      }
      const previousChildren = new Set(scene.children);
      const previousBackground = scene.background, previousFog = scene.fog;
      let next;
      try {
        next = module.createWorld({ THREE, scene });
        await next?.ready;
        if (!next?.map?.isObject3D || !next.isLoaded || !next.spawn?.isVector3 ||
            !Array.isArray(next.colliders) || !Array.isArray(next.floorObjects) ||
            !Array.isArray(next.skyObjects) || typeof next.resetPlayer !== "function" ||
            typeof next.getRandomFloorPoint !== "function" ||
            ["updateTarget", "getMoveTarget", "getSpawnPoint", "hasLineOfSight", "isWalkable"]
              .some(method => typeof next.navigation?.[method] !== "function")) {
          throw new Error(`Map ${id} does not provide the existing world interface.`);
        }
        // Own shadow uniforms with the map so disposed textures stay released.
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
    } finally {
      loading = false;
    }
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
