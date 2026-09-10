/* Iron Breach — deterministic world, collision, combat and enemy animation state. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2, MW = 48, MH = 40;
  const TYPES = [
    { name:'Imp', hp:66, speed:1.05, radius:.24, height:1.12, range:5.8, windup:.50, cooldown:2.4, damage:13, score:100 },
    { name:'Mauler', hp:115, speed:1.65, radius:.30, height:1.02, range:1.04, windup:.42, cooldown:1.05, damage:19, score:200 },
    { name:'Trooper', hp:48, speed:.90, radius:.23, height:1.10, range:6.6, windup:.40, cooldown:1.9, damage:9, score:125 },
    { name:'Wraith', hp:78, speed:1.9, radius:.22, height:1.08, range:5.5, windup:.36, cooldown:1.55, damage:14, score:180 },
    { name:'Juggernaut', hp:180, speed:.7, radius:.32, height:1.24, range:7, windup:.55, cooldown:1.65, damage:12, score:300 },
    { name:'Overlord', hp:950, speed:.65, radius:.39, height:1.48, range:9, windup:.65, cooldown:1.5, damage:20, score:2000 }
  ];
  const WEAPONS = [
    { name:'PUMP SHOTGUN', cooldown:.72, pellets:7, damage:13, spread:.085 },
    { name:'PULSE RIFLE', cooldown:.13, pellets:1, damage:19, spread:.018 },
    { name:'CHAINGUN', cooldown:.075, pellets:1, damage:12, spread:.035 },
    { name:'ROCKET LAUNCHER', cooldown:1.05, pellets:1, damage:135, spread:0, projectile:true },
    { name:'DOUBLE-BARREL SHOTGUN', cooldown:1.35, pellets:20, damage:18, spread:.14, range:16, ammoSlot:0, ammoCost:2 }
  ];
  const DOUBLE_RELOAD = [
    {time:.23,frame:3,sound:'breakOpen'},
    {time:.40,frame:4,sound:'shellEject'},
    {time:.62,frame:5,sound:'shellLoad'},
    {time:.94,frame:6,sound:'breakClose'},
    {time:1.14,frame:7},
    {time:1.30,frame:0}
  ];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  const rocketView=(shot,viewer)=>((Math.round(angleDiff(Math.atan2(shot.vy,shot.vx),Math.atan2(shot.y-viewer.y,shot.x-viewer.x))*4/Math.PI)%8)+8)%8;
  const LEVELS=[
    {name:'FOUNDRY',tag:'CONTAINMENT LOST',layout:0,theme:0,skyTint:[1,1,1],tint:null,indoorTexture:0},
    {name:'REACTOR',tag:'CORE INSTABILITY',layout:1,theme:1,skyTint:[.72,.92,1.13],tint:[.78,.98,1.13],indoorTexture:5},
    {name:'BADLANDS',tag:'BREACH THE PERIMETER',layout:3,theme:3,skyTint:[1.18,.88,.60],tint:[1.10,.94,.78],indoorTexture:0},
    {name:'SPACEPORT',tag:'SECURE THE LAUNCH COMPLEX',layout:4,theme:4,skyTint:[.65,.82,1.03],tint:[.78,.92,1.08],indoorTexture:5},
    {name:'CITADEL',tag:'ELIMINATE THE OVERLORD',layout:2,theme:2,skyTint:[1.12,.76,.68],tint:[1.20,.82,.78],indoorTexture:3}
  ];
  const OUTDOOR_LAYOUTS=[
    {
      yards:[[33,3,44,19],[11,26,35,36]],
      rooms:[[28,7,34,9],[29,18,34,20],[10,20,13,28],[28,21,30,29],[37,25,44,35],[42,18,44,27],[32,31,39,33],[3,27,7,35],[6,29,13,31]],
      blocks:[[39,5,41,7],[40,14,42,16],[15,29,18,31],[23,32,26,34],[30,26,32,28],[40,28,41,31]],
      pools:[[34,11,35,13],[20,27,22,28]],
      enemies:[[3,36.5,6.5],[4,41.5,10.5],[1,35.5,16.5],[0,14.5,27.5],[2,21.5,30.5],[3,29.5,34.5],[1,33.5,29.5],[4,42.5,27.5],[2,38.5,34.5],[0,4.5,32.5]],
      supplies:[['ammo',34.5,8.5],['health',43.5,17.5],['ammo',12.5,28.5],['armor',5.5,28.5],['health',21.5,35.5],['ammo',31.5,32.5],['rockets',38.5,26.5],['health',43.5,34.5]],
      landmarks:[['CARGO YARD',38,5],['SMELTER COURT',23,36],['ARMORY',40,25],['STORES',5,27]],
      entrances:[[0,35,8.5],[0,35,19],[1,18,43.5],[0,14,27.5],[1,30,29.5],[0,32,32.5]],
      paths:[[34,8,36,9],[35,8,36,17],[35,17,43,18],[42,17,43,19],[13,27,22,28],[21,28,22,35],[22,30,33,31],[28,29,29,32]],
      rockCuts:[[33,3,35,4],[43,3,44,5],[33,26,35,27],[11,35,13,36],[34,35,35,36]],
      barrels:[[37.5,9.5],[38.7,9.8],[42.5,12.5],[37.5,18.5],[19.5,31.5],[20.7,31.7],[28.5,32.5],[32.5,34.5]],
      trees:[[34.5,5.5],[43.5,10.5],[37.5,16.5],[15.5,34.5],[19.5,27.5],[27.5,35.5],[34.5,28.5],[24.5,30.5]],
      exit:[44.3,33.5],gate:[45,33]
    },
    {
      yards:[[12,11,26,16],[34,5,44,24],[17,28,35,36]],
      rooms:[[14,8,16,12],[12,15,14,19],[29,7,36,9],[28,18,36,20],[18,22,20,30],[3,27,13,35],[6,21,8,29],[11,31,20,33],[28,21,30,30],[38,28,44,36],[42,22,44,30],[33,32,40,34]],
      blocks:[[37,10,39,12],[40,18,42,20],[21,30,23,32],[29,33,31,35],[8,28,8,30],[8,33,8,35]],
      pools:[[16,12,19,14],[35,14,36,16],[25,29,27,31]],
      enemies:[[3,13.5,13.5],[4,23.5,13.5],[4,41.5,8.5],[3,35.5,12.5],[1,43.5,16.5],[2,37.5,22.5],[0,5.5,29.5],[2,11.5,34.5],[4,19.5,34.5],[3,29.5,29.5],[1,34.5,35.5],[4,40.5,30.5],[2,43.5,35.5]],
      supplies:[['ammo',14.5,15.5],['health',37.5,6.5],['ammo',43.5,22.5],['armor',4.5,34.5],['ammo',12.5,28.5],['health',19.5,29.5],['rockets',33.5,30.5],['ammo',39.5,29.5],['health',43.5,33.5]],
      landmarks:[['COOLANT COURT',18,16],['COOLING YARD',39,6],['RELAY FIELD',26,36],['SERVICE',9,27]],
      entrances:[[0,37,8.5],[0,37,19.5],[1,22,43.5],[1,13,15.5],[1,15,13.5],[0,27,14.5],[1,11,22.5],[0,21,29],[0,33,33.5],[1,31,29.5]],
      paths:[[13,14,25,15],[22,11,23,14],[36,8,41,9],[40,8,41,16],[36,16,43,17],[42,17,43,22],[20,28,20,34],[20,33,28,34],[28,30,29,32],[29,32,33,33]],
      rockCuts:[[34,5,35,6],[43,5,44,7],[34,22,35,24],[17,28,17,30],[34,28,35,29],[17,36,19,36],[35,35,35,36]],
      barrels:[[21.5,12.5],[22.7,12.5],[38.5,8.5],[39.7,8.7],[38.5,20.5],[42.5,21.5],[24.5,33.5],[25.7,33.7],[30.5,31.5],[31.7,31.5]],
      trees:[[24.5,12.5],[20.5,15.5],[35.5,10.5],[42.5,14.5],[40.5,23.5],[18.5,35.5],[26.5,34.5],[34.5,31.5]],
      exit:[44.3,34.5],gate:[45,34]
    },
    {
      yards:[[34,3,45,19],[3,26,14,36],[18,26,45,36]],
      rooms:[[28,7,36,9],[28,16,36,18],[7,21,9,28],[10,20,13,28],[12,31,21,33],[20,21,22,28],[29,21,31,28],[42,18,44,28],[35,20,40,24],[30,21,44,23]],
      blocks:[[39,5,41,7],[37,14,39,16],[6,29,8,32],[11,31,12,33],[27,28,33,33],[21,29,23,31],[37,27,39,28],[40,34,41,35]],
      innerRooms:[[28,29,32,32],[30,27,31,29]],
      pools:[[4,27,5,29],[24,34,26,35],[35,29,36,31],[42,4,43,5]],
      enemies:[[4,35.5,5.5],[3,43.5,8.5],[0,36.5,12.5],[1,43.5,16.5],[3,4.5,33.5],[4,11.5,28.5],[2,10.5,35.5],[2,36.5,22.5],[4,39.5,22.5],[1,20.5,27.5],[3,25.5,31.5],[0,30.5,35.5],[4,35.5,34.5],[3,44.5,29.5],[2,43.5,35.5],[2,29.5,30.5]],
      supplies:[['ammo',36.5,17.5],['health',44.5,12.5],['rockets',35.5,4.5],['armor',13.5,34.5],['ammo',5.5,35.5],['health',10.5,27.5],['ammo',22.5,35.5],['health',29.5,31.5],['ammo',42.5,27.5],['rockets',44.5,33.5],['armor',38.5,23.5]],
      landmarks:[['OUTER WALL',39,4],['SUPPLY COURT',8,36],['BASTION',30,30],['OVERLORD ARENA',40,36]],
      entrances:[[0,37,8.5],[0,37,18],[1,18,43.5],[1,20,37.5],[1,29,10.5],[0,7,27.5],[0,22,33],[1,31,14],[0,23,27.5],[0,32,27],[1,29,43.5],[0,20,27.5],[1,31,19.5]],
      paths:[[36,8,37,13],[37,12,44,13],[42,13,43,18],[36,18,38,19],[9,28,10,35],[9,34,13,35],[13,30,14,31],[22,32,26,33],[24,27,25,33],[24,26,32,27],[33,32,44,33],[42,28,43,33]],
      rockCuts:[[43,3,45,4],[44,5,45,5],[3,35,4,36],[13,26,14,26],[33,26,35,28],[44,35,45,36]],
      barrels:[[41.5,9.5],[42.7,9.7],[35.5,14.5],[43.5,15.5],[44.4,15.6],[4.5,31.5],[10.5,34.5],[22.5,34.5],[23.7,33.5],[38.5,31.5],[39.7,31.5],[41.5,31.5],[43.5,34.5]],
      trees:[[36.5,4.5],[44.5,10.5],[40.5,15.5],[4.5,30.5],[12.5,29.5],[5.5,34.5],[19.5,28.5],[24.5,31.5],[35.5,35.5],[40.5,27.5]],
      boss:[40.5,32.5],exit:[45.3,34.5],gate:[46,34]
    },
    {
      start:{x:4.5,y:5.5,angle:0},
      yards:[[11,3,44,18],[3,15,44,35]],
      rooms:[[2,2,10,10],[7,9,9,17],[3,24,11,31],[18,10,30,25],[30,7,38,10],[38,3,44,10],[40,21,44,31],[23,33,31,36]],
      blocks:[[22,13,26,16],[22,20,26,22],[12,5,14,7],[34,14,37,17],[6,18,8,20],[14,27,17,30],[34,27,37,30],[24,28,27,30]],
      pools:[[12,20,14,22],[32,21,34,23]],
      enemies:[[0,8.5,4.5],[2,8.5,13.5],[3,5.5,16.5],[1,10.5,21.5],[2,5.5,28.5],[4,9.5,25.5],[0,9.5,30.5],[3,6.5,33.5],[1,13.5,33.5],[2,19.5,29.5],[4,20.5,34.5],[3,26.5,35.5],[2,30.5,33.5],[0,28.5,28.5],[4,32.5,31.5],[1,39.5,34.5],[2,42.5,28.5],[3,42.5,23.5],[4,38.5,20.5],[0,36.5,24.5],[1,32.5,18.5],[2,28.5,23.5],[4,20.5,23.5],[3,20.5,17.5],[2,28.5,17.5],[0,20.5,11.5],[1,28.5,11.5],[3,16.5,13.5],[4,15.5,8.5],[2,20.5,5.5],[0,25.5,7.5],[3,30.5,4.5],[4,35.5,5.5],[2,35.5,8.5],[1,40.5,8.5],[4,42.5,4.5],[3,41.5,14.5],[2,31.5,14.5]],
      supplies:[['ammo',3.5,7.5],['armor',6.5,3.5],['health',8.5,16.5],['ammo',10.5,18.5],['rockets',4.5,25.5],['ammo',10.5,29.5],['health',5.5,30.5],['ammo',18.5,33.5],['health',25.5,34.5],['armor',30.5,35.5],['ammo',33.5,34.5],['rockets',42.5,30.5],['health',43.5,22.5],['ammo',38.5,23.5],['ammo',29.5,24.5],['health',19.5,24.5],['armor',24.5,18.5],['ammo',19.5,10.5],['health',16.5,6.5],['ammo',26.5,4.5],['rockets',32.5,8.5],['ammo',39.5,5.5],['health',43.5,9.5]],
      landmarks:[['ENTRY BUNKER',6,3],['WEST CANYON',11,23],['PUMP STATION',24,18],['RELAY BUNKER',27,36],['EAST WATCH',42,24],['RIDGE CONTROL',40,4]],
      entrances:[[0,11,6.5],[1,18,8.5],[1,24,7.5],[0,12,28.5],[1,32,7.5],[0,18,13.5],[0,18,22.5],[1,10,20.5],[0,31,18.5],[1,26,27.5],[1,11,41.5],[1,21,42.5],[0,40,26.5],[1,32,42.5],[1,33,26.5],[0,23,34.5],[0,32,34.5]],
      paths:[[10,6,11,7],[8,17,9,24],[11,28,13,29],[7,31,8,34],[8,33,23,34],[17,13,18,14],[17,21,18,23],[20,6,21,10],[27,25,28,33],[30,18,41,19],[41,10,42,21],[38,26,40,27],[31,34,42,35]],
      rockCuts:[[11,3,13,4],[3,15,4,16],[3,32,4,35],[42,33,44,35],[43,17,44,19]],
      barrels:[[10.5,16.5],[11.7,16.7],[5.5,22.5],[14.5,24.5],[15.7,24.7],[18.5,31.5],[21.5,32.5],[30.5,30.5],[31.7,30.7],[39.5,29.5],[38.5,21.5],[39.7,21.5],[32.5,13.5],[33.7,13.5],[24.5,5.5],[25.7,5.7]],
      trees:[[15.5,4.5],[17.5,7.5],[29.5,5.5],[36.5,12.5],[43.5,15.5],[16.5,19.5],[5.5,21.5],[5.5,34.5],[12.5,32.5],[20.5,31.5],[29.5,27.5],[33.5,24.5],[38.5,32.5],[40.5,20.5]],
      exit:[43.3,5.5],gate:[44,5]
    },
    {
      start:{x:4.5,y:34.5,angle:-Math.PI/2},
      yards:[[16,3,31,36],[33,22,44,35],[3,3,14,12]],
      rooms:[[3,28,13,36],[3,14,14,26],[6,23,10,30],[5,10,8,16],[12,18,18,20],[11,31,18,33],[33,3,44,14],[33,16,44,21],[38,12,41,18],[29,8,35,10],[29,26,35,28],[20,16,26,22],[39,20,42,24],[12,5,18,7],[39,30,44,36]],
      blocks:[[6,17,8,19],[10,22,12,24],[5,31,6,33],[19,11,21,13],[26,27,28,30],[21,32,23,34],[36,6,38,8],[39,11,41,12],[36,18,37,19],[36,29,37,31],[4,5,6,7],[10,9,12,10]],
      pools:[[17,24,18,26],[28,4,29,6]],
      enemies:[[2,9.5,34.5],[0,4.5,29.5],[1,12.5,29.5],[3,8.5,26.5],[2,4.5,22.5],[4,11.5,18.5],[0,10.5,15.5],[3,6.5,11.5],[2,3.5,9.5],[1,8.5,5.5],[3,13.5,3.5],[4,17.5,6.5],[2,23.5,4.5],[3,27.5,8.5],[4,24.5,12.5],[0,17.5,14.5],[2,18.5,21.5],[4,23.5,18.5],[3,24.5,21.5],[1,28.5,17.5],[2,30.5,22.5],[4,22.5,26.5],[3,18.5,29.5],[1,26.5,34.5],[0,29.5,35.5],[2,31.5,27.5],[4,34.5,25.5],[3,38.5,23.5],[1,43.5,26.5],[2,41.5,33.5],[0,35.5,34.5],[4,40.5,21.5],[2,43.5,18.5],[3,34.5,20.5],[1,39.5,15.5],[2,42.5,13.5],[4,35.5,11.5],[3,40.5,8.5],[2,43.5,6.5],[4,34.5,4.5],[0,37.5,4.5],[3,30.5,9.5]],
      supplies:[['ammo',4.5,35.5],['armor',11.5,35.5],['health',8.5,29.5],['ammo',5.5,24.5],['rockets',13.5,24.5],['health',4.5,15.5],['ammo',7.5,9.5],['armor',13.5,11.5],['ammo',11.5,4.5],['health',20.5,7.5],['rockets',30.5,4.5],['ammo',22.5,10.5],['health',17.5,17.5],['ammo',21.5,20.5],['armor',25.5,17.5],['ammo',20.5,30.5],['health',30.5,33.5],['rockets',24.5,35.5],['ammo',34.5,28.5],['health',43.5,29.5],['ammo',40.5,35.5],['armor',43.5,34.5],['health',35.5,17.5],['ammo',43.5,20.5],['rockets',34.5,7.5],['health',42.5,10.5],['ammo',41.5,4.5]],
      landmarks:[['ARRIVALS',8,35],['WEST HANGAR',8,16],['OPERATIONS',8,4],['LANDING STRIP',24,6],['CONTROL',23,19],['CARGO APRON',37,24],['LAUNCH HANGAR',39,5]],
      entrances:[[0,19,32.5],[0,19,19.5],[1,10,6.5],[0,12,6.5],[0,19,6.5],[0,29,9.5],[0,20,19.5],[1,16,23.5],[1,23,23.5],[0,27,19.5],[1,25,40.5],[1,22,35.5],[0,29,27.5],[0,36,27.5],[1,30,42.5],[0,39,33.5]],
      paths:[[22,3,24,15],[22,23,24,35],[16,18,30,20],[18,31,20,33],[17,6,29,9],[27,26,34,28],[33,23,43,24],[33,24,34,34],[34,33,40,34]],
      markings:[[20,4,20,8],[26,4,26,8],[20,25,20,29],[25,25,25,29]],
      rockCuts:[[16,3,17,4],[30,35,31,36],[3,11,4,12],[33,34,34,35]],
      barrels:[[17.5,10.5],[18.7,10.7],[25.5,14.5],[26.7,14.5],[18.5,23.5],[19.7,23.7],[24.5,31.5],[25.7,31.7],[29.5,30.5],[30.7,30.7],[35.5,23.5],[36.7,23.7],[38.5,27.5],[39.7,27.5],[7.5,7.5],[8.7,7.7],[28.5,12.5],[29.7,12.5]],
      trees:[[4.5,4.5],[13.5,8.5],[17.5,35.5],[30.5,14.5],[35.5,32.5],[43.5,23.5]],
      exit:[43.3,4.5],gate:[44,4]
    }
  ];
  function createLevel(levelIndex=0) {
    const level=LEVELS[levelIndex],layoutIndex=level.layout,theme=level.theme;
    const walls = new Uint8Array(MW*MH).fill(1), floors = new Uint8Array(MW*MH), ceilings = new Uint8Array(MW*MH);
    const rect=(x1,y1,x2,y2,val=0)=>{for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++){const i=y*MW+x;walls[i]=val;if(!val)ceilings[i]=1;}};
    rect(2,3,14,13); rect(14,7,19,10); rect(18,2,29,12);
    rect(8,13,11,20); rect(10,17,25,21); rect(20,14,31,23); rect(25,11,28,17);
    [[7,5],[7,6],[11,5],[11,6],[7,11],[23,5],[23,6],[26,9],[26,10],[23,17],[23,18],[28,20]].forEach(([x,y])=>walls[y*MW+x]=1);
    for(let y=4;y<=6;y++)for(let x=3;x<=5;x++)floors[y*MW+x]=1;
    for(let y=3;y<=4;y++)for(let x=25;x<=28;x++)floors[y*MW+x]=1;
    for(let y=15;y<=16;y++)for(let x=21;x<=23;x++)floors[y*MW+x]=1;
    for(let y=1;y<MH-1;y++)for(let x=1;x<MW-1;x++)if(walls[y*MW+x]) {
      if((x+y*3)%9===0)walls[y*MW+x]=3;
      if((x*3+y)%17===0)walls[y*MW+x]=2;
    }
    walls[21*MW+32]=4; floors[21*MW+31]=2;
    const placements = [[0,9.5,9.5],[1,12.5,7.5],[2,12.5,11.5],[0,6.5,4.5],
      [2,21.5,8.5],[0,23.5,3.5],[1,27.5,6.5],[2,28.5,10.5],[0,20.5,3.5],
      [0,10.5,18.5],[2,15.5,20.5],[0,22.5,20.5],[1,25.5,16.5],[2,29.5,18.5],[1,30.5,22.5]];
    const enemies=placements.map(([type,x,y],id)=>({id,type,x,y,hp:TYPES[type].hp,active:false,walk:0,attack:-1,cooldown:1+id*.09,hurt:0,death:-1,frame:0,moving:false}));
    const pickups=[['health',3.6,11.5],['ammo',5.5,8.3],['ammo',13.2,4.5],['armor',19.5,10.5],['health',28.5,2.8],['ammo',21.5,6.5],['ammo',9.5,15.5],['health',12.5,20.5],['armor',20.5,22.5],['ammo',26.5,18.5],['health',30.5,15.5]].map(([kind,x,y],id)=>({id,kind,x,y,taken:false}));
    let start={x:3.7,y:9.1,angle:.05},exit={x:31.3,y:21.5};
    if(layoutIndex>0&&layoutIndex<3){
      walls.fill(1);floors.fill(0);ceilings.fill(0);enemies.length=0;pickups.length=0;
      let spots,obstacles,pools,supplies;
      if(layoutIndex===1){
        rect(2,2,11,11);rect(10,6,23,9);rect(19,2,31,12);rect(5,10,8,22);rect(6,17,23,23);rect(22,11,30,23);
        obstacles=[[5,5],[5,6],[9,4],[22,4],[25,7],[25,8],[28,4],[12,19],[15,21],[25,18],[25,19]];
        pools=[[3,3,4,5],[20,3,21,5],[10,21,12,22],[28,15,29,17]];
        spots=[[3,8,8],[0,9,3],[2,7,5],[1,10,10],[3,13,7],[2,16,8],[4,21,8],[0,23,3],[3,27,3],[2,29,7],[1,29,10],[3,22,11],[0,6,13],[1,6,17],[2,9,19],[3,13,22],[4,18,19],[0,21,21],[2,23,15],[3,27,14],[4,28,21],[1,26,22],[0,30,18]];
        supplies=[['ammo',3.5,10.5],['health',10.5,2.6],['rockets',17.5,7.5],['armor',20.5,10.5],['ammo',30.5,3.5],['health',30.5,11.5],['ammo',6.5,15.5],['health',8.5,22.5],['rockets',16.5,18.5],['armor',20.5,22.5],['ammo',27.5,12.5],['health',29.5,22.5]];
        start={x:3.5,y:8.5,angle:0};exit={x:30.4,y:21.5};walls[21*MW+31]=4;
      }else{
        rect(2,3,12,10);rect(7,9,10,22);rect(9,18,29,23);rect(18,3,31,21);rect(11,5,20,8);
        obstacles=[[5,5],[6,5],[9,6],[24,6],[27,6],[21,11],[28,12],[24,16],[25,16],[14,20],[18,20],[22,7],[22,8],[29,9]];
        pools=[[3,4,4,5],[19,4,20,5],[26,10,27,12],[20,15,21,16],[11,21,13,22]];
        spots=[[2,8,8],[0,10,4],[3,11,9],[1,7,7],[4,14,6],[3,17,7],[2,20,6],[0,23,4],[3,26,4],[4,30,5],[1,28,8],[3,20,10],[4,23,11],[0,30,11],[3,29,14],[2,22,14],[1,26,14],[3,8,12],[0,9,15],[4,8,19],[2,11,19],[1,15,22],[3,17,19],[0,20,22],[4,23,20],[3,26,22],[1,29,22],[2,30,17],[5,28,19]];
        supplies=[['ammo',3.5,9.5],['health',11.5,3.6],['rockets',12.5,7.5],['armor',19.5,8.5],['ammo',30.5,3.5],['health',30.5,10.5],['rockets',19.5,13.5],['ammo',8.5,16.5],['health',10.5,22.5],['armor',16.5,22.5],['rockets',22.5,22.5],['ammo',30.5,15.5],['health',27.5,18.5]];
        start={x:3.5,y:8.5,angle:0};exit={x:31.3,y:19.5};walls[19*MW+32]=4;
      }
      for(const [x,y]of obstacles)walls[y*MW+x]=1;
      for(const [x1,y1,x2,y2]of pools)for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)floors[y*MW+x]=1;
      for(let y=1;y<MH-1;y++)for(let x=1;x<MW-1;x++)if(walls[y*MW+x]&&walls[y*MW+x]!==4)walls[y*MW+x]=(x+y*3)%7===0?3:(x*3+y)%13===0?2:1;
      for(const [type,x,y]of spots){const id=enemies.length;enemies.push({id,type,x:x+.5,y:y+.5,hp:TYPES[type].hp,active:false,walk:0,attack:-1,cooldown:1+id*.07,hurt:0,death:-1,frame:0,moving:false});}
      for(const [kind,x,y]of supplies)pickups.push({id:pickups.length,kind,x,y,taken:false});
    }else{pickups.push({id:pickups.length,kind:'rockets',x:13.4,y:12.5,taken:false});}
    // Outdoor annexes connect at multiple entrances to form routes around the original rooms.
    const annex=OUTDOOR_LAYOUTS[layoutIndex];
    if(layoutIndex>=3){walls.fill(1);floors.fill(0);ceilings.fill(0);enemies.length=0;pickups.length=0;start={...annex.start};}
    for(let i=0;i<walls.length;i++){if(walls[i]===4)walls[i]=1;if(floors[i]===2)floors[i]=0;}
    const paint=(r,wall,floor,roof)=>{for(let y=r[1];y<=r[3];y++)for(let x=r[0];x<=r[2];x++){const i=y*MW+x;walls[i]=wall;floors[i]=floor;ceilings[i]=roof;}};
    for(const r of annex.yards)paint(r,0,3,0);
    for(const r of annex.rooms)paint(r,0,0,1);
    for(const r of annex.blocks)for(let y=r[1];y<=r[3];y++)for(let x=r[0];x<=r[2];x++)walls[y*MW+x]=1;
    for(const r of annex.innerRooms||[])paint(r,0,0,1);
    for(const r of annex.pools)for(let y=r[1];y<=r[3];y++)for(let x=r[0];x<=r[2];x++)if(!walls[y*MW+x])floors[y*MW+x]=1;
    for(let y=1;y<MH-1;y++)for(let x=1;x<MW-1;x++)if(walls[y*MW+x])walls[y*MW+x]=(x+y*3)%7===0?3:(x*3+y)%13===0?2:1;
    for(const [type,x,y]of annex.enemies){const id=enemies.length;enemies.push({id,type,x,y,hp:TYPES[type].hp,active:false,walk:0,attack:-1,cooldown:1+id*.07,hurt:0,death:-1,frame:0,moving:false});}
    for(const [kind,x,y]of annex.supplies)pickups.push({id:pickups.length,kind,x,y,taken:false});
    if(annex.boss){const boss=enemies.find(e=>e.type===5);boss.x=annex.boss[0];boss.y=annex.boss[1];}
    exit={x:annex.exit[0],y:annex.exit[1]};walls[annex.gate[1]*MW+annex.gate[0]]=4;floors[Math.floor(exit.y)*MW+Math.floor(exit.x)]=2;
    const wallTextures=new Uint8Array(MW*MH).fill(255),wallHeights=new Float32Array(MW*MH).fill(1.5);
    const rockTexture=theme===1||theme===4?11:theme===2?9:6;
    for(const r of annex.rockCuts)for(let y=r[1];y<=r[3];y++)for(let x=r[0];x<=r[2];x++){
      const i=y*MW+x;if(!ceilings[i]){walls[i]=1;wallTextures[i]=rockTexture;}
    }
    for(const r of annex.paths)for(let y=r[1];y<=r[3];y++)for(let x=r[0];x<=r[2];x++){
      const i=y*MW+x;if(!walls[i]&&!ceilings[i]&&floors[i]!==1)floors[i]=4;
    }
    for(const r of annex.markings||[])for(let y=r[1];y<=r[3];y++)for(let x=r[0];x<=r[2];x++)if(!walls[y*MW+x]&&!ceilings[y*MW+x])floors[y*MW+x]=5;
    for(let y=1;y<MH-1;y++)for(let x=1;x<MW-1;x++){
      const i=y*MW+x;if(!walls[i]||walls[i]===4)continue;
      const around=[i-1,i+1,i-MW,i+MW],outside=around.some(n=>!walls[n]&&!ceilings[n]);
      if(!outside)continue;
      const building=around.some(n=>!walls[n]&&ceilings[n]);
      wallTextures[i]=building?(theme===2?9:8):rockTexture;
      wallHeights[i]=building?2.2:theme===2?2.8+((x+y)%5===0?.4:0):2.65+((Math.floor(x/4)+Math.floor(y/4))%3)*.18;
    }
    for(const r of annex.blocks)for(let y=r[1];y<=r[3];y++)for(let x=r[0];x<=r[2];x++){
      const i=y*MW+x;if(walls[i]&&!ceilings[i]){wallTextures[i]=theme===2?9:8;wallHeights[i]=1.5;}
    }
    // Exterior facades close the sides of passageways. Only the designed
    // entrances connect the indoor routes to the outdoor courtyards.
    const edgeX=new Uint8Array(MW*MH),edgeY=new Uint8Array(MW*MH);
    for(let y=1;y<MH-1;y++)for(let x=1;x<MW-1;x++){
      const i=y*MW+x;if(walls[i])continue;
      if(!walls[i-1]&&ceilings[i]!==ceilings[i-1])edgeX[i]=1;
      if(!walls[i-MW]&&ceilings[i]!==ceilings[i-MW])edgeY[i]=1;
    }
    const portals=annex.entrances.map(([axis,at,center])=>({axis,at,lo:center-.9,hi:center+.9,opening:1.3}));
    portals.forEach((door,id)=>{
      for(let t=Math.floor(door.lo);t<Math.ceil(door.hi);t++){
        const i=door.axis?t+door.at*MW:t*MW+door.at,edges=door.axis?edgeY:edgeX;
        if(edges[i])edges[i]=id+2;
      }
    });
    const scenery=annex.barrels.map(([x,y],id)=>({id,kind:'barrel',x,y,radius:.22,height:.7,hp:24,state:0,explodeAt:Infinity,variant:0}));
    annex.trees.forEach(([x,y],i)=>scenery.push({id:scenery.length,kind:'tree',x,y,radius:.17,height:[1.9,2.1,1.8][i%3],variant:(i+layoutIndex)%3,state:0}));
    return {width:MW,height:MH,walls,floors,ceilings,wallTextures,wallHeights,edgeX,edgeY,portals,scenery,enemies,pickups,exit,start,landmarks:annex.landmarks,levelIndex,level};
  }
  class World {
    constructor(random=Math.random) {this.random=random;this.reset();}
    reset(levelIndex=0,carry=null) {
      const level=createLevel(clamp(levelIndex,0,LEVELS.length-1));Object.assign(this,level);
      this.player={...level.start,health:carry?Math.max(75,carry.health):100,armor:carry?Math.max(35,carry.armor):50,radius:.21};
      this.weapon=carry?carry.weapon:0;this.ammo=carry?carry.ammo.map((v,i)=>Math.max(v,[24,30,60,6][i])):[32,30,60,6];this.reserve=carry?Math.max(120,carry.reserve):120;this.chainReserve=carry?Math.max(180,carry.chainReserve):180;this.campaignScore=carry?carry.score:0;this.campaignTime=carry?carry.time:0;this.shotTime=99;this.cooldown=0;this.reloadTime=0;this.switchTime=0;
      this.time=0;this.kills=0;this.score=0;this.shots=0;this.hits=0;this.won=false;this.dead=false;
      this.projectiles=[];this.particles=[];this.events=[];this.hazardTimer=0;this.navTimer=0;this.nav=new Int16Array(MW*MH).fill(-1);this.extractionPath=null;
      this.damageFlash=0;this.pickupFlash=0;this.muzzle=0;this.hitmarker=0;this.moving=0;this.lastStep=0;
      this.updateNavigation();return this;
    }
    advance(){if(!this.won||this.levelIndex>=LEVELS.length-1)return false;this.reset(this.levelIndex+1,{health:this.player.health,armor:this.player.armor,weapon:this.weapon,ammo:[...this.ammo],reserve:this.reserve,chainReserve:this.chainReserve,score:this.campaignScore+this.score,time:this.campaignTime+this.time});return true;}
    cell(x,y){const ix=Math.floor(x),iy=Math.floor(y);return ix<0||iy<0||ix>=MW||iy>=MH?1:this.walls[iy*MW+ix];}
    floor(x,y){return this.floors[(Math.floor(y)*MW+Math.floor(x))]||0;}
    canStand(x,y,r=.21,ignoreScenery=false) {
      if(!ignoreScenery)for(const prop of this.scenery)if(prop.state!==2&&(x-prop.x)**2+(y-prop.y)**2<(r+prop.radius)**2)return false;
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
    ray(x,y,dx,dy,max=50,headers=null) {
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
          if(door&&along>door.lo+.10&&along<door.hi-.10){
            if(headers)headers.push({distance:Math.max(.0001,d),side,u:(along-door.lo)/(door.hi-door.lo),bottom:door.opening,height:outside?2.2:1.5});
          }else{
            const u=along-Math.floor(along),trim=door?(along<door.lo+.10?.02+u*.12:.86+u*.12):u;
            return {distance:Math.max(.0001,d),side,cell:5,x:mx,y:my,u:trim,texture:door?10:this.level.theme===2?9:8,height:outside?2.2:1.5,outside};
          }
        }
        const wall=this.cell(mx+.5,my+.5);
        if(wall){let u=side?x+d*dx:y+d*dy;u-=Math.floor(u);if((side===0&&dx>0)||(side===1&&dy<0))u=1-u;return{distance:Math.max(.0001,d),side,cell:wall,x:mx,y:my,u};}
      }return {distance:max,side,cell:0,x:mx,y:my,u:0};
    }
    sight(x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,d=Math.hypot(dx,dy);return d<.01||this.ray(x1,y1,dx/d,dy/d,d).distance>=d-.08;}
    sceneryRay(x,y,dx,dy,max,padding=0){
      let closest=max,prop=null;
      for(const item of this.scenery){
        if(item.state===2)continue;
        const ex=item.x-x,ey=item.y-y,along=ex*dx+ey*dy,side=Math.abs(ex*dy-ey*dx),radius=item.radius+padding;
        if(along+radius<=0||side>=radius)continue;
        const distance=Math.max(0,along-Math.sqrt(radius*radius-side*side));
        if(distance<closest){closest=distance;prop=item;}
      }
      return prop?{prop,distance:closest}:null;
    }
    updateNavigation(){
      this.nav.fill(-1);const q=new Int16Array(MW*MH);let head=0,tail=0;
      const obstacles=new Uint8Array(MW*MH);for(const prop of this.scenery)if(prop.state!==2)obstacles[Math.floor(prop.y)*MW+Math.floor(prop.x)]=1;
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
      const clear=(x,y,tx,ty,safe)=>{
        const distance=Math.hypot(tx-x,ty-y),steps=Math.max(1,Math.ceil(distance/.12));
        for(let i=1;i<=steps;i++){
          const px=x+(tx-x)*i/steps,py=y+(ty-y)*i/steps,cell=Math.floor(py)*MW+Math.floor(px);
          if(!this.canStand(px,py,p.radius+.02)||(safe&&cell!==start&&this.floor(px,py)===1))return false;
        }
        return true;
      };
      let cache=this.extractionPath;
      if(!cache||cache.cell!==start){
        let route=null,safe=true;
        // Prefer a dry route; include toxic floors only if no safe route exists.
        for(const avoidToxic of [true,false]){
          const center={x:start%MW+.5,y:Math.floor(start/MW)+.5},viaCenter=clear(p.x,p.y,center.x,center.y,avoidToxic);
          const previous=new Int16Array(MW*MH).fill(-1),queue=new Int16Array(MW*MH);let head=0,tail=1;
          previous[start]=start;queue[0]=start;
          while(head<tail&&previous[end]<0){
            const at=queue[head++],x=at%MW,y=Math.floor(at/MW);
            for(const next of [x>0?at-1:-1,x<MW-1?at+1:-1,y>0?at-MW:-1,y<MH-1?at+MW:-1]){
              if(next<0||previous[next]>=0||this.walls[next]||(avoidToxic&&this.floors[next]===1)||!this.edgePassable(at,next))continue;
              const nx=next===end?this.exit.x:next%MW+.5,ny=next===end?this.exit.y:Math.floor(next/MW)+.5;
              if(!clear(at===start&&!viaCenter?p.x:x+.5,at===start&&!viaCenter?p.y:y+.5,nx,ny,avoidToxic))continue;
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
    setWeapon(index){if(index===this.weapon||index<0||index>=WEAPONS.length)return;this.weapon=index;this.reloadTime=0;this.switchTime=.25;this.shotTime=99;this.emit('switch');}
    reload(){const i=this.weapon,cap=i===1?30:60,res=i===1?this.reserve:this.chainReserve;if((i===1||i===2)&&!this.reloadTime&&this.ammo[i]<cap&&res>0){this.reloadTime=i===1?1.2:1.6;this.emit('reload');}}
    fire(){
      if(this.dead||this.won||this.cooldown>0||this.reloadTime>0||this.switchTime>0)return false;
      const w=WEAPONS[this.weapon],ammoSlot=w.ammoSlot??this.weapon,cost=w.ammoCost??1;
      if(this.ammo[ammoSlot]<cost){if((this.weapon===1&&this.reserve>0)||(this.weapon===2&&this.chainReserve>0))this.reload();else{this.cooldown=.3;this.emit('empty');}return false;}
      this.ammo[ammoSlot]-=cost;this.cooldown=w.cooldown;this.shotTime=0;this.muzzle=this.weapon===4?.11:.075;this.shots++;
      this.emit('fire',{weapon:this.weapon});let hit=false;
      for(const e of this.enemies)if(e.hp>0&&Math.hypot(e.x-this.player.x,e.y-this.player.y)<12)e.active=true;
      if(w.projectile){const a=this.player.angle,dx=Math.cos(a),dy=Math.sin(a),launch=Math.max(0,this.ray(this.player.x,this.player.y,dx,dy,.28).distance-.02);this.projectiles.push({x:this.player.x+dx*launch,y:this.player.y+dy*launch,z:.62,vx:dx*10,vy:dy*10,kind:'rocket',owner:'player',life:4,damage:w.damage});return true;}
      const damage=new Map();
      for(let i=0;i<w.pellets;i++){
        const angle=this.player.angle+(i===0?0:(this.random()-.5)*2*w.spread),dx=Math.cos(angle),dy=Math.sin(angle);
        const wall=this.ray(this.player.x,this.player.y,dx,dy,w.range??28);let closest=wall.distance,target=null;
        for(const e of this.enemies){if(e.hp<=0)continue;const ex=e.x-this.player.x,ey=e.y-this.player.y,along=ex*dx+ey*dy,side=Math.abs(ex*dy-ey*dx);const radius=TYPES[e.type].radius*1.1;
          if(along>0&&side<radius){const dist=along-Math.sqrt(radius*radius-side*side);if(dist<closest){closest=dist;target=e;}}}
        const object=this.sceneryRay(this.player.x,this.player.y,dx,dy,closest);if(object){closest=object.distance;target=object.prop;}
        if(target){const falloff=this.weapon===4?clamp(1.25-closest*.065,.35,1):this.weapon===0?clamp(1.3-closest*.045,.5,1):1;damage.set(target,(damage.get(target)||0)+w.damage*falloff);if(target.kind!=='tree')hit=true;}
        else if(i===0)this.sparks(this.player.x+dx*(closest-.04),this.player.y+dy*(closest-.04),.65,4,'spark');
      }
      damage.forEach((value,e)=>e.kind?this.hurtScenery(e,value):this.hurtEnemy(e,value));if(hit){this.hits++;this.hitmarker=.12;}return true;
    }
    hurtScenery(prop,amount){
      if(prop.state!==0)return;
      this.sparks(prop.x,prop.y,prop.kind==='barrel'?.45:.65,4,prop.kind==='barrel'?'spark':'ember');
      if(prop.kind!=='barrel')return;
      prop.hp-=amount;
      if(prop.hp<=0){prop.state=1;prop.explodeAt=this.time+.15;this.emit('barrelIgnite');}
    }
    hurtEnemy(e,amount){
      if(e.hp<=0)return;e.hp-=amount;e.hurt=e.type>=4?.10:.23;e.active=true;if(e.type<4)e.attack=-1;
      this.sparks(e.x,e.y,.65,5,e.type===2?'spark':'ember');
      if(e.hp<=0){e.death=0;e.frame=6;this.kills++;this.score+=TYPES[e.type].score;this.emit('kill',{typeId:e.type});
        if(e.type===2&&this.random()<.55)this.pickups.push({id:this.pickups.length,kind:'ammo',x:e.x,y:e.y,taken:false});
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
      if(e.type===1){if(d<1.24&&this.sight(e.x,e.y,this.player.x,this.player.y))this.hurtPlayer(t.damage);this.emit('claw');}
      else{const a=Math.atan2(dy,dx),speed=e.type===0?3.4:e.type===3?4.7:e.type===5?4:8.3;
        const spread=e.type===5?[-.22,-.11,0,.11,.22]:e.type===4?[-.08,0,.08]:[0];
        for(const offset of spread){const dx=Math.cos(a+offset),dy=Math.sin(a+offset),launch=Math.max(0,this.ray(e.x,e.y,dx,dy,.3).distance-.02);this.projectiles.push({x:e.x+dx*launch,y:e.y+dy*launch,z:.64,vx:dx*speed,vy:dy*speed,kind:e.type===0||e.type===5?'fire':'bolt',life:6,damage:t.damage});}
        this.emit('enemyFire',{near:d<8,kind:e.type});}
    }
    explode(shot){
      const barrel=shot.kind==='barrel',radius=barrel?3.2:2.7,playerRadius=barrel?2.6:1.6;
      this.sparks(shot.x,shot.y,.5,barrel?40:30,'ember');this.emit('explosion',{x:shot.x,y:shot.y,scale:barrel?1.35:1});this.muzzle=.10;
      for(const e of this.enemies){const d=Math.hypot(e.x-shot.x,e.y-shot.y);if(e.hp>0&&d<radius&&this.sight(shot.x,shot.y,e.x,e.y))this.hurtEnemy(e,shot.damage*Math.max(.2,1-d/3.2));}
      for(const prop of this.scenery){const d=Math.hypot(prop.x-shot.x,prop.y-shot.y);if(prop.kind==='barrel'&&prop.state===0&&d<radius&&this.sight(shot.x,shot.y,prop.x,prop.y))this.hurtScenery(prop,shot.damage*Math.max(.2,1-d/3.2));}
      const d=Math.hypot(this.player.x-shot.x,this.player.y-shot.y);if(d<playerRadius&&this.sight(shot.x,shot.y,this.player.x,this.player.y))this.hurtPlayer((barrel?65:32)*(1-d/playerRadius));
    }
    update(dt,input={}){
      if(this.dead||this.won)return;dt=Math.min(dt,.04);const previousShotTime=this.shotTime;this.time+=dt;this.shotTime+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.switchTime=Math.max(0,this.switchTime-dt);
      if(this.weapon===4){
        for(const phase of DOUBLE_RELOAD)if(phase.sound&&previousShotTime<phase.time&&this.shotTime>=phase.time)this.emit(phase.sound);
      }
      this.damageFlash=Math.max(0,this.damageFlash-dt);this.pickupFlash=Math.max(0,this.pickupFlash-dt);this.muzzle=Math.max(0,this.muzzle-dt);this.hitmarker=Math.max(0,this.hitmarker-dt);
      if(this.reloadTime>0){this.reloadTime-=dt;if(this.reloadTime<=0){const i=this.weapon,cap=i===1?30:60,res=i===1?this.reserve:this.chainReserve,n=Math.min(cap-this.ammo[i],res);this.ammo[i]+=n;if(i===1)this.reserve-=n;else this.chainReserve-=n;this.reloadTime=0;this.emit('loaded');}}
      const p=this.player;p.angle=(p.angle+(input.turn||0)*dt*2.25)%TAU;
      let forward=input.forward||0,strafe=input.strafe||0;const len=Math.hypot(forward,strafe);if(len>1){forward/=len;strafe/=len;}
      const speed=(input.run?3.6:2.45)*dt,cs=Math.cos(p.angle),sn=Math.sin(p.angle);this.moving=Math.hypot(forward,strafe);
      this.move(p,(cs*forward-sn*strafe)*speed,(sn*forward+cs*strafe)*speed,p.radius);
      if(this.moving>.1&&this.time-this.lastStep>(input.run?.29:.43)){this.lastStep=this.time;this.emit('step');}
      if(input.fire)this.fire();
      for(const prop of this.scenery)if(prop.state===1&&this.time>=prop.explodeAt){prop.state=2;prop.explodeAt=Infinity;this.navTimer=0;this.extractionPath=null;this.explode({x:prop.x,y:prop.y,kind:'barrel',damage:150});}
      if(this.floor(p.x,p.y)===1){this.hazardTimer+=dt;if(this.hazardTimer>.65){this.hazardTimer=0;this.hurtPlayer(7);this.emit('toxic');}}else this.hazardTimer=0;
      this.navTimer-=dt;if(this.navTimer<=0){this.navTimer=.28;this.updateNavigation();}
      for(const e of this.enemies){
        const t=TYPES[e.type];e.hurt=Math.max(0,e.hurt-dt);
        if(e.hp<=0){e.death+=dt;e.frame=e.death<.3?6:7;continue;}
        const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy),visible=d<12&&this.sight(e.x,e.y,p.x,p.y)&&!this.sceneryRay(e.x,e.y,dx/(d||1),dy/(d||1),d);
        if(visible&&d<9)e.active=true;
        if(!e.active){e.frame=0;continue;}
        e.cooldown-=dt;e.moving=false;
        if(e.hurt>0&&e.type<4){e.frame=5;continue;}
        if(e.attack>=0){const previous=e.attack;e.attack+=dt;if(previous<t.windup&&e.attack>=t.windup)this.enemyAttack(e);
          e.frame=e.attack<t.windup?3:4;if(e.attack>t.windup+.24){e.attack=-1;e.cooldown=t.cooldown*(.85+this.random()*.3);}continue;}
        if(visible&&d<t.range&&e.cooldown<=0){e.attack=0;e.frame=3;continue;}
        if(d>.65&&(e.type===1||d>t.range*.62||!visible)){
          let tx=p.x,ty=p.y;
          if(!visible||this.sceneryRay(e.x,e.y,dx/(d||1),dy/(d||1),d,t.radius+.04)){const cell=Math.floor(e.y)*MW+Math.floor(e.x);let best=this.nav[cell],target=cell;
            for(const next of [cell-1,cell+1,cell-MW,cell+MW])if(this.nav[next]>=0&&this.edgePassable(cell,next)&&(best<0||this.nav[next]<best)){best=this.nav[next];target=next;}
            tx=target%MW+.5;ty=Math.floor(target/MW)+.5;}
          let vx=tx-e.x,vy=ty-e.y,vl=Math.hypot(vx,vy)||1;vx/=vl;vy/=vl;
          for(const o of this.enemies){if(o===e||o.hp<=0)continue;const ox=e.x-o.x,oy=e.y-o.y,od=Math.hypot(ox,oy);if(od<.63&&od>.001){vx+=ox/od*(.63-od)*3;vy+=oy/od*(.63-od)*3;}}
          const oldX=e.x,oldY=e.y;this.move(e,vx*t.speed*dt,vy*t.speed*dt,t.radius);e.moving=Math.abs(e.x-oldX)+Math.abs(e.y-oldY)>.001;e.walk+=dt*(e.type===1?9:6);
        }
        e.frame=e.hurt>0?5:e.moving?1+(Math.floor(e.walk)%2):0;
      }
      for(const shot of this.projectiles){
        shot.life-=dt;const speed=Math.hypot(shot.vx,shot.vy),steps=Math.max(1,Math.ceil(speed*dt/.12)),distance=speed*dt/steps,dx=shot.vx/(speed||1),dy=shot.vy/(speed||1);
        for(let i=0;i<steps&&shot.life>0;i++){
          const hit=this.ray(shot.x,shot.y,dx,dy,distance),travel=hit.cell?Math.max(0,hit.distance-.025):distance;
          const object=this.sceneryRay(shot.x,shot.y,dx,dy,Math.min(distance,hit.distance),.06);
          if(object){shot.x+=dx*object.distance;shot.y+=dy*object.distance;shot.life=0;if(shot.owner==='player')this.explode(shot);else this.hurtScenery(object.prop,shot.damage);continue;}
          shot.x+=dx*travel;shot.y+=dy*travel;
          if(hit.cell){shot.life=0;if(shot.owner==='player')this.explode(shot);else this.sparks(shot.x,shot.y,.65,6,'ember');}
          else if(shot.owner==='player'){for(const e of this.enemies)if(e.hp>0&&Math.hypot(shot.x-e.x,shot.y-e.y)<TYPES[e.type].radius+.14){shot.life=0;this.explode(shot);break;}}
          else if(Math.hypot(shot.x-p.x,shot.y-p.y)<.27){this.hurtPlayer(shot.damage);shot.life=0;}
        }
      }this.projectiles=this.projectiles.filter(v=>v.life>0);
      for(const v of this.particles){v.life-=dt;v.x+=v.vx*dt;v.y+=v.vy*dt;v.z+=v.vz*dt;v.vz-=5*dt;}this.particles=this.particles.filter(v=>v.life>0&&v.z>0);
      for(const item of this.pickups){if(item.taken||Math.hypot(item.x-p.x,item.y-p.y)>.58)continue;
        if(item.kind==='health'&&p.health>=100)continue;if(item.kind==='armor'&&p.armor>=100)continue;
        if(item.kind==='health')p.health=Math.min(100,p.health+35);else if(item.kind==='armor')p.armor=Math.min(100,p.armor+35);else if(item.kind==='rockets'){this.ammo[3]=Math.min(24,this.ammo[3]+4);}else{this.ammo[0]=Math.min(99,this.ammo[0]+12);this.reserve=Math.min(240,this.reserve+45);this.chainReserve=Math.min(360,this.chainReserve+90);}
        item.taken=true;this.pickupFlash=.22;this.emit('pickup',{kind:item.kind});
      }
      if(this.kills===this.enemies.length&&Math.hypot(p.x-this.exit.x,p.y-this.exit.y)<.8){this.won=true;this.emit('won');}
    }
    weaponFrame(){
      if(this.reloadTime>0)return this.reloadTime>.24?3:4;const t=this.shotTime;
      if(this.weapon===4){for(let i=DOUBLE_RELOAD.length-1;i>=0;i--)if(t>=DOUBLE_RELOAD[i].time)return DOUBLE_RELOAD[i].frame;return t<.09?1:2;}
      if(this.weapon===0)return t<.075?1:t<.19?2:t<.4?3:t<.58?4:0;
      if(this.weapon===3)return t<.10?1:t<.25?2:t<.70?3:t<.9?4:0;
      return t<.035?1:t<.10?2:0;
    }
  }
  const api={World,createLevel,TYPES,WEAPONS,LEVELS,clamp,angleDiff,rocketView,MW,MH};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IronCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
