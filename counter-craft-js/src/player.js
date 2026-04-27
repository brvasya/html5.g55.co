export function createPlayer({ THREE, camera, config, colliders }) {
  const cfg = config;
  const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    walking: false,
    jumpQueued: false
  };

  const inputState = {
    mouseDown: false,
    mouseDeltaX: 0,
    mouseDeltaY: 0,
    moving: false,
    walking: false,
    grounded: true
  };

  const velocity = new THREE.Vector3();
  const wishDirection = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const side = new THREE.Vector3();
  const oldPosition = new THREE.Vector3();
  const playerBox = new THREE.Box3();
  const colliderBox = new THREE.Box3();
  const playerBoxCenter = new THREE.Vector3();
  const playerBoxSize = new THREE.Vector3(0.75, cfg.playerHeight, 0.75);

  let yaw = 0;
  let pitch = 0;
  let verticalVelocity = 0;
  let canJump = true;
  let pointerLockSupported = hasPointerLockSupport();
  let pointerLockActive = false;
  let dragLookActive = false;
  let lastDragX = 0;
  let lastDragY = 0;

  applyCameraRotation();

  function hasPointerLockSupport() {
    return typeof document.body.requestPointerLock === "function" && typeof document.exitPointerLock === "function";
  }

  function lockCursor() {
    if (!pointerLockSupported || document.pointerLockElement === document.body) {
      if (!pointerLockSupported) enableFallbackLook();
      return;
    }

    try {
      const result = document.body.requestPointerLock({ unadjustedMovement: true });
      if (result && typeof result.catch === "function") result.catch(requestBasicPointerLock);
    } catch {
      requestBasicPointerLock();
    }
  }

  function requestBasicPointerLock() {
    try {
      const result = document.body.requestPointerLock();
      if (result && typeof result.catch === "function") result.catch(enableFallbackLook);
    } catch {
      enableFallbackLook();
    }
  }

  function enableFallbackLook() {
    pointerLockSupported = false;
    pointerLockActive = false;
  }

  function setPointerLockActive(value) {
    pointerLockActive = value;
  }

  function onKeyDown(event) {
    switch (event.code) {
      case "KeyW": keys.forward = true; break;
      case "KeyS": keys.backward = true; break;
      case "KeyA": keys.left = true; break;
      case "KeyD": keys.right = true; break;
      case "ShiftLeft":
      case "ShiftRight": keys.walking = true; break;
      case "Space":
        event.preventDefault();
        if (!event.repeat) keys.jumpQueued = true;
        break;
    }
  }

  function onKeyUp(event) {
    switch (event.code) {
      case "KeyW": keys.forward = false; break;
      case "KeyS": keys.backward = false; break;
      case "KeyA": keys.left = false; break;
      case "KeyD": keys.right = false; break;
      case "ShiftLeft":
      case "ShiftRight": keys.walking = false; break;
    }
  }

  function onMouseDown(event) {
    if (event.button === 0) inputState.mouseDown = true;
    if (!pointerLockActive && !pointerLockSupported && event.button === 0) {
      dragLookActive = true;
      lastDragX = event.clientX;
      lastDragY = event.clientY;
    }
  }

  function onMouseUp(event) {
    if (event.button === 0) {
      dragLookActive = false;
      inputState.mouseDown = false;
    }
  }

  function onMouseMove(event) {
    if (pointerLockActive) {
      rotateView(event.movementX, event.movementY, cfg.mouseSensitivity);
      return;
    }

    if (dragLookActive) {
      const deltaX = event.clientX - lastDragX;
      const deltaY = event.clientY - lastDragY;
      lastDragX = event.clientX;
      lastDragY = event.clientY;
      rotateView(deltaX, deltaY, cfg.dragSensitivity);
    }
  }

  function rotateView(deltaX, deltaY, sensitivity) {
    inputState.mouseDeltaX += deltaX;
    inputState.mouseDeltaY += deltaY;
    yaw -= deltaX * sensitivity;
    pitch -= deltaY * sensitivity;
    pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, pitch));
    applyCameraRotation();
  }

  function applyCameraRotation() {
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  }

  function clearMovement() {
    keys.forward = false;
    keys.backward = false;
    keys.left = false;
    keys.right = false;
    keys.walking = false;
    keys.jumpQueued = false;
    dragLookActive = false;
  }

  function reset() {
    yaw = 0;
    pitch = 0;
    verticalVelocity = 0;
    canJump = true;
    velocity.set(0, 0, 0);
    camera.position.set(0, cfg.playerHeight, 8);
    clampToArena();
    applyCameraRotation();
    clearMovement();
  }

  function update(delta, isPlaying) {
    if (!Number.isFinite(delta)) return;
    inputState.mouseDeltaX = THREE.MathUtils.lerp(inputState.mouseDeltaX, 0, 1 - Math.exp(-30 * delta));
    inputState.mouseDeltaY = THREE.MathUtils.lerp(inputState.mouseDeltaY, 0, 1 - Math.exp(-30 * delta));

    if (!isPlaying) return;

    const grounded = camera.position.y <= cfg.playerHeight + 0.001;

    if (keys.jumpQueued) {
      if (grounded && canJump) {
        verticalVelocity = cfg.jumpPower;
        canJump = false;
      }
      keys.jumpQueued = false;
    }

    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    side.crossVectors(camera.up, forward).normalize();
    wishDirection.set(0, 0, 0);

    if (keys.forward) wishDirection.add(forward);
    if (keys.backward) wishDirection.sub(forward);
    if (keys.left) wishDirection.add(side);
    if (keys.right) wishDirection.sub(side);

    const hasInput = wishDirection.lengthSq() > 0;
    if (hasInput) wishDirection.normalize();

    const maxSpeed = cfg.playerSpeed * (keys.walking ? cfg.walkMultiplier : 1);
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);

    if (grounded) {
      const drop = Math.max(horizontalSpeed, cfg.stopSpeed) * cfg.friction * delta;
      const newSpeed = Math.max(0, horizontalSpeed - drop);
      if (horizontalSpeed > 0) {
        velocity.x *= newSpeed / horizontalSpeed;
        velocity.z *= newSpeed / horizontalSpeed;
      }
    } else {
      velocity.x *= Math.max(0, 1 - cfg.airFriction * delta);
      velocity.z *= Math.max(0, 1 - cfg.airFriction * delta);
    }

    if (hasInput) {
      const acceleration = grounded ? cfg.groundAcceleration : cfg.airAcceleration;
      const currentSpeed = velocity.dot(wishDirection);
      const addSpeed = maxSpeed - currentSpeed;

      if (addSpeed > 0) {
        const accelSpeed = Math.min(acceleration * maxSpeed * delta, addSpeed);
        velocity.addScaledVector(wishDirection, accelSpeed);
      }
    }

    oldPosition.copy(camera.position);
    camera.position.x += velocity.x * delta;
    camera.position.z += velocity.z * delta;

    if (hitsWall(camera.position)) {
      camera.position.copy(oldPosition);
      velocity.x = 0;
      velocity.z = 0;
    }

    clampToArena();

    verticalVelocity -= cfg.gravity * delta;
    camera.position.y += verticalVelocity * delta;

    if (camera.position.y <= cfg.playerHeight) {
      camera.position.y = cfg.playerHeight;
      verticalVelocity = 0;
      canJump = true;
    } else {
      canJump = false;
    }

    clampToArena();

    inputState.moving = hasInput && Math.hypot(velocity.x, velocity.z) > 0.15;
    inputState.walking = keys.walking;
    inputState.grounded = camera.position.y <= cfg.playerHeight + 0.001;
  }

  function clampToArena() {
    if (!cfg.arenaSize) return;

    const limit = cfg.arenaSize / 2 - 0.6;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -limit, limit);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -limit, limit);
  }

  function hitsWall(position) {
    playerBoxCenter.set(
      position.x,
      position.y - cfg.playerHeight / 2,
      position.z
    );
    playerBox.setFromCenterAndSize(playerBoxCenter, playerBoxSize);

    return colliders.some(collider => {
      colliderBox.setFromObject(collider);
      return playerBox.intersectsBox(colliderBox);
    });
  }

  return {
    velocity,
    inputState,
    get pointerLockSupported() {
      return pointerLockSupported;
    },
    get pointerLockActive() {
      return pointerLockActive;
    },
    lockCursor,
    enableFallbackLook,
    setPointerLockActive,
    onKeyDown,
    onKeyUp,
    onMouseDown,
    onMouseUp,
    onMouseMove,
    clearMovement,
    reset,
    update
  };
}
