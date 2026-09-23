'use strict';
(()=>{
const $=s=>document.querySelector(s),canvas=$('#game'),ctx=canvas.getContext('2d'),ui=$('#interface');
const TITLE='Resident Evil 2: Beat Em Up',MORE='https://g55.co/?utm_source=moreGamesButton&utm_medium='+encodeURIComponent(TITLE),SAVE='g55-re2-brawler-v1';
const THEMES=[
 {id:'streets',name:'Raccoon City',areas:['Burning Streets','Police Block','Station Gates'],intro:'Reach the police station.',color:'#152c37',boss:'INFECTED ENFORCER',bossType:'zombie'},
 {id:'station',name:'R.P.D. Station',areas:['Main Hall','West Wing','Underground Access'],intro:'Find a route beneath the station.',color:'#203033',boss:'MR. X',bossType:'tyrant'},
 {id:'sewers',name:'The Sewers',areas:['Drainage Tunnel','Pump Chamber','Treatment Plant'],intro:'Follow the tunnels to NEST.',color:'#163635',boss:'ALPHA LICKER',bossType:'licker'},
 {id:'lab',name:'NEST Laboratory',areas:['Reception','Biotest Wing','Containment'],intro:'Break through the lockdown.',color:'#152f3c',boss:'T-103 TYRANT',bossType:'tyrant'},
 {id:'escape',name:'Last Train Out',areas:['Service Tunnel','Evacuation Platform','Final Stand'],intro:'Clear the platform. Catch the last train.',color:'#342524',boss:'MR. X · FINAL PURSUIT',bossType:'tyrant'}
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t,dist=(a,b)=>Math.hypot(a.x-b.x,(a.y-b.y)*1.3);
const images={},keys=new Set(),touch={x:0,y:0,actions:new Set()},bindings={KeyJ:'knife',KeyK:'kick',KeyL:'shoot',Space:'dodge',KeyR:'reload'};
let W=innerWidth,H=innerHeight,scale=1,viewW=1000,viewH=760,floorY=475,clock=0,last=0,mode='main',origin='main',loaded=false,loadingError=false,loadCount=0,muted=false,ctxAudio=null,touchMode=matchMedia('(pointer:coarse)').matches;
let run=null,transition=0,nextChapter=0,hitstop=0,shake=0,flash=0,bannerTime=0,toast='',menuClock=0,hudTimer=0,saveData=null,assetPromise=null;
try{saveData=JSON.parse(localStorage.getItem(SAVE));muted=localStorage.getItem(SAVE+'-mute')==='1'}catch{}
function validSave(s){return s&&Number.isInteger(s.chapter)&&s.chapter>=0&&s.chapter<5&&Number.isFinite(s.score)&&s.score>=0&&(!s.bestCombo||Number.isFinite(s.bestCombo))}
if(!validSave(saveData))saveData=null;
const brand=()=>'<div class="brand"><strong>G55.CO</strong><i></i><span>UNOFFICIAL FAN GAME</span></div>';
const utilities=()=>'<div class="utility">'+(mode==='play'?'<button class="icon" data-action="pause" aria-label="Pause game">Ⅱ</button>':'')+'<button class="icon" data-action="mute" aria-label="'+(muted?'Unmute sound':'Mute sound')+'">'+(muted?'♪̸':'♪')+'</button><button class="icon" data-action="fullscreen" aria-label="Toggle fullscreen">⛶</button></div>';
const more=()=>'<a class="more" href="'+MORE+'" target="_blank" rel="noopener noreferrer"><span>More Games</span><span>↗</span></a>';
function action(label,id){return '<button class="primary" data-action="'+id+'"><span>'+label+'</span><span>→</span></button>'}
function secondary(label,id){return '<button class="text-action" data-action="'+id+'">'+label+'</button>'}
function footer(){return '<div class="menu-footer"><span>A FAN-MADE ARCADE REIMAGINING</span><span>KEYBOARD + TOUCH</span></div>'}
function showMenu(type){
 mode=type;keys.clear();touch.actions.clear();touch.x=touch.y=0;document.body.classList.toggle('touch-mode',touchMode);let body='',overlay=true;
 if(type==='main'){
  overlay=false;body='<div class="eyebrow">September 1998 · Raccoon City</div><h1><span class="resident">RESIDENT</span><span class="name">EVIL</span><span class="two">2</span></h1><div class="genre">BEAT EM UP</div><p class="lead">The city has fallen.<br>Fight your way out.</p><div class="actions"><button class="primary" id="start" data-action="'+(loadingError?'reload-assets':'start')+'" '+(!loaded&&!loadingError?'disabled':'')+'><span id="load-label">'+(loadingError?'RETRY LOADING':loaded?'START GAME':'LOADING '+loadCount+'%')+'</span><span>→</span><i class="load-track" style="width:'+loadCount+'%"></i></button>'+more()+'<div class="secondary">'+((run&&!run.completed)||saveData?secondary('Continue · Chapter '+String((run?.chapter??saveData.chapter)+1).padStart(2,'0'),'continue'):'')+secondary('How to Play','help')+'</div></div>'+(loadingError?'<p class="loading-error">Some artwork could not load. Please retry.</p>':'');
 }else if(type==='help'){
  body='<div class="eyebrow">Survival Guide</div><h2 class="panel-title">Keep moving. Stay alive.</h2><div class="controls-grid"><div class="control"><kbd>WASD</kbd><span>Move · Arrow keys</span></div><div class="control"><kbd>J</kbd><span>Knife · 3-hit combo</span></div><div class="control"><kbd>K</kbd><span>Roundhouse kick</span></div><div class="control"><kbd>L</kbd><span>Fire handgun</span></div><div class="control"><kbd>SPACE</kbd><span>Dodge · Brief immunity</span></div><div class="control"><kbd>R</kbd><span>Reload handgun</span></div></div><p class="tip">Line up with enemies to land a hit. Dodge the orange attack warning. Break supplies for herbs and ammunition. Clear each area, then move right.</p><div class="actions">'+action('Back',origin==='main'?'main':'pause')+more()+'</div>';
 }else if(type==='pause'){
  body='<div class="eyebrow">Chapter '+String(run.chapter+1).padStart(2,'0')+' / 05</div><h2 class="panel-title">Take a breath.</h2><p class="panel-desc">'+THEMES[run.chapter].name+' · '+THEMES[run.chapter].areas[run.area]+'</p><div class="actions">'+action('Resume','resume')+more()+'<div class="secondary">'+secondary('How to Play','help')+secondary('Main Menu','main')+'</div></div>';
 }else if(type==='chapter'){
  body='<div class="eyebrow">Chapter Cleared</div><h2 class="panel-title">'+THEMES[run.chapter].name+'</h2><p class="panel-desc">'+['The R.P.D. doors are open. Something is waiting inside.','The station is lost. The way out lies below.','Beyond the sewers, the laboratory is still running.','The lockdown is broken. Reach the evacuation train.'][run.chapter]+'</p><div class="stat-row"><div>Score<strong>'+String(run.score).padStart(6,'0')+'</strong></div><div>Next Chapter<strong>'+THEMES[run.chapter+1].name+'</strong></div></div><p class="tip">Next chapter: health restored, handgun resupplied.</p><div class="actions">'+action('Next Chapter','next')+more()+'<div class="secondary">'+secondary('Main Menu','main')+'</div></div>';
 }else if(type==='defeat'){
  body='<div class="eyebrow">Raccoon City Claims Another</div><h2 class="panel-title">You are dead.</h2><p class="panel-desc">Watch for the orange attack warning. A well-timed dodge can turn a fight.</p><div class="stat-row"><div>Chapter<strong>'+String(run.chapter+1).padStart(2,'0')+'</strong></div><div>Score<strong>'+String(run.score).padStart(6,'0')+'</strong></div></div><div class="actions">'+action('Retry Chapter','retry')+more()+'<div class="secondary">'+secondary('Main Menu','main')+'</div></div>';
 }else if(type==='victory'){
  run.completed=true;body='<div class="eyebrow">Raccoon City · Survived</div><h2 class="panel-title">A way out.</h2><p class="panel-desc">The last train leaves the city behind.<br>Five chapters. One survivor.</p><div class="stat-row"><div>Final Score<strong>'+String(run.score).padStart(6,'0')+'</strong></div><div>Best Combo<strong>'+run.bestCombo+' HITS</strong></div></div><div class="actions">'+action('Play Again','start')+more()+'<div class="secondary">'+secondary('Main Menu','main')+'</div></div>';
 }
 ui.innerHTML='<div class="menu menu-'+type+' '+(overlay?'overlay':'')+'">'+brand()+utilities()+'<div class="menu-body">'+body+'</div>'+(!overlay?'<div class="chapter-tag"><small>CHAPTER 01 / 05</small>RACCOON CITY</div>':'')+footer()+'</div><div class="fade"></div>';
}
function showHUD(){
 mode='play';document.body.classList.toggle('touch-mode',touchMode);
 ui.innerHTML='<div class="hud"><div class="player-info"><div class="health-title"><span>LEON S. KENNEDY</span><small id="health-value">100 / 100</small></div><div class="bar"><i id="health-fill"></i></div><div id="health-state" class="health-state">FINE</div><div class="ammo"><small>HANDGUN</small><strong id="mag">10</strong><span id="reserve">/ 30</span><small id="reload-status">R · RELOAD</small></div></div><div class="hud-center"><small id="chapter-label"></small><h2 id="area-label"></h2><p id="objective"></p></div><div class="score"><small>SCORE</small><span id="score-value"></span></div>'+utilities()+'<div class="boss-ui" hidden><span id="boss-name"></span><div class="bar"><i id="boss-fill"></i></div></div><div class="combo" hidden><span id="combo-count"></span><small>HIT COMBO</small></div><div class="hud-hint"><b>W A S D</b> MOVE <b>J</b> KNIFE <b>K</b> KICK <b>L</b> SHOOT <b>SPACE</b> DODGE <b>R</b> RELOAD</div></div><div class="banner"></div><div id="touch"><div class="stick" role="group" aria-label="Movement joystick"><div class="stick-knob"></div></div><div class="touch-actions"><button class="touch-button" data-hold="kick">KICK</button><button class="touch-button attack" data-hold="knife" style="grid-column:2 / 4">KNIFE</button><button class="touch-button dodge" data-hold="dodge">DODGE</button><button class="touch-button reload" data-hold="reload">LOAD</button><button class="touch-button shoot" data-hold="shoot">FIRE</button></div></div><div class="fade"></div>';
 setupTouch();updateHUD();
}
function updateHUD(){
 if(mode!=='play'||!run)return;const p=run.player,T=THEMES[run.chapter],alive=run.enemies.filter(e=>e.hp>0),boss=alive.find(e=>e.boss);
 $('#health-value').textContent=Math.ceil(p.hp)+' / 100';$('#health-fill').style.width=p.hp+'%';const col=p.hp>55?'#6fd1b4':p.hp>25?'#e5b168':'#ef6a55';$('#health-fill').style.background=col;$('#health-state').textContent=p.hp>55?'FINE':p.hp>25?'CAUTION':'DANGER';$('#health-state').style.color=col;
 $('#mag').textContent=String(p.mag).padStart(2,'0');$('#reserve').textContent='/ '+p.reserve;$('#reload-status').textContent=p.action==='reload'?'RELOADING…':'R · RELOAD';$('#chapter-label').textContent='CH. '+String(run.chapter+1).padStart(2,'0')+' / 05 · AREA '+String(run.area+1).padStart(2,'0')+' / 03';$('#area-label').textContent=T.areas[run.area];$('#objective').textContent=alive.length?alive.length+' THREATS REMAINING':'AREA CLEAR · MOVE RIGHT →';$('#score-value').textContent=String(run.score).padStart(6,'0');$('.boss-ui').hidden=!boss;if(boss){$('#boss-name').textContent=boss.name;$('#boss-fill').style.width=(boss.hp/boss.maxHp*100)+'%'}$('.combo').hidden=run.combo<2||run.comboTimer<=0;if(run.combo>=2){$('#combo-count').textContent=run.combo+'×'}
}
function notice(a,b='',time=2.4){toast=a;bannerTime=time;const el=$('.banner');if(el){el.innerHTML=a+(b?'<small>'+b+'</small>':'');el.classList.add('show')}}
function audio(kind){
 if(muted)return;try{if(!ctxAudio)ctxAudio=new(window.AudioContext||window.webkitAudioContext)();if(ctxAudio.state==='suspended')ctxAudio.resume();const a=ctxAudio,t=a.currentTime,o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.type=kind==='shot'?'sawtooth':kind==='hurt'?'sawtooth':'triangle';let f={hit:145,shot:90,kick:95,loot:680,dodge:310,reload:230,hurt:72,clear:430}[kind]||180;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(kind==='loot'||kind==='clear'?f*1.7:40,t+.15);g.gain.setValueAtTime(kind==='shot'?.07:.04,t);g.gain.exponentialRampToValueAtTime(.001,t+.18);o.start(t);o.stop(t+.2)}catch{}
}
function saveCheckpoint(){saveData={chapter:run.chapter,score:run.checkpointScore,bestCombo:run.bestCombo};try{localStorage.setItem(SAVE,JSON.stringify(saveData))}catch{}}
function start(chapter=0,score=0,best=0){
 run={chapter,area:0,score,checkpointScore:score,bestCombo:best,combo:0,comboTimer:0,camera:0,enemies:[],props:[],loot:[],effects:[],cleared:false,clearShown:false,player:{x:140,y:90,hp:100,mag:10,reserve:30,dir:1,walk:0,moving:false,action:'',timer:0,duration:0,applied:false,inv:1,dodgeCooldown:0,kickCooldown:0,chain:0,chainTimer:0,deadTimer:0}};
 hitstop=shake=flash=0;spawnArea();saveCheckpoint();showHUD();notice('CHAPTER '+String(chapter+1).padStart(2,'0')+' · '+THEMES[chapter].name,THEMES[chapter].intro,3);
}
function enemy(type,x,y,boss=false){
 const hp=(type==='tyrant'?140:type==='licker'?65:50)+(run.chapter*4)+(boss?150:0);
 return {type,x,y,hp,maxHp:hp,dir:-1,walk:0,moving:false,action:'',timer:0,cooldown:.65+Math.random()*.6,stun:0,dead:0,boss,name:boss?THEMES[run.chapter].boss:'',seed:Math.random()*6.28,hit:false};
}
function spawnArea(){
 const c=run.chapter,a=run.area,base=a*1000;
 let types=a===0?['zombie','zombie','zombie']:a===1?['zombie','licker','zombie','zombie']:['zombie','licker','zombie'];
 if(c>=2)types.push(a===1?'licker':'zombie');if(c===4&&a===1)types.push('tyrant');
 run.enemies=types.map((t,i)=>enemy(t,base+450+i*105,35+(i%3)*52));
 if(a===2)run.enemies.push(enemy(THEMES[c].bossType,base+820,85,true));
 run.props.push({x:base+300,y:128,hp:2,dropped:false},{x:base+720,y:30,hp:2,dropped:false});
 run.cleared=false;run.clearShown=false;
}
function setAction(p,a,d){p.action=a;p.timer=d;p.duration=d;p.applied=false;p.moving=false}
function command(a){
 if(mode!=='play'||!run||transition>0)return false;const p=run.player;if(p.hp<=0)return false;
 if(a==='dodge'&&p.dodgeCooldown<=0&&p.action!=='dodge'){setAction(p,'dodge',.38);p.inv=.5;p.dodgeCooldown=1.12;audio('dodge');return true}
 if(p.action)return false;
 if(a==='reload'){if(p.mag>=10||p.reserve<=0)return false;setAction(p,'reload',.9);audio('reload');return true}
 if(a==='knife'){p.chain=p.chainTimer>0?(p.chain%3)+1:1;p.chainTimer=.95;setAction(p,'knife',p.chain===3?.41:.28);return true}
 if(a==='kick'){if(p.kickCooldown>0)return false;p.kickCooldown=1.05;setAction(p,'kick',.52);return true}
 if(a==='shoot'){if(p.mag<=0)return command('reload');setAction(p,'shoot',.32);return true}return false;
}
function reward(e){run.score+=e.boss?1500:e.type==='tyrant'?300:e.type==='licker'?200:100;run.combo++;run.bestCombo=Math.max(run.bestCombo,run.combo);run.comboTimer=3.4;if(e.boss||Math.random()<.22)run.loot.push({x:e.x,y:e.y,kind:e.boss?'herb':Math.random()<.45?'herb':'ammo',life:18})}
function hitEnemy(e,dmg,knock,dir){if(e.hp<=0)return;e.hp=Math.max(0,e.hp-dmg);e.x=clamp(e.x+(e.boss?Math.min(9,knock):knock)*dir,run.area*1000+20,(run.area+1)*1000-40);if(!e.boss||(e.action!=='windup'&&e.action!=='attack')){e.stun=e.boss?.10:.42;e.action='hurt';e.timer=e.boss?.1:.26;e.cooldown=Math.max(e.cooldown,e.boss?.18:.52);}e.hit=true;burst(e.x,e.y-75,'#e4b286',6);if(e.hp<=0){e.action='dead';e.dead=0;reward(e)}audio('hit');shake=Math.max(shake,3.5);hitstop=.04}
function burst(x,y,color,count){for(let i=0;i<count;i++)run.effects.push({x,y,vx:(Math.random()-.5)*230,vy:-60-Math.random()*120,t:.28,max:.28,color})}
function strike(){
 const p=run.player,a=p.action;if(p.applied)return;p.applied=true;
 if(a==='knife'||a==='kick'){
 const reach=a==='kick'?148:115,lane=a==='kick'?49:38,dmg=a==='kick'?29:p.chain===3?36:24;let hits=0;
 for(const e of run.enemies)if(e.hp>0&&Math.abs(e.y-p.y)<lane&&(e.x-p.x)*p.dir>-18&&(e.x-p.x)*p.dir<reach){hitEnemy(e,dmg,a==='kick'?68:p.chain===3?45:16,p.dir);hits++}
 for(const b of run.props)if(b.hp>0&&Math.abs(b.y-p.y)<lane&&(b.x-p.x)*p.dir>-22&&(b.x-p.x)*p.dir<reach){b.hp--;burst(b.x,b.y-35,'#89a49c',5);audio('hit');if(b.hp===0&&!b.dropped){b.dropped=true;run.score+=40;run.loot.push({x:b.x,y:b.y,kind:(Math.round(b.x/100)%2)?'herb':'ammo',life:25})}}
 if(!hits)audio(a==='kick'?'kick':'dodge');
 }else if(a==='shoot'){
 if(p.mag<=0)return;p.mag--;audio('shot');shake=3;let e=run.enemies.filter(e=>e.hp>0&&Math.abs(e.y-p.y)<38&&(e.x-p.x)*p.dir>0&&(e.x-p.x)*p.dir<610).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0];
 if(e)hitEnemy(e,42,27,p.dir);run.effects.push({beam:true,x:p.x+p.dir*48,y:p.y-99,end:e?e.x:p.x+p.dir*600,t:.075,max:.075,color:'#ffd69a'});
 }
}
function hurt(dmg,from){
 const p=run.player;if(p.inv>0||p.hp<=0)return;p.hp=Math.max(0,p.hp-dmg);p.inv=.92;p.x=clamp(p.x+Math.sign(p.x-from.x)*35,run.area*1000+20,(run.area+1)*1000-30);setAction(p,p.hp>0?'hurt':'dead',p.hp>0?.24:1.2);run.combo=0;flash=.14;shake=6;hitstop=.07;audio('hurt');
}
function update(dt){
 if(mode!=='play'||!run)return;
 if(transition>0){transition-=dt;if(transition<=0){start(nextChapter,run.score,run.bestCombo);$('.fade')?.classList.remove('on')}return}
 if(hitstop>0){hitstop-=dt;return}
 const p=run.player;p.inv=Math.max(0,p.inv-dt);p.dodgeCooldown=Math.max(0,p.dodgeCooldown-dt);p.kickCooldown=Math.max(0,p.kickCooldown-dt);p.chainTimer=Math.max(0,p.chainTimer-dt);run.comboTimer-=dt;if(run.comboTimer<=0)run.combo=0;
 shake=Math.max(0,shake-dt*22);flash=Math.max(0,flash-dt);bannerTime-=dt;if(bannerTime<=0)$('.banner')?.classList.remove('show');
 if(p.hp<=0){p.deadTimer+=dt;if(p.deadTimer>1.05)showMenu('defeat')}
 if(p.action){
  p.timer-=dt;if(p.action==='dodge')p.x+=p.dir*450*dt;
  if(!p.applied&&p.timer<p.duration*.68)strike();
  if(p.timer<=0){if(p.action==='reload'){const n=Math.min(10-p.mag,p.reserve);p.mag+=n;p.reserve-=n;audio('reload')}p.action=''}
 }
 let mx=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x,my=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+touch.y;
 const norm=Math.max(1,Math.hypot(mx,my));mx/=norm;my/=norm;p.moving=false;
 if(!p.action&&p.hp>0){
 const ox=p.x,oy=p.y;p.x+=mx*225*dt;p.y+=my*142*dt;p.x=clamp(p.x,Math.max(20,run.area*1000-150),(run.area+1)*1000-(run.cleared?0:55));p.y=clamp(p.y,10,155);let traveled=Math.hypot(p.x-ox,p.y-oy);p.walk+=traveled;p.moving=traveled>.01;if(Math.abs(mx)>.05)p.dir=Math.sign(mx);
 for(const [code,a]of Object.entries(bindings))if(keys.has(code)||touch.actions.has(a)){command(a);break}
 }
 p.x=clamp(p.x,Math.max(20,run.area*1000-150),(run.area+1)*1000-(run.cleared?0:55));p.y=clamp(p.y,10,155);
 for(const e of run.enemies){
 e.hit=false;if(e.hp<=0){e.dead+=dt;continue}if(e.boss&&e.type==='tyrant'&&e.hp<e.maxHp*.5&&!e.enraged){e.enraged=true;notice('THE TYRANT IS ENRAGED','DODGE HIS HEAVY ATTACKS',2.2)}e.stun=Math.max(0,e.stun-dt);e.cooldown=Math.max(0,e.cooldown-dt);e.moving=false;const dx=p.x-e.x,dy=p.y-e.y;e.dir=dx>=0?1:-1;
 if(e.action==='hurt'){e.timer-=dt;if(e.timer<=0)e.action='';continue}
 if(e.action==='windup'){
 e.timer-=dt;if(e.timer<=0){e.action='attack';e.timer=e.type==='licker'?.32:.3;e.applied=false;e.targetX=p.x;e.targetY=p.y}continue;
 }
 if(e.action==='attack'){
 e.timer-=dt;if(e.type==='licker')e.x+=e.dir*280*dt;
 if(e.timer<.18&&!e.applied){e.applied=true;const range=e.type==='tyrant'?132:e.type==='licker'?125:90;if(Math.abs(p.x-e.x)<range&&Math.abs(p.y-e.y)<(e.boss?63:38))hurt(e.type==='tyrant'?(e.enraged?29:24):e.type==='licker'?15:11,e)}
 if(e.timer<=0){e.action='';e.cooldown=e.boss?1.1:1.35}continue;
 }
 if(p.hp<=0||e.stun>0)continue;
 const reach=e.type==='licker'?156:e.type==='tyrant'?112:72;
 if(Math.abs(dx)<reach&&Math.abs(dy)<35&&e.cooldown<=0){e.action='windup';e.timer=e.type==='tyrant'?(e.enraged?.68:.9):e.type==='licker'?.6:.72;continue}
 if(e.cooldown<.7||Math.abs(dx)>reach+20||Math.abs(dy)>40){
 const speed=e.type==='licker'?141:e.type==='tyrant'?(e.enraged?95:67):78+run.chapter*3,ox=e.x,oy=e.y;let goalY=p.y+Math.sin(e.seed)*18;
 if(Math.abs(dx)>reach*.72)e.x+=Math.sign(dx)*speed*dt;if(Math.abs(goalY-e.y)>6)e.y+=Math.sign(goalY-e.y)*speed*.55*dt;
 for(const o of run.enemies)if(o!==e&&o.hp>0&&Math.abs(e.x-o.x)<32&&Math.abs(e.y-o.y)<19){e.y+=Math.sign(e.y-o.y||Math.sin(e.seed))*29*dt}
 e.x=clamp(e.x,run.area*1000+25,(run.area+1)*1000-45);e.y=clamp(e.y,12,155);const traveled=Math.hypot(e.x-ox,e.y-oy);e.walk+=traveled;e.moving=traveled>.02;
 }
 }
 for(const l of run.loot){l.life-=dt;if(p.hp>0&&Math.abs(l.x-p.x)<46&&Math.abs(l.y-p.y)<35){if(l.kind==='herb'){if(p.hp>=100)continue;p.hp=Math.min(100,p.hp+30);notice('+30 HEALTH','',1.1)}else{p.reserve+=12;notice('+12 HANDGUN ROUNDS','',1.1)}l.life=0;audio('loot')}}run.loot=run.loot.filter(l=>l.life>0);
 for(const e of run.effects){e.t-=dt;if(!e.beam){e.x+=e.vx*dt;e.y+=e.vy*dt;e.vy+=400*dt}}run.effects=run.effects.filter(e=>e.t>0);
 if(!run.enemies.some(e=>e.hp>0)&&p.hp>0){run.cleared=true;if(!run.clearShown){run.clearShown=true;notice('AREA CLEAR','MOVE RIGHT TO CONTINUE →',2.8);audio('clear')}
 if(p.x>=(run.area+1)*1000-(run.area<2?0:20)){if(run.area<2){run.area++;spawnArea();notice(THEMES[run.chapter].areas[run.area],'CLEAR THE AREA',2)}else if(run.chapter<4){showMenu('chapter')}else{try{localStorage.removeItem(SAVE)}catch{}saveData=null;showMenu('victory')}}
 }
 let target=clamp(p.x-viewW*.34,0,Math.max(0,3000-viewW));run.camera=mix(run.camera,target,1-Math.exp(-7*dt));
 hudTimer-=dt;if(hudTimer<=0){updateHUD();hudTimer=.08}
}
function asset(name){return window.ART?.[name]}
function drawSprite(name,frame,x,y,height,dir=1,alpha=1){
 const img=images[name],a=asset(name);if(!img||!a)return;
 const f=a.frames?.[frame]||{x:(frame%(a.cols||1))*a.cellW,y:Math.floor(frame/(a.cols||1))*a.cellH,w:a.cellW||img.width,h:a.cellH||img.height};
 const base=f.anchorY??a.anchorY??f.h*.94,center=f.anchorX??a.anchorX??f.w/2,unit=height/(a.bodyHeight||base*.9);ctx.save();ctx.translate(x,y);ctx.scale(dir,1);ctx.globalAlpha=alpha;ctx.drawImage(img,f.x,f.y,f.w,f.h,-center*unit,-base*unit,f.w*unit,f.h*unit);ctx.restore();
}
function drawLayer(name,height,bottom,camera,factor){
 const img=images[name];if(!img)return;const width=img.width/img.height*height,travel=camera*factor,first=Math.floor(travel/width)-1;for(let i=first;i*width-travel<viewW;i++){const x=i*width-travel;if(name.endsWith('-floor')&&Math.abs(i%2)===1){ctx.save();ctx.translate(x+width,0);ctx.scale(-1,1);ctx.drawImage(img,0,bottom-height,width,height);ctx.restore()}else ctx.drawImage(img,x,bottom-height,width,height);}
}
function scenery(theme,camera){
 ctx.fillStyle=theme.color;ctx.fillRect(0,0,viewW,viewH);const far=images[theme.id+'-far'];
 if(far){const ratio=far.width/far.height,h=Math.max(floorY+55,(viewW+240)/ratio),w=ratio*h,off=-camera*.075,top=floorY+55-h;ctx.drawImage(far,off-80,top,w,h);if(off-80+w<viewW)ctx.drawImage(far,off-80+w,top,w,h)}
 drawLayer(theme.id+'-mid',floorY+16,floorY+8,camera,.30);drawLayer(theme.id+'-near',floorY+32,floorY+20,camera,.62);
 const floor=images[theme.id+'-floor'];if(floor){const height=Math.max(210,viewH-floorY+5);drawLayer(theme.id+'-floor',height,viewH,camera,1)}else{ctx.fillStyle=theme.color;ctx.fillRect(0,floorY,viewW,viewH-floorY)}
 const g=ctx.createLinearGradient(0,viewH-110,0,viewH);g.addColorStop(0,'#04101400');g.addColorStop(1,'#041014b0');ctx.fillStyle=g;ctx.fillRect(0,viewH-110,viewW,110);
}
function shadow(x,y,w,alpha=.35){ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(x,y,w,10,0,0,Math.PI*2);ctx.fill();ctx.restore()}
function hero(){
 const T=THEMES[0],cam=menuClock*14;scenery(T,cam);
 const isPortrait=W<H,ground=isPortrait?viewH*.78:viewH*.90,heroX=isPortrait?viewW*.78:viewW*.70,heroH=isPortrait?315:Math.min(viewH*.66,480);
 const ex=isPortrait?viewW*1.08:viewW*.875;shadow(ex,ground-28,heroH*.18,.45);drawSprite('tyrant',0,ex,ground-28,heroH*1.05,-1,1);
 shadow(heroX,ground,heroH*.2,.55);drawSprite('leon',0,heroX,ground,heroH,1,1);
}
function actorFrame(e){if(e.hp<=0)return e.type==='leon'?7:5;if(e.action==='hurt'||e.action==='dodge'||e.action==='reload')return e.type==='leon'?6:4;if(e.action==='knife')return 3;if(e.action==='kick')return 4;if(e.action==='shoot')return 5;if(e.action==='attack')return 3;if(e.action==='windup')return 0;if(e.moving)return 1+(Math.floor(e.walk/(e.type==='licker'?36:44))%2);return 0}
function gameplay(){
 const cam=run.camera,p=run.player;scenery(THEMES[run.chapter],cam);ctx.save();ctx.translate(-cam,0);
 for(const l of run.loot){const x=l.x,y=floorY+l.y;ctx.save();ctx.globalAlpha=Math.min(1,l.life);ctx.strokeStyle=l.kind==='herb'?'#77e9b2':'#ffce88';ctx.fillStyle='#091e23';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y-14,13,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.font='700 16px Oswald';ctx.fillStyle=ctx.strokeStyle;ctx.textAlign='center';ctx.fillText(l.kind==='herb'?'+':'12',x,y-8);ctx.restore()}
 const draws=[...run.props.map(b=>({kind:'prop',...b})),...run.enemies.map(e=>({kind:'enemy',e,y:e.y})),{kind:'player',y:p.y}].sort((a,b)=>a.y-b.y);
 for(const item of draws){
 if(item.kind==='prop'){const b=item,frame=b.hp===2?0:b.hp===1?1:2;shadow(b.x,floorY+b.y,42,.32);drawSprite(THEMES[run.chapter].id+'-prop',frame,b.x,floorY+b.y,[112,105,82,108,64][run.chapter]);continue}
 const e=item.kind==='player'?p:item.e,type=item.kind==='player'?'leon':e.type,dead=e.hp<=0;
 if(dead&&e.dead>2.3)continue;
 const height=type==='leon'?180:type==='licker'?104:type==='tyrant'?219:177+(e.boss?25:0),y=floorY+e.y;
 shadow(e.x,y,type==='licker'?55:35,dead?.18:.37);
 if(e.action==='windup'){ctx.strokeStyle='#ff9b64';ctx.lineWidth=3;ctx.globalAlpha=.8;ctx.beginPath();ctx.ellipse(e.x,y,type==='tyrant'?92:type==='licker'?75:51,22,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;ctx.font='700 30px Oswald';ctx.textAlign='center';ctx.fillStyle='#ffc27c';ctx.fillText('!',e.x,y-height-14)}
 let alpha=dead&&type!=='leon'?Math.max(0,1-(e.dead-1.4)/.9):1;if(type==='leon'&&mode==='play'&&p.inv>0&&p.action!=='dodge'&&Math.floor(clock*14)%2===0)alpha=.72;
 drawSprite(type,actorFrame({...e,type}),e.x,y,height,e.dir,alpha);
 if(item.kind==='enemy'&&e.hp>0&&e.hp<e.maxHp&&!e.boss){ctx.fillStyle='#08151b';ctx.fillRect(e.x-25,y-height-12,50,4);ctx.fillStyle='#c68368';ctx.fillRect(e.x-25,y-height-12,50*e.hp/e.maxHp,4)}
 }
 for(const f of run.effects){ctx.globalAlpha=clamp(f.t/f.max,0,1);ctx.fillStyle=f.color;ctx.strokeStyle=f.color;if(f.beam){ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(f.x,floorY+f.y);ctx.lineTo(f.end,floorY+f.y);ctx.stroke()}else{ctx.fillRect(f.x,floorY+f.y,4,4)}}ctx.globalAlpha=1;
 const exit=(run.area+1)*1000-35;if(run.cleared){ctx.font='700 26px Oswald';ctx.fillStyle='#a5dec9';ctx.textAlign='right';ctx.fillText('GO →',Math.min(exit,cam+viewW-30),floorY+80);ctx.font='12px Oswald';ctx.fillStyle='#a7bbc0';ctx.fillText(run.area<2?'NEXT AREA':run.chapter<4?'CHAPTER CLEAR':'ESCAPE',Math.min(exit,cam+viewW-30),floorY+103)}ctx.restore();
}
function render(){
 ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.clearRect(0,0,W,H);ctx.save();ctx.scale(scale,scale);ctx.imageSmoothingEnabled=false;
 if(shake>0&&mode==='play')ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
 if(mode==='main'||mode==='help'&&origin==='main'||!run)hero();else gameplay();ctx.restore();
 if(flash>0&&mode==='play'){ctx.fillStyle='rgba(181,45,36,'+flash*1.9+')';ctx.fillRect(0,0,W,H)}
}
function resize(){W=innerWidth;H=innerHeight;const dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);scale=Math.min(H/760,W/500);viewW=W/scale;viewH=H/scale;floorY=viewH*(touchMode&&W>H?.56:.66);if(run)run.camera=clamp(run.camera,0,Math.max(0,3000-viewW));render()}
function loop(t){const dt=Math.min(.04,(t-last)/1000||.016);last=t;clock+=dt;if(mode==='main'||mode==='help'&&origin==='main')menuClock+=dt;update(dt);render();requestAnimationFrame(loop)}
function setupTouch(){
 const stick=$('.stick'),knob=$('.stick-knob');if(!stick)return;
 let stickId=null;function move(e){if(e.pointerId!==stickId)return;const r=stick.getBoundingClientRect(),lim=r.width*.34,dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,n=Math.max(lim,Math.hypot(dx,dy));touch.x=dx/n;touch.y=dy/n;knob.style.transform='translate('+(touch.x*lim)+'px,'+(touch.y*lim)+'px)'}
 stick.addEventListener('pointerdown',e=>{e.preventDefault();stickId=e.pointerId;stick.setPointerCapture(e.pointerId);move(e)});stick.addEventListener('pointermove',move);const end=e=>{if(e.pointerId===stickId){touch.x=touch.y=0;stickId=null;knob.style.transform=''}};stick.addEventListener('pointerup',end);stick.addEventListener('pointercancel',end);stick.addEventListener('lostpointercapture',end);
 for(const b of document.querySelectorAll('[data-hold]')){const a=b.dataset.hold;b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touch.actions.add(a);b.classList.add('down');command(a)});for(const ev of['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>{touch.actions.delete(a);b.classList.remove('down')})}
}
function pause(){if(mode==='play'&&transition<=0)showMenu('pause')}
function resume(){if(!run)return;keys.clear();touch.actions.clear();touch.x=touch.y=0;showHUD()}
function click(a){
 if(a==='mute'){muted=!muted;try{localStorage.setItem(SAVE+'-mute',muted?'1':'0')}catch{}if(mode==='play'){$('[data-action="mute"]').innerHTML=muted?'♪̸':'♪';$('[data-action="mute"]').setAttribute('aria-label',muted?'Unmute sound':'Mute sound')}else showMenu(mode);if(!muted)audio('loot');return}
 if(a==='fullscreen'){if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});else document.documentElement.requestFullscreen?.().catch(()=>{});return}
 if(a==='reload-assets'){loadAssets();return}if(!loaded&&a!=='main'&&a!=='help')return;
 if(a==='start'){audio('clear');start()}
 else if(a==='continue'){if(run&&mode!=='victory'&&run.player.hp>0&&run.area<3){showHUD();if(run.cleared&&run.area===2)showMenu(run.chapter===4?'victory':'chapter')}else if(saveData)start(saveData.chapter,saveData.score,saveData.bestCombo||0)}
 else if(a==='main')showMenu('main');else if(a==='pause'){if(mode==='help')showMenu('pause');else pause()}else if(a==='resume')resume();else if(a==='retry')start(run.chapter,run.checkpointScore,run.bestCombo);
 else if(a==='help'){origin=mode==='main'?'main':'pause';showMenu('help')}
 else if(a==='next'){showHUD();transition=.36;nextChapter=run.chapter+1;$('.fade')?.classList.add('on')}
}
ui.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)click(b.dataset.action)});
window.addEventListener('keydown',e=>{
 if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
 if(e.code==='Escape'||e.code==='KeyP'){if(e.repeat)return;if(mode==='play')pause();else if(mode==='pause')resume();return}
 if(e.code==='KeyM'&&!e.repeat){click('mute');return}
 if(mode==='play'){keys.add(e.code);if(bindings[e.code]&&!e.repeat)command(bindings[e.code])}
});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();touch.actions.clear();touch.x=touch.y=0;pause()});document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});window.addEventListener('resize',resize);document.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&!touchMode){touchMode=true;document.body.classList.add('touch-mode');resize()}});
async function loadAssets(){
 if(assetPromise)return assetPromise;loaded=false;loadingError=false;loadCount=0;showMenu('main');
 assetPromise=(async()=>{const entries=Object.entries(window.ART||{});let done=0;try{
 if(!entries.length)throw Error('Artwork catalog unavailable');
 await Promise.all(entries.map(([name,a])=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>{images[name]=i;loadCount=Math.round(++done/entries.length*100);const label=$('#load-label');if(!loadingError&&!loaded){if(label)label.textContent='LOADING '+loadCount+'%';$('.load-track')?.style.setProperty('width',loadCount+'%');}resolve()};i.onerror=()=>reject(Error('Could not load '+a.src));i.src=a.src})));
 await document.fonts.ready;loaded=true;showMenu('main');
 }catch(e){loadingError=true;console.error(e);showMenu('main')}finally{assetPromise=null}})();return assetPromise;
}
const modelContext=document.modelContext;if(modelContext?.registerTool){const lifetime=new AbortController();const reg=tool=>{try{Promise.resolve(modelContext.registerTool(tool,{signal:lifetime.signal})).catch(()=>{})}catch{}};reg({name:'read_game_status',description:'Read the current chapter, game state, health and supplies.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({state:mode,loaded,chapter:run?run.chapter+1:null,area:run?run.area+1:null,health:run?.player.hp??null,score:run?.score??0})});reg({name:'pause_game',description:'Pause the active game using the same action as the Pause button.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:()=>{pause();return{state:mode}}});window.addEventListener('pagehide',()=>lifetime.abort(),{once:true})}
showMenu('main');resize();loadAssets();requestAnimationFrame(loop);
})();
