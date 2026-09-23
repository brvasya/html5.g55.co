(function(){
'use strict';
const {Engine,THEMES,ENEMIES,AREA,LANES,clamp}=window.HL2Core;
const $=id=>document.getElementById(id),canvas=$('world'),ctx=canvas.getContext('2d',{alpha:false});
const game=new Engine(),images={},keys=new Set(),held=new Set(),catalog=window.HL2_ASSETS||{};
const SAVE_KEY='hl2-beat-em-up-checkpoint-v1',MUTE_KEY='hl2-beat-em-up-muted';
const moreURL='https://g55.co/?utm_source=moreGamesButton&utm_medium='+encodeURIComponent(document.title);
let width=1,height=1,dpr=1,zoom=1,camera=0,horizon=0,groundBase=0,laneScale=.72,lastTime=0,uiClock=0;
let loadDone=false,loadFailed=false,overlayType='',helpBack='main',noticeTime=0,shake=0,flash=0;
let transition=null,touchMode=false,stickPointer=null,stickX=0,stickY=0,stickStart={x:0,y:0};
let effects=[],floats=[],pulses=[],arcs=[],cinematic=true,heroTime=0;
let audioContext=null,master=null,muted=false;
try{muted=localStorage.getItem(MUTE_KEY)==='1';}catch{}
document.querySelectorAll('.more-games').forEach(a=>a.href=moreURL);
function initAudio(){if(audioContext){if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});return;}try{audioContext=new(window.AudioContext||window.webkitAudioContext)();master=audioContext.createGain();master.gain.value=muted?0:.26;master.connect(audioContext.destination);}catch{}}
function tone(f,d,v=.25,type='triangle',end,delay=0){if(!audioContext||muted)return;const t=audioContext.currentTime+delay,o=audioContext.createOscillator(),g=audioContext.createGain();o.type=type;o.frequency.setValueAtTime(f,t);if(end)o.frequency.exponentialRampToValueAtTime(end,t+d);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g);g.connect(master);o.start(t);o.stop(t+d+.01);}
function noise(d,v=.4,cutoff=1400){if(!audioContext||muted)return;const n=Math.floor(audioContext.sampleRate*d),b=audioContext.createBuffer(1,n,audioContext.sampleRate),data=b.getChannelData(0);for(let i=0;i<n;i++)data[i]=(Math.random()*2-1)*(1-i/n);const src=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),g=audioContext.createGain();src.buffer=b;filter.type='lowpass';filter.frequency.value=cutoff;g.gain.value=v;src.connect(filter);filter.connect(g);g.connect(master);src.start();}
function sound(name){switch(name){
 case'hit':noise(.07,.3,1700);tone(225,.095,.25,'triangle',53);break;
 case'swing':noise(.12,.16,3100);break;
 case'heavy':noise(.24,.2,1800);tone(65,.13,.12,'sawtooth',31);break;
 case'gravity':tone(68,.28,.26,'sawtooth',470);tone(390,.42,.11,'sine',64);noise(.22,.32,2500);break;
 case'enemyShot':noise(.09,.21,3400);tone(110,.12,.16,'sawtooth',39);break;
 case'enemySwing':noise(.17,.13,800);break;
 case'dash':noise(.14,.12,650);break;
 case'hurt':noise(.13,.26,470);tone(63,.17,.3,'sawtooth',27);break;
 case'pickup':tone(610,.12,.16);tone(900,.16,.12,'triangle',null,.07);break;
 case'break':noise(.24,.32,1100);break;
 case'clear':tone(280,.17,.15);tone(420,.20,.12,'triangle',null,.11);tone(560,.28,.1,'triangle',null,.24);break;
 case'bossdown':tone(74,.75,.3,'sawtooth',26);noise(.4,.27,600);break;
}}
function updateSound(){const b=$('sound-button');b.classList.toggle('muted',muted);b.setAttribute('aria-label',muted?'Unmute sound':'Mute sound');b.title=muted?'Sound off (M)':'Sound on (M)';if(master)master.gain.value=muted?0:.26;}
function toggleSound(){muted=!muted;try{localStorage.setItem(MUTE_KEY,muted?'1':'0');}catch{}initAudio();updateSound();}
function fullscreen(){if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});else document.documentElement.requestFullscreen?.().catch(()=>showNotice('FULLSCREEN IS NOT AVAILABLE HERE',2));}
function readSave(){try{const s=JSON.parse(localStorage.getItem(SAVE_KEY));return s&&Number.isInteger(s.chapter)&&s.chapter>=0&&s.chapter<5?s:null;}catch{return null;}}
function writeSave(s){try{localStorage.setItem(SAVE_KEY,JSON.stringify(s));}catch{}}
function deleteSave(){try{localStorage.removeItem(SAVE_KEY);}catch{}}
function showNotice(text,duration=2){$('notice').textContent=text;noticeTime=duration;$('notice').classList.add('show');}
function clearInput(){keys.clear();held.clear();stickX=stickY=0;stickPointer=null;$('stick-knob').style.transform='';document.querySelectorAll('.touch-action').forEach(b=>b.classList.remove('pressed'));}
function refreshContinue(){const save=readSave();$('continue-button').hidden=!save||!loadDone;$('continue-button').textContent=save?'CONTINUE · CHAPTER '+String(save.chapter+1).padStart(2,'0'):'';}
function showMain(){game.returnToMenu();cinematic=true;heroTime=0;overlayType='';transition=null;$('chapter-transition').classList.remove('visible');$('overlay').hidden=true;$('main-menu').hidden=false;$('menu-brand').hidden=false;$('hud').hidden=true;$('pause-button').hidden=true;$('keyboard-guide').hidden=true;$('touch-controls').hidden=true;$('notice').classList.remove('show');clearInput();refreshContinue();}
function showPlay(){cinematic=false;overlayType='';$('overlay').hidden=true;$('main-menu').hidden=true;$('menu-brand').hidden=true;$('hud').hidden=false;$('pause-button').hidden=false;$('keyboard-guide').hidden=touchMode;$('touch-controls').hidden=!touchMode;canvas.focus({preventScroll:true});updateHUD();}
function begin(saved){if(!loadDone)return;initAudio();clearInput();effects=[];floats=[];pulses=[];arcs=[];transition=null;game.start(saved);camera=0;showPlay();}
function makeButton(label,handler,primary=false){const b=document.createElement('button');b.className=primary?'button primary':'text-button';b.textContent=label;b.onclick=handler;return b;}
function makeMore(){const a=document.createElement('a');a.className='button more-games';a.href=moreURL;a.target='_blank';a.rel='noopener noreferrer';a.textContent='MORE GAMES ↗';return a;}
function panel(type,kicker,title,body,actions){
 overlayType=type;clearInput();$('main-menu').hidden=true;$('overlay').hidden=false;$('menu-brand').hidden=false;$('hud').hidden=true;$('pause-button').hidden=true;$('keyboard-guide').hidden=true;$('touch-controls').hidden=true;$('notice').classList.remove('show');
 $('panel-kicker').textContent=kicker;$('panel-title').textContent=title;$('panel-content').innerHTML=body;
 const primary=actions.filter(a=>a.classList.contains('primary')),secondary=actions.filter(a=>!a.classList.contains('primary')),items=[...primary,makeMore()];
 if(secondary.length){const links=document.createElement('div');links.className='panel-secondary';links.append(...secondary);items.push(links);}
 $('panel-actions').replaceChildren(...items);requestAnimationFrame(()=>items[0]?.focus({preventScroll:true}));
}
function pauseGame(){if(game.state!=='play'||transition)return;game.pause();const t=THEMES[game.chapter];panel('pause','CHAPTER '+String(game.chapter+1).padStart(2,'0')+' / 05','A MOMENT OF SCIENCE.','<p>'+t.name+' · '+t.areas[game.area]+'</p>',[makeButton('RESUME',()=>{game.resume();showPlay();},true),makeButton('HOW TO PLAY',()=>showHelp('pause')),makeButton('MAIN MENU',showMain)]);}
function showHelp(back){
 helpBack=back;const controls=[['WASD','MOVE','Arrow keys also work. Change lanes to evade.'],['J','CROWBAR COMBO','Hold or tap. Every third hit is a finisher.'],['K','HEAVY STRIKE','A slower, wider swing with strong knockback.'],['L','GRAVITY BLAST','Costs 30 energy. Break supplies and deflect fire.'],['SPACE','DODGE','Evade attacks. Briefly invulnerable.'],['ESC','PAUSE','Your current fight waits while menus are open.']];
 panel('help','THE RIGHT TOOLS FOR THE JOB','MAKE EVERY HIT COUNT.','<div class="controls-grid">'+controls.map(([key,title,desc])=>'<div class="control-row"><kbd>'+key+'</kbd><div><strong>'+title+'</strong><small>'+desc+'</small></div></div>').join('')+'</div><p class="help-tip">Melee kills restore health. Energy recharges. Watch enemy windups, clear every threat, then move right. On touchscreens, use the stick and four action buttons.</p>',[makeButton('BACK',()=>{if(helpBack==='pause'){game.state='play';pauseGame();}else showMain();},true)]);
}
function chapterDots(){return '<div class="chapters-mini">'+THEMES.map((t,i)=>'<span class="'+(i<game.chapter?'done':i===game.chapter?'active':'')+'">'+String(i+1).padStart(2,'0')+' '+t.label+'</span>').join('')+'</div>';}
function outcome(victory){const t=THEMES[game.chapter];panel(victory?'victory':'chapter',victory?'CAMPAIGN COMPLETE':'CHAPTER '+String(game.chapter+1).padStart(2,'0')+' COMPLETE',victory?'A NEW DAY FOR CITY 17.':'THE WAY IS OPEN.','<p>'+(victory?t.victory:t.boss+' defeated. Next: '+THEMES[game.chapter+1].name+'.')+'</p>'+chapterDots()+'<div class="stats"><div><span>SCORE</span><strong>'+String(game.score).padStart(6,'0')+'</strong></div><div><span>ENEMIES DEFEATED</span><strong>'+game.kills+'</strong></div><div><span>BEST COMBO</span><strong>'+game.maxCombo+'</strong></div></div>'+(!victory?'<p>Next chapter: +45 health and full gravity energy.</p>':''),[makeButton(victory?'PLAY AGAIN':'NEXT CHAPTER',()=>victory?begin():nextChapter(),true),makeButton('MAIN MENU',showMain)]);if(victory)deleteSave();}
function defeat(){panel('defeat','VITAL SIGNS CRITICAL','GET BACK IN THE FIGHT.','<p>Retry from the opening checkpoint of '+THEMES[game.chapter].name+'.</p><p>Chapter-entry health, energy, and score will be restored.</p>',[makeButton('RETRY CHAPTER',()=>{clearInput();effects=[];floats=[];pulses=[];arcs=[];game.retry();camera=0;showPlay();},true),makeButton('MAIN MENU',showMain)]);}
function nextChapter(){
 if(transition||game.state!=='chapter'||game.chapter>=4)return;clearInput();$('overlay').hidden=true;$('menu-brand').hidden=true;
 const next=THEMES[game.chapter+1];$('transition-kicker').textContent='CHAPTER '+String(game.chapter+2).padStart(2,'0')+' / 05';$('transition-name').textContent=next.name;$('chapter-transition').classList.add('visible');transition={time:0,swapped:false};
}
function updateTransition(dt){if(!transition||document.hidden)return;transition.time+=dt;if(transition.time>.64&&!transition.swapped){transition.swapped=true;game.enterChapter();game.state='transition';camera=0;effects=[];floats=[];pulses=[];arcs=[];}
 if(transition.time>1.68)$('chapter-transition').classList.remove('visible');if(transition.time>2.23){transition=null;game.state='play';showPlay();showNotice(THEMES[game.chapter].brief+'\n+45 HEALTH · FULL ENERGY',3.3);}}
game.onEvent=e=>{switch(e.type){
 case'checkpoint':writeSave(e.save);break;case'notice':showNotice(e.text,e.duration);break;case'sound':sound(e.sound);break;case'shake':shake=Math.max(shake,e.strength);break;case'hurt':flash=.24;shake=5;break;
 case'impact':for(let i=0;i<e.count;i++)effects.push({x:e.x,y:e.y,z:e.height,vx:(Math.random()-.5)*205,vy:(Math.random()-.5)*70,vz:60+Math.random()*150,life:.24+Math.random()*.3,color:e.color,size:1+Math.random()*3});break;
 case'stomp':shake=6;pulses.push({x:e.x,y:e.y,life:.48,max:.48,stomp:true});for(let i=0;i<18;i++)effects.push({x:e.x,y:e.y,z:3,vx:(Math.random()-.5)*380,vy:(Math.random()-.5)*140,vz:70+Math.random()*70,life:.45,color:'#daaf79',size:3});break;
 case'pulse':pulses.push({...e,life:.35,max:.35});break;
 case'arc':arcs.push({...e,life:.14,max:.14});break;
 case'damageText':floats.push({x:e.x,y:e.y,z:142,text:String(e.amount),life:.65,color:e.color});break;
 case'float':floats.push({x:e.x,y:e.y,z:100,text:e.text,life:1.05,color:e.color});break;
 case'chapterComplete':outcome(false);break;case'victory':outcome(true);break;case'defeat':defeat();break;
}};
function resize(){width=canvas.clientWidth;height=canvas.clientHeight;touchMode=matchMedia('(pointer:coarse)').matches||width<650||(width<980&&height<500);if(game.state==='play'){$('keyboard-guide').hidden=touchMode;$('touch-controls').hidden=!touchMode;}dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.imageSmoothingEnabled=false;}
window.addEventListener('resize',resize);document.addEventListener('fullscreenchange',()=>{resize();$('fullscreen-button').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');});window.visualViewport?.addEventListener('resize',resize);
function actorMeta(key){return catalog.actors?.[key]||catalog.props?.[key]||catalog[key];}
function sprite(key,frame,x,y,bodyHeight,face=1){
 const meta=actorMeta(key),im=images[key];if(!meta||!im)return;
 const cw=meta.cellWidth||im.width/meta.cols,ch=meta.cellHeight||im.height/meta.rows,info=meta.frames?.[frame],anchor=info?.anchor||meta.anchor||[cw/2,ch*.94],scale=bodyHeight/(meta.bodyHeight||ch*.8);
 ctx.save();ctx.globalAlpha=1;ctx.translate(Math.round(x),Math.round(y));ctx.scale(face,1);ctx.drawImage(im,frame%meta.cols*cw,Math.floor(frame/meta.cols)*ch,cw,ch,Math.round(-anchor[0]*scale),Math.round(-anchor[1]*scale),Math.round(cw*scale),Math.round(ch*scale));ctx.restore();
}
function frameFor(a){
 if(a===game.player){if(a.action==='dead')return 8;if(a.action==='hurt')return 7;if(a.action==='dash')return 6;if(a.action==='gravity')return 5;if(a.action==='heavy')return 4;if(a.action==='melee')return a.comboStep===3?4:3;}
 else {if(a.hp<=0)return 5;if(a.action==='hurt')return 4;if(a.action==='attack')return 3;}
 return a.moving?1+Math.floor(a.walk/(a.type==='headcrab'?34:a.type==='strider'?68:46))%2:0;
}
function worldPoint(x,y){return {x:(x-camera)*zoom,y:groundBase+(y-129)*zoom*laneScale};}
function layer(theme,name,factor,bottom,worldHeight,viewCamera){
 const im=images[theme+'-'+name];if(!im)return;
 if(name==='far'){
  const travel=(3*AREA+260)*zoom*factor,pad=110*zoom,drawW=Math.max(width+travel+pad*2,worldHeight*im.width/im.height),drawH=drawW*im.height/im.width,scroll=clamp(viewCamera*zoom*factor+pad,0,drawW-width);
  ctx.drawImage(im,Math.floor(-scroll),Math.floor(Math.min(0,bottom-drawH*.87)),Math.ceil(drawW)+1,Math.ceil(drawH)+1);return;
 }
 const meta=catalog.themes?.[theme]?.[name]||{},scale=worldHeight/(meta.silhouetteHeight||im.height),drawW=im.width*scale,drawH=im.height*scale,top=bottom-(meta.groundY||im.height)*scale,scroll=viewCamera*zoom*factor,first=Math.floor(scroll/drawW);
 for(let i=first;i*drawW-scroll<width;i++)ctx.drawImage(im,Math.floor(i*drawW-scroll),Math.floor(top),Math.ceil(drawW)+1,Math.ceil(drawH)+1);
}
function scenery(chapter=game.chapter,viewCamera=camera,offset=0){
 const theme=THEMES[chapter].id;ctx.fillStyle=THEMES[chapter].background;ctx.fillRect(0,0,width,height);
 layer(theme,'far',.08,horizon+28*zoom,Math.max(horizon+30*zoom,360*zoom),viewCamera+offset);
 const floor=images[theme+'-floor'];
 if(floor){const h=Math.max(height-horizon,275*zoom),w=h*floor.width/floor.height,off=((viewCamera*zoom)%w+w)%w;for(let x=-off;x<width;x+=w)ctx.drawImage(floor,Math.floor(x),Math.floor(horizon),Math.ceil(w)+1,Math.ceil(h)+1);}
 layer(theme,'mid',.30,horizon+18*zoom,460*zoom,viewCamera+offset);
 layer(theme,'near',.62,horizon+40*zoom,400*zoom,viewCamera+offset);
 const shade=ctx.createLinearGradient(0,horizon,0,height);shade.addColorStop(0,'#0a1d2710');shade.addColorStop(1,'#07131e68');ctx.fillStyle=shade;ctx.fillRect(0,horizon,width,height-horizon);
}
function shadow(point,w){ctx.fillStyle='#05111c88';ctx.beginPath();ctx.ellipse(point.x,point.y-1,w*zoom,10*zoom,0,0,Math.PI*2);ctx.fill();}
function label(text,x,y,color,size=12){ctx.font=size+'px HEV,Arial';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#10202be6';ctx.strokeText(text,x,y);ctx.fillStyle=color;ctx.fillText(text,x,y);}
function drawActor(a){
 const point=worldPoint(a.x,a.y),player=a===game.player,key=player?'gordon':a.type,h=player?178:a.height;if(point.x<-330||point.x>width+330)return;
 shadow(point,player?37:a.type==='strider'?85:a.type==='headcrab'?29:38);
 if(!player&&a.hp>0&&a.action==='windup'){
  const progress=1-a.timer/a.duration,slam=a.attackKind==='stomp',ranged=['volley','shot'].includes(a.attackKind);ctx.strokeStyle=slam?'#ff8058':'#ffbe74';ctx.lineWidth=2*zoom;ctx.beginPath();ctx.ellipse(point.x,point.y,(slam?(a.type==='strider'?196:163):52)*zoom,(slam?80*laneScale:16)*zoom,0,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke();
  label(slam?'EVADE':ranged?'!':'!',point.x,point.y-h*zoom-11*zoom,slam?'#ffa678':'#ffd6a6',Math.max(10,(slam?12:22)*zoom));
  if(ranged){const target=worldPoint(a.attackTarget.x,a.attackTarget.y);ctx.setLineDash([7*zoom,8*zoom]);ctx.strokeStyle='#ffb57276';ctx.lineWidth=zoom;ctx.beginPath();ctx.moveTo(point.x,point.y-80*zoom);ctx.lineTo(target.x,target.y-80*zoom);ctx.stroke();ctx.setLineDash([]);}
 }
 sprite(key,frameFor(a),point.x,point.y,h*zoom,a.face);
 if(!player&&a.hp>0&&a.hp<a.maxHP&&!a.boss){ctx.fillStyle='#101c25d9';ctx.fillRect(point.x-24*zoom,point.y-h*zoom-8*zoom,48*zoom,3*zoom);ctx.fillStyle='#ed974e';ctx.fillRect(point.x-24*zoom,point.y-h*zoom-8*zoom,48*zoom*a.hp/a.maxHP,3*zoom);}
 if(player&&a.invuln>0&&game.state==='play'){ctx.strokeStyle='#a8e7f590';ctx.lineWidth=1.6*zoom;ctx.beginPath();ctx.ellipse(point.x,point.y,40*zoom,10*zoom,0,0,Math.PI*2);ctx.stroke();}
}
function drawProp(o){const point=worldPoint(o.x,o.y);if(point.x<-220||point.x>width+220)return;shadow(point,34);sprite(o.theme+'-prop',o.state,point.x,point.y,(THEMES.find(t=>t.id===o.theme)?.propHeight||85)*zoom);}
function drawPickup(item){const p=worldPoint(item.x,item.y),key=item.type==='health'?'health':'battery';shadow(p,13);sprite(key,0,p.x,p.y,42*zoom);}
function layoutBattlefield(dt){
 const portrait=height>width;horizon=height*(portrait?.53:.51);const back=horizon+(portrait?75:46)*zoom,front=height-(touchMode?(portrait?178:72):62);laneScale=clamp((front-back)/((LANES.max-LANES.min)*zoom),.4,.78);groundBase=back+(129-LANES.min)*laneScale*zoom;
 const view=width/zoom,target=clamp(game.player.x-view*.38,-120,Math.max(-120,3*AREA-view+120));if(game.state==='play')camera+=(target-camera)*Math.min(1,dt*6);const margin=Math.min(120,view*.25);camera=clamp(camera,game.player.x-view+margin,game.player.x-margin);game.screen={left:camera,right:camera+view};
}
function renderHero(dt){
 heroTime+=dt;const portrait=height>width;zoom=portrait?Math.min(width/370,height/650,1.4):Math.min(height/490,2.05);horizon=height*(portrait?.68:.63);groundBase=height*(portrait?.91:.89);laneScale=.66;
 const drift=Math.sin(heroTime*.16)*65;scenery(0,0,drift);
 const shade=ctx.createLinearGradient(0,0,width,0);shade.addColorStop(0,'#0a1925eb');shade.addColorStop(portrait?.5:.37,'#0a1925a0');shade.addColorStop(portrait?1:.72,'#0a192510');ctx.fillStyle=shade;ctx.fillRect(0,0,width,height);
 // All cutout actors are drawn AFTER scenery shading at full opacity.
 const x=width*(portrait?.54:.68),y=height*(portrait?.91:.89),enemyX=width*(portrait?.81:.88),enemyY=y-15*zoom;
 shadow({x:enemyX,y:enemyY},43);sprite('combine',0,enemyX,enemyY,181*zoom,-1);
 shadow({x,y},46);sprite('gordon',0,x,y,201*zoom,1);
 const topShade=ctx.createLinearGradient(0,0,0,90);topShade.addColorStop(0,'#06101955');topShade.addColorStop(1,'#06101900');ctx.fillStyle=topShade;ctx.fillRect(0,0,width,90);
}
function render(dt){
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;if(cinematic){renderHero(dt);return;}
 const portrait=height>width;zoom=Math.max(.43,Math.min(height/(touchMode?620:650),width/(portrait?520:750),1.5));layoutBattlefield(dt);
 const sx=game.state==='play'?(Math.random()-.5)*shake:0,sy=game.state==='play'?(Math.random()-.5)*shake*.4:0;ctx.translate(sx,sy);scenery();
 const list=[...game.props.map(o=>({y:o.y,draw:()=>drawProp(o)})),...game.pickups.map(o=>({y:o.y,draw:()=>drawPickup(o)})),...game.enemies.map(e=>({y:e.y,draw:()=>drawActor(e)})),{y:game.player.y,draw:()=>drawActor(game.player)}];list.sort((a,b)=>a.y-b.y);for(const o of list)o.draw();
 for(const b of game.projectiles){const p=worldPoint(b.x,b.y);ctx.strokeStyle=b.friendly?'#a3ecff':'#ffd396';ctx.lineWidth=3*zoom;ctx.beginPath();ctx.moveTo(p.x-Math.sign(b.vx)*15*zoom,p.y-79*zoom);ctx.lineTo(p.x,p.y-79*zoom);ctx.stroke();ctx.fillStyle='#edfafa';ctx.fillRect(p.x-2*zoom,p.y-81*zoom,4*zoom,4*zoom);}
 for(const pulse of pulses){const p=worldPoint(pulse.x,pulse.y),progress=1-pulse.life/pulse.max;ctx.save();ctx.globalAlpha=pulse.life/pulse.max;if(pulse.stomp){ctx.strokeStyle='#ffad6c';ctx.lineWidth=3*zoom;ctx.beginPath();ctx.ellipse(p.x,p.y,(25+180*progress)*zoom,(10+64*progress)*zoom*laneScale,0,0,Math.PI*2);ctx.stroke();}else{ctx.strokeStyle='#a3eafa';ctx.lineWidth=(4-3*progress)*zoom;for(let i=0;i<3;i++){const r=(42+progress*275+i*17)*zoom;ctx.beginPath();ctx.ellipse(p.x+pulse.face*(40+progress*130)*zoom,p.y-89*zoom,r*.35,r*.45,0,0,Math.PI*2);ctx.stroke();}}ctx.restore();}
 for(const a of arcs){const p=worldPoint(a.x,a.y);ctx.save();ctx.globalAlpha=a.life/a.max*.7;ctx.strokeStyle='#ffe1ba';ctx.lineWidth=(a.heavy?6:3)*zoom;ctx.translate(p.x,p.y-86*zoom);ctx.scale(a.face,1);ctx.beginPath();ctx.ellipse(50*zoom,0,90*zoom,(a.heavy?80:43)*zoom,-.3,-1.1,.95);ctx.stroke();ctx.restore();}
 for(const e of effects){const p=worldPoint(e.x,e.y);ctx.fillStyle=e.color;ctx.fillRect(p.x,p.y-e.z*zoom,e.size*zoom,e.size*zoom);}
 for(const f of floats){const p=worldPoint(f.x,f.y);label(f.text,p.x,p.y-f.z*zoom,f.color,Math.max(10,12*zoom));}
 if(game.clear&&game.state==='play'){
  const gate=worldPoint((game.area+1)*AREA-77,140),gx=clamp(gate.x,65,width-62),gy=groundBase-76*zoom,shift=Math.sin(game.time*5)*4*zoom;
  label(game.area===2?'CONTINUE':'MOVE RIGHT',gx,gy-27*zoom,'#edcc98',Math.max(10,11*zoom));ctx.strokeStyle='#ffc78d';ctx.lineWidth=3*zoom;ctx.beginPath();ctx.moveTo(gx-17*zoom+shift,gy-12*zoom);ctx.lineTo(gx+shift,gy);ctx.lineTo(gx-17*zoom+shift,gy+12*zoom);ctx.moveTo(gx+3*zoom+shift,gy-12*zoom);ctx.lineTo(gx+20*zoom+shift,gy);ctx.lineTo(gx+3*zoom+shift,gy+12*zoom);ctx.stroke();
 }
 ctx.setTransform(dpr,0,0,dpr,0,0);if(flash>0){ctx.fillStyle='rgba(186,49,32,'+(flash*.48)+')';ctx.fillRect(0,0,width,height);}
}
function updateEffects(dt){shake=Math.max(0,shake-dt*24);flash=Math.max(0,flash-dt);for(const e of effects){e.x+=e.vx*dt;e.y+=e.vy*dt;e.z+=e.vz*dt;e.vz-=680*dt;e.life-=dt;}effects=effects.filter(e=>e.life>0&&e.z>0);for(const f of floats){f.life-=dt;f.z+=37*dt;}floats=floats.filter(f=>f.life>0);for(const p of pulses)p.life-=dt;pulses=pulses.filter(p=>p.life>0);for(const a of arcs)a.life-=dt;arcs=arcs.filter(a=>a.life>0);}
function updateHUD(){
 const p=game.player,t=THEMES[game.chapter];$('health-value').textContent=Math.ceil(p.hp)+' / 100';$('health-fill').style.width=p.hp+'%';$('health-fill').style.background=p.hp<30?'#e27053':'#f69a4b';$('energy-value').textContent=Math.floor(p.energy);$('energy-fill').style.width=p.energy+'%';$('chapter-label').textContent='CH. '+String(game.chapter+1).padStart(2,'0')+' / 05 · AREA '+String(game.area+1).padStart(2,'0')+' / 03';$('area-label').textContent=t.areas[game.area];$('objective-label').textContent=game.clear?'AREA CLEARED · MOVE RIGHT':game.remaining+' ENEMIES REMAINING';$('objective-label').style.color=game.clear?'#f5c085':'';$('score-value').textContent=String(game.score).padStart(6,'0');$('combo-value').textContent=game.combo>=3?game.combo+' HIT COMBO':'';
 const boss=game.boss;$('boss-hud').hidden=!boss;if(boss){$('boss-label').textContent=t.boss;$('boss-fill').style.width=boss.hp/boss.maxHP*100+'%';}
 if(touchMode){document.querySelector('.gravity .cooldown').style.height=(p.energy<30?100-p.energy/30*100:0)+'%';document.querySelector('.heavy .cooldown').style.height=p.heavyCD/.86*100+'%';document.querySelector('.dodge .cooldown').style.height=p.dashCD/1.05*100+'%';}
}
function tick(now){
 const dt=Math.min(.04,(now-lastTime)/1000||.016);lastTime=now;if(transition)updateTransition(dt);
 if(game.state==='play'){
  const actions=[];if(keys.has('KeyJ')||held.has('melee'))actions.push('melee');if(keys.has('KeyK')||held.has('heavy'))actions.push('heavy');if(keys.has('KeyL')||held.has('gravity'))actions.push('gravity');
  game.step(dt,{x:stickX+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),y:stickY+(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0),actions});updateEffects(dt);
  if(noticeTime>0){noticeTime-=dt;if(noticeTime<=0)$('notice').classList.remove('show');}uiClock+=dt;if(uiClock>.065){uiClock=0;updateHUD();}
 }else if(game.state==='dying'){game.step(dt,{});updateEffects(dt);}
 render(dt);requestAnimationFrame(tick);
}
function keydown(e){
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)&&game.state==='play')e.preventDefault();
 if(e.code==='KeyM'&&!e.repeat){toggleSound();return;}if(e.code==='KeyF'&&!e.repeat){fullscreen();return;}
 if(e.code==='Escape'||e.code==='KeyP'){if(e.repeat)return;e.preventDefault();if(overlayType==='help'){if(helpBack==='pause'){game.state='play';pauseGame();}else showMain();}else if(game.state==='pause'){game.resume();showPlay();}else pauseGame();return;}
 if(game.state==='play'){keys.add(e.code);if(e.code==='Space'&&!e.repeat){initAudio();game.action('dash');}}
}
window.addEventListener('keydown',keydown);window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{clearInput();pauseGame();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pauseGame();}});
const stick=$('stick');
stick.addEventListener('pointerdown',e=>{if(game.state!=='play')return;e.preventDefault();initAudio();stickPointer=e.pointerId;const r=stick.getBoundingClientRect();stickStart={x:r.left+r.width/2,y:r.top+r.height/2};stick.setPointerCapture(e.pointerId);moveStick(e);});
function moveStick(e){if(e.pointerId!==stickPointer)return;const radius=stick.clientWidth*.34,dx=e.clientX-stickStart.x,dy=e.clientY-stickStart.y,len=Math.hypot(dx,dy),scale=Math.min(1,radius/(len||1));stickX=dx*scale/radius;stickY=dy*scale/radius;if(len<6)stickX=stickY=0;$('stick-knob').style.transform='translate('+dx*scale+'px,'+dy*scale+'px)';}
stick.addEventListener('pointermove',moveStick);function releaseStick(e){if(e.pointerId!==stickPointer)return;stickPointer=null;stickX=stickY=0;$('stick-knob').style.transform='';}stick.addEventListener('pointerup',releaseStick);stick.addEventListener('pointercancel',releaseStick);stick.addEventListener('lostpointercapture',releaseStick);
document.querySelectorAll('.touch-action').forEach(b=>{const action=b.dataset.action;b.addEventListener('pointerdown',e=>{if(game.state!=='play')return;e.preventDefault();initAudio();b.setPointerCapture(e.pointerId);b.classList.add('pressed');if(action==='dash')game.action('dash');else{held.add(action);game.action(action);}});const up=()=>{held.delete(action);b.classList.remove('pressed');};b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('lostpointercapture',up);});
$('start-button').onclick=()=>loadFailed?loadAssets():begin();$('continue-button').onclick=()=>begin(readSave());$('help-button').onclick=()=>showHelp('main');$('pause-button').onclick=pauseGame;$('sound-button').onclick=toggleSound;$('fullscreen-button').onclick=fullscreen;
function assetKeys(){return ['gordon','combine','zombie','headcrab','strider',...THEMES.flatMap(t=>['far','mid','near','floor','prop'].map(n=>t.id+'-'+n)),...(catalog.actors?.health?['health']:[]),...(catalog.actors?.battery?['battery']:[])];}
async function loadAssets(){
 loadFailed=false;$('start-button').disabled=true;$('load-error').hidden=true;const list=assetKeys();let done=0;
 const update=()=>{$('start-label').textContent='LOADING · '+Math.round(done/list.length*100)+'%';};update();
 const results=await Promise.allSettled(list.map(key=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{images[key]=im;done++;update();resolve();};im.onerror=()=>reject(new Error(key));im.src='assets/'+key+'.png';})));
 const fonts=await Promise.allSettled([document.fonts.load('16px HEV'),document.fonts.load('700 16px HEV')]);
 const failed=results.some(r=>r.status==='rejected')||fonts.some(r=>r.status==='rejected');
 if(failed){loadFailed=true;$('start-button').disabled=false;$('start-label').textContent='RETRY LOADING';$('load-error').textContent='Some artwork could not load. Check your connection and retry.';$('load-error').hidden=false;return;}
 loadDone=true;$('start-button').disabled=false;$('start-label').textContent='START GAME';refreshContinue();
}
function publicStatus(){return {state:overlayType||game.state,loaded:loadDone,chapter:game.chapter+1,area:game.area+1,setting:THEMES[game.chapter].name,health:Math.ceil(game.player.hp),gravityEnergy:Math.floor(game.player.energy),score:game.score,enemiesRemaining:game.remaining};}
function registerTools(){
 const context=document.modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();
 const definitions=[
  {name:'read_game_status',title:'Read game status',description:'Read the current menu or battle status in Half-Life 2: Beat Em Up.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:input=>{if(input&&Object.keys(input).length)throw new Error('No fields expected.');return publicStatus();}},
  {name:'control_game_menu',title:'Control game menu',description:'Use the game menu to start a new campaign, continue its saved chapter, pause, resume, open help, or return to the main menu. Starting a new game replaces its local chapter checkpoint.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['start','continue','pause','resume','help','main']}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||Object.keys(input).some(k=>k!=='action')||!['start','continue','pause','resume','help','main'].includes(input.action))throw new Error('Choose a supported menu action.');if(!loadDone)throw new Error('The game is still loading.');if(transition)throw new Error('Wait for the chapter transition.');switch(input.action){case 'start':begin();break;case 'continue':{const saved=readSave();if(!saved)throw new Error('No saved chapter.');begin(saved);break;}case 'pause':if(game.state!=='play')throw new Error('The game is not playing.');pauseGame();break;case 'resume':if(game.state!=='pause'||overlayType==='help')throw new Error('Open the pause menu to resume.');game.resume();showPlay();break;case 'help':if(game.state==='play')game.pause();showHelp(game.state==='pause'?'pause':'main');break;case 'main':showMain();break;}return publicStatus();}}
 ];
 for(const definition of definitions){try{Promise.resolve(context.registerTool(definition,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
resize();updateSound();showMain();requestAnimationFrame(tick);loadAssets();registerTools();
})();
