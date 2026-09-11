import {HighwayGame,clamp} from './game-model.js';
import {STORAGE_KEY,CARS,getCar,normalizeProgress,createChallenge,carUnlocked,nextCar,selectCar,recordChallenge} from './game-progress.js';
import {RoadRenderer} from './road-renderer.js';
import {GameAudio} from './audio.js';

const $=id=>document.getElementById(id);
const root=$('game'),canvas=$('world'),fx=$('effects'),ctx=fx.getContext('2d');
const model=new HighwayGame();
let saved=normalizeProgress();try{saved=normalizeProgress(JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'));}catch{}
let runUnlocks=[],unlockQueue=[],unlockReturnScreen=null;
const audio=new GameAudio(saved.muted),keys=new Set();let world,ready=false,lastTime=0,screen='menu',drag=null,touchSteer=0,calloutTimer=0,levelBannerTimer=0,crashTimer=0,particles=[],flash=0,flashColor='#fff',endShown=false,contextLost=false,lastUI=0;
let touch=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;
const pickupNames=['SHIELD READY','FOCUS','NITRO +45','SCORE ×2'],pickupColors=['#3aeaff','#cc85ff','#ffb256','#ffdb6d'];

function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(saved));}catch{}}
function garageProgress(){const car=nextCar(saved);return car?`NEXT: ${car.name.toUpperCase()} · ${saved.completedChallenges} / ${car.challenges} CHALLENGES`:`ALL CARS UNLOCKED · ${saved.completedChallenges} CHALLENGES COMPLETE`;}
function updateRecords(){
 $('menu-best').textContent=Math.floor(saved.best).toLocaleString();$('menu-distance').textContent=(saved.distance/1000).toFixed(2)+' km';$('hud-best').textContent=Math.floor(saved.best).toLocaleString();
 document.querySelectorAll('[data-car]').forEach(b=>{
  const car=getCar(b.dataset.car),unlocked=carUnlocked(saved,car.id),selected=car.id===saved.car;
  b.classList.toggle('locked',!unlocked);b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));b.setAttribute('aria-disabled',String(!unlocked));
  const progress=`${Math.min(saved.completedChallenges,car.challenges)} / ${car.challenges} CHALLENGES`;
  b.querySelector('.car-state').textContent=selected?'SELECTED':unlocked?'SELECT':'LOCKED';b.querySelector('.car-unlock').textContent=unlocked?(car.challenges?'UNLOCKED':'STARTER CAR'):progress;
  b.querySelector('.car-unlock-track i').style.width=`${unlocked?100:saved.completedChallenges/car.challenges*100}%`;
  b.setAttribute('aria-label',`${car.name}, ${car.kind}, ${120+car.speedBonus} to ${280+car.speedBonus} km/h before Overdrive, ${Math.round(car.passBonus*100)} percent bonus near-miss and Overdrive pass points. ${selected?'Selected':unlocked?'Select car':`Locked: ${progress.toLowerCase()}`}.`);
 });
 $('garage-count').textContent=`${CARS.filter(car=>carUnlocked(saved,car.id)).length} / ${CARS.length} UNLOCKED`;
 $('menu-challenge').textContent=createChallenge(saved.completedChallenges).label;$('garage-progress').textContent=garageProgress();
}
function setScreen(name){screen=name;root.dataset.screen=name||'playing';for(const id of['menu','pause-screen','end-screen','help-screen','unlock-screen'])$(id).hidden=id!==name;$('hud').hidden=['menu','help-screen','unlock-screen'].includes(name);root.classList.toggle('playing',name!=='menu'&&name!=='help-screen');$('touch-controls').hidden=!touch||name!==null;if(name==='menu'||name==='end-screen'){levelBannerTimer=0;$('level-banner').classList.remove('show');}}
function showCallout(text,sub='',color='#fff',duration=1.4){$('callout').replaceChildren(document.createTextNode(text));if(sub){const s=document.createElement('small');s.textContent=sub;$('callout').appendChild(s);}$('callout').style.color=color;$('callout').classList.add('show');calloutTimer=duration;}
function clearInput(){keys.clear();drag=null;touchSteer=0;}
function startGame(){if(!ready||screen==='unlock-screen')return;if(model.mode==='crashed'&&!endShown){finishRun();if(screen==='unlock-screen')return;}clearInput();audio.unlock().then(()=>audio.play('start'));model.start(saved.completedChallenges,saved.car);runUnlocks=[];unlockQueue=[];unlockReturnScreen=null;particles=[];flash=0;endShown=false;crashTimer=0;levelBannerTimer=0;$('level-banner').classList.remove('show');world.shake=0;world.setCar(saved.car);setScreen(null);root.classList.remove('crashed');showCallout('LEVEL 1',`${model.car.name.toUpperCase()} · ${model.baseSpeed} KM/H`,'#fff',2.8);canvas.focus();updateHUD();}
function pauseGame(){if(!model.pause())return false;clearInput();setScreen('pause-screen');$('resume-button').focus();return true;}
function resumeGame(){if(screen==='unlock-screen'||!model.resume())return false;clearInput();audio.unlock();setScreen(null);canvas.focus();return true;}
function mainMenu(){model.reset(saved.car);world.setCar(saved.car);model.seedTraffic();model.playerX=2.7;clearInput();unlockQueue=[];unlockReturnScreen=null;particles=[];flash=0;endShown=false;root.classList.remove('crashed','boosting','focused');setScreen('menu');updateRecords();$('start-button').focus();}
function boost(){if(model.activateBoost()){audio.play('boost');showCallout('OVERDRIVE','DOUBLE POINTS · KEEP IT CLEAN','#42e9fa',1.6);return true;}return false;}
function openHelp(){if(!ready)return;setScreen('help-screen');$('help-close').focus();}
function closeHelp(){setScreen('menu');$('start-button').focus();}
function renderUnlockNotice(){
 const car=unlockQueue[0],inRun=model.mode==='paused';
 $('unlock-screen').style.setProperty('--car-accent',car.accent);$('unlock-name').textContent=car.name;$('unlock-kind').textContent=car.kind;
 $('unlock-speed').textContent=`+${car.speedBonus} KM/H`;$('unlock-bonus').textContent=`+${Math.round(car.passBonus*100)}% pass points`;$('unlock-earned').textContent=`${car.challenges} CHALLENGES COMPLETE`;
 $('unlock-note').textContent=inRun?'Race paused. Continue from this spot.':'Your new car is ready for the next run.';
 $('unlock-next').textContent=`NEXT CHALLENGE: ${model.challenge.label}`;$('unlock-equip-label').textContent=inRun?'DRIVE THIS CAR':'SELECT THIS CAR';
 $('unlock-keep').textContent=inRun?'Keep current car & resume':'Keep current car';world.drawGaragePreview($('unlock-preview'),car.id);$('unlock-equip').focus();
}
function showUnlockNotice(){
 if(!unlockQueue.length||screen==='unlock-screen')return;
 if(model.mode==='playing'){model.pause();unlockReturnScreen=null;}
 else if(model.mode==='paused')unlockReturnScreen='pause-screen';
 else if(model.mode==='crashed'&&endShown)unlockReturnScreen='end-screen';
 else return;
 clearInput();setScreen('unlock-screen');renderUnlockNotice();
}
function chooseUnlockedCar(equip){
 if(screen!=='unlock-screen'||!unlockQueue.length)return false;
 const car=unlockQueue[0];
 if(equip){
  if(!carUnlocked(saved,car.id)||(model.mode==='paused'&&!model.equipCar(car.id)))return false;
  selectCar(saved,car.id);world.setCar(car.id);persist();updateRecords();
 }
 unlockQueue.shift();
 if(unlockQueue.length){renderUnlockNotice();return true;}
 const destination=unlockReturnScreen;unlockReturnScreen=null;setScreen(destination);
 if(destination===null){resumeGame();if(equip)showCallout('CAR EQUIPPED',`${car.name.toUpperCase()} · +${car.speedBonus} KM/H`,car.accent,2);}
 else if(destination==='end-screen'){if(equip)$('end-tip').textContent=`${car.name} selected for your next run.`;$('restart-button').focus();}
 else $('resume-button').focus();
 updateHUD();return true;
}
function finishRun(){
 if(endShown)return;endShown=true;const previousBest=saved.best,points=Math.floor(model.score);
 saved.best=Math.max(saved.best,points);saved.distance=Math.max(saved.distance,model.distance);persist();updateRecords();
 $('end-score').textContent=points.toLocaleString();$('end-level').textContent=model.level;$('end-distance').textContent=(model.distance/1000).toFixed(2)+' km';$('end-misses').textContent=model.nearMisses;$('end-combo').textContent='×'+model.maxCombo;$('end-caption').textContent=points>previousBest?'A NEW PERSONAL BEST':'END OF THE ROAD';$('end-title').textContent=points>previousBest?'NEW RECORD':'WIPED OUT';
 const challenge=model.challenge,completed=model.runChallenges;$('end-challenge').textContent=completed?`${completed} CHALLENGE${completed===1?'':'S'} COMPLETE · +${completed*challenge.reward} POINTS`:`${challenge.label} · ${challenge.progress}/${challenge.target}`;$('end-challenge').classList.toggle('complete',completed>0);$('end-unlock').textContent=garageProgress();
 let tip='Watch the gaps ahead. You can brake with S or ↓.';
 if(model.nearMisses===0)tip='Pass close beside traffic to charge your Overdrive.';else if(model.charge>=60)tip='Boost through an open gap to earn points for every clean pass.';
 if(completed)tip=`${challenge.label} · ${challenge.progress}/${challenge.target} this run.`;
 if(runUnlocks.length)tip=`${runUnlocks.at(-1).name} ${saved.car===runUnlocks.at(-1).id?'selected for your next run':'unlocked in your garage'}!`;
 $('end-tip').textContent=tip;setScreen('end-screen');$('restart-button').focus();showUnlockNotice();
}

function burst(x,y,color,count=30){for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=80+Math.random()*330;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-90,life:.4+Math.random()*.6,max:1,size:1+Math.random()*3,color});}}
function handleEvents(){let challengePoints=0;for(const e of model.events.splice(0)){
 if(e.type==='level-up'){audio.play('level-up');$('level-banner-title').textContent=`LEVEL ${e.level}`;$('level-banner-detail').textContent=`${e.speed} KM/H · ${e.final?'MAXIMUM DIFFICULTY':e.level>=5?'MORE LANE CHANGES':'WATCH TURN SIGNALS'}`;$('level-banner').classList.add('show');levelBannerTimer=2.6;}
 if(e.type==='near-miss'||e.type==='needle'){audio.play(e.type);showCallout(e.type==='needle'?'THREAD THE NEEDLE':'NEAR MISS',`+${e.points} · ×${model.combo} COMBO`,e.type==='needle'?'#ffe093':'#fff');const p=world.project(model.playerX,1.1,0,model);burst(p.x+(e.x>model.playerX?50:-50),p.y,'#ffe6ac',9);}
 if(e.type==='boost-pass'&&calloutTimer<.4)showCallout('OVERDRIVE PASS',`+${e.points} POINTS`,'#53ecff',.8);
 if(e.type==='traffic-pattern')showCallout({weave:'TRAFFIC WEAVE',convoy:'TRUCK CONVOY',rush:'RUSH HOUR'}[e.pattern],'FOLLOW THE OPEN GAP','#ffd17b',1.8);
 if(e.type==='challenge-complete'){
  const wasUnlocked=CARS.filter(car=>carUnlocked(saved,car.id)).map(car=>car.id);
  if(recordChallenge(saved,e.challenge)){
   const unlocked=CARS.filter(car=>!wasUnlocked.includes(car.id)&&carUnlocked(saved,car.id));runUnlocks.push(...unlocked);unlockQueue.push(...unlocked);persist();updateRecords();challengePoints+=e.points;audio.play('level-up');
  }
 }
 if(e.type==='pickup'){audio.play('pickup');showCallout(pickupNames[e.pickup],e.pickup===0?'ONE COLLISION PROTECTED':e.pickup===1?'3 SECONDS':e.pickup===3?'8 SECONDS':'OVERDRIVE RECHARGED',pickupColors[e.pickup]);flash=.16;flashColor=pickupColors[e.pickup];const p=world.project(model.playerX,1.2,0,model);burst(p.x,p.y,pickupColors[e.pickup],26);}
 if(e.type==='shield-hit'){audio.play(e.type);showCallout('SHIELD BROKEN','KEEP DRIVING','#48edff');world.shake=.75;flash=.3;flashColor='#50e5ff';const p=world.project(model.playerX,1,0,model);burst(p.x,p.y,'#71f5ff',48);}
 if(e.type==='crash'){audio.play('crash');world.shake=1.4;flash=.65;flashColor='#ffbd95';crashTimer=0;clearInput();const p=world.project(model.playerX,1,0,model);burst(p.x,p.y,'#ffb14b',85);root.classList.add('crashed');$('touch-controls').hidden=true;}
 }if(challengePoints&&model.mode==='playing')showCallout('CHALLENGE COMPLETE',`+${challengePoints} · NEXT: ${model.challenge.label}`,'#ffd17b',2.8);showUnlockNotice();}
function updateHUD(){
 $('score').textContent=String(Math.floor(model.score)).padStart(6,'0');$('distance').textContent=(model.distance/1000).toFixed(2);$('speed').textContent=Math.round(model.speed);$('boost-fill').style.width=model.charge+'%';$('boost-button').classList.toggle('ready',model.charge>=30&&model.boost<=0);$('boost-button').disabled=model.mode!=='playing'||(model.charge<30&&model.boost<=0);$('boost-hint').textContent=model.boost>0?'OVERDRIVE ACTIVE':model.charge>=30?'SPACE / SHIFT':'NEAR MISS TO CHARGE';$('combo').firstChild.textContent='×'+model.combo+' ';
 const section=Math.floor(model.distance/1800)%3;$('district').textContent=['RIVERSIDE EXPRESSWAY','SKYLINE DISTRICT','DOWNTOWN NORTH'][section];
 $('level-label').textContent=`LEVEL ${model.level}`;$('next-level').textContent=model.distanceToNextLevel===null?'MAX LEVEL · ENDLESS':`${(model.distanceToNextLevel/1000).toFixed(2)} KM TO LEVEL ${model.level+1}`;$('level-fill').style.width=`${model.levelProgress*100}%`;$('level-progress').setAttribute('aria-valuenow',Math.round(model.levelProgress*100));$('level-progress').setAttribute('aria-valuetext',model.distanceToNextLevel===null?'Maximum level reached':`${Math.ceil(model.distanceToNextLevel)} meters to level ${model.level+1}`);
 const challenge=model.challenge;$('challenge-title').textContent=challenge.label;$('challenge-count').textContent=`${challenge.progress}/${challenge.target}`;$('challenge-label').textContent=`CHALLENGE ${challenge.sequence+1}`;$('run-challenge').classList.remove('complete');$('challenge-fill').style.width=`${challenge.progress/challenge.target*100}%`;$('challenge-progress').setAttribute('aria-valuenow',Math.round(challenge.progress/challenge.target*100));$('challenge-progress').setAttribute('aria-valuetext',`${challenge.label}: ${challenge.progress} of ${challenge.target}`);$('combo-fill').style.width=`${model.comboTimer/5.5*100}%`;$('combo-track').classList.toggle('active',model.combo>1);
 const statuses=[];if(model.shield)statuses.push(['SHIELD','#52eaff']);if(model.focus>0)statuses.push([`FOCUS ${Math.ceil(model.focus)}s`,'#cc8eff']);if(model.surge>0)statuses.push([`×2 ${Math.ceil(model.surge)}s`,'#ffdc77']);const key=statuses.map(x=>x[0]).join('|');if($('active-effects').dataset.key!==key){$('active-effects').dataset.key=key;$('active-effects').replaceChildren(...statuses.map(([text,color])=>{const el=document.createElement('span');el.className='effect-badge';el.style.color=color;el.textContent=text;return el;}));}
 root.classList.toggle('boosting',model.boost>0);root.classList.toggle('focused',model.focus>0);
}
function renderEffects(dt){
 const w=world.width,h=world.height;ctx.clearRect(0,0,w,h);
 if(model.boost>0){ctx.save();ctx.strokeStyle='#b4faff';ctx.lineWidth=1;for(let i=0;i<30;i++){const angle=(i/30)*Math.PI*2;const phase=(world.time*1.9+i*.173)%1;const r0=.30+phase*.45,r1=r0+.035+phase*.04;ctx.globalAlpha=.06+phase*.2;ctx.beginPath();ctx.moveTo(w*.5+Math.cos(angle)*w*r0,h*.40+Math.sin(angle)*h*r0);ctx.lineTo(w*.5+Math.cos(angle)*w*r1,h*.40+Math.sin(angle)*h*r1);ctx.stroke();}ctx.restore();
  const p=world.project(model.playerX,.25,0,model);ctx.save();ctx.globalCompositeOperation='lighter';for(const side of[-1,1]){const off=world.portrait?22:world.width*.033;const length=35+Math.random()*30;const grad=ctx.createLinearGradient(p.x+side*off,p.y,p.x+side*off,p.y+length);grad.addColorStop(0,'#dfffff');grad.addColorStop(.25,'#1bc7ff');grad.addColorStop(1,'#168cff00');ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(p.x+side*off-5,p.y);ctx.lineTo(p.x+side*off+5,p.y);ctx.lineTo(p.x+side*off+Math.random()*5,p.y+length);ctx.closePath();ctx.fill();}ctx.restore();
 }
 for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=200*dt;ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size*2,p.size);}ctx.globalAlpha=1;particles=particles.filter(p=>p.life>0);
 if(flash>0){flash=Math.max(0,flash-dt*2);ctx.globalAlpha=flash*.5;ctx.fillStyle=flashColor;ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;}
}
function resize(){if(!world)return;world.resize();const ratio=Math.min(window.devicePixelRatio||1,1.5);fx.width=Math.round(world.width*ratio);fx.height=Math.round(world.height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);}
function frame(now){requestAnimationFrame(frame);const dt=clamp((now-lastTime)/1000,0,.04);lastTime=now;if(!ready||contextLost)return;
 if(model.mode==='playing'){
  const steer=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0)+touchSteer;
  model.update(dt,{steer:clamp(steer,-1,1),targetX:drag?.targetX,brake:keys.has('ArrowDown')||keys.has('KeyS')});handleEvents();
 }else if(model.mode==='menu'){model.demo(dt);model.playerX=2.5+Math.sin(world.time*.2)*.22;}else if(model.mode==='crashed'){crashTimer+=dt;if(crashTimer>1.05)finishRun();}
 const animate=model.mode!=='paused';world.render(model,animate?dt:0);if(animate)renderEffects(dt);audio.update(model);
 if(calloutTimer>0&&model.mode!=='paused'){calloutTimer-=dt;if(calloutTimer<=0)$('callout').classList.remove('show');}
 if(levelBannerTimer>0&&model.mode==='playing'){levelBannerTimer-=dt;if(levelBannerTimer<=0)$('level-banner').classList.remove('show');}
 if(now-lastUI>70){lastUI=now;updateHUD();}
}

function bindControls(){
 $('start-button').onclick=startGame;$('restart-button').onclick=startGame;$('pause-restart').onclick=startGame;$('pause-button').onclick=pauseGame;$('resume-button').onclick=resumeGame;$('pause-menu').onclick=mainMenu;$('end-menu').onclick=mainMenu;$('help-button').onclick=openHelp;$('help-close').onclick=closeHelp;$('boost-button').onclick=boost;
 $('unlock-equip').onclick=()=>chooseUnlockedCar(true);$('unlock-keep').onclick=()=>chooseUnlockedCar(false);
 for(const link of document.querySelectorAll('.more-games'))link.href=`https://g55.co/?utm_source=moreGamesButton&utm_medium=${encodeURIComponent(document.title)}`;
 document.querySelectorAll('[data-car]').forEach(b=>b.onclick=()=>{if(!ready||screen!=='menu')return;const car=getCar(b.dataset.car);if(!selectCar(saved,car.id)){$('garage-progress').textContent=`${car.name.toUpperCase()} · ${saved.completedChallenges} / ${car.challenges} CHALLENGES`;return;}model.reset(saved.car);model.seedTraffic();model.playerX=2.7;world.setCar(saved.car);persist();updateRecords();});
 $('mute-button').classList.toggle('muted',saved.muted);$('mute-button').setAttribute('aria-label',saved.muted?'Enable sound':'Mute sound');$('mute-button').onclick=()=>{saved.muted=!saved.muted;audio.unlock();audio.setMuted(saved.muted);$('mute-button').classList.toggle('muted',saved.muted);$('mute-button').setAttribute('aria-label',saved.muted?'Enable sound':'Mute sound');persist();};
 if(!root.requestFullscreen&&!root.webkitRequestFullscreen)$('fullscreen-button').hidden=true;
 $('fullscreen-button').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(root.requestFullscreen)await root.requestFullscreen();else root.webkitRequestFullscreen?.();}catch{$('fullscreen-button').title='Full screen is unavailable in this player';}};
 window.addEventListener('keydown',e=>{
  if(screen==='unlock-screen'&&e.code==='Tab'){e.preventDefault();(document.activeElement===$('unlock-equip')?$('unlock-keep'):$('unlock-equip')).focus();return;}
  if(e.code==='Escape'||e.code==='KeyP'){e.preventDefault();if(e.repeat)return;if(screen==='unlock-screen')chooseUnlockedCar(false);else if(screen==='help-screen')closeHelp();else if(model.mode==='paused')resumeGame();else pauseGame();return;}
  if(model.mode==='playing'&&['ArrowLeft','ArrowRight','ArrowDown','KeyA','KeyD','KeyS','Space','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();if(['Space','ShiftLeft','ShiftRight'].includes(e.code)){if(!e.repeat)boost();}else keys.add(e.code);}
  if(e.code==='KeyR'&&model.mode==='crashed'&&screen!=='unlock-screen'){e.preventDefault();startGame();}
 });window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{clearInput();pauseGame();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pauseGame();}});
 canvas.tabIndex=-1;canvas.addEventListener('pointerdown',e=>{if(model.mode!=='playing')return;e.preventDefault();touch=e.pointerType!=='mouse'||touch;$('touch-controls').hidden=!touch;drag={id:e.pointerId,start:e.clientX,startX:model.playerX,targetX:model.playerX};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;const scale=world.portrait?13:19;drag.targetX=clamp(drag.startX+(e.clientX-drag.start)/world.width*scale,-6.45,6.45);});const dragEnd=e=>{if(drag?.id===e.pointerId)drag=null;};canvas.addEventListener('pointerup',dragEnd);canvas.addEventListener('pointercancel',dragEnd);canvas.addEventListener('lostpointercapture',dragEnd);
 for(const [id,axis]of[['touch-left',-1],['touch-right',1]]){const b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);drag=null;touchSteer=axis;});const release=()=>{if(touchSteer===axis)touchSteer=0;};b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);}
 window.addEventListener('resize',resize);document.addEventListener('fullscreenchange',resize);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;pauseGame();showLoadError('The graphics context was interrupted. Reload to start a fresh run.');});
}
function setupWebMCP(){
 if(!document.modelContext?.registerTool)return;
 const lifecycle=new AbortController();const empty={type:'object',properties:{},additionalProperties:false};const validate=input=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('This action takes an empty object.');};
 const tools=[{name:'get_highway_run',title:'Read the current run',description:'Read the highway race state, level progression, score, distance, speed, combo and powerups.',annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){validate(input);return model.snapshot();}},{name:'start_highway_run',title:'Start a highway run',description:'Start a new run from the main menu or after a crash. Does not replace a run in progress.',annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){validate(input);if(!['menu','crashed'].includes(model.mode))throw new Error('Finish the current run before starting another.');startGame();return model.snapshot();}},{name:'pause_highway_run',title:'Pause the highway run',description:'Pause a race that is currently in progress.',annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){validate(input);if(!pauseGame())throw new Error('No race is currently running.');return model.snapshot();}}];
 for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool({...tool,inputSchema:empty},{signal:lifecycle.signal})).catch(()=>{});}catch{}}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
function loadImage(src,onDone){return new Promise((resolve,reject)=>{const image=new Image();const timer=setTimeout(()=>reject(new Error('An image took too long to load.')),20000);image.onload=()=>{clearTimeout(timer);onDone();resolve(image);};image.onerror=()=>{clearTimeout(timer);reject(new Error('A game image could not be loaded.'));};image.src=src;});}
function showLoadError(message){$('loader').hidden=false;$('loader').style.opacity='1';$('load-text').classList.add('load-error');$('load-text').textContent=message;if(!$('reload-game')){const b=document.createElement('button');b.id='reload-game';b.className='primary';b.textContent='RELOAD GAME';b.onclick=()=>location.reload();$('loader').appendChild(b);}}
async function initialize(){try{
 const assets=['vehicles.png','powerups.png','skyline.png','player-wheel-blur.png','garage-cars.png','g55-logo.png'];
 let loaded=0;const onDone=()=>{loaded++;const progress=Math.round(loaded/assets.length*100);$('load-bar').style.width=progress+'%';$('load-text').textContent=`Loading the city… ${progress}%`;};
 const [vehicles,powerups,skyline,playerWheels,garageCars]=await Promise.all(assets.map(file=>loadImage('assets/'+file,onDone)));
 world=new RoadRenderer(canvas,{vehicles,powerups,skyline,playerWheels,garageCars});world.setCar(saved.car);model.reset(saved.car);model.seedTraffic();model.playerX=2.7;document.querySelectorAll('[data-car]').forEach(b=>world.drawGaragePreview(b.querySelector('canvas'),b.dataset.car));persist();bindControls();updateRecords();resize();ready=true;setScreen('menu');world.render(model,0);$('loader').style.opacity='0';setTimeout(()=>{$('loader').hidden=true;$('start-button').focus();},360);setupWebMCP();lastTime=performance.now();requestAnimationFrame(frame);
 }catch(error){showLoadError(error.message.includes('WebGL')?'This game needs WebGL. Enable hardware acceleration in your browser, then reload.':error.message||'The game could not start. Please reload.');console.error('Highway Rush initialization:',error);}}
initialize();
