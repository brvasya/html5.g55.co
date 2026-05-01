export function createImpactParticles({ THREE, scene }) {
  const particles = [];
  const tempDirection = new THREE.Vector3();

  function spawnBlood(point, normal) {
    spawnBurst({
      point,
      normal,
      count: 14,
      color: 0x8b0000,
      size: 0.045,
      speedMin: 1.2,
      speedMax: 3.6,
      gravity: 5.2,
      life: 0.65,
      spread: 0.9
    });
  }

  function spawnSurface(point, normal) {
    spawnBurst({
      point,
      normal,
      count: 10,
      color: 0xd8c18a,
      size: 0.026,
      speedMin: 0.8,
      speedMax: 2.5,
      gravity: 3.2,
      life: 0.45,
      spread: 0.65
    });
  }

  function spawnBurst({ point, normal, count, color, size, speedMin, speedMax, gravity, life, spread }) {
    if (!point) return;

    const baseNormal = normal?.clone?.() ?? new THREE.Vector3(0, 1, 0);
    if (baseNormal.lengthSq() === 0) baseNormal.set(0, 1, 0);
    baseNormal.normalize();

    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false
      });

      const particle = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material);
      particle.position.copy(point).addScaledVector(baseNormal, 0.025);
      particle.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      tempDirection.copy(baseNormal);
      tempDirection.x += (Math.random() - 0.5) * spread;
      tempDirection.y += (Math.random() - 0.25) * spread;
      tempDirection.z += (Math.random() - 0.5) * spread;
      tempDirection.normalize();

      const speed = speedMin + Math.random() * (speedMax - speedMin);
      particle.userData.velocity = tempDirection.clone().multiplyScalar(speed);
      particle.userData.life = life;
      particle.userData.maxLife = life;
      particle.userData.gravity = gravity;
      particle.userData.spin = 5 + Math.random() * 12;

      scene.add(particle);
      particles.push(particle);
    }
  }

  function update(delta) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      particle.userData.life -= delta;
      particle.userData.velocity.y -= particle.userData.gravity * delta;
      particle.position.addScaledVector(particle.userData.velocity, delta);
      particle.rotation.x += particle.userData.spin * delta;
      particle.rotation.y += particle.userData.spin * 0.7 * delta;

      const alpha = Math.max(0, particle.userData.life / particle.userData.maxLife);
      particle.material.opacity = alpha;

      if (particle.userData.life <= 0) {
        scene.remove(particle);
        particle.geometry.dispose();
        particle.material.dispose();
        particles.splice(i, 1);
      }
    }
  }

  function clear() {
    while (particles.length) {
      const particle = particles.pop();
      scene.remove(particle);
      particle.geometry.dispose();
      particle.material.dispose();
    }
  }

  return {
    spawnBlood,
    spawnSurface,
    update,
    clear
  };
}
