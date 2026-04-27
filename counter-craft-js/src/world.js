export function createWorld({ THREE, scene, config }) {
  const colliders = [];
  const tracers = [];

  buildArena();

  function buildArena() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(config.arenaSize, config.arenaSize),
      new THREE.MeshStandardMaterial({ color: 0x6b8f4e, roughness: 0.9 })
    );

    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    colliders.push(floor);

    addBox(0, 1.5, -config.arenaSize / 2, config.arenaSize, 3, 1, 0x5b5b5b, true);
    addBox(0, 1.5, config.arenaSize / 2, config.arenaSize, 3, 1, 0x5b5b5b, true);
    addBox(-config.arenaSize / 2, 1.5, 0, 1, 3, config.arenaSize, 0x5b5b5b, true);
    addBox(config.arenaSize / 2, 1.5, 0, 1, 3, config.arenaSize, 0x5b5b5b, true);

    addBox(-8, 0.75, -4, 3, 1.5, 3, 0x8b5a2b, true);
    addBox(7, 0.75, 5, 3, 1.5, 3, 0x8b5a2b, true);
    addBox(1, 0.75, -10, 5, 1.5, 2, 0x8b5a2b, true);
    addBox(-12, 0.75, 10, 2, 1.5, 5, 0x8b5a2b, true);
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

  return {
    colliders,
    tracers,
    addBox
  };
}