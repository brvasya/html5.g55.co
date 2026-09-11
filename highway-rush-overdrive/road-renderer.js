import * as THREE from './vendor/three.module.js';
import {clamp,mix,roadOffset,randomSource} from './game-model.js';
import {CARS} from './game-progress.js';

const VEHICLES=[[30,125,395,239],[452,123,349,241],[828,125,396,239],[34,497,351,282],[449,479,356,299],[871,453,346,325],[33,877,361,309],[461,827,332,364],[880,821,339,369]];
// Each new car has the same rear / straight / rear pose order as the starter.
const GARAGE_SPRITES=[
 [[10,125,431,253],[442,125,370,253],[813,125,432,253]],
 [[10,494,430,245],[440,494,373,245],[814,494,431,245]],
 [[8,875,430,236],[439,875,376,236],[818,875,428,236]]
];
// Wheel interiors in the source atlas: center x/y and horizontal/vertical radii.
const PLAYER_WHEELS=[[[348,301,7,32],[406,292,5.5,25],[69,337,21,8]],[[490,338,18,8],[764,338,18,8]],[[907,301,7,32],[847,292,5.5,25],[1183,337,21,8]]];
const PICKUPS=[[40,90,490,520],[579,75,493,550],[1118,70,449,577],[1641,137,506,430]];
const PICKUP_COLORS=[0x29eaff,0xc26cff,0xff992f,0xffd34a];
const geoBox=new THREE.BoxGeometry(1,1,1);
const vector=new THREE.Vector3();

function canvasTexture(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function atlasTexture(image,rect){return canvasTexture(rect[2],rect[3],c=>c.drawImage(image,...rect,0,0,rect[2],rect[3]));}
function playerWheelTexture(original,motion,rect,pose){
 // Bake generated wheel details into the three textures once at loading time.
 // The original sprite supplies every other pixel, including its alpha and shadows.
 return canvasTexture(rect[2],rect[3],c=>{
  c.drawImage(original,...rect,0,0,rect[2],rect[3]);c.save();c.beginPath();
  for(const [x,y,rx,ry] of PLAYER_WHEELS[pose]){const cx=x-rect[0],cy=y-rect[1];c.moveTo(cx+rx,cy);c.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);c.closePath();}
  c.clip();c.globalCompositeOperation='source-atop';c.globalAlpha=.85;
  const sx=motion.width/1254,sy=motion.height/1254;c.drawImage(motion,rect[0]*sx,rect[1]*sy,rect[2]*sx,rect[3]*sy,0,0,rect[2],rect[3]);c.restore();
 });
}
function horizonColor(image){
 // The backdrop's world-space horizon crosses this band. Average in linear
 // color space so the fog and the sRGB sky texture receive identical tinting.
 const c=document.createElement('canvas');c.width=48;c.height=6;
 const ctx=c.getContext('2d');ctx.drawImage(image,image.width*.35,image.height*.73,image.width*.30,image.height*.03,0,0,48,6);
 const pixels=ctx.getImageData(0,0,48,6).data,result=new THREE.Color(0,0,0),sample=new THREE.Color();
 for(let i=0;i<pixels.length;i+=4)result.add(sample.setRGB(pixels[i]/255,pixels[i+1]/255,pixels[i+2]/255,THREE.SRGBColorSpace));
 return result.multiplyScalar(4/pixels.length);
}
function glowTexture(){return canvasTexture(64,64,c=>{const g=c.createRadialGradient(32,32,0,32,32,31);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.16,'rgba(255,255,255,.7)');g.addColorStop(.5,'rgba(255,255,255,.12)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,64,64);});}
function shadowTexture(){return canvasTexture(64,64,c=>{const g=c.createRadialGradient(32,32,5,32,32,31);g.addColorStop(0,'rgba(0,0,0,.65)');g.addColorStop(.5,'rgba(0,0,0,.4)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,64,64);});}
function asphaltTexture(){const rng=randomSource(923);const t=canvasTexture(256,256,(c,w,h)=>{const p=c.createImageData(w,h);for(let i=0;i<p.data.length;i+=4){const b=78+rng()*18;p.data[i]=b;p.data[i+1]=b+2;p.data[i+2]=b+10;p.data[i+3]=255;}c.putImageData(p,0,0);c.globalAlpha=.1;c.strokeStyle='#d9cada';for(let i=0;i<24;i++){let x=rng()*w;c.beginPath();c.moveTo(x,0);c.lineTo(x+rng()*3,h);c.stroke();}});t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;}
function windowsTexture(){const rng=randomSource(19);const t=canvasTexture(128,256,c=>{c.fillStyle='#4a4e61';c.fillRect(0,0,128,256);for(let y=5;y<256;y+=12)for(let x=5;x<128;x+=12){c.fillStyle=rng()>.69?(['#ffe1ac','#edbc91','#f8cd90'][Math.floor(rng()*3)]):'#67708b';c.fillRect(x,y,5,7);c.fillStyle='#303c50';c.fillRect(x+5,y,1,7);}});t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
function signTexture(a,b,dir='↓'){return canvasTexture(512,176,c=>{c.fillStyle='#123f43';c.fillRect(0,0,512,176);c.strokeStyle='#a8c2bb';c.lineWidth=5;c.strokeRect(5,5,502,166);c.font='bold 38px Arial';c.fillStyle='#f0ece1';c.textAlign='center';c.fillText(a,230,59);c.fillText(b,230,106);c.font='bold 52px Arial';c.fillText(dir,448,119);c.font='bold 16px Arial';c.textAlign='left';c.fillStyle='#c7dacf';c.fillText('CITY EXPRESSWAY',23,148);});}
function simpleMesh(w,h,d,material,x=0,y=0,z=0){const m=new THREE.Mesh(geoBox,material);m.scale.set(w,h,d);m.position.set(x,y,z);return m;}

export class RoadRenderer{
 constructor(canvas,images){
  this.canvas=canvas;this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.horizonColor=horizonColor(images.skyline);this.renderer.setClearColor(this.horizonColor);this.scene=new THREE.Scene();this.scene.fog=new THREE.FogExp2(this.horizonColor,.00175);this.camera=new THREE.PerspectiveCamera(57,1,.08,1600);this.camera.position.set(0,3.1,6.4);this.time=0;this.trafficActors=new Map();this.pickupActors=new Map();this.shake=0;this.cameraX=0;this.playerPose=1;
  this.hemi=new THREE.HemisphereLight(0xc9d7ff,0x76637b,2.0);this.sun=new THREE.DirectionalLight(0xffc69b,2.0);this.sun.position.set(-50,70,-120);this.scene.add(this.hemi,this.sun);
  this.glowMap=glowTexture();this.shadowMap=shadowTexture();this.vehicleTextures=VEHICLES.map((r,i)=>i<3?playerWheelTexture(images.vehicles,images.playerWheels,r,i):atlasTexture(images.vehicles,r));this.pickupTextures=PICKUPS.map(r=>atlasTexture(images.powerups,r));
  this.carTextures=[this.vehicleTextures.slice(0,3),...GARAGE_SPRITES.map(row=>row.map(rect=>atlasTexture(images.garageCars,rect)))];this.carMaterials=this.carTextures.map(row=>row.map(texture=>this.makeCarMaterial(texture)));
  const skyTex=new THREE.Texture(images.skyline);skyTex.colorSpace=THREE.SRGBColorSpace;skyTex.needsUpdate=true;this.sky=new THREE.Mesh(new THREE.PlaneGeometry(2350,1175),new THREE.MeshBasicMaterial({map:skyTex,fog:false,depthWrite:false}));this.sky.position.set(0,286,-1010);this.sky.renderOrder=-1000;this.scene.add(this.sky);
  this.createRoad();this.createCity();this.createStreetFurniture();this.player=this.makeCarActor(-1,2.18);this.player.sprite.material.dispose();this.setCar(CARS[0].id);this.scene.add(this.player.group);
  this.shieldRing=new THREE.Mesh(new THREE.TorusGeometry(1.48,.027,6,72),new THREE.MeshBasicMaterial({color:0x56edff,transparent:true,opacity:.8,depthWrite:false}));this.shieldRing.rotation.x=-Math.PI/2;this.shieldRing.position.y=.12;this.scene.add(this.shieldRing);
  this.exhaust=[-1,1].map(side=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowMap,color:0x22ccff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));s.scale.set(.85,1.25,1);s.visible=false;this.scene.add(s);return s;});
  this.resize();
 }
 makeCarMaterial(map){return new THREE.SpriteMaterial({map,transparent:true,alphaTest:.025,depthWrite:true,toneMapped:false});}
 setCar(id){
  this.carIndex=Math.max(0,CARS.findIndex(car=>car.id===id));this.playerMaterials=this.carMaterials[this.carIndex];this.player.sprite.material=this.playerMaterials[this.playerPose];
  const image=this.carTextures[this.carIndex][1].image;this.player.height=2.18*image.height/image.width;this.player.sprite.scale.set(2.18,this.player.height,1);
  this.player.lights.forEach(light=>light.position.y=this.player.height*.48);
 }
 drawGaragePreview(canvas,id){const index=Math.max(0,CARS.findIndex(car=>car.id===id)),image=this.carTextures[index][0].image,ctx=canvas.getContext('2d'),scale=Math.min((canvas.width-24)/image.width,(canvas.height-8)/image.height);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,(canvas.width-image.width*scale)/2,(canvas.height-image.height*scale)/2,image.width*scale,image.height*scale);}
 createRoad(){
  this.asphalt=asphaltTexture();this.roadGeom=new THREE.BufferGeometry();this.roadPositions=new Float32Array(145*6*3);this.roadUV=new Float32Array(145*6*2);this.roadGeom.setAttribute('position',new THREE.BufferAttribute(this.roadPositions,3).setUsage(THREE.DynamicDrawUsage));this.roadGeom.setAttribute('uv',new THREE.BufferAttribute(this.roadUV,2).setUsage(THREE.DynamicDrawUsage));this.roadGeom.computeVertexNormals();
  this.road=new THREE.Mesh(this.roadGeom,new THREE.MeshBasicMaterial({map:this.asphalt,color:0xbfc3d5}));this.road.frustumCulled=false;this.scene.add(this.road);
  this.linesGeom=new THREE.BufferGeometry();this.linePositions=new Float32Array(3*72*18+2*145*18);this.linesGeom.setAttribute('position',new THREE.BufferAttribute(this.linePositions,3).setUsage(THREE.DynamicDrawUsage));this.lines=new THREE.Mesh(this.linesGeom,new THREE.MeshBasicMaterial({color:0xe9e1df}));this.lines.frustumCulled=false;this.scene.add(this.lines);
  const concrete=new THREE.MeshLambertMaterial({color:0x9e97a2});this.barriers=new THREE.InstancedMesh(geoBox,concrete,150);this.barriers.frustumCulled=false;this.scene.add(this.barriers);
  this.reflectors=new THREE.InstancedMesh(geoBox,new THREE.MeshBasicMaterial({color:0xffbf61}),150);this.reflectors.frustumCulled=false;this.scene.add(this.reflectors);
  this.ground=new THREE.Mesh(new THREE.PlaneGeometry(2400,1800),new THREE.MeshLambertMaterial({color:0x45465e}));this.ground.rotation.x=-Math.PI/2;this.ground.position.set(0,-8,-550);this.scene.add(this.ground);
  const waterMat=new THREE.MeshBasicMaterial({color:0x585472});this.water=new THREE.Mesh(new THREE.PlaneGeometry(320,1700),waterMat);this.water.rotation.x=-Math.PI/2;this.water.position.set(-225,-7.92,-530);this.scene.add(this.water);
  this.waterShimmer=new THREE.InstancedMesh(geoBox,new THREE.MeshBasicMaterial({color:0xec967b,transparent:true,opacity:.22}),70);this.scene.add(this.waterShimmer);
 }
 createCity(){
  const wall=new THREE.MeshLambertMaterial({map:windowsTexture(),color:0xffffff,emissive:0x726071,emissiveIntensity:.19});const roof=new THREE.MeshLambertMaterial({color:0x656880});
  this.buildings=new THREE.InstancedMesh(geoBox,[wall,wall,roof,roof,wall,wall],100);this.buildings.frustumCulled=false;this.cityObjects=[];const rng=randomSource(317);
  for(let i=0;i<100;i++){const side=i%2?1:-1;this.cityObjects.push({side,off:side*(20+rng()*48+(side<0?75:0)),world:(Math.floor(i/2)*33),width:8+rng()*20,depth:10+rng()*18,height:14+rng()*76});this.buildings.setColorAt(i,new THREE.Color().setHSL(.63+rng()*.035,.10+rng()*.09,.36+rng()*.16));}this.scene.add(this.buildings);
 }
 createStreetFurniture(){
  const poleMat=new THREE.MeshLambertMaterial({color:0x81859a});this.poles=new THREE.InstancedMesh(new THREE.CylinderGeometry(.07,.10,1,6),poleMat,52);this.arms=new THREE.InstancedMesh(geoBox,poleMat,52);this.lampHeads=new THREE.InstancedMesh(geoBox,new THREE.MeshBasicMaterial({color:0xffe4b6}),52);for(const m of [this.poles,this.arms,this.lampHeads]){m.frustumCulled=false;this.scene.add(m);}
  this.lampGlows=[];for(let i=0;i<52;i++){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowMap,color:0xffc675,transparent:true,opacity:.68,blending:THREE.AdditiveBlending,depthWrite:false}));sprite.scale.set(1.4,1.4,1);this.scene.add(sprite);this.lampGlows.push(sprite);}
  this.signs=[];for(let i=0;i<3;i++){
   const group=new THREE.Group();const m=new THREE.MeshLambertMaterial({color:0x6e788b});group.add(simpleMesh(.17,7.8,.17,m,-8.5,3.9),simpleMesh(.17,7.8,.17,m,8.5,3.9),simpleMesh(17.5,.23,.23,m,0,7.55));
   const labels=i===0?[['Riverside','Downtown'],['Harbor','Central']]:i===1?[['Skyline','District'],['City','Expressway']]:[['Overdrive','Express'],['Downtown','North']];
   labels.forEach((t,j)=>{const board=new THREE.Mesh(new THREE.PlaneGeometry(5.3,1.83),new THREE.MeshBasicMaterial({map:signTexture(t[0],t[1],j?'↗':'↓')}));board.position.set(j?3.4:-3.4,6.35,.1);group.add(board);});this.scene.add(group);this.signs.push(group);
  }
  this.bridges=[];const bridgeMat=new THREE.MeshLambertMaterial({color:0x797b8d});for(let i=0;i<2;i++){const g=new THREE.Group();g.add(simpleMesh(96,1,8,bridgeMat,0,8.5),simpleMesh(1.3,15,2,bridgeMat,-15,1),simpleMesh(1.3,15,2,bridgeMat,15,1),simpleMesh(96,.7,.3,bridgeMat,0,9.25,-3.8),simpleMesh(96,.7,.3,bridgeMat,0,9.25,3.8));const trims=new THREE.MeshBasicMaterial({color:0xe2ba95});g.add(simpleMesh(90,.07,.05,trims,0,8.12,4.03));this.scene.add(g);this.bridges.push(g);}
  this.dummy=new THREE.Object3D();
 }
 makeCarActor(type,width){
  const group=new THREE.Group();const texIndex=type<0?1:3+type;const rect=VEHICLES[texIndex];const h=width*rect[3]/rect[2];const sprite=new THREE.Sprite(this.makeCarMaterial(this.vehicleTextures[texIndex]));sprite.center.set(.5,0);sprite.position.y=.04;sprite.scale.set(width,h,1);group.add(sprite);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:this.shadowMap,transparent:true,depthWrite:false,opacity:.85}));shadow.rotation.x=-Math.PI/2;shadow.scale.set(width*1.6,width*2.2,1);shadow.position.set(0,.025,-.45);group.add(shadow);
  const lights=[-1,1].map(side=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowMap,color:0xff3920,blending:THREE.AdditiveBlending,transparent:true,opacity:.38,depthWrite:false}));s.position.set(side*width*.33,h*.48,.035);s.scale.set(.45,.27,1);group.add(s);return s;});
  return{group,sprite,shadow,lights,width,height:h,type};
 }
 makePickupActor(type){const group=new THREE.Group();const r=PICKUPS[type],w=1.65;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.pickupTextures[type],transparent:true,alphaTest:.008,depthWrite:false,toneMapped:false}));sprite.scale.set(w,w*r[3]/r[2],1);group.add(sprite);const ring=new THREE.Mesh(new THREE.TorusGeometry(.66,.025,5,40),new THREE.MeshBasicMaterial({color:PICKUP_COLORS[type],transparent:true,opacity:.7,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=-.95;group.add(ring);const glow=new THREE.Mesh(new THREE.PlaneGeometry(3,3),new THREE.MeshBasicMaterial({map:this.glowMap,color:PICKUP_COLORS[type],transparent:true,blending:THREE.AdditiveBlending,opacity:.4,depthWrite:false}));glow.rotation.x=-Math.PI/2;glow.position.y=-.97;group.add(glow);return{group,sprite,ring,glow};}
 updateRoad(distance){
  let v=0,u=0;const pos=this.roadPositions,uv=this.roadUV;
  const put=(x,s,y=0)=>{pos[v++]=roadOffset(distance,s)+x;pos[v++]=y;pos[v++]=-s;uv[u++]=(x+8)/8;uv[u++]=(s+distance)/12;};
  for(let i=0;i<145;i++){const a=-30+i*6,b=a+6;put(-8,a);put(8,a);put(-8,b);put(8,a);put(8,b);put(-8,b);}
  this.roadGeom.attributes.position.needsUpdate=true;this.roadGeom.attributes.uv.needsUpdate=true;
  let k=0;const ribbon=(x,w,a,b)=>{const coords=[[x-w,a],[x+w,a],[x-w,b],[x+w,a],[x+w,b],[x-w,b]];for(const [xx,s]of coords){this.linePositions[k++]=roadOffset(distance,s)+xx;this.linePositions[k++]=.028;this.linePositions[k++]=-s;}};
  for(const x of [-3.5,0,3.5])for(let i=0;i<72;i++){const a=(Math.floor(distance/12)+i-3)*12-distance;ribbon(x,.056,a,a+5);}
  for(const x of [-7.18,7.18])for(let i=0;i<145;i++)ribbon(x,.075,-30+i*6,-24+i*6);
  this.linesGeom.attributes.position.needsUpdate=true;
  for(let i=0;i<75;i++){const s=(Math.floor(distance/12)+i-3)*12-distance;const center=roadOffset(distance,s);const angle=-Math.atan((roadOffset(distance,s+1)-roadOffset(distance,s-1))/2);for(let side=0;side<2;side++){const sign=side?1:-1;this.dummy.position.set(center+sign*8.05,.39,-s);this.dummy.rotation.set(0,angle,0);this.dummy.scale.set(.4,.85,12.08);this.dummy.updateMatrix();this.barriers.setMatrixAt(i*2+side,this.dummy.matrix);this.dummy.position.set(center+sign*7.82,.58,-s);this.dummy.scale.set(.03,.10,.44);this.dummy.updateMatrix();this.reflectors.setMatrixAt(i*2+side,this.dummy.matrix);}}
  this.barriers.instanceMatrix.needsUpdate=true;this.reflectors.instanceMatrix.needsUpdate=true;
 }
 updateCity(distance){
  this.cityObjects.forEach((o,i)=>{const s=((o.world-distance)%1650+1650)%1650-90;this.dummy.position.set(roadOffset(distance,s)+o.off,o.height/2-8,-s);this.dummy.rotation.set(0,0,0);this.dummy.scale.set(o.width,o.height,o.depth);this.dummy.updateMatrix();this.buildings.setMatrixAt(i,this.dummy.matrix);});this.buildings.instanceMatrix.needsUpdate=true;
  for(let i=0;i<70;i++){const s=((i*21-distance*.15)%1250+1250)%1250-35;this.dummy.position.set(-130-Math.sin(i*9.4)*75,-7.88,-s);this.dummy.scale.set(9+Math.sin(i*7)*7,.01,.6+Math.abs(Math.cos(i*2))*1.5);this.dummy.rotation.set(0,0,0);this.dummy.updateMatrix();this.waterShimmer.setMatrixAt(i,this.dummy.matrix);}this.waterShimmer.instanceMatrix.needsUpdate=true;
  for(let i=0;i<26;i++){const s=(Math.floor(distance/34)+i-2)*34-distance;for(let n=0;n<2;n++){const side=n?1:-1,index=i*2+n,center=roadOffset(distance,s);this.dummy.rotation.set(0,0,0);this.dummy.position.set(center+side*8.43,3.45,-s);this.dummy.scale.set(1,6.9,1);this.dummy.updateMatrix();this.poles.setMatrixAt(index,this.dummy.matrix);this.dummy.position.set(center+side*7.38,6.85,-s);this.dummy.scale.set(2.25,.12,.12);this.dummy.updateMatrix();this.arms.setMatrixAt(index,this.dummy.matrix);this.dummy.position.set(center+side*6.38,6.78,-s);this.dummy.scale.set(.8,.1,.32);this.dummy.updateMatrix();this.lampHeads.setMatrixAt(index,this.dummy.matrix);this.lampGlows[index].position.copy(this.dummy.position);}}
  for(const m of[this.poles,this.arms,this.lampHeads])m.instanceMatrix.needsUpdate=true;
  this.signs.forEach((g,i)=>{const s=((i*340+160-distance)%1020+1020)%1020-70;g.position.set(roadOffset(distance,s),0,-s);g.rotation.y=-Math.atan((roadOffset(distance,s+1)-roadOffset(distance,s-1))/2);});
  this.bridges.forEach((g,i)=>{const s=((i*580+410-distance)%1160+1160)%1160-80;g.position.set(roadOffset(distance,s),0,-s);g.rotation.y=-.19;});
 }
 updateActors(model,dt){
  const liveCars=new Set();for(const t of model.traffic){liveCars.add(t.id);let a=this.trafficActors.get(t.id);if(!a){a=this.makeCarActor(t.type,t.width);this.trafficActors.set(t.id,a);this.scene.add(a.group);}a.group.position.set(roadOffset(model.distance,t.s)+t.x,Math.sin(this.time*13+t.phase)*.012,-t.s);a.sprite.material.rotation=t.change?Math.sin(this.time*1.6)*.018:0;a.lights.forEach((s,j)=>{const signalling=(t.signal>0||t.change)&&((t.targetLane>t.lane?1:0)===j);s.material.color.setHex(signalling?0xffbb30:0xff3018);s.material.opacity=signalling?(Math.sin(this.time*10)>0?.95:.05):(t.braking?.9:.22);});}
  for(const[id,a]of this.trafficActors)if(!liveCars.has(id)){this.disposeActor(a);this.trafficActors.delete(id);}
  const livePickups=new Set();for(const p of model.pickups){livePickups.add(p.id);let a=this.pickupActors.get(p.id);if(!a){a=this.makePickupActor(p.type);this.pickupActors.set(p.id,a);this.scene.add(a.group);}a.group.position.set(roadOffset(model.distance,p.s)+p.x,1.15+Math.sin(this.time*3.8+p.phase)*.12,-p.s);a.sprite.scale.x=1.65*(.93+Math.sin(this.time*2+p.phase)*.07);a.sprite.material.rotation=Math.sin(this.time*2+p.phase)*.065;a.ring.rotation.z=this.time;a.ring.scale.setScalar(1+Math.sin(this.time*5)*.09);a.glow.material.opacity=.35+Math.sin(this.time*4)*.12;}
  for(const[id,a]of this.pickupActors)if(!livePickups.has(id)){this.disposeActor(a);this.pickupActors.delete(id);}
  const px=model.playerX;this.player.group.position.set(px,.035+Math.sin(this.time*21)*.008,0);
  // Outside lanes retain their camera-facing flank when steering stops.
  const lanePose=px<=-3.5?0:px>=3.5?2:null;
  const pose=lanePose??(model.playerV< -1.5?2:model.playerV>1.5?0:1);
  if(pose!==this.playerPose){this.playerPose=pose;this.player.sprite.material=this.playerMaterials[pose];}
  this.player.sprite.scale.set(2.18+(pose===1?0:.06),this.player.height,1);this.player.sprite.material.rotation=-model.playerV*.008;
  this.player.sprite.visible=model.invincible<=0||Math.sin(this.time*25)>-.5;
  this.player.lights.forEach(s=>s.material.opacity=model.brake?.85:.3);
  if(model.mode==='crashed'){this.player.sprite.material.rotation=Math.sin(this.time*8)*.018;}
  this.shieldRing.visible=model.shield>0;this.shieldRing.position.x=px;this.shieldRing.scale.setScalar(1+Math.sin(this.time*3)*.035);this.shieldRing.material.opacity=.45+Math.sin(this.time*4)*.2;
  this.exhaust.forEach((s,i)=>{s.visible=model.boost>0;s.position.set(px+(i?.74:-.74),.22,.35);s.scale.set(.56+Math.sin(this.time*50)*.09,.95+Math.sin(this.time*61)*.12,1);});
 }
 disposeActor(a){this.scene.remove(a.group);a.group.traverse(o=>{if(o.material)o.material.dispose();if(o.isMesh&&!o.isSprite&&o.geometry&&o.geometry!==geoBox)o.geometry.dispose();});}
 resize(){const w=this.canvas.clientWidth||window.innerWidth,h=this.canvas.clientHeight||window.innerHeight;this.width=w;this.height=h;this.portrait=w/h<.85;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 render(model,dt){
  this.time+=dt;const menu=model.mode==='menu';const follow=menu?0:(this.portrait?.65:.28);this.cameraX=mix(this.cameraX,model.playerX*follow,1-Math.exp(-dt*4));const boost=model.boost>0;const targetFov=(this.portrait?72:57)+(boost?7:0);this.camera.fov=mix(this.camera.fov,targetFov,1-Math.exp(-dt*4));this.camera.updateProjectionMatrix();
  this.shake=Math.max(0,this.shake-dt*1.5);const sx=(Math.random()-.5)*this.shake*.13;this.camera.position.set(this.cameraX+sx,this.portrait?4.3:menu?3.2:3.1,this.portrait?8.4:menu?8:6.4);
  vector.set(this.cameraX+roadOffset(model.distance,80)*.26,.4,-65);this.camera.lookAt(vector);this.camera.rotation.z=-model.playerV*.0014;
  this.updateRoad(model.distance);this.updateCity(model.distance);this.updateActors(model,dt);
  const night=clamp(model.distance/8500,0,.78);this.sky.material.color.setRGB(1-night*.35,1-night*.35,1-night*.12);this.sun.intensity=2.0-night*1.4;this.hemi.intensity=2-night*.5;this.scene.fog.color.copy(this.horizonColor).multiply(this.sky.material.color);this.renderer.setClearColor(this.scene.fog.color);this.road.material.color.setRGB(.75-night*.23,.76-night*.2,.84-night*.13);this.renderer.render(this.scene,this.camera);
 }
 project(x,y,s,model){vector.set(x+roadOffset(model.distance,s),y,-s);vector.project(this.camera);return{x:(vector.x*.5+.5)*this.width,y:(-.5*vector.y+.5)*this.height};}
}
