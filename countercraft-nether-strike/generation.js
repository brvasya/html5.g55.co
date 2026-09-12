/* Countercraft — seeded room templates, connected routes and encounter placement. */
(function(root){
  'use strict';
  function seededRandom(seed){
    let state=seed>>>0;
    return ()=>{state=(state+0x6d2b79f5)>>>0;let x=state;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;};
  }
  function newSeed(){
    if(typeof crypto!=='undefined'&&crypto.getRandomValues)return crypto.getRandomValues(new Uint32Array(1))[0];
    return (Math.random()*4294967296)>>>0;
  }
  function sectorSeed(seed,level,attempt=0){return (seed^Math.imul(level+1,0x9e3779b1)^Math.imul(attempt,0x85ebca6b))>>>0;}
  function generate(levelIndex,seed,attempt,core){
    const {MW,MH,LEVELS,TYPES}=core,level=LEVELS[levelIndex],random=seededRandom(sectorSeed(seed,levelIndex,attempt));
    const integer=(a,b)=>a+Math.floor(random()*(b-a+1)),choose=a=>a[integer(0,a.length-1)];
    const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=integer(0,i);[a[i],a[j]]=[a[j],a[i]];}return a;};
    const walls=new Uint8Array(MW*MH).fill(1),floors=new Uint8Array(MW*MH),ceilings=new Uint8Array(MW*MH);
    const zones=new Int8Array(MW*MH).fill(-1),routes=new Uint8Array(MW*MH),cover=new Uint8Array(MW*MH);
    const safe=attempt>=8;
    const rooms=Array.from({length:9},(_,id)=>{
      const width=integer(9,12),height=integer(8,10),x1=2+(id%3)*15+integer(0,13-width),y1=2+Math.floor(id/3)*12+integer(0,10-height);
      return {id,x1,y1,x2:x1+width-1,y2:y1+height-1,cx:x1+Math.floor(width/2),cy:y1+Math.floor(height/2),outdoor:false,template:integer(0,3),neighbors:[]};
    });
    const startRoom=choose([0,2,6,8]),edges=[],seen=new Set([startRoom]),stack=[startRoom];
    const adjacent=id=>[id%3>0?id-1:-1,id%3<2?id+1:-1,id>=3?id-3:-1,id<6?id+3:-1].filter(v=>v>=0);
    const connect=(a,b)=>{edges.push([a,b]);rooms[a].neighbors.push(b);rooms[b].neighbors.push(a);};
    while(stack.length){const a=stack[stack.length-1],options=adjacent(a).filter(b=>!seen.has(b));if(!options.length){stack.pop();continue;}const b=choose(options);seen.add(b);connect(a,b);stack.push(b);}
    const extra=shuffle(rooms.flatMap(r=>adjacent(r.id).filter(b=>b>r.id&&!r.neighbors.includes(b)).map(b=>[r.id,b])));
    for(const [a,b]of extra.slice(0,[1,2,2,3,3][levelIndex]))connect(a,b);
    const distances=new Int8Array(9).fill(-1),queue=[startRoom];distances[startRoom]=0;
    for(let h=0;h<queue.length;h++)for(const b of rooms[queue[h]].neighbors)if(distances[b]<0){distances[b]=distances[queue[h]]+1;queue.push(b);}
    const far=Math.max(...distances),endRoom=choose(rooms.filter(r=>distances[r.id]===far).map(r=>r.id));
    const outdoor=shuffle(rooms.filter(r=>r.id!==startRoom).map(r=>r.id)).slice(0,levelIndex===1?4:3);
    if(levelIndex===4&&!outdoor.includes(endRoom))outdoor[0]=endRoom;
    for(const id of outdoor)rooms[id].outdoor=true;
    const paint=(x1,y1,x2,y2,roof,zone)=>{
      for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++){const i=y*MW+x;walls[i]=0;floors[i]=roof?0:3;ceilings[i]=roof;zones[i]=zone;}
    };
    for(const room of rooms){
      paint(room.x1,room.y1,room.x2,room.y2,room.outdoor?0:1,room.id);
      if(room.outdoor){
        // A roofed wing beside an open court gives long facades for real windows.
        const side=integer(0,3);room.wing=side;
        if(side===0)paint(room.x1,room.y1,room.x1+2,room.y2,1,room.id);
        if(side===1)paint(room.x2-2,room.y1,room.x2,room.y2,1,room.id);
        if(side===2)paint(room.x1,room.y1,room.x2,room.y1+2,1,room.id);
        if(side===3)paint(room.x1,room.y2-2,room.x2,room.y2,1,room.id);
      }
    }
    const line=(ax,ay,bx,by,roof)=>{
      const n=Math.max(Math.abs(bx-ax),Math.abs(by-ay));
      for(let t=0;t<=n;t++){
        const cx=ax+Math.sign(bx-ax)*t,cy=ay+Math.sign(by-ay)*t;
        for(let y=cy-1;y<=cy+1;y++)for(let x=cx-1;x<=cx+1;x++){
          const i=y*MW+x;if(walls[i]){walls[i]=0;ceilings[i]=roof;floors[i]=roof?0:4;}routes[i]=1;
          if(!ceilings[i])floors[i]=4;
        }
      }
    };
    for(const [ai,bi]of edges){
      const a=rooms[ai],b=rooms[bi],roof=a.outdoor&&b.outdoor?0:1;
      if(Math.floor(ai/3)===Math.floor(bi/3)){
        const mid=Math.floor((a.cx+b.cx)/2)+integer(-1,1);
        line(a.cx,a.cy,mid,a.cy,roof);line(mid,a.cy,mid,b.cy,roof);line(mid,b.cy,b.cx,b.cy,roof);
      }else{
        const mid=Math.floor((a.cy+b.cy)/2)+integer(-1,1);
        line(a.cx,a.cy,a.cx,mid,roof);line(a.cx,mid,b.cx,mid,roof);line(b.cx,mid,b.cx,b.cy,roof);
      }
    }
    const first=rooms[startRoom],last=rooms[endRoom],toward=rooms[first.neighbors[0]];
    const start={x:first.cx+.5,y:first.cy+.5,angle:Math.atan2(toward.cy-first.cy,toward.cx-first.cx)};
    const exit={x:last.x2-1.5,y:last.y2-1.5};
    // Reserve the spawn, boss arena and extraction approach before adding cover.
    const reserved=(x,y)=>Math.hypot(x-start.x,y-start.y)<3||Math.hypot(x-exit.x,y-exit.y)<2||(levelIndex===4&&zones[Math.floor(y)*MW+Math.floor(x)]===endRoom);
    for(const r of rooms)if(!safe&&r.id!==startRoom){
      const candidates=shuffle(Array.from({length:(r.x2-r.x1-1)*(r.y2-r.y1-1)},(_,n)=>({x:r.x1+1+n%(r.x2-r.x1-1),y:r.y1+1+Math.floor(n/(r.x2-r.x1-1))}))).filter(p=>!routes[p.y*MW+p.x]&&!reserved(p.x+.5,p.y+.5));
      for(const p of candidates.slice(0,r.template===0?0:r.template===1?2:3)){
        const i=p.y*MW+p.x;
        // Solid cover is kept clear of every connecting corridor.
        walls[i]=1;cover[i]=1;
      }
      if(levelIndex>=2)for(const p of candidates.slice(4,7))if(!walls[p.y*MW+p.x])floors[p.y*MW+p.x]=1;
    }
    const facadeTexture=[0,3,8,8,9][levelIndex],rockTexture=[6,8,11,6,9][levelIndex];
    const wallTextures=new Uint8Array(MW*MH).fill(255),wallHeights=new Float32Array(MW*MH).fill(1.5);
    for(let y=1;y<MH-1;y++)for(let x=1;x<MW-1;x++){
      const i=y*MW+x;if(!walls[i])continue;
      const neighbors=[i-1,i+1,i-MW,i+MW],outside=neighbors.some(n=>!walls[n]&&!ceilings[n]),building=neighbors.some(n=>!walls[n]&&ceilings[n]);
      if(outside){wallTextures[i]=building?facadeTexture:rockTexture;wallHeights[i]=building?2.2:2.65+((x+y)%3)*.12;}
      if(cover[i]){wallTextures[i]=ceilings[i]?3:levelIndex===4?9:8;wallHeights[i]=1.5;}
    }
    const windowRecesses=new Uint8Array(MW*MH);
    for(let y=2;y<MH-2;y++)for(let x=2;x<MW-2;x++){
      const i=y*MW+x;if(!walls[i]||cover[i])continue;
      for(let axis=0;axis<2;axis++){
        const across=axis?MW:1,along=axis?1:MW,a=i-across,b=i+across;
        if(walls[a]||walls[b]||ceilings[a]===ceilings[b]||!walls[i-along]||!walls[i+along])continue;
        if([i-1,i+1,i-MW,i+MW].some(n=>windowRecesses[n]))continue;
        walls[i]=0;ceilings[i]=1;floors[i]=0;windowRecesses[i]=1;break;
      }
    }
    const edgeX=new Uint8Array(MW*MH),edgeY=new Uint8Array(MW*MH);
    for(let y=1;y<MH-1;y++)for(let x=1;x<MW-1;x++){
      const i=y*MW+x;if(walls[i])continue;
      if(!walls[i-1]&&ceilings[i]!==ceilings[i-1])edgeX[i]=1;
      if(!walls[i-MW]&&ceilings[i]!==ceilings[i-MW])edgeY[i]=1;
    }
    const runs=(edges,axis,visit)=>{
      for(let line=1;line<(axis?MH:MW)-1;line++){
        let from=-1;
        for(let t=1;t<(axis?MW:MH);t++){
          if(edges[axis?line*MW+t:t*MW+line]===1){if(from<0)from=t;continue;}
          if(from>=0){visit(line,from,t);from=-1;}
        }
      }
    };
    const portals=[],doors=[];
    for(let axis=0;axis<2;axis++)runs(axis?edgeY:edgeX,axis,(at,lo,hi)=>{
      const length=hi-lo;
      // Recess windows are alcoves; the room's actual facade entrances carry doors.
      const cells=Array.from({length},(_,n)=>axis?at*MW+lo+n:(lo+n)*MW+at);
      if(cells.every(i=>windowRecesses[i]||windowRecesses[i-(axis?MW:1)]))return;
      const center=length===2?lo+1:Math.floor((lo+hi-1)/2)+.5,half=length<=2?length/2-.05:.8;
      const openingLo=center-half,openingHi=center+half,id=portals.length;
      const portal={axis,at,lo:openingLo-.10,hi:openingHi+.10,opening:1.3};portals.push(portal);
      for(let t=Math.floor(openingLo);t<Math.ceil(openingHi);t++)(axis?edgeY:edgeX)[axis?at*MW+t:t*MW+at]=id+2;
      const door={id,portal:id,axis,at,lo:openingLo,hi:openingHi,height:1.3,x:axis?center:at,y:axis?at:center,
        open:0,target:0,swing:1,material:[0,0,2,2,1][levelIndex],panels:[]};portal.door=door;doors.push(door);
    });
    const windows=[],windowX=new Uint16Array(MW*MH),windowY=new Uint16Array(MW*MH);
    for(let axis=0;axis<2;axis++)runs(axis?edgeY:edgeX,axis,(at,lo,hi)=>{
      const length=hi-lo,count=Math.max(1,Math.floor(length/3.5)),width=length===1?.68:Math.min(1.6,length-.6);
      for(let n=0;n<count;n++){
        const center=lo+length*(n+.5)/count,window={id:windows.length,axis,at,lo:center-width/2,hi:center+width/2,bottom:.38,top:1.18,x:axis?center:at,y:axis?at:center,panes:width>1?2:1,broken:0};windows.push(window);
        for(let t=Math.floor(window.lo);t<Math.ceil(window.hi);t++)(axis?windowY:windowX)[axis?at*MW+t:t*MW+at]=window.id+1;
      }
    });
    const scenery=[],enemies=[],pickups=[],names=[['OUTPOST','SUPPLY ROOM','SAND COURT'],['HOUSE','TAVERN','VILLAGE GREEN'],['REACTOR HALL','SERVICE ROOM','COOLANT COURT'],['BUNKER','RELAY ROOM','RAVINE'],['KEEP','CRYPT','LAVA COURT']][levelIndex];
    const landmarks=rooms.map(r=>[r.id===startRoom?'INSERTION':r.id===endRoom?(levelIndex===4?'GOLEM ARENA':'EXTRACTION'):names[r.outdoor?2:r.template%2]+' '+(r.id+1),r.cx+.5,r.cy+.5]);
    const data={width:MW,height:MH,walls,floors,ceilings,wallTextures,wallHeights,facadeTexture,edgeX,edgeY,portals,doors,windows,windowX,windowY,windowRecesses,scenery,enemies,pickups,exit,start,landmarks,levelIndex,level,rooms,zones,routes,startRoom,endRoom,campaignSeed:seed>>>0,generationAttempt:attempt,generationFallback:false};
    const terrain=core.terrain(data),reach=core.reachable(terrain,true);
    if(!doors.length||!windows.length||rooms.some(r=>reach[r.cy*MW+r.cx]<0))return null;
    const available=rooms.map(r=>shuffle(Array.from({length:(r.x2-r.x1+1)*(r.y2-r.y1+1)},(_,n)=>({x:r.x1+n%(r.x2-r.x1+1)+.5,y:r.y1+Math.floor(n/(r.x2-r.x1+1))+.5,room:r.id}))).filter(p=>{
      const i=Math.floor(p.y)*MW+Math.floor(p.x);
      return !walls[i]&&floors[i]!==1&&reach[i]>=0&&!windowRecesses[i]&&terrain.canStand(p.x,p.y,.4,true,true)&&doors.every(d=>Math.hypot(d.x-p.x,d.y-p.y)>1.75)&&Math.hypot(p.x-start.x,p.y-start.y)>1.8&&Math.hypot(p.x-exit.x,p.y-exit.y)>1.55;
    }));
    const occupied=[];
    const spot=(room,predicate=()=>true,radius=.24)=>{
      const p=available[room].find(p=>predicate(p)&&occupied.every(o=>Math.hypot(o.x-p.x,o.y-p.y)>o.radius+radius+.28));
      if(p)occupied.push({...p,radius});return p;
    };
    const spawn=(type,p)=>{
      const id=enemies.length;enemies.push({id,type,x:p.x,y:p.y,hp:TYPES[type].hp,active:false,walk:(random()*Math.PI*2),attack:-1,cooldown:1+random(),hurt:0,death:-1,frame:0,moving:false,facing:random()*Math.PI*2,detonated:false,explodeAt:Infinity});
    };
    if(levelIndex===4){const p=spot(endRoom,p=>Math.hypot(p.x-(last.cx+.5),p.y-(last.cy+.5))<2,.65);if(!p)return null;spawn(5,p);}
    const order=shuffle(rooms.filter(r=>r.id!==startRoom)).sort((a,b)=>distances[a.id]-distances[b.id]).map(r=>r.id);
    const cost=[1,1.6,1.8,1.35,3.8,18],rosters=[[0,0,0,1,2],[0,0,1,2,3],[0,1,2,3,4],[0,1,2,3,4,4],[0,1,2,3,4,4]];
    let budget=[32,46,63,78,98][levelIndex]-(levelIndex===4?18:0),limit=[26,33,39,44,48][levelIndex],misses=0,round=0;
    while(enemies.length<limit&&budget>=1&&misses<order.length*2){
      const room=order[round++%order.length],roster=rosters[levelIndex].filter(t=>cost[t]<=budget&&(t!==4||distances[room]>1));
      const type=levelIndex===0&&enemies.length<6?0:choose(roster),p=spot(room,p=>Math.hypot(p.x-start.x,p.y-start.y)>=7,TYPES[type].radius+.06);
      if(!p){misses++;continue;}spawn(type,p);budget-=cost[type];misses=0;
    }
    if(enemies.length<20+levelIndex*3)return null;
    const pickup=(kind,room)=>{const p=spot(room,()=>true,.12);if(p)pickups.push({id:pickups.length,kind,x:p.x,y:p.y,taken:false});return Boolean(p);};
    pickup('health',startRoom);pickup('armor',startRoom);pickup('ammo',startRoom);
    for(let n=0;n<order.length;n++){pickup('ammo',order[n]);if(n%2===0)pickup('health',order[n]);if(n%3===1)pickup('armor',order[n]);}
    const nearWall=p=>{const i=Math.floor(p.y)*MW+Math.floor(p.x);return [i-1,i+1,i-MW,i+MW].some(n=>walls[n]);};
    const offRoute=p=>!routes[Math.floor(p.y)*MW+Math.floor(p.x)];
    const addProp=(p,kind,settings)=>{scenery.push({id:scenery.length,kind,x:p.x,y:p.y,state:0,...settings});};
    for(const room of shuffle([...order,startRoom]).slice(0,[4,4,5,5,6][levelIndex])){
      const p=spot(room,p=>offRoute(p)&&nearWall(p),.30);
      if(p)addProp(p,'chest',{radius:.26,height:.52,hp:40,lootKind:choose(['ammo','health','armor'])});
    }
    let lastTnt=null;
    for(let n=0;n<6+levelIndex*2;n++){
      const room=order[n%order.length],p=spot(room,p=>offRoute(p)&&Math.hypot(p.x-start.x,p.y-start.y)>7&&enemies.some(e=>Math.hypot(e.x-p.x,e.y-p.y)<3.5),.38);
      if(p){addProp(p,'tnt',{radius:.34,height:.58,hp:1,explodeAt:Infinity,variant:0});lastTnt=p;
        if(n%3===0){const q=spot(room,q=>offRoute(q)&&Math.hypot(q.x-lastTnt.x,q.y-lastTnt.y)<1.6,.38);if(q)addProp(q,'tnt',{radius:.34,height:.58,hp:1,explodeAt:Infinity,variant:0});}}
    }
    const biome=[[0,1,6],[3,2,10],[6,7,11],[1,4,7],[4,5,7]][levelIndex];
    for(const room of rooms){const count=integer(4,6);for(let n=0;n<count;n++){
      const p=spot(room.id,p=>offRoute(p)&&nearWall(p),.18);if(!p)continue;
      const inside=ceilings[Math.floor(p.y)*MW+Math.floor(p.x)],variant=inside?choose([10,10,11,6]):choose(biome);
      if(variant===10)addProp(p,'flowerpot',{radius:0,hitRadius:.19,height:.38,hp:1,variant});
      else addProp(p,'decor',{radius:variant===3?.16:0,height:variant===3?1.55:variant===0?1:variant===7?.7:variant===4?.6:variant===11?.5:.36,variant});
    }
    }
    return data;
  }
  const api={seededRandom,newSeed,sectorSeed,generate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CounterGeneration=api;
})(typeof globalThis!=='undefined'?globalThis:this);
