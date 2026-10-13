// Police Station / RPD — procedural Umbrella Corps-inspired main-hall arena.
// The original world interface and flood-field navigation are retained.
export const WORLD_SETTINGS = {
  seed: 19980929, size: 52, spawn: [0, 1.75, 22.5], spawnYaw: 0,
  sky: { top: 0x26373b, mid: 0x647577, horizon: 0xaba792,
    fogColor: 0x596765, fogNear: 40, fogFar: 94 },
  lighting: {
    hemisphereSky: 0xb7d1d4, hemisphereGround: 0x6d6250, hemisphereIntensity: 1.35,
    sunColor: 0xeee1be, sunIntensity: 2.1, sunPosition: [-14, 30, 12]
  }
};

export function createWorld({ THREE, scene }) {
  const root = new THREE.Group(); root.name = 'RPD_PoliceStation'; scene.add(root);
  const colliders = [], floorObjects = [], skyObjects = [], tracers = [];
  const obstacles = [], batches = new Map(), random = mulberry32(WORLD_SETTINGS.seed);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
  const sphereGeo = new THREE.SphereGeometry(1, 12, 8);
  const coneGeo = new THREE.CylinderGeometry(0.48, 1, 1, 12);
  const temp = new THREE.Object3D();
  const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const mat = {
    plaster: standard(0xa9a695), stone: standard(0xb4b3a3), trim: standard(0xc0bfae),
    green: standard(0x57695f), darkGreen: standard(0x394b43), dark: standard(0x292f2c),
    wood: standard(0x594333), woodLight: standard(0x82735b), bronze: standard(0x8a7950, {metalness:0.5}),
    iron: standard(0x414b47, {metalness:0.55}), rust: standard(0x765343), sheet: standard(0x7e8b80,{metalness:0.48}),
    brick: standard(0x6f5d4d), tile: standard(0xb5b4a1,{roughness:0.63}),
    red: standard(0x66423b), fabric: standard(0x757361), paper: standard(0xc5bfa3),
    glass: standard(0x6e9698,{metalness:0.28,roughness:0.4,emissive:0x61888a,emissiveIntensity:0.25}),
    lamp: new THREE.MeshBasicMaterial({color:0xffdca2, toneMapped:false}),
    emergency: new THREE.MeshBasicMaterial({color:0xbf4834, toneMapped:false})
  };
  const world = {
    map: root, colliders, tracers, floorObjects, skyObjects,
    isLoaded: false, spawn: new THREE.Vector3(...WORLD_SETTINGS.spawn),
    lighting: WORLD_SETTINGS.lighting, ready: null, navigation: null,
    resetPlayer, getRandomFloorPoint, update
  };
  let elapsed = 0, navigation, emergencyLight;
  createAtmosphere(); createStructure(); createCombatCover();
  // Architectural detail is built separately from the movement geometry.
  createDetails();
  flushBatches(); root.updateMatrixWorld(true);
  navigation = createNavigation(); world.navigation = navigation;
  world.isLoaded = true; world.ready = Promise.resolve(world);
  return world;

  function standard(color, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness:0.87, metalness:0.04, ...extra });
  }
  function instance(geo, material, x, y, z, sx, sy, sz, rx=0, ry=0, rz=0, shadow=true) {
    // Spatial batches keep the two galleries and each end independently culled.
    const sector = Math.floor((x+24)/16)+','+Math.floor((z+28)/18);
    const key = geo.uuid+material.uuid+sector+shadow;
    if (!batches.has(key)) batches.set(key,{geo,material,shadow,matrices:[]});
    temp.position.set(x,y,z); temp.rotation.set(rx,ry,rz); temp.scale.set(sx,sy,sz); temp.updateMatrix();
    batches.get(key).matrices.push(temp.matrix.clone());
  }
  function box(x,y,z,w,h,d,material,solid=false,name='RPD cover',nav=true) {
    instance(boxGeo,material,x,y,z,w,h,d);
    if (solid) return collider(x,y,z,w,h,d,0,name,nav);
  }
  function collider(x,y,z,w,h,d,yaw=0,name='RPD collision',navigationBlock=true) {
    const mesh = new THREE.Mesh(boxGeo,hiddenMaterial);
    mesh.name=name; mesh.position.set(x,y,z); mesh.rotation.y=yaw; mesh.scale.set(w,h,d);
    root.add(mesh); colliders.push(mesh);
    if (navigationBlock) obstacles.push({x,z,halfW:w/2,halfD:d/2,cos:Math.cos(yaw),sin:Math.sin(yaw)});
    return mesh;
  }
  function floorBox(x,z,w,d,top,material=mat.tile) {
    const h=Math.max(0.16,top+0.16);
    const m=box(x,top-h/2,z,w,h,d,material,true,'G55FLR_RPD',false);
    floorObjects.push(m); return m;
  }
  function cylinder(x,y,z,r,h,material,rx=0,ry=0,rz=0) {
    instance(cylinderGeo,material,x,y,z,r,h,r,rx,ry,rz);
  }
  function ball(x,y,z,sx,sy,sz,material) {
    instance(sphereGeo,material,x,y,z,sx,sy,sz);
  }
  function beam(a,b,r,material,solid=false) {
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start);
    temp.position.copy(start).add(end).multiplyScalar(0.5);
    temp.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());
    const rotation=new THREE.Euler().setFromQuaternion(temp.quaternion);
    instance(cylinderGeo,material,temp.position.x,temp.position.y,temp.position.z,r,direction.length(),r,rotation.x,rotation.y,rotation.z);
    if(solid) {
      const mesh=new THREE.Mesh(cylinderGeo,hiddenMaterial);mesh.name='RPD solid rail';
      mesh.position.copy(start).add(end).multiplyScalar(.5);mesh.rotation.copy(rotation);
      mesh.scale.set(r,direction.length(),r);root.add(mesh);colliders.push(mesh);
    }
  }
  function flushBatches() {
    for (const {geo,material,shadow,matrices} of batches.values()) {
      const mesh=new THREE.InstancedMesh(geo,material,matrices.length);
      matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix)); mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere(); mesh.name='RPD architectural detail';
      mesh.castShadow=shadow&&!material.isMeshBasicMaterial; mesh.receiveShadow=!material.isMeshBasicMaterial;
      root.add(mesh);
    }
    batches.clear();
  }
  function createStructure() {
    floorBox(0,0,44,52,0);
    for (const x of [-22.35,22.35]) box(x,6.8,0,0.7,13.6,53.4,mat.plaster,true,'Station outer wall');
    for (const z of [-26.35,26.35]) box(0,6.8,z,44,13.6,0.7,mat.plaster,true,'Station end wall');
    // Raised decks have closed foundations: no stacked navigable floors.
    floorBox(0,-23,44,6,4.2,mat.green);
    for (const side of [-1,1]) {
      floorBox(side*18,-7,8,26,4.2,mat.green);
      staircase(side*18,20,8,14,4.2,20,'Gallery access');
      galleryGuard(side);
    }
    staircase(0,-6,8,14,4.2,20,'Grand staircase');
    for (const side of [-1,1]) {
      rail(side*9.25,4.2,-20,10.5,0,false);
      // Rails also stop the flat navigation field crossing a vertical deck edge.
      for (let i=0;i<20;i++) {
        const z=-6-(i+0.5)*0.7, y=(i+1)*0.21;
        collider(side*4.15,y+0.42,z,0.3,0.84,0.7,0,'Grand stair balustrade');
      }
      stairRail(side*4.15,-6,14,4.2,mat.stone);
    }
  }
  function staircase(x,startZ,width,length,height,steps,name) {
    const depth=length/steps;
    for(let i=0;i<steps;i++) {
      const y=height*(i+1)/steps,z=startZ-(i+0.5)*depth;
      const mesh=floorBox(x,z,width,depth,y,mat.stone); mesh.name='G55FLR_'+name+'_'+i;
      box(x,y-0.028,z+depth/2-0.025,width,0.055,0.055,mat.trim);
    }
  }
  function galleryGuard(side) {
    rail(side*14,4.2,-7,26,Math.PI/2,false);
    for(let i=0;i<20;i++) {
      const z=20-(i+0.5)*0.7,y=(i+1)*0.21;
      collider(side*14,y+0.42,z,0.26,0.84,0.7,0,'Gallery stair parapet');
    }
    stairRail(side*14,20,14,4.2,mat.green);
  }
  function stairRail(x,startZ,length,rise,material) {
    const slope=Math.atan2(rise,length),midY=rise/2;
    // Continuous sloped parapet replaces overlapping sawtooth wall segments.
    instance(boxGeo,material,x,midY+.49,startZ-length/2,.3,.98,Math.hypot(length,rise),slope);
    beam([x,.21+1.2,startZ],[x,rise+1.2,startZ-length],.085,mat.wood,true);
    for(let i=0;i<=10;i++) {
      const t=i/10,z=startZ-t*length,y=t*rise+.21;
      cylinder(x,y+.97,z,.047,.48,mat.iron);
    }
  }
  function rail(x,y,z,length,yaw=0,metal=true) {
    const alongX=Math.abs(yaw)<0.1, material=metal?mat.iron:mat.stone;
    const w=alongX?length:0.28,d=alongX?0.28:length;
    // The parapet stops feet; shots can pass through the upper baluster gaps.
    box(x,y+0.37,z,w,0.74,d,material,true,'Gallery parapet');
    box(x,y+1.31,z,alongX?length:0.4,0.14,alongX?0.4:length,mat.wood,true,'Gallery handrail',false);
    const count=Math.floor(length/0.64);
    for(let i=0;i<=count;i++) {
      const offset=-length/2+i*length/count;
      const px=x+(alongX?offset:0),pz=z+(alongX?0:offset);
      cylinder(px,y+0.98,pz,metal?0.035:0.073,0.5,material);
      if(!metal) ball(px,y+0.99,pz,0.1,0.13,0.1,material);
      collider(px,y+0.99,pz,.18,.5,.18,0,'Stone baluster',false);
    }
  }
  function createCombatCover() {
    box(0,0.58,14,7.6,1.16,1.55,mat.wood,true,'Reception counter');
    box(0,1.2,14,8,0.16,1.8,mat.woodLight);
    for(const x of [-3.7,3.7]) box(x,0.55,12.6,0.45,1.1,1.6,mat.wood,true,'Reception return');
    barricade(-6,0,2,4.5,2.2,'West shelter');
    barricade(7,0,-6,4,1.35,'East hall barricade');
    box(-8,0.49,-11,3.6,0.98,1.15,mat.fabric,true,'West sandbags');
    barricade(-18,4.2,-5,3.6,1.4,'West gallery barricade');
    barricade(18,4.2,-12,3,1.1,'East gallery barricade');
    box(-10,4.85,-24.9,3,1.3,1.4,mat.woodLight,true,'Rear supply crates');
    // The statue plinth is functional cover, with a clear route in front.
    box(0,4.5,-24.3,3.4,0.6,2.4,mat.stone,true,'Goddess plinth');
    box(0,5.15,-24.3,2.3,0.7,1.75,mat.stone,true,'Goddess pedestal');
  }
  function barricade(x,y,z,w,h,name) {
    box(x,y+h/2,z,w,h,0.32,mat.sheet,true,name);
    for(const side of [-1,1]) {
      box(x+side*(w/2-0.12),y+h/2,z+0.04,0.15,h+0.12,0.19,mat.woodLight);
      box(x+side*(w/2-0.12),y+0.08,z,0.38,0.16,0.95,mat.iron);
    }
  }
  function createAtmosphere() {
    const s=WORLD_SETTINGS.sky; scene.background=new THREE.Color(s.top);
    scene.fog=new THREE.Fog(s.fogColor,s.fogNear,s.fogFar);
  }
  function canvasTexture(width,height,draw) {
    const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
    draw(canvas.getContext('2d'),width,height);
    const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=4; return texture;
  }
  function surfaceTexture(kind) {
    const tex=canvasTexture(512,512,(ctx,w,h)=>{
      ctx.fillStyle='#ccccbd'; ctx.fillRect(0,0,w,h);
      if(kind==='tile') {
        for(let y=0;y<2;y++)for(let x=0;x<2;x++) {
          ctx.fillStyle=(x+y)%2?'#747e72':'#c7c8b5';ctx.fillRect(x*256,y*256,256,256);
          ctx.strokeStyle='#555c54';ctx.lineWidth=3;ctx.strokeRect(x*256+2,y*256+2,252,252);
          ctx.strokeStyle='rgba(245,240,213,.2)';ctx.lineWidth=2;ctx.strokeRect(x*256+6,y*256+6,244,244);
        }
      }
      for(let i=0;i<6500;i++) {
        const v=65+Math.floor(random()*100);
        ctx.fillStyle='rgba('+v+','+v+','+v+','+(0.03+random()*0.1)+')';
        ctx.fillRect(random()*w,random()*h,random()*4+1,random()*4+1);
      }
      if(kind==='wood')for(let i=0;i<110;i++) {
        const y=random()*h;ctx.strokeStyle='rgba(40,36,25,'+(0.05+random()*0.15)+')';
        ctx.lineWidth=random()*2+0.4;ctx.beginPath();ctx.moveTo(0,y);
        ctx.bezierCurveTo(160,y+random()*15,330,y-10,512,y+5);ctx.stroke();
      }
      if(kind==='sheet')for(let x=0;x<512;x+=32) {
        const gradient=ctx.createLinearGradient(x,0,x+32,0);
        gradient.addColorStop(0,'rgba(30,35,29,.4)');gradient.addColorStop(.45,'rgba(255,255,230,.15)');gradient.addColorStop(1,'rgba(30,35,29,.35)');
        ctx.fillStyle=gradient;ctx.fillRect(x,0,32,512);
      }
      for(let i=0;i<32;i++) {
        const x=random()*w,y=random()*h;
        const stain=ctx.createRadialGradient(x,y,0,x,y,25+random()*75);
        stain.addColorStop(0,'rgba(39,43,30,.10)');stain.addColorStop(1,'rgba(39,43,30,0)');
        ctx.fillStyle=stain;ctx.fillRect(0,0,w,h);
      }
      if(kind==='stone'||kind==='tile')for(let i=0;i<8;i++) {
        let x=random()*w,y=random()*h;ctx.strokeStyle='rgba(41,48,41,.20)';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(x,y);
        for(let j=0;j<4;j++){x+=random()*35-9;y+=random()*30;ctx.lineTo(x,y);}ctx.stroke();
      }
    });
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;return tex;
  }
  function applyTextures() {
    const stone=surfaceTexture('stone'),wood=surfaceTexture('wood'),sheet=surfaceTexture('sheet');
    mat.stone.map=stone;mat.plaster.map=stone;mat.trim.map=stone;mat.green.map=stone;
    mat.wood.map=wood;mat.woodLight.map=wood;mat.sheet.map=sheet;
    const tile=surfaceTexture('tile');tile.repeat.set(22,26);mat.tile.map=tile;mat.tile.color.setHex(0xffffff);
  }
  function plane(x,y,z,w,h,material,rx=0,ry=0,rz=0) {
    instance(planeGeo,material,x,y,z,w,h,1,rx,ry,rz,false);
  }
  function sign(title,subtitle,x,y,z,w,h,yaw=0,bg='#233c3c',fg='#d3c49b') {
    const texture=canvasTexture(1024,256,(ctx)=>{
      ctx.fillStyle=bg;ctx.fillRect(0,0,1024,256);ctx.strokeStyle=fg;ctx.lineWidth=4;ctx.strokeRect(16,16,992,224);
      ctx.fillStyle=fg;ctx.textAlign='center';ctx.font='bold '+(title.length>21?48:70)+'px Georgia,serif';
      ctx.fillText(title,512,subtitle?128:154,944);
      if(subtitle){ctx.font='26px Arial';ctx.fillText(subtitle,512,198,924);}
    });
    const m=standard(0xffffff,{map:texture,roughness:.82});
    const mesh=new THREE.Mesh(planeGeo,m);mesh.position.set(x,y,z);mesh.rotation.y=yaw;mesh.scale.set(w,h,1);mesh.name=title;root.add(mesh);
  }
  function floorDecal(texture,x,z,size,y=0.015) {
    const m=new THREE.MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,roughness:.85});
    plane(x,y,z,size,size,m,-Math.PI/2);
  }
  function crestTexture() {
    return canvasTexture(768,768,(ctx)=>{
      ctx.clearRect(0,0,768,768);ctx.fillStyle='#293f43';ctx.beginPath();ctx.arc(384,384,352,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#a89869';ctx.lineWidth=12;ctx.stroke();ctx.beginPath();ctx.arc(384,384,309,0,Math.PI*2);ctx.lineWidth=4;ctx.stroke();
      ctx.fillStyle='#b4a57e';ctx.beginPath();
      for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?96:187;ctx.lineTo(384+Math.cos(a)*r,397+Math.sin(a)*r);}ctx.closePath();ctx.fill();
      ctx.fillStyle='#d2c49b';ctx.textAlign='center';ctx.font='bold 67px Georgia';ctx.fillText('RACCOON',384,203);ctx.fillText('POLICE',384,624);
      ctx.fillStyle='#293f43';ctx.font='bold 47px Georgia';ctx.fillText('R.P.D.',384,415);
    });
  }
  function archFrame(x,y,z,w,h,yaw=0,glass=true) {
    const r=w/2,spring=h-r;
    const shape=new THREE.Shape();shape.moveTo(-r,0);shape.lineTo(r,0);shape.lineTo(r,spring);shape.absarc(0,spring,r,0,Math.PI,false);shape.closePath();
    const hole=new THREE.Path(),ri=r-.2;
    hole.moveTo(-ri,.16);hole.lineTo(ri,.16);hole.lineTo(ri,spring);hole.absarc(0,spring,ri,0,Math.PI,false);hole.closePath();shape.holes.push(hole);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:.2,bevelEnabled:false,curveSegments:14});
    const mesh=new THREE.Mesh(geo,mat.trim);mesh.position.set(x,y,z);mesh.rotation.y=yaw;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    if(glass) {
      const paneShape=new THREE.Shape();paneShape.moveTo(-ri,.16);paneShape.lineTo(ri,.16);paneShape.lineTo(ri,spring);paneShape.absarc(0,spring,ri,0,Math.PI,false);paneShape.closePath();
      const pane=new THREE.Mesh(new THREE.ShapeGeometry(paneShape,14),mat.glass);pane.position.set(x+Math.sin(yaw)*.01,y,z+Math.cos(yaw)*.01);pane.rotation.y=yaw;root.add(pane);
      const local=(lx,ly)=>[x+Math.cos(yaw)*lx+Math.sin(yaw)*.16,y+ly,z-Math.sin(yaw)*lx+Math.cos(yaw)*.16];
      beam(local(0,.2),local(0,h-.25),.055,mat.iron);
      for(const height of [1.25,2.45])if(height<spring+.1)beam(local(-ri,height),local(ri,height),.04,mat.iron);
    }
  }
  function decorativeDoor(x,z,yaw,label) {
    const p=(lx,y,lz)=>[x+Math.cos(yaw)*lx+Math.sin(yaw)*lz,y,z-Math.sin(yaw)*lx+Math.cos(yaw)*lz];
    const part=(lx,y,lz,w,h,d,m)=>{const v=p(lx,y,lz);instance(boxGeo,m,...v,w,h,d,0,yaw);};
    part(0,1.58,0,2.7,3.16,.16,mat.dark);
    for(const side of [-1,1]) {
      part(side*1.38,1.7,.09,.2,3.4,.28,mat.stone);
      part(side*.65,1.6,.12,1.2,3.0,.1,mat.wood);
      part(side*.65,2.1,.18,.95,1.1,.06,mat.glass);
      part(side*.65,.65,.18,.9,.85,.06,mat.woodLight);
      part(side*.12,1.35,.24,.06,.32,.06,mat.bronze);
    }
    part(0,3.34,.1,3,.22,.3,mat.trim);
    // These office doors are explicitly sealed scenery, never spawn openings.
    for(const [height,angle]of [[1.1,.14],[2.25,-.16]]) {
      const v=p(0,height,.3);instance(boxGeo,mat.woodLight,...v,2.9,.23,.09,0,yaw,angle);
    }
    const v=p(0,3.72,.18);sign(label,'',...v,2.8,.44,yaw);
  }
  function sconce(x,y,z,yaw=0) {
    const nx=Math.sin(yaw),nz=Math.cos(yaw);
    box(x,y,z,.24,.5,.14,mat.bronze);
    beam([x,y-.05,z],[x+nx*.35,y-.1,z+nz*.35],.055,mat.bronze);
    const px=x+nx*.4,pz=z+nz*.4;
    cylinder(px,y+.12,pz,.16,.38,mat.lamp);
    cylinder(px,y-.11,pz,.22,.06,mat.bronze);cylinder(px,y+.35,pz,.19,.07,mat.bronze);
    for(let i=0;i<4;i++){const a=i*Math.PI/2;beam([px+Math.cos(a)*.16,y-.08,pz+Math.sin(a)*.16],[px+Math.cos(a)*.16,y+.34,pz+Math.sin(a)*.16],.015,mat.iron);}
  }
  function createDetails() {
    applyTextures();createWallArchitecture();createRoof();createStatue();createReceptionDetails();createFieldFortifications();createDressing();
  }
  function createWallArchitecture() {
    // Side galleries are built over closed station offices.
    for(const side of [-1,1]) {
      const yaw=-side*Math.PI/2;
      for(const z of [-13,-3,4.7])decorativeDoor(side*13.975,z,yaw,z<0?'WEST / EAST OFFICE':'RECORDS');
      for(const z of [-18,-9,0,10,20]) {
        archFrame(side*21.96,5.15,z,3.9,5.1,yaw);
        for(const dz of [-2.8,2.8]) {
          box(side*21.7,7.45,z+dz,.5,5.5,.48,mat.stone);
          box(side*21.65,4.72,z+dz,.7,.35,.77,mat.trim);
          box(side*21.65,10.15,z+dz,.76,.3,.82,mat.trim);
        }
      }
      box(side*21.88,10.62,0,.25,.28,52,mat.trim);
      box(side*21.8,11.12,0,.35,.18,52,mat.stone);
      box(side*21.85,12.5,0,.3,.3,52,mat.trim);
      box(side*13.92,3.9,-7,.17,.38,26,mat.wood);
      box(side*13.83,4.17,-7,.32,.16,26,mat.trim);
      for(const z of [-16,-6,4]) {
        box(side*13.87,1.85,z,.26,3.7,.63,mat.green);
        box(side*13.77,3.55,z,.42,.23,.83,mat.trim);
      }
      for(const z of [-15,-2,13])sconce(side*21.62,7.0,z,yaw);
      // Ramp walls remain legible from the entrance, with plaster above paneling.
      box(side*21.87,1.2,16,.22,2.4,20,mat.green);
      box(side*21.72,2.45,16,.15,.12,20,mat.wood);
    }
    // North wall: monumental arch, clock, badge and paired classical columns.
    for(const side of [-1,1]) {
      archFrame(side*15,5.05,-25.95,4.6,5.1,0);
      for(const x of [7.6,9.1]) {
        cylinder(side*x,7.65,-25.35,.3,6.2,mat.stone);
        cylinder(side*x,4.65,-25.35,.46,.45,mat.trim);
        cylinder(side*x,10.8,-25.35,.5,.35,mat.trim);
        for(let i=0;i<8;i++){const a=i*Math.PI/4;cylinder(side*x+Math.cos(a)*.27,7.7,-25.35+Math.sin(a)*.27,.032,5.4,mat.trim);}
      }
      sign('R.P.D.','RACCOON CITY',side*11.1,8.0,-25.87,2.3,3.8,0,'#273f4b','#b6ac85');
      box(side*11.1,10.05,-25.75,2.65,.1,.13,mat.bronze);
      sconce(side*5.8,6.7,-25.65);
    }
    archFrame(0,5.1,-25.94,11.4,7.6,0,false);
    sign('RACCOON POLICE','DEPARTMENT',0,10.0,-25.65,8,1.22,0,'#414e47','#d5cba9');
    const clock=canvasTexture(512,512,ctx=>{
      ctx.fillStyle='#b6b49c';ctx.beginPath();ctx.arc(256,256,246,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#444f45';ctx.lineWidth=12;ctx.stroke();ctx.fillStyle='#34443b';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='36px Georgia';
      ['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'].forEach((s,i)=>{const a=i*Math.PI/6-Math.PI/2;ctx.fillText(s,256+Math.cos(a)*197,256+Math.sin(a)*197);});
      ctx.strokeStyle='#34443b';ctx.lineWidth=12;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(256,256);ctx.lineTo(201,126);ctx.moveTo(256,256);ctx.lineTo(371,307);ctx.stroke();
    });
    const clockMesh=new THREE.Mesh(new THREE.CircleGeometry(1,40),standard(0xffffff,{map:clock}));clockMesh.position.set(0,11.76,-25.56);root.add(clockMesh);
    cylinder(0,11.76,-25.64,1.1,.12,mat.bronze,Math.PI/2);
    // South entrance is closed and strongly framed; a real boundary collider is behind it.
    archFrame(0,.1,25.94,7.8,8.5,Math.PI,false);
    for(const x of [-1.36,1.36]) {
      box(x,2.1,25.76,2.62,4.2,.2,mat.wood);
      box(x,2.78,25.63,2.1,1.8,.06,mat.glass);
      box(x,.98,25.62,2.1,1.15,.08,mat.woodLight);
      box(x*.25,1.87,25.55,.08,.48,.06,mat.bronze);
    }
    sign('R.P.D.','SERVE AND PROTECT',0,6.1,25.64,6.3,1.5,Math.PI);
    for(const x of [-13,13])archFrame(x,5.1,25.94,5,5.7,Math.PI);
    for(const x of [-20,-9,9,20])sconce(x,3.7,25.62,Math.PI);
    for(const z of [-25.92,25.92]) {
      box(0,12.5,z,44,.34,.26,mat.trim);
      box(0,1.1,z,44,2.2,.12,mat.green);
      box(0,2.25,z,44,.15,.22,mat.wood);
    }
    // Low green wainscot rhythm. Recessed wooden panels avoid coplanar overlays.
    for(const side of [-1,1])for(let z=-18;z<5;z+=1.9) {
      box(side*13.79,.94,z,.08,1.5,1.45,mat.darkGreen);
      box(side*13.72,.19,z,.06,.09,1.5,mat.woodLight);
    }
  }
  function createRoof() {
    // A broken central skylight leaves a believable source for the key light.
    for(const side of [-1,1]) {
      instance(boxGeo,mat.darkGreen,side*16,13.45,0,12,.3,53,0,0,0,false);
      collider(side*16,13.45,0,12,.3,53,0,'High ceiling',false);
    }
    for(const z of [-22,-12,-2,8,20]) {
      beam([-22,12.8,z],[0,14.8,z],.12,mat.iron);beam([0,14.8,z],[22,12.8,z],.12,mat.iron);
      beam([-10,13.65,z],[10,13.65,z],.075,mat.iron);
      for(const x of [-8,-4,4,8])beam([x,13.65,z],[0,14.8,z],.035,mat.iron);
    }
    for(const x of [-10,10])box(x,13.7,0,.24,.3,53,mat.iron);
    for(const z of [-24,-16,12,22])for(const x of [-7.5,-2.5,2.5,7.5]) {
      // Selected opaque, weathered panes; missing bays expose the sky.
      plane(x,13.72,z,4.78,4.8,mat.glass,Math.PI/2);
      box(x,13.78,z,4.95,.12,.07,mat.iron);
    }
    // Two restrained brass chandeliers give the hall its museum silhouette.
    for(const z of [6,-11]) {
      cylinder(0,11.2,z,.042,4.2,mat.iron);
      cylinder(0,9.1,z,.22,.28,mat.bronze);
      const torus=new THREE.Mesh(new THREE.TorusGeometry(1.65,.065,6,28),mat.bronze);torus.rotation.x=Math.PI/2;torus.position.set(0,9,z);root.add(torus);
      for(let i=0;i<8;i++) {
        const a=i*Math.PI/4,x=Math.cos(a)*1.65,pz=z+Math.sin(a)*1.65;
        beam([0,9.05,z],[x,9,pz],.035,mat.bronze);cylinder(x,9.2,pz,.09,.38,mat.lamp);
        if(i%2===0)beam([x,9,pz],[0,10.7,z],.018,mat.iron);
      }
    }
    const warm=new THREE.PointLight(0xffd39a,100,19,2);warm.position.set(0,8,7);root.add(warm);
    const statueLight=new THREE.PointLight(0xeed6a2,65,15,2);statueLight.position.set(0,8.6,-20);root.add(statueLight);
    emergencyLight=new THREE.PointLight(0xd85b3f,8,7,2);emergencyLight.position.set(-20,6,-3);root.add(emergencyLight);
  }
  function createStatue() {
    const x=0,z=-24.3;
    box(x,5.47,z,2.52,.18,1.95,mat.trim);
    cylinder(x,5.64,z,.84,.22,mat.stone);
    instance(coneGeo,mat.stone,x,6.58,z,.72,1.75,.53);
    ball(x,7.33,z,.42,.69,.33,mat.stone);
    ball(x,8.16,z,.255,.35,.27,mat.trim);
    ball(x-.025,8.31,z-.075,.28,.24,.26,mat.stone);
    cylinder(x,7.84,z,.11,.29,mat.trim);
    collider(0,6.8,z,1.05,2.4,1,0,'Stone statue',false);
    collider(0,8.16,z,.52,.7,.54,0,'Statue head',false);
    for(let i=0;i<11;i++) {
      const a=(i/10)*Math.PI;const px=Math.cos(a)*.57,pz=z+Math.sin(a)*.39;
      beam([px*.55,7.1,z+(pz-z)*.55],[px,5.83,pz],.035,mat.trim);
    }
    // Draped arms and a raised orb read as a statue at gameplay distance.
    for(const [a,b,c]of [ [[-.36,7.55,z],[-.69,7.08,z+.08],[-1.0,7.12,z+.25]],[[.36,7.55,z],[.73,7.88,z+.04],[.96,8.22,z+.12]] ]) {
      beam(a,b,.125,mat.stone);ball(...b,.13,.13,.13,mat.stone);beam(b,c,.085,mat.trim);ball(...c,.11,.10,.13,mat.trim);
    }
    ball(.97,8.51,z+.12,.3,.3,.3,mat.stone);
    cylinder(-1.0,7.19,z+.25,.22,.13,mat.stone);
    sign('JUSTICE','AND THE PEACE OF OUR CITY',0,5.08,-23.411,1.85,.46,0,'#5a6558','#c9c2a2');
  }
  function createReceptionDetails() {
    sign('R.P.D.','INFORMATION',0,.66,14.79,3.0,.78,0,'#263f47','#cdbb85');
    for(const x of [-2.85,-1.7,1.7,2.85])box(x,.57,14.79,.82,.84,.055,mat.darkGreen);
    box(-1.7,1.52,13.8,.65,.55,.45,mat.dark);box(-1.7,1.54,14.045,.53,.38,.025,mat.glass);
    box(-1.7,1.32,14.3,.72,.07,.3,mat.iron);
    box(1.5,1.34,14.1,.4,.1,.32,mat.dark);box(1.5,1.4,14.05,.49,.1,.13,mat.dark);
    for(let i=0;i<3;i++)box(2.5,1.31+i*.07,14,.5,.05,.65,mat.paper);
    floorDecal(crestTexture(),0,7.0,5.8);
    // Runner on the central stair: each strip sits on its own tread.
    for(let i=0;i<20;i++) {
      plane(0,(i+1)*.21+.014,-6-(i+.5)*.7,3.7,.69,mat.red,-Math.PI/2);
      for(const x of [-1.76,1.76])plane(x,(i+1)*.21+.02,-6-(i+.5)*.7,.065,.68,mat.bronze,-Math.PI/2);
    }
    plane(0,.012,-2,3.7,8,mat.red,-Math.PI/2);
    for(const x of [-1.76,1.76])plane(x,.02,-2,.065,8,mat.bronze,-Math.PI/2);
    for(const x of [-10,10]) {
      box(x,.42,18.8,3.4,.19,.76,mat.wood);
      box(x,.95,19.12,3.4,.85,.13,mat.wood);
      for(const dx of [-1.3,1.3])box(x+dx,.22,18.8,.13,.44,.62,mat.iron);
      collider(x,.65,18.98,3.5,1.3,.92,0,'Waiting bench');
    }
  }
  function createFieldFortifications() {
    for(const [x,y,z,w,h]of [[-6,0,2,4.5,2.2],[7,0,-6,4,1.35],[-18,4.2,-5,3.6,1.4],[18,4.2,-12,3,1.1]]) {
      for(let i=0;i<Math.floor(w/.2);i++)box(x-w/2+.1+i*.2,y+h/2,z+.18,.035,h-.05,.055,mat.rust);
      for(const yy of [.22,h-.25])box(x,y+yy,z-.22,w+.1,.09,.11,mat.woodLight);
      for(const dx of [-w/2+.15,w/2-.15])for(const yy of [.25,h-.2])ball(x+dx,y+yy,z+.213,.034,.034,.021,mat.iron);
    }
    // Patched scaffold refuge behind the west hall barrier.
    for(const x of [-8.4,-3.6]) {
      beam([x,0,2],[x,3.35,2],.055,mat.iron);
      beam([x,3.35,2],[x,3.35,-.5],.055,mat.iron);
    }
    beam([-8.4,3.35,2],[-3.6,3.35,2],.055,mat.iron);
    instance(boxGeo,mat.sheet,-6,3.32,.75,4.9,.07,2.65,0,0,-.04);
    sign('KEEP OUT','QUARANTINE ZONE',-6,1.43,2.194,2.35,.62,0,'#8b835e','#302f25');
    sign('EVIDENCE','R.P.D. / DO NOT REMOVE',-10,5,-24.185,2,.45,0,'#6b674e','#c8c2a8');
    for(const x of [-11.1,-8.9])box(x,4.85,-24.16,.12,1.3,.08,mat.wood);
    for(let row=0;row<3;row++)for(let i=0;i<5;i++) {
      instance(sphereGeo,mat.fabric,-9.42+i*.7+(row%2)*.13,.16+row*.31,-11,.41,.2,.58);
    }
    // A supported tarp panel and scaffold cross-braces on the east gallery.
    for(const x of [20.6,21.5])beam([x,4.2,-15],[x,7.0,-15],.045,mat.iron);
    box(21.05,5.75,-15,.88,2.1,.07,mat.fabric);
    beam([20.6,4.2,-15],[21.5,7.0,-15],.035,mat.iron);
    box(-21.82,6,-3,.16,.55,.7,mat.dark);box(-21.72,6,-3,.1,.25,.45,mat.emergency);
  }
  function createDressing() {
    // Authored damage patches stay on sealed walls, away from moving silhouettes.
    for(const [side,z,y]of [[-1,-7,8],[1,7,9],[-1,18,3],[1,-18,6]]) {
      for(let row=0;row<5;row++)for(let col=0;col<3;col++) {
        box(side*21.95,y+row*.18,z+(col-1)*.43+(row%2)*.16,.065,.14,.38,mat.brick);
      }
    }
    for(const [x,z,y]of [[-19,-19,4.21],[19,1,4.21],[-11,-17,.015],[11,14,.015],[7,22,.015]]) {
      for(let i=0;i<8;i++) {
        const px=x+(random()-.5)*1.7,pz=z+(random()-.5)*1.7;
        plane(px,y+.008,pz,.22+random()*.25,.3+random()*.25,mat.paper,-Math.PI/2,0,random()*6.28);
      }
      for(let i=0;i<4;i++)instance(boxGeo,mat.stone,x+(random()-.5)*1.8,y+.06,z+(random()-.5)*1.4,.16+random()*.2,.1,.2,0,random()*Math.PI,0,false);
    }
    for(const x of [-20,20]) {
      sign('EVACUATION','FOLLOW POLICE INSTRUCTIONS',x,2.9,25.70,2.0,1.0,Math.PI,'#777960','#282e27');
    }
    const positions=[];for(let i=0;i<55;i++)positions.push((random()-.5)*23,3+random()*9,(random()-.5)*34);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const dust=new THREE.Points(geo,new THREE.PointsMaterial({color:0xd6d6b7,size:.026,transparent:true,opacity:.32,depthWrite:false}));
    dust.name='Skylight dust';root.add(dust);
  }

  function update(delta,camera) {
    elapsed+=Math.min(delta,0.05);
    if(emergencyLight) emergencyLight.intensity=8+Math.max(0,Math.sin(elapsed*2.8))*3;
    if(camera) navigation.updateTarget(camera.position);
  }
  function blocked(x, z, margin = 0.55) {
    if (Math.abs(x) > 21.8 - margin || Math.abs(z) > 25.8 - margin) return true;
    for (const b of obstacles) {
      const dx = x - b.x, dz = z - b.z, lx = b.cos * dx - b.sin * dz, lz = b.sin * dx + b.cos * dz;
      if (Math.abs(lx) < b.halfW + margin && Math.abs(lz) < b.halfD + margin) return true;
    }
    return false;
  }
  function createNavigation() {
    // A shared flood field routes the horde around the same solid footprints.
    const cellSize = 1, width = 94, origin = -47, count = width * width;
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
      if (Math.abs(b.x) > 21.8 - margin || Math.abs(b.z) > 25.8 - margin) return false;
      // Exact segment/expanded-box tests avoid clipping small corners between
      // samples, including the corners of the station barricades.
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
