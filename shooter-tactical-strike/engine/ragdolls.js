import * as THREE from "three";
import { parseSourcePhysics } from "./SourcePhysics.js";

// HL2-style articulated bodies backed by the model's native PHY data.
// Bullet/Ammo is bundled locally; no extra CDN, build step or asset conversion.
let ammoPromise;
function loadAmmo() {
  if (!ammoPromise) {
    ammoPromise = Promise.all([
      import("./ammo.wasm.js"),
      new THREE.FileLoader().setResponseType("arraybuffer").loadAsync(new URL("./ammo.wasm.wasm", import.meta.url).href)
    ]).then(([module, wasmBinary]) => module.default({ wasmBinary }));
    ammoPromise.catch(() => { ammoPromise = null; });
  }
  return ammoPromise;
}

const defaults = {
  enabled: true, maxRagdolls: 12, lifetime: 24, fadeDuration: 3,
  gravity: 18, fixedTimeStep: 1 / 120, maxSubSteps: 8, solverIterations: 20,
  bulletImpulseScale: 0.32, explosionStrength: 5.5
};
const pairKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
const clamp = THREE.MathUtils.clamp;

export function createRagdolls({ colliders = [], floorObjects = [], config = {}, onExpire = () => {} } = {}) {
  const options = { ...defaults, ...config };
  const records = [], statics = [], models = new Map();
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), scale = new THREE.Vector3();
  const v = new THREE.Vector3(), w = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const worldMatrix = new THREE.Matrix4(), localMatrix = new THREE.Matrix4();
  let A, world, collisionConfig, dispatcher, broadphase, solver, av, aq;
  let readyPromise, accumulator = 0, colliderSnapshot = [];
  const step = clamp(options.fixedTimeStep, 1 / 240, 1 / 60);
  const maxSteps = clamp(Math.floor(options.maxSubSteps), 1, 16);

  function initialize() {
    if (!options.enabled) return Promise.resolve(false);
    if (!readyPromise) readyPromise = loadAmmo().then(ammo => {
      A = ammo;
      av = new A.btVector3(0, 0, 0); aq = new A.btQuaternion(0, 0, 0, 1);
      collisionConfig = new A.btDefaultCollisionConfiguration();
      dispatcher = new A.btCollisionDispatcher(collisionConfig);
      broadphase = new A.btDbvtBroadphase();
      solver = new A.btSequentialImpulseConstraintSolver();
      world = new A.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfig);
      av.setValue(0, -Math.max(0, options.gravity), 0); world.setGravity(av);
      world.getSolverInfo().set_m_numIterations(clamp(Math.floor(options.solverIterations), 8, 40));
      world.getSolverInfo().set_m_splitImpulse(true);
      return true;
    }).catch(error => {
      console.warn("Ragdoll physics unavailable; using configured death animations.", error);
      return false;
    });
    return readyPromise;
  }

  async function loadModel(src, result, setting = true) {
    if (!options.enabled || setting === false) return null;
    const url = setting?.phy || src.replace(/\.mdl(?=([?#]|$))/i, ".phy");
    const key = `${url}:${result.metadata.checksum}`;
    if (!models.has(key)) models.set(key, (async () => {
      try {
        const buffer = await new THREE.FileLoader().setResponseType("arraybuffer").loadAsync(url);
        const definition = parseSourcePhysics(buffer, result.metadata.checksum);
        const byName = new Map(result.boneData.map(b => [b.sourceName.toLowerCase(), b]));
        for (const solid of definition.solids) {
          const bone = byName.get(solid.name.toLowerCase());
          if (!bone) throw new Error(`PHY bone is absent from MDL: ${solid.name}`);
          solid.boneName = bone.name;
          solid.bind = bone.inverse.clone().invert();
        }
        return definition;
      } catch (error) {
        console.warn(`Ragdoll PHY unavailable for ${src}; using death animations.`, error);
        return null;
      }
    })());
    return models.get(key);
  }

  function boneMap(model) {
    const bones = new Map();
    model.traverse(object => { if (object.isBone && !bones.has(object.name)) bones.set(object.name, object); });
    return bones;
  }

  // Capture the last two evaluated poses, including navigation motion. Those
  // derivatives carry a running/falling enemy into physics without a dead stop.
  function trackPose(enemy, definition, delta) {
    if (!definition || !enemy.userData.model || enemy.userData.isDying || !(delta > 0)) return;
    let history = enemy.userData.ragdollHistory;
    if (!history) {
      const bones = boneMap(enemy.userData.model);
      history = definition.solids.map(s => ({ bone: bones.get(s.boneName), center: new THREE.Vector3().fromArray(s.center),
        position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(),
        angularVelocity: new THREE.Vector3(), valid: false }));
      enemy.userData.ragdollHistory = history;
    }
    enemy.updateMatrixWorld(true);
    for (const sample of history) {
      if (!sample.bone) continue;
      sample.bone.matrixWorld.decompose(p, q, scale);
      p.copy(sample.center).applyMatrix4(sample.bone.matrixWorld);
      if (sample.valid) {
        sample.velocity.copy(p).sub(sample.position).divideScalar(delta).clampLength(0, 8);
        rotation.copy(sample.quaternion).invert().premultiply(q).normalize();
        if (rotation.w < 0) rotation.set(-rotation.x, -rotation.y, -rotation.z, -rotation.w);
        const angle = 2 * Math.acos(clamp(rotation.w, -1, 1));
        sample.angularVelocity.set(rotation.x, rotation.y, rotation.z);
        if (sample.angularVelocity.lengthSq() > 1e-10) sample.angularVelocity.setLength(angle / delta).clampLength(0, 12);
      }
      sample.position.copy(p); sample.quaternion.copy(q); sample.valid = true;
    }
  }

  function ammoTransform(position, quaternion) {
    const t = new A.btTransform(); t.setIdentity();
    av.setValue(position.x, position.y, position.z); t.setOrigin(av);
    aq.setValue(quaternion.x, quaternion.y, quaternion.z, quaternion.w); t.setRotation(aq);
    return t;
  }

  function makeBody(shape, position, quaternion, mass, inertia = null) {
    const t = ammoTransform(position, quaternion);
    const motion = new A.btDefaultMotionState(t);
    av.setValue(0, 0, 0);
    if (mass) shape.calculateLocalInertia(mass, av);
    if (inertia && inertia.every(n => n > 1e-8 && Number.isFinite(n))) av.setValue(...inertia);
    const info = new A.btRigidBodyConstructionInfo(mass, motion, shape, av);
    const body = new A.btRigidBody(info);
    body.setFriction(0.72); body.setRestitution(0.02);
    if (mass) {
      body.setSleepingThresholds(0.12, 0.22);
      body.setCcdMotionThreshold(0.025); body.setCcdSweptSphereRadius(0.025);
    }
    world.addRigidBody(body);
    A.destroy(info); A.destroy(t);
    return { body, motion, shape, children: [], triangleMesh: null };
  }

  function destroyBody(entry) {
    world.removeRigidBody(entry.body);
    A.destroy(entry.body); A.destroy(entry.motion); A.destroy(entry.shape);
    entry.children.forEach(child => A.destroy(child));
    if (entry.triangleMesh) A.destroy(entry.triangleMesh);
  }

  function syncWorld() {
    const meshes = [], seen = new Set();
    for (const root of [...colliders, ...floorObjects]) root?.traverse(object => {
      if (object.isMesh && object.geometry?.attributes.position && !seen.has(object)) {
        seen.add(object); meshes.push(object);
      }
    });
    if (meshes.length === colliderSnapshot.length && meshes.every((mesh, i) => mesh === colliderSnapshot[i])) return;
    statics.forEach(destroyBody); statics.length = 0;
    colliderSnapshot = meshes;
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      const geometry = mesh.geometry;
      if (geometry.type === "BoxGeometry") {
        geometry.computeBoundingBox();
        mesh.matrixWorld.decompose(p, q, scale);
        geometry.boundingBox.getCenter(v).applyMatrix4(mesh.matrixWorld);
        geometry.boundingBox.getSize(w).multiply(scale).multiplyScalar(0.5);
        av.setValue(Math.abs(w.x), Math.abs(w.y), Math.abs(w.z));
        const shape = new A.btBoxShape(av); shape.setMargin(0.005);
        statics.push(makeBody(shape, v, q, 0));
      } else {
        // Exact static triangles retain stairs, ramps, rotated planes and
        // irregular floors. Visual-only detail never becomes an obstacle.
        const triangleMesh = new A.btTriangleMesh(true, true);
        const vertices = geometry.attributes.position, index = geometry.index;
        const vectors = [new A.btVector3(0, 0, 0), new A.btVector3(0, 0, 0), new A.btVector3(0, 0, 0)];
        const count = index ? index.count : vertices.count;
        for (let i = 0; i + 2 < count; i += 3) {
          for (let j = 0; j < 3; j++) {
            p.fromBufferAttribute(vertices, index ? index.getX(i + j) : i + j).applyMatrix4(mesh.matrixWorld);
            vectors[j].setValue(p.x, p.y, p.z);
          }
          triangleMesh.addTriangle(...vectors, true);
        }
        vectors.forEach(vector => A.destroy(vector));
        const shape = new A.btBvhTriangleMeshShape(triangleMesh, true, true); shape.setMargin(0.005);
        const entry = makeBody(shape, new THREE.Vector3(), new THREE.Quaternion(), 0);
        entry.triangleMesh = triangleMesh; statics.push(entry);
      }
    }
  }

  function create(enemy, definition, impact = {}) {
    if (!world || !definition || !enemy.userData.model || enemy.userData.ragdoll) return false;
    const bones = boneMap(enemy.userData.model);
    enemy.updateMatrixWorld(true);
    const mapped = definition.solids.map(s => bones.get(s.boneName));
    if (mapped.some(b => !b)) return false;
    // Source hulls/joint frames require a rigid transform plus uniform scale.
    for (const bone of mapped) {
      bone.matrixWorld.decompose(p, q, scale);
      if (scale.x <= 0 || Math.abs(scale.x - scale.y) > 0.00001 || Math.abs(scale.x - scale.z) > 0.00001) {
        console.warn("Ragdolls require positive uniform character scale; using death animation.");
        return false;
      }
    }
    syncWorld();
    const limit = clamp(Math.floor(options.maxRagdolls), 1, 32);
    while (records.length >= limit) {
      const oldest = records[0].enemy; remove(oldest); onExpire(oldest);
    }
    const record = { enemy, bodies: [], joints: [], filters: [], age: 0, materials: [], definition };
    try {
      definition.solids.forEach((solid, index) => {
        const bone = mapped[index]; bone.matrixWorld.decompose(p, q, scale);
        const unitScale = scale.x;
        const center = new THREE.Vector3().fromArray(solid.center).multiplyScalar(unitScale);
        const position = p.clone().add(v.copy(center).applyQuaternion(q));
        const quaternion = q.clone();
        const shape = new A.btCompoundShape(true), children = [];
        const identity = new A.btTransform(); identity.setIdentity();
        for (const vertices of solid.hulls) {
          const hull = new A.btConvexHullShape();
          for (let j = 0; j < vertices.length; j += 3) {
            av.setValue(vertices[j] * unitScale - center.x, vertices[j + 1] * unitScale - center.y, vertices[j + 2] * unitScale - center.z);
            hull.addPoint(av, j + 3 === vertices.length);
          }
          hull.setMargin(Math.min(0.005, unitScale * 0.12));
          shape.addChildShape(identity, hull); children.push(hull);
        }
        A.destroy(identity);
        const inertia = solid.inertia.map(n => n * unitScale * unitScale * solid.mass * clamp(solid.inertiaScale, 0.25, 12));
        const entry = makeBody(shape, position, quaternion, solid.mass, inertia);
        Object.assign(entry, { bone, center, unitScale, mass: solid.mass, children,
          position, quaternion, previousPosition: position.clone(), previousQuaternion: quaternion.clone() });
        entry.body.setDamping(clamp(1 - Math.exp(-solid.damping * 0.1), 0.04, 0.9),
          clamp(1 - Math.exp(-solid.angularDamping * 0.08), 0.08, 0.85));
        const sample = enemy.userData.ragdollHistory?.[index];
        if (sample?.valid) {
          av.setValue(sample.velocity.x, sample.velocity.y, sample.velocity.z); entry.body.setLinearVelocity(av);
          av.setValue(sample.angularVelocity.x, sample.angularVelocity.y, sample.angularVelocity.z); entry.body.setAngularVelocity(av);
        }
        record.bodies.push(entry);
      });
      const jointPairs = new Set();
      for (const joint of definition.constraints) {
        const parent = record.bodies[joint.parent], child = record.bodies[joint.child];
        const relative = definition.solids[joint.parent].bind.clone().invert().multiply(definition.solids[joint.child].bind);
        relative.decompose(p, q, scale);
        // Shared animation MDLs can use slightly different bone lengths. Keep
        // the live pivot to avoid a position pop, and the authored bind axes
        // so limits never become relative to the arbitrary pose at death.
        p.setFromMatrixPosition(child.bone.matrixWorld).applyMatrix4(localMatrix.copy(parent.bone.matrixWorld).invert());
        p.multiplyScalar(parent.unitScale).sub(parent.center);
        const frameA = ammoTransform(p, q);
        const frameB = ammoTransform(v.copy(child.center).negate(), new THREE.Quaternion());
        const constraint = new A.btGeneric6DofConstraint(parent.body, child.body, frameA, frameB, true);
        av.setValue(0, 0, 0); constraint.setLinearLowerLimit(av); constraint.setLinearUpperLimit(av);
        // Bullet's legacy 6DOF measures inverse-frame XYZ angles, equivalent
        // to the negative Source ZYX angles. Swap/negate both bounds: otherwise
        // elbows and knees bend backwards despite numerically valid limits.
        av.setValue(...joint.upper.map(value => -value)); constraint.setAngularLowerLimit(av);
        av.setValue(...joint.lower.map(value => -value)); constraint.setAngularUpperLimit(av);
        // Softer correction removes initial pose mismatch without snapping limbs.
        for (let axis = 0; axis < 6; axis++) {
          constraint.setParam(2, 0.2, axis); // BT_CONSTRAINT_STOP_ERP
          constraint.setParam(4, 0.00001, axis); // BT_CONSTRAINT_STOP_CFM
        }
        world.addConstraint(constraint, true);
        record.joints.push(constraint); jointPairs.add(pairKey(joint.parent, joint.child));
        A.destroy(frameA); A.destroy(frameB);
      }
      // This Ammo build does not expose per-pair ignoreCollisionCheck. A fully
      // free 6DOF has zero solver rows but supplies Bullet's collision exclusion.
      // This preserves every PHY self-collision rule, even with >15 body parts,
      // without sacrificing collisions between different corpses or the map.
      const allowed = new Set(definition.collisionPairs.map(pair => pairKey(...pair)));
      const identity = new A.btTransform(); identity.setIdentity();
      for (let i = 0; i < record.bodies.length; i++) for (let j = i + 1; j < record.bodies.length; j++) {
        const key = pairKey(i, j);
        if (jointPairs.has(key) || (definition.selfCollisions && (!definition.hasCollisionRules || allowed.has(key)))) continue;
        const filter = new A.btGeneric6DofConstraint(record.bodies[i].body, record.bodies[j].body, identity, identity, true);
        av.setValue(1, 1, 1); filter.setLinearLowerLimit(av); filter.setAngularLowerLimit(av);
        av.setValue(-1, -1, -1); filter.setLinearUpperLimit(av); filter.setAngularUpperLimit(av);
        world.addConstraint(filter, true); record.filters.push(filter);
      }
      A.destroy(identity);
      const depth = bone => { let n = 0; while (bone.parent) { n++; bone = bone.parent; } return n; };
      record.ordered = [...record.bodies].sort((a, b) => depth(a.bone) - depth(b.bone));
      const materials = new Set();
      enemy.traverse(object => {
        if (object.material) [].concat(object.material).forEach(material => materials.add(material));
      });
      record.materials = [...materials].map(material => ({ material, opacity: material.opacity }));
      enemy.userData.ragdoll = record;
      records.push(record);
      // Pausing avoids AnimationMixer.stopAllAction restoring the bind pose.
      if (enemy.userData.mixer) enemy.userData.mixer.timeScale = 0;
      enemy.userData.currentAction = null;
      hit(enemy, impact);
      return true;
    } catch (error) {
      if (records.includes(record)) records.splice(records.indexOf(record), 1);
      delete enemy.userData.ragdoll;
      if (enemy.userData.mixer) enemy.userData.mixer.timeScale = 1;
      destroyRecord(record);
      console.warn("Could not create PHY ragdoll; using death animation.", error);
      return false;
    }
  }

  function wake(record) { record.bodies.forEach(entry => entry.body.activate(true)); }

  function hit(enemy, { point, direction, bone, damage = 30, blastOrigin = null, blastRadius = 0, melee = false } = {}) {
    const record = enemy.userData.ragdoll;
    if (!record) return false;
    wake(record);
    if (blastOrigin && blastRadius > 0) {
      for (const entry of record.bodies) {
        v.copy(entry.position).sub(blastOrigin);
        const distance = v.length();
        const falloff = Math.max(0, 1 - distance / blastRadius);
        if (!falloff) continue;
        v.y += Math.max(0.15, distance * 0.25);
        v.normalize().multiplyScalar(entry.mass * options.explosionStrength * Math.min(1.5, damage / 100) * falloff);
        av.setValue(v.x, v.y, v.z); entry.body.applyCentralImpulse(av);
      }
      return true;
    }
    if (!direction || direction.lengthSq() < 1e-10) return true;
    let target = record.bodies.find(entry => entry.bone.name === bone || entry.bone.userData.sourceName === bone);
    if (!target && bone) {
      let ancestor = enemy.userData.model.getObjectByName(bone);
      while (ancestor && !target) {
        target = record.bodies.find(entry => entry.bone === ancestor); ancestor = ancestor.parent;
      }
    }
    if (!target) target = point ? record.bodies.reduce((a, b) =>
      a.position.distanceToSquared(point) < b.position.distanceToSquared(point) ? a : b) : record.bodies[0];
    const impulse = clamp(damage * options.bulletImpulseScale * (melee ? 1.6 : 1), 4, 45);
    const totalMass = record.bodies.reduce((sum, entry) => sum + entry.mass, 0);
    for (const entry of record.bodies) {
      v.copy(direction).normalize().multiplyScalar(impulse * 0.2 * entry.mass / totalMass);
      av.setValue(v.x, v.y, v.z); entry.body.applyCentralImpulse(av);
    }
    v.copy(direction).normalize().multiplyScalar(Math.min(impulse * 0.8, target.mass * 5));
    av.setValue(v.x, v.y, v.z);
    w.copy(point || target.position).sub(target.position).clampLength(0, 0.6);
    const relative = new A.btVector3(w.x, w.y, w.z);
    target.body.applyImpulse(av, relative); A.destroy(relative);
    return true;
  }

  function readBody(entry) {
    // getWorldTransform returns the actual fixed-step transform; interpolation
    // belongs to this module, not Bullet's separate graphics MotionState clock.
    const t = entry.body.getWorldTransform(), origin = t.getOrigin(), orientation = t.getRotation();
    entry.position.set(origin.x(), origin.y(), origin.z());
    entry.quaternion.set(orientation.x(), orientation.y(), orientation.z(), orientation.w()).normalize();
  }

  function syncSkeleton(record, alpha) {
    for (const entry of record.ordered) {
      p.lerpVectors(entry.previousPosition, entry.position, alpha);
      q.slerpQuaternions(entry.previousQuaternion, entry.quaternion, alpha);
      p.sub(v.copy(entry.center).applyQuaternion(q));
      worldMatrix.compose(p, q, scale.setScalar(entry.unitScale));
      entry.bone.parent.updateWorldMatrix(true, false);
      localMatrix.copy(entry.bone.parent.matrixWorld).invert().multiply(worldMatrix);
      localMatrix.decompose(entry.bone.position, entry.bone.quaternion, entry.bone.scale);
      entry.bone.updateMatrix(); entry.bone.updateWorldMatrix(false, false);
    }
    record.enemy.updateMatrixWorld(true);
  }

  function update(delta) {
    if (!world || !records.length || !(delta > 0)) return;
    const dt = Math.min(delta, 0.1);
    accumulator = Math.min(accumulator + dt, step * maxSteps);
    while (accumulator + 1e-9 >= step) {
      for (const record of records) for (const entry of record.bodies) {
        entry.previousPosition.copy(entry.position); entry.previousQuaternion.copy(entry.quaternion);
      }
      world.stepSimulation(step, 0); accumulator = Math.max(0, accumulator - step);
      for (const record of records) for (const entry of record.bodies) readBody(entry);
    }
    const alpha = accumulator / step;
    const expired = [];
    for (const record of records) {
      record.age += dt;
      if (record.age >= options.lifetime || record.bodies.some(entry =>
        !Number.isFinite(entry.position.lengthSq()) || entry.position.y < -60)) {
        expired.push(record.enemy); continue;
      }
      syncSkeleton(record, alpha);
      const fade = Math.min(Math.max(0, options.fadeDuration), Math.max(0.01, options.lifetime));
      const opacity = fade > 0 ? clamp((options.lifetime - record.age) / fade, 0, 1) : 1;
      if (opacity < 1) for (const { material, opacity: original } of record.materials) {
        if (!material.transparent) { material.transparent = true; material.needsUpdate = true; }
        material.opacity = original * opacity; material.depthWrite = false;
      }
    }
    expired.forEach(onExpire);
  }

  function destroyRecord(record) {
    for (const constraint of [...record.joints, ...record.filters]) {
      world.removeConstraint(constraint); A.destroy(constraint);
    }
    record.bodies.forEach(destroyBody);
    record.bodies.length = 0; record.joints.length = 0; record.filters.length = 0;
  }

  function remove(enemy) {
    const record = enemy.userData.ragdoll;
    if (!record) return;
    const index = records.indexOf(record);
    if (index !== -1) records.splice(index, 1);
    destroyRecord(record); delete enemy.userData.ragdoll;
    if (!records.length) accumulator = 0;
  }

  function dispose() {
    [...records].forEach(record => { remove(record.enemy); onExpire(record.enemy); });
    if (!world) return;
    statics.forEach(destroyBody); statics.length = 0; colliderSnapshot = [];
    [world, solver, broadphase, dispatcher, collisionConfig, aq, av].forEach(object => A.destroy(object));
    world = null;
  }

  return { initialize, loadModel, trackPose, create, hit, update, remove, dispose,
    get count() { return records.length; },
    get ready() { return Boolean(world); } };
}
