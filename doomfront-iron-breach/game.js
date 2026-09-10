/* Doomfront: Iron Breach — software raycaster, sprite compositor, input and sound. */
(() => {
  'use strict';
  const {World,TYPES,WEAPONS,LEVELS,clamp,rocketView,MW,MH}=IronCore;
  const $=id=>document.getElementById(id),canvas=$('view'),ctx=canvas.getContext('2d',{alpha:false});
  const moreGamesButton=$('moreGamesButton');
  moreGamesButton.href = `https://g55.co/?utm_source=moreGamesButton&utm_medium=${encodeURIComponent(document.title)}`;
  const world=new World(),keys=new Set();
  const state={phase:'loading',ready:false,last:0,map:false,muted:false,mouseDown:false,dragX:null,touchFire:false,stickX:0,stickY:0,bob:0,message:0,deathDelay:0,fallbackAim:false};
  const art={enemies:[],weapons:[],textures:[],skies:[],props:{},shots:{},scenery:{}};
  const sceneCanvas=document.createElement('canvas'),sceneCtx=sceneCanvas.getContext('2d',{alpha:false});
  const TEX_SIZE=256;
  const bursts=[];
  let treeContactSource=null,treeContactTiles=[];
  let W=640,H=360,horizon=180,projection=485,pixels,buffer,zBuffer,skyColumns,upperDepth,columnHeaders;
  const coarse=()=>matchMedia('(pointer:coarse)').matches;
  const allHud=['health','armor','ammo','ammoReserve','remaining','timer','weaponName','weaponHint','killCounter','objective','touchSwitch','extractionDistance','extractionTurn'].reduce((a,k)=>(a[k]=$(k),a),{});
  document.body.classList.add('menu-active');

  function resize(){
    const width=innerWidth,height=innerHeight;
    const sceneScale=Math.min(1,960/width,Math.sqrt((coarse()?360000:520000)/(width*height)));
    W=Math.max(1,Math.round(width*sceneScale));H=Math.max(1,Math.round(height*sceneScale));
    const displayScale=Math.min(window.devicePixelRatio||1,1.5,Math.sqrt(2500000/(width*height)));
    canvas.width=Math.round(width*displayScale);canvas.height=Math.round(height*displayScale);
    sceneCanvas.width=W;sceneCanvas.height=H;
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    horizon=H*.5;projection=W/(2*.72);
    buffer=sceneCtx.createImageData(W,H);pixels=new Uint32Array(buffer.data.buffer);zBuffer=new Float32Array(W);skyColumns=new Uint16Array(W);
    upperDepth=new Float32Array(W*H);columnHeaders=Array.from({length:W},()=>[]);
  }
  addEventListener('resize',resize);resize();

  const offscreen=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  // Keep the generated PNGs intact. Decode their native alpha at source size;
  // opaque highlights are never color-keyed and soft contours stay antialiased.
  function decodeSprite(source,col,row,cols,rows,kind,rect){
    const x0=rect?.x??Math.round(col*source.width/cols),y0=rect?.y??Math.round(row*source.height/rows);
    const width=rect?.width??Math.round((col+1)*source.width/cols)-x0,height=rect?.height??Math.round((row+1)*source.height/rows)-y0;
    const c=offscreen(width,height),g=c.getContext('2d',{willReadFrequently:true});
    g.drawImage(source,x0,y0,width,height,0,0,width,height);
    const img=g.getImageData(0,0,width,height),d=img.data,n=width*height;
    const seen=new Uint8Array(n),queue=new Int32Array(n);
    for(let i=3;i<d.length;i+=4){if(d[i]<=8)d[i]=0;else if(d[i]>=245)d[i]=255;}
    // Discard isolated matte flecks and small fragments from neighboring cells.
    // The full body and detached muzzle flashes remain separate valid components.
    for(let at=0;at<n;at++){
      if(!d[at*4+3]||seen[at])continue;
      let head=0,tail=0,touches=false;seen[at]=1;queue[tail++]=at;
      while(head<tail){
        const i=queue[head++],x=i%width,y=(i/width)|0;
        if(x===0||y===0||x===width-1||y===height-1)touches=true;
        for(const next of [x>0?i-1:-1,x<width-1?i+1:-1,y>0?i-width:-1,y<height-1?i+width:-1]){
          if(next>=0&&d[next*4+3]&&!seen[next]){seen[next]=1;queue[tail++]=next;}
        }
      }
      if(tail<(kind==='enemy'?12:4)||(kind==='enemy'&&touches&&tail<n*.009)){
        for(let i=0;i<tail;i++)d[queue[i]*4+3]=0;
      }
    }
    g.putImageData(img,0,0);return c;
  }
  function spriteBounds(image,cutoff=128){
    const {width,height}=image,d=image.getContext('2d').getImageData(0,0,width,height).data;
    let left=width,top=height,right=-1,bottom=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(d[(y*width+x)*4+3]>=cutoff){
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(right<left)throw new Error('Empty sprite frame');
    return {left,top,right,bottom,width:right-left+1,height:bottom-top+1};
  }
  function prepareEnemyFrames(frames){
    const bounds=frames.map(frame=>spriteBounds(frame));
    const standingHeight=bounds.slice(0,3).map(b=>b.height).sort((a,b)=>a-b)[1];
    for(let i=0;i<frames.length;i++){
      frames[i].groundAnchor=(bounds[i].bottom+1)/frames[i].height;
      // One body scale for the whole animation, including collapse and corpse.
      frames[i].worldScale=frames[i].height/standingHeight;
    }
  }
  function measureWeaponBase(image){
    // Include thin stock and glove parts in reload frames, not just wide rows.
    return (spriteBounds(image).bottom+1)/image.height;
  }
  function decodeTextures(source,append=false){
    if(!append)art.textures.length=0;
    for(let i=0;i<6;i++){
      const mips=[];
      for(let mip=0;mip<6;mip++){
        const size=TEX_SIZE>>mip,c=offscreen(size,size),g=c.getContext('2d',{willReadFrequently:true});
        g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
        g.drawImage(source,(i%3)*source.width/3,Math.floor(i/3)*source.height/2,source.width/3,source.height/2,0,0,size,size);
        const original=new Uint32Array(g.getImageData(0,0,size,size).data.buffer),shades=[];
        for(let level=0;level<24;level++){
          const out=new Uint32Array(size*size),light=.19+level/23*.99;
          for(let j=0;j<original.length;j++){
            const color=original[j],r=color&255,gr=(color>>>8)&255,b=(color>>>16)&255;
            let k=light;if(!append&&i===4)k=Math.max(.7,light);if(!append&&i===5&&b>r*1.65&&b>100)k=Math.max(.95,light);
            out[j]=(255<<24)|(Math.min(255,b*k)<<16)|(Math.min(255,gr*k)<<8)|Math.min(255,r*k);
          }shades.push(out);
        }
        mips.push({size,mask:size-1,shades});
      }
      art.textures.push({mips});
    }
  }
  function decodeSky(source){
    const width=1024,height=512,c=offscreen(width,height),g=c.getContext('2d',{willReadFrequently:true});
    g.drawImage(source,0,0,width,height);
    const original=new Uint32Array(g.getImageData(0,0,width,height).data.buffer);
    art.skies=LEVELS.map(({skyTint:tint})=>{
      const pixels=new Uint32Array(original.length);
      for(let i=0;i<original.length;i++){
        const color=original[i];
        pixels[i]=0xff000000|(Math.min(255,((color>>>16)&255)*tint[2])<<16)|(Math.min(255,((color>>>8)&255)*tint[1])<<8)|Math.min(255,(color&255)*tint[0]);
      }
      return {width,height,pixels};
    });
  }
  function decodeProps(source){
    const names=['health','ammo','armor','rockets','fire','bolt','rocket','explosion','exit'];
    for(let i=0;i<names.length;i++){
      // The tall gate extends slightly above the last atlas row.
      const rect=i===8?{x:Math.round(source.width*2/3),y:Math.round(source.height*.64),width:source.width-Math.round(source.width*2/3),height:source.height-Math.round(source.height*.64)}:undefined;
      const frame=decodeSprite(source,i%3,(i/3)|0,3,3,'prop',rect),bounds=spriteBounds(frame,9);
      const c=offscreen(bounds.width,bounds.height),g=c.getContext('2d');
      g.drawImage(frame,bounds.left,bounds.top,bounds.width,bounds.height,0,0,bounds.width,bounds.height);
      c.groundAnchor=(spriteBounds(c).bottom+1)/c.height;
      if(['fire','bolt','rocket'].includes(names[i]))art.shots[names[i]]=c;else art.props[names[i]]=c;
    }
  }
  function decodeScenery(source){
    const frames=Array.from({length:6},(_,i)=>decodeSprite(source,i%3,Math.floor(i/3),3,2,'prop'));
    const bounds=frames.map(frame=>spriteBounds(frame));
    for(let i=0;i<frames.length;i++){
      const frame=frames[i],b=bounds[i],data=frame.getContext('2d').getImageData(0,0,frame.width,frame.height).data;
      frame.groundAnchor=(b.bottom+1)/frame.height;
      frame.worldScale=frame.height/(i<3?bounds[0].height:b.height);
      // Anchor the trunk/barrel base, not the asymmetrical branches or flame.
      let total=0,count=0;
      for(let y=Math.floor(b.bottom-b.height*.12);y<=b.bottom;y++)for(let x=b.left;x<=b.right;x++)if(data[(y*frame.width+x)*4+3]>=128){total+=x+.5;count++;}
      frame.centerAnchor=(count?total/count:(b.left+b.right+1)/2)/frame.width;
      if(i>=3){
        // The root collar is the ground contact. The splayed foreground roots
        // extend below that line; anchoring their lowest tip makes the trunk float.
        const rootY=b.top+b.height*[.885,.895,.90][i-3];
        frame.groundAnchor=rootY/frame.height;total=0;count=0;
        for(let y=Math.floor(rootY-b.height*.025);y<=Math.floor(rootY);y++)for(let x=b.left;x<=b.right;x++)if(data[(y*frame.width+x)*4+3]>=128){total+=x+.5;count++;}
        if(count)frame.centerAnchor=total/count/frame.width;
      }
    }
    art.scenery.barrels=frames.slice(0,3);art.scenery.trees=frames.slice(3);
  }
  function decodeRockets(source){
    // Individually measured rectangles include the exhaust outside nominal
    // atlas cells. Anchor the missile body, not the changing flame silhouette.
    const views=[
      [106,98,220,245,216,220],[449,97,406,247,701,211],
      [861,126,471,175,1133,211],[1354,96,404,210,1588,211],
      [96,518,242,261,216,646],[464,530,370,204,631,634],
      [866,557,477,163,1076,638],[1348,528,417,246,1529,635]
    ];
    art.shots.rocket=views.map(([x,y,width,height,cx,cy])=>{
      const frame=decodeSprite(source,0,0,1,1,'prop',{x,y,width,height});
      frame.centerAnchor=(cx-x)/width;frame.groundAnchor=(cy-y)/height;
      frame.worldScale=height/spriteBounds(frame).height;return frame;
    });
  }
  function prepareAssets(images){
    art.enemies.length=0;art.weapons.length=0;
    for(let atlas=0;atlas<2;atlas++)for(let row=0;row<3;row++){
      const frames=Array.from({length:8},(_,col)=>decodeSprite(images[atlas],col,row,8,3,'enemy'));
      prepareEnemyFrames(frames);art.enemies.push(frames);
    }
    // Original clean weapon sheets: one five-frame animation per row.
    for(let atlas=2;atlas<4;atlas++)for(let row=0;row<2;row++){
      const source=images[atlas],frames=Array.from({length:5},(_,col)=>decodeSprite(source,col,row,5,2,'weapon'));
      for(const frame of frames){
        frame.nominalWidth=source.width/5;frame.nominalHeight=source.height/2;
        frame.groundAnchor=measureWeaponBase(frame);
      }
      art.weapons.push(frames);
    }
    const shotgun=images[6],doubleFrames=Array.from({length:8},(_,i)=>decodeSprite(shotgun,i%3,Math.floor(i/3),3,3,'weapon'));
    // Match the rifle's visible idle height without counting transparent padding.
    const rifle=art.weapons[1][0],idleBounds=spriteBounds(doubleFrames[0]);
    const sizeMatch=(spriteBounds(rifle).height/rifle.nominalHeight)/(idleBounds.height/(shotgun.height/3));
    for(const frame of doubleFrames){
      frame.nominalWidth=shotgun.width/3/sizeMatch;frame.nominalHeight=shotgun.height/3/sizeMatch;
      frame.groundAnchor=measureWeaponBase(frame);
    }
    art.weapons.push(doubleFrames);
    decodeTextures(images[4]);decodeTextures(images[8],true);decodeProps(images[5]);decodeSky(images[7]);decodeScenery(images[9]);decodeRockets(images[10]);
  }
  async function loadAssets(){
    const paths=['assets/enemies-clean-a.png','assets/enemies-clean-b.png','assets/weapons-clean-a.png','assets/weapons-clean-b.png','assets/environment-clean.png','assets/props-clean.png','assets/weapon-double-barrel-reload.png','assets/sky-outpost.png','assets/environment-outdoors.png','assets/props-outdoors.png','assets/projectile-rocket-directions.png'];let complete=0;
    try{
      const images=await Promise.all(paths.map(src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{complete++;const p=Math.round(complete/paths.length*85);$('startLabel').textContent=`LOADING ${p}%`;$('loadProgress').style.width=p+'%';resolve(img);};img.onerror=()=>reject(new Error('Could not load '+src));img.src=src;})));
      await new Promise(resolve=>requestAnimationFrame(resolve));
      prepareAssets(images);state.ready=true;state.phase='menu';$('start').disabled=false;$('startLabel').textContent='START GAME';$('loadProgress').style.width='100%';$('loadTrack').style.visibility='hidden';
      $('start').focus({preventScroll:true});updateHud();requestAnimationFrame(loop);
    }catch(error){state.phase='error';$('start').disabled=false;$('startLabel').textContent='RETRY LOADING';$('menuText').textContent='The outpost could not load. Check your connection and retry.';console.error(error);}
  }

  function prepareTreeContacts(){
    treeContactSource=world.scenery;treeContactTiles=[];
    for(const tree of world.scenery)if(tree.kind==='tree'){
      const radius=tree.height*.28;
      for(let y=Math.max(0,Math.floor(tree.y-radius));y<=Math.min(MH-1,Math.floor(tree.y+radius));y++)for(let x=Math.max(0,Math.floor(tree.x-radius));x<=Math.min(MW-1,Math.floor(tree.x+radius));x++){
        const tile=treeContactTiles[y*MW+x]??=new Float32Array(256);
        for(let py=0;py<16;py++)for(let px=0;px<16;px++){
          const d=((x+(px+.5)/16-tree.x)**2+(y+(py+.5)/16-tree.y)**2)/(radius*radius);
          if(d<1)tile[py*16+px]=Math.max(tile[py*16+px],.42*(1-d)**2);
        }
      }
    }
  }
  function renderWorld(){
    if(treeContactSource!==world.scenery)prepareTreeContacts();
    const p=world.player,cs=Math.cos(p.angle),sn=Math.sin(p.angle),planeX=-sn*.72,planeY=cs*.72;
    const leftX=cs-planeX,leftY=sn-planeY;
    const recoil=world.shotTime<.1?(1-world.shotTime/.1)*(world.weapon===4?4:world.weapon===0?2:.6):0;
    horizon=H*.5+Math.sin(state.bob*1.8)*world.moving*.65+recoil;
    const shake=world.damageFlash>0?Math.sin(world.time*120)*world.damageFlash*3:0;horizon+=shake;
    // A panoramic sky turns with the camera; openings are resolved at the
    // ceiling plane so indoor rooms and open courtyards share the same view.
    const sky=art.skies[world.levelIndex];
    upperDepth.fill(Infinity);
    for(let x=0;x<W;x++){
      const u=(p.angle+Math.atan((2*x/W-1)*.72))/(Math.PI*2);
      skyColumns[x]=Math.floor((u-Math.floor(u))*sky.width);
    }
    for(let y=0;y<H;y++){
      const floor=y>horizon,dy=Math.max(.6,Math.abs(y-horizon));
      const distance=(floor?.62:.88)*projection/dy;
      let wx=p.x+distance*leftX,wy=p.y+distance*leftY;
      const stepX=distance*2*planeX/W,stepY=distance*2*planeY/W;
      const shade=clamp(Math.floor((1/(1+distance*.09)*(floor?1:.78)-.19)/.99*23),0,23);
      const outdoorShade=clamp(Math.floor((1.1/(1+distance*.055)-.19)/.99*23),0,23);
      const skyRow=clamp(Math.floor((.5-Math.atan((horizon-y)/projection)/Math.PI)*sky.height),0,sky.height-1)*sky.width;
      const base=floor?1:2;
      // Filter distant surfaces before sampling to keep floors from shimmering.
      const lod=clamp(Math.floor(Math.log2(Math.max(1,TEX_SIZE*distance/dy))),0,5),size=TEX_SIZE>>lod,mask=size-1;
      for(let x=0;x<W;x++,wx+=stepX,wy+=stepY){
        const mx=Math.floor(wx),my=Math.floor(wy),inside=mx>=0&&my>=0&&mx<MW&&my<MH,index=my*MW+mx;
        const outdoor=!inside||!world.ceilings[index];
        if(!floor&&outdoor){pixels[y*W+x]=sky.pixels[skyRow+skyColumns[x]];continue;}
        if(!floor)upperDepth[y*W+x]=distance;
        const ground=inside?world.floors[index]:0;
        const tile=!floor?base:ground===1?4:ground===5?10:ground===4?8:outdoor?7:base;
        let tx=((wx*size)|0)&mask,ty=((wy*size)|0)&mask;
        if(tile===4){tx=(tx+Math.floor(world.time*size/64))&mask;ty=(ty+Math.floor(world.time*size/128))&mask;}
        let color=art.textures[tile].mips[lod].shades[floor&&outdoor?outdoorShade:shade][ty*size+tx];const tint=world.level.tint;
        if(tint&&tile!==4){const r=color&255,g=(color>>>8)&255,b=(color>>>16)&255;color=0xff000000|(Math.min(255,b*tint[2])<<16)|(Math.min(255,g*tint[1])<<8)|Math.min(255,r*tint[0]);}
        // Contact shade is sampled on the actual floor plane, so it stays
        // under each trunk in perspective and is naturally hidden by walls.
        const contact=floor&&inside?treeContactTiles[index]:null;
        if(contact){const k=1-contact[Math.min(15,Math.floor((wy-my)*16))*16+Math.min(15,Math.floor((wx-mx)*16))];color=0xff000000|(((color>>>16&255)*k)<<16)|(((color>>>8&255)*k)<<8)|((color&255)*k);}
        // Recessed ceiling lamps repeat at intersections on the room grid.
        if(!floor&&distance<14&&mx%4===0&&my%4===0&&tx>size*.273&&tx<size*.727&&ty>size*.398&&ty<size*.602)color=0xffb1daef;
        pixels[y*W+x]=color;
      }
    }
    for(let x=0;x<W;x++){
      const cameraX=2*x/W-1,rayX=cs+planeX*cameraX,rayY=sn+planeY*cameraX;
      const headers=columnHeaders[x];headers.length=0;
      const hit=world.ray(p.x,p.y,rayX,rayY,Math.max(MW,MH)*1.5,headers),dist=hit.distance;zBuffer[x]=dist;
      let texture=hit.cell===2?3:hit.cell===3?5:0;if(hit.cell===4)texture=3;else if(texture===0)texture=world.level.indoorTexture;
      const nearX=Math.floor(p.x+rayX*Math.max(0,dist-.01)),nearY=Math.floor(p.y+rayY*Math.max(0,dist-.01));
      const outdoor=hit.outside??(nearX>=0&&nearY>=0&&nearX<MW&&nearY<MH&&!world.ceilings[nearY*MW+nearX]);
      const cellIndex=hit.y*MW+hit.x,wallHeight=hit.height??(outdoor?world.wallHeights[cellIndex]||1.5:1.5);
      if(hit.texture!==undefined)texture=hit.texture;else if(outdoor&&world.wallTextures[cellIndex]<255)texture=world.wallTextures[cellIndex];
      const height=projection*wallHeight/dist,top=horizon+(.62-wallHeight)*projection/dist,bottom=horizon+.62*projection/dist;
      const y0=Math.max(0,Math.floor(top)),y1=Math.min(H-1,Math.ceil(bottom));
      const shade=clamp(Math.floor(((outdoor?1.17:1.08)/(1+dist*(outdoor?.055:.080))*(hit.side?.77:1)-.19)/.99*23),0,23);
      const mip=art.textures[texture].mips[clamp(Math.floor(Math.log2(TEX_SIZE/height)),0,5)],tex=mip.shades[shade];
      const tx=clamp((hit.u*mip.size)|0,0,mip.mask);
      for(let y=y0;y<=y1;y++){
        const index=y*W+x;if(y<horizon&&dist>upperDepth[index]+.02)continue;
        const ty=clamp(((y-top)/height*mip.size)|0,0,mip.mask);let color=tex[ty*mip.size+tx];
        if(world.muzzle>0&&dist<3){const r=color&255,g=(color>>>8)&255,b=(color>>>16)&255;color=0xff000000|(Math.min(255,b+12)<<16)|(Math.min(255,g+22)<<8)|Math.min(255,r+34);}
        pixels[index]=color;
      }
      // Door heads occupy only the space above the opening. Rays, shots and
      // characters pass through the opening instead of hitting a painted door.
      for(let i=headers.length-1;i>=0;i--){
        const beam=headers[i],top=horizon+(.62-beam.height)*projection/beam.distance;
        const bottom=horizon+(.62-beam.bottom)*projection/beam.distance;
        beam.screenBottom=bottom;beam.screenTop=top;
        const shade=clamp(Math.floor((1.10/(1+beam.distance*.055)*(beam.side?.77:1)-.19)/.99*23),0,23);
        const mip=art.textures[10].mips[clamp(Math.floor(Math.log2(TEX_SIZE/(bottom-top))),0,5)],tex=mip.shades[shade];
        const tx=clamp(Math.floor(beam.u*mip.size),0,mip.mask);
        for(let y=Math.max(0,Math.floor(top));y<=Math.min(H-1,Math.ceil(bottom));y++){
          const index=y*W+x;if(beam.distance>upperDepth[index]+.02)continue;
          const ty=clamp(Math.floor((y-top)/(bottom-top)*mip.size),0,mip.mask);
          pixels[index]=tex[ty*mip.size+tx];upperDepth[index]=beam.distance;
        }
      }
    }
    sceneCtx.putImageData(buffer,0,0);ctx.drawImage(sceneCanvas,0,0,W,H);
    const sprites=[];
    for(const e of world.enemies)sprites.push({x:e.x,y:e.y,z:0,height:TYPES[e.type].height*art.enemies[e.type][e.frame].worldScale,image:art.enemies[e.type][e.frame],groundAnchor:art.enemies[e.type][e.frame].groundAnchor,corpse:e.hp<=0});
    for(const prop of world.scenery){const image=prop.kind==='barrel'?art.scenery.barrels[prop.state]:art.scenery.trees[prop.variant];sprites.push({x:prop.x,y:prop.y,z:0,height:prop.height*image.worldScale,image,groundAnchor:image.groundAnchor});}
    for(const item of world.pickups)if(!item.taken)sprites.push({x:item.x,y:item.y,z:.035+Math.sin(world.time*2.4+item.id)*.025,height:.40,image:art.props[item.kind]});
    for(const shot of world.projectiles){
      const rocket=shot.kind==='rocket',image=rocket?art.shots.rocket[rocketView(shot,p)]:art.shots[shot.kind];
      sprites.push({x:shot.x,y:shot.y,z:shot.z??.48,height:rocket?.18*image.worldScale:shot.kind==='fire'?.29:.15,image,groundAnchor:rocket?image.groundAnchor:.5});
    }
    for(let i=bursts.length-1;i>=0;i--){const b=bursts[i],age=world.time-b.time;if(age>.38){bursts.splice(i,1);continue;}sprites.push({x:b.x,y:b.y,z:.08,height:(.9+age*1.6)*(b.scale??1),image:art.props.explosion,alpha:1-age/.38});}
    if(world.kills===world.enemies.length)sprites.push({x:world.exit.x+.24,y:world.exit.y,z:0,height:1.42,image:art.props.exit});
    for(const s of sprites){s.depth=(s.x-p.x)*cs+(s.y-p.y)*sn;s.lateral=-(s.x-p.x)*sn+(s.y-p.y)*cs;}
    sprites.sort((a,b)=>b.depth-a.depth);
    for(const s of sprites){
      if(s.depth<.13||s.depth>28)continue;
      const dh=s.height*projection/s.depth,dw=dh*s.image.width/s.image.height,left=W*.5+s.lateral*projection/s.depth-dw*(s.image.centerAnchor??.5),top=horizon+(.62-s.z)*projection/s.depth-dh*(s.groundAnchor??s.image.groundAnchor??1);
      if(left>W||left+dw<0)continue;
      ctx.globalAlpha=s.alpha??1;drawOccluded(s.image,left,top,dw,dh,s.depth);ctx.globalAlpha=1;
    }
    for(const v of world.particles){
      const dx=v.x-p.x,dy=v.y-p.y,depth=dx*cs+dy*sn;if(depth<.15)continue;
      const x=W*.5+(-dx*sn+dy*cs)*projection/depth,y=horizon+(.62-v.z)*projection/depth;
      if(x<0||x>=W||depth>zBuffer[x|0]||(y>=0&&y<H&&depth>upperDepth[(y|0)*W+(x|0)]))continue;
      ctx.fillStyle=v.kind==='spark'?'#fff1a0':'#ec9539';ctx.globalAlpha=clamp(v.life*3,0,1);const size=Math.max(1,projection/depth*.012);ctx.fillRect(x|0,y|0,size,size);ctx.globalAlpha=1;
    }
    renderWeapon();
    if(world.damageFlash>0){ctx.fillStyle=`rgba(182,30,12,${world.damageFlash*.7})`;ctx.fillRect(0,0,W,H);}
    if(world.pickupFlash>0){ctx.fillStyle=`rgba(205,200,72,${world.pickupFlash*.3})`;ctx.fillRect(0,0,W,H);}
    if(state.map)renderMap();
  }
  function drawOccluded(image,left,top,width,height,depth){
    const start=Math.max(0,Math.floor(left)),end=Math.min(W,Math.ceil(left+width));let run=-1,runTop=top;
    for(let x=start;x<=end;x++){
      const visible=x<end&&depth<zBuffer[x];
      let clippedTop=top;
      if(visible)for(const beam of columnHeaders[x])if(depth>beam.distance)clippedTop=Math.max(clippedTop,Math.ceil(beam.screenBottom));
      if(run>=0&&(!visible||clippedTop!==runTop)){
        const sx=clamp((run-left)/width*image.width,0,image.width),sw=Math.min(image.width-sx,(x-run)/width*image.width);
        const sy=clamp((runTop-top)/height*image.height,0,image.height),sh=image.height-sy;
        if(sw>0&&sh>0)ctx.drawImage(image,sx,sy,sw,sh,run,runTop,x-run,height*(sh/image.height));run=-1;
      }
      if(visible&&run<0){run=x;runTop=clippedTop;}
    }
  }
  function renderWeapon(){
    if(state.map)return;const frame=world.weaponFrame(),image=art.weapons[world.weapon][frame];
    const idle=Math.sin(world.time*1.8)*.5,bobX=Math.sin(state.bob)*world.moving*3,bobY=Math.abs(Math.cos(state.bob))*world.moving*2;
    const scale=Math.min(W*.69/image.nominalWidth,H*.5/image.nominalHeight),width=image.width*scale,height=image.height*scale;
    const drop=world.switchTime>0?Math.sin(world.switchTime/.25*Math.PI)*height*.6:0;
    const left=W*.5-width*.5+bobX,top=H-height*(image.groundAnchor??1)+Math.max(0,idle+bobY)+drop;
    ctx.drawImage(image,left,top,width,height);
  }
  function renderMap(){
    ctx.fillStyle='#071009e8';ctx.fillRect(0,0,W,H);
    const size=Math.max(1,Math.min((W-32)/MW,(H-56)/MH)),ox=(W-MW*size)/2,oy=(H-MH*size)/2;
    for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){
      const i=y*MW+x;if(world.walls[i]){ctx.fillStyle=world.wallTextures[i]<255?'#5e5446':'#374131';}else ctx.fillStyle=world.floors[i]===1?'#376329':world.ceilings[i]?'#111b11':world.floors[i]===5?'#ac8841':world.floors[i]===4?'#52616a':'#263d48';ctx.fillRect(ox+x*size,oy+y*size,size-.7,size-.7);
      ctx.fillStyle='#889184';if(world.edgeX[i]===1)ctx.fillRect(ox+x*size-.5,oy+y*size,1,size);if(world.edgeY[i]===1)ctx.fillRect(ox+x*size,oy+y*size-.5,size,1);
    }
    ctx.strokeStyle='#e7bb63';ctx.lineWidth=1.5;
    for(const d of world.portals){ctx.beginPath();if(d.axis){ctx.moveTo(ox+d.lo*size,oy+d.at*size);ctx.lineTo(ox+d.hi*size,oy+d.at*size);}else{ctx.moveTo(ox+d.at*size,oy+d.lo*size);ctx.lineTo(ox+d.at*size,oy+d.hi*size);}ctx.stroke();}
    if(size>=4.5){
      ctx.font='7px monospace';ctx.textAlign='center';
      for(const [name,x,y]of world.landmarks){const tx=ox+x*size,ty=oy+y*size;ctx.fillStyle='#071009df';ctx.fillRect(tx-ctx.measureText(name).width/2-2,ty-7,ctx.measureText(name).width+4,9);ctx.fillStyle='#bad0cc';ctx.fillText(name,tx,ty);}
      ctx.textAlign='start';
    }
    for(const e of world.enemies)if(e.hp>0){ctx.fillStyle=e.type===1?'#dc616a':'#e59b59';ctx.fillRect(ox+e.x*size-1.5,oy+e.y*size-1.5,3,3);}
    for(const prop of world.scenery)if(prop.kind==='barrel'&&prop.state!==2){ctx.strokeStyle='#d86443';ctx.lineWidth=1;ctx.strokeRect(ox+prop.x*size-1.5,oy+prop.y*size-1.5,3,3);}
    for(const p of world.pickups)if(!p.taken){ctx.fillStyle=p.kind==='health'?'#ed7252':'#6cb6b1';ctx.fillRect(ox+p.x*size-1,oy+p.y*size-1,2,2);}
    const guide=world.extractionGuide();
    if(guide){ctx.strokeStyle='#a4ed83';ctx.lineWidth=1.5;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(ox+world.player.x*size,oy+world.player.y*size);for(const point of guide.route)ctx.lineTo(ox+point.x*size,oy+point.y*size);ctx.stroke();ctx.setLineDash([]);}
    ctx.fillStyle='#a4ed83';ctx.fillRect(ox+world.exit.x*size-2,oy+world.exit.y*size-2,4,4);
    const p=world.player;ctx.save();ctx.translate(ox+p.x*size,oy+p.y*size);ctx.rotate(p.angle);ctx.fillStyle='#ffeac0';ctx.beginPath();ctx.moveTo(5,0);ctx.lineTo(-3,-3);ctx.lineTo(-1,0);ctx.lineTo(-3,3);ctx.closePath();ctx.fill();ctx.restore();
    ctx.fillStyle='#b8c3a4';ctx.font='10px monospace';ctx.textAlign='center';ctx.fillText(world.level.name+' SCHEMATIC  ·  M TO CLOSE',W/2,oy-10);ctx.fillStyle='#99b6b7';ctx.font='8px monospace';ctx.fillText('BLUE: OUTDOORS  ·  ORANGE: HOSTILES  ·  GREEN: EXIT',W/2,oy+MH*size+14);ctx.textAlign='start';
  }

  const sound={context:null,master:null,noise:null,
    init(){
      try{
        if(this.context){this.context.resume().catch(()=>{});return;}
        const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;const ac=this.context=new Audio();this.master=ac.createGain();this.master.gain.value=state.muted?0:.34;this.master.connect(ac.destination);
        this.noise=ac.createBuffer(1,ac.sampleRate,ac.sampleRate);const a=this.noise.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;
        for(const f of [46,69]){const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=f;g.gain.value=.025;o.connect(g);g.connect(this.master);o.start();}
      }catch(error){/* Audio is optional; gameplay stays available. */}
    },
    tone(f,duration,volume,type='sine',end=40){if(!this.context||state.muted)return;const ac=this.context,t=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(1,end),t+duration);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.master);o.start();o.stop(t+duration);},
    hiss(duration,volume,freq){if(!this.context||state.muted)return;const ac=this.context,t=ac.currentTime,n=ac.createBufferSource(),filter=ac.createBiquadFilter(),g=ac.createGain();n.buffer=this.noise;filter.type='lowpass';filter.frequency.value=freq;g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);n.connect(filter);filter.connect(g);g.connect(this.master);n.start();n.stop(t+duration);},
    event(e){switch(e.type){
      case'fire':if(e.weapon===4){this.hiss(.34,.95,1300);this.tone(85,.38,.85,'triangle',22);}else if(e.weapon===0){this.hiss(.24,.8,1700);this.tone(115,.23,.7,'triangle',28);setTimeout(()=>{if(state.phase==='playing')this.hiss(.075,.18,2500);},280);}else if(e.weapon===1){this.hiss(.075,.23,2300);this.tone(500,.1,.25,'sawtooth',100);}else if(e.weapon===2){this.hiss(.065,.35,1800);this.tone(110,.09,.24,'triangle',45);}else{this.hiss(.4,.45,950);this.tone(95,.30,.55,'sawtooth',30);}break;
      case'breakOpen':this.hiss(.09,.24,2400);this.tone(320,.07,.10,'square',130);break;
      case'shellEject':this.hiss(.045,.12,3400);this.tone(700,.065,.08,'triangle',300);break;
      case'shellLoad':this.hiss(.10,.2,1100);this.tone(220,.08,.10,'square',85);break;
      case'breakClose':this.hiss(.08,.3,1800);this.tone(150,.08,.17,'triangle',65);break;
      case'explosion':this.hiss(.65,.8,700);this.tone(65,.6,.75,'triangle',20);break;
      case'barrelIgnite':this.hiss(.16,.2,1700);break;
      case'kill':this.tone(e.typeId===1?85:140,.32,.17,'sawtooth',35);break;
      case'hit':this.hiss(.075,.17,850);break;
      case'damage':this.hiss(.13,.25,450);this.tone(80,.14,.24,'triangle',30);break;
      case'pickup':this.tone(600,.12,.15,'sine',1000);break;
      case'switch':case'reload':case'loaded':this.hiss(.065,.14,1500);break;
      case'empty':this.hiss(.03,.14,2000);break;
      case'enemyFire':if(e.near){this.hiss(.11,.12,650);this.tone(190,.11,.10,'triangle',65);}break;
      case'step':this.hiss(.045,.05,220);break;
      case'won':this.tone(330,.3,.2,'sine',660);break;
    }}
  };
  function showMessage(text,time=2){$('message').textContent=text;$('message').style.opacity='1';state.message=time;}
  function processEvents(){
    for(const e of world.events){sound.event(e);
      if(e.type==='explosion')bursts.push({x:e.x,y:e.y,time:world.time,scale:e.scale??1});
      if(e.type==='pickup')showMessage(e.kind==='health'?'+35 HEALTH':e.kind==='armor'?'+35 ARMOR':e.kind==='rockets'?'+4 ROCKETS':'+12 SHELLS · +45 CELLS · +90 ROUNDS',1.7);
      if(e.type==='cleared'){showMessage(world.level.name+' CLEAR · REACH THE EXTRACTION GATE',5);$('objective').textContent='REACH THE EXTRACTION GATE';}
      if(e.type==='toxic')showMessage('TOXIC FLOOR — KEEP MOVING',1.2);
      if(e.type==='dead'){state.deathDelay=.75;clearInput();releaseLock();}
      if(e.type==='won')finish(true);
    }world.events.length=0;
  }
  const lastHud={};
  function hudText(key,value){if(lastHud[key]!==value){allHud[key].textContent=value;lastHud[key]=value;}}
  function updateHud(){
    const ammoSlot=WEAPONS[world.weapon].ammoSlot??world.weapon;
    hudText('health',Math.ceil(world.player.health));hudText('armor',Math.ceil(world.player.armor));hudText('ammo',world.ammo[ammoSlot]);hudText('ammoReserve',ammoSlot===0?'SHELLS':world.weapon===3?'ROCKETS':'/ '+(world.weapon===1?world.reserve:world.chainReserve));
    hudText('remaining',world.enemies.length-world.kills);hudText('killCounter',`${world.kills} / ${world.enemies.length}`);
    hudText('timer',formatTime(world.time));hudText('weaponName',world.reloadTime>0?'RELOADING…':WEAPONS[world.weapon].name);hudText('weaponHint',String(world.weapon+1).padStart(2,'0')+' / '+String(WEAPONS.length).padStart(2,'0'));
    hudText('touchSwitch',(world.weapon+1)+' / '+WEAPONS.length);
    $('healthbar').style.width=world.player.health+'%';$('armorbar').style.width=world.player.armor+'%';$('ammobar').style.width=clamp(world.ammo[ammoSlot]/[32,30,60,6][ammoSlot]*100,0,100)+'%';$('hitmarker').style.opacity=world.hitmarker>0?'1':'0';
    const boss=world.enemies.find(e=>e.type===5&&e.active&&e.hp>0);$('bossHud').hidden=!boss;if(boss)$('bossBar').style.width=(boss.hp/TYPES[5].hp*100)+'%';
    const guide=state.phase==='playing'?world.extractionGuide():null;$('extractionHud').hidden=!guide;
    if(guide){
      $('extractionArrow').style.transform=`rotate(${guide.angle}rad)`;
      hudText('extractionDistance',Math.ceil(guide.distance)+' M');
      hudText('extractionTurn',guide.distance<1.5?'ENTER THE GATE':Math.abs(guide.angle)>2.3?'TURN AROUND':guide.angle>.35?'BEAR RIGHT':guide.angle<-.35?'BEAR LEFT':'STRAIGHT AHEAD');
    }
  }
  const formatTime=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0');
  function clearInput(){keys.clear();state.mouseDown=false;state.touchFire=false;state.stickX=0;state.stickY=0;state.dragX=null;$('stick').style.transform='';}
  function releaseLock(){if(document.pointerLockElement===canvas&&document.exitPointerLock)document.exitPointerLock();}
  async function requestLock(){
    if(coarse()||!canvas.requestPointerLock)return;
    try{await canvas.requestPointerLock();state.fallbackAim=false;}catch{if(!state.fallbackAim){state.fallbackAim=true;showMessage('DRAG TO AIM · ARROW KEYS ALSO TURN',4);}}
  }
  function begin(){
    if(state.phase==='error'){state.phase='loading';$('start').disabled=true;loadAssets();return;}
    if(!state.ready)return;
    if(state.phase==='intermission'){world.advance();state.map=false;state.bob=0;}else if(state.phase!=='paused'){world.reset(state.phase==='end'&&!state.endWon?world.levelIndex:0);state.map=false;state.bob=0;}
    $('sectorNumber').textContent='SECTOR 0'+(world.levelIndex+1);$('sectorName').textContent=world.level.name;$('objective').textContent=world.kills===world.enemies.length?'REACH THE EXTRACTION GATE':'CLEAR THE '+world.level.name;$('menuSubtitle').textContent='SECTOR 0'+(world.levelIndex+1)+' · '+world.level.tag;
    bursts.length=0;clearInput();state.phase='playing';state.last=performance.now();state.deathDelay=0;document.body.classList.remove('menu-active','paused','endgame','map-open');$('overlay').style.display='none';
    sound.init();canvas.focus({preventScroll:true});requestLock();showMessage('SECTOR 0'+(world.levelIndex+1)+' — '+world.level.name+' · '+world.enemies.length+' HOSTILES',3.5);
  }
  function pause(){
    if(state.phase!=='playing'||world.dead||world.won)return;state.phase='paused';clearInput();releaseLock();document.body.classList.add('menu-active','paused');$('overlay').style.display='flex';
    $('menuPanel').querySelector('h1').innerHTML='MISSION<br><strong>PAUSED</strong>';$('menuText').textContent='The foundry can wait.';$('startLabel').textContent='RESUME MISSION';$('start').focus({preventScroll:true});
  }
  function finish(won){
    if(state.phase==='end'||state.phase==='intermission')return;state.endWon=won;state.phase=won&&world.levelIndex<LEVELS.length-1?'intermission':'end';clearInput();releaseLock();document.body.classList.remove('paused');document.body.classList.add('menu-active','endgame');$('overlay').style.display='flex';
    $('menuPanel').querySelector('h1').innerHTML=won?(state.phase==='intermission'?'SECTOR<br><strong>SECURED</strong>':'OUTPOST<br><strong>LIBERATED</strong>'):'SIGNAL<br><strong>LOST</strong>';
    $('menuText').textContent=won?(state.phase==='intermission'?`${world.level.name} clear. ${world.kills} hostiles eliminated. Next: ${LEVELS[world.levelIndex+1].name}.`:`All ${LEVELS.length} sectors secured. Time ${formatTime(world.campaignTime+world.time)}. Score ${world.campaignScore+world.score}.`):`${world.kills} / ${world.enemies.length} hostiles eliminated. Get back in there.`;
    $('startLabel').textContent=won?(state.phase==='intermission'?'ENTER '+LEVELS[world.levelIndex+1].name:'PLAY AGAIN'):'RETRY SECTOR';$('start').focus({preventScroll:true});
  }
  function loop(now){
    const dt=Math.min((now-(state.last||now))/1000,.04);state.last=now;
    if(state.phase==='playing'){
      if(world.dead){state.deathDelay-=dt;if(state.deathDelay<=0)finish(false);}else{
        const down=k=>keys.has(k)?1:0;
        world.update(dt,{forward:down('KeyW')+down('ArrowUp')-down('KeyS')-down('ArrowDown')-state.stickY,strafe:down('KeyD')+down('KeyE')-down('KeyA')-down('KeyQ')+state.stickX,turn:down('ArrowRight')-down('ArrowLeft'),run:keys.has('ShiftLeft')||keys.has('ShiftRight'),fire:state.mouseDown||state.touchFire||keys.has('Space')});
        state.bob+=dt*world.moving*(keys.has('ShiftLeft')?14:10);processEvents();
      }
      if(state.message>0){state.message-=dt;if(state.message<=0)$('message').style.opacity='0';}
    }
    if(state.ready){renderWorld();updateHud();}
    requestAnimationFrame(loop);
  }
  $('start').addEventListener('click',begin);$('pause').addEventListener('click',pause);
  $('sound').addEventListener('click',()=>{state.muted=!state.muted;sound.init();if(sound.master)sound.master.gain.value=state.muted?0:.34;$('sound').textContent=state.muted?'SOUND OFF':'SOUND ON';$('sound').setAttribute('aria-pressed',String(!state.muted));});
  $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('game').requestFullscreen)await $('game').requestFullscreen();}catch{showMessage('FULLSCREEN IS NOT AVAILABLE HERE',2);}});
  addEventListener('keydown',e=>{
    // Keep menu links reachable with Tab and let Enter activate the focused link.
    if(state.phase!=='playing'&&(e.code==='Tab'||(e.target===moreGamesButton&&(e.code==='Enter'||e.code==='Space'))))return;
    const handled=['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab','KeyM','Digit1','Digit2','Digit3','Digit4','Digit5','KeyR','Escape','KeyP','Enter'];
    if(handled.includes(e.code)&&!e.ctrlKey&&!e.metaKey)e.preventDefault();
    if(e.code==='Escape'||e.code==='KeyP'){if(state.phase==='playing')pause();else if(state.phase==='paused'&&!e.repeat)begin();return;}
    if(state.phase!=='playing'){if((e.code==='Enter'||e.code==='Space')&&!e.repeat)begin();return;}
    keys.add(e.code);if(e.repeat)return;
    if(/^Digit[1-5]$/.test(e.code))world.setWeapon(Number(e.code.slice(-1))-1);if(e.code==='Tab')world.setWeapon((world.weapon+1)%WEAPONS.length);if(e.code==='KeyR')world.reload();
    if(e.code==='KeyM'){state.map=!state.map;document.body.classList.toggle('map-open',state.map);}
  });
  addEventListener('keyup',e=>keys.delete(e.code));
  canvas.addEventListener('pointerdown',e=>{if(state.phase!=='playing'||e.pointerType==='touch')return;e.preventDefault();state.mouseDown=true;state.dragX=e.clientX;requestLock();});
  addEventListener('pointerup',e=>{if(e.pointerType!=='touch'){state.mouseDown=false;state.dragX=null;}});
  addEventListener('mousemove',e=>{if(state.phase!=='playing'||world.dead)return;if(document.pointerLockElement===canvas)world.player.angle+=clamp(e.movementX,-180,180)*.0023;
    else if(state.mouseDown&&state.dragX!==null){world.player.angle+=(e.clientX-state.dragX)*.004;state.dragX=e.clientX;}});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{if(state.phase==='playing'){e.preventDefault();world.setWeapon((world.weapon+1)%WEAPONS.length);}},{passive:false});
  document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&state.phase==='playing'&&!world.dead&&!world.won)pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});addEventListener('blur',()=>pause());
  let stickPointer=null,stickOrigin=null,lookPointer=null,lookX=0;
  $('joystick').addEventListener('pointerdown',e=>{if(state.phase!=='playing')return;e.preventDefault();stickPointer=e.pointerId;const r=$('joystick').getBoundingClientRect();stickOrigin={x:r.left+r.width/2,y:r.top+r.height/2};$('joystick').setPointerCapture(e.pointerId);updateStick(e);});
  function updateStick(e){if(e.pointerId!==stickPointer)return;const dx=e.clientX-stickOrigin.x,dy=e.clientY-stickOrigin.y,d=Math.hypot(dx,dy),max=36,s=d>max?max/d:1;state.stickX=dx*s/max;state.stickY=dy*s/max;$('stick').style.transform=`translate(${dx*s}px,${dy*s}px)`;}
  $('joystick').addEventListener('pointermove',updateStick);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(type,e=>{if(e.pointerId===stickPointer){stickPointer=null;state.stickX=state.stickY=0;$('stick').style.transform='';}});
  $('lookZone').addEventListener('pointerdown',e=>{if(state.phase!=='playing')return;lookPointer=e.pointerId;lookX=e.clientX;$('lookZone').setPointerCapture(e.pointerId);});
  $('lookZone').addEventListener('pointermove',e=>{if(e.pointerId===lookPointer){world.player.angle+=(e.clientX-lookX)*.005;lookX=e.clientX;}});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])$('lookZone').addEventListener(type,()=>lookPointer=null);
  $('touchFire').addEventListener('pointerdown',e=>{if(state.phase!=='playing')return;e.preventDefault();state.touchFire=true;$('touchFire').setPointerCapture(e.pointerId);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])$('touchFire').addEventListener(type,()=>state.touchFire=false);
  $('touchSwitch').addEventListener('click',()=>world.setWeapon((world.weapon+1)%WEAPONS.length));
  // Initial canvas remains a quiet backdrop until every source atlas decodes.
  ctx.fillStyle='#11160e';ctx.fillRect(0,0,W,H);loadAssets();
})();
