/* Countercraft: Nether Strike — world layouts, collision, combat, and animation state. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2, MW = 48, MH = 40;
  const TYPES = [
    {name:'Zombie',hp:50,speed:.92,stride:.95,radius:.24,height:1.12,range:1.02,windup:.43,cooldown:1.0,damage:11,score:100,cash:100},
    {name:'Skeleton',hp:42,speed:.78,stride:1.0,radius:.22,height:1.13,range:7.5,windup:.62,cooldown:1.8,damage:12,score:150,cash:150},
    {name:'Creeper',hp:55,speed:1.22,stride:.82,radius:.24,height:1.02,range:1.40,windup:1.10,cooldown:.3,damage:48,score:180,cash:150},
    {name:'Spider',hp:35,speed:1.82,stride:.82,radius:.30,height:.53,range:1.08,windup:.30,cooldown:1.05,damage:9,score:140,cash:125},
    {name:'Armored Zombie',hp:145,speed:.68,stride:.95,radius:.27,height:1.16,range:1.06,windup:.52,cooldown:1.25,damage:18,score:300,cash:250},
    {name:'Corrupted Iron Golem',hp:1050,speed:.64,stride:1.28,radius:.38,height:1.72,range:8,windup:.90,cooldown:2.15,damage:27,score:2500,cash:1500}
  ];
  const WEAPONS = [
    {name:'GLOCK-18',price:0,role:'Reliable sidearm',cooldown:.23,pellets:1,damage:20,spread:.016,cap:20,reload:1.35,reserve:Infinity,kick:1.8},
    {name:'DESERT EAGLE',price:600,role:'Heavy precision pistol',cooldown:.47,pellets:1,damage:76,spread:.012,cap:7,reload:1.7,reserve:35,kick:5},
    {name:'MP5',price:1000,role:'Fast, controllable SMG',cooldown:.090,pellets:1,damage:18,spread:.023,cap:30,reload:1.75,reserve:150,kick:1.3},
    {name:'XM1014',price:1800,role:'Close-range shotgun',cooldown:.52,pellets:8,damage:15,spread:.115,range:18,cap:7,reload:.50,reserve:42,kick:5.5},
    {name:'AK-47',price:2700,role:'Hard-hitting assault rifle',cooldown:.135,pellets:1,damage:36,spread:.032,cap:30,reload:1.95,reserve:150,kick:3.6},
    {name:'M249',price:5000,role:'100-round horde clearer',cooldown:.078,pellets:1,damage:25,spread:.044,cap:100,reload:3.5,reserve:250,kick:2.6}
  ];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  const LEVELS=[
    {name:'DUST OUTPOST',tag:'THE FIRST BREACH',theme:0,skyTint:[1,1,1],tint:null,indoorTexture:0,ground:7},
    {name:'VILLAGE LOCKDOWN',tag:'CLEAR THE SETTLEMENT',theme:4,skyTint:[.82,1,.96],tint:null,indoorTexture:3,ground:12},
    {name:'REACTOR BREACH',tag:'SECURE THE FACILITY',theme:1,skyTint:[.76,.87,1.0],tint:null,indoorTexture:5,ground:1},
    {name:'OBSIDIAN BUNKER',tag:'INTO THE INFECTION',theme:3,skyTint:[.66,.50,.74],tint:[.88,.81,1.0],indoorTexture:9,ground:1},
    {name:'NETHER CITADEL',tag:'DEFEAT THE CORRUPTED GOLEM',theme:2,skyTint:[.90,.29,.25],tint:[1,.67,.63],indoorTexture:9,ground:13}
  ];
  const Generation=typeof module!=='undefined'&&module.exports?require('./generation.js'):root.CounterGeneration;
  const terrain=data=>Object.assign(Object.create(World.prototype),data);
  function reachable(world,ignoreScenery=false){
    // Validate dry, body-width routes through operable doors. Door leaves are
    // ignored here; their fully open geometry is checked separately below.
    const result=new Int16Array(MW*MH).fill(-1),clear=new Uint8Array(MW*MH),queue=new Int16Array(MW*MH);
    for(let y=1;y<MH-1;y++)for(let x=1;x<MW-1;x++){
      const i=y*MW+x;clear[i]=!world.walls[i]&&world.floors[i]!==1&&world.canStand(x+.5,y+.5,.4,ignoreScenery,true);
    }
    const start=Math.floor(world.start.y)*MW+Math.floor(world.start.x);if(!clear[start])return result;
    let head=0,tail=1;queue[0]=start;result[start]=0;
    while(head<tail){
      const at=queue[head++],x=at%MW,y=Math.floor(at/MW);
      for(const next of [x>0?at-1:-1,x<MW-1?at+1:-1,y>0?at-MW:-1,y<MH-1?at+MW:-1]){
        if(next<0||!clear[next]||result[next]>=0||!world.edgePassable(at,next))continue;
        if(!world.canStand((x+next%MW)/2+.5,(y+Math.floor(next/MW))/2+.5,.4,ignoreScenery,true))continue;
        result[next]=result[at]+1;queue[tail++]=next;
      }
    }
    return result;
  }
  function validLevel(data){
    if(!data)return false;
    const world=terrain(data),reach=reachable(world),at=p=>Math.floor(p.y)*MW+Math.floor(p.x);
    if(reach[at(data.exit)]<25||data.rooms.some(r=>reach[r.cy*MW+r.cx]<0))return false;
    if(data.enemies.some(e=>reach[at(e)]<0||!world.canStand(e.x,e.y,TYPES[e.type].radius+.04,false,true)||Math.hypot(e.x-data.start.x,e.y-data.start.y)<7))return false;
    if(data.pickups.some(p=>reach[at(p)]<0))return false;
    if(['health','armor','ammo'].some(kind=>!data.pickups.some(p=>p.kind===kind&&data.zones[at(p)]===data.startRoom)))return false;
    if(data.pickups.filter(p=>p.kind==='ammo').length<8||data.pickups.filter(p=>p.kind==='health').length<4||data.pickups.filter(p=>p.kind==='armor').length<3)return false;
    const chests=data.scenery.filter(p=>p.kind==='chest');
    if(chests.length<[4,4,5,5,6][data.levelIndex]||chests.some(p=>![at(p)-1,at(p)+1,at(p)-MW,at(p)+MW].some(i=>reach[i]>=0)))return false;
    if(data.scenery.filter(p=>p.kind==='tnt').length<4||!data.scenery.some(p=>p.kind==='flowerpot'))return false;
    for(const door of data.doors){
      const panels=world.doorPanels(door,1),dx=door.axis?0:1,dy=door.axis?1:0;
      for(let n=-4;n<=4;n++){
        const x=door.x+dx*n*.2,y=door.y+dy*n*.2;
        if(!world.canStand(x,y,.4,false,true)||panels.some(p=>world.panelTouches(p,x,y,.4)))return false;
      }
    }
    data.exitDistance=reach[at(data.exit)];return true;
  }
  function createLevel(levelIndex=0,seed=Generation.newSeed()){
    levelIndex=clamp(Math.floor(levelIndex)||0,0,LEVELS.length-1);seed=seed>>>0;
    const context={MW,MH,LEVELS,TYPES,terrain,reachable};
    for(let attempt=0;attempt<64;attempt++){
      const data=Generation.generate(levelIndex,seed,attempt,context);
      if(validLevel(data))return data;
    }
    // A bounded, deterministic recovery uses a prevalidated layout for the
    // sector while preserving the requested campaign seed for every retry.
    const data=Generation.generate(levelIndex,1,8,context);
    if(!validLevel(data))throw new Error('Unable to create a connected sector');
    data.campaignSeed=seed;data.generationFallback=true;return data;
  }
  class World {
    constructor(random=Math.random,seed=Generation.newSeed()) {this.random=random;this.campaignSeed=seed>>>0;this.reset();}
    reset(levelIndex=0,carry=null) {
      const level=createLevel(levelIndex,carry?.campaignSeed??this.campaignSeed);Object.assign(this,level);
      this.player={...level.start,health:carry?Math.max(75,carry.health):100,armor:carry?Math.max(35,carry.armor):50,radius:.21};
      this.unlocked=carry?[...carry.unlocked]:WEAPONS.map((w,i)=>i===0);
      this.weapon=carry?carry.weapon:0;this.cash=carry?carry.cash:0;
      this.ammo=WEAPONS.map((w,i)=>this.unlocked[i]?w.cap:0);this.reserves=WEAPONS.map((w,i)=>this.unlocked[i]?(carry?Math.max(carry.reserves[i],w.reserve):w.reserve):0);
      this.campaignScore=carry?carry.score:0;this.campaignTime=carry?carry.time:0;
      this.shotTime=99;this.cooldown=0;this.reloadTime=0;this.reloadElapsed=0;this.reloadPhase='';this.switchTime=0;
      this.time=0;this.kills=0;this.score=0;this.shots=0;this.hits=0;this.won=false;this.dead=false;
      this.projectiles=[];this.particles=[];this.events=[];this.hazardTimer=0;this.navTimer=0;this.nav=new Int16Array(MW*MH).fill(-1);this.extractionPath=null;
      this.damageFlash=0;this.pickupFlash=0;this.muzzle=0;this.hitmarker=0;this.moving=0;this.lastStep=0;
      for(const door of this.doors)door.panels=this.doorPanels(door);
      this.sectorStart=this.loadout();this.updateNavigation();return this;
    }
    loadout(){return{campaignSeed:this.campaignSeed,health:this.player.health,armor:this.player.armor,weapon:this.weapon,cash:this.cash,reserves:[...this.reserves],unlocked:[...this.unlocked],score:this.campaignScore,time:this.campaignTime};}
    newCampaign(seed){const next=seed===undefined?Generation.newSeed():seed>>>0;this.campaignSeed=seed===undefined&&next===this.campaignSeed?(next+1)>>>0:next;return this.reset();}
    restart(){return this.reset(this.levelIndex,this.sectorStart);}
    advance(){if(!this.won||this.levelIndex>=LEVELS.length-1)return false;this.reset(this.levelIndex+1,{...this.loadout(),score:this.campaignScore+this.score,time:this.campaignTime+this.time});return true;}
    cell(x,y){const ix=Math.floor(x),iy=Math.floor(y);return ix<0||iy<0||ix>=MW||iy>=MH?1:this.walls[iy*MW+ix];}
    floor(x,y){return this.floors[(Math.floor(y)*MW+Math.floor(x))]||0;}
    canStand(x,y,r=.21,ignoreScenery=false,ignoreDoors=false) {
      if(!ignoreDoors)for(const door of this.doors)for(const panel of door.panels)if(this.panelTouches(panel,x,y,r))return false;
      if(!ignoreScenery)for(const prop of this.scenery)if(prop.radius>0&&prop.state!==2&&(x-prop.x)**2+(y-prop.y)**2<(r+prop.radius)**2)return false;
      for(let iy=Math.floor(y-r);iy<=Math.floor(y+r);iy++)for(let ix=Math.floor(x-r);ix<=Math.floor(x+r);ix++) {
        if(!this.cell(ix+.5,iy+.5))continue;
        const dx=x-clamp(x,ix,ix+1),dy=y-clamp(y,iy,iy+1);
        if(dx*dx+dy*dy<r*r)return false;
      }
      for(let iy=Math.floor(y-r);iy<=Math.floor(y+r)+1;iy++)for(let ix=Math.floor(x-r);ix<=Math.floor(x+r)+1;ix++){
        if(ix<0||iy<0||ix>=MW||iy>=MH)continue;
        for(let axis=0;axis<2;axis++){
          const marker=(axis?this.edgeY:this.edgeX)[iy*MW+ix];if(!marker)continue;
          const at=axis?iy:ix,lo=axis?ix:iy,across=axis?y:x,along=axis?x:y;
          if(Math.abs(across-at)>=r)continue;
          const door=marker>1?this.portals[marker-2]:null;
          const intervals=door?[[lo,Math.min(lo+1,door.lo+.10)],[Math.max(lo,door.hi-.10),lo+1]]:[[lo,lo+1]];
          for(const [a,b]of intervals)if(b>a&&(across-at)**2+(along-clamp(along,a,b))**2<r*r)return false;
        }
      }
      return true;
    }
    move(body,dx,dy,r=body.radius||.23){if(this.canStand(body.x+dx,body.y,r))body.x+=dx;if(this.canStand(body.x,body.y+dy,r))body.y+=dy;}
    doorPanels(door,open=door.open){
      const angle=open*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle)*door.swing,length=(door.hi-door.lo)/2;
      return [0,1].map(leaf=>{
        const along=leaf?door.hi:door.lo,ac=leaf?-c:c;
        const ux=door.axis?ac:s,uy=door.axis?s:ac;
        return {x:door.axis?along:door.at,y:door.axis?door.at:along,ux,uy,nx:-uy,ny:ux,length,half:.035,door,leaf};
      });
    }
    panelTouches(panel,x,y,r){
      const dx=x-panel.x,dy=y-panel.y,u=dx*panel.ux+dy*panel.uy,v=dx*panel.nx+dy*panel.ny;
      return (u-clamp(u,0,panel.length))**2+(v-clamp(v,-panel.half,panel.half))**2<r*r;
    }
    doorRay(x,y,dx,dy,max=50){
      let closest=max,hit=null;
      for(const door of this.doors){
        if(Math.max(Math.abs(door.x-x),Math.abs(door.y-y))>closest+1)continue;
        for(const panel of door.panels){
          const ox=x-panel.x,oy=y-panel.y,pu=ox*panel.ux+oy*panel.uy,pv=ox*panel.nx+oy*panel.ny;
          const du=dx*panel.ux+dy*panel.uy,dv=dx*panel.nx+dy*panel.ny;
          let near=0,far=closest,edge=false,valid=true;
          for(let axis=0;axis<2;axis++){
            const p=axis?pv:pu,d=axis?dv:du,lo=axis?-panel.half:0,hi=axis?panel.half:panel.length;
            if(Math.abs(d)<1e-9){if(p<lo||p>hi){valid=false;break;}continue;}
            let a=(lo-p)/d,b=(hi-p)/d;if(a>b)[a,b]=[b,a];
            if(a>near){near=a;edge=axis===0;}far=Math.min(far,b);
            if(near>far){valid=false;break;}
          }
          if(!valid||far<.0001||near>=closest)continue;
          closest=Math.max(.0001,near);
          hit={distance:closest,cell:6,x:Math.floor(door.x),y:Math.floor(door.y),side:door.axis,
            u:clamp((pu+closest*du)/panel.length,0,1),height:door.height,door,panel,edge};
        }
      }
      return hit;
    }
    nearbyDoor(body=this.player,aim=true){
      let best=null,closest=1.65;
      for(const door of this.doors){
        const dx=door.x-body.x,dy=door.y-body.y,d=Math.hypot(dx,dy);
        if(d>=closest||aim&&d>.45&&(dx*Math.cos(body.angle)+dy*Math.sin(body.angle))/d<.4)continue;
        if(this.wallRay(body.x,body.y,dx/(d||1),dy/(d||1),d).distance<d-.08)continue;
        best=door;closest=d;
      }
      return best;
    }
    setDoor(door,open,actor=this.player){
      if(door.target===Number(open))return false;
      if(open&&door.open<.001){
        // Swing away from whoever opens it; prefer the side with clear floor.
        const away=(door.axis?actor.y-door.y:actor.x-door.x)<0?1:-1;
        let best=Infinity,chosen=away;
        for(const sign of [away,-away]){
          door.swing=sign;let blocked=0;
          for(const phase of [.25,.5,.75,1])for(const panel of this.doorPanels(door,phase))for(const u of [.25,.5,.75,1]){
            const x=panel.x+panel.ux*panel.length*u,y=panel.y+panel.uy*panel.length*u;
            if(!this.canStand(x,y,.055,false,true))blocked++;
          }
          if(blocked<best){best=blocked;chosen=sign;}
        }
        door.swing=chosen;
      }
      door.target=Number(open);this.extractionPath=null;
      if(Math.hypot(door.x-this.player.x,door.y-this.player.y)<8)this.emit('door',{open,metal:door.material===2});
      return true;
    }
    useDoor(){
      if(this.dead||this.won)return false;
      const door=this.nearbyDoor();return door?this.setDoor(door,!door.target):false;
    }
    updateDoors(dt){
      for(const door of this.doors){
        if(door.open===door.target)continue;
        const next=clamp(door.open+Math.sign(door.target-door.open)*dt*2.8,0,1),panels=this.doorPanels(door,next);
        const bodies=[this.player,...this.enemies.filter(e=>e.hp>0)];
        // Test the next hinge position before moving it, so doors never crush or push bodies.
        if(bodies.some(b=>panels.some(panel=>this.panelTouches(panel,b.x,b.y,b.radius??TYPES[b.type].radius))))continue;
        door.open=next;door.panels=panels;
      }
    }
    ray(x,y,dx,dy,max=50,headers=null,z=.62){
      const wall=this.wallRay(x,y,dx,dy,max,headers,null,z);
      return this.doorRay(x,y,dx,dy,wall.distance)||wall;
    }
    wallRay(x,y,dx,dy,max=50,headers=null,glazing=null,z=.62) {
      let mx=Math.floor(x),my=Math.floor(y),side=0;
      const ddx=Math.abs(1/(dx||1e-12)),ddy=Math.abs(1/(dy||1e-12)),sx=dx<0?-1:1,sy=dy<0?-1:1;
      let tx=(dx<0?x-mx:mx+1-x)*ddx,ty=(dy<0?y-my:my+1-y)*ddy,d=0;
      for(let i=0;i<160;i++){
        const before=my*MW+mx;
        if(tx<ty){d=tx;tx+=ddx;mx+=sx;side=0;}else{d=ty;ty+=ddy;my+=sy;side=1;}
        if(d>max)return {distance:max,side,cell:0,x:mx,y:my,u:0};
        const ex=side?mx:mx+(sx<0?1:0),ey=side?my+(sy<0?1:0):my;
        const marker=ex>=0&&ey>=0&&ex<MW&&ey<MH?(side?this.edgeY:this.edgeX)[ey*MW+ex]:0;
        if(marker){
          const along=side?x+d*dx:y+d*dy,door=marker>1?this.portals[marker-2]:null,outside=!this.ceilings[before];
          const texture=outside?this.facadeTexture:this.level.indoorTexture;
          let u=along-Math.floor(along);if((side===0&&dx>0)||(side===1&&dy<0))u=1-u;
          const windowId=marker===1?(side?this.windowY:this.windowX)[ey*MW+ex]:0;
          const window=windowId?this.windows[windowId-1]:null;
          if(door&&along>door.lo+.10&&along<door.hi-.10){
            if(headers)headers.push({distance:Math.max(.0001,d),side,u,texture,outside,bottom:door.opening,height:outside?2.2:1.5});
          }else if(window&&along>window.lo&&along<window.hi&&(glazing||z>window.bottom&&z<window.top)){
            const span={distance:Math.max(.0001,d),side,u,texture,outside,fullHeight:outside?2.2:1.5};
            const glassU=(along-window.lo)/(window.hi-window.lo)*window.panes,pane=Math.min(window.panes-1,Math.floor(glassU));
            if(headers){
              headers.push({...span,bottom:window.top,height:span.fullHeight});
              headers.push({...span,bottom:0,height:window.bottom,sill:true});
            }
            const broken=Boolean(window.broken&(1<<pane));
            if(glazing)glazing.push({distance:span.distance,side,u:glassU,bottom:window.bottom,top:window.top,window,pane,broken});
            else if(!broken)return {...span,cell:5,x:mx,y:my,height:span.fullHeight,window,pane};
          }else{
            return {distance:Math.max(.0001,d),side,cell:5,x:mx,y:my,u,texture,height:outside?2.2:1.5,outside};
          }
        }
        const wall=this.cell(mx+.5,my+.5);
        if(wall){let u=side?x+d*dx:y+d*dy;u-=Math.floor(u);if((side===0&&dx>0)||(side===1&&dy<0))u=1-u;return{distance:Math.max(.0001,d),side,cell:wall,x:mx,y:my,u};}
      }return {distance:max,side,cell:0,x:mx,y:my,u:0};
    }
    sight(x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,d=Math.hypot(dx,dy);return d<.01||this.ray(x1,y1,dx/d,dy/d,d).distance>=d-.08;}
    movementBlocked(x,y,dx,dy,d,r){
      // Trace the body's width near the floor: seeing around a sill or jamb
      // does not mean there is enough clearance to walk directly past it.
      return [-r,0,r].some(offset=>this.ray(x-dy*offset,y+dx*offset,dx,dy,d,null,.1).distance<d-.05);
    }
    sceneryRay(x,y,dx,dy,max,padding=0){
      let closest=max,prop=null;
      for(const item of this.scenery){
        const hitRadius=item.hitRadius??item.radius;
        if(item.state===2||!hitRadius)continue;
        const ex=item.x-x,ey=item.y-y,along=ex*dx+ey*dy,side=Math.abs(ex*dy-ey*dx),radius=hitRadius+padding;
        if(along+radius<=0||side>=radius)continue;
        const distance=Math.max(0,along-Math.sqrt(radius*radius-side*side));
        if(distance<closest){closest=distance;prop=item;}
      }
      return prop?{prop,distance:closest}:null;
    }
    updateNavigation(){
      this.nav.fill(-1);const q=new Int16Array(MW*MH);let head=0,tail=0;
      const obstacles=new Uint8Array(MW*MH);for(const prop of this.scenery)if(prop.radius>0&&prop.state!==2)obstacles[Math.floor(prop.y)*MW+Math.floor(prop.x)]=1;
      const start=(Math.floor(this.player.y)*MW+Math.floor(this.player.x));this.nav[start]=0;q[tail++]=start;
      while(head<tail){const at=q[head++];for(const next of [at-1,at+1,at-MW,at+MW])if(next>=0&&next<this.nav.length&&!this.walls[next]&&!obstacles[next]&&this.nav[next]<0&&this.edgePassable(at,next)){this.nav[next]=this.nav[at]+1;q[tail++]=next;}}
    }
    edgePassable(a,b){
      const side=Math.abs(a-b)===MW,index=Math.max(a,b),marker=(side?this.edgeY:this.edgeX)[index];
      if(!marker)return true;if(marker===1)return false;
      const door=this.portals[marker-2],along=side?index%MW+.5:Math.floor(index/MW)+.5;
      return along>door.lo+.10&&along<door.hi-.10;
    }
    extractionGuide(){
      if(this.kills!==this.enemies.length||this.dead||this.won)return null;
      const p=this.player,start=Math.floor(p.y)*MW+Math.floor(p.x),end=Math.floor(this.exit.y)*MW+Math.floor(this.exit.x);
      const clear=(x,y,tx,ty,safe,throughDoors=false)=>{
        const distance=Math.hypot(tx-x,ty-y),steps=Math.max(1,Math.ceil(distance/.12));
        for(let i=1;i<=steps;i++){
          const px=x+(tx-x)*i/steps,py=y+(ty-y)*i/steps,cell=Math.floor(py)*MW+Math.floor(px);
          if(!this.canStand(px,py,p.radius+.02,false,throughDoors)||(safe&&cell!==start&&this.floor(px,py)===1))return false;
        }
        return true;
      };
      let cache=this.extractionPath;
      if(!cache||cache.cell!==start){
        let route=null,safe=true;
        // Prefer a dry route; include toxic floors only if no safe route exists.
        for(const avoidToxic of [true,false]){
          const center={x:start%MW+.5,y:Math.floor(start/MW)+.5},viaCenter=clear(p.x,p.y,center.x,center.y,avoidToxic,true);
          const previous=new Int16Array(MW*MH).fill(-1),queue=new Int16Array(MW*MH);let head=0,tail=1;
          previous[start]=start;queue[0]=start;
          while(head<tail&&previous[end]<0){
            const at=queue[head++],x=at%MW,y=Math.floor(at/MW);
            for(const next of [x>0?at-1:-1,x<MW-1?at+1:-1,y>0?at-MW:-1,y<MH-1?at+MW:-1]){
              if(next<0||previous[next]>=0||this.walls[next]||(avoidToxic&&this.floors[next]===1)||!this.edgePassable(at,next))continue;
              const nx=next===end?this.exit.x:next%MW+.5,ny=next===end?this.exit.y:Math.floor(next/MW)+.5;
              if(!clear(at===start&&!viaCenter?p.x:x+.5,at===start&&!viaCenter?p.y:y+.5,nx,ny,avoidToxic,true))continue;
              previous[next]=at;queue[tail++]=next;
            }
          }
          if(previous[end]<0)continue;
          route=[{...this.exit}];
          for(let at=previous[end];at!==start;at=previous[at])route.push({x:at%MW+.5,y:Math.floor(at/MW)+.5});
          route.reverse();if(viaCenter&&start!==end)route.unshift(center);safe=avoidToxic;break;
        }
        if(!route)return null;
        cache=this.extractionPath={cell:start,route,safe,refreshAt:0,next:0};
      }
      if(this.time>=cache.refreshAt){
        cache.next=0;cache.refreshAt=this.time+.12;
        for(let i=0;i<cache.route.length;i++){
          const target=cache.route[i];if(!clear(p.x,p.y,target.x,target.y,cache.safe))break;cache.next=i;
        }
      }
      const target=cache.route[cache.next];let distance=Math.hypot(target.x-p.x,target.y-p.y);
      for(let i=cache.next+1;i<cache.route.length;i++)distance+=Math.hypot(cache.route[i].x-cache.route[i-1].x,cache.route[i].y-cache.route[i-1].y);
      return {target,distance,angle:angleDiff(Math.atan2(target.y-p.y,target.x-p.x),p.angle),route:cache.route.slice(cache.next)};
    }
    emit(type,data={}){this.events.push({type,...data});}
    buyWeapon(index){
      if(!Number.isInteger(index)||index<0||index>=WEAPONS.length||this.dead||this.won||this.unlocked[index])return false;
      const w=WEAPONS[index];if(this.cash<w.price)return false;
      this.cash-=w.price;this.unlocked[index]=true;this.ammo[index]=w.cap;this.reserves[index]=w.reserve;
      this.setWeapon(index);this.emit('purchase',{weapon:index,price:w.price});return true;
    }
    setWeapon(index){
      if(!Number.isInteger(index)||index<0||index>=WEAPONS.length||index===this.weapon)return false;
      if(!this.unlocked[index]){this.emit('locked',{weapon:index});return false;}
      this.weapon=index;this.reloadTime=0;this.reloadPhase='';this.switchTime=.22;this.shotTime=99;this.cooldown=Math.max(this.cooldown,.15);this.emit('switch');return true;
    }
    cycleWeapon(direction=1){for(let n=1;n<=WEAPONS.length;n++){const i=(this.weapon+n*direction+WEAPONS.length*2)%WEAPONS.length;if(this.unlocked[i])return this.setWeapon(i);}return false;}
    reload(){
      const i=this.weapon,w=WEAPONS[i];if(this.reloadTime||this.ammo[i]>=w.cap||this.reserves[i]<=0)return false;
      this.reloadTime=i===3?.28:w.reload;this.reloadDuration=this.reloadTime;this.reloadElapsed=0;this.reloadPhase=i===3?'start':'magazine';this.emit('reload');return true;
    }
    tickReload(dt){
      if(!this.reloadTime)return;const previous=this.reloadElapsed;this.reloadElapsed+=dt;this.reloadTime=Math.max(0,this.reloadTime-dt);
      if(this.weapon!==3){for(const at of [.30,.66])if(previous<this.reloadDuration*at&&this.reloadElapsed>=this.reloadDuration*at)this.emit('reloadStep');}
      if(this.reloadTime>0)return;
      const i=this.weapon,w=WEAPONS[i];
      if(i===3){
        if(this.reloadPhase==='finish'){this.reloadPhase='';this.emit('loaded');return;}
        if(this.reloadPhase==='shell'){this.ammo[i]++;this.reserves[i]--;this.emit('shellLoad');}
        const more=this.ammo[i]<w.cap&&this.reserves[i]>0;this.reloadPhase=more?'shell':'finish';this.reloadTime=more?w.reload:.22;this.reloadDuration=this.reloadTime;this.reloadElapsed=0;
      }else{const n=Math.min(w.cap-this.ammo[i],this.reserves[i]);this.ammo[i]+=n;this.reserves[i]-=n;this.reloadPhase='';this.emit('loaded');}
    }
    fire(){
      if(this.weapon===3&&this.reloadTime>0&&this.ammo[3]>0){this.reloadTime=0;this.reloadPhase='';}
      if(this.dead||this.won||this.cooldown>0||this.reloadTime>0||this.switchTime>0)return false;
      const w=WEAPONS[this.weapon],ammoSlot=w.ammoSlot??this.weapon,cost=w.ammoCost??1;
      if(this.ammo[ammoSlot]<cost){if(this.reserves[this.weapon]>0)this.reload();else{this.cooldown=.3;this.emit('empty');}return false;}
      this.ammo[ammoSlot]-=cost;this.cooldown=w.cooldown;this.shotTime=0;this.muzzle=this.weapon===3?.10:.055;this.shots++;
      this.emit('fire',{weapon:this.weapon});let hit=false;
      for(const e of this.enemies)if(e.hp>0&&Math.hypot(e.x-this.player.x,e.y-this.player.y)<12)e.active=true;
      const damage=new Map();
      for(let i=0;i<w.pellets;i++){
        const angle=this.player.angle+(i===0?0:(this.random()-.5)*2*w.spread),dx=Math.cos(angle),dy=Math.sin(angle);
        const wall=this.ray(this.player.x,this.player.y,dx,dy,w.range??28);let closest=wall.distance,target=wall.window?wall:null;
        for(const e of this.enemies){if(e.hp<=0)continue;const ex=e.x-this.player.x,ey=e.y-this.player.y,along=ex*dx+ey*dy,side=Math.abs(ex*dy-ey*dx);const radius=TYPES[e.type].radius*1.1;
          if(along>0&&side<radius){const dist=along-Math.sqrt(radius*radius-side*side);if(dist<closest){closest=dist;target=e;}}}
        const object=this.sceneryRay(this.player.x,this.player.y,dx,dy,closest);if(object){closest=object.distance;target=object.prop;}
        if(target){const falloff=this.weapon===3?clamp(1.25-closest*.075,.20,1):1;damage.set(target,(damage.get(target)||0)+w.damage*falloff);if(target.kind!=='decor')hit=true;}
        else if(i===0)this.sparks(this.player.x+dx*(closest-.04),this.player.y+dy*(closest-.04),.65,4,'spark');
      }
      damage.forEach((value,e)=>e.window?this.shatterWindow(e.window,e.pane):e.kind?this.hurtScenery(e,value):this.hurtEnemy(e,value));if(hit){this.hits++;this.hitmarker=.12;}return true;
    }
    shatterWindow(window,pane){
      if(window.broken&(1<<pane))return false;
      window.broken|=1<<pane;
      const width=(window.hi-window.lo)/window.panes,lo=window.lo+pane*width;
      for(let i=0;i<22;i++){
        const along=lo+this.random()*width,life=.55+this.random()*.35;
        this.particles.push({x:window.axis?along:window.at,y:window.axis?window.at:along,
          z:window.bottom+this.random()*(window.top-window.bottom),vx:(this.random()-.5)*2.4,vy:(this.random()-.5)*2.4,
          vz:this.random()*1.6,life,max:life,kind:'glass'});
      }
      if(Math.hypot(window.x-this.player.x,window.y-this.player.y)<12)this.emit('glassBreak');
      return true;
    }
    hurtScenery(prop,amount){
      if(prop.kind==='flowerpot'){
        if(prop.state===2||amount<=0)return;
        prop.hp=0;prop.state=2;this.sparks(prop.x,prop.y,.18,16,'clay');this.emit('potBreak');return;
      }
      if(prop.kind==='chest'){
        if(prop.state===2||amount<=0)return;
        prop.hp-=amount;this.sparks(prop.x,prop.y,.3,prop.hp<=0?18:5,'wood');
        if(prop.hp<=0){
          prop.hp=0;prop.state=2;this.navTimer=0;this.extractionPath=null;
          const kind=prop.lootKind??['ammo','health','armor'][Math.floor(this.random()*3)];
          this.pickups.push({id:this.pickups.length,kind,x:prop.x,y:prop.y,taken:false});
          this.emit('chestBreak',{kind});
        }else{prop.state=1;this.emit('chestHit');}
        return;
      }
      if(prop.state!==0)return;
      this.sparks(prop.x,prop.y,prop.kind==='tnt'?.45:.65,4,prop.kind==='tnt'?'spark':'ember');
      if(prop.kind!=='tnt')return;
      prop.hp-=amount;
      if(prop.hp<=0){prop.state=1;prop.explodeAt=this.time+.40;this.emit('tntIgnite');}
    }
    hurtEnemy(e,amount){
      if(e.hp<=0)return;e.hp-=amount;e.hurt=e.type>=4?.06:.14;e.active=true;if(e.type!==2&&e.type<4)e.attack=-1;
      this.sparks(e.x,e.y,.65,5,e.type===2?'spark':'ember');
      if(e.hp<=0){e.death=0;e.frame=6;this.kills++;this.score+=TYPES[e.type].score;this.cash+=TYPES[e.type].cash;this.emit('kill',{typeId:e.type,cash:TYPES[e.type].cash});
        if(e.type===2)e.explodeAt=this.time+.12;
        if((e.type===1||e.type===4)&&this.random()<.4)this.pickups.push({id:this.pickups.length,kind:'ammo',x:e.x,y:e.y,taken:false});
        if(this.kills===this.enemies.length)this.emit('cleared');
      }else this.emit('hit');
    }
    hurtPlayer(amount){
      if(this.dead||this.won)return;const absorbed=Math.min(this.player.armor,amount*.55);this.player.armor-=absorbed;this.player.health=Math.max(0,this.player.health-(amount-absorbed));
      this.damageFlash=.28;this.emit('damage');if(this.player.health<=0){this.dead=true;this.emit('dead');}
    }
    sparks(x,y,z,count,kind){for(let i=0;i<count;i++)this.particles.push({x,y,z,vx:(this.random()-.5)*1.8,vy:(this.random()-.5)*1.8,vz:this.random()*1.7,life:.22+this.random()*.25,max:.47,kind});}
    enemyAttack(e){
      const t=TYPES[e.type],dx=this.player.x-e.x,dy=this.player.y-e.y,d=Math.hypot(dx,dy);
      if(e.type===2){this.detonateCreeper(e);return;}
      if(e.type===0||e.type===3||e.type===4||(e.type===5&&d<1.7)){
        if(d<(e.type===5?1.8:1.28)&&this.sight(e.x,e.y,this.player.x,this.player.y))this.hurtPlayer(t.damage);
        this.emit('claw');return;
      }
      const a=Math.atan2(dy,dx),speed=e.type===5?4.3:5.0,offsets=e.type===5?[-.15,0,.15]:[0];
      for(const offset of offsets){const vx=Math.cos(a+offset),vy=Math.sin(a+offset),launch=Math.max(0,this.ray(e.x,e.y,vx,vy,.3).distance-.02);this.projectiles.push({x:e.x+vx*launch,y:e.y+vy*launch,z:e.type===5?.75:.62,vx:vx*speed,vy:vy*speed,kind:e.type===5?'rock':'arrow',life:7,damage:t.damage});}
      this.emit('enemyFire',{near:d<9,kind:e.type});
    }
    detonateCreeper(e){
      if(e.detonated)return;e.detonated=true;if(e.hp>0)this.hurtEnemy(e,e.hp+1);
      this.explode({x:e.x,y:e.y,kind:'creeper',damage:145});
    }
    explode(shot){
      const barrel=shot.kind==='tnt'||shot.kind==='creeper',radius=3.0,playerRadius=2.5;
      this.sparks(shot.x,shot.y,.5,barrel?40:30,'ember');this.emit('explosion',{x:shot.x,y:shot.y,scale:barrel?1.35:1});this.muzzle=.10;
      // Resolve exposed panes before changing any glass, so walls and other
      // intact windows still shield glass around corners from this blast.
      const glassHits=[];
      for(const window of this.windows)for(let pane=0;pane<window.panes;pane++){
        if(window.broken&(1<<pane))continue;
        const along=window.lo+(window.hi-window.lo)*(pane+.5)/window.panes;
        const dx=(window.axis?along:window.at)-shot.x,dy=(window.axis?window.at:along)-shot.y,d=Math.hypot(dx,dy);
        if(d>=radius)continue;
        const hit=this.ray(shot.x,shot.y,dx/(d||1),dy/(d||1),d+.02);
        if(hit.window===window&&hit.pane===pane)glassHits.push([window,pane]);
      }
      for(const [window,pane]of glassHits)this.shatterWindow(window,pane);
      for(const e of this.enemies){const d=Math.hypot(e.x-shot.x,e.y-shot.y);if(e.hp>0&&d<radius&&this.sight(shot.x,shot.y,e.x,e.y))this.hurtEnemy(e,shot.damage*Math.max(.2,1-d/3.2));}
      for(const prop of this.scenery){const d=Math.hypot(prop.x-shot.x,prop.y-shot.y);if((prop.kind==='tnt'&&prop.state===0||(prop.kind==='chest'||prop.kind==='flowerpot')&&prop.state!==2)&&d<radius&&this.sight(shot.x,shot.y,prop.x,prop.y))this.hurtScenery(prop,shot.damage*Math.max(.2,1-d/3.2));}
      const d=Math.hypot(this.player.x-shot.x,this.player.y-shot.y);if(d<playerRadius&&this.sight(shot.x,shot.y,this.player.x,this.player.y))this.hurtPlayer((barrel?65:32)*(1-d/playerRadius));
    }
    update(dt,input={}){
      if(this.dead||this.won)return;dt=Math.min(dt,.04);const previousShotTime=this.shotTime;this.time+=dt;this.shotTime+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.switchTime=Math.max(0,this.switchTime-dt);
      this.damageFlash=Math.max(0,this.damageFlash-dt);this.pickupFlash=Math.max(0,this.pickupFlash-dt);this.muzzle=Math.max(0,this.muzzle-dt);this.hitmarker=Math.max(0,this.hitmarker-dt);
      this.tickReload(dt);
      this.updateDoors(dt);
      const p=this.player;p.angle=(p.angle+(input.turn||0)*dt*2.25)%TAU;
      let forward=input.forward||0,strafe=input.strafe||0;const len=Math.hypot(forward,strafe);if(len>1){forward/=len;strafe/=len;}
      const speed=(input.run?3.9:2.75)*dt,cs=Math.cos(p.angle),sn=Math.sin(p.angle);this.moving=Math.hypot(forward,strafe);
      this.move(p,(cs*forward-sn*strafe)*speed,(sn*forward+cs*strafe)*speed,p.radius);
      if(this.moving>.1&&this.time-this.lastStep>(input.run?.29:.43)){this.lastStep=this.time;this.emit('step');}
      if(input.fire)this.fire();
      for(const prop of this.scenery)if(prop.kind==='tnt'&&prop.state===1&&this.time>=prop.explodeAt){prop.state=2;prop.explodeAt=Infinity;this.navTimer=0;this.extractionPath=null;this.explode({x:prop.x,y:prop.y,kind:'tnt',damage:150});}
      if(this.floor(p.x,p.y)===1){this.hazardTimer+=dt;if(this.hazardTimer>.65){this.hazardTimer=0;this.hurtPlayer(7);this.emit('toxic');}}else this.hazardTimer=0;
      this.navTimer-=dt;if(this.navTimer<=0){this.navTimer=.28;this.updateNavigation();}
      for(const e of this.enemies){
        const t=TYPES[e.type];e.hurt=Math.max(0,e.hurt-dt);e.moving=false;
        if(e.hp<=0){e.death+=dt;e.frame=e.death<.27?6:7;if(e.type===2&&!e.detonated&&this.time>=e.explodeAt)this.detonateCreeper(e);continue;}
        const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy),visible=d<12&&this.sight(e.x,e.y,p.x,p.y)&&!this.sceneryRay(e.x,e.y,dx/(d||1),dy/(d||1),d);
        if(visible&&d<9)e.active=true;
        if(!e.active){e.frame=0;continue;}
        e.cooldown-=dt;
        if(e.hurt>0&&e.type<4&&e.type!==2){e.frame=5;continue;}
        if(e.type===2&&e.attack>=0&&d>2.4){e.attack=-1;e.cooldown=.15;}
        if(e.attack>=0){const previous=e.attack;e.attack+=dt;if(previous<t.windup&&e.attack>=t.windup)this.enemyAttack(e);
          e.frame=e.type===2?(Math.floor(e.attack*14)%2?3:4):e.attack<t.windup?3:4;if(e.attack>t.windup+.24){e.attack=-1;e.cooldown=t.cooldown*(.85+this.random()*.3);}continue;}
        if(visible&&d<t.range&&e.cooldown<=0){e.attack=0;e.frame=3;continue;}
        if(d>.65&&(e.type!==1&&e.type!==5||d>t.range*.62||!visible)){
          let tx=p.x,ty=p.y;
          // Clear glass permits sight, but the sill still requires a route to a door.
          if(!visible||this.movementBlocked(e.x,e.y,dx/(d||1),dy/(d||1),d,t.radius+.025)||this.sceneryRay(e.x,e.y,dx/(d||1),dy/(d||1),d,t.radius+.04)){const cell=Math.floor(e.y)*MW+Math.floor(e.x);let best=this.nav[cell],target=cell;
            for(const next of [cell-1,cell+1,cell-MW,cell+MW])if(this.nav[next]>=0&&this.edgePassable(cell,next)&&(best<0||this.nav[next]<best)){best=this.nav[next];target=next;}
            tx=target%MW+.5;ty=Math.floor(target/MW)+.5;}
          let vx=tx-e.x,vy=ty-e.y,vl=Math.hypot(vx,vy)||1;vx/=vl;vy/=vl;
          for(const o of this.enemies){if(o===e||o.hp<=0)continue;const ox=e.x-o.x,oy=e.y-o.y,od=Math.hypot(ox,oy);if(od<.63&&od>.001){vx+=ox/od*(.63-od)*3;vy+=oy/od*(.63-od)*3;}}
          // Limit separation impulses, then advance the gait only as feet travel.
          // Slowing at a corner slows the steps; a blocked mob cannot walk in place.
          const velocity=Math.max(1,Math.hypot(vx,vy));vx/=velocity;vy/=velocity;
          const oldX=e.x,oldY=e.y;e.facing=Math.atan2(vy,vx);this.move(e,vx*t.speed*dt,vy*t.speed*dt,t.radius);
          const door=this.nearbyDoor(e,false);
          if(door&&!door.target&&Math.hypot(door.x-e.x,door.y-e.y)<1.1)this.setDoor(door,true,e);
          const travelled=Math.hypot(e.x-oldX,e.y-oldY);e.moving=travelled>.0001;
          if(e.moving)e.walk=(e.walk+travelled/t.stride*TAU)%TAU;
        }
        e.frame=e.hurt>0?5:e.moving?8+Math.floor(e.walk/TAU*24):0;
      }
      for(const shot of this.projectiles){
        shot.life-=dt;const speed=Math.hypot(shot.vx,shot.vy),steps=Math.max(1,Math.ceil(speed*dt/.12)),distance=speed*dt/steps,dx=shot.vx/(speed||1),dy=shot.vy/(speed||1);
        for(let i=0;i<steps&&shot.life>0;i++){
          const hit=this.ray(shot.x,shot.y,dx,dy,distance,null,shot.z),travel=hit.cell?Math.max(0,hit.distance-.025):distance;
          const object=this.sceneryRay(shot.x,shot.y,dx,dy,Math.min(distance,hit.distance),.06);
          if(object){shot.x+=dx*object.distance;shot.y+=dy*object.distance;shot.life=0;this.hurtScenery(object.prop,shot.damage);continue;}
          shot.x+=dx*travel;shot.y+=dy*travel;
          if(hit.cell){shot.life=0;if(hit.window)this.shatterWindow(hit.window,hit.pane);else this.sparks(shot.x,shot.y,.65,6,'ember');}
          else if(Math.hypot(shot.x-p.x,shot.y-p.y)<.27){this.hurtPlayer(shot.damage);shot.life=0;}
        }
      }this.projectiles=this.projectiles.filter(v=>v.life>0);
      for(const v of this.particles){v.life-=dt;v.x+=v.vx*dt;v.y+=v.vy*dt;v.z+=v.vz*dt;v.vz-=5*dt;}this.particles=this.particles.filter(v=>v.life>0&&v.z>0);
      for(const item of this.pickups){if(item.taken||Math.hypot(item.x-p.x,item.y-p.y)>.58)continue;
        if(item.kind==='health'&&p.health>=100)continue;if(item.kind==='armor'&&p.armor>=100)continue;
        if(item.kind==='health')p.health=Math.min(100,p.health+35);
        else if(item.kind==='armor')p.armor=Math.min(100,p.armor+35);
        else if(item.kind==='ammo'){
          let supplied=false;
          for(let i=1;i<WEAPONS.length;i++)if(this.unlocked[i]&&this.reserves[i]<WEAPONS[i].reserve*2){this.reserves[i]=Math.min(WEAPONS[i].reserve*2,this.reserves[i]+[0,10,60,14,50,100][i]);supplied=true;}
          if(!supplied)continue;
        }else continue;
        item.taken=true;this.pickupFlash=.22;this.emit('pickup',{kind:item.kind});
      }
      if(this.kills===this.enemies.length&&Math.hypot(p.x-this.exit.x,p.y-this.exit.y)<.8){this.won=true;this.emit('won');}
    }
    weaponFrame(){
      if(this.reloadTime>0){
        if(this.weapon===3)return this.reloadPhase==='start'?2:this.reloadPhase==='finish'?6:(this.reloadElapsed/this.reloadDuration<.42?3:4);
        return Math.min(6,2+Math.floor(this.reloadElapsed/this.reloadDuration*5));
      }
      return this.shotTime<Math.min(.085,WEAPONS[this.weapon].cooldown*.65)?1:0;
    }
    weaponFireFrame(){
      // Gun, hot gas and smoke share one sprite. Explosions light the scene but
      // never trigger this animation; each shot restarts its own short sequence.
      if(this.reloadTime>0||this.switchTime>0)return -1;
      const duration=Math.min(.105,WEAPONS[this.weapon].cooldown*.88);
      if(this.shotTime>=duration)return -1;
      const phase=this.shotTime/duration;
      return phase<.23?0:phase<.58?1:2;
    }

  }
  const api={World,createLevel,reachable,validLevel,TYPES,WEAPONS,LEVELS,clamp,angleDiff,MW,MH};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CounterCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
