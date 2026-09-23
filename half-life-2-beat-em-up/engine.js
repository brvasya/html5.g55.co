(function(root){
'use strict';
const AREA=1080, LANES={min:24,max:230};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const THEMES=[
 {id:'city',name:'CITY 17',label:'CITY 17',areas:['STATION PLAZA','CIVIL PROTECTION','THE BARRICADE'],boss:'CIVIL PROTECTION COMMANDER',bossType:'combine',bossHP:300,pattern:['shot','melee','volley'],prop:'SUPPLY CRATE',propHeight:82,background:'#465d68',brief:'Break the blockade. Reach the canals.',encounters:[['combine','combine','headcrab','combine'],['combine','headcrab','combine','combine','headcrab'],['combine','combine','headcrab']]},
 {id:'canal',name:'ROUTE KANAL',label:'KANAL',areas:['THE DRAINAGE RUN','FLOOD CONTROL','THE LOCK GATE'],boss:'STRIDER · CANAL SENTINEL',bossType:'strider',bossHP:400,pattern:['shot','stomp','volley'],prop:'FUEL DRUM',propHeight:96,background:'#365d5e',brief:'Follow the water. Clear a path to Ravenholm.',encounters:[['headcrab','combine','headcrab','combine','headcrab'],['combine','headcrab','zombie','combine','headcrab'],['combine','headcrab','combine']]},
 {id:'raven',name:'RAVENHOLM',label:'RAVENHOLM',areas:['THE OLD TOWN','FATHER GRIGORI’S ROAD','CEMETERY GATE'],boss:'RAVENHOLM ABOMINATION',bossType:'zombie',bossHP:460,pattern:['melee','pounce','stomp'],prop:'TIMBER WARDROBE',propHeight:164,background:'#1e343e',brief:'Stay out of their reach. Cross the dead town.',encounters:[['zombie','headcrab','zombie','headcrab','zombie'],['zombie','zombie','headcrab','zombie','headcrab','zombie'],['zombie','headcrab','zombie','headcrab']]},
 {id:'prison',name:'NOVA PROSPEKT',label:'NOVA PROSPEKT',areas:['THE PRISON YARD','CELL BLOCK D','THE WARDEN’S HALL'],boss:'NOVA PROSPEKT WARDEN',bossType:'combine',bossHP:530,pattern:['volley','melee','shot','volley'],prop:'SECURITY CABINET',propHeight:167,background:'#283e40',brief:'Take the prison. Break the Combine line.',encounters:[['combine','combine','zombie','headcrab','combine'],['combine','combine','headcrab','combine','zombie','combine'],['combine','combine','headcrab','combine']]},
 {id:'citadel',name:'THE CITADEL',label:'CITADEL',areas:['DARK ENERGY','THE ASCENT','REACTOR CORE'],boss:'CITADEL STRIDER',bossType:'strider',bossHP:670,pattern:['volley','stomp','shot','volley','stomp'],prop:'ENERGY CONTAINER',propHeight:105,background:'#162e45',brief:'Reach the core. Bring down the Citadel.',victory:'The reactor is silent. City 17 has a fighting chance.',encounters:[['combine','combine','headcrab','combine','zombie','headcrab'],['combine','combine','headcrab','combine','combine','zombie'],['combine','combine','headcrab','combine']]}
];
const ENEMIES={
 combine:{hp:68,speed:91,reach:400,damage:8,wind:.95,recovery:1.6,height:176},
 zombie:{hp:100,speed:72,reach:102,damage:12,wind:.8,recovery:1.35,height:178},
 headcrab:{hp:40,speed:139,reach:180,damage:7,wind:.78,recovery:1.55,height:63},
 strider:{hp:370,speed:55,reach:425,damage:15,wind:1.12,recovery:1.7,height:300}
};
class Engine{
 constructor(seed=27429){this.seed=seed;this.onEvent=()=>{};this.hasRun=false;this.reset();this.state='menu';}
 rand(){this.seed=(this.seed*1664525+1013904223)>>>0;return this.seed/4294967296;}
 emit(type,data={}){this.onEvent({type,...data});}
 reset(){
  this.chapter=0;this.area=0;this.score=0;this.kills=0;this.time=0;this.combo=0;this.comboTimer=0;this.maxCombo=0;this.nextId=1;this.clear=false;this.projectiles=[];this.props=[];this.pickups=[];this.enemies=[];this.inputX=0;this.inputY=0;this.screen={left:-200,right:1300};
  this.player={x:190,y:129,hp:100,energy:100,face:1,action:'idle',timer:0,duration:0,hitDone:false,invuln:1,dashCD:0,heavyCD:0,gravityCD:0,walk:0,moving:false,comboStep:0,chainWindow:0,queued:null};
  this.spawnArea();this.checkpoint=this.snapshot();
 }
 snapshot(){const p=this.player;return {chapter:this.chapter,score:this.score,kills:this.kills,hp:p.hp,energy:p.energy,maxCombo:this.maxCombo};}
 start(saved){
  this.reset();this.hasRun=true;
  if(saved&&Number.isInteger(saved.chapter)&&saved.chapter>=0&&saved.chapter<THEMES.length){
   this.chapter=saved.chapter;this.score=Math.max(0,Number(saved.score)||0);this.kills=Math.max(0,Number(saved.kills)||0);this.maxCombo=Math.max(0,Number(saved.maxCombo)||0);
   this.player.hp=clamp(Number(saved.hp)||100,25,100);this.player.energy=clamp(Number.isFinite(saved.energy)?saved.energy:100,0,100);
   this.enemies=[];this.props=[];this.spawnArea();
  }
  this.checkpoint=this.snapshot();this.state='play';this.emit('checkpoint',{save:this.checkpoint});this.emit('notice',{text:THEMES[this.chapter].brief,duration:3});
 }
 retry(){this.start({...this.checkpoint});}
 pause(){if(this.state==='play')this.state='pause';}
 resume(){if(this.state==='pause')this.state='play';}
 returnToMenu(){this.state='menu';}
 enterChapter(){
  if(this.chapter>=THEMES.length-1)return;
  this.chapter++;this.area=0;this.clear=false;this.enemies=[];this.props=[];this.pickups=[];this.projectiles=[];
  Object.assign(this.player,{x:190,y:129,hp:Math.min(100,this.player.hp+45),energy:100,action:'idle',timer:0,invuln:1.5,dashCD:0,heavyCD:0,gravityCD:0,comboStep:0,chainWindow:0,queued:null,walk:0,moving:false});
  this.combo=0;this.comboTimer=0;this.spawnArea();this.checkpoint=this.snapshot();this.state='play';this.emit('checkpoint',{save:this.checkpoint});
 }
 spawnArea(){
  const off=this.area*AREA,t=THEMES[this.chapter];this.clear=false;
  t.encounters[this.area].forEach((kind,i)=>this.spawnEnemy(kind,off+470+(i%3)*147+Math.floor(i/3)*66,52+(i%3)*68+(Math.floor(i/3)%2)*15));
  if(this.area===2)this.spawnEnemy(t.bossType,off+910,126,true);
  [[330,211],[620,35],[954,210]].forEach(([x,y],i)=>this.props.push({id:this.nextId++,x:off+x,y,hp:52,maxHP:52,state:0,theme:t.id,drop:i===1?'energy':'health',awarded:false,flash:0}));
  this.emit('area',{chapter:this.chapter,area:this.area});
 }
 spawnEnemy(type,x,y,boss=false){const s=ENEMIES[type],hp=boss?THEMES[this.chapter].bossHP:Math.round(s.hp*(1+this.chapter*.065));this.enemies.push({id:this.nextId++,type,x,y:clamp(y,LANES.min,LANES.max),hp,maxHP:hp,boss,face:-1,action:'idle',timer:0,duration:0,cd:.9+this.rand(),walk:0,moving:false,hitDone:false,attackCount:0,height:s.height*(boss&&type!=='strider'?1.15:1),attackKind:'melee',knock:0});}
 startAction(name,duration){const p=this.player;p.action=name;p.timer=duration;p.duration=duration;p.hitDone=false;p.moving=false;}
 action(name){
  if(this.state!=='play')return false;const p=this.player;
  if(name==='dash'){
   if(p.dashCD>0||p.action==='dash'||p.action==='dead')return false;
   p.dashCD=1.05;p.invuln=Math.max(p.invuln,.39);this.startAction('dash',.30);p.queued=null;
   const dx=this.inputX||(!this.inputY?p.face:0),dy=this.inputY,l=Math.hypot(dx,dy)||1;p.dashDX=dx/l;p.dashDY=dy/l;this.emit('sound',{sound:'dash'});return true;
  }
  if(!['idle','walk'].includes(p.action)){
   if(name==='melee'&&p.action==='melee'&&p.timer<.13)p.queued='melee';return false;
  }
  if(name==='melee'){
   p.comboStep=p.chainWindow>0?p.comboStep%3+1:1;p.chainWindow=.72;
   this.startAction('melee',p.comboStep===3?.38:.26);this.emit('sound',{sound:'swing'});return true;
  }
  if(name==='heavy'){
   if(p.heavyCD>0)return false;p.heavyCD=.86;p.comboStep=0;p.chainWindow=0;this.startAction('heavy',.49);this.emit('sound',{sound:'heavy'});return true;
  }
  if(name==='gravity'){
   if(p.gravityCD>0)return false;
   if(p.energy<30){p.gravityCD=.3;this.emit('notice',{text:'GRAVITY GUN RECHARGING',duration:.8});return false;}
   p.energy-=30;p.gravityCD=.7;this.startAction('gravity',.38);return true;
  }
  return false;
 }
 resolveMelee(heavy=false){
  const p=this.player,fin=heavy||p.comboStep===3,reach=heavy?165:fin?149:132,damage=heavy?49:fin?41:p.comboStep===2?27:23;let hit=false;
  for(const e of this.enemies){const dx=(e.x-p.x)*p.face;if(e.hp>0&&dx>-28&&dx<reach&&Math.abs(e.y-p.y)<(heavy?65:fin?54:45)){this.hitEnemy(e,damage,fin?'finisher':'melee',p.face);hit=true;}}
  for(const o of this.props){const dx=(o.x-p.x)*p.face;if(o.hp>0&&dx>-25&&dx<reach&&Math.abs(o.y-p.y)<(heavy?66:53)){this.hitProp(o,fin?52:29);hit=true;}}
  this.emit('arc',{x:p.x,y:p.y,face:p.face,heavy:fin});
  if(hit){this.emit('shake',{strength:fin?5:2});if(fin)this.emit('notice',{text:heavy?'HEAVY IMPACT':'CROWBAR FINISHER',duration:.6});}
 }
 gravityBlast(){
  const p=this.player;this.emit('pulse',{x:p.x,y:p.y,face:p.face});this.emit('sound',{sound:'gravity'});this.emit('shake',{strength:5});
  for(const e of this.enemies){const dx=(e.x-p.x)*p.face;if(e.hp>0&&dx>-35&&dx<475&&Math.abs(e.y-p.y)<72+Math.max(0,dx)*.05)this.hitEnemy(e,dx<220?68:49,'gravity',p.face);}
  for(const o of this.props){const dx=(o.x-p.x)*p.face;if(o.hp>0&&dx>-30&&dx<450&&Math.abs(o.y-p.y)<83)this.hitProp(o,70);}
  for(const b of this.projectiles){if(Math.abs(b.x-p.x)<490&&Math.abs(b.y-p.y)<110){b.friendly=true;b.vx=p.face*Math.max(480,Math.abs(b.vx)*1.4);b.vy=0;b.life=1.5;}}
 }
 hitProp(o,damage){
  if(o.hp<=0)return;o.hp=Math.max(0,o.hp-damage);o.state=o.hp<=0?2:o.hp<40?1:0;o.flash=.1;
  this.emit('impact',{x:o.x,y:o.y,height:43,color:'#f6be7b',count:9});
  if(o.hp===0&&!o.awarded){o.awarded=true;this.score+=75;this.pickups.push({id:this.nextId++,x:o.x,y:o.y,type:o.drop,life:60});this.emit('sound',{sound:'break'});}
 }
 hitEnemy(e,damage,kind,face){
  if(e.hp<=0)return;damage=Math.min(damage,e.hp);e.hp-=damage;
  const knock=kind==='gravity'?105:kind==='finisher'?56:15;e.knock=face*knock*(e.boss?.32:1);
  if(!e.boss||kind==='gravity'||kind==='finisher'){e.action='hurt';e.timer=e.boss?.24:kind==='gravity'?.64:.24;e.cd=Math.max(e.cd,e.timer+.18);}
  this.combo++;this.comboTimer=2.5;this.maxCombo=Math.max(this.maxCombo,this.combo);this.score+=Math.round(damage*(1+Math.min(3,Math.floor(this.combo/8))*.25));
  this.emit('impact',{x:e.x,y:e.y,height:e.height*.57,color:kind==='gravity'?'#80eafa':'#ffc177',count:kind==='finisher'?13:8});
  this.emit('damageText',{x:e.x,y:e.y,amount:damage,color:kind==='gravity'?'#a3edff':'#ffdbac'});this.emit('sound',{sound:'hit'});
  if(e.hp===0){
   this.kills++;this.score+=e.boss?1800:150;e.action='dead';e.timer=1.2;e.moving=false;
   this.player.energy=Math.min(100,this.player.energy+7);if(kind==='melee'||kind==='finisher')this.player.hp=Math.min(100,this.player.hp+5);
   if(e.boss){this.emit('notice',{text:THEMES[this.chapter].boss+' DEFEATED',duration:2});this.emit('sound',{sound:'bossdown'});}else if(this.rand()<.17)this.pickups.push({id:this.nextId++,x:e.x,y:e.y,type:'health',life:45});
   this.emit('kill',{boss:e.boss});
  }
 }
 hurtPlayer(amount,attacker){
  const p=this.player;if(p.hp<=0||p.invuln>0)return false;
  p.hp=Math.max(0,p.hp-amount);p.invuln=.82;p.queued=null;this.startAction('hurt',.22);this.combo=0;this.comboTimer=0;
  if(attacker)p.x=clamp(p.x+(p.x<attacker.x?-19:19),Math.max(40,this.area*AREA-155),(this.area+1)*AREA-74);
  this.emit('hurt',{amount});this.emit('sound',{sound:'hurt'});
  if(p.hp===0){p.action='dead';p.timer=1;this.state='dying';this.deathTimer=1.1;}
  return true;
 }
 step(dt,input={}){
  dt=clamp(dt,0,.05);
  if(this.state==='dying'){this.deathTimer-=dt;if(this.deathTimer<=0){this.state='dead';this.emit('defeat');}return;}
  if(this.state!=='play')return;
  this.time+=dt;const p=this.player;this.inputX=clamp(input.x||0,-1,1);this.inputY=clamp(input.y||0,-1,1);
  if(this.inputX&&['idle','walk'].includes(p.action))p.face=this.inputX>0?1:-1;
  for(const k of ['invuln','dashCD','heavyCD','gravityCD','chainWindow'])p[k]=Math.max(0,p[k]-dt);
  p.energy=Math.min(100,p.energy+dt*6.5);this.comboTimer-=dt;if(this.comboTimer<=0)this.combo=0;
  if(input.actions)for(const a of input.actions)this.action(a);
  const ox=p.x,oy=p.y;p.moving=false;
  if(p.timer>0){
   p.timer-=dt;const elapsed=p.duration-p.timer;
   if(!p.hitDone&&((p.action==='melee'&&elapsed>.075)||(p.action==='heavy'&&elapsed>.18)||(p.action==='gravity'&&elapsed>.10))){p.hitDone=true;p.action==='gravity'?this.gravityBlast():this.resolveMelee(p.action==='heavy');}
   if(p.action==='dash'){p.x+=p.dashDX*540*dt;p.y+=p.dashDY*300*dt;}
   if(p.timer<=0){p.action='idle';if(p.queued){const queued=p.queued;p.queued=null;this.action(queued);}}
  }
  if(['idle','walk'].includes(p.action)){
   const len=Math.max(1,Math.hypot(this.inputX,this.inputY));p.x+=this.inputX/len*245*dt;p.y+=this.inputY/len*153*dt;
  }
  p.y=clamp(p.y,LANES.min,LANES.max);p.x=clamp(p.x,Math.max(40,this.area*AREA-155),(this.area+1)*AREA-(this.clear?20:73));
  const dist=Math.hypot(p.x-ox,p.y-oy);if(dist>.02){p.walk+=dist;p.moving=true;if(p.action==='idle')p.action='walk';}else if(p.action==='walk')p.action='idle';
  for(const e of this.enemies)this.updateEnemy(e,dt);
  for(const o of this.props)o.flash=Math.max(0,o.flash-dt);
  for(const b of this.projectiles){
   const prev=b.x;b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
   if(b.friendly){for(const e of this.enemies)if(e.hp>0&&Math.abs(b.x-e.x)<40&&Math.abs(b.y-e.y)<31){this.hitEnemy(e,65,'gravity',Math.sign(b.vx));b.life=0;break;}}
   else if(b.life>0&&Math.min(prev,b.x)-25<p.x&&Math.max(prev,b.x)+25>p.x&&Math.abs(b.y-p.y)<26){this.hurtPlayer(b.damage,{x:p.x-Math.sign(b.vx)*100});b.life=0;}
  }
  this.projectiles=this.projectiles.filter(b=>b.life>0);
  for(const i of this.pickups){
   i.life-=dt;
   if(Math.abs(p.x-i.x)<48&&Math.abs(p.y-i.y)<38){
    if(i.type==='health'&&p.hp<100){p.hp=Math.min(100,p.hp+25);this.emit('float',{x:i.x,y:i.y,text:'+25 HEALTH',color:'#beebbb'});i.life=0;}
    else if(i.type==='energy'&&p.energy<100){p.energy=Math.min(100,p.energy+40);this.emit('float',{x:i.x,y:i.y,text:'+40 ENERGY',color:'#9ae5ff'});i.life=0;}
    if(i.life===0)this.emit('sound',{sound:'pickup'});
   }
  }
  this.pickups=this.pickups.filter(i=>i.life>0);
  if(p.hp<=0)return;
  if(!this.clear&&this.enemies.every(e=>e.hp<=0)){this.clear=true;this.projectiles=[];this.score+=450;this.emit('notice',{text:'AREA CLEARED · MOVE RIGHT',duration:2.2});this.emit('sound',{sound:'clear'});}
  if(this.clear&&p.x>(this.area+1)*AREA-54){
   if(this.area<2){this.area++;this.enemies=this.enemies.filter(e=>e.x>=this.area*AREA-160);this.props=this.props.filter(o=>o.x>=this.area*AREA-170);this.pickups=this.pickups.filter(o=>o.x>=this.area*AREA-170);this.spawnArea();this.emit('notice',{text:THEMES[this.chapter].areas[this.area],duration:2});}
   else{this.state=this.chapter===THEMES.length-1?'win':'chapter';this.score+=1500;this.emit(this.state==='win'?'victory':'chapterComplete');}
  }
 }
 fireVolley(e,count=1){
  const target=e.attackTarget,angle=Math.atan2(target.y-e.y,target.x-e.x),speed=e.type==='strider'?350:375;
  for(let i=0;i<count;i++){const a=angle+(i-(count-1)/2)*.115;this.projectiles.push({x:e.x+e.face*49,y:e.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:2.8,damage:ENEMIES[e.type].damage+(e.boss?3:0),friendly:false});}
  this.emit('sound',{sound:'enemyShot'});
 }
 updateEnemy(e,dt){
  if(e.knock){const d=e.knock*Math.min(1,dt*13);e.x=clamp(e.x+d,this.area*AREA+30,(this.area+1)*AREA-54);e.knock-=d;if(Math.abs(e.knock)<1)e.knock=0;}
  if(e.hp<=0){e.timer=Math.max(0,e.timer-dt);return;}
  const p=this.player,s=ENEMIES[e.type],t=THEMES[this.chapter];e.cd=Math.max(0,e.cd-dt);e.moving=false;const dx=p.x-e.x,dy=p.y-e.y;
  if(!['windup','attack'].includes(e.action))e.face=dx>=0?1:-1;
  if(e.action==='hurt'){e.timer-=dt;if(e.timer<=0)e.action='idle';return;}
  if(e.action==='windup'){e.timer-=dt;if(e.timer<=0){e.action='attack';e.timer=e.attackKind==='pounce'?.38:.3;e.hitDone=false;this.emit('sound',{sound:'enemySwing'});}return;}
  if(e.action==='attack'){
   e.timer-=dt;
   if(e.attackKind==='pounce'){
    e.x=clamp(e.x+e.face*(e.boss?380:450)*dt,this.area*AREA+30,(this.area+1)*AREA-50);
    if(!e.hitDone&&Math.abs(p.x-e.x)<(e.boss?85:50)&&Math.abs(p.y-e.y)<36){this.hurtPlayer(s.damage+(e.boss?4:0),e);e.hitDone=true;}
   }else if(!e.hitDone){
    e.hitDone=true;
    if(e.attackKind==='shot'||e.attackKind==='volley')this.fireVolley(e,e.attackKind==='volley'?3:1);
    else if(e.attackKind==='stomp'){
     this.emit('stomp',{x:e.x,y:e.y});if(Math.abs(dx)<(e.type==='strider'?196:163)&&Math.abs(dy)<80)this.hurtPlayer(s.damage+6,e);
    }else if(dx*e.face>-24&&Math.abs(dx)<(e.boss?145:113)&&Math.abs(dy)<48)this.hurtPlayer(s.damage+(e.boss?3:0),e);
   }
   if(e.timer<=0){e.action='idle';e.cd=s.recovery+this.rand()*.4;}return;
  }
  if(p.hp<=0)return;
  const visible=e.x>this.screen.left+30&&e.x<this.screen.right-30;
  let kind=e.boss?t.pattern[e.attackCount%t.pattern.length]:e.type==='headcrab'?'pounce':e.type==='combine'?(Math.abs(dx)<120?'melee':'shot'):'melee';
  const reach=kind==='volley'||kind==='shot'?410:kind==='pounce'?205:kind==='stomp'?175:e.boss?140:100;
  if(visible&&e.cd<=0&&Math.abs(dx)<reach&&Math.abs(dy)<(kind==='stomp'?65:kind==='volley'?66:40)){
   const busy=this.enemies.filter(o=>o.hp>0&&['windup','attack'].includes(o.action)).length;
   if(busy<2){e.attackCount++;e.attackKind=kind;e.action='windup';e.duration=kind==='stomp'?1.18:kind==='volley'?1.1:s.wind;e.timer=e.duration;e.attackTarget={x:p.x,y:p.y};return;}
  }
  let vx=0,vy=0;const ranged=kind==='shot'||kind==='volley',preferred=ranged?220:e.type==='headcrab'?132:81;
  if(Math.abs(dy)>12)vy=Math.sign(dy)*s.speed*.66;
  if(Math.abs(dx)>preferred)vx=Math.sign(dx)*s.speed;
  else if(ranged&&Math.abs(dx)<130&&e.cd<.6)vx=-Math.sign(dx)*s.speed*.5;
  if(e.cd>.3&&Math.abs(dx)<preferred+10)vx=0;
  for(const o of this.enemies){if(o===e||o.hp<=0)continue;const ex=e.x-o.x,ey=e.y-o.y;if(Math.abs(ex)<46&&Math.abs(ey)<30){vx+=Math.sign(ex||e.id-o.id)*25;vy+=Math.sign(ey||e.id-o.id)*22;}}
  const ox=e.x,oy=e.y;e.x=clamp(e.x+vx*dt,this.area*AREA+35,(this.area+1)*AREA-55);e.y=clamp(e.y+vy*dt,LANES.min,LANES.max);
  const moved=Math.hypot(e.x-ox,e.y-oy);if(moved>.05){e.walk+=moved;e.moving=true;e.action='walk';}else e.action='idle';
 }
 get remaining(){return this.enemies.filter(e=>e.hp>0).length;}
 get boss(){return this.enemies.find(e=>e.boss&&e.hp>0);}
}
const api={Engine,THEMES,ENEMIES,AREA,LANES,clamp};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HL2Core=api;
})(typeof window!=='undefined'?window:this);
