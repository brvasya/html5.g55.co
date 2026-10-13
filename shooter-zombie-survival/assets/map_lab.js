// Umbrella Lab — a procedural, ground-floor adaptation of Umbrella Corps.
// Public world/navigation interfaces match the supplied world.js.
export const WORLD_SETTINGS = {
  seed: 19980623, size: 58, spawn: [0, 1.75, 23], spawnYaw: 0,
  sky: { top: 0x101d22, mid: 0x18262b, horizon: 0x26343a,
    fogColor: 0x223238, fogNear: 34, fogFar: 92 },
  lighting: {
    hemisphereSky: 0xc4d9dc, hemisphereGround: 0x657574, hemisphereIntensity: 1.65,
    sunColor: 0xd2e0dd, sunIntensity: 1.05, sunPosition: [-12, 24, 9]
  }
};

const LAB = {
  halfWidth: 27, halfDepth: 29, wall: 0.8, height: 7.2,
  westDoors: [-21, -2, 17], eastDoors: [-19, -3, 13], doorWidth: 6,
  tanks: [[-3.2, -5], [3.2, -5]],
  benches: [[-20, 19, 5.5, 2.3], [-19, 1, 5.8, 2.4], [-19, -8, 4.5, 2.4]],
  cargo: [[18, -18, 3.2, 3, 2.2], [23, -11, 3, 2.8, 1.4], [16, 21, 3, 2.4, 1.3], [5, 14.5, 2.8, 2.2, 1.35]],
  // Wall-mounted banks meet the perimeter: no player-only slots behind them.
  cabinets: [[25.85, 5, 1.5, 5.8], [14.8, 4, 1.6, 4.2], [-25.7, 24, 1.8, 4]],
  cryo: [[-23.5, -18], [-23.5, -24], [-17, -24]]
};

export function createWorld({ THREE, scene }) {
  const root = new THREE.Group(); root.name = "UmbrellaLab"; scene.add(root);
  const colliders = [], floorObjects = [], skyObjects = [], tracers = [];
  const obstacles = [], batches = new Map(), random = mulberry32(WORLD_SETTINGS.seed);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 16);
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const temp = new THREE.Object3D();
  const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });
  let elapsed = 0, navigation;
  const warningMaterials = [];
  const mat = {
    wall: standard(0xb0b6ae), panel: standard(0x8b9994),
    floor: standard(0xa7afa6, { roughness: 0.84 }),
    steel: standard(0x4e605f, { roughness: 0.56, metalness: 0.5 }),
    edge: standard(0x87928c, { roughness: 0.45, metalness: 0.6 }),
    dark: standard(0x243238, { roughness: 0.72, metalness: 0.28 }),
    ceiling: standard(0x4b5959), duct: standard(0x6e7d77, { metalness: 0.45, roughness: 0.68 }),
    equipment: standard(0x697f73, { roughness: 0.65, metalness: 0.3 }),
    rubber: standard(0x162124), ivory: standard(0xc5cbbf),
    red: standard(0x903c34), yellow: standard(0xc1a75e),
    glass: standard(0x193c43, { roughness: 0.23, metalness: 0.62,
      emissive: 0x24545a, emissiveIntensity: 0.22 }),
    liquid: standard(0x256766, { roughness: 0.22, metalness: 0.25,
      emissive: 0x287a78, emissiveIntensity: 0.2 }),
    whiteLight: new THREE.MeshBasicMaterial({ color: 0xc7e6df, toneMapped: false }),
    cyanLight: new THREE.MeshBasicMaterial({ color: 0x68bdb7, toneMapped: false }),
    amberLight: new THREE.MeshBasicMaterial({ color: 0xe4b877, toneMapped: false }),
    redLight: new THREE.MeshBasicMaterial({ color: 0xc45641, toneMapped: false })
  };
  const world = {
    map: root, colliders, tracers, floorObjects, skyObjects,
    isLoaded: false, spawn: new THREE.Vector3(...WORLD_SETTINGS.spawn),
    lighting: WORLD_SETTINGS.lighting, ready: null, navigation: null,
    resetPlayer, getRandomFloorPoint, update
  };
  scene.background = new THREE.Color(WORLD_SETTINGS.sky.fogColor);
  scene.fog = new THREE.Fog(WORLD_SETTINGS.sky.fogColor,
    WORLD_SETTINGS.sky.fogNear, WORLD_SETTINGS.sky.fogFar);
  createShell(); createPartitions(); createEquipment();
  decorateLab(); flushBatches();
  root.updateMatrixWorld(true);
  navigation = createNavigation(); world.navigation = navigation;
  world.isLoaded = true; world.ready = Promise.resolve(world);
  return world;

  function standard(color, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.04, ...extra });
  }
  function instance(geo, material, x, y, z, sx, sy, sz,
    rx = 0, ry = 0, rz = 0, castShadow = true) {
    // Spatial batches keep secondary rooms cullable. No runtime allocations.
    const cell = geo !== boxGeo && geo !== cylinderGeo && geo !== planeGeo ? "signs" :
      (x < -10 ? "research" : x > 10 ? "service" : "hall") + ":" + Math.floor((z + 29) / 20);
    const key = geo.uuid + ":" + material.uuid + ":" + cell + ":" + castShadow;
    if (!batches.has(key)) batches.set(key, { geo, material, matrices: [], castShadow });
    temp.position.set(x, y, z); temp.rotation.set(rx, ry, rz);
    temp.scale.set(sx, sy, sz); temp.updateMatrix();
    batches.get(key).matrices.push(temp.matrix.clone());
  }
  function box(x, y, z, w, h, d, material, solid = false, name = "Lab equipment", cast = true) {
    instance(boxGeo, material, x, y, z, w, h, d, 0, 0, 0, cast);
    if (solid) collider(x, y, z, w, h, d, 0, name);
  }
  function collider(x, y, z, w, h, d, yaw = 0, name = "Lab collision", navigationBlock = true) {
    const mesh = new THREE.Mesh(boxGeo, hiddenMaterial);
    mesh.name = name; mesh.position.set(x, y, z); mesh.rotation.y = yaw; mesh.scale.set(w, h, d);
    root.add(mesh); colliders.push(mesh);
    if (navigationBlock) obstacles.push({ x, z, halfW: w / 2, halfD: d / 2, cos: Math.cos(yaw), sin: Math.sin(yaw) });
    return mesh;
  }
  function cylinder(x, y, z, r, h, material, rx = 0, rz = 0, cast = true) {
    instance(cylinderGeo, material, x, y, z, r, h, r, rx, 0, rz, cast);
  }
  function cylinderCollider(x, y, z, r, h, name) {
    const mesh = new THREE.Mesh(cylinderGeo, hiddenMaterial);
    mesh.name = name; mesh.position.set(x, y, z); mesh.scale.set(r, h, r);
    root.add(mesh); colliders.push(mesh);
    // The square plinth below the vessel already owns its navigation footprint.
  }
  function solidCylinder(x, y, z, r, h, material, name) {
    cylinder(x, y, z, r, h, material);
    cylinderCollider(x, y, z, r, h, name);
  }
  function floorMark(x, z, w, d, material, y = 0.018) {
    instance(planeGeo, material, x, y, z, w, d, 1, -Math.PI / 2, 0, 0, false);
  }
  function flushBatches() {
    for (const { geo, material, matrices, castShadow } of batches.values()) {
      const mesh = new THREE.InstancedMesh(geo, material, matrices.length);
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
      mesh.name = "Laboratory structure and details";
      mesh.castShadow = castShadow && !material.isMeshBasicMaterial;
      mesh.receiveShadow = !material.isMeshBasicMaterial; root.add(mesh);
    }
    batches.clear();
  }
  function createShell() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(54, 58), mat.floor);
    ground.name = "G55FLR_UmbrellaLab"; ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true; root.add(ground); colliders.push(ground); floorObjects.push(ground);
    for (const x of [-27, 27]) box(x, 3.6, 0, 0.8, 7.2, 58.8, mat.wall, true, "Laboratory perimeter");
    for (const z of [-29, 29]) box(0, 3.6, z, 54, 7.2, 0.8, mat.wall, true, "Sealed laboratory bulkhead");
    // Ceiling is solid to shots/jumps, but receives indoor fill instead of sealing
    // off the engine-owned directional light. No light/shadow settings are changed.
    box(0, 7.35, 0, 54, 0.3, 58, mat.ceiling, false, "Ceiling", false);
    collider(0, 7.35, 0, 54, 0.3, 58, 0, "Laboratory ceiling", false);
  }
  function wallSegment(axis, coordinate, from, to, label) {
    if (to <= from) return;
    const w = axis === "x" ? 0.6 : to - from;
    const d = axis === "x" ? to - from : 0.6;
    const x = axis === "x" ? coordinate : (from + to) / 2;
    const z = axis === "x" ? (from + to) / 2 : coordinate;
    box(x, 3.6, z, w, 7.2, d, mat.wall, true, label);
    box(x, 0.38, z, w + 0.1, 0.76, d + 0.1, mat.steel, false, label, false);
    box(x, 2.28, z, w + 0.07, 0.16, d + 0.07, mat.equipment, false, label, false);
    box(x, 6.2, z, w + 0.1, 0.28, d + 0.1, mat.steel, false, label, false);
  }
  function portal(axis, coordinate, center, width, label) {
    const height = 3.4, upper = LAB.height - height;
    const x = axis === "x" ? coordinate : center, z = axis === "x" ? center : coordinate;
    const w = axis === "x" ? 0.6 : width, d = axis === "x" ? width : 0.6;
    box(x, height + upper / 2, z, w, upper, d, mat.wall);
    collider(x, height + upper / 2, z, w, upper, d, 0, label + " header", false);
    box(x, height + 0.12, z, w + 0.2, 0.24, d + 0.2, mat.steel);
    // Posts remain outside the six-meter clear aperture.
    for (const end of [-1, 1]) {
      const px = axis === "x" ? x : x + end * (width / 2 + 0.11);
      const pz = axis === "x" ? z + end * (width / 2 + 0.11) : z;
      box(px, 1.7, pz, axis === "x" ? 0.83 : 0.22, 3.4,
        axis === "x" ? 0.22 : 0.83, mat.steel);
      box(px, 2.72, pz, axis === "x" ? 0.86 : 0.06, 0.8,
        axis === "x" ? 0.06 : 0.86, mat.cyanLight, false, label, false);
    }
    floorMark(x, z, axis === "x" ? 0.9 : width, axis === "x" ? width : 0.9, mat.dark, 0.02);
  }
  function partition(axis, coordinate, from, to, doors, label) {
    let edge = from;
    for (const door of doors) {
      wallSegment(axis, coordinate, edge, door - LAB.doorWidth / 2, label);
      portal(axis, coordinate, door, LAB.doorWidth, label);
      edge = door + LAB.doorWidth / 2;
    }
    wallSegment(axis, coordinate, edge, to, label);
  }
  function createPartitions() {
    partition("x", -10, -28.6, 28.6, LAB.westDoors, "Research wing wall");
    partition("x", 10, -28.6, 28.6, LAB.eastDoors, "Service wing wall");
    partition("z", 9, -26.6, -10.3, [-18], "Sample preparation partition");
    partition("z", -12, -26.6, -10.3, [-17], "Cryogenic partition");
    partition("z", 16, 10.3, 26.6, [20], "Decontamination partition");
    partition("z", -9, 10.3, 26.6, [18], "Logistics partition");
  }
  function createEquipment() {
    for (const [x, z] of LAB.tanks) {
      box(x, 0.46, z, 3.8, 0.92, 3.8, mat.dark, true, "Containment vessel plinth");
      solidCylinder(x, 3, z, 1.52, 4.18, mat.liquid, "Sealed containment vessel");
      solidCylinder(x, 5.18, z, 1.68, 0.48, mat.steel, "Containment vessel cap");
      solidCylinder(x, 1.02, z, 1.68, 0.3, mat.steel, "Containment vessel base collar");
    }
    for (const [x, z, w, d] of LAB.benches) {
      box(x, 0.53, z, w - 0.18, 1.06, d - 0.12, mat.equipment, true, "Research bench");
      box(x, 1.12, z, w, 0.15, d, mat.ivory);
      collider(x, 1.12, z, w, 0.15, d, 0, "Research worktop", false);
    }
    for (const [x, z, w, d, h] of LAB.cargo) box(x, h / 2, z, w, h, d, mat.equipment, true, "Sealed specimen cargo");
    for (const [x, z, w, d] of LAB.cabinets) box(x, 1.6, z, w, 3.2, d, mat.dark, true, "Control cabinet");
    for (const [x, z] of LAB.cryo) {
      box(x, 0.4, z, 2.8, 0.8, 2.8, mat.steel, true, "Cryogenic tank base");
      solidCylinder(x, 2.4, z, 1.18, 3.6, mat.equipment, "Cryogenic tank");
    }
    // High horizontal duct enclosure and central consoles divide the long view.
    box(-4.9, 1.4, 9, 3.2, 2.8, 2.6, mat.duct, true, "Air handling unit");
    box(5.8, 0.65, -16, 3, 1.3, 3.2, mat.equipment, true, "Specimen transfer station");
    box(-1.2, 0.63, -22.6, 5, 1.26, 1.6, mat.steel, true, "Containment console");
  }
  function canvasTexture(width, height, draw) {
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    draw(canvas.getContext("2d"), width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    return texture;
  }
  function surfaceTexture(kind) {
    const texture = canvasTexture(512, 512, (ctx, w, h) => {
      const pixels = ctx.createImageData(w, h);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const v = 202 + (random() - 0.5) * (kind === "wall" ? 17 : 28);
        pixels.data[i] = v; pixels.data[i + 1] = v + 2;
        pixels.data[i + 2] = v - 2; pixels.data[i + 3] = 255;
      }
      ctx.putImageData(pixels, 0, 0);
      if (kind === "floor") {
        // Large service tiles: restrained grout, edge chips, heel scuffs.
        for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 128) {
          ctx.fillStyle = `rgba(55,68,64,${random() * 0.06})`; ctx.fillRect(x, y, 128, 128);
          ctx.strokeStyle = "#939b91"; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, 126, 126);
          ctx.strokeStyle = "rgba(237,240,225,0.55)"; ctx.lineWidth = 1;
          ctx.strokeRect(x + 3, y + 3, 122, 122);
        }
        for (let i = 0; i < 330; i++) {
          ctx.strokeStyle = `rgba(58,69,63,${0.025 + random() * 0.085})`;
          const x = random() * w, y = random() * h;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + random() * 24, y + random() * 8); ctx.stroke();
        }
      } else {
        for (let i = 0; i < 85; i++) {
          ctx.fillStyle = `rgba(62,77,71,${0.01 + random() * 0.045})`;
          ctx.fillRect(random() * w, random() * h, 1 + random() * 4, 10 + random() * 140);
        }
        const dirt = ctx.createLinearGradient(0, h * 0.68, 0, h);
        dirt.addColorStop(0, "rgba(70,80,66,0)"); dirt.addColorStop(1, "rgba(70,80,66,0.16)");
        ctx.fillStyle = dirt; ctx.fillRect(0, 0, w, h);
      }
    });
    if (kind === "floor") {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(9, 10);
    }
    return texture;
  }
  function drawUmbrella(ctx, x, y, radius) {
    ctx.save(); ctx.translate(x, y);
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 8 + i * Math.PI / 4, b = a + Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
      ctx.lineTo(Math.cos(b) * radius, Math.sin(b) * radius); ctx.closePath();
      ctx.fillStyle = i % 2 ? "#d8e0d9" : "#a53c32"; ctx.fill();
    }
    ctx.restore();
  }
  function createSignAtlas() {
    const rows = [
      ["UMBRELLA", "BIOLOGICAL RESEARCH DIVISION", "logo"],
      ["CONTAINMENT", "B-03  /  RESTRICTED ACCESS", "logo"],
      ["RESEARCH 01", "SAMPLE PREPARATION", "plain"],
      ["CRYOGENICS 02", "LOW TEMPERATURE STORAGE", "plain"],
      ["CONTROL 03", "POWER / ENVIRONMENTAL SYSTEMS", "plain"],
      ["LOGISTICS 04", "SPECIMEN TRANSFER", "plain"],
      ["BIOHAZARD", "SEALED BIOLOGICAL MATERIAL", "hazard"],
      ["ACCESS DENIED", "FACILITY UNDER QUARANTINE", "alert"],
      ["CONTAINMENT", "PRESSURE STABLE  /  SEALED", "screen"],
      ["SYSTEM MONITOR", "VENTILATION / POWER / COOLANT", "screen"],
      ["UB-001", "CRYOGENIC SPECIMEN", "plain"],
      ["DECONTAMINATION", "PROTECTIVE EQUIPMENT REQUIRED", "plain"],
      ["WARNING", "SYSTEM ISOLATED", "hazard"],
      ["RESEARCH", "01  /  AUTHORIZED PERSONNEL", "arrow"],
      ["B-03", "BIOLOGICAL RESEARCH", "plain"],
      ["", "", "emblem"]
    ];
    return canvasTexture(2048, 1024, ctx => {
      for (let i = 0; i < rows.length; i++) {
        const [title, subtitle, type] = rows[i];
        ctx.save(); ctx.translate(i % 4 * 512, Math.floor(i / 4) * 256);
        ctx.fillStyle = type === "screen" ? "#102c31" : "#263437"; ctx.fillRect(0, 0, 512, 256);
        ctx.strokeStyle = "#78887f"; ctx.lineWidth = 3; ctx.strokeRect(10, 10, 492, 236);
        if (type === "emblem") {
          drawUmbrella(ctx, 256, 128, 105); ctx.restore(); continue;
        }
        const logo = type === "logo";
        if (logo) drawUmbrella(ctx, 83, 110, 59);
        if (type === "hazard" || type === "alert") {
          ctx.fillStyle = type === "hazard" ? "#b59b56" : "#9d4c39"; ctx.fillRect(17, 17, 478, 34);
          ctx.fillStyle = "#283230";
          for (let x = 22; x < 494; x += 38) {
            ctx.beginPath(); ctx.moveTo(x, 17); ctx.lineTo(x + 17, 17);
            ctx.lineTo(x + 2, 51); ctx.lineTo(x - 15, 51); ctx.closePath(); ctx.fill();
          }
        }
        ctx.textAlign = logo ? "left" : "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "#e1e6d9";
        ctx.font = `700 ${title.length > 15 ? 31 : logo ? 37 : 40}px Arial, sans-serif`;
        ctx.fillText(title, logo ? 161 : 256, 105, logo ? 325 : 460);
        ctx.font = "18px Arial, sans-serif"; ctx.fillStyle = "#a4b8ae";
        ctx.fillText(subtitle, logo ? 161 : 256, 152, logo ? 325 : 456);
        ctx.strokeStyle = "#8b4136"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(logo ? 163 : 48, 180); ctx.lineTo(466, 180); ctx.stroke();
        ctx.font = "13px monospace"; ctx.fillStyle = "#7f948c";
        ctx.textAlign = "left"; ctx.fillText("UMBRELLA CORPORATION", 30, 217);
        ctx.textAlign = "right"; ctx.fillText("U / " + String(i + 1).padStart(2, "0"), 480, 217);
        if (type === "screen") {
          ctx.strokeStyle = "#71b8a4"; ctx.lineWidth = 2; ctx.beginPath();
          for (let x = 30; x < 483; x += 5) {
            const y = 195 - (x % 73 < 12 ? 14 : 0) - Math.sin(x * 0.13) * 3;
            if (x === 30) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        if (type === "arrow") {
          ctx.fillStyle = "#b5c5ba"; ctx.fillRect(46, 63, 50, 12);
          ctx.beginPath(); ctx.moveTo(40, 69); ctx.lineTo(59, 50); ctx.lineTo(59, 88); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
    });
  }
  function decorateLab() {
    mat.floor.map = surfaceTexture("floor"); mat.wall.map = surfaceTexture("wall");
    mat.panel.map = mat.wall.map; mat.duct.map = mat.wall.map;
    const stainTexture = canvasTexture(256, 256, (ctx, w, h) => {
      for (let i = 0; i < 30; i++) {
        const x = 45 + random() * 166, y = 45 + random() * 166, radius = 12 + random() * 28;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, "rgba(17,30,28,0.1)"); gradient.addColorStop(1, "rgba(17,30,28,0)");
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
      }
    });
    const stainMaterial = new THREE.MeshBasicMaterial({ map: stainTexture, transparent: true,
      depthWrite: false, opacity: 0.7, toneMapped: false });
    for (const [x, z, w, d] of [[-3.2, -5, 6, 6], [3.2, -5, 6, 6], [-4.9, 9, 5.4, 5],
      [-20, 19, 7, 4], [-19, 1, 8, 5], [18, -18, 5, 5], [5, 14.5, 5, 4]])
      floorMark(x, z, w, d, stainMaterial, 0.012);
    const atlas = createSignAtlas();
    const signMaterial = standard(0xffffff, { map: atlas, roughness: 0.8, emissive: 0xffffff,
      emissiveMap: atlas, emissiveIntensity: 0.16 });
    const screenMaterial = standard(0xffffff, { map: atlas, roughness: 0.45, emissive: 0xffffff,
      emissiveMap: atlas, emissiveIntensity: 0.65 });
    const signGeometries = new Map();
    function plaque(id, x, y, z, w, h, yaw = 0, screen = false, pitch = 0) {
      if (!signGeometries.has(id)) {
        const geo = new THREE.PlaneGeometry(1, 1), uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i,
          (id % 4 + 0.008 + uv.getX(i) * 0.984) / 4,
          (3 - Math.floor(id / 4) + 0.015 + uv.getY(i) * 0.97) / 4);
        signGeometries.set(id, geo);
      }
      instance(signGeometries.get(id), screen ? screenMaterial : signMaterial,
        x, y, z, w, h, 1, pitch, yaw, 0, false);
    }
    function wallPlaque(id, x, y, z, w, h, yaw = 0) {
      instance(boxGeo, mat.steel, x, y, z, w + 0.16, h + 0.16, 0.1, 0, yaw, 0, false);
      plaque(id, x + Math.sin(yaw) * 0.061, y, z + Math.cos(yaw) * 0.061, w, h, yaw);
    }
    function monitor(x, y, z, yaw = 0, id = 8) {
      box(x, y + 0.1, z, 0.5, 0.12, 0.34, mat.dark, false, "Monitor", false);
      box(x, y + 0.3, z, 0.08, 0.4, 0.08, mat.steel, false, "Monitor", false);
      instance(boxGeo, mat.dark, x, y + 0.63, z, 1.07, 0.63, 0.13, 0, yaw, 0);
      plaque(id, x + Math.sin(yaw) * 0.072, y + 0.63, z + Math.cos(yaw) * 0.072,
        0.96, 0.53, yaw, true);
      // Follow the housing/screen surface; the bench already blocks navigation.
      collider(x, y + 0.63, z, 1.07, 0.63, 0.145, yaw, "Monitor housing", false);
    }
    function hazardEdge(x, z, w, d) {
      for (const side of [-1, 1]) {
        floorMark(x, z + side * (d / 2 + 0.14), w + 0.3, 0.18, mat.yellow, 0.022);
        for (let dx = -w / 2; dx < w / 2; dx += 0.45)
          floorMark(x + dx, z + side * (d / 2 + 0.14), 0.2, 0.18, mat.dark, 0.027);
      }
    }
    function luminaire(x, z, length = 2.8, warm = false) {
      // Suspend the fitting below the crossbeam instead of inside its flange.
      for (const end of [-1, 1]) box(x, 6.7, z + end * length * 0.35,
        0.045, 1, 0.045, mat.steel, false, "Lamp suspension", false);
      box(x, 6.1, z, 0.72, 0.2, length + 0.2, mat.dark, false, "Light housing", false);
      box(x, 5.98, z, 0.46, 0.055, length, warm ? mat.amberLight : mat.whiteLight,
        false, "Fluorescent lamp", false);
      for (const side of [-1, 1]) box(x + side * 0.27, 5.95, z, 0.045, 0.07,
        length, mat.steel, false, "Lamp guard", false);
    }
    function vent(x, y, z, w, h, yaw = 0) {
      instance(boxGeo, mat.dark, x, y, z, w, h, 0.06, 0, yaw, 0, false);
      const sx = Math.sin(yaw), sz = Math.cos(yaw);
      for (let dy = -h / 2 + 0.09; dy < h / 2; dy += 0.15)
        instance(boxGeo, mat.edge, x + sx * 0.047, y + dy, z + sz * 0.047,
          w - 0.12, 0.04, 0.03, 0, yaw, 0, false);
    }

    // Panel joints follow each actual wall segment and stop at real doorways.
    const walls = colliders.filter(mesh => /wall|partition|perimeter|bulkhead/.test(mesh.name) && mesh.scale.y === 7.2);
    for (const wall of walls) {
      const alongZ = wall.scale.x < wall.scale.z;
      const span = alongZ ? wall.scale.z : wall.scale.x, thickness = alongZ ? wall.scale.x : wall.scale.z;
      const n = Math.max(1, Math.round(span / 3.1));
      for (let i = 0; i <= n; i++) {
        const t = -span / 2 + i * span / n;
        box(wall.position.x + (alongZ ? 0 : t), 3.35,
          wall.position.z + (alongZ ? t : 0), alongZ ? thickness + 0.08 : 0.055,
          5.1, alongZ ? 0.055 : thickness + 0.08, mat.steel, false, "Wall seam", false);
      }
    }
    // Perimeter kick plates, impact rails, and exposed structural ribs.
    for (const x of [-26.56, 26.56]) {
      box(x, 0.35, 0, 0.11, 0.7, 57.2, mat.steel, false, "Wall skirting", false);
      box(x, 2.3, 0, 0.1, 0.18, 57.2, mat.equipment, false, "Wall stripe", false);
    }
    for (const z of [-28.56, 28.56]) {
      box(0, 0.35, z, 53.2, 0.7, 0.11, mat.steel, false, "Wall skirting", false);
      box(0, 2.3, z, 53.2, 0.18, 0.1, mat.equipment, false, "Wall stripe", false);
    }
    for (const z of [-25, -13, 1, 13, 25]) {
      box(0, 6.72, z, 20, 0.7, 0.3, mat.steel);
      box(0, 6.33, z, 20, 0.1, 0.58, mat.dark);
      for (const x of [-9.57, 9.57]) {
        // Keep the full doorway signage clear below the structural bracket.
        box(x, 5.6, z, 0.27, 1.4, 0.38, mat.steel);
        box(x, 6.24, z, 0.65, 0.22, 0.5, mat.edge);
      }
    }
    for (const x of [-18, -6.7, 6.7, 18])
      for (const z of [-23, -11, 1, 13, 24]) luminaire(x, z, x < -10 || x > 10 ? 3.7 : 2.7, x > 10);
    for (const x of [-4.9, 19.5]) {
      box(x, 5.95, -1, 1.25, 0.92, 52, mat.duct);
      box(x, 5.46, -1, 1.4, 0.08, 52, mat.steel);
      for (let z = -25; z <= 24; z += 3) {
        box(x, 5.95, z, 1.34, 1, 0.07, mat.edge, false, "Duct seam", false);
        box(x, 6.79, z, 0.07, 0.66, 0.07, mat.dark, false, "Duct hanger", false);
      }
    }
    const riserY = 4.14, riserHeight = 2.72;
    box(-4.9, riserY, 9, 1.24, riserHeight, 1.24, mat.duct);
    collider(-4.9, riserY, 9, 1.24, riserHeight, 1.24, 0, "Air handler riser", false);
    vent(-4.9, 1.64, 10.325, 2.7, 1.8);
    wallPlaque(12, -4.9, 0.45, 10.325, 1.28, 0.55);
    for (const x of [8.7, 9.1]) {
      cylinder(x, 5.75, -1, 0.11, 53, x < 9 ? mat.red : mat.edge, Math.PI / 2);
      for (let z = -24; z < 27; z += 4) cylinder(x, 5.75, z, 0.16, 0.1, mat.steel, Math.PI / 2);
    }
    // Ceiling cable trays: open slats, never a second spawn floor.
    for (const x of [-22, 14]) {
      for (const offset of [-0.44, 0.44]) box(x + offset, 6.38, 0, 0.06, 0.18, 54, mat.dark, false, "Cable tray", false);
      for (let z = -26; z < 27; z += 0.75) box(x, 6.3, z, 0.88, 0.05, 0.075, mat.steel, false, "Cable tray", false);
    }

    // Readable bulkhead signs, the central Umbrella seal, and sealed observation panes.
    for (const z of [-28.5, 28.5]) {
      const yaw = z < 0 ? 0 : Math.PI;
      box(0, 2.04, z, 8.2, 4.08, 0.19, mat.dark);
      collider(0, 2.04, z, 8.2, 4.08, 0.19, 0, "Sealed door frame", false);
      const doorFace = z + (z < 0 ? 0.12 : -0.12);
      box(0, 2, doorFace, 7.65, 3.78, 0.08, mat.panel);
      collider(0, 2, doorFace, 7.65, 3.78, 0.08, 0, "Sealed door panel", false);
      // Flush metal seams stay within the existing bullet-decal surface offset.
      for (let x = -3.6; x < 3.8; x += 0.45) box(x, 2,
        doorFace + (z < 0 ? 0.041 : -0.041), 0.04, 3.7, 0.003, mat.steel, false, "Bulkhead seams", false);
      wallPlaque(z < 0 ? 1 : 11, 0, 4.65, z + (z < 0 ? 0.15 : -0.15), 6.2, 1.12, yaw);
      wallPlaque(15, 0, 2.3, z + (z < 0 ? 0.23 : -0.23), 1.9, 1.65, yaw);
      collider(0, 2.3, z + (z < 0 ? 0.23 : -0.23), 2.06, 1.81, 0.122,
        0, "Sealed door emblem", false);
      for (const x of [-4.1, 4.1]) {
        box(x, 2.1, z, 0.23, 4.2, 0.48, mat.steel);
        box(x, 3.2, z + (z < 0 ? 0.25 : -0.25), 0.07, 1.3, 0.04, mat.amberLight, false, "Bulkhead indicator", false);
      }
    }
    wallPlaque(0, 0, 6.23, -28.45, 6.6, 1.12);
    for (const x of [-7.3, 7.3]) {
      box(x, 4.75, -28.44, 3.4, 2.2, 0.18, mat.dark);
      box(x, 4.75, -28.33, 3.13, 1.92, 0.04, mat.glass, false, "Sealed observation glazing", false);
      box(x, 4.75, -28.3, 0.065, 1.92, 0.05, mat.edge, false, "Glazing mullion", false);
      box(x, 4.74, -28.29, 3.12, 0.065, 0.05, mat.edge, false, "Glazing mullion", false);
    }
    for (const [x, doors, ids] of [[-10, LAB.westDoors, [3, 2, 13]], [10, LAB.eastDoors, [5, 4, 11]]]) {
      for (let i = 0; i < doors.length; i++) for (const side of [-1, 1])
        wallPlaque(ids[i], x + side * 0.36, 4.23, doors[i], 3.7, 0.83, side * Math.PI / 2);
    }
    wallPlaque(3, -26.43, 3.4, -21, 5.1, 1, Math.PI / 2);
    wallPlaque(2, -26.43, 3.8, 18, 5.1, 1, Math.PI / 2);
    wallPlaque(4, 26.43, 4.1, 3, 4.8, 1, -Math.PI / 2);
    wallPlaque(5, 26.43, 3.6, -20, 4.8, 1, -Math.PI / 2);

    // Containment vessels: pressure collars, protective cages, plumbing, gauges.
    for (let i = 0; i < LAB.tanks.length; i++) {
      const [x, z] = LAB.tanks[i]; hazardEdge(x, z, 3.8, 3.8);
      for (const y of [1.25, 3.08, 4.88])
        solidCylinder(x, y, z, 1.58, 0.12, mat.edge, "Containment pressure collar");
      cylinder(x, 5.56, z, 0.6, 0.37, mat.dark);
      cylinder(x, 6.48, z, 0.24, 1.65, mat.steel);
      for (const side of [-1, 1]) for (const front of [-1, 1]) {
        box(x + side * 1.16, 3.03, z + front * 1.16, 0.14, 4.1, 0.14, mat.steel);
        collider(x + side * 1.16, 3.03, z + front * 1.16, 0.14, 4.1, 0.14,
          0, "Containment cage upright", false);
        box(x + side * 1.17, 3.1, z + front * 1.25, 0.055, 2.6, 0.055, mat.cyanLight, false, "Containment indicator", false);
      }
      box(x, 0.56, z + 1.94, 1.48, 0.44, 0.13, mat.equipment);
      plaque(10, x, 0.59, z + 2.012, 1.25, 0.32);
      wallPlaque(15, x, 3.18, z + 1.53, 0.82, 0.7);
      wallPlaque(6, x, 1.76, z + 1.55, 1.04, 0.48);
      for (const front of [-1, 1]) {
        cylinder(x + 1.42, 1.6, z + front * 0.5, 0.075, 1.6, mat.edge);
        cylinder(x + 1.42, 2.4, z + front * 0.5, 0.14, 0.09, mat.red, 0, Math.PI / 2);
      }
    }
    for (const [x, z] of LAB.cryo) {
      for (const y of [0.84, 4.21])
        solidCylinder(x, y, z, 1.29, 0.2, mat.edge, "Cryogenic pressure collar");
      cylinder(x, 4.43, z, 0.43, 0.28, mat.steel);
      box(x, 2.5, z + 1.17, 0.66, 1.6, 0.11, mat.glass, false, "Cryogenic inspection panel", false);
      wallPlaque(10, x, 1.33, z + 1.19, 0.92, 0.38);
      box(x + 0.66, 3.2, z + 1.01, 0.07, 0.36, 0.05, mat.amberLight, false, "Cryogenic status", false);
      cylinder(x, 5.78, z, 0.1, 2.86, mat.steel);
    }

    // Laboratory furniture, drawer fronts, microscopes, reagent racks and trays.
    for (let i = 0; i < LAB.benches.length; i++) {
      const [x, z, w, d] = LAB.benches[i];
      for (let dx = -w / 2 + 0.55; dx < w / 2; dx += 1.1) for (const front of [-1, 1]) {
        box(x + dx, 0.61, z + front * (d / 2 - 0.01), 0.94, 0.73, 0.06, mat.panel, false, "Drawer front", false);
        box(x + dx, 0.79, z + front * (d / 2 + 0.04), 0.29, 0.035, 0.065, mat.steel, false, "Drawer handle", false);
      }
      monitor(x - w * 0.24, 1.2, z, 0, i === 1 ? 9 : 8);
      const mx = x + w * 0.22, mz = z + 0.3;
      box(mx, 1.24, mz, 0.62, 0.11, 0.48, mat.dark, false, "Microscope base", false);
      box(mx - 0.16, 1.49, mz - 0.1, 0.14, 0.52, 0.15, mat.ivory);
      cylinder(mx, 1.76, mz, 0.11, 0.46, mat.ivory, -0.43);
      cylinder(mx, 1.96, mz + 0.08, 0.085, 0.13, mat.dark, -0.43);
      box(mx + 0.05, 1.48, mz + 0.13, 0.34, 0.05, 0.28, mat.steel);
      box(x + 0.3, 1.22, z - 0.53, 1.07, 0.05, 0.42, mat.steel, false, "Reagent tray", false);
      for (let b = 0; b < 4; b++) {
        cylinder(x - 0.07 + b * 0.24, 1.39, z - 0.53, 0.065, 0.3, b % 2 ? mat.ivory : mat.glass);
        cylinder(x - 0.07 + b * 0.24, 1.56, z - 0.53, 0.068, 0.045, mat.dark);
      }
    }
    for (const [x, z, w, d, h] of LAB.cargo) {
      hazardEdge(x, z, w, d);
      for (const front of [-1, 1]) {
        for (const dx of [-w / 2 + 0.17, w / 2 - 0.17])
          box(x + dx, h / 2, z + front * (d / 2 + 0.025), 0.14, h + 0.02, 0.06, mat.steel);
        box(x, h - 0.1, z + front * (d / 2 + 0.04), w, 0.13, 0.07, mat.edge);
      }
      for (const dx of [-w * 0.28, w * 0.28]) box(x + dx, h + 0.028, z, 0.15, 0.05, d, mat.steel);
      wallPlaque(6, x, h * 0.53, z + d / 2 + 0.07, Math.min(w * 0.55, 1.6), 0.65);
    }
    for (const [x, z, w, d] of LAB.cabinets) {
      const yaw = x > 20 ? -Math.PI / 2 : Math.PI / 2;
      const face = x + (x > 20 ? -w / 2 : w / 2);
      const panelCount = Math.max(1, Math.round(d / 1.2)), panelPitch = d / panelCount;
      for (let i = 0; i < panelCount; i++) {
        const dz = -d / 2 + (i + 0.5) * panelPitch;
        instance(boxGeo, mat.equipment, face, 1.62, z + dz,
          Math.min(1.06, panelPitch - 0.1), 2.98, 0.07, 0, yaw, 0);
        plaque(9, face + Math.sin(yaw) * 0.044, 2.17, z + dz, 0.82, 0.5, yaw, true);
        vent(face + Math.sin(yaw) * 0.052, 0.88, z + dz, 0.77, 0.75, yaw);
        for (let j = 0; j < 3; j++) instance(boxGeo, j === 2 ? mat.amberLight : mat.cyanLight,
          face + Math.sin(yaw) * 0.06, 1.61, z + dz - 0.23 + j * 0.22,
          0.05, 0.05, 0.035, 0, yaw, 0, false);
      }
    }
    for (const x of [-2.6, -0.8, 1]) monitor(x, 1.26, -22.6, 0, 8);
    wallPlaque(1, -1.2, 0.65, -21.77, 3.5, 0.6);
    wallPlaque(6, 5.8, 0.69, -14.34, 1.9, 0.7);

    // Drainage channels and floor markings guide the ring without cluttering aim.
    for (const x of [-7.2, 7.2]) {
      floorMark(x, 0, 0.32, 54, mat.dark, 0.021);
      for (let z = -26.6; z < 27; z += 0.5) floorMark(x, z, 0.28, 0.055, mat.edge, 0.025);
    }
    for (const z of [-16, 4, 19]) {
      floorMark(0, z, 4, 0.1, mat.yellow, 0.022);
      for (const x of [-1.9, 1.9]) floorMark(x, z + 0.5, 0.1, 1.1, mat.yellow, 0.023);
    }
    // A few coherent utility details stay against walls or above player clearance.
    for (const [x, z, yaw] of [[-9.56, 7, Math.PI / 2], [9.56, 4, -Math.PI / 2], [-26.43, 12, Math.PI / 2]]) {
      const s = Math.sin(yaw);
      instance(boxGeo, mat.dark, x, 1.3, z, 0.8, 1.5, 0.16, 0, yaw, 0, false);
      cylinder(x + s * 0.16, 1.16, z, 0.14, 0.83, mat.red);
      cylinder(x + s * 0.16, 1.63, z, 0.07, 0.13, mat.steel);
      wallPlaque(12, x + s * 0.2, 2.18, z, 0.65, 0.3, yaw);
    }
    for (const [x, z] of [[-17, -11.55], [20, 16.45]]) {
      box(x, 3.46, z, 6.4, 0.08, 0.12, mat.amberLight, false, "Decontamination rail", false);
      for (const dx of [-3.11, 3.11]) box(x + dx, 2.72, z, 0.08, 1.48, 0.11, mat.edge);
    }
    for (const [x, z] of [[-9.5, -12], [9.5, 20], [26.4, -25]]) {
      const pulse = standard(0x9b4233, { emissive: 0xe6663e, emissiveIntensity: 0.5 });
      const beacon = new THREE.Mesh(cylinderGeo, pulse);
      beacon.position.set(x, 3.55, z); beacon.scale.set(0.16, 0.33, 0.16); root.add(beacon);
      box(x, 3.33, z, 0.48, 0.1, 0.4, mat.steel, false, "Warning beacon", false);
      warningMaterials.push({ material: pulse, phase: x * 0.6 });
    }
    for (const [x, y, z, color, intensity, distance] of [
      [0, 5.7, -5, 0x77c6bd, 34, 15], [-18, 5.8, 13, 0xbad9d0, 22, 17],
      [19, 4.9, -17, 0xe4ba81, 28, 17]
    ]) {
      const light = new THREE.PointLight(color, intensity, distance, 2);
      light.position.set(x, y, z); light.name = "Laboratory local fill"; root.add(light);
    }
  }
  function update(delta, camera) {
    elapsed += Math.min(delta, 0.05);
    for (const item of warningMaterials) item.material.emissiveIntensity =
      0.35 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed * 2.8 + item.phase));
    if (camera) navigation.updateTarget(camera.position);
  }
  function blocked(x, z, margin = 0.55) {
    if (Math.abs(x) > LAB.halfWidth - LAB.wall / 2 - margin || Math.abs(z) > LAB.halfDepth - LAB.wall / 2 - margin) return true;
    for (const b of obstacles) {
      const dx = x - b.x, dz = z - b.z, lx = b.cos * dx - b.sin * dz, lz = b.sin * dx + b.cos * dz;
      if (Math.abs(lx) < b.halfW + margin && Math.abs(lz) < b.halfD + margin) return true;
    }
    return false;
  }
  function createNavigation() {
    // A shared flood field routes the horde around the same solid footprints.
    const cellSize = 1, width = 58, origin = -29, count = width * width;
    const walkable = new Uint8Array(count), distance = new Int32Array(count), queue = new Int32Array(count);
    const directionTarget = new THREE.Vector3(), ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 30);
    let lastCell = -1, lastUpdate = -10;
    const cellX = i => origin + (i % width + 0.5) * cellSize, cellZ = i => origin + (Math.floor(i / width) + 0.5) * cellSize;
    for (let i = 0; i < count; i++) walkable[i] = blocked(cellX(i), cellZ(i), 0.62) ? 0 : 1;
    function cellAt(x, z) {
      const gx = Math.floor((x - origin) / cellSize), gz = Math.floor((z - origin) / cellSize);
      return gx < 0 || gz < 0 || gx >= width || gz >= width ? -1 : gz * width + gx;
    }
    function nearestCell(point) {
      const direct = cellAt(point.x, point.z);
      if (direct >= 0 && walkable[direct]) return direct;
      let best = -1, bestDistance = Infinity;
      for (let i = 0; i < count; i++) {
        if (!walkable[i]) continue;
        const d = (cellX(i) - point.x) ** 2 + (cellZ(i) - point.z) ** 2;
        if (d < bestDistance) { bestDistance = d; best = i; }
      }
      return best;
    }
    function updateTarget(point) {
      const cell = nearestCell(point);
      if (cell === lastCell || elapsed - lastUpdate < 0.2 && lastCell >= 0) return;
      lastCell = cell; lastUpdate = elapsed; distance.fill(-1);
      if (cell < 0) return;
      let head = 0, tail = 1; queue[0] = cell; distance[cell] = 0;
      while (head < tail) {
        const current = queue[head++], cx = current % width, cz = Math.floor(current / width);
        for (const offset of [-1, 1, -width, width]) {
          if (offset === -1 && cx === 0 || offset === 1 && cx === width - 1 || offset === -width && cz === 0 || offset === width && cz === width - 1) continue;
          const next = current + offset;
          if (!walkable[next] || distance[next] >= 0) continue;
          distance[next] = distance[current] + 1; queue[tail++] = next;
        }
      }
    }
    function hasLineOfSight(a, b, margin = 0.12) {
      if (Math.abs(b.x) > LAB.halfWidth - LAB.wall / 2 - margin || Math.abs(b.z) > LAB.halfDepth - LAB.wall / 2 - margin) return false;
      // Exact segment/expanded-box tests avoid clipping small corners between
      // samples, including laboratory equipment and bulkhead corners.
      for (const block of obstacles) {
        const ax = a.x - block.x, az = a.z - block.z;
        const bx = b.x - block.x, bz = b.z - block.z;
        const ox = block.cos * ax - block.sin * az;
        const oz = block.sin * ax + block.cos * az;
        const dx = block.cos * bx - block.sin * bz - ox;
        const dz = block.sin * bx + block.cos * bz - oz;
        let near = 0, far = 1, misses = false;
        for (const axis of [[ox, dx, block.halfW + margin], [oz, dz, block.halfD + margin]]) {
          const [start, delta, half] = axis;
          if (Math.abs(delta) < 1e-9) {
            if (Math.abs(start) >= half) { misses = true; break; }
            continue;
          }
          const first = (-half - start) / delta, second = (half - start) / delta;
          near = Math.max(near, Math.min(first, second));
          far = Math.min(far, Math.max(first, second));
          if (near >= far) { misses = true; break; }
        }
        if (!misses) return false;
      }
      return true;
    }
    function getMoveTarget(position, playerPosition) {
      updateTarget(playerPosition);
      if (hasLineOfSight(position, playerPosition, 0.58)) return playerPosition;
      let current = nearestCell(position);
      if (current < 0 || distance[current] < 0) return position;
      directionTarget.set(cellX(current), position.y, cellZ(current));
      for (let n = 0; n < 7; n++) {
        let next = current, best = distance[current]; const cx = current % width;
        for (const offset of [-1, 1, -width, width]) {
          if (offset === -1 && cx === 0 || offset === 1 && cx === width - 1) continue;
          const i = current + offset;
          if (i >= 0 && i < count && distance[i] >= 0 && distance[i] < best) { next = i; best = distance[i]; }
        }
        if (next === current) break;
        const candidate = { x: cellX(next), z: cellZ(next) };
        if (!hasLineOfSight(position, candidate, 0.58)) break;
        directionTarget.set(candidate.x, position.y, candidate.z); current = next;
      }
      return directionTarget;
    }
    function getSpawnPoint(playerPosition = world.spawn) {
      updateTarget(playerPosition);
      const start = Math.floor(Math.random() * count);
      for (let k = 0; k < count; k++) {
        const i = (start + k * 1543) % count;
        if (!walkable[i] || distance[i] < 0) continue;
        const x = cellX(i), z = cellZ(i), d = Math.hypot(x - playerPosition.x, z - playerPosition.z);
        if (d < 18 || d > 58) continue;
        ray.ray.origin.set(x, 16, z); const hits = ray.intersectObjects(floorObjects, false);
        if (hits.length) return hits[0].point.clone();
      }
      return null;
    }
    updateTarget(world.spawn);
    return {
      updateTarget, getMoveTarget, getSpawnPoint, hasLineOfSight,
      isWalkable: (x, z, margin = 0.58) => !blocked(x, z, margin),
      grid: { width, cellSize, origin, walkable, distance }
    };
  }
  function getRandomFloorPoint() { return navigation.getSpawnPoint(world.spawn); }
  function resetPlayer(player) { if (world.isLoaded) player.reset({ position: world.spawn.clone(), yaw: WORLD_SETTINGS.spawnYaw }); }
  function mulberry32(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5; let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}
