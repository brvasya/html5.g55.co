import {BombGame,COLS,ROWS,THEMES,NAMES,key} from './engine.mjs';
import {isGameplayKey,readPlayerInputs} from './input.mjs';

const game=new BombGame(),canvas=document.getElementById('arena'),ctx=canvas.getContext('2d',{alpha:false}),ui=document.getElementById('interface');
const W=1280,H=824,T=64,OX=96,OY=60;
const colors=['#78c5ff','#ff6d65','#d0d9dd','#edb16d'];
const itemIndex={bomb:1,flame:2,speed:3,shield:4,kick:5,defuse:6};
const itemNames={bomb:'EXTRA C4',flame:'LONGER BLAST',speed:'SPEED UP',shield:'ARMOR EQUIPPED',kick:'BOMB KICK',defuse:'DEFUSE KIT'};
const soundIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4 5 9H2v6h3l6 5z"/><path d="M15 8q5 4 0 8M18 4q9 8 0 16"/></svg>';
const muteIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4 5 9H2v6h3l6 5zM16 9l6 6m0-6-6 6"/></svg>';
const pauseIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke-width="5"/></svg>';
const fullIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';
const moreLink=()=>'<a class="secondary more-games-button" href="https://g55.co/?utm_source=moreGamesButton&amp;utm_medium='+encodeURIComponent(document.title)+'" target="_blank" rel="noopener">MORE GAMES</a>';
const secondaryAction=(action,label)=>`<div class="secondary-action">${moreLink()}<button type="button" class="text-action" data-action="${action}">${label}</button></div>`;
const coarse=matchMedia('(pointer:coarse)'),reduceMotion=matchMedia('(prefers-reduced-motion:reduce)');
let selectedTheme=0,selectedPlayers=1,guide=false,overlayKind='',lastState='',lastCountdown='',assetsReady=false,toastUntil=0,toastText='',shake=0,particles=[],clock=0,frameTime=0,hudAt=0,width=0,height=0,dpr=1;
const assets={chars:[],terrain:[],items:[],floors:[]};
const held=new Map(),touchHeld=new Map();let order=0;
let soundOn=true;try{soundOn=localStorage.getItem('bombstrike-sound')!=='off';}catch{}
class AudioFX{
 constructor(){this.ctx=null;this.lastBeep=0;}
 unlock(){try{if(!this.ctx)this.ctx=new(window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});}catch{}}
 tone(freq,len=.1,type='square',vol=.045,fall=0,delay=0){if(!soundOn||!this.ctx)return;const a=this.ctx,t=a.currentTime+delay,o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(fall)o.frequency.exponentialRampToValueAtTime(Math.max(30,fall),t+len);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+len);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+len+.01);}
 play(type){if(!soundOn||!this.ctx)return;switch(type){
  case'plant':this.tone(160,.1,'square',.035,75);this.tone(1100,.07,'sine',.035,700,.025);break;
  case'beep':if(this.ctx.currentTime-this.lastBeep>.08){this.lastBeep=this.ctx.currentTime;this.tone(1500,.04,'sine',.016);}break;
  case'explode':{const a=this.ctx,t=a.currentTime,n=a.createBuffer(1,Math.floor(a.sampleRate*.33),a.sampleRate),v=n.getChannelData(0);for(let i=0;i<v.length;i++)v[i]=(Math.random()*2-1)*Math.pow(1-i/v.length,2);const s=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();s.buffer=n;f.type='lowpass';f.frequency.setValueAtTime(1700,t);f.frequency.exponentialRampToValueAtTime(90,t+.3);g.gain.value=.18;s.connect(f);f.connect(g);g.connect(a.destination);s.start();this.tone(100,.3,'sine',.17,32);break;}
  case'pickup':this.tone(560,.1,'triangle',.1);this.tone(820,.15,'triangle',.1,0,.07);break;
  case'death':this.tone(300,.22,'sawtooth',.055,45);break;
  case'kick':this.tone(130,.08,'triangle',.09,55);break;
  case'shield':case'defuse':this.tone(1700,.3,'sine',.065,260);break;
  case'go':this.tone(620,.08,'square',.045);this.tone(930,.17,'square',.055,0,.08);break;
  case'closing':this.tone(220,.15,'sawtooth',.04,420);this.tone(220,.15,'sawtooth',.04,420,.22);break;
  case'win':[392,494,587,784].forEach((f,i)=>this.tone(f,.22,'triangle',.1,0,i*.13));break;
  case'lose':this.tone(260,.25,'triangle',.07,150);this.tone(180,.35,'triangle',.08,90,.23);break;
  case'click':this.tone(680,.045,'triangle',.08,350);break;
 }}
}
const audio=new AudioFX();
function imageLoad(path){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Could not load '+path));im.src=path;});}
async function load(){
 const jobs=[];for(let a=0;a<4;a++){assets.chars[a]=[];for(let f=0;f<6;f++)jobs.push({path:`assets/char-${a}-${f}.png`,set:im=>assets.chars[a][f]=im});}
 for(let t=0;t<3;t++){assets.terrain[t]=[];for(let s=0;s<4;s++)jobs.push({path:`assets/terrain-${t}-${s}.png`,set:im=>assets.terrain[t][s]=im});jobs.push({path:`assets/floor-${t}.png`,set:im=>assets.floors[t]=im});}
 for(let i=0;i<8;i++)jobs.push({path:`assets/item-${i}.png`,set:im=>assets.items[i]=im});
 jobs.push({path:'assets/g55-logo.png',set:()=>{}});let done=0;
 try{await Promise.all(jobs.map(async job=>{job.set(await imageLoad(job.path));done++;const p=Math.round(done/jobs.length*100);document.getElementById('load-progress').value=p;document.querySelector('#loading span').textContent='Preparing the arena… '+p+'%';}));assetsReady=true;document.getElementById('loading').remove();initUI();resize();requestAnimationFrame(loop);registerTools();}
 catch{const loading=document.getElementById('loading');loading.querySelector('span').textContent='The artwork could not load. Please reload to try again.';const actions=document.createElement('div');actions.className='secondary-action';actions.innerHTML=moreLink();const b=document.createElement('button');b.type='button';b.className='text-action';b.textContent='Reload Game';b.onclick=()=>location.reload();actions.append(b);loading.append(actions);}
}
function initUI(){
 ui.innerHTML=`<header class="hud"><div class="brand">BOMBSTRIKE<small>URBAN BLAST</small></div><div class="round-info"><div><span class="eyebrow">ROUND</span><strong id="round-no">1</strong></div><strong id="timer" class="timer">01:30</strong></div><div id="rivals" class="rivals"></div><div class="tools"><button class="tool sound" data-action="sound" aria-label="${soundOn?'Mute':'Enable'} sound" title="Sound">${soundOn?soundIcon:muteIcon}</button><button class="tool fullscreen" data-action="fullscreen" aria-label="Fullscreen" title="Fullscreen">${fullIcon}</button><button class="tool" data-action="pause" aria-label="Pause game" title="Pause · P / Esc">${pauseIcon}</button></div></header><div class="bottom-bar"><div id="inventory" class="inventory"></div><div class="hint"><kbd>WASD</kbd> MOVE <kbd>SPACE</kbd> PLANT <kbd>E</kbd> DEFUSE <kbd>P</kbd> PAUSE</div><div id="arena-name" class="arena-name"></div></div><div class="touch-controls"><div class="dpad" role="group" aria-label="Movement controls"><button aria-label="Move up">▲</button><button aria-label="Move right">▶</button><button aria-label="Move down">▼</button><button aria-label="Move left">◀</button></div><div class="touch-actions"><button class="touch-defuse" aria-label="Hold to defuse" title="Hold to defuse">✂</button><button class="touch-bomb" aria-label="Plant bomb">PLANT<br>C4</button></div></div><div id="spectating" class="spectating" hidden><span>YOU'RE OUT</span><button type="button" class="primary restart-button" data-action="restart">RESTART ROUND</button></div><div id="toast" class="toast" role="status" hidden></div><div id="countdown" class="countdown" hidden></div><div id="overlay" class="overlay"></div>`;
 ui.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;audio.unlock();const act=b.dataset.action;if(act!=='sound')audio.play('click');switch(act){case'start':startMatch();break;case'restart':restartRound();break;case'theme':selectedTheme=Number(b.dataset.theme);game.theme=selectedTheme;game.createRound();game.state='menu';renderOverlay('menu',true);break;case'guide':guide=true;renderOverlay('guide',true);break;case'back':guide=false;renderOverlay('menu',true);break;case'pause':togglePause();break;case'resume':clearInput();game.resume();syncUI();break;case'menu':clearInput();game.state='menu';guide=false;game.createRound();game.state='menu';syncUI();break;case'next':game.nextRound();syncUI();break;case'sound':soundOn=!soundOn;try{localStorage.setItem('bombstrike-sound',soundOn?'on':'off');}catch{}document.querySelectorAll('.sound').forEach(b=>{b.innerHTML=soundOn?soundIcon:muteIcon;b.setAttribute('aria-label',soundOn?'Mute sound':'Enable sound');});break;case'fullscreen':try{if(document.fullscreenElement)document.exitFullscreen()?.catch(()=>{});else document.getElementById('game').requestFullscreen?.().catch(()=>toast('FULLSCREEN IS UNAVAILABLE HERE'));}catch{toast('FULLSCREEN IS UNAVAILABLE HERE');}break;}});
 ui.addEventListener('change',e=>{if(e.target.name!=='players'||game.state!=='menu')return;selectedPlayers=coarse.matches?1:Number(e.target.value)===2?2:1;game.playerCount=selectedPlayers;clearInput();renderOverlay('menu',true);ui.querySelector('input[name="players"]:checked')?.focus({preventScroll:true});});
 const pad=ui.querySelector('.dpad');const padMove=e=>{const r=pad.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;const dir=Math.abs(x)>Math.abs(y)?(x>0?1:3):(y>0?0:2);touchHeld.set(e.pointerId,{dir,order:++order});[...pad.children].forEach((b,i)=>b.classList.toggle('active',[2,1,0,3][i]===dir));};
 pad.addEventListener('pointerdown',e=>{e.preventDefault();audio.unlock();pad.setPointerCapture(e.pointerId);padMove(e);});pad.addEventListener('pointermove',e=>{if(pad.hasPointerCapture(e.pointerId))padMove(e);});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(type,e=>{touchHeld.delete(e.pointerId);[...pad.children].forEach(b=>b.classList.remove('active'));});
 for(const [sel,action]of [['.touch-bomb','plant'],['.touch-defuse','defuse']]){const b=ui.querySelector(sel);b.addEventListener('pointerdown',e=>{e.preventDefault();audio.unlock();b.setPointerCapture(e.pointerId);touchHeld.set(e.pointerId,{action});});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,e=>touchHeld.delete(e.pointerId));}
 syncUI();updateHUD();
}
function startMatch(){audio.unlock();clearInput();guide=false;if(coarse.matches)selectedPlayers=1;game.start(selectedTheme,selectedPlayers);particles=[];shake=0;toastUntil=0;syncUI();updateHUD();}
function restartRound(){if(!game.restartRound())return;audio.unlock();clearInput();particles=[];shake=0;toastUntil=0;lastCountdown='';syncUI();updateHUD();}
function clearInput(){held.clear();touchHeld.clear();document.querySelectorAll('.dpad .active').forEach(b=>b.classList.remove('active'));}
function togglePause(){clearInput();if(game.state==='paused')game.resume();else game.pause();syncUI();}
function modePicker(){return `<fieldset class="mode-picker" aria-label="Players"><label class="${selectedPlayers===1?'selected':''}"><input type="radio" name="players" value="1" ${selectedPlayers===1?'checked':''}><strong>1 PLAYER</strong><small>3 BOT RIVALS</small></label><label class="${selectedPlayers===2?'selected':''} ${coarse.matches?'unavailable':''}"><input type="radio" name="players" value="2" ${selectedPlayers===2?'checked':''} ${coarse.matches?'disabled':''}><strong>2 PLAYERS</strong><small>${coarse.matches?'DESKTOP KEYBOARD':'SAME KEYBOARD · 2 BOTS'}</small></label></fieldset>`;}
function menuControls(compact=false){if(selectedPlayers===2)return compact?'P1 WASD/SPACE · P2 ↑↓←→/ENTER':'P1 WASD + SPACE · P2 ARROWS + ENTER';return coarse.matches?(compact?'PAD MOVE · PLANT C4':'PAD to move · PLANT for C4'):(compact?'WASD MOVE · SPACE PLANT':'WASD / ARROWS to move · SPACE to plant');}
function controlGuide(){const rows=selectedPlayers===2?[['P1 · WASD','Move'],['P2 · ARROWS','Move'],['P1 · SPACE','Plant C4'],['P2 · ENTER','Plant C4'],['P1 · HOLD E','Defuse kit'],['P2 · HOLD RIGHT SHIFT','Defuse kit'],['P / ESC','Pause for both players']]:[['WASD / ARROWS','Move'],['SPACE','Plant C4'],['HOLD E','Use defuse kit'],['P / ESC','Pause']];return `<div class="control-guide ${selectedPlayers===2?'dual-guide':''}">${rows.map(([keys,action])=>`<div><b>${keys}</b><span>${action}</span></div>`).join('')}</div>`;}
function renderOverlay(kind,force=false){
 if(kind===overlayKind&&!force)return;overlayKind=kind;const el=document.getElementById('overlay');if(!kind){el.hidden=true;el.innerHTML='';return;}el.hidden=false;
 if(kind==='menu')el.innerHTML=`<section class="panel" aria-label="Start menu"><div class="menu-head"><div class="title-lockup"><h1>BOMBSTRIKE</h1><div class="subtitle">URBAN BLAST</div><div class="tagline">4 OPERATIVES · FIRST TO 3 WINS</div></div><div class="menu-hero" aria-hidden="true"><img src="assets/char-0-0.png"><img src="assets/char-1-2.png"></div></div>${modePicker()}<div class="section-label">CHOOSE YOUR ARENA</div><div class="arenas">${THEMES.map((t,i)=>`<button class="arena-card ${selectedTheme===i?'selected':''}" data-action="theme" data-theme="${i}" aria-pressed="${selectedTheme===i}"><img src="assets/terrain-${i}-3.png" alt=""><strong>${t.name}</strong><small>${t.sub}</small><span class="number">0${i+1}${selectedTheme===i?' · SELECTED':''}</span></button>`).join('')}</div><div class="start-row"><button class="primary" data-action="start">START GAME</button>${moreLink()}</div><div class="menu-footer"><div class="menu-help"><button type="button" class="text-action" data-action="guide">How to Play</button><span class="help-separator" aria-hidden="true">·</span><span class="micro"><span class="controls-full">${menuControls()}</span><span class="controls-compact">${menuControls(true)}</span></span></div><img class="menu-logo" src="assets/g55-logo.png" alt="G55.CO" draggable="false"></div></section>`;
 else if(kind==='guide')el.innerHTML=`<section class="panel guide-panel" aria-label="How to play"><h2>PLANT. ESCAPE. REPEAT.</h2><p>Break cover, collect gear, and catch your rivals in the blast. Explosions travel in a cross and can trigger other bombs. Your own bombs can take you out, too.</p>${controlGuide()}<div class="pickup-guide">${[['bomb','Extra C4','Carry more bombs'],['flame','Blast range','Reach farther'],['speed','Combat boots','Move faster'],['shield','Armor','Survive one blast'],['kick','Bomb kick','Push bombs by walking into them'],['defuse','Defuse kit','Hold still beside a bomb to disarm']].map(([id,title,sub])=>`<div><img src="assets/item-${itemIndex[id]}.png" alt=""><span><strong>${title}</strong><small>${sub}</small></span></div>`).join('')}</div><p>Last operative standing wins the round. First to three wins the match. Watch for danger tiles when the clock reaches 30 seconds!</p><button class="primary" data-action="back">GOT IT</button></section>`;
 else if(kind==='paused')el.innerHTML=`<section class="panel pause-panel"><div class="result-kicker">TAKE A BREATHER</div><h2>GAME PAUSED</h2><p>${THEMES[game.theme].name} · Round ${game.round}${game.playerCount===2?' · 2 Players':''}</p><button class="primary" data-action="resume">RESUME GAME</button>${secondaryAction('menu','Back to Menu')}</section>`;
 else if(kind==='roundEnd'||kind==='matchEnd'){
  const winner=game.result.winner,isWin=game.isHuman(winner),match=kind==='matchEnd',dual=game.playerCount===2;const title=winner===null?'DOUBLE TROUBLE':dual?(isWin?'PLAYER '+(winner+1):game.playerName(winner))+' WINS':isWin?(match?'MISSION COMPLETE':'ROUND WON'):(match?'MATCH OVER':game.playerName(winner)+' WINS');
  el.innerHTML=`<section class="panel result-panel"><div class="result-kicker">${match?'FIRST TO THREE':`ROUND ${game.round} COMPLETE`}</div><img class="result-hero" src="assets/char-${winner??0}-0.png" alt="${winner===null?'Operative':game.playerName(winner)}"><h2>${title}</h2><p>${winner===null?'No survivors. No points. Another round?':dual?(match?'The match is decided. Ready for a rematch?':'One point earned. First to three wins the match.'):match?(isWin?'You are the last word in demolition.':'A rematch is only one fuse away.'):(isWin?'Clean escape. Messy courtyard.':'Time to return the favor.')}</p><div class="standings">${NAMES.map((name,i)=>`<div class="standing ${winner===i?'winner':''}"><img src="assets/char-${i}-0.png" alt=""><small>${game.playerName(i)}</small><strong>${game.scores[i]}</strong></div>`).join('')}</div><div class="result-actions"><button class="primary" data-action="${match?'start':'next'}">${match?'PLAY AGAIN':'NEXT ROUND'}${match?'':' <span id="next-in">5</span>'}</button>${secondaryAction('menu','Choose Arena')}</div></section>`;
 }
}
function syncUI(){
 if(!assetsReady)return;const s=game.state;if(s==='menu'&&coarse.matches){selectedPlayers=1;game.playerCount=1;}const root=document.getElementById('game');root.classList.toggle('menu-mode',s==='menu');root.classList.toggle('two-player',game.playerCount===2);
 const overlay=s==='menu'?(guide?'guide':'menu'):['paused','roundEnd','matchEnd'].includes(s)?s:'';renderOverlay(overlay);
 const countdown=document.getElementById('countdown');countdown.hidden=s!=='countdown';if(s==='countdown'){const number=String(Math.max(1,Math.ceil(game.countdown)));if(lastCountdown!==number){lastCountdown=number;countdown.innerHTML=`<div><strong>${number}</strong><small>GET READY</small></div>`;audio.tone(390,.06,'sine',.045);}}else lastCountdown='';
 const spectating=document.getElementById('spectating'),out=game.actors.filter(a=>game.isHuman(a.id)&&!a.alive);spectating.hidden=s!=='playing'||out.length===0;const message=game.playerCount===1?"YOU'RE OUT":out.length===2?'BOTH PLAYERS OUT':out.length?game.playerName(out[0].id)+' IS OUT · '+game.playerName(1-out[0].id)+' IS STILL IN':'';const label=spectating.querySelector('span');if(label.textContent!==message)label.textContent=message;spectating.querySelector('.restart-button').hidden=!game.canRestartRound();
 const next=document.getElementById('next-in');if(next)next.textContent='· '+Math.max(1,Math.ceil(game.intermission));
 const controls=ui.querySelector('.touch-controls');controls.style.visibility=game.playerCount===1&&(s==='playing'||s==='countdown')?'visible':'hidden';
 if(s!==lastState){lastState=s;updateHUD();}
}
function updateHUD(){
 document.getElementById('round-no').textContent=game.round;
 const seconds=Math.max(0,Math.ceil(game.remaining));const timer=document.getElementById('timer');timer.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');timer.classList.toggle('danger',seconds<=30);
 document.getElementById('rivals').innerHTML=NAMES.map((name,i)=>`<div class="rival ${game.isHuman(i)?'human':''} ${game.actors[i].alive?'':'eliminated'}"><div class="portrait"><img src="assets/char-${i}-0.png" alt="${game.playerName(i)}"></div><div><div class="rival-name">${game.playerName(i)}</div><div class="score-dots" aria-label="${game.scores[i]} wins">${[0,1,2].map(n=>`<i class="${game.scores[i]>n?'won':''}"></i>`).join('')}</div></div></div>`).join('');
 const p=game.actors[0];document.getElementById('inventory').innerHTML=game.actors.filter(a=>game.isHuman(a.id)).map(a=>{const stats=[['bomb',a.bombs],['flame',a.range],...(a.shield?[['shield',1]]:[]),...(a.kick?[['kick','']]:[]),...(a.kit?[['defuse',a.kit]]:[])];return `<div class="player-inventory ${a.alive?'':'eliminated'}" aria-label="${game.playerName(a.id)} equipment">${game.playerCount===2?`<strong class="inventory-label player-${a.id}">${game.playerName(a.id)}</strong>`:''}${stats.map(([id,n])=>`<span title="${itemNames[id]}"><img src="assets/item-${itemIndex[id]}.png" alt="${itemNames[id]}">${n}</span>`).join('')}</div>`;}).join('');
 const hint=ui.querySelector('.hint');if(hint.dataset.players!==String(game.playerCount)){hint.dataset.players=String(game.playerCount);hint.innerHTML=game.playerCount===2?'<span class="player-0">P1 <kbd>WASD</kbd> <kbd>SPACE</kbd> C4 <kbd>E</kbd> DEFUSE</span><span class="player-1">P2 <kbd>ARROWS</kbd> <kbd>ENTER</kbd> C4 <kbd>R SHIFT</kbd> DEFUSE</span><span><kbd>P / ESC</kbd> PAUSE</span>':'<kbd>WASD</kbd> MOVE <kbd>SPACE</kbd> PLANT <kbd>E</kbd> DEFUSE <kbd>P</kbd> PAUSE';}
 document.getElementById('arena-name').textContent=THEMES[game.theme].name;ui.querySelector('.touch-defuse').hidden=!p.kit;
}
function toast(text){toastText=text;toastUntil=clock+2;const el=document.getElementById('toast');el.hidden=false;el.textContent=text;}
function handleEvents(){
 for(const event of game.events){if(event.type==='pickup'){if(game.isHuman(event.id)){audio.play('pickup');toast((game.playerCount===2?game.playerName(event.id)+' · ':'')+itemNames[event.item]);burst(event.x,event.y,10,'pickup');}}else if(event.type==='result'){audio.play(game.isHuman(event.winner)?'win':'lose');clearInput();}else if(event.type==='round'){particles=[];clearInput();}
  else{audio.play(event.type);if(event.type==='explode'){shake=Math.min(7,shake+3.8);burst(event.x,event.y,18,'fire');}if(event.type==='crate')burst(event.x,event.y,7,'wood');if(event.type==='death')burst(event.x,event.y,14,'smoke');if(event.type==='drop'){shake=Math.max(2.5,shake);burst(event.x,event.y,4,'smoke');}if(event.type==='closing'&&game.closeRing===1)toast('SUDDEN DEATH · KEEP MOVING');}}
 game.events.length=0;
}
function burst(x,y,n,kind){for(let i=0;i<n;i++){const angle=Math.random()*Math.PI*2,speed=kind==='wood'?75+Math.random()*110:30+Math.random()*140;particles.push({x:OX+(x+.5)*T,y:OY+(y+.5)*T,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-30,age:0,life:.4+Math.random()*.55,size:kind==='smoke'?10+Math.random()*16:2+Math.random()*5,kind,rot:Math.random()*6});}if(particles.length>600)particles.splice(0,particles.length-600);}
function resize(){width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.floor(width*dpr);canvas.height=Math.floor(height*dpr);}
function roundRect(x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function anchored(im,x,y,h,flip=false){const w=h*im.width/im.height;ctx.save();ctx.translate(x,y);if(flip)ctx.scale(-1,1);ctx.drawImage(im,-w/2,-h,w,h);ctx.restore();}
function actorDraw(a,dead=false){
 const dir=a.dir,frame=dead?0:(a.moving?Math.floor(a.walk)%2:0),col=(dir===2?4:dir===1||dir===3?2:0)+frame;const im=assets.chars[a.id][col];
 const x=OX+(a.x+.5)*T,y=OY+(a.y+.93)*T,bob=a.moving?Math.sin(a.walk*Math.PI)*1.6:Math.sin(clock*2+a.id)*.65;
 ctx.save();if(a.invulnerable>0&&Math.floor(clock*12)%2)ctx.globalAlpha=.38;
 ctx.fillStyle='#0c0e1099';ctx.beginPath();ctx.ellipse(x,y-3,19,7,0,0,Math.PI*2);ctx.fill();
 if(dead){const progress=Math.min(1,(game.time-a.time)/.55);ctx.globalAlpha*=1-progress*.8;ctx.translate(x,y-14);ctx.rotate(progress*(a.id%2?1.4:-1.4));anchored(im,0,10,69-progress*10,dir===3);}
 else{
  if(game.isHuman(a.id)){ctx.strokeStyle=colors[a.id];ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y-1,23,9,0,0,Math.PI*2);ctx.stroke();}
  anchored(im,x,y+bob,73,dir===3);
  if(a.shield){ctx.strokeStyle='#72d7ff88';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y-34,29,41,0,0,Math.PI*2);ctx.stroke();}
  if(game.isHuman(a.id)){ctx.fillStyle=colors[a.id];ctx.beginPath();ctx.moveTo(x-5,y-82);ctx.lineTo(x+5,y-82);ctx.lineTo(x,y-76);ctx.fill();if(game.playerCount===2){roundRect(x-15,y-104,30,19,4,'#0c1821');ctx.fillStyle=colors[a.id];ctx.font='bold 14px Arial';ctx.textAlign='center';ctx.fillText(game.playerName(a.id),x,y-90);}}
  if(a.defusing>0){ctx.strokeStyle='#7ff0f9';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y-34,34,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,a.defusing/.65));ctx.stroke();}
 }
 ctx.restore();
}
const backdrops=[];
function backdrop(theme){
 if(backdrops[theme])return backdrops[theme];const c=document.createElement('canvas');c.width=W;c.height=H;const p=c.getContext('2d'),base=['#65533c','#62473a','#293c49'][theme];p.fillStyle=base;p.fillRect(0,0,W,H);
 p.globalAlpha=.48;for(let y=-1;y<14;y++)for(let x=-1;x<21;x++)p.drawImage(assets.floors[theme],x*T,y*T,T,T);p.globalAlpha=1;
 p.fillStyle='#10182033';p.fillRect(0,0,W,H);p.fillStyle='#02091188';p.fillRect(OX-7,OY+9,COLS*T+14,ROWS*T+7);
 const deco=assets.terrain[theme][3];for(const [x,y,s] of [[W/2,-48,140],[30,190,104],[W-27,420,110],[240,H-18,100],[W-200,H-18,106]]){const dw=s*deco.width/deco.height;p.save();p.translate(x,y);p.drawImage(deco,-dw/2,-s/2,dw,s);p.restore();}
 for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){p.save();p.translate(OX+(x+.5)*T,OY+(y+.5)*T);if((x*7+y*13)%3===1)p.rotate(Math.PI);p.drawImage(assets.floors[theme],-T/2,-T/2,T,T);p.restore();p.strokeStyle=theme===2?'#13233138':'#73512f30';p.strokeRect(OX+x*T,OY+y*T,T,T);}
 backdrops[theme]=c;return c;
}
function flameDraw(){
 const cells=new Set(game.flames.map(f=>f.k));for(const f of game.flames){const x=OX+(f.x+.5)*T,y=OY+(f.y+.5)*T,life=Math.min(1,(f.until-game.time)/.12),wobble=Math.sin(clock*44+f.k)*3;ctx.globalAlpha=life;
 const left=cells.has(f.k-1)?T/2:18,right=cells.has(f.k+1)?T/2:18,up=cells.has(f.k-COLS)?T/2:18,down=cells.has(f.k+COLS)?T/2:18;
 ctx.shadowColor='#ff9526';ctx.shadowBlur=17;roundRect(x-left,y-19-wobble/2,left+right,38+wobble,12,'#ef6316');roundRect(x-19-wobble/2,y-up,38+wobble,up+down,12,'#ef6316');ctx.shadowBlur=0;
 roundRect(x-left,y-13,left+right,26,10,'#ffd535');roundRect(x-13,y-up,26,up+down,10,'#ffd535');roundRect(x-left+3,y-6,left+right-6,12,6,'#fff9ac');roundRect(x-6,y-up+3,12,up+down-6,6,'#fff9ac');
 }ctx.globalAlpha=1;
}
function drawWorld(){
 const theme=game.theme;ctx.drawImage(backdrop(theme),0,0);
 for(const w of game.warning){const alpha=.18+.25*(.5+.5*Math.sin(clock*16));ctx.fillStyle=`rgba(250,65,30,${alpha})`;ctx.fillRect(OX+w.x*T,OY+w.y*T,T,T);ctx.strokeStyle='#ffb75f';ctx.lineWidth=2;ctx.strokeRect(OX+w.x*T+5,OY+w.y*T+5,T-10,T-10);ctx.beginPath();ctx.moveTo(OX+w.x*T+18,OY+w.y*T+18);ctx.lineTo(OX+w.x*T+46,OY+w.y*T+46);ctx.moveTo(OX+w.x*T+46,OY+w.y*T+18);ctx.lineTo(OX+w.x*T+18,OY+w.y*T+46);ctx.stroke();}
 for(const [k,item]of game.items){if(item.revealAt>game.time)continue;const x=k%COLS,y=Math.floor(k/COLS),bob=Math.sin(clock*4+k)*2;ctx.fillStyle='#17212833';ctx.beginPath();ctx.ellipse(OX+(x+.5)*T,OY+(y+.83)*T,17,5,0,0,Math.PI*2);ctx.fill();anchored(assets.items[itemIndex[item.type]],OX+(x+.5)*T,OY+(y+.83)*T+bob,39);}
 for(let y=0;y<ROWS;y++){
  for(let x=0;x<COLS;x++){const cell=game.cell(x,y),px=OX+x*T,py=OY+y*T;if(cell===1){ctx.fillStyle='#10161e55';ctx.fillRect(px+5,py+5,T,T);ctx.drawImage(assets.terrain[theme][1],px-1,py-9,T+2,T+11);}else if(cell===2){ctx.fillStyle='#10161e66';ctx.beginPath();ctx.ellipse(px+T/2+4,py+T-6,26,8,0,0,Math.PI*2);ctx.fill();ctx.drawImage(assets.terrain[theme][2],px+3,py-2,T-6,T+2);}}
  for(const b of game.bombs)if(Math.round(b.y)===y){const pulse=.96+Math.sin(clock*(b.fuse<.8?28:12))*.045,x=OX+(b.x+.5)*T,by=OY+(b.y+.89)*T;ctx.fillStyle='#131b1d77';ctx.beginPath();ctx.ellipse(x,by-6,19,7,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle=b.fuse<.8?'#ff6952aa':'#f9c46588';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,by-19,25,-Math.PI/2,-Math.PI/2+Math.PI*2*b.fuse/2.6);ctx.stroke();anchored(assets.items[0],x,by,48*pulse);}
  for(const a of game.dead)if(Math.round(a.y)===y&&game.time-a.time<.7)actorDraw(a,true);
  for(const a of game.actors)if(a.alive&&Math.round(a.y)===y)actorDraw(a);
 }
 flameDraw();
 for(const p of particles){const alpha=Math.max(0,1-p.age/p.life);ctx.save();ctx.translate(p.x,p.y);ctx.globalAlpha=alpha;if(p.kind==='wood'){ctx.rotate(p.rot+p.age*4);ctx.drawImage(assets.items[7],-p.size*2,-p.size*2,p.size*4,p.size*4);}else if(p.kind==='smoke'){ctx.fillStyle='#9eaaa966';ctx.beginPath();ctx.arc(0,0,p.size*(1+p.age),0,Math.PI*2);ctx.fill();}else{ctx.fillStyle=p.kind==='pickup'?'#a1e9ff':p.age<.2?'#fff3a6':'#f89429';ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);}ctx.restore();}
 const vignette=ctx.createRadialGradient(W/2,H/2,260,W/2,H/2,760);vignette.addColorStop(0,'#00000000');vignette.addColorStop(1,'#050e164f');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
}
function render(){
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#111d26';ctx.fillRect(0,0,width,height);
 const small=width<700,landscape=height<580&&width>=650,menu=game.state==='menu';const top=menu?0:small?70:landscape?67:87,bottom=menu?0:game.playerCount===2?(small?170:94):coarse.matches?(landscape?35:178):57;
 const scale=Math.min(width/W,(height-top-bottom)/H),x=(width-W*scale)/2,y=top+(height-top-bottom-H*scale)/2;
 ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);if(!reduceMotion.matches&&game.state==='playing')ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);drawWorld();ctx.restore();
}
function readInput(){return readPlayerInputs(held,touchHeld,game.playerCount);}
function loop(now){const dt=Math.min(.05,(now-frameTime)/1000||.016);frameTime=now;clock+=dt;game.update(dt,readInput());handleEvents();shake=Math.max(0,shake-dt*23);if(game.state!=='paused')for(const p of particles){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.kind==='wood'?dt*230:dt*45;}particles=particles.filter(p=>p.age<p.life);syncUI();if(clock>hudAt){updateHUD();hudAt=clock+.18;}document.getElementById('toast').hidden=clock>toastUntil||game.state!=='playing';render();requestAnimationFrame(loop);}
window.addEventListener('resize',resize);coarse.addEventListener('change',()=>{resize();if(assetsReady&&game.state==='menu'){if(coarse.matches){selectedPlayers=1;game.playerCount=1;}renderOverlay(guide?'guide':'menu',true);}});
window.addEventListener('keydown',e=>{
 if(!assetsReady)return;
 const active=game.state==='playing'||game.state==='countdown',restartFocused=e.target.closest?.('[data-action="restart"]')&&game.canRestartRound();
 if(active&&isGameplayKey(e.code,game.playerCount)&&!restartFocused){e.preventDefault();if(!e.repeat&&!held.has(e.code))held.set(e.code,++order);return;}
 if(e.repeat){if(e.code==='Enter'||e.code==='Space')e.preventDefault();return;}
 if(e.code==='Escape'||e.code==='KeyP'){e.preventDefault();if(guide){guide=false;renderOverlay('menu',true);}else togglePause();return;}
 if(e.code==='Enter'&&e.target===document.body){e.preventDefault();audio.unlock();if(game.state==='menu'&&!guide||game.state==='matchEnd')startMatch();else if(game.state==='roundEnd'){clearInput();game.nextRound();syncUI();}else if(game.state==='paused'){clearInput();game.resume();syncUI();}}
});
window.addEventListener('keyup',e=>held.delete(e.code));
window.addEventListener('blur',()=>{clearInput();if(assetsReady){game.pause();syncUI();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(assetsReady){game.pause();syncUI();}}});
function registerTools(){
 if(!document.modelContext?.registerTool)return;const life=new AbortController();const tools=[
  {name:'get_game_state',title:'Read Bombstrike match',description:'Get the current arena, player count, match score, human players and bomb state.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>game.snapshot()},
  {name:'start_match',title:'Start Bombstrike match',description:'Start a fresh match in the selected arena, resetting the match score.',inputSchema:{type:'object',properties:{arena:{type:'string',enum:['dust','inferno','reactor']},players:{type:'integer',enum:[1,2]}},required:['arena'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{const i=THEMES.findIndex(t=>t.id===input?.arena);if(i<0)throw new Error('Choose dust, inferno, or reactor.');if(input?.players!==undefined&&![1,2].includes(input.players))throw new Error('Choose one or two players.');if(input?.players===2&&coarse.matches)throw new Error('Two players requires a desktop keyboard.');selectedTheme=i;selectedPlayers=input?.players??selectedPlayers;startMatch();return game.snapshot();}},
  {name:'set_game_paused',title:'Pause or resume Bombstrike',description:'Pause or resume a currently running match.',inputSchema:{type:'object',properties:{paused:{type:'boolean'}},required:['paused'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(typeof input?.paused!=='boolean')throw new Error('paused must be a boolean.');if(!['playing','countdown','paused'].includes(game.state))throw new Error('There is no active round.');clearInput();input.paused?game.pause():game.resume();syncUI();return {state:game.state};}}
 ];for(const tool of tools)try{Promise.resolve(document.modelContext.registerTool(tool,{signal:life.signal})).catch(()=>{});}catch{}window.addEventListener('pagehide',()=>life.abort(),{once:true});
}
load();
