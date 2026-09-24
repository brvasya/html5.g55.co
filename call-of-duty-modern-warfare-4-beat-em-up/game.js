(()=>{
'use strict';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false}),images={},keys=new Set(),held=new Set();
const WORLD=2700,ZONE=900,MAXHP=100,CLIP=12,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const chapters=[
 {id:'dock',name:'BLACKWATER DOCKS',brief:'Cut through the dock patrol and secure the shipping manifest.',areas:['PIER APPROACH','CONTAINER LINE','CARGO CHECKPOINT'],boss:'DOCK ENFORCER',accent:'#92bcb9'},
 {id:'city',name:'URBAN SIEGE',brief:'Follow the convoy route. Break the occupation of the old quarter.',areas:['OLD QUARTER','MARKET CROSSING','CONVOY ROUTE'],boss:'STREET COMMANDER',accent:'#d6b978'},
 {id:'desert',name:'DUST & THUNDER',brief:'Breach the outpost and recover the command coordinates.',areas:['OUTER WALL','SUPPLY COMPOUND','FORTIFIED GATE'],boss:'OUTPOST WARDEN',accent:'#d9ad69'},
 {id:'snow',name:'COLD SIGNAL',brief:'Reach the mountain relay and cut the enemy communications.',areas:['FROZEN ROAD','RELAY STATION','ANTENNA RIDGE'],boss:'RELAY GUARDIAN',accent:'#bed8e5'},
 {id:'bunker',name:'FINAL TRANSMISSION',brief:'Enter the command bunker. Bring down the last line of defense.',areas:['BLAST ENTRANCE','POWER SECTOR','COMMAND CORE'],boss:'THE COMMANDANT',accent:'#bed08b'}
];
const S={mode:'main',chapter:0,unlocked:0,cleared:[false,false,false],score:0,kills:0,totalKills:0,combo:0,comboTime:0,run:false,time:0,camera:0,enemies:[],props:[],effects:[],bullets:[],notices:[],shake:0,transition:false,checkpoint:null,toastTime:0,muted:false,loaded:false,failed:false,best:0};
let W=1280,H=720,scale=1,dpr=1,last=0,ground=420,joy={x:0,y:0,id:null},touchMode=matchMedia('(pointer:coarse)').matches,menuOrigin='main',fireQueue=null,frameHandle=0;
let p;
try{S.muted=localStorage.getItem('mw4-muted')==='1';S.best=Number(localStorage.getItem('mw4-best')||0)}catch{}
document.querySelectorAll('.more').forEach(a=>a.href='https://g55.co/?utm_source=moreGamesButton&utm_medium='+encodeURIComponent(document.title));
function resize(){
 const w=innerWidth,h=innerHeight;touchMode=matchMedia('(pointer:coarse)').matches||w<900;document.body.classList.toggle('touch-mode',touchMode);$('touch').hidden=!(S.mode==='play'&&touchMode);scale=Math.max(w/1440,Math.min(w/540,h/720));W=w/scale;H=h/scale;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ground=H*(H>W?.59:.57);if(p)S.camera=clamp(S.camera,0,Math.max(0,WORLD-W));
}
addEventListener('resize',resize);resize();
function sound(type){if(!S.muted)GameAudio.play(type)}
function activateAudio(){if(!S.muted)GameAudio.unlock()}
function syncSoundButton(){$('sound').textContent=S.muted?'SOUND OFF':'SOUND ON';$('sound').setAttribute('aria-label',S.muted?'Enable sound':'Mute sound')}
function toggleSound(){S.muted=!S.muted;GameAudio.setMuted(S.muted);syncSoundButton();if(!S.muted){GameAudio.unlock().then(ready=>{if(ready)sound('click');else toast('TAP SOUND TO ENABLE AUDIO',2)})}try{localStorage.setItem('mw4-muted',S.muted?'1':'0')}catch{}}
GameAudio.setMuted(S.muted);syncSoundButton();$('sound').onclick=toggleSound;
for(const event of ['pointerdown','touchend','keydown','click'])addEventListener(event,activateAudio,{capture:true,passive:true});
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{toast('FULLSCREEN UNAVAILABLE',2)}};
function toast(text,duration=2){$('toast').textContent=text;$('toast').classList.add('visible');S.toastTime=duration}
function resetInput(){keys.clear();held.clear();joy.x=joy.y=0;joy.id=null;$('stick-knob').style.transform='';fireQueue=null}
function ui(){
 document.body.dataset.screen=S.mode;const play=S.mode==='play';document.body.classList.toggle('playing',play);document.body.classList.toggle('touch-mode',touchMode);$('hud').hidden=!play;$('touch').hidden=!(play&&touchMode);$('brand').hidden=play;$('main-panel').hidden=S.mode!=='main';$('modal-panel').hidden=S.mode==='main';$('continue').hidden=!S.run||!p||p.hp<=0;$('boss-hud').hidden=!play;
 if(!play){$('toast').classList.remove('visible');resetInput();GameAudio.stop()}updateHUD();
}
function main(){clearTemporary();S.mode='main';menuOrigin='main';S.transition=false;$('fade').classList.remove('active');ui()}
function modal(mode,kicker,title,copy,primary,fn,secondary='MAIN MENU',secondaryFn=main){
 clearTemporary();S.mode=mode;$('modal-kicker').textContent=kicker;$('modal-title').textContent=title;$('modal-copy').innerHTML=copy;$('modal-primary').textContent=primary;$('modal-primary').onclick=()=>{sound('click');fn()};$('modal-secondary').textContent=secondary;$('modal-secondary').onclick=secondaryFn;ui();
}
function help(origin='main'){
 menuOrigin=origin;modal('help','FIELD MANUAL','CLOSE QUARTERS',`<div class="controls-grid"><div><b>WASD / ↑↓</b>Move</div><div><b>J</b>Strike / combo</div><div><b>K</b>Heavy kick</div><div><b>L</b>Rifle fire</div><div><b>SPACE</b>Dodge</div><div><b>R</b>Reload</div><div><b>E</b>Overdrive</div><div><b>ESC</b>Pause</div></div><p>Chain 3 strikes for a finisher. Dodge amber attacks. Break supplies for health and ammo. Charge Overdrive with hits.<br>Touch: left stick and action buttons.</p>`,origin==='main'?'BACK TO MENU':'RESUME',()=>origin==='main'?main():resume(),origin==='main'?'START GAME':'MAIN MENU',()=>origin==='main'?newRun():main());
}
function pause(){if(S.mode!=='play'||S.transition)return;if(p.hp<=0){outcome(false);return;}modal('pause','OPERATION ON HOLD','PAUSED',`<p>${chapters[S.chapter].name}<br>Your current position and supplies are preserved.</p>`,'RESUME',resume,'HOW TO PLAY',()=>help('pause'));const b=document.createElement('button');b.textContent='MAIN MENU';b.onclick=main;$('modal-secondary').parentNode.appendChild(b);b.className='temporary-menu';}
function clearTemporary(){document.querySelectorAll('.temporary-menu').forEach(e=>e.remove())}
function resume(){clearTemporary();if(!S.run||p.hp<=0)return;if(S.pendingChapter){outcome(true);return;}S.mode='play';menuOrigin='play';resetInput();ui()}
$('help').onclick=()=>help('main');$('pause').onclick=pause;$('continue').onclick=resume;
function makePlayer(carry){return {x:150,y:88,hp:carry?.hp??100,ammo:carry?.ammo??CLIP,reserve:carry?.reserve??60,rage:carry?.rage??0,face:1,walk:0,moving:false,action:'idle',t:0,duration:0,hit:false,inv:0,dodgeCD:0,kickCD:0,comboStep:0,lastPunch:-10,flash:0,dx:0,dy:0}}
function newRun(){if(!S.loaded){toast('ASSETS ARE STILL LOADING');return}activateAudio();GameAudio.stop();clearTemporary();S.score=0;S.kills=0;S.totalKills=0;S.combo=0;S.run=true;S.checkpoint=null;loadChapter(0);S.mode='play';ui();toast('CHAPTER 01 — BLACKWATER DOCKS',2.8);sound('clear')}
function loadChapter(n,restore=false){
 const carry=n>0&&p?{hp:Math.min(100,p.hp+40),ammo:CLIP,reserve:Math.min(120,p.reserve+36),rage:p.rage}:undefined;
 if(restore){S.score=S.checkpoint.score;S.totalKills=S.checkpoint.totalKills;p=makePlayer(S.checkpoint.player)}else{p=makePlayer(carry);S.checkpoint={score:S.score,totalKills:S.totalKills,player:{hp:p.hp,ammo:p.ammo,reserve:p.reserve,rage:p.rage}}}
 S.pendingChapter=false;S.chapter=n;S.kills=0;S.unlocked=0;S.cleared=[false,false,false];S.camera=0;S.time=0;S.effects=[];S.notices=[];S.bullets=[];S.enemies=[];S.props=[];S.combo=0;S.comboTime=0;S.shake=0;
 for(let zone=0;zone<3;zone++){
  const count=zone===0?3:zone===1?4:3;
  for(let k=0;k<count;k++){
   const type=(k+zone+n)%3===1?'rifleman':'raider';const hp=(type==='rifleman'?66:78)+n*8;
   S.enemies.push({id:S.enemies.length,type,zone,x:zone*ZONE+470+(k%3)*125,y:35+(k*53+zone*23)%128,face:-1,hp,maxHp:hp,walk:0,moving:false,state:'idle',t:0,cooldown:.9+k*.4,flash:0,hit:false,deadTime:0,phase:0});
  }
  for(let k=0;k<2;k++)S.props.push({id:S.props.length,zone,x:zone*ZONE+310+k*450,y:k?140:40,hp:60,broken:false,frame:0});
 }
 const hp=280+n*55;S.enemies.push({id:99,type:'juggernaut',boss:true,zone:2,x:2480,y:82,face:-1,hp,maxHp:hp,walk:0,moving:false,state:'idle',t:0,cooldown:1.5,flash:0,hit:false,deadTime:0,phase:0});
 resetInput();updateHUD();
}
async function nextChapter(){
 if(S.transition)return;S.transition=true;resetInput();$('fade').classList.add('active');await new Promise(r=>setTimeout(r,430));loadChapter(S.chapter+1);S.mode='play';ui();$('fade').classList.remove('active');await new Promise(r=>setTimeout(r,400));S.transition=false;toast('RESUPPLIED — '+chapters[S.chapter].name,2.8);
}
function retry(){clearTemporary();loadChapter(S.chapter,true);S.mode='play';S.transition=false;ui();toast('CHECKPOINT RESTORED',2)}
function record(){if(S.score>S.best){S.best=S.score;try{localStorage.setItem('mw4-best',String(S.best))}catch{}}}
function outcome(win){
 record();clearTemporary();if(!win){modal('defeat','SIGNAL LOST','OPERATOR DOWN',`<p>Regroup at the chapter checkpoint.<br>Watch the amber wind-up and dodge before impact.</p><div class="result-stats"><span>SCORE<strong>${String(S.score).padStart(6,'0')}</strong></span><span>CHAPTER<strong>${S.chapter+1} / 5</strong></span></div>`,'RETRY CHAPTER',retry);return}
 if(S.chapter===4){S.run=false;modal('victory','ALL OBJECTIVES SECURED','MISSION COMPLETE',`<p>Five hostile territories cleared.<br>The command network is down. Extraction confirmed.</p><div class="result-stats"><span>FINAL SCORE<strong>${String(S.score).padStart(6,'0')}</strong></span><span>HOSTILES DOWN<strong>${S.totalKills}</strong></span><span>BEST<strong>${String(S.best).padStart(6,'0')}</strong></span></div>`,'PLAY AGAIN',newRun)}
 else {S.pendingChapter=true;modal('chapter','SECTOR SECURED','CHAPTER COMPLETE',`<p>${chapters[S.chapter+1].brief}<br><br>Next deployment restores 40 health, loads your rifle, and adds 36 reserve rounds.</p><div class="result-stats"><span>SCORE<strong>${String(S.score).padStart(6,'0')}</strong></span><span>NEXT CHAPTER<strong>0${S.chapter+2} / 05</strong></span></div>`,'NEXT CHAPTER',nextChapter);}
}
const binds={KeyJ:'punch',KeyK:'kick',KeyL:'shoot',Space:'dodge',KeyR:'reload',KeyE:'special'};
addEventListener('keydown',e=>{
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(e.code)&&e.code!=='Tab')e.preventDefault();if(e.repeat)return;
 if(e.code==='Escape'||e.code==='KeyP'){S.mode==='play'?pause():S.mode==='pause'?resume():null;return}if(e.code==='KeyM'){toggleSound();return}
 if(S.mode==='play'){keys.add(e.code);if(binds[e.code]){held.add(binds[e.code]);act(binds[e.code])}}
});
addEventListener('keyup',e=>{keys.delete(e.code);if(binds[e.code])held.delete(binds[e.code])});
addEventListener('blur',()=>{resetInput();if(S.mode==='play')pause()});document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInput();if(S.mode==='play')pause()}});
function setTouch(){touchMode=true;document.body.classList.add('touch-mode');if(S.mode==='play')$('touch').hidden=false}
const stick=$('stick');stick.addEventListener('pointerdown',e=>{if(S.mode!=='play')return;e.preventDefault();setTouch();joy.id=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e)});
function moveStick(e){if(joy.id!==e.pointerId)return;const r=stick.getBoundingClientRect(),limit=r.width*.33,x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,l=Math.hypot(x,y),f=l>limit?limit/l:1;joy.x=x*f/limit;joy.y=y*f/limit;$('stick-knob').style.transform=`translate(${x*f}px,${y*f}px)`}
stick.addEventListener('pointermove',moveStick);for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,e=>{if(e.pointerId===joy.id){joy={x:0,y:0,id:null};$('stick-knob').style.transform=''}});
document.querySelectorAll('[data-action]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();setTouch();b.setPointerCapture(e.pointerId);held.add(b.dataset.action);act(b.dataset.action)});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>held.delete(b.dataset.action))});
function movement(){let x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joy.x,y=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+joy.y;const n=Math.hypot(x,y);if(n>1){x/=n;y/=n}return{x,y}}
function act(a){
 if(S.mode!=='play'||S.transition||!p||p.hp<=0)return;
 if(a==='dodge'){
  if(p.dodgeCD>0||p.action==='dodge'||p.action==='special')return;const m=movement();p.dx=Math.abs(m.x)+Math.abs(m.y)>.1?m.x:p.face;p.dy=m.y;p.action='dodge';p.t=.38;p.duration=.38;p.inv=.46;p.dodgeCD=.84;p.hit=true;sound('dodge');return;
 }
 if(p.t>0)return;
 if(a==='kick'&&p.kickCD>0)return;
 if(a==='reload'){if(p.ammo===CLIP||p.reserve<=0)return;p.action='reload';p.t=1.05;p.duration=1.05;p.hit=false;sound('reload');return}
 if(a==='shoot'&&p.ammo<=0){if(p.reserve>0)act('reload');else if(!held.has('shoot'))toast('BREAK SUPPLIES FOR AMMO');return}
 if(a==='special'&&p.rage<100){toast('OVERDRIVE CHARGING — '+Math.floor(p.rage)+'%',.8);return}
 if(a==='punch'){p.comboStep=S.time-p.lastPunch<.85?(p.comboStep+1)%3:0;p.lastPunch=S.time;p.duration=.31}
 if(a==='kick'){p.duration=.54;p.kickCD=.7}
 if(a==='shoot'){p.duration=.28;p.ammo--}
 if(a==='special'){p.duration=.68;p.rage=0;p.inv=.85}
 p.action=a;p.t=p.duration;p.hit=false;
}
function notice(text,x,y,color='#d6e3b1'){S.notices.push({text,x,y,t:1,color})}
function particles(x,y,color,n=7){for(let i=0;i<n;i++)S.effects.push({kind:'spark',x,y,vx:(Math.random()-.5)*170,vy:-30-Math.random()*120,t:.25+Math.random()*.22,color})}
function damage(e,amount,knock=0){
 if(e.hp<=0)return;e.hp=Math.max(0,e.hp-amount);e.flash=.12;e.x=clamp(e.x+knock*(e.boss?.25:1),30,WORLD-55);if(!e.boss){e.state='hurt';e.t=.28}p.rage=clamp(p.rage+amount*.22,0,100);S.combo++;S.comboTime=2.5;S.score+=amount*2;particles(e.x,e.y-85,'#e7d6a2');notice(String(amount),e.x,e.y-150);
 if(e.hp===0){e.state='dead';e.deadTime=0;S.kills++;S.totalKills++;S.score+=e.boss?750:120;p.rage=clamp(p.rage+8,0,100);if(S.totalKills%3===0){p.reserve=Math.min(120,p.reserve+6);notice('+6 AMMO',e.x,e.y-185,'#c1d97b')}if(e.boss){S.shake=9;toast('COMMANDER NEUTRALIZED');sound('clear')}}
}
function hurt(amount,dir){
 if(p.inv>0||p.hp<=0)return;p.hp=Math.max(0,p.hp-amount);p.inv=.75;p.flash=.18;p.x=clamp(p.x+dir*26,35,maxX());p.action='hurt';p.t=.26;p.duration=.26;p.hit=true;S.shake=5;S.combo=0;particles(p.x,p.y-75,'#cc785b');sound('hurt');if(p.hp<=0){p.action='dead';p.t=0;setTimeout(()=>{if(p.hp<=0&&S.mode==='play')outcome(false)},500)}
}
function breakProp(o,amount){if(o.broken)return;o.hp=Math.max(0,o.hp-amount);o.frame=o.hp<=0?2:1;particles(o.x,o.y-35,'#c9b288',10);if(o.hp<=0){o.broken=true;const healed=Math.min(22,100-p.hp);p.hp+=healed;p.reserve=Math.min(120,p.reserve+12);S.score+=75;notice('+'+healed+' HP  +12 AMMO',o.x,o.y-105,'#c1d97b');sound('break')}}
function playerHit(){
 const a=p.action;p.hit=true;
 if(a==='reload'){const n=Math.min(CLIP-p.ammo,p.reserve);p.ammo+=n;p.reserve-=n;notice('RELOADED',p.x,p.y-160);sound('reload');return}
 if(a==='shoot'){
  sound('shoot');const targets=S.enemies.filter(e=>e.hp>0&&e.zone<=S.unlocked&&(e.x-p.x)*p.face>0&&(e.x-p.x)*p.face<650&&Math.abs(e.y-p.y)<29).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x));const hit=targets[0],end=hit?hit.x:p.x+p.face*650;S.effects.push({kind:'tracer',x:p.x+p.face*84,y:p.y-118,x2:end,t:.075,color:'#e6d29a'});if(hit)damage(hit,38,8*p.face);else {const o=S.props.find(o=>!o.broken&&(o.x-p.x)*p.face>0&&(o.x-p.x)*p.face<620&&Math.abs(o.y-p.y)<38);if(o)breakProp(o,30)}return;
 }
 const burst=a==='special',kick=a==='kick',finisher=a==='punch'&&p.comboStep===2,range=burst?235:kick?135:108,amount=burst?90:kick?32:finisher?38:23;
 sound(burst?'burst':kick?'kick':'punch');if(burst){S.shake=9;S.effects.push({kind:'ring',x:p.x,y:p.y,t:.45,max:.45,color:'#d1ed86'});toast('OVERDRIVE',.7)}
 let hits=0;for(const e of S.enemies){const dx=e.x-p.x;if(e.hp>0&&e.zone<=S.unlocked&&Math.abs(dx)<range&&Math.abs(e.y-p.y)<(burst?100:kick?38:30)&&(burst||dx*p.face>-24)){damage(e,amount,(burst?Math.sign(dx):p.face)*(kick||finisher||burst?80:15));hits++}}
 for(const o of S.props)if(!o.broken&&Math.abs(o.x-p.x)<range&&Math.abs(o.y-p.y)<(burst?100:40)&&(burst||(o.x-p.x)*p.face>-20))breakProp(o,burst?100:kick?42:30);
 if(hits){S.shake=Math.max(S.shake,kick||finisher?5:2);if(finisher)notice('FINISHER',p.x,p.y-182,'#c1d97b')}
}
function maxX(){return S.cleared[2]?WORLD-35:(S.unlocked+1)*ZONE-40}
function updatePlayer(dt){
 p.inv=Math.max(0,p.inv-dt);p.flash=Math.max(0,p.flash-dt);p.kickCD=Math.max(0,p.kickCD-dt);p.dodgeCD=Math.max(0,p.dodgeCD-dt);p.moving=false;if(p.hp<=0)return;
 const m=movement(),ox=p.x,oy=p.y;
 if(p.action==='dodge'&&p.t>0){p.x+=p.dx*470*dt;p.y+=p.dy*260*dt;p.walk+=470*dt}
 else if(p.action!=='hurt'&&p.action!=='special'){const speed=p.t>0?(p.action==='shoot'?105:70):225;p.x+=m.x*speed*dt;p.y+=m.y*speed*.65*dt;if(Math.abs(m.x)>.12&&p.t<=0)p.face=Math.sign(m.x)}
 p.x=clamp(p.x,35,maxX());p.y=clamp(p.y,0,160);const dist=Math.hypot(p.x-ox,(p.y-oy)*1.3);if(dist>.01){p.moving=true;const oldStep=Math.floor(p.walk/62);p.walk+=dist;if(p.action!=='dodge'&&Math.floor(p.walk/62)>oldStep)sound('step')}
 if(p.t>0){p.t-=dt;const elapsed=p.duration-p.t;const timing=p.action==='reload'?.92:p.action==='shoot'?.045:p.action==='special'?.18:p.action==='kick'?.2:.11;if(!p.hit&&elapsed>=timing)playerHit();if(p.t<=0){p.t=0;p.action='idle'}}
 if(p.t<=0){for(const a of ['special','kick','punch','shoot','reload'])if(held.has(a)){if(a==='special'&&p.rage<100)continue;act(a);if(p.t>0)break}}
}
function updateEnemy(e,dt){
 e.flash=Math.max(0,e.flash-dt);if(e.hp<=0){e.deadTime+=dt;return}if(e.zone>S.unlocked)return;e.cooldown-=dt;e.moving=false;const dx=p.x-e.x,dy=p.y-e.y,dist=Math.abs(dx);const rage=e.boss&&e.hp<e.maxHp*.45;
 if(e.state==='hurt'){e.t-=dt;if(e.t<=0){e.state='idle';e.cooldown=Math.max(e.cooldown,.3)}return}
 if(e.state==='windup'){
  e.t-=dt;if(e.t<=0){e.state=e.attack==='rush'?'charge':'attack';e.t=e.attack==='rush'?.6:e.attack==='shoot'?.22:.32;e.hit=false;e.targetY=p.y;e.attackFace=e.face;if(e.attack==='shoot'){
   S.bullets.push({x:e.x+e.face*55,y:e.y,vx:e.face*470,t:2.2,damage:9+S.chapter});sound('shoot');
  }}return;
 }
 if(e.state==='charge'){
  e.x=clamp(e.x+e.attackFace*(rage?440:365)*dt,35,maxX());e.walk+=350*dt;e.moving=true;if(!e.hit&&Math.abs(p.x-e.x)<77&&Math.abs(p.y-e.y)<39){hurt(17+S.chapter,e.attackFace);e.hit=true}e.t-=dt;if(e.t<=0){e.state='recover';e.t=.85}return;
 }
 if(e.state==='attack'){
  if(!e.hit){e.hit=true;if(e.attack==='slam'){S.effects.push({kind:'ring',x:e.x,y:e.y,t:.35,max:.35,color:'#d59568'});if(dist<140&&Math.abs(dy)<76)hurt(19+S.chapter,e.face);S.shake=4}else if(e.attack!=='shoot'&&dist<101&&Math.abs(dy)<31&&dx*e.attackFace>-22)hurt(8+S.chapter,e.attackFace)}e.t-=dt;if(e.t<=0){e.state='recover';e.t=e.boss?.75:.6}return;
 }
 if(e.state==='recover'){e.t-=dt;if(e.t<=0){e.state='idle';e.cooldown=e.boss?.7:1.05}return}
 e.face=dx>=0?1:-1;
 const tooMany=S.enemies.filter(o=>o!==e&&o.hp>0&&['windup','attack','charge'].includes(o.state)).length;
 if(e.cooldown<=0&&tooMany<2&&p.hp>0){
  if(e.type==='rifleman'&&dist<470&&dist>105&&Math.abs(dy)<22){e.state='windup';e.attack='shoot';e.t=.95;return}
  if(e.boss&&dist<310&&Math.abs(dy)<45){e.state='windup';e.attack=dist>115?'rush':'slam';e.t=rage?.7:1.05;return}
  if(!e.boss&&dist<83&&Math.abs(dy)<25){e.state='windup';e.attack='melee';e.t=.6;return}
 }
 let mx=0,my=0;const speed=e.boss?65:95+S.chapter*4;
 if(e.type==='rifleman'&&dist<145)mx=-e.face;else if(dist>(e.type==='rifleman'?250:62))mx=e.face;
 if(Math.abs(dy)>10)my=Math.sign(dy);
 const ox=e.x,oy=e.y;e.x=clamp(e.x+mx*speed*dt,35,maxX());e.y=clamp(e.y+my*speed*.55*dt,0,160);
 for(const o of S.enemies)if(o!==e&&o.hp>0&&o.zone<=S.unlocked&&Math.abs(o.x-e.x)<33&&Math.abs(o.y-e.y)<24){e.y=clamp(e.y+(e.id>o.id?1:-1)*24*dt,0,160)}
 const traveled=Math.hypot(e.x-ox,e.y-oy);if(traveled>.01){e.moving=true;e.walk+=traveled}
}
function progression(){
 for(let z=0;z<=S.unlocked;z++)if(!S.cleared[z]&&!S.enemies.some(e=>e.zone===z&&e.hp>0)){
  S.cleared[z]=true;S.score+=300;if(z<2){S.unlocked=Math.max(S.unlocked,z+1);toast('SECTOR CLEAR — ADVANCE →',2.6);sound('clear')}else{toast('ROUTE SECURED — REACH EXTRACTION →',3);sound('clear')}
 }
 if(S.cleared[2]&&p.x>WORLD-90&&p.hp>0){S.score+=500;outcome(true)}
}
function update(dt){
 if(S.mode!=='play'||S.transition)return;S.time+=dt;S.toastTime-=dt;if(S.toastTime<=0)$('toast').classList.remove('visible');S.comboTime-=dt;if(S.comboTime<=0)S.combo=0;S.shake=Math.max(0,S.shake-dt*23);updatePlayer(dt);
 for(const e of S.enemies)updateEnemy(e,dt);
 for(const b of S.bullets){b.x+=b.vx*dt;b.t-=dt;if(p.hp>0&&Math.abs(b.x-p.x)<25&&Math.abs(b.y-p.y)<24){hurt(b.damage,Math.sign(b.vx));b.t=0}}S.bullets=S.bullets.filter(b=>b.t>0&&b.x>0&&b.x<WORLD);
 for(const f of S.effects){f.t-=dt;if(f.kind==='spark'){f.x+=f.vx*dt;f.y+=f.vy*dt;f.vy+=350*dt}}S.effects=S.effects.filter(f=>f.t>0);
 for(const n of S.notices){n.t-=dt;n.y-=28*dt}S.notices=S.notices.filter(n=>n.t>0);
 const target=clamp(p.x-W*.43,0,Math.max(0,WORLD-W));S.camera+=(target-S.camera)*(1-Math.exp(-dt*7));if(p.hp>0)progression();updateHUD();
}
function updateHUD(){
 if(!p)return;$('hp-label').textContent=Math.ceil(p.hp)+' / 100';$('hp-bar').style.width=p.hp+'%';$('hp-bar').style.background=p.hp<30?'#d88668':'#c1d97b';$('ammo').textContent=p.action==='reload'?'RELOADING':p.ammo+' / '+p.reserve;$('special').textContent=p.rage>=100?'READY':Math.floor(p.rage)+'%';$('touch-special').style.borderColor=p.rage>=100?'#f5ffb4':'';
 const zone=clamp(Math.floor(p.x/ZONE),0,2),c=chapters[S.chapter];$('chapter-label').textContent='CH. 0'+(S.chapter+1)+' / 05  ·  SECTOR 0'+(zone+1);$('area-label').textContent=c.areas[zone];const alive=S.enemies.filter(e=>e.hp>0&&e.zone<=S.unlocked).length;$('objective').textContent=S.cleared[2]?'REACH EXTRACTION →':S.cleared[zone]?'ROUTE OPEN — ADVANCE →':alive+' HOSTILES REMAINING';$('score').textContent=String(S.score).padStart(6,'0');const boss=S.enemies.find(e=>e.boss&&e.zone<=S.unlocked&&e.hp>0);$('boss-hud').hidden=!boss||S.mode!=='play';if(boss){$('boss-name').textContent=c.boss;$('boss-bar').style.width=boss.hp/boss.maxHp*100+'%'}
}
function background(ch,camera,menu=false){
 const c=chapters[ch],far=images[c.id+'-far'],mid=images[c.id+'-mid'],near=images[c.id+'-near'],floor=images[c.id+'-floor'];ctx.fillStyle=ch===2?'#be8850':ch===1?'#b5a17e':ch===3?'#728893':'#34434b';ctx.fillRect(0,0,W,H);
 if(far){const width=Math.max(2040,W+250),height=width*far.height/far.width;ctx.drawImage(far,-camera*.08-20,ground+30-height,width,height)}
 if(mid){const width=[2230,2000,1750,1750,2000][ch],rate=[.3,.3,.18,.18,.3][ch],height=width*mid.height/mid.width;ctx.drawImage(mid,-camera*rate-30,ground+30-height,width,height)}
 if(floor){const width=3000,height=width*floor.height/floor.width;const crop=ASSET_META[c.id+'-floor']?.cropTop||0;ctx.drawImage(floor,0,crop,floor.width,floor.height-crop,-camera-100,ground+7,width,height*(floor.height-crop)/floor.height)}
 if(near){const width=[2430,2230,1900,1900,2170][ch],rate=[.62,.55,.32,.32,.48][ch],height=width*near.height/near.width;ctx.drawImage(near,-camera*rate-32,ground+30-height,width,height)}
 const shade=ctx.createLinearGradient(0,0,0,H);shade.addColorStop(0,'#07120e66');shade.addColorStop(.35,'#07120e00');shade.addColorStop(1,'#030b0750');ctx.fillStyle=shade;ctx.fillRect(0,0,W,H);
}
function sprite(name,frame,x,y,height,face=1){
 const img=images[name],meta=ASSET_META[name];if(!img||!meta)return;frame=clamp(frame,0,meta.frames-1);const cw=meta.cellW,ch=meta.cellH,s=height/meta.bodyHeight;ctx.save();ctx.translate(x,y);ctx.scale(face,1);ctx.drawImage(img,frame%meta.cols*cw,Math.floor(frame/meta.cols)*ch,cw,ch,-meta.anchorX*s,-meta.anchorY*s,cw*s,ch*s);ctx.restore();
}
function shadow(x,y,w=32){ctx.fillStyle='#030d0990';ctx.beginPath();ctx.ellipse(x,y,w,w*.24,0,0,Math.PI*2);ctx.fill()}
function actorFrame(a,hero){
 if(hero){if(a.hp<=0)return 7;if(a.t>0){return {punch:3,kick:4,shoot:5,hurt:6,reload:0,dodge:1+Math.floor(a.walk/35)%2,special:4}[a.action]??0}return a.moving?1+Math.floor(a.walk/37)%2:0}
 if(a.hp<=0)return 5;if(a.state==='hurt')return 4;if(a.state==='attack'||a.state==='charge')return 3;return a.moving?1+Math.floor(a.walk/(a.boss?45:35))%2:0;
}
function renderActor(a,hero){
 const x=a.x-S.camera,y=ground+50+a.y;if(x<-220||x>W+220)return;const size=hero?164:a.boss?207:158;
 if(a.hp<=0){if(a.deadTime>5)return;ctx.save();ctx.globalAlpha=hero?1:Math.max(.25,1-a.deadTime*.12);sprite(hero?'operator':a.type,actorFrame(a,hero),x,y,size,a.face);ctx.restore();return}
 shadow(x,y,a.boss?48:32);
 if(!hero&&a.state==='windup'){
  const pulse=.45+Math.sin(S.time*23)*.25;ctx.save();ctx.strokeStyle=`rgba(240,181,91,${pulse})`;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y+2,a.attack==='slam'?136:45,a.attack==='slam'?60:15,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#ffd083';ctx.font='bold 25px Field';ctx.textAlign='center';ctx.fillText('!',x,y-size-13);
  if(a.attack==='shoot'){ctx.setLineDash([8,7]);ctx.beginPath();ctx.moveTo(x+a.face*35,y-100);ctx.lineTo(x+a.face*520,y-100);ctx.stroke()}ctx.restore();
 }
 if(hero&&a.action==='dodge'){ctx.strokeStyle='#d0e19d66';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-a.dx*65,y-75);ctx.lineTo(x-a.dx*25,y-75);ctx.stroke()}
 sprite(hero?'operator':a.type,actorFrame(a,hero),x,y,size,a.face);
 if(a.flash>0){ctx.strokeStyle=hero?'#f2a279':'#efdeba';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y-size*.53,30,size*.34,0,0,Math.PI*2);ctx.stroke()}
 if(!hero&&a.hp<a.maxHp&&!a.boss){ctx.fillStyle='#101911';ctx.fillRect(x-24,y-size-12,48,4);ctx.fillStyle='#c6bc8a';ctx.fillRect(x-24,y-size-12,48*a.hp/a.maxHp,4)}
 if(hero&&a.action==='reload'){ctx.fillStyle='#121e17';ctx.fillRect(x-27,y-size-15,54,4);ctx.fillStyle='#c1d97b';ctx.fillRect(x-27,y-size-15,54*(1-a.t/a.duration),4)}
}
function renderWorld(){
 background(S.chapter,S.camera);const items=[];for(const e of S.enemies)items.push({y:e.y,type:'actor',a:e});for(const o of S.props)items.push({y:o.y,type:'prop',a:o});items.push({y:p.y,type:'hero',a:p});items.sort((a,b)=>a.y-b.y);
 for(const o of items){if(o.type==='prop'){const a=o.a,x=a.x-S.camera;if(x>-160&&x<W+160){if(!a.broken)shadow(x,ground+50+a.y,38);sprite(chapters[S.chapter].id+'-prop',a.frame,x,ground+50+a.y,[76,108,73,89,135][S.chapter])}}else renderActor(o.a,o.type==='hero')}
 for(const b of S.bullets){ctx.strokeStyle='#ffc783';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(b.x-S.camera,ground+50+b.y-103);ctx.lineTo(b.x-S.camera-Math.sign(b.vx)*18,ground+50+b.y-103);ctx.stroke()}
 for(const f of S.effects){ctx.save();ctx.globalAlpha=clamp(f.t*5,0,1);ctx.fillStyle=f.color;ctx.strokeStyle=f.color;if(f.kind==='spark')ctx.fillRect(f.x-S.camera,ground+50+f.y,4,3);if(f.kind==='tracer'){ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(f.x-S.camera,ground+50+f.y);ctx.lineTo(f.x2-S.camera,ground+50+f.y);ctx.stroke()}if(f.kind==='ring'){const r=(1-f.t/f.max)*240;ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(f.x-S.camera,ground+50+f.y,r,r*.38,0,0,Math.PI*2);ctx.stroke()}ctx.restore()}
 for(const n of S.notices){ctx.save();ctx.globalAlpha=Math.min(1,n.t*3);ctx.font='bold 18px Field';ctx.textAlign='center';ctx.fillStyle='#0a1611';ctx.fillText(n.text,n.x-S.camera+1,ground+51+n.y);ctx.fillStyle=n.color;ctx.fillText(n.text,n.x-S.camera,ground+50+n.y);ctx.restore()}
 if(S.combo>=3&&S.comboTime>0){ctx.textAlign='right';ctx.font='bold 37px Field';ctx.fillStyle='#d7e6a5';ctx.fillText(S.combo+' HITS',W-45,H*.39)}
 const gate=maxX();if(!S.cleared[2]&&gate-S.camera<W-10){ctx.save();ctx.strokeStyle='#d7af6555';ctx.setLineDash([7,12]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(gate-S.camera,ground+35);ctx.lineTo(gate-S.camera,ground+222);ctx.stroke();ctx.restore();ctx.font='bold 13px Field';ctx.textAlign='center';ctx.fillStyle='#e0c994';ctx.fillText('CLEAR SECTOR',gate-S.camera-64,ground+248)}
 const current=clamp(Math.floor(p.x/ZONE),0,2);if(S.cleared[current]){ctx.fillStyle='#d8e99c';ctx.textAlign='right';ctx.font='bold 26px Field';ctx.fillText(S.cleared[2]?'EXTRACTION →':'ADVANCE →',W-44,ground+25)}
}
function renderMenu(t){
 background(0,210+Math.sin(t*.00015)*110,true);const portrait=H>W;
 if(portrait){sprite('operator',0,W*.67,H*.50,Math.min(500,H*.43),-1)}
 else{sprite('raider',0,W*.90,H*.88,Math.min(H*.46,350),-1);sprite('operator',0,W*.65,H*.92,Math.min(H*.74,580),-1)}
}
function draw(t){
 ctx.setTransform(dpr*scale,0,0,dpr*scale,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.save();if(S.mode==='play'&&S.shake>0)ctx.translate((Math.random()-.5)*S.shake,(Math.random()-.5)*S.shake*.6);
 if(S.mode==='main'||S.mode==='help'&&menuOrigin==='main'||!p)renderMenu(t);else renderWorld();ctx.restore();
}
function frame(t){const dt=Math.min((t-last)/1000,.033);last=t;update(dt);draw(t);frameHandle=requestAnimationFrame(frame)}
async function preload(){
 S.failed=false;S.loaded=false;$('start').disabled=true;$('start-label').textContent='LOADING 0%';let done=0;const names=Object.keys(ASSET_META),fail=[];
 await Promise.all(names.map(name=>new Promise(resolve=>{const im=new Image();im.onload=()=>{images[name]=im;done++;progress();resolve()};im.onerror=()=>{fail.push(name);done++;progress();resolve()};im.src='assets/'+name+'.png'})));
 try{await document.fonts.ready}catch{}
 if(fail.length){S.failed=true;$('start-label').textContent='RETRY LOADING';$('start').disabled=false;$('start').onclick=preload;return}
 S.loaded=true;$('start-label').textContent='START GAME';$('start').style.setProperty('--load','100%');$('start').disabled=false;$('start').onclick=newRun;
 function progress(){const n=Math.floor(done/names.length*100);$('start-label').textContent='LOADING '+n+'%';$('start').style.setProperty('--load',n+'%')}
}

function gameStatus(){return {mode:S.mode,loaded:S.loaded,chapter:S.chapter+1,sector:p?clamp(Math.floor(p.x/ZONE)+1,1,3):1,health:p?Math.ceil(p.hp):100,ammo:p?p.ammo:12,reserve:p?p.reserve:60,score:S.score,hostiles:S.enemies.filter(e=>e.hp>0&&e.zone<=S.unlocked).length};}
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{}};
 register({name:'read_game_status',title:'Read game status',description:'Read the current campaign, health, ammunition, score, loading status, and visible menu state.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(!input||Object.keys(input).length)throw new Error('No arguments are accepted');return gameStatus();}});
 register({name:'control_game_menu',title:'Control game menu',description:'Use the game menu: start a NEW run (resets current progress), pause play, resume a paused run, retry the current failed chapter, or continue after chapter completion.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['start_new_run','pause','resume','retry_chapter','next_chapter']}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false},async execute(input){if(!input||Object.keys(input).length!==1)throw new Error('Provide exactly one action');const a=input.action;if(a==='start_new_run'&&S.loaded)newRun();else if(a==='pause'&&S.mode==='play')pause();else if(a==='resume'&&S.mode==='pause')resume();else if(a==='retry_chapter'&&S.mode==='defeat')retry();else if(a==='next_chapter'&&S.mode==='chapter')await nextChapter();else throw new Error('Action is unavailable in this game state');return gameStatus();}});
 addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}

ui();preload();frameHandle=requestAnimationFrame(frame);
})();
