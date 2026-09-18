'use strict';
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d',{alpha:false}),ui=document.getElementById('ui');
const TITLE='Gears of War: Platformer',GROUND=600,GRAVITY=1850;
const THEMES=[
 {id:'city',name:'ASH DISTRICT',short:'Jacinto outskirts',sky:'#333e48',bottom:'#1b222b',terrain:'#3a424a',edge:'#85847b',accent:'#f59b55',length:5300,brief:'Break through the ruined district. Reach the evacuation beacon.',hazard:'Ash sweeps'},
 {id:'foundry',name:'IRON FOUNDRY',short:'The furnace line',sky:'#41302a',bottom:'#191b20',terrain:'#40352e',edge:'#9e7151',accent:'#ffaf52',length:5650,brief:'Cross the furnace line. Watch the steam vents between bursts.',hazard:'Steam vents'},
 {id:'aqueduct',name:'STORM AQUEDUCT',short:'The broken crossing',sky:'#293c4a',bottom:'#17252e',terrain:'#374b50',edge:'#7c9a99',accent:'#98dcdf',length:5650,brief:'Fight across the storm-battered aqueduct. Keep moving through the crossfire.',hazard:'Electrified water'},
 {id:'hollow',name:'THE HOLLOW',short:'Below the surface',sky:'#302d40',bottom:'#211c2a',terrain:'#4b393e',edge:'#927362',accent:'#ffca63',length:5850,brief:'Descend into the Hollow. Stay clear of the burning imulsion.',hazard:'Imulsion pools'},
 {id:'citadel',name:'LAST CITADEL',short:'Emberline command',sky:'#492e36',bottom:'#201f29',terrain:'#483e42',edge:'#977971',accent:'#ed6e51',length:6050,brief:'Break the final Locust line. Secure the last beacon.',hazard:'Mortar fire'}
];
const WEAPONS=[{name:'LANCER',mag:30,ammo:30,reserve:360,delay:.105,damage:21,pellets:1,spread:.018,reload:1.8},{name:'GNASHER',mag:6,ammo:6,reserve:54,delay:.6,damage:22,pellets:7,spread:.19,reload:2.1}];
const assets={},keys={},touch={},pointer={x:0,y:0,down:false,active:false};
let width=1280,height=720,scale=1,viewW=1280,viewH=720,dpr=1;
let mode='loading',levelIndex=0,level=null,player=null,camera={x:0,y:0},enemies=[],props=[],bullets=[],grenades=[],pickups=[],particles=[],corpses=[],hazards=[];
let t=0,lastTime=0,accumulator=0,shake=0,flash=0,toastTime=0,hudTimer=0,elapsed=0,totalKills=0,levelKills=0,score=0,activeReloads=0,weapon=0,reload=null,boost=1,checkpoint=120,checkpointScore=0,checkpointKills=0,lastFire=false;
let audioCtx=null,noiseBuffer=null,muted=false,loaded=0,assetError=false,started=false,isTouch=('ontouchstart' in window)||(navigator.maxTouchPoints>0);
let save={level:0,best:0,completed:false},audioCooldown=0;
const icons={
 sound:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9h4l5-4v14l-5-4H3Z"/><path d="M16 8q4 4 0 8m3-11q7 7 0 14"/></svg>',
 mute:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9h4l5-4v14l-5-4H3Zm13 0 6 6m0-6-6 6"/></svg>',
 full:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>',
 pause:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>',
 left:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m15 5-7 7 7 7"/></svg>',
 right:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m9 5 7 7-7 7"/></svg>',
 jump:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 21V4m-7 7 7-7 7 7"/></svg>',
 fire:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="6"/><path d="M12 0v6m0 12v6M0 12h6m12 0h6"/></svg>'
};
try{save=Object.assign(save,JSON.parse(localStorage.getItem('emberline-save')||'{}'));save.level=Math.max(0,Math.min(4,Number(save.level)||0));muted=localStorage.getItem('emberline-muted')==='1';}catch(e){}
function persist(){try{localStorage.setItem('emberline-save',JSON.stringify(save));}catch(e){}}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function rand(a,b){return a+Math.random()*(b-a);}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function held(code){return !!keys[code]||!!touch[code];}
function escapeHTML(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function resize(){
 width=Math.max(240,window.innerWidth);height=Math.max(240,window.innerHeight);dpr=Math.min(window.devicePixelRatio||1,2);
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
 scale=Math.max(.58,Math.min(height/700,width/1050,1.9));
 viewW=width/scale;viewH=height/scale;
 camera.y=GROUND-viewH*(isTouch?.70:.79);
 ctx.imageSmoothingEnabled=false;
}
function initAudio(){if(!audioCtx)try{audioCtx=new (window.AudioContext||window.webkitAudioContext)();noiseBuffer=audioCtx.createBuffer(1,audioCtx.sampleRate*.4,audioCtx.sampleRate);const a=noiseBuffer.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;}catch(e){}if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});}
function tone(freq,duration,volume=.08,type='square',slide=0){
 if(muted||!audioCtx)return;
 const o=audioCtx.createOscillator(),g=audioCtx.createGain(),now=audioCtx.currentTime;
 o.type=type;o.frequency.setValueAtTime(freq,now);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),now+duration);
 g.gain.setValueAtTime(volume,now);g.gain.exponentialRampToValueAtTime(.001,now+duration);
 o.connect(g);g.connect(audioCtx.destination);o.start(now);o.stop(now+duration);
}
function noise(duration=.1,volume=.13,freq=1800){
 if(muted||!audioCtx||!noiseBuffer)return;
 const s=audioCtx.createBufferSource(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain(),now=audioCtx.currentTime;
 s.buffer=noiseBuffer;f.type='lowpass';f.frequency.value=freq;g.gain.setValueAtTime(volume,now);g.gain.exponentialRampToValueAtTime(.001,now+duration);
 s.connect(f);f.connect(g);g.connect(audioCtx.destination);s.start();s.stop(now+duration);
}
function sound(name){
 if(name==='fire'){noise(weapon===1?.19:.075,weapon===1?.24:.14,weapon===1?1000:2200);tone(weapon===1?90:140,.09,.08,'sawtooth',-60);}
 else if(name==='enemy'){noise(.06,.035,1500);}
 else if(name==='blast'){noise(.36,.3,550);tone(65,.28,.18,'sawtooth',-40);}
 else if(name==='hit'){noise(.07,.055,850);}
 else if(name==='hurt'){noise(.17,.1,650);tone(110,.15,.07,'sawtooth',-70);}
 else if(name==='reload'){tone(600,.055,.04);noise(.045,.06,4000);}
 else if(name==='perfect'){tone(520,.13,.07,'sine',280);setTimeout(()=>tone(900,.16,.06,'sine'),70);}
 else if(name==='pickup'){tone(600,.1,.045,'sine',500);}
 else if(name==='saw'){noise(.3,.2,1000);tone(80,.3,.12,'sawtooth',180);}
}
function utilities(){return '<div class="utility"><button class="icon-btn" data-action="audio" aria-label="'+(muted?'Enable sound':'Mute sound')+'">'+icons[muted?'mute':'sound']+'</button><button class="icon-btn" data-action="fullscreen" aria-label="Toggle fullscreen">'+icons.full+'</button></div>';}
function branding(){return '<div class="brand-lockup" aria-label="G55.CO Unofficial Fan Game"><b>G55.CO</b><span>|</span><em>UNOFFICIAL FAN GAME</em></div>';}
function moreGames(){return '<a class="secondary" href="https://g55.co/?utm_source=moreGamesButton&amp;utm_medium='+encodeURIComponent(TITLE)+'" target="_blank" rel="noopener">MORE GAMES</a>';}
function menu(loading=false){
 mode=loading?'loading':'menu';pointer.down=false;clearInputs();reload=null;
 const start=loading?'<button class="primary loading-start" id="start-button" disabled>LOADING <span id="load-percent">0%</span></button>':'<button class="primary" data-action="'+(save.level>0?'continue':'start')+'">START GAME</button>';
 const textActions=loading?'<button class="text-link" disabled>FIELD MANUAL</button>':'<button class="text-link" data-action="how">FIELD MANUAL</button>'+(save.level>0?'<button class="text-link" data-action="start">NEW CAMPAIGN</button>':'');
 ui.innerHTML='<section class="screen"><div class="menu-top">'+branding()+utilities()+'</div><div class="menu-content"><p class="eyebrow">A SIDE-SCROLLING CAMPAIGN</p><h1 class="title">GEARS <span class="of">OF</span><br>WAR</h1><div class="subtitle">PLATFORMER</div><div class="title-rule"></div><div class="mission-name">FIVE DISTRICTS. ONE WAY OUT.</div><div class="mission-note">Cut through the Locust line.<br>Make every reload count.</div><div class="actions">'+start+moreGames()+'</div><div class="text-actions">'+textActions+'</div></div><div class="menu-bottom"><div class="controls-line"><span><b>A D</b> MOVE</span><span><b>SPACE</b> JUMP</span><span><b>MOUSE / J</b> FIRE</span><span><b>R</b> ACTIVE RELOAD</span></div><div class="chapter-dots" aria-label="Five campaign levels">'+THEMES.map((x,i)=>'<span class="'+(i<=save.level?'active':'')+'"></span>').join('')+'</div></div></section>';
 document.body.classList.toggle('is-touch',isTouch);
}
function how(){
 mode='how';
 ui.innerHTML='<section class="screen overlay"><div class="menu-content"><p class="eyebrow">FIELD MANUAL</p><h2>STAY IN THE FIGHT.</h2><div class="how-grid"><div><b>A / D · ARROW KEYS</b>Move through the district.</div><div><b>SPACE · W · UP</b>Jump gaps and reach ledges.</div><div><b>MOUSE · HOLD J</b>Aim and fire. J uses aim assist.</div><div><b>S · DOWN</b>Hold to crouch behind cover.</div><div><b>R · ACTIVE RELOAD</b>Press again in the bright zone.</div><div><b>1 / 2 · SWITCH WEAPON</b>Lancer rifle or Gnasher shotgun.</div><div><b>E · CHAINSAW</b>Finish an enemy at close range.</div><div><b>Q · FRAG GRENADE</b>Clear groups and break cover.</div></div><p class="brief">A timed reload boosts the next magazine. A missed timing jams the weapon. Touch controls include aim assist.</p><div class="actions"><button class="primary" data-action="menu">BACK TO MENU</button></div></div></section>';
}
function hud(){
 ui.innerHTML='<div class="hud"><div class="hud-top"><div class="health-box"><div class="hud-tag"><span>COG / DELTA</span><span id="health-text">100</span></div><div class="health-track" id="health-track"><i id="health-bar"></i></div><div class="hud-stats"><span id="score">000000</span><span id="frags">FRAGS 03</span></div></div><div class="hud-mission"><div class="num">DISTRICT '+String(levelIndex+1).padStart(2,'0')+' / 05</div><div class="name">'+THEMES[levelIndex].name+'</div><div id="objective" class="objective">REACH THE BEACON</div></div><div class="hud-right"><div class="weapon-box"><div class="weapon-name" id="weapon-name">LANCER</div><div class="ammo" id="ammo">30 <small>/ 360</small></div><div class="weapon-slots">1 LANCER · 2 GNASHER</div></div><button class="icon-btn" data-action="pause" aria-label="Pause">'+icons.pause+'</button><button class="icon-btn fullscreen-game" data-action="fullscreen" aria-label="Toggle fullscreen">'+icons.full+'</button></div></div><div class="bottom-hint">S COVER &nbsp; / &nbsp; E CHAINSAW &nbsp; / &nbsp; Q FRAG &nbsp; / &nbsp; 1 2 WEAPON</div><div class="reload-wrap" id="reload-wrap"><div class="reload-label" id="reload-label">ACTIVE RELOAD</div><div class="reload-track"><div class="reload-zone"></div><div class="reload-perfect"></div><div class="reload-cursor" id="reload-cursor"></div></div><div class="reload-hint">PRESS R AGAIN IN THE BRIGHT ZONE</div></div></div><div class="toast" id="toast"></div><div class="touch-controls"><button class="touch-btn touch-left" data-key="KeyA" aria-label="Move left">'+icons.left+'</button><button class="touch-btn touch-right" data-key="KeyD" aria-label="Move right">'+icons.right+'</button><button class="touch-btn touch-cover" data-key="KeyS" aria-label="Take cover">COVER</button><button class="touch-btn touch-jump" data-action="jump" aria-label="Jump">'+icons.jump+'</button><button class="touch-btn touch-fire" data-key="KeyJ" aria-label="Fire">'+icons.fire+'</button><button class="touch-btn touch-reload" data-action="reload" aria-label="Reload">R</button><button class="touch-btn touch-melee" data-action="melee" aria-label="Chainsaw">SAW</button><button class="touch-btn touch-grenade" data-action="grenade" aria-label="Grenade">Q</button><button class="touch-btn touch-switch" data-action="switch" aria-label="Switch weapon">1/2</button></div>';
 document.body.classList.toggle('is-touch',isTouch);updateHUD();
}
function notify(message,duration=2.3){
 const el=document.getElementById('toast');if(el){el.textContent=message;el.classList.add('show');toastTime=duration;}
}
function pause(){
 if(mode!=='playing')return;mode='paused';pointer.down=false;clearInputs();
 ui.innerHTML='<section class="screen overlay"><div class="menu-top"><span></span>'+utilities()+'</div><div class="menu-content"><p class="eyebrow">DISTRICT '+String(levelIndex+1).padStart(2,'0')+' · '+THEMES[levelIndex].name+'</p><h2>HOLD THE LINE.</h2><p class="brief">Your squad is waiting.</p><div class="actions"><button class="primary" data-action="resume">RESUME</button>'+moreGames()+'</div><div class="text-actions" style="justify-content:center"><button class="text-link" data-action="restart">RESTART CHECKPOINT</button><button class="text-link" data-action="menu">MAIN MENU</button></div></div></section>';
}
function resume(){if(mode==='paused'){mode='playing';hud();lastTime=performance.now();}}
function outcome(won){
 mode=won?'complete':'dead';pointer.down=false;clearInputs();reload=null;
 if(won){save.level=Math.max(save.level,Math.min(4,levelIndex+1));if(levelIndex===4)save.completed=true;save.best=Math.max(save.best,score);persist();tone(400,.5,.08,'sine',400);}
 else tone(120,.7,.08,'sawtooth',-80);
 const last=won&&levelIndex===4;
 ui.innerHTML='<section class="screen overlay"><div class="menu-content"><p class="eyebrow">'+(won?'DISTRICT '+String(levelIndex+1).padStart(2,'0')+' SECURED':'DELTA SIGNAL LOST')+'</p><h2>'+(won?(last?'EMBERLINE HOLDS.':'THE WAY IS CLEAR.'):'BACK INTO THE FIGHT.')+'</h2><p class="brief">'+(won?(last?'Five districts secured. The last beacon is ours.':'The next district is waiting. Reload. Move out.'):'Restart at your last checkpoint. Use cover and time your reloads.')+'</p><div class="summary-grid"><div><b>'+score.toLocaleString()+'</b><span>SCORE</span></div><div><b>'+totalKills+'</b><span>LOCUST DOWN</span></div><div><b>'+Math.floor(elapsed/60)+':'+String(Math.floor(elapsed%60)).padStart(2,'0')+'</b><span>TIME</span></div></div><div class="actions"><button class="primary" data-action="'+(won?(last?'start':'next'):'restart')+'">'+(won?(last?'PLAY AGAIN':'NEXT DISTRICT'):'RETRY CHECKPOINT')+'</button>'+moreGames()+'</div><div class="text-actions" style="justify-content:center"><button class="text-link" data-action="menu">MAIN MENU</button></div></div></section>';
}
function createLevel(index,spawnX=120){
 const th=THEMES[index],len=th.length,shift=index*32;
 const gaps=[[1530+shift,1700+shift],[3170+shift,3340+shift],[len-1250,len-1080]];
 const floors=[];let end=0;for(const g of gaps){floors.push({x:end,y:GROUND,w:g[0]-end,h:220,floor:true});end=g[1];}floors.push({x:end,y:GROUND,w:len-end+200,h:220,floor:true});
 const platforms=[
 {x:630,y:478,w:260,h:28},{x:1010,y:462,w:235,h:28},{x:1370+shift,y:494,w:200,h:28},
 {x:2050,y:478,w:280,h:28},{x:2370,y:391,w:200,h:28},{x:2870+shift,y:485,w:290,h:28},
 {x:3520+shift,y:480,w:280,h:28},{x:len-1460,y:470,w:230,h:28},{x:len-940,y:480,w:270,h:28}
 ];
 level={...th,solids:[...floors,...platforms],floors,platforms,gaps,beacon:len-165,checkpoints:[120,1900,3450],cleared:false};
 enemies=[];props=[];bullets=[];grenades=[];particles=[];corpses=[];pickups=[];hazards=[];
 const spawn=(x,type='drone',y=GROUND,elite=false)=>{if(x<spawnX-150)return;enemies.push({x,y,vx:0,vy:0,w:type==='wretch'?64:52,h:type==='wretch'?68:132,health:type==='wretch'?58:(elite?154:102),maxHealth:type==='wretch'?58:(elite?154:102),type,elite,dir:-1,onGround:true,walk:0,fire:rand(.6,1.7),burst:0,attack:0,hurt:0,alert:false,dead:false,stuck:0});};
 const positions=[820,1180,1880,2230,2700,2990,3620,3910,len-960,len-650,len-385];
 positions.forEach((x,i)=>spawn(x+(index%2)*50,i%4===2?'wretch':'drone',GROUND,index>2&&i%3===1));
 for(let i=0;i<index+2;i++)spawn(1300+i*810,'wretch');
 if(index>0)spawn(2160,'drone',478);
 if(index>2){spawn(len-720,'wretch');spawn(len-530,'drone',GROUND,true);}
 const px=[490,980,1940,2450,2780,3510,len-970,len-550];
 px.forEach((x,i)=>{if(!gaps.some(g=>x>g[0]-90&&x<g[1]+90))props.push({x,y:GROUND,w:[126,140,152,120,80][index],h:[58,106,80,97,92][index],health:x<spawnX?0:85,maxHealth:85,state:x<spawnX?2:0,hit:0});});
 pickups.push({x:720,y:436,type:'ammo',time:0},{x:1100,y:GROUND-27,type:'health',time:0},{x:2480,y:350,type:'grenade',time:0},{x:3660,y:434,type:'ammo',time:0},{x:len-830,y:GROUND-27,type:'health',time:0});
 if(index===1)for(const x of [1300,2580,3900])hazards.push({type:'steam',x,y:GROUND,w:74,phase:x*.013});
 if(index===2)for(const x of [1360,2590,3980])hazards.push({type:'shock',x,y:GROUND,w:84,phase:x*.017});
 if(index===3)for(const x of [1170,2670,3950])hazards.push({type:'pool',x,y:GROUND,w:100,phase:0});
 if(index===4)for(const x of [1410,2590,4070,5040])hazards.push({type:'mortar',x,y:GROUND,w:90,phase:x*.01,cycle:-1});
 for(const w of WEAPONS){w.ammo=w.mag;w.reserve=w===WEAPONS[0]?300:48;}
 player={x:spawnX,y:GROUND,vx:0,vy:0,w:44,h:140,health:100,dir:1,onGround:true,coyote:0,jumpBuffer:0,walk:0,crouch:false,fire:0,shot:0,hurt:0,invincible:0,melee:0,meleeCd:0,grenadeCd:0,grens:3,regen:0};
 camera.x=clamp(spawnX-viewW*.24,0,Math.max(0,len-viewW));camera.y=GROUND-viewH*(isTouch?.70:.79);
 reload=null;boost=1;weapon=0;levelKills=spawnX===120?0:levelKills;shake=0;flash=0;mode='playing';hud();notify('DISTRICT '+String(index+1).padStart(2,'0')+'  /  '+th.name,3);
}
function startCampaign(index=0){initAudio();levelIndex=index;checkpoint=120;checkpointScore=0;checkpointKills=0;elapsed=0;totalKills=0;score=0;activeReloads=0;levelKills=0;started=true;clearInputs();createLevel(index);lastTime=performance.now();}
function nextLevel(){if(levelIndex<4){levelIndex++;checkpoint=120;checkpointScore=score;checkpointKills=totalKills;levelKills=0;createLevel(levelIndex);}else menu();}
function restartCheckpoint(){score=checkpointScore;totalKills=checkpointKills;clearInputs();createLevel(levelIndex,checkpoint);}
function clearInputs(){for(const k in keys)keys[k]=false;for(const k in touch)touch[k]=false;pointer.down=false;}
function changeWeapon(index){if(mode!=='playing'||reload)return;weapon=index;boost=1;sound('reload');updateHUD();}
function jump(){if(mode==='playing'&&player)player.jumpBuffer=.14;}
function startReload(){
 if(mode!=='playing')return;
 const w=WEAPONS[weapon];
 if(reload){
  if(reload.tried)return;
  reload.tried=true;const p=reload.time/reload.duration;
  if(p>=.48&&p<=.67){const perfect=p>=.56&&p<=.62;boost=perfect?1.9:1.45;finishReload();activeReloads++;score+=perfect?100:50;sound('perfect');notify(perfect?'PERFECT RELOAD · DAMAGE UP':'ACTIVE RELOAD · DAMAGE UP',1.4);}
  else{reload.jam=.8;reload.duration+=.8;boost=1;notify('WEAPON JAMMED',1.3);noise(.1,.1,800);}
  return;
 }
 if(w.ammo===w.mag)return;
 if(!w.reserve){notify('FIND AN AMMO SUPPLY',1.4);return;}
 reload={time:0,duration:w.reload,tried:false,jam:0};boost=1;sound('reload');
}
function finishReload(){const w=WEAPONS[weapon],n=Math.min(w.mag-w.ammo,w.reserve);w.ammo+=n;w.reserve-=n;reload=null;sound('reload');updateHUD();}
function playerGunHeight(){return player.crouch?43:(Math.abs(player.vx)>10&&player.onGround?80:105);}
function aim(){
 const mx=pointer.x/scale+camera.x,my=pointer.y/scale+camera.y;
 let dx=player.dir,dy=0;
 if(pointer.active&&!held('KeyJ')&&!isTouch){dx=mx-player.x;dy=my-(player.y-playerGunHeight());player.dir=dx>=0?1:-1;}
 else{
  let best=null,bestD=Infinity;
  for(const e of enemies){const distance=Math.hypot(e.x-player.x,e.y-player.y);if(!e.dead&&distance<730&&(e.x-player.x)*player.dir>-25&&Math.abs(e.y-player.y)<240&&distance<bestD){best=e;bestD=distance;}}
  if(best){dx=best.x-player.x;dy=(best.y-best.h*.52)-(player.y-playerGunHeight());}
 }
 const a=Math.atan2(dy,dx);return {angle:a,dir:dx>=0?1:-1};
}
function fire(){
 if(mode!=='playing'||reload||player.fire>0||player.melee>0)return;
 const w=WEAPONS[weapon];if(w.ammo<=0){startReload();return;}
 const a=aim();player.dir=a.dir;const origin={x:player.x+player.dir*74,y:player.y-playerGunHeight()};
 for(let i=0;i<w.pellets;i++){const angle=a.angle+rand(-w.spread,w.spread);bullets.push({x:origin.x,y:origin.y,px:origin.x,py:origin.y,vx:Math.cos(angle)*1220,vy:Math.sin(angle)*1220,life:weapon===1?.52:.85,damage:w.damage*boost,owner:'player',color:boost>1?'#d8fff4':'#ffdc9a'});}
 w.ammo--;player.fire=w.delay;player.shot=.09;shake=Math.max(shake,weapon===1?5.8:2.2);sound('fire');
 for(let i=0;i<4;i++)particle(origin.x,origin.y,player.dir*rand(100,270),rand(-70,70),rand(.04,.11),'#ffe4a8',rand(2,4),0);
}
function chainsaw(){
 if(mode!=='playing'||player.meleeCd>0||reload)return;
 player.melee=.4;player.meleeCd=1.05;shake=4;sound('saw');
 let hit=false;
 for(const e of enemies)if(!e.dead&&Math.abs(e.x-player.x)<126&&Math.abs(e.y-player.y)<98&&(e.x-player.x)*player.dir>-15){damageEnemy(e,220,true);hit=true;player.health=Math.min(100,player.health+8);}
 for(const p of props)if(p.state<2&&Math.abs(p.x-player.x)<140)damageProp(p,95);
 if(hit)notify('CHAINSAW FINISH',1);
}
function throwGrenade(){
 if(mode!=='playing'||player.grens<=0||player.grenadeCd>0)return;
 player.grens--;player.grenadeCd=.7;grenades.push({x:player.x+player.dir*34,y:player.y-66,vx:player.dir*420,vy:-440,fuse:1.25,bounces:0});tone(240,.07,.05);
}
function particle(x,y,vx,vy,life,color,size=3,gravity=650){particles.push({x,y,vx,vy,life,maxLife:life,color,size,gravity});}
function sparks(x,y,count=10,color='#f1b476'){
 for(let i=0;i<count;i++)particle(x,y,rand(-170,170),rand(-180,40),rand(.14,.42),i%3===0?'#f4dec0':color,rand(2,5));
}
function damageEnemy(e,amount,saw=false){
 if(e.dead)return;
 e.health-=amount;e.hurt=.09;e.alert=true;sparks(e.x,e.y-e.h*.55,4,'#bb5647');sound('hit');
 if(e.health<=0){
  e.dead=true;totalKills++;levelKills++;score+=e.elite?225:(e.type==='wretch'?100:150);
  corpses.push({x:e.x,y:e.y,type:e.type,dir:e.dir,time:5});sparks(e.x,e.y-e.h*.4,saw?20:11,'#a9473b');
  if(Math.random()<.42)pickups.push({x:e.x,y:e.y-25,type:player.health<55?'health':(Math.random()<.78?'ammo':'grenade'),time:0});
 }
}
function damageProp(p,damage){
 if(p.state===2)return;p.health-=damage;p.hit=.1;sparks(p.x,p.y-p.h*.5,6,THEMES[levelIndex].edge);
 if(p.health<=0){p.state=2;shake=Math.max(shake,3);noise(.14,.14,950);score+=50;pickups.push({x:p.x,y:p.y-26,type:Math.random()<.2?'grenade':'ammo',time:0});}
 else p.state=p.health<50?1:0;
}
function hurtPlayer(damage){
 if(mode!=='playing'||player.invincible>0)return;
 player.health-=damage;player.hurt=.18;player.invincible=.18;player.regen=4.5;flash=.2;shake=Math.max(shake,5);sound('hurt');
 if(player.health<=0){player.health=0;outcome(false);}
}
function explosion(x,y){
 sound('blast');shake=Math.max(shake,11);
 for(let i=0;i<45;i++)particle(x,y,rand(-340,340),rand(-360,150),rand(.2,.7),['#ffdd95','#e28a44','#a44732','#84847c'][i%4],rand(3,12),450);
 for(const e of enemies){const d=Math.hypot(e.x-x,e.y-e.h*.5-y);if(!e.dead&&d<210)damageEnemy(e,Math.max(40,230*(1-d/250)));}
 for(const p of props)if(p.state<2&&Math.hypot(p.x-x,p.y-p.h*.5-y)<210)damageProp(p,150);
}
function actorBox(a){return {x:a.x-a.w/2,y:a.y-a.h,w:a.w,h:a.h};}
function lineRect(x1,y1,x2,y2,r){
 let low=0,high=1;const dx=x2-x1,dy=y2-y1;
 for(const [p,q] of [[-dx,x1-r.x],[dx,r.x+r.w-x1],[-dy,y1-r.y],[dy,r.y+r.h-y1]]){
  if(p===0){if(q<0)return null;}
  else{const v=q/p;if(p<0){if(v>high)return null;low=Math.max(low,v);}else{if(v<low)return null;high=Math.min(high,v);}}
 }
 return low;
}
function hasFloor(x,y,maxDrop=90){return level.solids.some(s=>x>=s.x&&x<=s.x+s.w&&s.y>=y-5&&s.y<=y+maxDrop);}
function moveActor(a,dt){
 const oldX=a.x,oldY=a.y,oldBottom=a.y;
 a.vy+=GRAVITY*dt;a.x+=a.vx*dt;a.x=clamp(a.x,24,level.length-25);
 // Horizontal walls only apply to floor cliffs, not pass-through ledges.
 for(const s of level.floors){if(oldY>s.y+5&&a.y-a.h<s.y+s.h&&a.x+a.w/2>s.x&&a.x-a.w/2<s.x+s.w){if(oldX+a.w/2<=s.x)a.x=s.x-a.w/2;else if(oldX-a.w/2>=s.x+s.w)a.x=s.x+s.w+a.w/2;}}
 a.y+=a.vy*dt;a.onGround=false;
 if(a.vy>=0)for(const s of level.solids){if(oldBottom<=s.y+4&&a.y>=s.y&&a.x+a.w*.4>s.x&&a.x-a.w*.4<s.x+s.w){a.y=s.y;a.vy=0;a.onGround=true;break;}}
 a.walk+=Math.abs(a.x-oldX);
 return Math.abs(a.x-oldX);
}
function updatePlayer(dt){
 player.fire=Math.max(0,player.fire-dt);player.shot=Math.max(0,player.shot-dt);player.hurt=Math.max(0,player.hurt-dt);player.invincible=Math.max(0,player.invincible-dt);player.melee=Math.max(0,player.melee-dt);player.meleeCd=Math.max(0,player.meleeCd-dt);player.grenadeCd=Math.max(0,player.grenadeCd-dt);
 player.crouch=(held('KeyS')||held('ArrowDown'))&&player.onGround;player.h=player.crouch?104:140;
 const direction=(held('KeyD')||held('ArrowRight')?1:0)-(held('KeyA')||held('ArrowLeft')?1:0);
 const target=direction*(player.crouch?95:285);player.vx+=(target-player.vx)*Math.min(1,dt*19);if(Math.abs(player.vx)<.5)player.vx=0;
 if(direction&&!pointer.down&&!held('KeyJ'))player.dir=direction;
 player.coyote=player.onGround?.11:Math.max(0,player.coyote-dt);player.jumpBuffer=Math.max(0,player.jumpBuffer-dt);
 if(player.jumpBuffer>0&&player.coyote>0){player.vy=-748;player.onGround=false;player.coyote=0;player.jumpBuffer=0;player.crouch=false;player.h=140;tone(140,.055,.025,'triangle',100);}
 const travel=moveActor(player,dt);if(travel<.01)player.walk=Math.round(player.walk/40)*40;
 if(player.y>GROUND+420){hurtPlayer(1000);return;}
 if((pointer.down||held('KeyJ'))&&mode==='playing')fire();
 if(reload){reload.time+=dt;if(reload.time>=reload.duration)finishReload();}
 if(player.regen>0)player.regen-=dt;else if(player.health<60)player.health=Math.min(60,player.health+6*dt);
 for(let i=1;i<level.checkpoints.length;i++){const cp=level.checkpoints[i];if(player.x>cp&&checkpoint<cp){checkpoint=cp;checkpointScore=score;checkpointKills=totalKills;player.health=Math.max(player.health,80);notify('CHECKPOINT REACHED',1.6);sound('pickup');}}
 const nearBeacon=player.x>level.beacon-135;
 if(nearBeacon){
  const guards=enemies.filter(e=>!e.dead&&e.x>level.beacon-840&&Math.abs(e.x-player.x)<1000);
  if(!guards.length){score+=1000+Math.floor(player.health)*5;level.cleared=true;outcome(true);}
 }
}
function updateEnemies(dt){
 for(const e of enemies){
  if(e.dead)continue;
  if(Math.abs(e.x-player.x)>viewW+900)continue;
  e.hurt=Math.max(0,e.hurt-dt);e.attack=Math.max(0,e.attack-dt);e.fire-=dt;
  const dx=player.x-e.x,dy=player.y-e.y,ad=Math.abs(dx);
  if(ad<830&&Math.abs(dy)<240)e.alert=true;
  e.dir=dx>=0?1:-1;e.vx=0;
  if(e.alert&&Math.abs(dy)<330){
   if(e.type==='wretch'){
    e.vx=e.dir*(170+levelIndex*12);
    if(!hasFloor(e.x+e.dir*38,e.y,100)&&e.onGround){if(ad<290){e.vy=-540;e.onGround=false;}else e.vx=0;}
    if(ad<235&&ad>110&&e.onGround&&e.fire<0){e.vy=-435;e.fire=1.5;e.attack=.25;}
    if(ad<50&&Math.abs(dy)<75&&e.fire<.7){e.attack=.28;e.fire=1.2;hurtPlayer(17+levelIndex*2);}
   }else{
    const coverBetween=props.some(p=>p.state<2&&p.x>Math.min(e.x,player.x)&&p.x<Math.max(e.x,player.x)&&p.h>=60);
    if(ad>480||coverBetween&&ad>150)e.vx=e.dir*(61+levelIndex*7);
    if(!hasFloor(e.x+e.dir*30,e.y,70))e.vx=0;
    if(ad<735&&Math.abs(dy)<220&&e.fire<=0){
     e.vx=0;e.attack=.14;e.burst++;
     e.fire=e.burst%3===0?1.4-levelIndex*.12:.2;
     const y=e.y-96,tx=player.x+rand(-19,19),ty=player.y-(player.crouch?126:100)+rand(-12,12),a=Math.atan2(ty-y,tx-e.x);
     bullets.push({x:e.x+e.dir*70,y,px:e.x+e.dir*70,py:y,vx:Math.cos(a)*(490+levelIndex*25),vy:Math.sin(a)*(490+levelIndex*25),life:1.7,damage:9+levelIndex*1.3,owner:'enemy',color:'#fa9160'});sound('enemy');
    }
   }
  }
  if(e.type==='drone'&&e.attack>0)e.vx=0;
  moveActor(e,dt);if(e.y>GROUND+430){damageEnemy(e,1000);}
 }
}
function updateBullets(dt){
 for(const b of bullets){
  b.life-=dt;if(b.life<=0)continue;b.px=b.x;b.py=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;
  let hit=null,best=2;
  const targets=b.owner==='player'?enemies.filter(e=>!e.dead).map(e=>({obj:e,kind:'enemy',rect:actorBox(e)})):[{obj:player,kind:'player',rect:actorBox(player)}];
  for(const p of props)if(p.state<2)targets.push({obj:p,kind:'prop',rect:{x:p.x-p.w/2,y:p.y-p.h,w:p.w,h:p.h}});
  for(const s of level.solids)targets.push({obj:s,kind:'solid',rect:s});
  for(const q of targets){const u=lineRect(b.px,b.py,b.x,b.y,q.rect);if(u!==null&&u<best){best=u;hit=q;}}
  if(hit){b.x=b.px+(b.x-b.px)*best;b.y=b.py+(b.y-b.py)*best;b.life=0;
   if(hit.kind==='enemy')damageEnemy(hit.obj,b.damage);
   else if(hit.kind==='player')hurtPlayer(b.damage);
   else if(hit.kind==='prop')damageProp(hit.obj,b.owner==='enemy'?b.damage*.5:b.damage);
   else sparks(b.x,b.y,3,THEMES[levelIndex].edge);
  }
 }
 bullets=bullets.filter(b=>b.life>0);
}
function updateGrenades(dt){
 for(const g of grenades){
  const oldY=g.y;g.vy+=GRAVITY*.7*dt;g.x+=g.vx*dt;g.y+=g.vy*dt;g.fuse-=dt;
  for(const s of level.solids)if(g.vy>0&&oldY<=s.y&&g.y>=s.y&&g.x>s.x&&g.x<s.x+s.w){g.y=s.y-3;g.vy=-Math.abs(g.vy)*.34;g.vx*=.61;g.bounces++;if(g.bounces>3)g.vy=0;}
  if(g.fuse<=0)explosion(g.x,g.y-8);
 }
 grenades=grenades.filter(g=>g.fuse>0);
}
function hazardActive(h){if(h.type==='pool')return true;return (t+h.phase)%(h.type==='mortar'?4.1:3.5)>(h.type==='mortar'?3.5:2.05);}
function updateHazards(dt){
 for(const h of hazards){
  const active=hazardActive(h);
  if(active&&Math.abs(player.x-h.x)<h.w/2+player.w/2&&player.y>h.y-(h.type==='steam'?95:23)&&player.y<=h.y+20)hurtPlayer(h.type==='mortar'?20:7);
  if(active&&Math.random()<dt*40){const col=h.type==='steam'?'#c5afa0':THEMES[levelIndex].accent;particle(h.x+rand(-h.w/2,h.w/2),h.y-3,rand(-20,20),h.type==='steam'?rand(-190,-60):rand(-90,-35),rand(.22,.5),col,rand(2,6),100);}
  if(h.type==='mortar'){
   const cy=Math.floor((t+h.phase)/4.1);
   if(active&&h.cycle!==cy){h.cycle=cy;shake=Math.max(shake,6);noise(.3,.13,500);sparks(h.x,h.y-10,20,'#e87649');}
  }
 }
}
function updatePickups(dt){
 for(const p of pickups){
  p.time+=dt;
  if(Math.abs(p.x-player.x)<43&&Math.abs(p.y-(player.y-player.h*.5))<65){
   if(p.type==='health'){player.health=Math.min(100,player.health+35);notify('+35 HEALTH',.8);}
   if(p.type==='ammo'){WEAPONS[0].reserve=Math.min(600,WEAPONS[0].reserve+60);WEAPONS[1].reserve=Math.min(96,WEAPONS[1].reserve+8);notify('AMMO REPLENISHED',.8);}
   if(p.type==='grenade'){player.grens=Math.min(6,player.grens+2);notify('+2 FRAG GRENADES',.8);}
   p.collected=true;sound('pickup');score+=25;
  }
 }
 pickups=pickups.filter(p=>!p.collected);
}
function updateParticles(dt){
 for(const p of particles){p.life-=dt;p.vy+=p.gravity*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;}
 particles=particles.filter(p=>p.life>0).slice(-400);
 for(const c of corpses)c.time-=dt;corpses=corpses.filter(c=>c.time>0);
}
function update(dt){
 t+=dt;
 if(mode!=='playing')return;
 elapsed+=dt;updatePlayer(dt);if(mode!=='playing')return;updateEnemies(dt);updateBullets(dt);if(mode!=='playing')return;updateGrenades(dt);updateHazards(dt);updatePickups(dt);updateParticles(dt);
 for(const p of props)p.hit=Math.max(0,p.hit-dt);
 shake=Math.max(0,shake-dt*28);flash=Math.max(0,flash-dt);
 const target=clamp(player.x-viewW*(player.dir===1?.32:.60),0,Math.max(0,level.length-viewW));
 camera.x+=(target-camera.x)*(1-Math.exp(-dt*5));
 if(toastTime>0){toastTime-=dt;if(toastTime<=0)document.getElementById('toast')?.classList.remove('show');}
 hudTimer-=dt;if(hudTimer<0){hudTimer=.065;updateHUD();}
}
function updateHUD(){
 if(mode!=='playing'||!player)return;
 const w=WEAPONS[weapon],h=Math.ceil(player.health),el=id=>document.getElementById(id);
 if(!el('ammo'))return;
 el('health-text').textContent=h;el('health-bar').style.width=h+'%';el('health-track').classList.toggle('low',h<35);
 el('score').textContent=String(score).padStart(6,'0');el('frags').textContent='FRAGS '+String(player.grens).padStart(2,'0');
 el('weapon-name').textContent=w.name+(boost>1?' +':'');el('ammo').innerHTML='<span style="color:'+(w.ammo<5?'#ed614a':'inherit')+'">'+String(w.ammo).padStart(2,'0')+'</span> <small>/ '+w.reserve+'</small>';
 const guards=enemies.filter(e=>!e.dead&&e.x>level.beacon-840);
 el('objective').textContent=player.x>level.beacon-650&&guards.length?'CLEAR THE BEACON · '+guards.length+' LEFT':Math.max(0,Math.ceil((level.beacon-player.x)/10))+' M TO BEACON';
 el('reload-wrap').style.display=reload?'block':'none';
 if(reload){el('reload-cursor').style.left=clamp(reload.time/reload.duration*100,0,100)+'%';el('reload-label').textContent=reload.jam?'WEAPON JAMMED':'ACTIVE RELOAD';}
}
function pano(img,y,h,factor,cam=0){
 if(!img)return;
 const w=h*img.width/img.height,offset=((cam*factor)%(w*2)+w*2)%(w*2);
 for(let x=-offset;x<viewW+w;x+=w*2){ctx.drawImage(img,Math.floor(x),Math.floor(y),Math.ceil(w),Math.ceil(h));ctx.save();ctx.translate(Math.floor(x+w*2),0);ctx.scale(-1,1);ctx.drawImage(img,0,Math.floor(y),Math.ceil(w),Math.ceil(h));ctx.restore();}
}
function drawBackground(theme,cam,menuScene=false){
 const base=GROUND-camera.y;
 ctx.fillStyle=theme.sky;ctx.fillRect(0,0,viewW,viewH);
 pano(assets[theme.id+'-far'],0,Math.max(base+15,470),.08,cam);
 pano(assets[theme.id+'-mid'],base-420,450,.30,cam);
 pano(assets[theme.id+'-near'],base-320,340,.62,cam);
 ctx.fillStyle=theme.bottom;ctx.fillRect(0,base+30,viewW,viewH-base);
 // Atmosphere is world-independent and stays behind all gameplay actors.
 if(theme.id==='aqueduct'){
  ctx.strokeStyle='#bfd8dc';ctx.globalAlpha=.24;ctx.lineWidth=1;
  for(let i=0;i<54;i++){const x=((i*181.73-t*95)%viewW+viewW)%viewW,y=(i*113.79+t*570)%viewH;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-8,y+23);ctx.stroke();}ctx.globalAlpha=1;
 }else{
  for(let i=0;i<32;i++){const x=((i*137.72-t*(8+i%8))%viewW+viewW)%viewW,y=(i*97.51+t*(8+i%9))%Math.max(base,1);ctx.fillStyle=i%5===0?theme.accent:'#a29c90';ctx.globalAlpha=i%5===0?.65:.23;ctx.fillRect(Math.round(x),Math.round(y),i%5===0?3:2,2);}ctx.globalAlpha=1;
 }
 if(!menuScene){const shade=ctx.createLinearGradient(0,0,0,165);shade.addColorStop(0,'#090d16a8');shade.addColorStop(1,'#090d1600');ctx.fillStyle=shade;ctx.fillRect(0,0,viewW,165);}
}
function sprite(id,frame,x,y,size,dir=1){
 const img=assets[id];if(!img)return;
 const meta=assets.catalog?.actors?.[id]||{cols:3,rows:2,frameWidth:512,frameHeight:512,anchorX:256,anchorY:492};
 const sw=meta.frameWidth,sh=meta.frameHeight,frameX=(frame%meta.cols)*sw,frameY=Math.floor(frame/meta.cols)*sh;
 const ratio=size/sh,anchor=meta.anchors?.[frame]||[meta.anchorX,meta.anchorY];
 ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(dir,1);
 ctx.drawImage(img,frameX,frameY,sw,sh,Math.round(-anchor[0]*ratio),Math.round(-anchor[1]*ratio),Math.round(sw*ratio),Math.round(size));ctx.restore();
}
function propSprite(p){
 const img=assets[level.id+'-prop'];if(!img)return;
 const meta=assets.catalog?.props?.[level.id]||{cols:3,frameWidth:512,frameHeight:256,anchorX:256,anchorY:248};
 const sh=meta.frameHeight,sw=meta.frameWidth,size=levelIndex===0?105:(levelIndex===1?137:128),ratio=size/sh;
 const anchor=meta.anchors?.[p.state]||[meta.anchorX,meta.anchorY];
 if(p.state<2){ctx.fillStyle='#090c1080';ctx.beginPath();ctx.ellipse(p.x,p.y+1,p.w*.59,7,0,0,Math.PI*2);ctx.fill();}
 ctx.drawImage(img,p.state*sw,0,sw,sh,Math.round(p.x-anchor[0]*ratio),Math.round(p.y-anchor[1]*ratio),Math.round(sw*ratio),Math.round(size));
}
function drawTerrain(){
 const th=THEMES[levelIndex];
 for(const s of level.solids){
  if(s.x+s.w<camera.x-30||s.x>camera.x+viewW+30)continue;
  const depth=s.floor?Math.max(s.h,camera.y+viewH-s.y+20):s.h;
  ctx.fillStyle='#10171c';ctx.fillRect(s.x-2,s.y,s.w+4,depth);
  ctx.fillStyle=th.terrain;ctx.fillRect(s.x,s.y+5,s.w,depth-5);
  ctx.fillStyle=th.edge;ctx.fillRect(s.x,s.y,s.w,5);
  ctx.fillStyle='#0d151980';ctx.fillRect(s.x,s.y+16,s.w,4);
  ctx.fillStyle='#9aada015';ctx.fillRect(s.x+3,s.y+6,s.w-6,5);
  const unit=s.floor?112:86;
  for(let tx=s.x;tx<s.x+s.w;tx+=unit){
   const tw=Math.min(unit,s.x+s.w-tx);
   ctx.fillStyle='#10182070';ctx.fillRect(tx,s.y+6,2,depth-6);
   if(!s.floor){ctx.fillStyle=th.edge;ctx.fillRect(tx+Math.min(15,tw/2),s.y+13,4,4);}
   else{ctx.fillStyle='#10182038';ctx.beginPath();ctx.moveTo(tx+3,s.y+24);ctx.lineTo(tx+tw-10,s.y+24);ctx.lineTo(tx+tw-31,s.y+64);ctx.lineTo(tx+4,s.y+64);ctx.fill();}
  }
  if(!s.floor){ctx.fillStyle='#0b1119';ctx.fillRect(s.x,s.y+depth-5,s.w,5);}
 }
}
function drawPickups(){
 for(const p of pickups){
  if(p.x<camera.x-40||p.x>camera.x+viewW+40)continue;
  const yy=p.y+Math.sin(t*3+p.x)*3,col=p.type==='health'?'#b1debb':p.type==='ammo'?'#aed4e3':'#e8bf7c';
  ctx.fillStyle='#0b121c';ctx.fillRect(p.x-16,yy-16,32,32);ctx.strokeStyle=col;ctx.lineWidth=2;ctx.strokeRect(p.x-15,yy-15,30,30);
  ctx.fillStyle=col;
  if(p.type==='health'){ctx.fillRect(p.x-3,yy-9,6,18);ctx.fillRect(p.x-9,yy-3,18,6);}
  if(p.type==='ammo'){for(let i=0;i<3;i++){ctx.fillRect(p.x-9+i*7,yy-5,4,14);ctx.beginPath();ctx.moveTo(p.x-9+i*7,yy-6);ctx.lineTo(p.x-7+i*7,yy-11);ctx.lineTo(p.x-5+i*7,yy-6);ctx.fill();}}
  if(p.type==='grenade'){ctx.fillRect(p.x-6,yy-6,12,15);ctx.fillRect(p.x-3,yy-11,6,4);}
 }
}
function drawHazards(){
 for(const h of hazards){
  if(h.x<camera.x-120||h.x>camera.x+viewW+120)continue;
  const active=hazardActive(h),col=THEMES[levelIndex].accent;
  ctx.fillStyle='#101820';ctx.fillRect(h.x-h.w/2,h.y-3,h.w,7);
  if(h.type==='steam'){
   ctx.fillStyle='#9c7154';for(let n=0;n<6;n++)ctx.fillRect(h.x-h.w/2+n*13,h.y-2,6,3);
   if(!active){ctx.fillStyle='#eea354';ctx.fillRect(h.x-2,h.y-5,4,4);}
  }else if(h.type==='shock'){
   ctx.strokeStyle=active?'#bcffff':'#608798';ctx.lineWidth=active?3:1;ctx.beginPath();ctx.moveTo(h.x-h.w/2,h.y-2);for(let n=0;n<=8;n++)ctx.lineTo(h.x-h.w/2+n*h.w/8,h.y-2+(n%2===0?-5:2)*(active?1:0));ctx.stroke();
  }else if(h.type==='pool'){
   ctx.fillStyle='#d99136';ctx.fillRect(h.x-h.w/2,h.y-2,h.w,5);ctx.fillStyle='#fce18c';for(let n=0;n<6;n++)ctx.fillRect(h.x-h.w/2+(n*17+t*7)%h.w,h.y-3,9,2);
  }else{
   const phase=(t+h.phase)%4.1;
   if(phase>2.5){ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(h.x,h.y-3,h.w*.5,8,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle=col;ctx.font='12px Russo';ctx.textAlign='center';ctx.fillText('INCOMING',h.x,h.y-70);ctx.fillRect(h.x-1,h.y-51,2,32);}
  }
 }
}
function drawBeacon(){
 const x=level.beacon,y=GROUND;
 ctx.fillStyle='#0b151d';ctx.fillRect(x-22,y-12,44,12);ctx.fillStyle='#98cfc7';ctx.fillRect(x-13,y-8,26,5);
 ctx.fillStyle='#20343c';ctx.fillRect(x-7,y-123,14,111);ctx.fillStyle='#b5ece0';ctx.fillRect(x-3,y-124,6,109);
 ctx.strokeStyle='#a8dfd8';ctx.lineWidth=2;ctx.save();ctx.translate(x,y-153+Math.sin(t*2)*4);ctx.rotate(Math.PI/4);ctx.strokeRect(-14,-14,28,28);ctx.restore();
 const guards=enemies.filter(e=>!e.dead&&e.x>level.beacon-840);
 ctx.fillStyle=guards.length?'#f3c48f':'#c5eee4';ctx.textAlign='center';ctx.font='13px Russo';ctx.fillText(guards.length?'CLEAR THE AREA':'EXTRACTION',x,y-195);
}
function drawActors(){
 for(const c of corpses){if(c.x<camera.x-150||c.x>camera.x+viewW+150)continue;sprite(c.type==='drone'?'drone':'wretch',5,c.x,c.y,c.type==='drone'?176:143,c.dir);}
 for(const e of enemies){
  if(e.dead||e.x<camera.x-160||e.x>camera.x+viewW+160)continue;
  ctx.fillStyle='#060d1370';ctx.beginPath();ctx.ellipse(e.x,e.y+1,e.type==='drone'?30:33,5,0,0,Math.PI*2);ctx.fill();
  const frame=e.hurt>0?4:e.attack>0?3:Math.abs(e.vx)>8&&e.onGround?1+Math.floor(e.walk/34)%2:0;
  sprite(e.type,frame,e.x,e.y,e.type==='drone'?176:143,e.dir);
  if(e.health<e.maxHealth){const sy=e.y-(e.type==='drone'?139:83);ctx.fillStyle='#111720';ctx.fillRect(e.x-22,sy,44,4);ctx.fillStyle=e.elite?'#ffb46d':'#d16853';ctx.fillRect(e.x-22,sy,44*e.health/e.maxHealth,4);}
  if(e.type==='drone'&&e.attack>.075)drawMuzzle(e.x+e.dir*70,e.y-96,e.dir,.6,'#fca465');
 }
 ctx.fillStyle='#050b127a';ctx.beginPath();ctx.ellipse(player.x,player.y+2,34,5,0,0,Math.PI*2);ctx.fill();
 const pf=player.crouch?4:player.melee>0?3:Math.abs(player.vx)>10&&player.onGround?1+Math.floor(player.walk/37)%2:player.shot>0?3:0;
 if(!(player.invincible>0&&Math.floor(t*35)%3===0))sprite('cog',pf,player.x,player.y,185,player.dir);
 if(player.shot>0)drawMuzzle(player.x+player.dir*74,player.y-playerGunHeight(),player.dir,weapon===1?1.5:1,boost>1?'#d7fff0':'#ffe0a2');
 if(player.melee>0){ctx.strokeStyle='#b1dfe4';ctx.lineWidth=3;const sx=player.x+player.dir*62;for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(sx-10,player.y-48+i*4);ctx.lineTo(sx+player.dir*25,player.y-56+i*4);ctx.stroke();}}
}
function drawMuzzle(x,y,dir,size,col){
 ctx.save();ctx.translate(x,y);ctx.scale(dir*size,size);ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(0,-3);ctx.lineTo(11,-8);ctx.lineTo(8,-2);ctx.lineTo(25,0);ctx.lineTo(8,4);ctx.lineTo(11,10);ctx.lineTo(0,4);ctx.closePath();ctx.fill();ctx.restore();
}
function drawProjectiles(){
 ctx.lineCap='round';
 for(const b of bullets){ctx.strokeStyle=b.color;ctx.lineWidth=b.owner==='player'?2.8:3.3;ctx.beginPath();ctx.moveTo(b.x-b.vx*.016,b.y-b.vy*.016);ctx.lineTo(b.x,b.y);ctx.stroke();}
 for(const g of grenades){ctx.save();ctx.translate(g.x,g.y);ctx.rotate(t*8);ctx.fillStyle='#202c31';ctx.fillRect(-6,-7,12,14);ctx.strokeStyle='#c1c7a1';ctx.lineWidth=2;ctx.strokeRect(-6,-7,12,14);ctx.fillStyle=g.fuse<.4?'#f8663b':'#e2c26e';ctx.fillRect(-2,-3,4,6);ctx.restore();}
 for(const p of particles){ctx.fillStyle=p.color;ctx.globalAlpha=Math.min(1,p.life/p.maxLife*2);ctx.fillRect(Math.round(p.x),Math.round(p.y),p.size,p.size);}ctx.globalAlpha=1;
}
function drawCrosshair(){
 if(isTouch||!pointer.active||mode!=='playing')return;
 const x=pointer.x/scale,y=pointer.y/scale;
 ctx.strokeStyle='#eff7eb';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-12,y);ctx.lineTo(x-5,y);ctx.moveTo(x+5,y);ctx.lineTo(x+12,y);ctx.moveTo(x,y-12);ctx.lineTo(x,y-5);ctx.moveTo(x,y+5);ctx.lineTo(x,y+12);ctx.stroke();
}
function drawMenu(){
 camera.y=GROUND-viewH*.81;const th=THEMES[save.level||0],cam=200+t*11;
 drawBackground(th,cam,true);
 const ground=GROUND-camera.y;
 ctx.fillStyle=th.terrain;ctx.fillRect(0,ground,viewW,viewH-ground);ctx.fillStyle=th.edge;ctx.fillRect(0,ground,viewW,4);
 // The character stays proportional and deliberately occupies the open side of the menu.
 const px=viewW*(width<530?.83:.76),heroSize=Math.min(viewH*.78,viewW*.57);
 ctx.fillStyle='#070e1699';ctx.beginPath();ctx.ellipse(px,ground+10,heroSize*.24,heroSize*.033,0,0,Math.PI*2);ctx.fill();
 sprite('cog',0,px,ground+10,heroSize,-1);
 if(width>700)sprite('drone',0,viewW*.94,ground+10,heroSize*.43,-1);
 const grad=ctx.createLinearGradient(0,ground-40,0,viewH);grad.addColorStop(0,'#08121b00');grad.addColorStop(1,'#08121be6');ctx.fillStyle=grad;ctx.fillRect(0,ground-40,viewW,viewH-ground+40);
}
function render(){
 ctx.setTransform(dpr*scale,0,0,dpr*scale,0,0);ctx.imageSmoothingEnabled=false;
 if(mode==='menu'||mode==='how'||mode==='loading'||!player){drawMenu();return;}
 const th=THEMES[levelIndex];camera.y=GROUND-viewH*(isTouch?.70:.79);drawBackground(th,camera.x);
 ctx.save();ctx.translate(Math.round(-camera.x+(shake?rand(-shake,shake):0)),Math.round(-camera.y+(shake?rand(-shake*.6,shake*.6):0)));
 drawTerrain();drawHazards();
 for(const p of props)if(p.x>camera.x-200&&p.x<camera.x+viewW+200)propSprite(p);
 drawBeacon();drawPickups();drawActors();drawProjectiles();ctx.restore();drawCrosshair();
 if(player.health<35&&mode==='playing'){const v=ctx.createRadialGradient(viewW/2,viewH/2,viewH*.28,viewW/2,viewH/2,Math.max(viewH,viewW)*.65);v.addColorStop(0,'#8d1d1900');v.addColorStop(1,'#8d1d1958');ctx.fillStyle=v;ctx.fillRect(0,0,viewW,viewH);}
 if(flash>0){ctx.fillStyle='rgba(186,50,33,'+(flash*.5)+')';ctx.fillRect(0,0,viewW,viewH);}
}
function tick(now){
 const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;accumulator+=dt;
 while(accumulator>=1/120){update(1/120);accumulator-=1/120;}
 render();requestAnimationFrame(tick);
}
function action(name){
 initAudio();
 if(name==='start')startCampaign(0);
 else if(name==='continue')startCampaign(save.level);
 else if(name==='menu')menu();
 else if(name==='how')how();
 else if(name==='pause')pause();
 else if(name==='resume')resume();
 else if(name==='restart')restartCheckpoint();
 else if(name==='next')nextLevel();
 else if(name==='jump')jump();
 else if(name==='reload')startReload();
 else if(name==='melee')chainsaw();
 else if(name==='grenade')throwGrenade();
 else if(name==='switch')changeWeapon(1-weapon);
 else if(name==='audio'){muted=!muted;try{localStorage.setItem('emberline-muted',muted?'1':'0');}catch(e){}document.querySelectorAll('[data-action="audio"]').forEach(b=>{b.innerHTML=icons[muted?'mute':'sound'];b.setAttribute('aria-label',muted?'Enable sound':'Mute sound');});}
 else if(name==='fullscreen'){
  try{if(document.fullscreenElement)document.exitFullscreen()?.catch(()=>{});else document.documentElement.requestFullscreen?.().catch(()=>{});}catch(e){}
 }
}
ui.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b&&!b.closest('.touch-controls'))action(b.dataset.action);});
ui.addEventListener('pointerdown',e=>{
 const b=e.target.closest('.touch-btn');if(!b)return;e.preventDefault();initAudio();
 if(b.dataset.key){touch[b.dataset.key]=true;b.classList.add('held');try{b.setPointerCapture(e.pointerId);}catch(err){}}
 else if(b.dataset.action)action(b.dataset.action);
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])ui.addEventListener(type,e=>{const b=e.target.closest('.touch-btn');if(b?.dataset.key){touch[b.dataset.key]=false;b.classList.remove('held');}});
canvas.addEventListener('pointerdown',e=>{if(mode!=='playing')return;initAudio();if(e.pointerType!=='mouse'){isTouch=true;document.body.classList.add('is-touch');return;}pointer.x=e.clientX;pointer.y=e.clientY;pointer.down=true;pointer.active=true;try{canvas.setPointerCapture(e.pointerId);}catch(err){}});
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){pointer.x=e.clientX;pointer.y=e.clientY;pointer.active=true;}});
canvas.addEventListener('pointerup',()=>pointer.down=false);canvas.addEventListener('pointercancel',()=>pointer.down=false);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{
 if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
 const fresh=!keys[e.code];keys[e.code]=true;if(!fresh)return;
 if(e.code==='Escape'||e.code==='KeyP'){if(mode==='playing')pause();else if(mode==='paused')resume();return;}
 if(e.code==='Enter'&&mode==='menu'){startCampaign(save.level);return;}
 if(mode!=='playing')return;initAudio();
 if(['Space','KeyW','ArrowUp'].includes(e.code))jump();
 else if(e.code==='KeyR')startReload();
 else if(e.code==='KeyE')chainsaw();
 else if(e.code==='KeyQ')throwGrenade();
 else if(e.code==='Digit1')changeWeapon(0);
 else if(e.code==='Digit2')changeWeapon(1);
});
window.addEventListener('keyup',e=>keys[e.code]=false);
window.addEventListener('blur',()=>{clearInputs();pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();pause();}});
window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);document.addEventListener('fullscreenchange',resize);
function status(){return {mode,district:levelIndex+1,districtName:THEMES[levelIndex].name,health:player?Math.ceil(player.health):100,weapon:WEAPONS[weapon].name,ammo:WEAPONS[weapon].ammo,score,kills:totalKills,checkpoint,unlockedDistrict:save.level+1};}
function registerAgentTools(){
 const mc=document.modelContext;if(!mc?.registerTool)return;const lifecycle=new AbortController();
 const specs=[
 {name:'read_campaign_status',description:'Read the current district, health, weapon, score, and campaign state.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>status()},
 {name:'start_campaign',description:'Start a new Emberline campaign or continue from the unlocked district. Replaces any current run.',inputSchema:{type:'object',properties:{continue:{type:'boolean'}},additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||typeof input!=='object'||Object.keys(input).some(k=>k!=='continue')||(input.continue!==undefined&&typeof input.continue!=='boolean'))throw new Error('Expected an optional boolean continue value');if(mode==='loading')throw new Error('Game artwork is still loading');startCampaign(input.continue?save.level:0);return status();}},
 {name:'set_campaign_paused',description:'Pause or resume the current game using the same controls as the pause menu.',inputSchema:{type:'object',properties:{paused:{type:'boolean'}},required:['paused'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||typeof input.paused!=='boolean'||Object.keys(input).some(k=>k!=='paused'))throw new Error('paused must be a boolean');if(input.paused){if(mode!=='playing'&&mode!=='paused')throw new Error('No active campaign');pause();}else{if(mode!=='paused'&&mode!=='playing')throw new Error('No paused campaign');resume();}return status();}}
 ];for(const spec of specs)try{Promise.resolve(mc.registerTool(spec,{signal:lifecycle.signal})).catch(()=>{});}catch(e){}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
async function load(){
 menu(true);
 const files=['cog','drone','wretch',...THEMES.flatMap(th=>['far','mid','near','prop'].map(layer=>th.id+'-'+layer))];
 const total=files.length+2;
 const progress=()=>{loaded++;const pct=Math.round(loaded/total*100);const label=document.getElementById('load-percent');if(label)label.textContent=pct+'%';};
 const errors=[];
 await Promise.all(files.map(id=>new Promise(resolve=>{const img=new Image();img.onload=()=>{assets[id]=img;progress();resolve();};img.onerror=()=>{errors.push(id);progress();resolve();};img.src='assets/'+id+'.png';})));
 try{const response=await fetch('assets/catalog.json');if(!response.ok)throw new Error('catalog missing');assets.catalog=await response.json();}catch(e){errors.push('catalog');}progress();
 try{await document.fonts.load('16px Russo');}catch(e){}progress();
 if(errors.length){assetError=true;ui.innerHTML='<section class="screen overlay"><div class="menu-content"><p class="eyebrow">LOAD ERROR</p><h2>SUPPLY LINE INTERRUPTED</h2><p class="brief">Some game files could not load.</p><div class="actions"><button class="primary" id="retry-loading">RETRY LOADING</button>'+moreGames()+'</div></div></section>';document.getElementById('retry-loading').onclick=()=>location.reload();return;}
 menu();registerAgentTools();
}
resize();load();lastTime=performance.now();requestAnimationFrame(tick);
