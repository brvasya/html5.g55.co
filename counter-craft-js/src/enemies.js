export function createEnemies({ THREE, scene, camera, config, state }) {
  const enemies = [];
  const raycaster = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  const toPlayer = new THREE.Vector3();

  function spawnWave(wave) {
    const count = Math.min(4 + wave, 14);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 12 + Math.random() * 7;
      createEnemy(Math.cos(angle) * radius, Math.sin(angle) * radius, wave);
    }
  }

  function createEnemy(x, z, wave) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.3, 0.55),
      new THREE.MeshStandardMaterial({ color: 0xbb3333, roughness: 0.75 })
    );
    body.position.y = 0.85;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.62, 0.62),
      new THREE.MeshStandardMaterial({ color: 0xdd5555, roughness: 0.7 })
    );
    head.position.y = 1.65;
    head.castShadow = true;
    group.add(head);

    group.userData = {
      health: config.enemyHealth + wave * 8,
      lastAttack: 0
    };

    scene.add(group);
    enemies.push(group);
  }

  function update(delta, isPlaying, takeDamage) {
    if (!isPlaying) return;

    const now = performance.now();
    const playerPosition = camera.position;

    enemies.forEach(enemy => {
      toPlayer.set(
        playerPosition.x - enemy.position.x,
        0,
        playerPosition.z - enemy.position.z
      );

      const distance = toPlayer.length();
      enemy.lookAt(playerPosition.x, enemy.position.y, playerPosition.z);

      if (distance > config.enemyAttackDistance) {
        toPlayer.normalize();
        enemy.position.add(toPlayer.multiplyScalar((config.enemySpeed + state.wave * 0.08) * delta));
      } else if (now - enemy.userData.lastAttack > config.enemyAttackCooldown) {
        enemy.userData.lastAttack = now;
        takeDamage(config.enemyDamage);
      }
    });
  }

  function shoot(damage) {
    raycaster.setFromCamera(center, camera);

    const hits = raycaster.intersectObjects(enemies, true);
    if (!hits.length) return false;

    const enemy = findEnemyRoot(hits[0].object);
    if (!enemy) return false;

    enemy.userData.health -= damage;
    flashEnemy(enemy);

    if (enemy.userData.health <= 0) {
      removeEnemy(enemy);
      return true;
    }

    return false;
  }

  function findEnemyRoot(object) {
    let current = object;

    while (current && !enemies.includes(current)) {
      current = current.parent;
    }

    return current || null;
  }

  function flashEnemy(enemy) {
    enemy.children.forEach(part => {
      if (!part.material?.color) return;

      const original = part.material.color.getHex();
      part.material.color.setHex(0xffffff);
      setTimeout(() => part.material.color.setHex(original), 70);
    });
  }

  function removeEnemy(enemy) {
    scene.remove(enemy);

    enemy.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
        else object.material.dispose();
      }
    });

    const index = enemies.indexOf(enemy);
    if (index !== -1) enemies.splice(index, 1);
  }

  function reset() {
    while (enemies.length) removeEnemy(enemies[0]);
  }

  return {
    spawnWave,
    update,
    shoot,
    reset,
    get count() {
      return enemies.length;
    }
  };
}
