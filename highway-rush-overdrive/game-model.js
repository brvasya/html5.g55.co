import {createChallenge,getCar} from './game-progress.js';
export const LANES = [-5.25,-1.75,1.75,5.25];
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const mix=(a,b,t)=>a+(b-a)*t;
export const LEVEL_DISTANCE=600;
export const MAX_LEVEL=10;
export function levelForDistance(distance){return clamp(Math.floor(Math.max(0,distance)/LEVEL_DISTANCE)+1,1,MAX_LEVEL);}
export function levelSettings(level){
 const step=clamp(level,1,MAX_LEVEL)-1;
 return {speed:Math.min(280,120+step*18),waveInterval:2.35-step*.15,pairedChance:.20+step*.07,tripleChance:step<3?0:.10+(step-3)*.04,heavyChance:.10+step*.035,maxPack:step<3?2:3,laneChangeInterval:step===0?Infinity:Math.max(.8,8-(step-1)*.9),laneChangeLimit:step===0?0:step<4?1:step<7?2:3,signalTime:Math.max(1.8,2.35-step*.065),spawnDistance:235+step*9};
}
export function randomSource(seed=Date.now()) {let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
export function roadCenter(d){return Math.sin(d*.0019)*30+Math.sin(d*.0048+1.2)*8;}
export function roadOffset(distance,s){return roadCenter(distance+s)-roadCenter(distance);}
export function sweptHit(x0,z0,x1,z1,halfX,halfZ){
 let lo=0,hi=1;
 for(const [a,b,h] of [[x0,x1,halfX],[z0,z1,halfZ]]){const v=b-a;if(Math.abs(v)<1e-8){if(Math.abs(a)>h)return false;continue;}let t1=(-h-a)/v,t2=(h-a)/v;if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);if(lo>hi)return false;}
 return hi>=0&&lo<=1;
}
export class HighwayGame {
 constructor(seed){this.rng=randomSource(seed);this.nextId=1;this.reset();}
 reset(carId=this.car?.id){
  this.car=getCar(carId);
  this.mode='menu';this.elapsed=0;this.distance=0;this.level=1;this.difficulty=levelSettings(1);this.speed=100;this.score=0;this.playerX=LANES[1];this.playerV=0;this.charge=35;this.boost=0;this.focus=0;this.surge=0;this.shield=0;this.invincible=0;this.combo=1;this.comboTimer=0;this.maxCombo=1;this.nearMisses=0;this.boostedPasses=0;this.needlePasses=0;this.challenge=createChallenge();this.traffic=[];this.pickups=[];this.events=[];this.trafficTimer=1.9;this.pickupTimer=4;this.lastPass=null;this.safeLane=1;this.lastSafeLane=1;this.lastCrash=null;this.brake=0;this.waveAnchor=null;this.pendingWave=null;this.pattern=null;this.patternIndex=0;this.restWaves=2;
  this.speed+=this.car.speedBonus;
  this.laneChangeTimer=2.3;
 }
 get baseSpeed(){return this.difficulty.speed+this.car.speedBonus;}
 get maxBoostSpeed(){return levelSettings(MAX_LEVEL).speed+this.car.speedBonus+70;}
 get levelProgress(){return this.level===MAX_LEVEL?1:clamp((this.distance-(this.level-1)*LEVEL_DISTANCE)/LEVEL_DISTANCE,0,1);}
 get distanceToNextLevel(){return this.level===MAX_LEVEL?null:Math.max(0,this.level*LEVEL_DISTANCE-this.distance);}
 advanceLevel(){
  const next=levelForDistance(this.distance);if(next<=this.level)return;
  this.level=next;this.difficulty=levelSettings(next);this.trafficTimer=Math.min(this.trafficTimer,this.difficulty.waveInterval);
  this.laneChangeTimer=Math.min(this.laneChangeTimer,this.difficulty.laneChangeInterval*.5);
  this.events.push({type:'level-up',level:next,speed:this.baseSpeed,final:next===MAX_LEVEL});
 }
 start(challengeSequence=0,carId=this.car.id){this.reset(carId);this.challenge=createChallenge(challengeSequence);this.mode='playing';this.seedTraffic();this.events.push({type:'start'});}
 seedTraffic(){
  for(const [s,lanes,gap] of [[95,[1,3],2],[165,[0,2],1],[230,[1,3],2]])for(const lane of lanes){const car=this.spawnCar(lane,s,76,lane%4);car.escapeLane=gap;car.pattern='intro';}
  this.safeLane=2;this.waveAnchor={s:230,lane:2};
  this.pickups.push({id:this.nextId++,s:90,x:LANES[2],type:0,phase:this.rng()*6});
 }
 demo(dt){this.distance+=dt*18;this.elapsed+=dt;this.speed=100+this.car.speedBonus;for(const car of this.traffic){car.s-=dt*10;if(car.s< -25)car.s=270;}}
 spawnCar(lane,s,speed,type){
  const t=type??Math.floor(this.rng()*6);const width=t>=4?2.35:(t===2?2.08:1.92);
  const car={id:this.nextId++,lane,x:LANES[lane],s,speed,type:t,width,length:t>=4?7:4.2,phase:this.rng()*6,passed:false,closest:100,signal:0,change:0,targetLane:lane,laneChanged:false,braking:0,collided:false,pattern:'flow'};this.traffic.push(car);return car;
 }
 activateBoost(){if(this.mode!=='playing'||this.charge<30||this.boost>0)return false;this.boost=5;this.events.push({type:'boost'});return true;}
 pause(){if(this.mode!=='playing')return false;this.mode='paused';return true;}
 resume(){if(this.mode!=='paused')return false;this.mode='playing';return true;}
 spawnWave(){
  const settings=this.difficulty;
  if(!this.pendingWave){
   if(!this.pattern&&this.level>=2&&this.restWaves===0){const kind=['weave','convoy','rush'][this.patternIndex++%3];const total=kind==='convoy'?2:3;this.pattern={kind,left:total,total,direction:this.safeLane<2?1:-1};}
   const pattern=this.pattern,kind=pattern?.kind||'flow';let gap=this.safeLane;
   if(kind==='weave'){if(gap+pattern.direction<0||gap+pattern.direction>3)pattern.direction*=-1;gap+=pattern.direction;}
   else if(kind==='flow')gap=clamp(gap+(this.rng()<.4?0:(this.rng()<.5?-1:1)),0,3);
   const roll=this.rng();let count=roll<settings.tripleChance?3:roll<settings.tripleChance+(1-settings.tripleChance)*settings.pairedChance?2:1;
   if(kind==='weave'||kind==='rush')count=settings.maxPack;
   if(kind==='convoy')count=2;
   if(kind==='flow'&&this.restWaves>0)count=1;
   this.pendingWave={gap,count,kind,first:!!pattern&&pattern.left===pattern.total};
  }
  const plan=this.pendingWave,s=settings.spawnDistance+12;
  // Leave time to react and move one lane, including a boost and the next two speed steps.
  const closingSpeed=(Math.min(this.maxBoostSpeed,this.baseSpeed+106)-76)/3.6;
  const gapDistance=this.waveAnchor&&plan.gap!==this.waveAnchor.lane?closingSpeed*.95+10:32;
  if(this.waveAnchor&&s-this.waveAnchor.s<gapDistance)return false;
  const free=[0,1,2,3].filter(i=>i!==plan.gap);
  for(let i=0;i<plan.count;i++){
   const lane=free.splice(Math.floor(this.rng()*free.length),1)[0];
   const heavy=plan.kind==='convoy'||this.rng()<settings.heavyChance;
   const car=this.spawnCar(lane,s,76,heavy?4+Math.floor(this.rng()*2):Math.floor(this.rng()*4));
   car.escapeLane=plan.gap;car.pattern=plan.kind;
   if(i===0&&plan.first)car.announcement=plan.kind;
  }
  this.lastSafeLane=this.safeLane;this.safeLane=plan.gap;this.waveAnchor={s,lane:plan.gap};
  this.nextWaveInterval=settings.waveInterval*(plan.kind==='rush'?.62:plan.kind==='convoy'?.85:plan.kind==='flow'&&this.restWaves>0?1.3:1);
  if(this.pattern){if(--this.pattern.left===0){this.pattern=null;this.restWaves=2;}}else this.restWaves=Math.max(0,this.restWaves-1);
  this.pendingWave=null;return true;
 }
 tryLaneChange(){
  if(this.level<2||this.traffic.filter(t=>t.signal>0||t.change).length>=this.difficulty.laneChangeLimit)return false;
  // Begin signals far enough ahead for the player to accelerate into a boost.
  const approachSpeed=Math.max(0,Math.max(this.speed,this.baseSpeed+70)-76)/3.6;
  const minDistance=Math.max(75,approachSpeed*(this.difficulty.signalTime+1.25)+28);
  const options=this.traffic.filter(t=>t.s>minDistance&&t.s<this.difficulty.spawnDistance+20&&(t.type<4||this.level>=4)&&t.pattern!=='intro'&&!t.signal&&!t.change&&!t.laneChanged&&!t.passed&&!t.removed);
  // Search both adjacent lanes so an invalid random choice does not waste a move.
  const moves=[];
  for(const car of options){
   const close=this.traffic.filter(t=>t!==car&&!t.removed&&Math.abs(t.s-car.s)<40);
   for(const target of [car.lane-1,car.lane+1]){
    if(target<0||target>3||target===car.escapeLane)continue;
    if(close.some(t=>t.lane===target||t.targetLane===target||t.escapeLane===target)||new Set([...close.flatMap(t=>[t.lane,t.targetLane]),car.lane,target]).size>3)continue;
    moves.push({car,target});
   }
  }
  if(!moves.length)return false;
  const {car,target}=moves[Math.floor(this.rng()*moves.length)];car.targetLane=target;car.signal=this.difficulty.signalTime;car.change=0;car.laneChanged=true;return true;
 }
 spawnPickup(){
  const s=185;const lanes=[0,1,2,3].filter(l=>!this.traffic.some(t=>Math.abs(t.s-s)<24&&t.lane===l));
  if(!lanes.length)return;
  const lane=lanes[Math.floor(this.rng()*lanes.length)];
  this.pickups.push({id:this.nextId++,s,x:LANES[lane],type:Math.floor(this.rng()*4),phase:this.rng()*6});
 }
 collect(p){
  if(p.type===0)this.shield=1;if(p.type===1)this.focus=3;if(p.type===2)this.charge=Math.min(100,this.charge+45);if(p.type===3)this.surge=8;
  this.score+=25*this.combo;this.events.push({type:'pickup',pickup:p.type,x:p.x});
 }
 crash(car){
  if(this.invincible>0)return;
  if(this.shield){this.shield=0;this.invincible=1.6;this.combo=1;this.comboTimer=0;this.lastPass=null;this.boost=0;this.speed=Math.max(75,this.speed-45);car.removed=true;this.events.push({type:'shield-hit',x:car.x});return;}
  this.mode='crashed';this.boost=0;this.lastCrash={x:car.x,type:car.type};this.events.push({type:'crash',x:car.x});
 }
 nearPass(car){
  if(car.collided||car.closest<1.72||car.closest>2.8||this.mode!=='playing')return false;
  this.nearMisses++;this.combo=Math.min(5,this.combo+1);this.maxCombo=Math.max(this.maxCombo,this.combo);this.comboTimer=5.5;this.charge=Math.min(100,this.charge+17);const side=Math.sign(car.x-this.playerX);
  const needle=this.lastPass&&this.elapsed-this.lastPass.time<.55&&side!==this.lastPass.side;
  if(needle)this.needlePasses++;
  const points=Math.round((needle?300:140)*this.combo*(this.surge>0?2:1)*(this.boost>0?2:1)*(1+this.car.passBonus));this.score+=points;
  this.events.push({type:needle?'needle':'near-miss',points,x:car.x});this.lastPass={time:this.elapsed,side};return true;
 }
 passCar(car){
  if(car.collided||car.removed||this.mode!=='playing')return;
  const near=this.nearPass(car);
  if(this.boost>0){this.boostedPasses++;if(!near){const points=Math.round(60*this.combo*(this.surge>0?2:1)*(1+this.car.passBonus));this.score+=points;this.events.push({type:'boost-pass',points,x:car.x});}}
  this.updateChallenge();
 }
 updateChallenge(){
  const challenge=this.challenge;if(challenge.complete)return;
  challenge.progress=Math.min(challenge.target,this[challenge.stat]);
  if(challenge.progress>=challenge.target){challenge.complete=true;this.score+=challenge.reward;this.events.push({type:'challenge-complete',points:challenge.reward});}
 }
 update(dt,input={}){
  if(this.mode!=='playing')return;
  dt=clamp(dt,0,.05);this.events=[];this.elapsed+=dt;
  const worldDt=dt*(this.focus>0?.42:1),oldX=this.playerX;
  this.focus=Math.max(0,this.focus-dt);this.surge=Math.max(0,this.surge-dt);this.invincible=Math.max(0,this.invincible-dt);this.comboTimer=Math.max(0,this.comboTimer-dt);
  if(this.comboTimer===0)this.combo=1;
  if(this.boost>0){this.boost=Math.max(0,this.boost-dt);this.charge=Math.max(0,this.charge-dt*20);if(this.charge===0)this.boost=0;}
  const want=input.targetX!=null?clamp((input.targetX-this.playerX)*9,-10,10):clamp(input.steer||0,-1,1)*8.6;
  this.playerV=mix(this.playerV,want,1-Math.exp(-12*dt));this.playerX=clamp(this.playerX+this.playerV*dt,-6.45,6.45);
  if((this.playerX<=-6.45&&this.playerV<0)||(this.playerX>=6.45&&this.playerV>0))this.playerV=0;
  this.brake=input.brake?1:0;
  const targetSpeed=Math.max(95,this.baseSpeed+(this.boost>0?70:0)-(input.brake?25:0)-(Math.abs(this.playerX)>6.0?24:0));
  this.speed=mix(this.speed,targetSpeed,1-Math.exp(-dt*(this.boost>0?2.7:1.1)));
  const travel=this.speed/3.6*worldDt;this.distance+=travel;this.advanceLevel();this.score+=travel*.25*this.combo*(this.surge>0?2:1)*(this.boost>0?2:1);
  if(this.waveAnchor)this.waveAnchor.s-=(this.speed-76)/3.6*worldDt;
  this.trafficTimer-=worldDt;this.pickupTimer-=worldDt;
  if(this.trafficTimer<=0){const spawned=this.spawnWave();this.trafficTimer=spawned?this.nextWaveInterval:.25;}
  if(this.level>=2){this.laneChangeTimer-=worldDt;if(this.laneChangeTimer<=0)this.laneChangeTimer=this.tryLaneChange()?this.difficulty.laneChangeInterval*(.85+this.rng()*.3):.2;}
  if(this.pickupTimer<=0){this.spawnPickup();this.pickupTimer=5.7+this.rng()*2;}
  for(const car of this.traffic){
   const oldS=car.s,oldCarX=car.x;
   if(car.signal>0){car.signal=Math.max(0,car.signal-worldDt);if(car.signal===0)car.change=1;}
   if(car.change){
    // Abort a signalled move if a vehicle has entered its destination gap.
    if(this.traffic.some(t=>t!==car&&Math.abs(t.s-car.s)<15&&Math.abs(t.x-LANES[car.targetLane])<2.6)){car.targetLane=car.lane;}
    car.x=mix(car.x,LANES[car.targetLane],Math.min(1,worldDt*1.9));
    if(Math.abs(car.x-LANES[car.targetLane])<.04){car.x=LANES[car.targetLane];car.lane=car.targetLane;car.change=0;}
   }
   car.s-=(this.speed-car.speed)/3.6*worldDt;
   car.braking=car.type===2&&Math.sin(this.elapsed*.7+car.phase)>.93?1:0;
   const halfX=(1.70+car.width)*.5-.10,halfZ=(4+car.length)*.5-.7;
   if(car.announcement&&car.s>0&&car.s/Math.max(1,(this.speed-car.speed)/3.6)<5){this.events.push({type:'traffic-pattern',pattern:car.announcement});car.announcement=null;}
   if(sweptHit(oldCarX-oldX,oldS,car.x-this.playerX,car.s,halfX,halfZ)){car.collided=true;this.crash(car);if(this.mode==='crashed')break;}
   if(car.s<5&&car.s> -8)car.closest=Math.min(car.closest,Math.abs(car.x-this.playerX));
   if(!car.passed&&car.s< -5){car.passed=true;this.passCar(car);}
  }
  if(this.mode==='playing')for(const p of this.pickups){const oldS=p.s;p.s-=travel;if(sweptHit(p.x-oldX,oldS,p.x-this.playerX,p.s,1.4,2.7)){this.collect(p);p.removed=true;}}
  this.traffic=this.traffic.filter(t=>t.s> -30&&!t.removed);this.pickups=this.pickups.filter(p=>p.s> -15&&!p.removed);
 }
 snapshot(){return{state:this.mode,car:{id:this.car.id,name:this.car.name,speedBonusKmh:this.car.speedBonus,passBonusPercent:Math.round(this.car.passBonus*100)},level:this.level,maxLevel:MAX_LEVEL,levelProgress:Math.round(this.levelProgress*100),metersToNextLevel:this.distanceToNextLevel===null?null:Math.ceil(this.distanceToNextLevel),baseSpeedKmh:this.baseSpeed,score:Math.floor(this.score),distanceMeters:Math.floor(this.distance),speedKmh:Math.round(this.speed),nearMisses:this.nearMisses,boostedPasses:this.boostedPasses,challenge:{label:this.challenge.label,progress:this.challenge.progress,target:this.challenge.target,complete:this.challenge.complete},multiplier:this.combo,overdriveCharge:Math.round(this.charge),shield:!!this.shield,focusSeconds:Math.ceil(this.focus),doubleScoreSeconds:Math.ceil(this.surge)};}
}
