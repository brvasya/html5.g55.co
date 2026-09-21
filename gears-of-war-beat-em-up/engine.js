(function(root){
'use strict';
const AREA=1180, LANES={min:22,max:242};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const THEMES=[
 {id:'jacinto',name:'JACINTO RUINS',areas:['THE FALLEN AVENUE','EMERGENCE PLAZA','THE LAST BARRICADE'],boss:'LOCUST CAPTAIN',bossType:'drone',bossHP:220,prop:'COG AMMUNITION LOCKER',brief:'Push through Jacinto. Break the Locust barricade.'},
 {id:'station',name:'TIMGAD STATION',areas:['ABANDONED PLATFORM','THE BROKEN CONCOURSE','DEPARTURE HALL'],boss:'STATION ENFORCER',bossType:'grenadier',bossHP:265,prop:'ARMORED LUGGAGE TRUNK',brief:'Clear the station. Find a route beneath the city.'},
 {id:'hollow',name:'THE HOLLOW',areas:['INTO THE DEEP','IMULSION CROSSING','THE NEST'],boss:'HOLLOW STALKER',bossType:'wretch',bossHP:235,prop:'LOCUST SUPPLY POD',brief:'Follow the Imulsion. Cut through the swarm.'},
 {id:'refinery',name:'IMULSION REFINERY',areas:['PUMPING STATION','THE FURNACE LINE','PRESSURE CHAMBER'],boss:'REFINERY EXECUTIONER',bossType:'grenadier',bossHP:330,prop:'IMULSION CYLINDER',brief:'Fight through the refinery. Reach the stronghold.'},
 {id:'stronghold',name:'LOCUST STRONGHOLD',areas:['BLACKSTONE GATE','THE INNER SANCTUM','RAAM’S LAST STAND'],boss:'GENERAL RAAM',bossType:'raam',bossHP:480,prop:'LOCUST RELIQUARY',brief:'Finish the fight. General RAAM is waiting.'}
];
const ENEMIES={drone:{hp:64,speed:91,reach:92,damage:10,wind:.66,recovery:.82,height:177},grenadier:{hp:78,speed:66,reach:460,damage:12,wind:.9,recovery:1.2,height:187},wretch:{hp:38,speed:142,reach:102,damage:8,wind:.58,recovery:.86,height:112},raam:{hp:480,speed:78,reach:148,damage:19,wind:.82,recovery:1.12,height:238}};
class Engine{
 constructor(seed=14271){this.seed=seed;this.onEvent=()=>{};this.hasRun=false;this.reset();this.state='menu';}
 rand(){this.seed=(this.seed*1664525+1013904223)>>>0;return this.seed/4294967296;}
 emit(type,data={}){this.onEvent({type,...data});}
 reset(){this.chapter=0;this.area=0;this.score=0;this.kills=0;this.time=0;this.combo=0;this.comboTimer=0;this.maxCombo=0;this.nextId=1;this.clear=false;this.events=[];this.particles=[];this.projectiles=[];this.props=[];this.pickups=[];this.enemies=[];this.corpses=[];this.player={x:220,y:135,hp:100,maxHP:100,ammo:24,reserve:72,fury:100,face:1,action:'idle',timer:0,duration:0,hitDone:false,invuln:0,dodgeCD:0,fireCD:0,sawCD:0,walk:0,moving:false,comboStep:0,chainWindow:0,reloadTime:0,reloadTotal:1.65,reloadTried:false,powerClip:false};this.checkpoint=this.snapshot();this.spawnArea();}
 snapshot(){const p=this.player;return {chapter:this.chapter,score:this.score,kills:this.kills,hp:p.hp,ammo:p.ammo,reserve:p.reserve,fury:p.fury,maxCombo:this.maxCombo};}
 start(saved){this.hasRun=true;this.reset();if(saved&&Number.isInteger(saved.chapter)&&saved.chapter>=0&&saved.chapter<5){this.chapter=saved.chapter;this.score=Math.max(0,Number(saved.score)||0);this.kills=Math.max(0,Number(saved.kills)||0);this.maxCombo=Math.max(0,Number(saved.maxCombo)||0);const p=this.player;p.hp=clamp(Number(saved.hp)||100,30,100);p.ammo=clamp(Number(saved.ammo)||24,0,24);p.reserve=clamp(Number(saved.reserve)||72,0,192);p.fury=clamp(Number(saved.fury)||70,0,100);this.props=[];this.enemies=[];this.spawnArea();}this.checkpoint=this.snapshot();this.state='play';this.emit('checkpoint',{save:this.checkpoint});this.emit('notice',{text:THEMES[this.chapter].brief,duration:3.3});}
 retry(){const save={...this.checkpoint};this.start(save);}
 pause(){if(this.state==='play'){this.state='pause';this.emit('pause');}}
 resume(){if(this.state==='pause')this.state='play';}
 returnToMenu(){this.state='menu';}
 enterChapter(){if(this.chapter>=4)return;const p=this.player;this.chapter++;this.area=0;this.clear=false;this.enemies=[];this.props=[];this.corpses=[];this.pickups=[];this.projectiles=[];p.x=220;p.y=135;p.hp=Math.min(100,p.hp+40);p.ammo=24;p.reserve=Math.min(192,p.reserve+48);p.fury=Math.max(70,p.fury);p.action='idle';p.timer=0;p.invuln=1.4;p.dodgeCD=0;p.fireCD=0;p.sawCD=0;p.reloadTime=0;p.comboStep=0;p.powerClip=false;this.combo=0;this.comboTimer=0;this.spawnArea();this.checkpoint=this.snapshot();this.state='play';this.emit('checkpoint',{save:this.checkpoint});this.emit('notice',{text:THEMES[this.chapter].brief+'\n+40 HEALTH · AMMO RESUPPLIED',duration:4});}
 spawnArea(){
  const offset=this.area*AREA;this.clear=false;
  const compositions=[['drone','wretch','drone','drone'],['drone','grenadier','wretch','drone','wretch'],['grenadier','drone','wretch','drone']];
  const roster=compositions[this.area].slice();
  if(this.chapter>0)roster.push(this.chapter===2?'wretch':'grenadier');
  if(this.chapter>2)roster.push('drone');
  roster.forEach((kind,i)=>this.spawnEnemy(kind,offset+540+(i%3)*168+(i>2?105:0),52+(i%3)*76+(i>2?30:0)));
  if(this.area===2){const t=THEMES[this.chapter];this.spawnEnemy(t.bossType,offset+1020,143,true);}
  const propPoints=[[390,215],[708,42],[1010,212]];
  propPoints.forEach(([x,y],i)=>this.props.push({id:this.nextId++,x:x+offset,y,hp:60,maxHP:60,theme:THEMES[this.chapter].id,state:0,drop:i%2===0?'health':'ammo',awarded:false,flash:0}));
  this.emit('area',{chapter:this.chapter,area:this.area});
 }
 spawnEnemy(type,x,y,boss=false){const stats=ENEMIES[type],maxHP=boss?THEMES[this.chapter].bossHP:Math.round(stats.hp*(1+this.chapter*.07));this.enemies.push({id:this.nextId++,type,x,y:clamp(y,LANES.min,LANES.max),maxHP,hp:maxHP,boss,face:-1,action:'idle',timer:0,duration:0,cd:.7+this.rand()*.9,walk:0,moving:false,flash:0,hitDone:false,attackCount:0,attackTarget:null,knock:0,height:stats.height*(boss&&type!=='raam'?1.2:1)});}
 startAction(name,duration){const p=this.player;p.action=name;p.duration=duration;p.timer=duration;p.hitDone=false;p.moving=false;}
 action(name){
  if(this.state!=='play')return false;const p=this.player;
  if(name==='reload'){
   if(p.action==='reload'){
    if(!p.reloadTried){p.reloadTried=true;const progress=1-p.timer/p.reloadTotal;if(progress>=.47&&progress<=.63){p.powerClip=true;this.finishReload();this.emit('notice',{text:'PERFECT RELOAD · DAMAGE BOOST',duration:1.6});this.emit('sound',{sound:'perfect'});}else{p.timer+=.35;p.powerClip=false;this.emit('notice',{text:'RELOAD MISSED',duration:.8});}}
    return true;
   }
   if(p.ammo>=24||p.reserve<=0||!['idle','walk'].includes(p.action))return false;
   p.reloadTotal=1.65;p.reloadTried=false;p.powerClip=false;this.startAction('reload',p.reloadTotal);this.emit('sound',{sound:'reload'});return true;
  }
  if(name==='roll'){
   if(p.dodgeCD>0||p.action==='roll'||p.action==='saw')return false;
   p.dodgeCD=1.15;p.invuln=Math.max(p.invuln,.48);this.startAction('roll',.42);p.rollDX=(this.inputX||p.face);p.rollDY=this.inputY||0;const len=Math.hypot(p.rollDX,p.rollDY)||1;p.rollDX/=len;p.rollDY/=len;this.emit('sound',{sound:'roll'});return true;
  }
  if(!['idle','walk'].includes(p.action))return false;
  if(name==='melee'){
   p.comboStep=p.chainWindow>0?(p.comboStep%3)+1:1;p.chainWindow=.9;this.startAction('melee',p.comboStep===3?.44:.31);this.emit('sound',{sound:'swing'});return true;
  }
  if(name==='saw'){
   if(p.fury<45||p.sawCD>0){if(p.sawCD<=0)this.emit('notice',{text:'LAND STRIKES TO CHARGE THE CHAINSAW',duration:1.3});return false;}
   p.fury-=45;p.sawCD=1.8;this.startAction('saw',.77);p.invuln=Math.max(p.invuln,.46);this.emit('sound',{sound:'saw'});return true;
  }
  if(name==='fire'){
   if(p.fireCD>0)return false;if(p.ammo===0){this.action('reload');return false;}
   p.ammo--;p.fireCD=.15;this.startAction('fire',.14);this.firePlayer();return true;
  }
  return false;
 }
 finishReload(){const p=this.player,amount=Math.min(24-p.ammo,p.reserve);p.ammo+=amount;p.reserve-=amount;p.timer=0;p.action='idle';this.emit('sound',{sound:'rack'});}
 firePlayer(){
  const p=this.player,candidates=[...this.enemies.filter(e=>e.hp>0),...this.props.filter(e=>e.hp>0)].filter(e=>(e.x-p.x)*p.face>0&&(e.x-p.x)*p.face<790&&Math.abs(e.y-p.y)<34).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x));
  const target=candidates[0],endX=target?target.x:p.x+p.face*760;
  this.emit('tracer',{x:p.x+p.face*57,y:p.y,x2:endX,y2:p.y,enemy:false});
  if(target){if(target.type)this.hitEnemy(target,p.powerClip?16:11,'fire',p.face);else this.hitProp(target,16);}
  this.emit('sound',{sound:'shot'});
 }
 hitProp(prop,damage){if(prop.hp<=0)return;prop.hp=Math.max(0,prop.hp-damage);prop.flash=.1;prop.state=prop.hp<=0?2:prop.hp<42?1:0;this.emit('impact',{x:prop.x,y:prop.y,height:50,color:'#dbb473',count:9});if(prop.hp<=0&&!prop.awarded){prop.awarded=true;this.score+=75;this.pickups.push({id:this.nextId++,x:prop.x,y:prop.y,type:prop.drop,life:45});this.emit('sound',{sound:'break'});}}
 hitEnemy(e,damage,kind,face){
  if(e.hp<=0)return;e.hp=Math.max(0,e.hp-damage);e.flash=.09;
  const knock=kind==='saw'?65:kind==='finisher'?82:kind==='fire'?7:22;
  e.x=clamp(e.x+face*knock,this.area*AREA+60,(this.area+1)*AREA-65);
  if(kind!=='fire'||!e.boss){e.action='hurt';e.timer=e.boss?.14:.27;e.cd=Math.max(e.cd,.35);}
  this.combo++;this.maxCombo=Math.max(this.maxCombo,this.combo);this.comboTimer=2.1;
  this.player.fury=clamp(this.player.fury+(kind==='fire'?2:kind==='saw'?0:10),0,100);
  this.score+=Math.round(damage*(1+Math.min(3,Math.floor(this.combo/8))*.25));
  this.emit('impact',{x:e.x,y:e.y,height:e.height*.62,color:kind==='saw'?'#d68b66':'#e5c189',count:kind==='saw'?17:8});
  this.emit('damageText',{x:e.x,y:e.y,amount:damage,color:kind==='saw'?'#e88b6c':'#f4e3c3'});
  this.emit('sound',{sound:kind==='saw'?'sawhit':'hit'});
  if(e.hp===0){
   this.kills++;this.score+=e.boss?1500:140;e.action='dead';e.timer=3;e.moving=false;
   if(e.boss){this.emit('notice',{text:THEMES[this.chapter].boss+' DEFEATED',duration:2});this.emit('sound',{sound:'bossdown'});}
   if(!e.boss&&this.rand()<.22)this.pickups.push({id:this.nextId++,x:e.x,y:e.y,type:this.rand()<.55?'health':'ammo',life:40});
   this.emit('kill',{boss:e.boss});
  }
 }
 hurtPlayer(amount,attacker){const p=this.player;if(p.hp<=0||p.invuln>0)return false;p.hp=Math.max(0,p.hp-amount);p.invuln=.78;this.startAction('hurt',.22);this.combo=0;this.comboTimer=0;if(attacker)p.x=clamp(p.x+(p.x<attacker.x?-22:22),Math.max(28,this.area*AREA-180),(this.area+1)*AREA-110);this.emit('hurt',{amount});this.emit('sound',{sound:'hurt'});if(p.hp===0){p.action='dead';p.timer=1;this.state='dying';this.deathTimer=1.15;}return true;}
 resolvePlayerHit(){const p=this.player,isSaw=p.action==='saw',finisher=p.comboStep===3,reach=isSaw?152:finisher?138:112,damage=isSaw?92:finisher?39:24;let hit=false;
  for(const e of this.enemies){const dx=(e.x-p.x)*p.face;if(e.hp>0&&dx>-28&&dx<reach&&Math.abs(e.y-p.y)<(isSaw?51:43)){this.hitEnemy(e,damage,isSaw?'saw':finisher?'finisher':'melee',p.face);hit=true;}}
  for(const prop of this.props){const dx=(prop.x-p.x)*p.face;if(prop.hp>0&&dx>-20&&dx<reach&&Math.abs(prop.y-p.y)<53){this.hitProp(prop,isSaw?70:finisher?44:28);hit=true;}}
  if(hit)this.emit('shake',{strength:isSaw?7:finisher?5:2});if(finisher&&hit&&!isSaw)this.emit('notice',{text:'COMBO FINISHER',duration:.7});
 }
 step(dt,input={}){
  dt=clamp(dt,0,.05);
  if(this.state==='dying'){this.deathTimer-=dt;if(this.deathTimer<=0){this.state='dead';this.emit('defeat');}return;}
  if(this.state!=='play')return;
  this.time+=dt;const p=this.player;
  this.inputX=clamp(input.x||0,-1,1);this.inputY=clamp(input.y||0,-1,1);
  if(this.inputX)p.face=this.inputX>0?1:-1;
  ['invuln','dodgeCD','fireCD','sawCD','chainWindow'].forEach(k=>p[k]=Math.max(0,p[k]-dt));
  this.comboTimer-=dt;if(this.comboTimer<=0)this.combo=0;
  if(input.actions)for(const a of input.actions)this.action(a);
  const oldX=p.x,oldY=p.y;p.moving=false;
  if(p.timer>0){p.timer-=dt;const elapsed=p.duration-p.timer;
   if((p.action==='melee'||p.action==='saw')&&!p.hitDone&&elapsed>(p.action==='saw'?.23:.095)){p.hitDone=true;this.resolvePlayerHit();}
   if(p.action==='roll'){p.x+=p.rollDX*565*dt;p.y+=p.rollDY*255*dt;}
   if(p.action==='saw'&&elapsed<.3)p.x+=p.face*75*dt;
   if(p.timer<=0){if(p.action==='reload')this.finishReload();else p.action='idle';}
  }
  if(['idle','walk','fire'].includes(p.action)){
   const len=Math.max(1,Math.hypot(this.inputX,this.inputY));p.x+=this.inputX/len*219*dt*(p.action==='fire'?.48:1);p.y+=this.inputY/len*140*dt;
  }
  p.y=clamp(p.y,LANES.min,LANES.max);p.x=clamp(p.x,Math.max(28,this.area*AREA-180),(this.area+1)*AREA-(this.clear?20:105));
  const distance=Math.hypot(p.x-oldX,p.y-oldY);if(distance>.01){p.walk+=distance;p.moving=true;if(p.action==='idle')p.action='walk';}else if(p.action==='walk')p.action='idle';
  for(const e of this.enemies)this.updateEnemy(e,dt);
  for(const prop of this.props)prop.flash=Math.max(0,prop.flash-dt);
  for(const b of this.projectiles){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(Math.abs(b.x-p.x)<28&&Math.abs(b.y-p.y)<26&&b.life>0){this.hurtPlayer(b.damage,b);b.life=0;}}
  this.projectiles=this.projectiles.filter(b=>b.life>0);
  for(const item of this.pickups){item.life-=dt;if(Math.abs(p.x-item.x)<53&&Math.abs(p.y-item.y)<42){if(item.type==='health'){p.hp=Math.min(100,p.hp+22);this.emit('float',{x:item.x,y:item.y,text:'+22 HEALTH',color:'#9ad5b1'});}else{p.reserve=Math.min(192,p.reserve+24);this.emit('float',{x:item.x,y:item.y,text:'+24 AMMO',color:'#7ed0e8'});}item.life=0;this.emit('sound',{sound:'pickup'});}}
  this.pickups=this.pickups.filter(i=>i.life>0);
  if(!this.clear&&this.enemies.every(e=>e.hp<=0)){this.clear=true;this.projectiles=[];this.score+=400;this.emit('notice',{text:'AREA SECURED · MOVE RIGHT',duration:2.5});this.emit('sound',{sound:'clear'});}
  if(this.clear&&p.x>(this.area+1)*AREA-65){
   if(this.area<2){this.area++;this.enemies=this.enemies.filter(e=>e.hp>0);this.props=this.props.filter(prop=>prop.x>=this.area*AREA-170);this.pickups=this.pickups.filter(item=>item.x>=this.area*AREA-170);this.spawnArea();this.emit('notice',{text:THEMES[this.chapter].areas[this.area],duration:2});}
   else{this.state=this.chapter===4?'win':'chapter';this.score+=1500;this.emit(this.state==='win'?'victory':'chapterComplete');}
  }
 }
 updateEnemy(e,dt){
  if(e.hp<=0){e.timer=Math.max(0,e.timer-dt);return;}
  const p=this.player,stats=ENEMIES[e.type];e.flash=Math.max(0,e.flash-dt);e.cd=Math.max(0,e.cd-dt);e.moving=false;
  const dx=p.x-e.x,dy=p.y-e.y;if(e.action!=='windup'&&e.action!=='attack')e.face=dx>=0?1:-1;
  if(e.action==='hurt'){e.timer-=dt;if(e.timer<=0)e.action='idle';return;}
  if(e.action==='windup'){
   e.timer-=dt;if(e.timer<=0){e.action='attack';e.timer=e.type==='wretch'?.36:.27;e.hitDone=false;this.emit('sound',{sound:e.type==='grenadier'?'enemyShot':'enemySwing'});}return;
  }
  if(e.action==='attack'){
   e.timer-=dt;
   if(e.type==='wretch')e.x+=e.face*285*dt;
   if(!e.hitDone){e.hitDone=true;
    if(e.type==='grenadier'&&e.attackTarget){
     const d=e.attackTarget.x-e.x,sy=e.attackTarget.y-e.y,len=Math.hypot(d,sy)||1;
     const spreads=e.boss?[-.10,0,.10]:[0];for(const s of spreads)this.projectiles.push({x:e.x+e.face*45,y:e.y,vx:d/len*420,vy:sy/len*420+s*180,life:2.1,damage:stats.damage+(e.boss?3:0)});
    }else if(Math.abs(dx)<(e.boss?stats.reach*1.12:stats.reach)+25&&Math.abs(dy)<(e.boss?62:45))this.hurtPlayer(stats.damage+(e.boss?4:0),e);
   }
   if(e.type==='wretch'&&Math.abs(p.x-e.x)<63&&Math.abs(p.y-e.y)<43)this.hurtPlayer(stats.damage,e);
   if(e.timer<=0){e.action='idle';e.cd=stats.recovery+(e.boss?.15:this.rand()*.6);}return;
  }
  if(p.hp<=0)return;
  const reach=e.boss?stats.reach*1.08:stats.reach;
  if(e.cd<=0&&Math.abs(dx)<reach&&Math.abs(dy)<(e.type==='grenadier'?48:38)){
   const threats=this.enemies.filter(other=>other.hp>0&&(other.action==='windup'||other.action==='attack')).length;
   if(threats<2||e.boss){e.action='windup';e.duration=stats.wind*(e.boss?1.06:1);e.timer=e.duration;e.attackTarget={x:p.x,y:p.y};e.attackCount++;return;}
  }
  let vx=0,vy=0;const speed=stats.speed*(e.boss?.92:1);
  if(Math.abs(dy)>14)vy=Math.sign(dy)*speed*.58;
  const preferred=e.type==='grenadier'?270:e.type==='raam'?113:70;
  if(Math.abs(dx)>preferred)vx=Math.sign(dx)*speed;else if(e.type==='grenadier'&&Math.abs(dx)<150)vx=-Math.sign(dx)*speed*.7;
  if(e.cd>.2&&Math.abs(dx)<preferred+12)vx=0;
  for(const other of this.enemies){if(other===e||other.hp<=0)continue;const ex=e.x-other.x,ey=e.y-other.y;if(Math.abs(ex)<50&&Math.abs(ey)<32){vx+=Math.sign(ex||e.id-other.id)*28;vy+=Math.sign(ey||e.id-other.id)*29;}}
  const oldX=e.x,oldY=e.y;e.x=clamp(e.x+vx*dt,this.area*AREA+45,(this.area+1)*AREA-66);e.y=clamp(e.y+vy*dt,LANES.min,LANES.max);
  const moved=Math.hypot(e.x-oldX,e.y-oldY);if(moved>.1){e.walk+=moved;e.moving=true;e.action='walk';}else e.action='idle';
 }
 get remaining(){return this.enemies.filter(e=>e.hp>0).length;}
 get boss(){return this.enemies.find(e=>e.boss&&e.hp>0);}
}
const api={Engine,THEMES,ENEMIES,AREA,LANES,clamp};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GearsCore=api;
})(typeof window!=='undefined'?window:this);
