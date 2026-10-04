import * as THREE from 'three';

// Add a location here. Existing scenery builders can be reused with a new palette;
// a new visual theme needs one builder entry in sceneryBuilders inside createWorld.
// Distances are metres, speed is metres/second, and timeOfDay is a 24-hour value.
// Traffic weights are relative; pacing boundaries are fractions of location length.
const DEFAULT_PACING = [
  { until: 300 / 1400, phase: 'arrival', density: .78 },
  { until: 650 / 1400, phase: 'traffic', density: 1.05 },
  { until: 980 / 1400, phase: 'landmark', density: .86 },
  { until: 1170 / 1400, phase: 'traffic', density: 1.0 },
  { until: 1, phase: 'recovery', density: .72 }
];

export const WORLD_LOCATIONS = [
  {
    id: 'open-country', name: 'OPEN COUNTRY', length: 1400,
    palette: { grass: 0x557a48, shoulder: 0xc9bca2, leaves: 0x3d7444, bush: 0x527f45, rock: 0x8d8d83 },
    mountains: [0x506957, 0x667873, 0x82919a, 0x294936, .78],
    scenery: { builder: 'country', roadside: 'country', streetLights: false, foreground: ['grass', 'fence'] },
    landmarks: [{ at: 440, kind: 'overpass', variant: 'rural' }, { at: 1000, kind: 'station' }],
    traffic: { weights: { truck: .12, sport: .18, suv: .23, van: .13, sedan: .34 }, pacing: DEFAULT_PACING }
  },
  {
    id: 'pine-ridge', name: 'PINE RIDGE', length: 1400,
    palette: { grass: 0x385a3d, shoulder: 0xa99c82, leaves: 0x28553a, bush: 0x35633d, rock: 0x737970 },
    mountains: [0x355744, 0x516960, 0x768881, 0x1f3e2d, .98],
    scenery: { builder: 'pine', roadside: 'pine', streetLights: false, foreground: ['grass'] },
    landmarks: [{ at: 730, kind: 'tunnel', length: 160 }],
    traffic: { weights: { truck: .10, sport: .12, suv: .30, van: .14, sedan: .34 }, pacing: DEFAULT_PACING }
  },
  {
    id: 'red-rock', name: 'RED ROCK', length: 1400,
    palette: { grass: 0xa58a61, shoulder: 0xc59b68, leaves: 0x68713c, bush: 0x79743f, rock: 0xa76547 },
    mountains: [0x8b5a45, 0x9a735f, 0xb19a86, 0x4e5135, .38],
    scenery: { builder: 'canyon', roadside: 'canyon', streetLights: false, foreground: ['grass'] },
    landmarks: [{ at: 600, kind: 'tunnel', length: 190 }, { at: 1150, kind: 'overpass', variant: 'rural' }],
    traffic: { weights: { truck: .14, sport: .26, suv: .20, van: .10, sedan: .30 }, pacing: DEFAULT_PACING }
  },
  {
    id: 'industrial-belt', name: 'INDUSTRIAL BELT', length: 1400,
    palette: { grass: 0x59665a, shoulder: 0xa79f8d, leaves: 0x49604e, bush: 0x526453, rock: 0x777b79 },
    mountains: [0x53605d, 0x68716f, 0x87908f, 0x34413c, .34],
    scenery: { builder: 'industrial', roadside: 'industrial', streetLights: true, foreground: [] },
    landmarks: [{ at: 360, kind: 'overpass', variant: 'pipe' }, { at: 1000, kind: 'station' }],
    traffic: { weights: { truck: .29, sport: .08, suv: .12, van: .28, sedan: .23 }, pacing: DEFAULT_PACING }
  },
  {
    id: 'horizon-city', name: 'HORIZON CITY', length: 1400,
    palette: { grass: 0x4a5550, shoulder: 0x878b8b, leaves: 0x3f5848, bush: 0x46584c, rock: 0x686d72 },
    mountains: [0x4e5d62, 0x68757b, 0x8c989d, 0x34413e, .18],
    scenery: { builder: 'city', roadside: 'city', streetLights: true, foreground: [] },
    landmarks: [{ at: 500, kind: 'overpass', variant: 'rail' }, { at: 1020, kind: 'overpass', variant: 'rail' }],
    traffic: { weights: { truck: .10, sport: .22, suv: .15, van: .20, sedan: .33 }, pacing: DEFAULT_PACING }
  }
];

/**
 * Environment only: no input, HUD, score, vehicle, or game-state dependencies.
 * update({ dt, distance, speed, lateralOffset }) scrolls the road and scenery.
 * updateLocation({ dt, distance }) blends the location palette.
 * updateAtmosphere({ dt, timeOfDay, fog }) updates sky, fog, lights, and exposure.
 * reset({ distance, timeOfDay, lateralOffset, fog }) starts at a route position.
 * getLocation(distance), getTrafficSettings(distance), isInsideTunnel(z) are queries.
 * advanceTime(timeOfDay, dt) and getDayPhase(timeOfDay) share the world clock rules.
 * dispose() releases this instance's scene objects and graphics resources.
 */
export function createWorld({ scene, camera, renderer, locations = WORLD_LOCATIONS }) {
  const view = { distance: 0, lateralOffset: 0, timeOfDay: 8.5, fog: false };
  const ownedObjects = [];
  const previousScene = { background: scene.background, fog: scene.fog, exposure: renderer.toneMappingExposure };
  const addToScene = object => { scene.add(object); ownedObjects.push(object); };
  const sceneryBuilders = {
    country: (side, index, materials) => createCountryBlock(side, index),
    pine: (side, index, materials) => { const g = createPineStand(materials); if (side < 0) g.scale.x = -1; return g; },
    canyon: (side, index, materials) => createRockMonument(side, materials),
    industrial: side => createIndustrialYard(side),
    city: side => createCityBlock(side)
  };
  if (!locations.length) throw new Error('world.js needs at least one location.');
  const ids = new Set();
  let routeLength = 0;
  const environmentZones = locations.map((location, index) => {
    if (!location.id || ids.has(location.id) || !Number.isFinite(location.length) || location.length <= 0) throw new Error('Each world location needs a unique id and a positive length.');
    if (!sceneryBuilders[location.scenery.builder]) throw new Error(`Unknown scenery builder: ${location.scenery.builder}`);
    ids.add(location.id);
    const start = routeLength; routeLength += location.length;
    const palette = location.palette;
    return { ...location, index, start, end: routeLength, ...palette,
      grassColor: new THREE.Color(palette.grass), shoulderColor: new THREE.Color(palette.shoulder),
      leavesColor: new THREE.Color(palette.leaves), bushColor: new THREE.Color(palette.bush), rockColor: new THREE.Color(palette.rock) };
  });
  function getLocation(distance = view.distance) {
    const d = Math.max(0, distance), position = d % routeLength;
    const location = environmentZones.find(zone => position < zone.end) || environmentZones[environmentZones.length - 1];
    const localDistance = position - location.start;
    return { id: location.id, name: location.name, index: location.index, length: location.length,
      distance: localDistance, progress: localDistance / location.length,
      start: d - localDistance, settings: location };
  }
  function getTrafficSettings(distance = view.distance) {
    const location = getLocation(distance), traffic = location.settings.traffic;
    const pacing = traffic.pacing || DEFAULT_PACING;
    const stage = pacing.find(item => location.progress < item.until) || pacing[pacing.length - 1];
    return { phase: stage.phase, density: stage.density, weights: traffic.weights };
  }
  scene.background = new THREE.Color(0x91c8ff);
  scene.fog = new THREE.FogExp2(0xa9c6d4, .0058);
  const environmentFog = scene.fog;

  const hemi = new THREE.HemisphereLight(0xd8efff, 0x7a674e, 2.25);
  addToScene(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d2, 3.2);
  sun.position.set(-22, 35, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.025;
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 38;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 115;
  addToScene(sun);

  // Dynamic sky dome: gradient atmosphere plus a soft solar glow.
  const skyUniforms = {
    topColor: { value: new THREE.Color(0x62a9ee) },
    horizonColor: { value: new THREE.Color(0xc5e4fb) },
    sunDir: { value: new THREE.Vector3(-.3, .6, -.7).normalize() },
    sunColor: { value: new THREE.Color(0xffd6a2) },
    sunStrength: { value: 1.0 }
  };
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms,
    vertexShader: `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      uniform float sunStrength;
      void main(){
        float h = smoothstep(-0.12, 0.72, vDir.y);
        vec3 col = mix(horizonColor, topColor, h);
        float sd = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        float halo = pow(sd, 18.0) * 0.32 + pow(sd, 240.0) * 1.55;
        col += sunColor * halo * sunStrength;
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(560, 32, 18), skyMaterial);
  skyDome.renderOrder = -100;
  addToScene(skyDome);
  scene.background = new THREE.Color(0x071326);

  const moonLight = new THREE.DirectionalLight(0x9ebcff, 0.0);
  moonLight.position.set(40, 45, -90);
  addToScene(moonLight);
  moonLight.visible = false;

  function createStarField() {
    const count = 950;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const y = .05 + Math.random() * .95;
      const r = 470;
      const xz = Math.sqrt(1 - y * y) * r;
      pos[i*3] = Math.cos(theta) * xz;
      pos[i*3+1] = y * r;
      pos[i*3+2] = Math.sin(theta) * xz;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xeaf3ff, size: .85, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const pts = new THREE.Points(geo, mat);
    addToScene(pts);
    return pts;
  }
  const stars = createStarField();
  stars.visible = false;

  const world = new THREE.Group();
  addToScene(world);

  const roadSegments = [];
  const scenery = [];
  const roadFeatures = [];
  const majorFeatures = [];
  const zoneFeatures = [];
  const clouds = [];
  const cloudMaterials = [];
  const foregroundDetails = [];
  const cloudShadows = [];
  const ridgeLayers = [];
  const nightMaterials = [];
  // Dynamic world-level day/night cycle. Time keeps progressing across menu and
  // run restarts, while Pause and Game Over freeze the entire world.
  let nightFactor = 0;
  let daylightFactor = 1;
  let fogBankFactor = 0;
  let weatherRainStrength = 0; // retained for shared helpers; always zero in day/night mode
  const laneXs = [-5.2, -1.75, 1.75, 5.2];
  const ROAD_W = 18;
  const SEG_LEN = 36;
  const SEG_COUNT = 17;
  const PLAYER_Z = 3.2;
  const moodColor = new THREE.Color();
  const moodColor2 = new THREE.Color();
  const sunDirection = new THREE.Vector3(-.32, .72, -.62).normalize();
  const moonDirection = new THREE.Vector3();
  const dryRoadColor = new THREE.Color(0x2a2e32);
  const dryPatchColor = new THREE.Color(0x282c30);
  const DAY_CYCLE_SECONDS = 240; // one full 24-hour cycle in four real minutes
  const DAY_KEYS = [
    { h: 0.0,  top:0x071326, horizon:0x16213a, fog:0x1a2940, cloud:0x35455b, hemi:.26, sun:0.00, exposure:.58 },
    { h: 5.0,  top:0x152542, horizon:0x654f66, fog:0x4f5364, cloud:0x6f6d7d, hemi:.48, sun:.10, exposure:.66 },
    { h: 6.2,  top:0x344c75, horizon:0xf08f67, fog:0xb37d70, cloud:0xd4a49b, hemi:1.10, sun:1.15, exposure:.82 },
    { h: 8.2,  top:0x62a9ee, horizon:0xc5e4fb, fog:0xb6d6e8, cloud:0xf4f8fb, hemi:2.20, sun:3.00, exposure:1.03 },
    { h: 12.5, top:0x4e9feb, horizon:0xd4edff, fog:0xc2dfef, cloud:0xffffff, hemi:2.35, sun:3.25, exposure:1.06 },
    { h: 17.2, top:0x5f91c8, horizon:0xd8d7d0, fog:0xc0c3be, cloud:0xe9e1d8, hemi:1.95, sun:2.45, exposure:1.00 },
    { h: 18.7, top:0x3d4d79, horizon:0xf17b55, fog:0xa66f67, cloud:0xd18a79, hemi:1.15, sun:1.18, exposure:.84 },
    { h: 20.1, top:0x172641, horizon:0x3a3551, fog:0x303647, cloud:0x536072, hemi:.48, sun:.08, exposure:.66 },
    { h: 24.0, top:0x071326, horizon:0x16213a, fog:0x1a2940, cloud:0x35455b, hemi:.26, sun:0.00, exposure:.58 }
  ];


  const mats = {
    road: new THREE.MeshStandardMaterial({ color: 0x2a2e32, roughness: 0.93, metalness: 0.02 }),
    shoulder: new THREE.MeshStandardMaterial({ color: 0xc9bca2, roughness: 1 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x557a48, roughness: 1 }),
    lane: new THREE.MeshBasicMaterial({ color: 0xe8eef2 }),
    rail: new THREE.MeshStandardMaterial({ color: 0xb9c0c4, roughness: .55, metalness: .55 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x111820, roughness: .3, metalness: .35 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x101214, roughness: .85 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x76533a, roughness: 1 }),
    leaves: new THREE.MeshStandardMaterial({ color: 0x3d7444, roughness: 1 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x8d8d83, roughness: 1 }),
    trailer: new THREE.MeshStandardMaterial({ color: 0xd8dde0, roughness: .62, metalness: .18 }),
    dirt: new THREE.MeshStandardMaterial({ color: 0x9b845e, roughness: 1 }),
    bush: new THREE.MeshStandardMaterial({ color: 0x527f45, roughness: 1 }),
    signBlue: new THREE.MeshStandardMaterial({ color: 0x176aa5, roughness: .58, metalness: .08 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xb8b2a7, roughness: .92 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x596168, roughness: .62, metalness: .52 }),
    asphaltPatch: new THREE.MeshStandardMaterial({ color: 0x202429, roughness: .98 }),
    skid: new THREE.MeshBasicMaterial({ color: 0x17191b, transparent: true, opacity: .52 }),
    markerAmber: new THREE.MeshBasicMaterial({ color: 0xffd36b }),
    water: new THREE.MeshStandardMaterial({ color: 0x4e8ba2, roughness: .34, metalness: .12 }),
    industrial: new THREE.MeshStandardMaterial({ color: 0x7a858c, roughness: .78, metalness: .16 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x9c5a38, roughness: .84, metalness: .06 }),
    wornRoad: new THREE.MeshBasicMaterial({ color: 0x14181c, transparent: true, opacity: .065, depthWrite: false }),
    gravel: new THREE.MeshStandardMaterial({ color: 0x8f826b, roughness: 1 }),
    grassBlade: new THREE.MeshStandardMaterial({ color: 0x4b753f, roughness: 1, side: THREE.DoubleSide }),
    flower: new THREE.MeshBasicMaterial({ color: 0xf2d66f, side: THREE.DoubleSide }),
    reflectorRed: new THREE.MeshBasicMaterial({ color: 0xff3d3d }),
    tunnelStripe: new THREE.MeshBasicMaterial({ color: 0xf1d85d }),
    rim: new THREE.MeshStandardMaterial({ color: 0xaab2b7, roughness: .3, metalness: .82 })
  };

  // Shared city materials keep the fifth environment visually dense without creating
  // unique materials for every recycled city block. Emissive windows/lights are
  // driven by weather darkness and visibility.
  const cityWallMatA = new THREE.MeshStandardMaterial({ color: 0x6f7881, roughness: .82, metalness: .10 });
  const cityWallMatB = new THREE.MeshStandardMaterial({ color: 0x4e5863, roughness: .78, metalness: .14 });
  const cityRoofMat = new THREE.MeshStandardMaterial({ color: 0x303840, roughness: .74, metalness: .22 });
  const cityWindowMat = new THREE.MeshStandardMaterial({ color: 0x9bb6c8, roughness: .25, metalness: .18, emissive: 0xffd58a, emissiveIntensity: .18 });
  const cityLampMat = new THREE.MeshStandardMaterial({ color: 0xf0e3bd, roughness: .28, emissive: 0xffc86a, emissiveIntensity: .18 });
  nightMaterials.push(cityWindowMat, cityLampMat);

  function box(w, h, d, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    // Static environment geometry does not need to render into the shadow map.
    // Vehicle constructors explicitly enable shadows on their own meshes later.
    m.castShadow = false;
    m.receiveShadow = true;
    return m;
  }

  const _instanceDummy = new THREE.Object3D();
  function addInstancedBoxes(parent, specs, mat, castShadow = false, receiveShadow = true) {
    if (!specs.length) return null;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, specs.length);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    for (let i = 0; i < specs.length; i++) {
      const [w, h, d, x, y, z, ry = 0, rx = 0, rz = 0] = specs[i];
      _instanceDummy.position.set(x, y, z);
      _instanceDummy.rotation.set(rx, ry, rz);
      _instanceDummy.scale.set(w, h, d);
      _instanceDummy.updateMatrix();
      mesh.setMatrixAt(i, _instanceDummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    parent.add(mesh);
    return mesh;
  }

  function disableStaticShadowCasting(group) {
    group.traverse(o => { if (o.isMesh) o.castShadow = false; });
    return group;
  }

  const textPanelMaterials = new Map();
  function textPanelMaterial(lines, background = '#176aa5', foreground = '#ffffff') {
    const key = JSON.stringify([lines, background, foreground]);
    if (textPanelMaterials.has(key)) return textPanelMaterials.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 10; ctx.strokeRect(8, 8, 496, 240);
    ctx.fillStyle = foreground; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      const size = i === 0 ? 62 : 42;
      ctx.font = `900 ${size}px Arial, sans-serif`;
      ctx.fillText(line, 256, lines.length === 1 ? 128 : 92 + i * 78, 460);
    });
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    textPanelMaterials.set(key, mat);
    return mat;
  }
  function makeTextPanel(width, height, lines, background = '#176aa5', foreground = '#ffffff') {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), textPanelMaterial(lines, background, foreground));
    panel.castShadow = false;
    return panel;
  }

  // The highway is intentionally straight and flat. Earlier curved/elevated transforms
  // rotated independent rectangular road segments and exposed their joins.
  function roadCenterAtZ() { return 0; }
  function roadHeightAtZ() { return 0; }
  function roadYawAtZ() { return 0; }
  function roadPitchAtZ() { return 0; }

  function createRoadSegment(i) {
    const g = new THREE.Group();
    const seamlessDepth = SEG_LEN + .9;
    const grass = box(132, .06, seamlessDepth, mats.grass.clone()); grass.position.y = -.08; g.add(grass);
    const shoulder = box(ROAD_W + 3.2, .08, seamlessDepth, mats.shoulder.clone()); shoulder.position.y = -.025; g.add(shoulder);
    g.userData.groundMaterials = [grass.material, shoulder.material];
    const road = box(ROAD_W, .09, seamlessDepth, mats.road); road.position.y = .03; g.add(road);

    // Repeated road decoration is instanced. This preserves the detailed road but
    // collapses hundreds of per-segment draw calls into a handful of batches.
    const wearSpecs = [], gravelSpecs = [], laneSpecs = [], amberSpecs = [];
    const patchSpecs = [], skidSpecs = [], rustSpecs = [], railSpecs = [];

    for (const laneCenter of laneXs) {
      for (const dx of [-.52, .52]) wearSpecs.push([.54, .014, seamlessDepth, laneCenter + dx, .106, 0]);
    }
    for (const x of [-9.55, 9.55]) gravelSpecs.push([1.05, .018, seamlessDepth, x, .012, 0]);
    for (const x of [-8.48, 8.48]) laneSpecs.push([.14, .025, seamlessDepth, x, .096, 0]);

    for (const x of [-3.5, 0, 3.5]) {
      for (let z = -SEG_LEN / 2 + 4; z < SEG_LEN / 2; z += 10) laneSpecs.push([.14, .025, 4.4, x, .097, z]);
      for (let z = -SEG_LEN / 2 + 1.6; z < SEG_LEN / 2; z += 6.2) {
        const spec = [.13, .032, .22, x, .112, z];
        (i % 4 === 0 ? amberSpecs : laneSpecs).push(spec);
      }
    }

    for (let n = 0; n < 2; n++) {
      patchSpecs.push([.45 + Math.random() * 1.3, .012, 2.5 + Math.random() * 6,
        (Math.random() - .5) * 13.5, .102, (Math.random() - .5) * (SEG_LEN - 4), (Math.random() - .5) * .16]);
    }
    if (i % 3 === 0) {
      for (const x of [-1.1, 1.1]) skidSpecs.push([.11, .014, 6.5 + Math.random() * 5,
        x + (Math.random() - .5) * 2.1, .115, -2 + (Math.random() - .5) * 12, (Math.random() - .5) * .045]);
    }

    for (const side of [-1, 1]) {
      for (let z = -SEG_LEN / 2 + 1; z < SEG_LEN / 2; z += 2.4) {
        const spec = [.5, .022, 1.0, side * 8.72, .105, z];
        ((Math.floor(z / 2.4) + i) % 2 ? laneSpecs : rustSpecs).push(spec);
      }
      const railX = side * (ROAD_W / 2 + 1.15);
      railSpecs.push([.16, .56, seamlessDepth, railX, .46, 0]);
      for (let z = -SEG_LEN / 2 + 2.5; z < SEG_LEN / 2; z += 6) {
        railSpecs.push([.18, .82, .18, railX, .31, z]);
        laneSpecs.push([.09, .12, .04, railX - side * .11, .58, z]);
      }
    }

    addInstancedBoxes(g, wearSpecs, mats.wornRoad, false, false);
    addInstancedBoxes(g, gravelSpecs, mats.gravel, false, true);
    addInstancedBoxes(g, laneSpecs, mats.lane, false, false);
    addInstancedBoxes(g, amberSpecs, mats.markerAmber, false, false);
    addInstancedBoxes(g, patchSpecs, mats.asphaltPatch, false, true);
    addInstancedBoxes(g, skidSpecs, mats.skid, false, false);
    addInstancedBoxes(g, rustSpecs, mats.rust, false, true);
    addInstancedBoxes(g, railSpecs, mats.rail, false, true);

    g.position.z = -i * SEG_LEN;
    world.add(g);
    roadSegments.push(g);
  }
  for (let i = 0; i < SEG_COUNT; i++) createRoadSegment(i);

  // A broad static landscape floor extends beneath the distant mountain bands.
  // The scrolling road grass is intentionally narrower for performance, but without
  // this floor the sky could peek through below mountains outside that strip.
  const horizonGround = box(560, .05, 820, mats.grass);
  horizonGround.position.set(0, -.17, -330);
  horizonGround.receiveShadow = false;
  horizonGround.renderOrder = -4;
  world.add(horizonGround);

  // Lightweight layered mountain backdrop: three continuous ridges plus one instanced
  // tree-line band. This replaces the old collection of isolated cone mountains so the
  // horizon reads as one large landscape while staying very cheap to render.
  const ridgeDayColors = [new THREE.Color(0x526c61), new THREE.Color(0x64747f), new THREE.Color(0x82909a)];
  const ridgeWeatherColors = ridgeDayColors.map(c => c.clone());
  const ridgeBaseOpacity = [.82, .66, .50];
  const ridgeAtmosphereStrength = [.26, .50, .76];
  const ridgeParallaxStrength = [.13, .075, .035];
  const ridgeBasePositions = [];

  function mountainNoise(i, seed) {
    const x = Math.sin((i + 1) * (12.9898 + seed * .31)) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  }

  function createRidgeLayer(z, baseY, peakY, opacity, seed, layerIndex) {
    const points = 66;
    const width = 650;
    const verts = [];
    const colors = [];
    const indices = [];
    const landmarkCenter = 13 + ((seed * 11) % 39);
    for (let i = 0; i < points; i++) {
      const x = -width * .5 + i * (width / (points - 1));
      const broad = Math.sin(i * .205 + seed * 1.7) * (5.4 + layerIndex * 1.4);
      const medium = Math.sin(i * .53 + seed * .81) * (3.0 + layerIndex * .8);
      const fine = mountainNoise(i, seed) * (2.7 + layerIndex * .75);
      const d = (i - landmarkCenter) / (5.5 + layerIndex * 1.3);
      const landmark = Math.exp(-d * d) * (layerIndex === 1 ? 10 : layerIndex === 2 ? 15 : 6);
      const top = peakY + broad + medium + fine + landmark;
      verts.push(x, baseY, z, x, top, z);
      // A darker base and brighter crest gives the flat silhouette a sense of form
      // without lights, textures or extra draw calls.
      const baseShade = .52 + layerIndex * .055;
      const topShade = .90 + layerIndex * .03;
      colors.push(baseShade, baseShade, baseShade, topShade, topShade, topShade);
      if (i < points - 1) {
        const a = i * 2, b = a + 1, c = a + 2, d2 = a + 3;
        indices.push(a, c, b, b, c, d2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      color: ridgeDayColors[layerIndex], vertexColors: true, transparent: true,
      opacity, fog: true, side: THREE.DoubleSide, depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -3 + layerIndex * .1;
    mesh.userData.layerIndex = layerIndex;
    mesh.userData.parallaxPhase = seed * 1.91;
    addToScene(mesh);
    ridgeLayers.push(mesh);
    ridgeBasePositions.push({ x: 0, z });
    return mesh;
  }

  createRidgeLayer(-215, -6.0, 17, .82, 2.1, 0);
  createRidgeLayer(-305, -7.0, 28, .66, 5.7, 1);
  createRidgeLayer(-420, -8.0, 40, .50, 9.4, 2);

  // One instanced tree line masks the mountain/ground join and adds a near-horizon
  // scale cue. Keeping it as a single InstancedMesh costs only one extra draw call.
  const treeLineMaterial = new THREE.MeshBasicMaterial({ color: 0x294936, transparent: true, opacity: .74, fog: true, depthWrite: false });
  const treeLineGeometry = new THREE.ConeGeometry(.9, 4.8, 5);
  const treeLineCount = 104;
  const treeLine = new THREE.InstancedMesh(treeLineGeometry, treeLineMaterial, treeLineCount);
  const treeDummy = new THREE.Object3D();
  for (let i = 0; i < treeLineCount; i++) {
    const side = i < treeLineCount / 2 ? -1 : 1;
    const j = i % (treeLineCount / 2);
    const x = side * (16 + j * 3.05 + mountainNoise(i, 4.3) * 1.8);
    const z = -184 - (j % environmentZones.length) * 4.5 - Math.abs(mountainNoise(i, 8.1)) * 14;
    const h = .72 + (mountainNoise(i, 12.4) + 1) * .25;
    treeDummy.position.set(x, 2.1 * h - .12, z);
    treeDummy.scale.set(.72 + h * .22, h, .72 + h * .22);
    treeDummy.rotation.y = mountainNoise(i, 3.8) * .35;
    treeDummy.updateMatrix();
    treeLine.setMatrixAt(i, treeDummy.matrix);
  }
  treeLine.instanceMatrix.needsUpdate = true;
  treeLine.renderOrder = -1.8;
  addToScene(treeLine);

  // Current zone continuously tints the backdrop. updateMood() then pushes these
  // colors toward the fog color according to weather and layer distance.
  const mountainZonePalettes = environmentZones.map(location => location.mountains);
  let treeLineZoneOpacity = mountainZonePalettes[0][4];
  const mountainTargetColors = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];

  const sunDiscMaterial = new THREE.MeshBasicMaterial({ color: 0xffffe8, fog: false, transparent: true, opacity: 1, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  // The visible solar disc should remain self-luminous even when ACES exposure drops at dusk.
  sunDiscMaterial.toneMapped = false;
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(4.7, 24, 14), sunDiscMaterial);
  // Place the sun in the sky immediately so the loading/menu camera never sees
  // the sphere at the world origin before the first atmosphere update.
  sunDisc.position.copy(camera.position).add(new THREE.Vector3(-.32, .72, -.62).normalize().multiplyScalar(300));
  addToScene(sunDisc);

  function createSunGlowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,235,1)');
    g.addColorStop(.20, 'rgba(255,224,150,.88)');
    g.addColorStop(.55, 'rgba(255,173,86,.30)');
    g.addColorStop(1, 'rgba(255,140,50,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const sunGlowMaterial = new THREE.SpriteMaterial({
    map: createSunGlowTexture(), color: 0xffd28b, transparent: true, opacity: .74,
    depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false
  });
  sunGlowMaterial.toneMapped = false;
  const sunGlow = new THREE.Sprite(sunGlowMaterial);
  sunGlow.scale.set(27, 27, 1);
  sunGlow.position.copy(camera.position).add(new THREE.Vector3(-.32, .72, -.62).normalize().multiplyScalar(298));
  addToScene(sunGlow);

  const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(4.2, 22, 14), new THREE.MeshBasicMaterial({ color: 0xdce8ff, fog: false }));
  addToScene(moonDisc);

  function createSoftCloudTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0,0,256,256);
    const blobs = [
      [72,139,66],[118,110,78],[165,133,70],[126,157,84],[190,151,50],[48,157,45]
    ];
    for (const [x,y,r] of blobs) {
      const g = ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,'rgba(255,255,255,.95)');
      g.addColorStop(.46,'rgba(255,255,255,.72)');
      g.addColorStop(.78,'rgba(255,255,255,.22)');
      g.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x-r,y-r,r*2,r*2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const cloudTexture = createSoftCloudTexture();

  function createVolumetricCloud(scale = 1) {
    const g = new THREE.Group();
    // Several camera-facing layers distributed in 3D produce a lightweight volumetric cloud bank.
    const puffCount = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < puffCount; i++) {
      const mat = new THREE.SpriteMaterial({ map: cloudTexture, color: 0xffffff, transparent: true, opacity: .52, depthWrite: false, fog: true });
      const sp = new THREE.Sprite(mat);
      const px = (Math.random() - .5) * 14 * scale;
      const py = (Math.random() - .5) * 4.2 * scale;
      const pz = (Math.random() - .5) * 9 * scale;
      const sx = (7 + Math.random() * 8) * scale;
      const sy = (3.8 + Math.random() * 5) * scale;
      sp.position.set(px, py, pz);
      sp.scale.set(sx, sy, 1);
      sp.renderOrder = -5;
      g.add(sp); cloudMaterials.push(mat);
    }
    g.userData.drift = .45 + Math.random() * .48;
    g.userData.depthDrift = .08 + Math.random() * .12;
    return g;
  }
  for (let i = 0; i < 8; i++) {
    const c = createVolumetricCloud(.78 + Math.random() * 1.18);
    c.position.set((Math.random() - .5) * 230, 32 + Math.random() * 30, -95 - Math.random() * 255);
    addToScene(c); clouds.push(c);
  }

  // Soft cloud shadows slide over the road and nearby terrain.
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: cloudTexture, color: 0x18202a, transparent: true, opacity: .075, depthWrite: false, side: THREE.DoubleSide });
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(44 + Math.random()*26, 22 + Math.random()*18), mat);
    sh.rotation.x = -Math.PI/2;
    sh.position.set((Math.random()-.5)*80, .145, -35 - i*55);
    sh.userData.drift = 2.5 + Math.random()*2.5;
    addToScene(sh); cloudShadows.push(sh);
  }


  // Lightweight precipitation: one points draw call, activated only in rain/storm.
  const RAIN_COUNT = 700;
  const rainPositions = new Float32Array(RAIN_COUNT * 3);
  function resetRainDrop(i, initial = false) {
    const p = i * 3;
    // Keep precipitation concentrated around the viewer instead of far down-road.
    rainPositions[p] = (Math.random() - .5) * 34;
    rainPositions[p + 1] = 1.5 + Math.random() * 17;
    rainPositions[p + 2] = initial ? (-30 + Math.random() * 54) : (-34 - Math.random() * 18);
  }
  for (let i = 0; i < RAIN_COUNT; i++) resetRainDrop(i, true);
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMaterial = new THREE.PointsMaterial({ color: 0xd9ecf5, size: .12, transparent: true, opacity: 0, depthWrite: false, fog: true });
  const rainPoints = new THREE.Points(rainGeometry, rainMaterial);
  rainPoints.frustumCulled = false;
  rainPoints.visible = false;
  addToScene(rainPoints);

  const rainFollowPos = new THREE.Vector3();
  function updateRain(dt, worldSpeed = 0) {
    const strength = weatherRainStrength;
    rainPoints.visible = strength > .03;
    if (!rainPoints.visible) return;

    // Center the rain volume on the active camera. This works for both chase and
    // cockpit view and keeps precipitation visibly close to the windshield/car.
    camera.getWorldPosition(rainFollowPos);
    rainPoints.position.x = rainFollowPos.x;
    rainPoints.position.z = rainFollowPos.z;

    rainMaterial.opacity = .34 + strength * .54;
    const fall = 39 + strength * 34;
    const rush = 9 + worldSpeed * .72;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const p = i * 3;
      rainPositions[p + 1] -= fall * dt;
      rainPositions[p + 2] += rush * dt;
      if (rainPositions[p + 1] < .05 || rainPositions[p + 2] > 24) resetRainDrop(i, false);
    }
    rainGeometry.attributes.position.needsUpdate = true;
  }

  function createTree(scale = 1) {
    const g = new THREE.Group();
    const trunk = box(.42 * scale, 2.4 * scale, .42 * scale, mats.trunk); trunk.position.y = 1.2 * scale; g.add(trunk);
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.7 * scale, 4.0 * scale, 6), mats.leaves); c1.position.y = 3.5 * scale; c1.castShadow = true; g.add(c1);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.4 * scale, 3.3 * scale, 6), mats.leaves); c2.position.y = 5.1 * scale; c2.castShadow = true; g.add(c2);
    return g;
  }

  function createBillboard() {
    const g = new THREE.Group();
    const p1 = box(.24, 4, .24, mats.dark); p1.position.set(-2.8, 2, 0); g.add(p1);
    const p2 = p1.clone(); p2.position.x = 2.8; g.add(p2);
    const panel = box(6.6, 2.6, .25, cityRoofMat); panel.position.y = 4.6; g.add(panel);
    const face = makeTextPanel(6.35, 2.35, ['DRIVE', 'THE OPEN ROAD'], '#e72f7c'); face.position.set(0, 4.6, .136); g.add(face);
    return g;
  }

  function createBushCluster(scale = 1) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry((.65 + Math.random() * .45) * scale, 0), mats.bush);
      m.position.set((i - 1.5) * .8 * scale, (.55 + Math.random() * .3) * scale, (Math.random() - .5) * 1.4 * scale);
      m.scale.y = .7 + Math.random() * .45; m.castShadow = true; g.add(m);
    }
    return g;
  }

  function createRockCluster(scale = 1) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry((.75 + Math.random() * .65) * scale, 0), mats.rock);
      m.position.set((i - 1) * 1.25 * scale, (.55 + Math.random() * .35) * scale, (Math.random() - .5) * 1.5 * scale);
      m.scale.y = .65 + Math.random() * .65; m.rotation.set(Math.random(), Math.random(), Math.random()); m.castShadow = true; g.add(m);
    }
    return g;
  }

  function createUtilityPole() {
    const g = new THREE.Group();
    const pole = box(.24, 7.2, .24, mats.pole); pole.position.y = 3.6; g.add(pole);
    const arm = box(4.5, .16, .18, mats.pole); arm.position.y = 6.45; g.add(arm);
    for (const x of [-1.7, 0, 1.7]) {
      const insulator = new THREE.Mesh(new THREE.CylinderGeometry(.10,.10,.34,8), mats.dark);
      insulator.position.set(x, 6.62, 0); g.add(insulator);
    }
    return g;
  }

  function createRoadsideSign(zoneIndex = 0) {
    const g = new THREE.Group();
    const post1 = box(.14, 3.1, .14, mats.pole); post1.position.set(-1.05, 1.55, 0); g.add(post1);
    const post2 = post1.clone(); post2.position.x = 1.05; g.add(post2);
    const panel = box(3.2, 1.65, .16, mats.signBlue); panel.position.y = 3.15; g.add(panel);
    const face = makeTextPanel(3.0, 1.45, environmentZones[zoneIndex].name.split(' '), '#176aa5'); face.position.set(0, 3.15, .091); g.add(face);
    return g;
  }

  function createFarmBuilding(scale = 1) {
    const g = new THREE.Group();
    const body = box(5.8 * scale, 3.0 * scale, 5.0 * scale, mats.concrete); body.position.y = 1.5 * scale; g.add(body);
    const roofMat = mats.rust;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.3 * scale, 2.0 * scale, 4), roofMat); roof.position.y = 3.7 * scale; roof.rotation.y = Math.PI / 4; roof.scale.z = .8; g.add(roof);
    const door = box(1.8 * scale, 2.0 * scale, .12, mats.dark); door.position.set(0, 1.05 * scale, -2.56 * scale); g.add(door);
    return g;
  }


  function createGrassTuft(scale = 1) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(.12 * scale, .8 * scale, 3), mats.grassBlade);
      blade.position.set((i - 1) * .17 * scale, .36 * scale, (Math.random() - .5) * .18);
      blade.rotation.z = (i - 1) * .12; blade.castShadow = false; g.add(blade);
    }
    if (Math.random() < .24) {
      const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(.10 * scale, 0), mats.flower);
      flower.position.set(.08, .78 * scale, .04); flower.castShadow = false; g.add(flower);
    }
    return g;
  }
  function createFencePiece(scale = 1) {
    const g = new THREE.Group();
    const wood = mats.trunk;
    for (const x of [-1.8, 1.8]) { const post = box(.13, 1.15, .13, wood); post.position.set(x, .57, 0); g.add(post); }
    for (const y of [.45, .88]) { const rail = box(3.7, .10, .10, wood); rail.position.y = y; g.add(rail); }
    g.scale.setScalar(scale); return g;
  }
  function createForegroundDetail(z, side, i) {
    const fence = i % 11 === 0;
    const obj = fence ? createFencePiece(.9 + Math.random() * .25) : createGrassTuft(.7 + Math.random() * .85);
    obj.userData.side = side; obj.userData.kind = fence ? 'fence' : 'grass';
    obj.userData.offset = fence ? 12.0 + Math.random() * 2.2 : 10.4 + Math.random() * 5.4;
    obj.position.set(side * obj.userData.offset, 0, z);
    obj.rotation.y = (Math.random() - .5) * .25;
    world.add(obj); foregroundDetails.push(obj);
  }
  for (let i = 0; i < 62; i++) createForegroundDetail(-10 - Math.random() * 640, Math.random() < .5 ? -1 : 1, i);

  function zoneAtDistance(distance) { return getLocation(distance).index; }
  function routeDistanceAtZ(z) { return view.distance + PLAYER_Z - z; }
  function currentZoneIndex() { return zoneAtDistance(view.distance); }
  function currentZone() { return environmentZones[currentZoneIndex()]; }

  function disposeGroupGeometry(group) {
    const disposed = new Set();
    group.traverse(o => {
      if (o.isMesh && o.geometry && !disposed.has(o.geometry)) { disposed.add(o.geometry); o.geometry.dispose(); }
      if (o.isInstancedMesh) o.dispose();
    });
    while (group.children.length) group.remove(group.children[0]);
  }

  // Each roadside group keeps the palette of the route position where it is met.
  // Shared materials and instancing keep dense forests/frontage inexpensive to recycle.
  const zoneMaterials = environmentZones.map(z => ({
    ground: new THREE.MeshStandardMaterial({ color: z.grass, roughness: 1 }),
    leaves: new THREE.MeshStandardMaterial({ color: z.leaves, roughness: 1 }),
    rock: new THREE.MeshStandardMaterial({ color: z.rock, roughness: 1 })
  }));
  const fieldMat = new THREE.MeshStandardMaterial({ color: 0x8d9857, roughness: 1 });
  const pavementMat = new THREE.MeshStandardMaterial({ color: 0x656d73, roughness: 1 });
  const tunnelShadeMat = new THREE.MeshBasicMaterial({ color: 0x111925, transparent: true, opacity: .24, depthWrite: false });
  const poolCanvas = document.createElement('canvas'); poolCanvas.width = poolCanvas.height = 64;
  const poolCtx = poolCanvas.getContext('2d');
  const poolGradient = poolCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  poolGradient.addColorStop(0, 'rgba(255,219,145,.9)'); poolGradient.addColorStop(.4, 'rgba(255,211,128,.4)'); poolGradient.addColorStop(1, 'rgba(255,211,128,0)');
  poolCtx.fillStyle = poolGradient; poolCtx.fillRect(0, 0, 64, 64);
  const poolTexture = new THREE.CanvasTexture(poolCanvas); poolTexture.colorSpace = THREE.SRGBColorSpace;
  const lampPoolMat = new THREE.MeshBasicMaterial({ map: poolTexture, transparent: true, opacity: 0, depthWrite: false });
  const tunnelPoolMat = lampPoolMat.clone(); tunnelPoolMat.opacity = .25;
  // Two fixed, shadow-free lights illuminate nearby road/vehicles, not one light per prop.
  const roadLampLights = Array.from({ length: 2 }, () => {
    const light = new THREE.PointLight(0xffd59a, 0, 33, 1.6); addToScene(light); return light;
  });
  const lampWorldPosition = new THREE.Vector3();
  function addRoadLamp(parent, x, z, tunnel = false) {
    const height = tunnel ? 6.35 : 7.2;
    if (!tunnel) {
      addInstancedBoxes(parent, [[.16, height, .16, x, height / 2, z], [2.8, .15, .15, x - Math.sign(x) * 1.3, height, z]], mats.pole);
    }
    const lx = tunnel ? x : x - Math.sign(x) * 2.5;
    addInstancedBoxes(parent, [[.8, .10, .4, lx, height - .1, z]], cityLampMat, false, false);
    const anchor = new THREE.Object3D(); anchor.position.set(lx, height - .35, z);
    anchor.userData.roadLamp = true; anchor.userData.tunnelLamp = tunnel; parent.add(anchor);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(15, 27), tunnel ? tunnelPoolMat : lampPoolMat);
    pool.rotation.x = -Math.PI / 2; pool.position.set(lx, .137, z); parent.add(pool);
  }
  function collectFeatureDetails(g) {
    g.userData.lamps = []; g.userData.rotors = [];
    g.traverse(o => {
      if (o.userData.roadLamp) g.userData.lamps.push(o);
      if (o.userData.spinRotor) g.userData.rotors.push(o);
    });
  }
  function updateRoadLighting() {
    const candidates = [];
    for (const group of [...zoneFeatures, ...majorFeatures]) {
      if (group.position.z < -180 || group.position.z > 180) continue;
      for (const anchor of group.userData.lamps || []) {
        anchor.getWorldPosition(lampWorldPosition);
        if (Math.abs(lampWorldPosition.z - PLAYER_Z) < 38) candidates.push({ position: lampWorldPosition.clone(), tunnel: anchor.userData.tunnelLamp });
      }
    }
    candidates.sort((a, b) => Math.abs(a.position.z - PLAYER_Z) - Math.abs(b.position.z - PLAYER_Z));
    roadLampLights.forEach((light, i) => {
      const item = candidates[i];
      if (!item) { light.intensity = 0; return; }
      light.position.copy(item.position);
      const fade = 1 - THREE.MathUtils.smoothstep(Math.abs(item.position.z - PLAYER_Z), 22, 38);
      light.intensity = (item.tunnel ? 65 : 95 * nightFactor) * fade;
    });
  }
  function addShapeInstances(parent, geometry, specs, material) {
    const mesh = new THREE.InstancedMesh(geometry, material, specs.length);
    specs.forEach(([x, y, z, sx, sy, sz, ry = 0], i) => {
      _instanceDummy.position.set(x, y, z); _instanceDummy.scale.set(sx, sy, sz); _instanceDummy.rotation.set(0, ry, 0); _instanceDummy.updateMatrix();
      mesh.setMatrixAt(i, _instanceDummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  }
  function createSiloCluster() {
    const g = new THREE.Group();
    for (const x of [-2.1, 2.1]) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 5.4, 12), mats.trailer); body.position.set(x, 2.7, 0); g.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.55, 1.15, 12), mats.rust); roof.position.set(x, 5.95, 0); g.add(roof);
    }
    return g;
  }
  function createWindTurbine() {
    const g = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.32, .65, 16, 10), mats.trailer); mast.position.y = 8; g.add(mast);
    const rotor = new THREE.Group(); rotor.position.set(0, 16, 0); rotor.userData.spinRotor = true;
    for (let i = 0; i < 3; i++) {
      const blade = box(.32, 6, .16, mats.trailer); blade.geometry.translate(0, 3, 0); blade.rotation.z = i * Math.PI * 2 / 3; rotor.add(blade);
    }
    g.add(rotor); return g;
  }
  function addFence(parent, x, length = 76) {
    const specs = [[.12, .12, length, x, .55, 0], [.12, .12, length, x, 1.05, 0]];
    for (let z = -length / 2; z <= length / 2; z += 6) specs.push([.18, 1.35, .18, x, .65, z]);
    addInstancedBoxes(parent, specs, mats.trunk);
  }
  function createCountryBlock(side, index) {
    const g = new THREE.Group(), rows = [];
    for (let x = -10; x <= 18; x += 3.5) rows.push([1.6, .04, 73, x, -.015, 0]);
    addInstancedBoxes(g, rows, fieldMat); addFence(g, -side * 17);
    if (index % 3 === 0) {
      const barn = createFarmBuilding(1.8); barn.position.set(side * 5, 0, -14); barn.rotation.y = side * Math.PI / 2; g.add(barn);
      const silos = createSiloCluster(); silos.position.set(side * 9, 0, 12); g.add(silos);
    } else if (index % 3 === 1) {
      const turbine = createWindTurbine(); turbine.position.x = side * 15; g.add(turbine);
    }
    return g;
  }
  function createPineStand(materials) {
    const g = new THREE.Group(), trunks = [], lower = [], upper = [];
    for (let i = 0; i < 36; i++) {
      const x = -13 + Math.random() * 42, z = -36 + Math.random() * 72, s = 1.1 + Math.random() * 1.1;
      const groundY = Math.max(0, (Math.abs(x) - 8) * .10);
      trunks.push([.35 * s, 3 * s, .35 * s, x, groundY + 1.5 * s, z]);
      lower.push([x, groundY + 4.5 * s, z, 2.4 * s, 6 * s, 2.4 * s]);
      upper.push([x, groundY + 6.5 * s, z, 1.8 * s, 5 * s, 1.8 * s]);
    }
    addInstancedBoxes(g, trunks, mats.trunk);
    addShapeInstances(g, new THREE.ConeGeometry(1, 1, 7), lower.concat(upper), materials.leaves);
    addShapeInstances(g, new THREE.DodecahedronGeometry(1, 0), [[8, -1.4, 0, 21, 5, 38],[-8, -1.2, 17, 7, 3.4, 14]], materials.ground);
    return g;
  }
  function createRockMonument(side, materials) {
    const g = new THREE.Group(), rocks = [];
    for (let i = 0; i < 7; i++) {
      const height = 9 + Math.random() * 14;
      rocks.push([side * (2 + Math.random() * 15), height * .52, -32 + i * 10, 9 + Math.random() * 6, height, 12 + Math.random() * 6, Math.random() * .3]);
    }
    addShapeInstances(g, new THREE.DodecahedronGeometry(1, 0), rocks, materials.rock);
    addShapeInstances(g, new THREE.DodecahedronGeometry(1, 0), [[side * 14, -1.5, 0, 28, 7, 44]], materials.ground);
    return g;
  }
  function createIndustrialYard(side) {
    const g = new THREE.Group();
    addInstancedBoxes(g, [[42, .10, 76, 4 * side, -.025, 0]], pavementMat);
    addInstancedBoxes(g, [[15, 8, 28, 8 * side, 4, -12]], mats.industrial);
    addInstancedBoxes(g, [[16, .45, 29, 8 * side, 8.2, -12]], cityRoofMat);
    const doors = [], containers = [], yardMarks = [], fence = [];
    for (const z of [-21, -12, -3]) {
      doors.push([.15, 4, 5.5, side * .4, 2, z]);
      yardMarks.push([13, .025, .15, -side * 7, .08, z]);
    }
    for (let i = 0; i < 7; i++) containers.push([5.7, 2.6, 2.5, side * (2 + (i % 2) * 6), 1.3 + (i > 4 ? 2.6 : 0), 13 + (i % 3) * 3]);
    for (let z = -36; z <= 36; z += 6) fence.push([.12, 2, .12, -side * 17, 1, z]);
    fence.push([.12, .08, 75, -side * 17, 1.8, 0]);
    addInstancedBoxes(g, doors, mats.dark); addInstancedBoxes(g, containers, mats.rust); addInstancedBoxes(g, yardMarks, mats.lane); addInstancedBoxes(g, fence, mats.pole);
    for (const z of [-23, -7]) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(.65, .95, 17, 10), mats.rust); stack.position.set(side * 16, 8.5, z); g.add(stack);
      addInstancedBoxes(g, [[1.1, .3, 1.1, side * 16, 17, z]], mats.reflectorRed, false, false);
    }
    return g;
  }
  function createCityBlock(side) {
    const g = new THREE.Group(), bodyA = [], bodyB = [], roofs = [], windows = [];
    addInstancedBoxes(g, [[43, .12, 77, side * 4, -.015, 0]], pavementMat);
    addInstancedBoxes(g, [[3.5, .11, 77, -side * 16, .03, 0], [.3, .24, 77, -side * 18, .06, 0]], mats.concrete);
    for (let i = 0; i < 7; i++) {
      const front = i < 4, bx = side * (front ? -5 : 17), bz = front ? -28.5 + i * 19 : -25 + (i - 4) * 25;
      const w = front ? 13 : 15, d = front ? 17 : 19, h = front ? 12 + Math.random() * 13 : 30 + Math.random() * 28;
      (i % 2 ? bodyA : bodyB).push([w, h, d, bx, h / 2, bz]);
      roofs.push([w * .65, .8, d * .65, bx, h + .4, bz]);
      for (let y = 2.6; y < h - 1; y += 3.1) {
        for (let col = -1; col <= 1; col++) windows.push([.06, 1.15, 3.3, bx - side * (w / 2 + .035), y, bz + col * 4.7]);
        for (let col = -1; col <= 1; col++) windows.push([2.1, 1.15, .06, bx + col * 3.8, y, bz + d / 2 + .035]);
      }
    }
    addInstancedBoxes(g, bodyA, cityWallMatA); addInstancedBoxes(g, bodyB, cityWallMatB);
    addInstancedBoxes(g, roofs, cityRoofMat); addInstancedBoxes(g, windows, cityWindowMat, false, false);
    return g;
  }
  function buildZoneFeature(container, zoneIndex, side) {
    disposeGroupGeometry(container);
    const index = Math.floor(routeDistanceAtZ(container.position.z) / 76);
    const location = environmentZones[zoneIndex];
    const obj = sceneryBuilders[location.scenery.builder](side, index, zoneMaterials[zoneIndex]);
    obj.position.x = side * 32;
    container.add(obj);
    // Lamps stand at the highway edge, independently of building setbacks.
    if (location.scenery.streetLights) for (const z of [-19, 19]) addRoadLamp(container, side * 12, z);
    disableStaticShadowCasting(container); collectFeatureDetails(container);
    container.userData.side = side; container.userData.zoneIndex = zoneIndex;
    container.userData.routeDistance = routeDistanceAtZ(container.position.z);
  }
  function createZoneFeature(z, side) {
    const g = new THREE.Group(); g.position.z = z; g.userData.initialZ = z;
    buildZoneFeature(g, zoneAtDistance(routeDistanceAtZ(z)), side); world.add(g); zoneFeatures.push(g);
  }
  for (let i = 0; i < 20; i++) createZoneFeature(24 - Math.floor(i / 2) * 76, i % 2 ? -1 : 1);

  function buildSceneryItem(container, zi, side) {
    disposeGroupGeometry(container);
    const r = Math.random(), theme = environmentZones[zi].scenery.roadside; let obj, kind;
    if (r > .93) { obj = createRoadsideSign(zi); kind = 'sign'; }
    else if (theme === 'pine' || (theme === 'country' && r < .35)) { obj = createTree(theme === 'pine' ? 1.2 + Math.random() * .6 : .8 + Math.random() * .5); kind = 'tree'; }
    else if (theme === 'canyon') { obj = createRockCluster(.9 + Math.random() * 1.1); kind = 'rock'; }
    else if (theme === 'industrial') { obj = createUtilityPole(); kind = 'pole'; }
    else { obj = createBushCluster(.7 + Math.random() * .4); kind = 'bush'; }
    obj.traverse(o => { if (o.material === mats.leaves || o.material === mats.bush) o.material = zoneMaterials[zi].leaves; if (o.material === mats.rock) o.material = zoneMaterials[zi].rock; });
    const offset = kind === 'sign' ? 12.8 : (theme === 'industrial' || theme === 'city') ? 13.5 : 14.5 + Math.random() * 4;
    obj.position.x = side * offset;
    container.add(obj); disableStaticShadowCasting(container);
    container.userData.side = side; container.userData.kind = kind; container.userData.zoneIndex = zi;
    container.userData.routeDistance = routeDistanceAtZ(container.position.z);
  }
  function createSceneryItem(z, side) {
    const g = new THREE.Group(); g.position.z = z; g.userData.initialZ = z;
    buildSceneryItem(g, zoneAtDistance(routeDistanceAtZ(z)), side); world.add(g); scenery.push(g);
  }
  for (let i = 0; i < 48; i++) createSceneryItem(-i * 14, i % 2 ? -1 : 1);
  function updateGantrySign(g) {
    const zi = zoneAtDistance(routeDistanceAtZ(g.position.z));
    g.userData.faces[0].material = textPanelMaterial(environmentZones[zi].name.split(' '));
    g.userData.faces[1].material = textPanelMaterial(['NEXT', environmentZones[(zi + 1) % environmentZones.length].name]);
    g.userData.zoneIndex = zi;
  }
  function createOverheadGantry(z) {
    const g = new THREE.Group();
    addInstancedBoxes(g, [[.3, 7.8, .3, -10.6, 3.9, 0],[.3, 7.8, .3, 10.6, 3.9, 0],[21.5, .25, .3, 0, 7.5, 0]], mats.pole);
    const faces = [makeTextPanel(6.1, 1.8, ['OPEN', 'COUNTRY']), makeTextPanel(6.1, 1.8, ['NEXT', 'PINE RIDGE'])];
    faces.forEach((face, i) => { face.position.set(i ? 3.8 : -3.8, 6.55, .18); g.add(face); });
    g.userData.faces = faces; g.userData.initialZ = z; g.position.z = z; updateGantrySign(g);
    world.add(g); roadFeatures.push(g);
  }
  for (const z of [-180, -440, -700]) createOverheadGantry(z);

  function createOverpass(zoneIndex, landmark) {
    const g = new THREE.Group(), industrial = landmark.variant === 'pipe', city = landmark.variant === 'rail';
    const specs = [[1.2, 7.4, 1.4, -12, 3.7, 0],[1.2, 7.4, 1.4, 12, 3.7, 0]];
    if (industrial) {
      specs.push([45, .45, 4, 0, 7.4, 0]);
      for (const z of [-1.3, 1.3]) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.65, .65, 48, 10), mats.rust); pipe.rotation.z = Math.PI / 2; pipe.position.set(0, 8.2, z); g.add(pipe);
      }
    } else {
      specs.push([60, .7, 7, 0, 7.3, 0],[60, .9, .35, 0, 8.05, -3.4],[60, .9, .35, 0, 8.05, 3.4]);
      if (city) {
        addInstancedBoxes(g, [[38, 2.3, 2.8, -8, 9.55, 0]], mats.trailer);
        addInstancedBoxes(g, Array.from({length: 12}, (_,i)=>[1.6, .85, .08, -24 + i * 3, 9.85, 1.44]), cityWindowMat, false, false);
      } else {
        addShapeInstances(g, new THREE.DodecahedronGeometry(1, 0), [[-35, 0, 0, 20, 8, 14],[35, 0, 0, 20, 8, 14]], zoneMaterials[zoneIndex].ground);
      }
    }
    addInstancedBoxes(g, specs, industrial ? mats.industrial : mats.concrete);
    g.userData.halfLength = 15; return g;
  }
  function createTunnel(zoneIndex, landmark) {
    const g = new THREE.Group(), length = landmark.length || 160;
    const walls = [[1.6, 7.5, length, -10.1, 3.75, 0],[1.6, 7.5, length, 10.1, 3.75, 0],[22, 1.0, length, 0, 7.15, 0]];
    const trim = [], stripes = [], rocks = [];
    for (let z = -length / 2; z <= length / 2; z += 20) {
      trim.push([21.8, .28, .45, 0, 6.5, z]);
      for (const side of [-1, 1]) {
        stripes.push([.055, .15, 16, side * 9.27, 1.1, z + 2]);
        rocks.push([side * 19, 1, z, 8, 11 + Math.random() * 6, 15]);
      }
      // A rock ridge covers the roof; its underside stays above the portal.
      rocks.push([0, 13.5, z, 13, 5.5 + Math.random(), 16]);
      if (z > -length / 2 && z < length / 2) addRoadLamp(g, 0, z, true);
    }
    addInstancedBoxes(g, walls, mats.concrete); addInstancedBoxes(g, trim, mats.dark); addInstancedBoxes(g, stripes, mats.tunnelStripe, false, false);
    addShapeInstances(g, new THREE.DodecahedronGeometry(1, 0), rocks, zoneMaterials[zoneIndex].rock);
    addInstancedBoxes(g, [[18.5, .005, length, 0, .125, 0]], tunnelShadeMat, false, false);
    g.userData.halfLength = length / 2; return g;
  }
  function createServiceStation() {
    const g = new THREE.Group();
    addInstancedBoxes(g, [[27, .1, 40, 25, -.01, 0]], pavementMat);
    addInstancedBoxes(g, [[12, 4.5, 9, 30, 2.25, -8]], mats.concrete);
    addInstancedBoxes(g, [[.14, 2, 7, 23.9, 2.2, -8]], cityWindowMat, false, false);
    addInstancedBoxes(g, [[12.5, .45, 10, 18, 5.2, 9],[.3, 5, .3, 12.3, 2.5, 9],[.3, 5, .3, 23.7, 2.5, 9]], mats.trailer);
    addInstancedBoxes(g, [[.8, 1.5, .7, 15, .75, 9],[.8, 1.5, .7, 20, .75, 9]], mats.dark);
    const sign = makeTextPanel(4, 2, ['HORIZON', 'SERVICES']); sign.position.set(14, 5.3, 18); g.add(sign);
    addRoadLamp(g, 13, -14); addRoadLamp(g, 13, 14); g.userData.halfLength = 22; return g;
  }
  // Authored route beats: farms -> forest tunnel -> canyon -> pipe bridge -> city rail.
  const majorRoute = environmentZones.flatMap(location => (location.landmarks || []).map(landmark => {
    if (!(landmark.at >= 0 && landmark.at < location.length) || !['overpass', 'tunnel', 'station'].includes(landmark.kind)) throw new Error(`Invalid landmark in ${location.id}`);
    return { ...landmark, distance: location.start + landmark.at, zoneIndex: location.index };
  })).sort((a, b) => a.distance - b.distance);
  let nextMajorFeature = 0;
  function buildNextMajorFeature(container) {
    disposeGroupGeometry(container);
    const landmark = majorRoute[nextMajorFeature % majorRoute.length];
    const { kind } = landmark;
    const distance = Math.floor(nextMajorFeature / majorRoute.length) * routeLength + landmark.distance;
    nextMajorFeature++;
    const zi = zoneAtDistance(distance);
    const obj = kind === 'tunnel' ? createTunnel(zi, landmark) : kind === 'station' ? createServiceStation() : createOverpass(zi, landmark);
    container.add(obj); container.position.set(0, 0, PLAYER_Z + view.distance - distance);
    container.userData.kind = kind; container.userData.zoneIndex = zi; container.userData.routeDistance = distance;
    container.userData.halfLength = obj.userData.halfLength;
    disableStaticShadowCasting(container); collectFeatureDetails(container);
  }
  for (let i = 0; i < (majorRoute.length ? 4 : 0); i++) {
    const g = new THREE.Group(); buildNextMajorFeature(g); world.add(g); majorFeatures.push(g);
  }
  function blendRouteGround(distance, output, property) {
    const location = getLocation(distance), zi = location.index;
    const blend = THREE.MathUtils.smoothstep(location.distance, Math.max(0, location.length - 210), location.length);
    output.copy(environmentZones[zi][property]).lerp(environmentZones[(zi + 1) % environmentZones.length][property], blend);
  }
  function resetRouteScenery() {
    roadSegments.forEach((g, i) => { g.position.z = -i * SEG_LEN; });
    zoneFeatures.forEach(g => { g.position.z = g.userData.initialZ; buildZoneFeature(g, zoneAtDistance(routeDistanceAtZ(g.position.z)), g.userData.side); });
    scenery.forEach(g => { g.position.set(0, 0, g.userData.initialZ); g.visible = true; g.scale.setScalar(1); buildSceneryItem(g, zoneAtDistance(routeDistanceAtZ(g.position.z)), g.userData.side); });
    roadFeatures.forEach(g => { g.position.z = g.userData.initialZ; updateGantrySign(g); });
    const loop = Math.floor(view.distance / routeLength);
    nextMajorFeature = loop * majorRoute.length;
    while (majorRoute.length && Math.floor(nextMajorFeature / majorRoute.length) * routeLength + majorRoute[nextMajorFeature % majorRoute.length].distance < view.distance - 180) nextMajorFeature++;
    majorFeatures.forEach(buildNextMajorFeature);
    foregroundDetails.forEach((g, i) => { g.position.z = -i * 10.5; g.visible = true; });
    updateRoad(0, 0); updateEnvironment(1); updateMood(0);
  }

  function updateRoad(dt, worldSpeed) {
    for (const seg of roadSegments) {
      seg.position.z += worldSpeed * dt;
      if (seg.position.z > SEG_LEN) seg.position.z -= SEG_LEN * SEG_COUNT;
      seg.position.x = 0;
      seg.position.y = 0;
      seg.rotation.set(0, 0, 0);
    }
    for (const seg of roadSegments) {
      blendRouteGround(routeDistanceAtZ(seg.position.z), seg.userData.groundMaterials[0].color, 'grassColor');
      blendRouteGround(routeDistanceAtZ(seg.position.z), seg.userData.groundMaterials[1].color, 'shoulderColor');
    }
    for (const item of scenery) {
      item.position.z += worldSpeed * dt;
      if (item.position.z > 80) {
        item.position.z -= 672;
        buildSceneryItem(item, zoneAtDistance(routeDistanceAtZ(item.position.z)), item.userData.side);
      }
    }
    for (const feature of roadFeatures) {
      feature.position.z += worldSpeed * dt;
      if (feature.position.z > 70) { feature.position.z -= 780; updateGantrySign(feature); }
    }
    for (const feature of majorFeatures) {
      feature.position.z += worldSpeed * dt;
      if (feature.position.z > feature.userData.halfLength + 90) buildNextMajorFeature(feature);
    }
    for (const feature of zoneFeatures) {
      feature.position.z += worldSpeed * dt;
      if (feature.position.z > 92) {
        feature.position.z -= 760;
        buildZoneFeature(feature, zoneAtDistance(routeDistanceAtZ(feature.position.z)), feature.userData.side);
      }
    }
    for (const detail of foregroundDetails) {
      detail.position.z += worldSpeed * dt;
      if (detail.position.z > 34) {
        detail.position.z -= 650 + Math.random() * 90;
        detail.userData.side = Math.random() < .5 ? -1 : 1;
        detail.userData.offset = detail.userData.kind === 'fence' ? 12 + Math.random() * 2.2 : 10.4 + Math.random() * 5.4;
        detail.rotation.y = (Math.random() - .5) * .25;
      }
      detail.position.x = detail.userData.side * detail.userData.offset;
      const detailZone = zoneAtDistance(routeDistanceAtZ(detail.position.z));
      detail.visible = environmentZones[detailZone].scenery.foreground.includes(detail.userData.kind);
    }
    for (const feature of zoneFeatures) for (const rotor of feature.userData.rotors || []) rotor.rotation.z -= dt * .72;
    updateRoadLighting();
    // Extremely slow background parallax preserves the feeling of a vast landscape.
    // Steering shifts the nearer ridge slightly more than the far horizon.
    for (let i = 0; i < ridgeLayers.length; i++) {
      const ridge = ridgeLayers[i];
      ridge.userData.parallaxPhase += worldSpeed * dt * (0.000020 + i * 0.000006);
      ridge.position.x = -view.lateralOffset * ridgeParallaxStrength[i] + Math.sin(ridge.userData.parallaxPhase) * (1.55 - i * .38);
    }
    treeLine.position.x = -view.lateralOffset * .17 + Math.sin((ridgeLayers[0]?.userData.parallaxPhase || 0) + .8) * 1.6;
    for (const cloud of clouds) {
      cloud.position.x += cloud.userData.drift * dt;
      cloud.position.z += cloud.userData.depthDrift * dt;
      if (cloud.position.x > 135) cloud.position.x = -135;
      if (cloud.position.z > -55) cloud.position.z = -340;
    }
    for (const sh of cloudShadows) {
      sh.position.x += sh.userData.drift * dt;
      sh.position.z += worldSpeed * dt * .18 + .35 * dt;
      if (sh.position.x > 70) sh.position.x = -70;
      if (sh.position.z > 32) { sh.position.z = -260 - Math.random() * 90; sh.position.x = (Math.random() - .5) * 120; }
    }
  }

  function updateEnvironment(dt) {
    const zi = currentZoneIndex();
    const z = environmentZones[zi];
    const blend = 1 - Math.pow(.025, dt);
    blendRouteGround(view.distance, moodColor, 'grassColor');
    mats.grass.color.lerp(moodColor, blend);
    mats.shoulder.color.lerp(z.shoulderColor, blend);
    mats.leaves.color.lerp(z.leavesColor, blend);
    mats.bush.color.lerp(z.bushColor, blend);
    mats.grassBlade.color.lerp(z.leavesColor, blend * .82);
    mats.rock.color.lerp(z.rockColor, blend);
    const location = getLocation(view.distance);
    const mountainBlend = THREE.MathUtils.smoothstep(location.distance, Math.max(0, location.length - 250), location.length);
    const mountainPalette = mountainZonePalettes[zi];
    const nextMountainPalette = mountainZonePalettes[(zi + 1) % environmentZones.length];
    for (let i = 0; i < ridgeWeatherColors.length; i++) {
      mountainTargetColors[i].setHex(mountainPalette[i]).lerp(moodColor.setHex(nextMountainPalette[i]), mountainBlend);
      ridgeWeatherColors[i].lerp(mountainTargetColors[i], blend * .55);
    }
    mountainTargetColors[3].setHex(mountainPalette[3]).lerp(moodColor.setHex(nextMountainPalette[3]), mountainBlend);
    treeLineMaterial.color.lerp(mountainTargetColors[3], blend * .55);
    treeLineZoneOpacity = THREE.MathUtils.lerp(treeLineZoneOpacity, mountainPalette[4], blend * .55);

  }

  function sampleDayPalette(hour) {
    let a = DAY_KEYS[0], b = DAY_KEYS[1];
    for (let i = 0; i < DAY_KEYS.length - 1; i++) {
      if (hour >= DAY_KEYS[i].h && hour < DAY_KEYS[i + 1].h) {
        a = DAY_KEYS[i]; b = DAY_KEYS[i + 1]; break;
      }
    }
    const span = Math.max(.001, b.h - a.h);
    const t = THREE.MathUtils.smoothstep((hour - a.h) / span, 0, 1);
    return { a, b, t };
  }

  function dayPhaseLabel(hour) {
    if (hour >= 5.2 && hour < 7.8) return 'DAWN';
    if (hour >= 7.8 && hour < 17.5) return 'DAY';
    if (hour >= 17.5 && hour < 20.2) return 'SUNSET';
    return 'NIGHT';
  }

  function updateMood(dt = 0) {
    const hour = view.timeOfDay;
    const { a, b, t } = sampleDayPalette(hour);
    const lerpN = (x, y) => THREE.MathUtils.lerp(x, y, t);
    const colorLerp = (out, x, y) => out.set(x).lerp(new THREE.Color(y), t);

    const theta = ((hour - 6) / 24) * Math.PI * 2;
    const sunElevation = Math.sin(theta);
    sunDirection.set(Math.cos(theta) * .78, sunElevation, -.58).normalize();
    moonDirection.copy(sunDirection).multiplyScalar(-1);

    daylightFactor = THREE.MathUtils.smoothstep(sunElevation, -.10, .20);
    nightFactor = 1 - THREE.MathUtils.smoothstep(sunElevation, -.14, .08);
    weatherRainStrength = 0;

    sun.position.copy(sunDirection).multiplyScalar(95);
    sunDisc.position.copy(camera.position).addScaledVector(sunDirection, 300);
    sunGlow.position.copy(camera.position).addScaledVector(sunDirection, 298);
    moonLight.position.copy(moonDirection).multiplyScalar(95);
    moonDisc.position.copy(moonDirection).multiplyScalar(300);

    colorLerp(moodColor, a.top, b.top);
    colorLerp(moodColor2, a.horizon, b.horizon);
    skyUniforms.topColor.value.copy(moodColor);
    skyUniforms.horizonColor.value.copy(moodColor2);
    skyUniforms.sunDir.value.copy(sunDirection);
    skyUniforms.sunStrength.value = Math.max(0, daylightFactor * (0.75 + (1 - Math.abs(sunElevation)) * .28));
    skyUniforms.sunColor.value.set(0xffd3a2).lerp(new THREE.Color(0xfff1c8), THREE.MathUtils.clamp(sunElevation * 1.6, 0, 1));

    colorLerp(moodColor, a.fog, b.fog);
    scene.fog.color.copy(moodColor);
    const baseFogDensity = THREE.MathUtils.lerp(.0067, .0055, daylightFactor);
    const fogBankTarget = view.fog ? 1 : 0;
    const fogBankBlend = 1 - Math.pow(.004, Math.max(dt, .016));
    fogBankFactor = THREE.MathUtils.lerp(fogBankFactor, fogBankTarget, fogBankBlend);
    scene.fog.density = THREE.MathUtils.lerp(baseFogDensity, .0145, fogBankFactor);

    hemi.intensity = lerpN(a.hemi, b.hemi) + nightFactor * .22;
    hemi.color.set(0x8ca8d0).lerp(new THREE.Color(0xd8efff), daylightFactor);
    hemi.groundColor.set(0x263240).lerp(new THREE.Color(0x7a674e), daylightFactor);

    sun.intensity = lerpN(a.sun, b.sun) * daylightFactor;
    const sunWarm = THREE.MathUtils.clamp((sunElevation + .03) / .45, 0, 1);
    sun.color.set(0xff9b68).lerp(new THREE.Color(0xfff0d2), sunWarm);

    const sunVisibility = THREE.MathUtils.smoothstep(sunElevation, -.035, .055);
    sunDisc.visible = sunVisibility > .01;
    sunGlow.visible = sunDisc.visible;
    sunDisc.material.opacity = sunVisibility;
    sunDisc.material.color.set(0xffffe8).lerp(new THREE.Color(0xfff7d6), sunWarm);
    sunGlow.material.color.set(0xff7b4d).lerp(new THREE.Color(0xffd89a), sunWarm);
    sunGlow.material.opacity = .25 + sunVisibility * .48;

    moonLight.visible = nightFactor > .015;
    moonLight.intensity = nightFactor * .85;
    moonDisc.visible = nightFactor > .08 && moonDirection.y > -.08;
    moonDisc.material.toneMapped = false;
    stars.visible = nightFactor > .02;
    stars.material.opacity = Math.pow((1 - THREE.MathUtils.smoothstep(sunElevation, -.40, -.12)), 1.5) * .82;

    colorLerp(moodColor, a.cloud, b.cloud);
    for (const mat of cloudMaterials) {
      mat.color.copy(moodColor);
      mat.opacity = THREE.MathUtils.lerp(.42, .54, daylightFactor) + fogBankFactor * .08;
    }
    for (const sh of cloudShadows) sh.material.opacity = .072 * daylightFactor * (1 - fogBankFactor * .65);
    for (const mat of nightMaterials) mat.emissiveIntensity = .18 + nightFactor * 1.7 + fogBankFactor * .4;
    lampPoolMat.opacity = nightFactor * .40;
    tunnelPoolMat.opacity = .23 + nightFactor * .12;
    updateRoadLighting();

    // Mountains retain their zone identity while progressively merging into the
    // dusk/night haze with distance.
    const fogPressure = THREE.MathUtils.clamp((scene.fog.density - .0054) / .0030, 0, 1);
    ridgeLayers.forEach((ridge, i) => {
      const atmosphere = THREE.MathUtils.clamp(ridgeAtmosphereStrength[i] + fogPressure * (.08 + i * .07) + nightFactor * (.08 + i * .06), 0, .92);
      ridge.material.color.copy(ridgeWeatherColors[i]).lerp(scene.fog.color, atmosphere);
      ridge.material.opacity = Math.max(i === 0 ? .32 : .14, ridgeBaseOpacity[i] * (1 - nightFactor * (i * .05)));
    });
    treeLineMaterial.color.copy(mountainTargetColors[3]).lerp(scene.fog.color, nightFactor * .20 + fogPressure * .12);
    treeLineMaterial.opacity = Math.max(.20, treeLineZoneOpacity * (1 - nightFactor * .12));

    // Day/night mode is always dry.
    mats.road.color.copy(dryRoadColor);
    mats.road.roughness = .93;
    mats.asphaltPatch.color.copy(dryPatchColor);
    mats.asphaltPatch.roughness = .98;
    rainPoints.visible = false;
    renderer.toneMappingExposure = lerpN(a.exposure, b.exposure) * (1 - fogBankFactor * .08);
  }

  function playerInsideTunnel(z = PLAYER_Z) {
    for (const feature of majorFeatures) {
      if (feature.userData.kind !== 'tunnel') continue;
      const half = feature.userData.halfLength || 17;
      if (Math.abs(feature.position.z - z) < half + 2.2) return true;
    }
    return false;
  }


  const road = Object.freeze({ laneCenters: Object.freeze([...laneXs]), width: ROAD_W, playerZ: PLAYER_Z,
    centerAt: roadCenterAtZ, heightAt: roadHeightAtZ, yawAt: roadYawAtZ, pitchAt: roadPitchAtZ });
  const lighting = {};
  Object.defineProperties(lighting, {
    nightFactor: { get: () => nightFactor }, daylightFactor: { get: () => daylightFactor },
    fogBankFactor: { get: () => fogBankFactor }
  });
  const api = {
    road, lighting, routeLength,
    update({ dt, distance, speed, lateralOffset = 0 }) {
      view.distance = distance; view.lateralOffset = lateralOffset;
      updateRoad(dt, speed);
    },
    updateLocation({ dt, distance }) { view.distance = distance; updateEnvironment(dt); },
    updateAtmosphere({ dt = 0, timeOfDay, fog = false }) {
      view.timeOfDay = timeOfDay; view.fog = fog; updateMood(dt);
    },
    reset({ distance = 0, timeOfDay = view.timeOfDay, lateralOffset = 0, fog = false } = {}) {
      Object.assign(view, { distance, timeOfDay, lateralOffset, fog }); resetRouteScenery();
    },
    getLocation, getTrafficSettings, isInsideTunnel: playerInsideTunnel,
    advanceTime: (timeOfDay, dt) => (timeOfDay + dt * (24 / DAY_CYCLE_SECONDS)) % 24,
    getDayPhase: dayPhaseLabel,
    dispose() {
      const geometries = new Set(), materials = new Set(), textures = new Set();
      for (const root of ownedObjects) {
        root.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.isInstancedMesh) object.dispose();
        if (object.shadow) object.shadow.dispose();
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) materials.add(material);
        });
        scene.remove(root);
      }
      for (const material of textPanelMaterials.values()) materials.add(material);
      for (const material of materials) {
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        material.dispose();
      }
      textures.forEach(texture => texture.dispose()); geometries.forEach(geometry => geometry.dispose());
      if (scene.fog === environmentFog) { scene.fog = previousScene.fog; scene.background = previousScene.background; renderer.toneMappingExposure = previousScene.exposure; }
      ownedObjects.length = 0;
    }
  };
  return api;
}
