export const COLS=17, ROWS=11, FUSE=2.6;
export const DIRS=[{x:0,y:1,name:'down'},{x:1,y:0,name:'right'},{x:0,y:-1,name:'up'},{x:-1,y:0,name:'left'}];
export const THEMES=[{id:'dust',name:'DUST II',sub:'Sun, sand & short fuses',color:'#eabb69'},{id:'inferno',name:'INFERNO',sub:'Trouble in the old town',color:'#f39364'},{id:'reactor',name:'NUKE',sub:'An explosive shift change',color:'#82c6d9'}];
export const NAMES=['YOU','VIPER','GHOST','BANDIT'];
export const key=(x,y)=>y*COLS+x;
export function rng(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export class BombGame{
 constructor(seed=Date.now()){this.random=rng(seed);this.state='menu';this.theme=0;this.playerCount=1;this.scores=[0,0,0,0];this.events=[];this.time=0;this.round=1;this.createRound();this.state='menu';}
 isHuman(id){return Number.isInteger(id)&&id>=0&&id<this.playerCount;}
 playerName(id){return this.playerCount===2&&this.isHuman(id)?'P'+(id+1):NAMES[id];}
 canRestartRound(){return this.state==='playing'&&!this.actors.some(a=>this.isHuman(a.id)&&a.alive);}
 emit(type,data={}){this.events.push({type,...data});}
 cell(x,y){return x<0||y<0||x>=COLS||y>=ROWS?1:this.grid[key(x,y)];}
 createRound(){
  this.grid=new Uint8Array(COLS*ROWS);this.hidden=new Map();this.items=new Map();this.bombs=[];this.flames=[];this.dead=[];this.warning=[];this.time=0;this.remaining=90;this.closeRing=0;this.serial=1;this.countdown=2.8;this.result=null;this.endDelay=0;
  const spawns=[[1,1],[COLS-2,ROWS-2],[COLS-2,1],[1,ROWS-2]];
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
   const k=key(x,y);if(!x||!y||x===COLS-1||y===ROWS-1||x%2===0&&y%2===0){this.grid[k]=1;continue;}
   const safe=spawns.some(([sx,sy])=>Math.abs(sx-x)+Math.abs(sy-y)<=3);
   let density=this.theme===1?.79:.70;
   if(this.theme===2&&(y===5||x===7||x===9))density=.42;
   if(!safe&&this.random()<density){this.grid[k]=2;if(this.random()<.68){const roll=this.random();this.hidden.set(k,roll<.22?'bomb':roll<.46?'flame':roll<.67?'speed':roll<.80?'shield':roll<.93?'kick':'defuse');}}
  }
  this.actors=spawns.map(([x,y],i)=>({id:i,x,y,cx:x,cy:y,tx:x,ty:y,moving:false,dir:i%2?2:0,alive:true,bombs:1,range:2,speed:3.8,shield:0,kick:false,kit:0,invulnerable:0,plantCooldown:0,defusing:0,defuseTarget:null,walk:0,aiGoal:null,aiGoalUntil:0,brain:.08*i}));
  this.state='countdown';this.emit('round',{round:this.round});
 }
 start(theme=0,playerCount=1){this.theme=theme;this.playerCount=playerCount===2?2:1;this.scores=[0,0,0,0];this.round=1;this.events=[];this.createRound();}
 nextRound(){this.round++;this.createRound();}
 restartRound(){if(!this.canRestartRound())return false;this.events=[];this.createRound();return true;}
 pause(){if(this.state==='playing'||this.state==='countdown'){this.beforePause=this.state;this.state='paused';return true;}return false;}
 resume(){if(this.state==='paused')this.state=this.beforePause||'playing';}
 bombAt(x,y){return this.bombs.find(b=>!b.dead&&Math.round(b.x)===x&&Math.round(b.y)===y);}
 canEnter(x,y,a,ignoreBombs=false){if(this.cell(x,y)!==0)return false;if(ignoreBombs)return true;const b=this.bombAt(x,y);return !b||b.passers.has(a.id);}
 startMove(a,dir){
  if(!a.alive||a.moving)return false;const d=DIRS[dir],x=a.cx+d.x,y=a.cy+d.y;a.dir=dir;
  if(this.cell(x,y)!==0)return false;
  const b=this.bombAt(x,y);if(b&&!b.passers.has(a.id)){if(!a.kick||b.slide||!this.canEnter(x+d.x,y+d.y,a)||this.actors.some(p=>p.alive&&Math.round(p.x)===x+d.x&&Math.round(p.y)===y+d.y))return false;b.slide={x:d.x,y:d.y};this.emit('kick');return false;}
  a.tx=x;a.ty=y;a.moving=true;return true;
 }
 plant(a){
  if(!a.alive||a.plantCooldown>0||this.bombs.filter(b=>b.owner===a.id&&!b.dead).length>=a.bombs)return null;
  const x=Math.round(a.x),y=Math.round(a.y);if(this.cell(x,y)!==0||this.bombAt(x,y))return null;
  const b={id:this.serial++,x,y,owner:a.id,range:a.range,fuse:FUSE,dead:false,slide:null,beep:0,passers:new Set(this.actors.filter(p=>p.alive&&Math.abs(p.x-x)<.72&&Math.abs(p.y-y)<.72).map(p=>p.id))};
  this.bombs.push(b);a.plantCooldown=.2;this.emit('plant',{x,y});return b;
 }
 blastCells(b,grid=this.grid){
  const out=[key(Math.round(b.x),Math.round(b.y))],x=Math.round(b.x),y=Math.round(b.y);
  for(const d of DIRS)for(let n=1;n<=b.range;n++){const nx=x+d.x*n,ny=y+d.y*n;if(nx<0||ny<0||nx>=COLS||ny>=ROWS)break;const k=key(nx,ny);if(grid[k]===1)break;out.push(k);if(grid[k]===2)break;}return out;
 }
 explode(b){
  if(b.dead)return;b.dead=true;const cells=this.blastCells(b);this.emit('explode',{x:b.x,y:b.y});
  for(const k of cells){
   const x=k%COLS,y=Math.floor(k/COLS),existing=this.flames.find(f=>f.k===k);if(existing)existing.until=Math.max(existing.until,this.time+.52);else this.flames.push({k,x,y,until:this.time+.52,born:this.time});
   if(this.grid[k]===2){this.grid[k]=0;this.emit('crate',{x,y,theme:this.theme});const item=this.hidden.get(k);if(item){this.items.set(k,{type:item,revealAt:this.time+.58});this.hidden.delete(k);}}
   else {const item=this.items.get(k);if(item&&item.revealAt<=this.time)this.items.delete(k);}
   const chain=this.bombs.find(o=>o!==b&&!o.dead&&key(Math.round(o.x),Math.round(o.y))===k);if(chain)this.explode(chain);
  }
 }
 damage(a,crush=false){if(!a.alive||!crush&&a.invulnerable>0)return;if(a.shield&&!crush){a.shield=0;a.invulnerable=1.3;this.emit('shield',{x:a.x,y:a.y});return;}a.alive=false;a.moving=false;this.dead.push({id:a.id,x:a.x,y:a.y,dir:a.dir,time:this.time});this.emit('death',{id:a.id,x:a.x,y:a.y});}
 collect(a){const k=key(Math.round(a.x),Math.round(a.y)),item=this.items.get(k);if(!item||item.revealAt>this.time)return;this.items.delete(k);switch(item.type){case'bomb':a.bombs=Math.min(5,a.bombs+1);break;case'flame':a.range=Math.min(7,a.range+1);break;case'speed':a.speed=Math.min(5.8,a.speed+.45);break;case'shield':a.shield=1;break;case'kick':a.kick=true;break;case'defuse':a.kit=Math.min(2,a.kit+1);break;}this.emit('pickup',{id:a.id,item:item.type,x:a.x,y:a.y});}
 defuse(a,held,dt){if(!held||!a.kit||!a.alive||a.moving){a.defusing=0;a.defuseTarget=null;return;}const b=this.bombs.filter(b=>!b.dead&&Math.abs(b.x-a.x)+Math.abs(b.y-a.y)<=1.1).sort((x,y)=>x.fuse-y.fuse)[0];if(!b){a.defusing=0;a.defuseTarget=null;return;}if(a.defuseTarget!==b.id){a.defusing=0;a.defuseTarget=b.id;}a.defusing+=dt;if(a.defusing>=.65){b.dead=true;a.kit--;a.defusing=0;a.defuseTarget=null;this.emit('defuse',{x:b.x,y:b.y});}}
 hazards(extra=null){
  const bs=this.bombs.filter(b=>!b.dead).concat(extra?[extra]:[]),times=bs.map(b=>b.fuse),rays=bs.map(b=>this.blastCells(b));
  for(let pass=0;pass<bs.length;pass++){let change=false;for(let i=0;i<bs.length;i++)for(let j=0;j<bs.length;j++)if(i!==j&&times[j]>times[i]&&rays[i].includes(key(Math.round(bs[j].x),Math.round(bs[j].y)))){times[j]=times[i];change=true;}if(!change)break;}
  const h=new Map();const put=(k,start,end)=>{if(!h.has(k))h.set(k,[]);h.get(k).push([start,end]);};
  bs.forEach((b,i)=>rays[i].forEach(k=>put(k,Math.max(0,times[i]-.11),times[i]+.67)));
  for(const f of this.flames)put(f.k,0,f.until-this.time+.1);
  for(const w of this.warning)put(w.k,Math.max(0,w.at-this.time-.1),100);
  return h;
 }
 safe(h,k,from,to){return !(h.get(k)||[]).some(([s,e])=>s<to&&e>from);}
 escape(a,h,extra=null){
  const start=key(a.cx,a.cy),step=1/a.speed,queue=[{k:start,t:0,first:-1,depth:0}],seen=new Set([start+':0']);let qi=0;
  while(qi<queue.length&&qi<450){const n=queue[qi++],x=n.k%COLS,y=Math.floor(n.k/COLS);if(n.depth&&this.safe(h,n.k,n.t,Math.max(n.t+.6,3.3)))return n.first;
   if(n.depth>=13)continue;for(let dir=0;dir<4;dir++){const d=DIRS[dir],nx=x+d.x,ny=y+d.y,k=key(nx,ny),t=n.t+step;if(!this.canEnter(nx,ny,a))continue;if(extra&&nx===extra.x&&ny===extra.y)continue;if(!this.safe(h,n.k,n.t,n.t+step*.6)||!this.safe(h,k,n.t+step*.4,t+.17))continue;const sk=k+':'+(n.depth+1);if(seen.has(sk))continue;seen.add(sk);queue.push({k,t,first:n.depth?n.first:dir,depth:n.depth+1});}
  }return -1;
 }
 wantsBomb(a){const cells=this.blastCells({x:a.cx,y:a.cy,range:a.range});return cells.some(k=>this.grid[k]===2)||this.actors.some(p=>p.id!==a.id&&p.alive&&cells.includes(key(Math.round(p.x),Math.round(p.y))));}
 bot(a){
  const h=this.hazards(),k=key(a.cx,a.cy);if(!this.safe(h,k,0,3.2)){const dir=this.escape(a,h);if(dir>=0){this.startMove(a,dir);return;}if(a.kit)this.defuse(a,true,.15);return;}
  if(a.plantCooldown<=0&&this.bombs.filter(b=>b.owner===a.id&&!b.dead).length<a.bombs&&this.wantsBomb(a)){
   const virtual={x:a.cx,y:a.cy,range:a.range,fuse:FUSE},evade=this.escape(a,this.hazards(virtual),virtual);if(evade>=0){this.plant(a);a.plantCooldown=.85;this.startMove(a,evade);return;}
  }
  const queue=[{k,first:-1,dist:0}],seen=new Set([k]);let best=null,bestScore=-1e9;
  for(let qi=0;qi<queue.length&&qi<180;qi++){
   const n=queue[qi],x=n.k%COLS,y=Math.floor(n.k/COLS);if(n.dist>0){const pickup=this.items.get(n.k);const crates=DIRS.filter(d=>this.cell(x+d.x,y+d.y)===2).length;let nearest=99;for(const p of this.actors)if(p.alive&&p.id!==a.id)nearest=Math.min(nearest,Math.abs(x-p.x)+Math.abs(y-p.y));const score=(pickup?30:0)+crates*4-n.dist*1.3-nearest*.6+(a.aiGoal===n.k?1.2:0);if(score>bestScore){bestScore=score;best=n;}}
   if(n.dist>=14)continue;for(let dir=0;dir<4;dir++){const d=DIRS[dir],nx=x+d.x,ny=y+d.y,nk=key(nx,ny);if(seen.has(nk)||!this.canEnter(nx,ny,a)||!this.safe(h,nk,n.dist/a.speed,(n.dist+2)/a.speed+.2))continue;seen.add(nk);queue.push({k:nk,first:n.dist?n.first:dir,dist:n.dist+1});}
  }
  if(best){a.aiGoal=best.k;this.startMove(a,best.first);}
 }
 closeArena(){
  const wanted=Math.min(5,Math.floor((30-this.remaining)/5)+1);if(this.remaining<=30&&wanted>this.closeRing){this.closeRing=wanted;const ring=wanted;for(let y=1;y<ROWS-1;y++)for(let x=1;x<COLS-1;x++)if(Math.min(x,y,COLS-1-x,ROWS-1-y)===ring&&this.grid[key(x,y)]!==1)this.warning.push({k:key(x,y),x,y,at:this.time+1.35});this.emit('closing');}
  for(const w of this.warning)if(w.at<=this.time){this.grid[w.k]=1;this.items.delete(w.k);this.hidden.delete(w.k);const b=this.bombAt(w.x,w.y);if(b)b.dead=true;for(const a of this.actors)if(a.alive&&Math.round(a.x)===w.x&&Math.round(a.y)===w.y)this.damage(a,true);this.emit('drop',{x:w.x,y:w.y});}
  this.warning=this.warning.filter(w=>w.at>this.time);
 }
 finishRound(){const alive=this.actors.filter(a=>a.alive);const winner=alive.length===1?alive[0].id:null;if(winner!==null)this.scores[winner]++;this.result={winner,match:winner!==null&&this.scores[winner]>=3};this.state=this.result.match?'matchEnd':'roundEnd';this.intermission=4.5;this.emit('result',this.result);}
 update(dt,input={}){
  if(this.state==='menu'||this.state==='paused'||this.state==='matchEnd')return;
  if(this.state==='roundEnd'){this.intermission-=dt;if(this.intermission<=0)this.nextRound();return;}
  if(this.state==='countdown'){this.countdown-=dt;if(this.countdown<=0){this.state='playing';this.emit('go');}return;}
  dt=Math.min(dt,.05);this.time+=dt;this.remaining=Math.max(0,90-this.time);this.flames=this.flames.filter(f=>f.until>this.time);this.closeArena();
  const inputs=Array.isArray(input)?input:[input];
  for(const a of this.actors){if(!a.alive)continue;const human=this.isHuman(a.id),controls=inputs[a.id]||{};a.invulnerable=Math.max(0,a.invulnerable-dt);a.plantCooldown=Math.max(0,a.plantCooldown-dt);
   if(!a.moving){if(human){if(controls.dir!==undefined&&controls.dir>=0&&!controls.defuse)this.startMove(a,controls.dir);}else{a.brain-=dt;if(a.brain<=0){a.brain=.08;this.bot(a);}}}
   if(a.moving){if(!this.canEnter(a.tx,a.ty,a)){a.x=a.cx;a.y=a.cy;a.moving=false;}else{const dx=a.tx-a.x,dy=a.ty-a.y,dist=Math.hypot(dx,dy),travel=dt*a.speed;a.walk+=dt*10;if(dist<=travel){a.x=a.cx=a.tx;a.y=a.cy=a.ty;a.moving=false;}else{a.x+=dx/dist*travel;a.y+=dy/dist*travel;}}}
   if(human){if(controls.plant)this.plant(a);this.defuse(a,controls.defuse,dt);}
   this.collect(a);
  }
  for(const b of this.bombs){if(b.dead)continue;b.fuse-=dt;for(const id of b.passers){const a=this.actors[id];if(!a.alive||Math.abs(a.x-b.x)>.72||Math.abs(a.y-b.y)>.72)b.passers.delete(id);}
   if(b.slide){const nx=b.x+b.slide.x*dt*7,ny=b.y+b.slide.y*dt*7,tx=Math.round(nx+b.slide.x*.48),ty=Math.round(ny+b.slide.y*.48);const block=this.cell(tx,ty)!==0||this.bombs.some(o=>o!==b&&!o.dead&&Math.round(o.x)===tx&&Math.round(o.y)===ty)||this.actors.some(a=>a.alive&&!b.passers.has(a.id)&&Math.abs(a.x-tx)<.4&&Math.abs(a.y-ty)<.4);if(block){b.x=Math.round(b.x);b.y=Math.round(b.y);b.slide=null;}else{b.x=nx;b.y=ny;}}
   const beat=Math.floor((FUSE-b.fuse)*(b.fuse<.7?9:3));if(beat>b.beep){b.beep=beat;this.emit('beep',{fuse:b.fuse});}
   if(b.fuse<=0||this.flames.some(f=>f.k===key(Math.round(b.x),Math.round(b.y))))this.explode(b);
  }
  this.bombs=this.bombs.filter(b=>!b.dead);
  for(const a of this.actors)if(a.alive){if(this.cell(Math.round(a.x),Math.round(a.y))===1)this.damage(a,true);else if(this.flames.some(f=>f.k===key(Math.round(a.x),Math.round(a.y))))this.damage(a);}
  const alive=this.actors.filter(a=>a.alive);if(alive.length<=1||this.remaining<=0){this.endDelay+=dt;if(this.endDelay>=.42)this.finishRound();}else this.endDelay=0;
 }
 snapshot(){return {state:this.state,theme:THEMES[this.theme].name,playerCount:this.playerCount,round:this.round,timeLeft:Math.ceil(this.remaining),scores:this.scores,player:{...this.actors[0]},players:this.actors.filter(a=>this.isHuman(a.id)).map(a=>({...a,name:this.playerName(a.id)})),actors:this.actors.map(a=>({id:a.id,name:this.playerName(a.id),human:this.isHuman(a.id),x:a.x,y:a.y,alive:a.alive})),bombs:this.bombs.map(b=>({x:b.x,y:b.y,fuse:b.fuse})),result:this.result};}
}
