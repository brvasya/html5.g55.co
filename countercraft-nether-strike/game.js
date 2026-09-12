/* Countercraft: Nether Strike — software raycaster, sprite compositor, input and sound. */
(() => {
  'use strict';
  const {World,TYPES,WEAPONS,LEVELS,clamp,MW,MH}=CounterCore;
  const $=id=>document.getElementById(id),canvas=$('view'),ctx=canvas.getContext('2d',{alpha:false});
  const moreGamesButton=$('moreGamesButton');
  moreGamesButton.href = `https://g55.co/?utm_source=moreGamesButton&utm_medium=${encodeURIComponent(document.title)}`;
  const world=new World(),keys=new Set();
  const state={phase:'loading',ready:false,last:0,map:false,muted:false,mouseDown:false,dragX:null,touchFire:false,stickX:0,stickY:0,bob:0,message:0,deathDelay:0,fallbackAim:false,cashGain:0,cashGainTotal:0,shopReturn:'playing'};
  const art={enemies:[],weapons:[],firing:[],textures:[],doors:[],glass:null,skies:[],props:{},shots:{},scenery:{},tnt:null};
  const sceneCanvas=document.createElement('canvas'),sceneCtx=sceneCanvas.getContext('2d',{alpha:false});
  const glassCanvas=document.createElement('canvas'),glassCtx=glassCanvas.getContext('2d');
  const TEX_SIZE=128;
  const bursts=[],casings=[];
  let contactSource=null,contactState=-1,contactTiles=[];
  let W=640,H=360,horizon=180,projection=485,pixels,buffer,zBuffer,skyColumns,upperDepth,columnHeaders,columnDoors,columnGlass,spriteDepth,glassBuffer,glassPixels,hasGlass=false;
  const coarse=()=>matchMedia('(pointer:coarse)').matches;
  const allHud=['health','armor','ammo','ammoReserve','remaining','timer','weaponName','weaponHint','killCounter','objective','touchSwitch','extractionDistance','extractionTurn','cash'].reduce((a,k)=>(a[k]=$(k),a),{});
  document.body.classList.add('menu-active');

  function resize(){
    state.needsRender=true;
    const width=innerWidth,height=innerHeight;
    const sceneScale=Math.min(1,900/width,Math.sqrt((coarse()?240000:390000)/(width*height)));
    W=Math.max(1,Math.round(width*sceneScale));H=Math.max(1,Math.round(height*sceneScale));
    const displayScale=Math.min(window.devicePixelRatio||1,1.5,Math.sqrt(2500000/(width*height)));
    canvas.width=Math.round(width*displayScale);canvas.height=Math.round(height*displayScale);
    sceneCanvas.width=W;sceneCanvas.height=H;
    glassCanvas.width=W;glassCanvas.height=H;
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    horizon=H*.5;projection=W/(2*.72);
    buffer=sceneCtx.createImageData(W,H);pixels=new Uint32Array(buffer.data.buffer);zBuffer=new Float32Array(W);skyColumns=new Uint16Array(W);
    upperDepth=new Float32Array(W*H);columnHeaders=Array.from({length:W},()=>[]);columnDoors=new Array(W);
    columnGlass=Array.from({length:W},()=>[]);spriteDepth=new Float32Array(W*H);
    glassBuffer=glassCtx.createImageData(W,H);glassPixels=new Uint32Array(glassBuffer.data.buffer);
  }
  addEventListener('resize',resize);resize();

  const offscreen=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  // Preserve native-alpha art at source size. The block-prop atlas alone uses
  // an explicit green matte; its white and cyan highlights stay intact.
  function decodeSprite(source,col,row,cols,rows,kind,rect){
    const x0=rect?.x??Math.round(col*source.width/cols),y0=rect?.y??Math.round(row*source.height/rows);
    const width=rect?.width??Math.round((col+1)*source.width/cols)-x0,height=rect?.height??Math.round((row+1)*source.height/rows)-y0;
    const c=offscreen(width,height),g=c.getContext('2d',{willReadFrequently:true});
    g.drawImage(source,x0,y0,width,height,0,0,width,height);
    const img=g.getImageData(0,0,width,height),d=img.data,n=width*height;
    if(kind==='keyed-prop')for(let i=0;i<d.length;i+=4){
      // This atlas uses a single green transport matte. Its potion, diamond,
      // smoke and purple portal contain no chroma green; other atlases keep alpha.
      const excess=d[i+1]-Math.max(d[i],d[i+2]);
      if(excess>24){const key=clamp((excess-24)/105,0,1);d[i+3]=Math.round(d[i+3]*(1-key));d[i+1]=Math.min(d[i+1],Math.max(d[i],d[i+2])+24);}
    }
    if(kind==='keyed-weapon'||kind==='keyed-scenery')for(let i=0;i<d.length;i+=4){
      // Magenta is distinct from the olive sleeves and wooden scenery.
      const excess=Math.min(d[i],d[i+2])-d[i+1];
      if(excess>32){const key=clamp((excess-32)/128,0,1);d[i+3]=Math.round(d[i+3]*(1-key));d[i]=Math.min(d[i],d[i+1]+16);d[i+2]=Math.min(d[i+2],d[i+1]+16);}
    }
    const seen=new Uint8Array(n),queue=new Int32Array(n);
    for(let i=3;i<d.length;i+=4){if(d[i]<=(kind==='chest'?32:8))d[i]=0;else if(d[i]>=245)d[i]=255;}
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
      if(tail<(kind==='enemy'?12:4)||(kind==='enemy'&&touches&&tail<n*.03)){
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
    const standingHeight=bounds[0].height;
    for(let i=0;i<frames.length;i++){
      frames[i].groundAnchor=(bounds[i].bottom+1)/frames[i].height;
      // One body scale for the whole animation, including collapse and corpse.
      frames[i].worldScale=frames[i].height/standingHeight;
    }
  }
  function anchorScenery(image,standingHeight){
    const b=spriteBounds(image),data=image.getContext('2d').getImageData(0,0,image.width,image.height).data;
    let base=b.bottom;
    // Ignore stray edge pixels below the solid base. The support center comes
    // from the foot/trunk, which is often off-center relative to the foliage.
    for(;base>b.top;base--){
      let count=0;for(let x=b.left;x<=b.right;x++)if(data[(base*image.width+x)*4+3]>=200)count++;
      if(count>=Math.max(3,b.width*.08))break;
    }
    let sum=0,count=0;
    for(let y=Math.max(b.top,base-Math.ceil(b.height*.045));y<=base;y++)for(let x=b.left;x<=b.right;x++)if(data[(y*image.width+x)*4+3]>=200){sum+=x+.5;count++;}
    image.worldScale=image.height/(standingHeight??(base-b.top+1));
    image.groundAnchor=(base+1)/image.height;
    image.centerAnchor=count?sum/count/image.width:(b.left+b.right+1)/(2*image.width);
    image.footprint=b.width/(standingHeight??b.height);
    image.groundInset=.012;
    return image;
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
  function decodeDoors(source){
    // Crop at the atlas's actual panel seams, then keep a 1:2 door face.
    const seams=[0,510,1030,1536];
    art.doors=Array.from({length:3},(_,i)=>({mips:Array.from({length:6},(_,lod)=>{
      const width=64>>lod,height=128>>lod,c=offscreen(width,height),g=c.getContext('2d');
      g.imageSmoothingEnabled=false;
      g.drawImage(source,seams[i],0,seams[i+1]-seams[i],source.height,0,0,width,height);
      const original=new Uint32Array(g.getImageData(0,0,width,height).data.buffer);
      const shades=Array.from({length:24},(_,level)=>{
        const out=new Uint32Array(original.length),light=.19+level/23*.99;
        for(let j=0;j<out.length;j++){const c=original[j];out[j]=0xff000000|(Math.min(255,(c>>>16&255)*light)<<16)|(Math.min(255,(c>>>8&255)*light)<<8)|Math.min(255,(c&255)*light);}
        return out;
      });
      return {width,height,shades};
    })}));
  }
  function decodeProps(source){
    const names=['health','armor','explosion','exit'];
    for(let i=0;i<names.length;i++){
      const frame=decodeSprite(source,i%2,Math.floor(i/2),2,2,'keyed-prop'),bounds=spriteBounds(frame,16);
      const c=offscreen(bounds.width,bounds.height),g=c.getContext('2d');
      g.drawImage(frame,bounds.left,bounds.top,bounds.width,bounds.height,0,0,bounds.width,bounds.height);
      c.groundAnchor=(spriteBounds(c).bottom+1)/c.height;c.pixelated=true;
      art.props[names[i]]=c;
    }
  }
  function prepareAssets(images){
    art.enemies.length=0;art.weapons.length=0;art.firing.length=0;
    for(let atlas=0;atlas<2;atlas++)for(let row=0;row<3;row++){
      const frames=Array.from({length:8},(_,col)=>decodeSprite(images[atlas],col,row,8,3,'enemy'));
      prepareEnemyFrames(frames);
      const standingHeight=spriteBounds(frames[0]).height;
      frames.push(...CounterAnimation.walkFrames(frames[0],atlas*3+row,standingHeight));
      art.enemies.push(frames);
    }
    for(let weapon=0;weapon<6;weapon++){
      const source=images[weapon+2],frames=Array.from({length:8},(_,i)=>decodeSprite(source,i%4,Math.floor(i/4),4,2,'weapon'));
      if(weapon===5){
        // Only the two cover-handling poses needed a corrected two-hand sprite.
        // Keep the original idle, firing and remaining reload poses untouched.
        for(const [cell,index] of [[0,2],[1,5]]){
          const repaired=decodeSprite(images[20],cell,0,2,1,'keyed-weapon'),frame=offscreen(frames[0].width,frames[0].height);
          frame.getContext('2d').drawImage(repaired,0,0,frame.width,frame.height);frames[index]=frame;
        }
      }
      const idle=spriteBounds(frames[0]),targetHeight=[.33,.35,.40,.41,.42,.44][weapon];
      const ratio=targetHeight/(idle.height/frames[0].height);
      for(const frame of frames){frame.nominalWidth=frames[0].width;frame.nominalHeight=frames[0].height;frame.groundAnchor=measureWeaponBase(frame);frame.sizeRatio=ratio;}
      art.weapons.push(frames);
      art.firing.push(CounterAnimation.fireFrames(frames[0],images[13+weapon],weapon));
    }
    decodeTextures(images[8]);decodeTextures(images[9],true);decodeSky(images[11]);decodeProps(images[12]);
    // Terrain variants reuse the same block detail with an explicit biome palette.
    for(const tint of [[.53,1.04,.39],[.73,.26,.25]])art.textures.push({mips:art.textures[7].mips.map(m=>({...m,shades:m.shades.map(shade=>{const out=new Uint32Array(shade.length);for(let i=0;i<out.length;i++){const c=shade[i];out[i]=0xff000000|(Math.min(255,(c>>>16&255)*tint[2])<<16)|(Math.min(255,(c>>>8&255)*tint[1])<<8)|Math.min(255,(c&255)*tint[0]);}return out;})}))});
    art.scenery.decor=Array.from({length:12},(_,i)=>{
      const replacement=i===5?images[22]:null,variant=i===9?10:i;
      const c=replacement?decodeSprite(replacement,0,0,1,1,'keyed-scenery'):decodeSprite(images[10],variant%4,Math.floor(variant/4),4,3,'prop');
      if(replacement)c.pixelated=true;
      return anchorScenery(c);
    });
    art.props.ammo=art.scenery.decor[8];
    art.scenery.chests=Array.from({length:3},(_,i)=>decodeSprite(images[19],i,0,3,1,'chest'));
    const chestHeight=spriteBounds(art.scenery.chests[0]).height;
    for(const frame of art.scenery.chests){anchorScenery(frame,chestHeight);frame.pixelated=true;}
    const intactPot=art.scenery.decor[10],brokenPot=decodeSprite(images[21],0,0,1,1,'prop');
    // Match the debris footprint to its pot, not the much wider source canvas.
    const potBounds=spriteBounds(intactPot),brokenBounds=spriteBounds(brokenPot);
    const brokenScale=brokenBounds.width/(potBounds.width/potBounds.height*1.28);
    anchorScenery(brokenPot,brokenScale);intactPot.pixelated=brokenPot.pixelated=true;
    brokenPot.centerAnchor=(brokenBounds.left+brokenBounds.right+1)/(2*brokenPot.width);
    art.scenery.pots=[intactPot,intactPot,brokenPot];
    decodeDoors(images[23]);
    const glass=offscreen(32,32),glassG=glass.getContext('2d');glassG.imageSmoothingEnabled=false;
    glassG.drawImage(images[24],0,0,32,32);art.glass=new Uint32Array(glassG.getImageData(0,0,32,32).data.buffer);
    art.glassTint=Uint32Array.from(art.glass,sample=>{
      const alpha=sample>>>24,a=Math.round((.035+(alpha>32?alpha/255*.46:0))*255);
      return (a<<24)|(alpha>32?sample&0xffffff:0xe0cf8f);
    });
    glassG.clearRect(0,0,32,32);glassG.drawImage(images[25],0,0,32,32);
    art.glassBrokenTint=Uint32Array.from(new Uint32Array(glassG.getImageData(0,0,32,32).data.buffer),sample=>{
      const alpha=sample>>>24;
      // The opening has no tint; only the remaining glass catches light.
      return alpha<8?0:(Math.round(alpha*.72)<<24)|(sample&0xffffff);
    });
    art.shots.rock=art.scenery.decor[6];
    const arrow=offscreen(96,24),ag=arrow.getContext('2d');ag.fillStyle='#866443';ag.fillRect(7,10,73,4);ag.fillStyle='#dad6c0';ag.beginPath();ag.moveTo(94,12);ag.lineTo(77,4);ag.lineTo(77,20);ag.closePath();ag.fill();ag.fillStyle='#e6ded0';ag.fillRect(4,5,13,4);ag.fillRect(4,16,13,4);art.shots.arrow=arrow;
    art.tnt=offscreen(128,128);const g=art.tnt.getContext('2d');
    g.fillStyle='#b83224';g.fillRect(0,0,128,128);
    for(let x=0;x<128;x+=16){g.fillStyle=x%32?'#da4930':'#a4261f';g.fillRect(x+2,2,11,124);g.fillStyle='#ee6941';g.fillRect(x+3,3,3,25);}
    g.fillStyle='#ece3c6';g.fillRect(0,43,128,42);g.fillStyle='#342b27';g.font='40px "Blockcraft UI",monospace';g.textAlign='center';g.fillText('TNT',64,76);g.strokeStyle='#61281d';g.lineWidth=5;g.strokeRect(1,1,126,126);
    art.tntTop=offscreen(128,128);const tg=art.tntTop.getContext('2d');tg.fillStyle='#a53a28';tg.fillRect(0,0,128,128);for(let y=5;y<123;y+=24)for(let x=5;x<123;x+=24){tg.fillStyle='#d65b36';tg.fillRect(x,y,18,18);tg.fillStyle='#753024';tg.fillRect(x+5,y+5,8,8);}tg.fillStyle='#30271f';tg.fillRect(57,47,14,34);
  }
  async function loadAssets(){
    const paths=['enemies-basic.png','enemies-advanced.png','glock18.png','desert-eagle.png','mp5.png','xm1014.png','ak47.png','m249.png','textures-indoor.png','textures-outdoor.png','props-block.png','sky-block.png','props-minecraft.png','glock18-firing.png','desert-eagle-firing.png','mp5-firing.png','xm1014-firing.png','ak47-firing.png','m249-firing.png','chests-minecraft.png','m249-reload-fixed.png','flower-pot-broken.png','skeleton-skull.png','doors-minecraft.png','glass-minecraft.png','glass-broken-minecraft.png'].map(p=>'assets/'+p);let complete=0;
    try{
      const images=await Promise.all(paths.map(src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{complete++;const p=Math.round(complete/paths.length*85);$('startLabel').textContent=`LOADING ${p}%`;$('loadProgress').style.width=p+'%';resolve(img);};img.onerror=()=>reject(new Error('Could not load '+src));img.src=src;})));
      if(document.fonts)await document.fonts.load('16px "Blockcraft UI"');
      await new Promise(resolve=>requestAnimationFrame(resolve));
      prepareAssets(images);prepareBuyMenu();state.ready=true;state.phase='menu';$('start').disabled=false;$('startLabel').textContent='START GAME';$('loadProgress').style.width='100%';$('loadTrack').style.visibility='hidden';
      // Keep the menu camera on the generated sector's safe insertion point.
      Object.assign(world.player,world.start);state.needsRender=true;
      $('start').focus({preventScroll:true});updateHud();requestAnimationFrame(loop);
    }catch(error){state.phase='error';$('start').disabled=false;$('startLabel').textContent='RETRY LOADING';$('menuText').textContent='The game could not load. Check your connection and retry.';console.error(error);}
  }

  function prepareSceneryContacts(){
    contactSource=world.scenery;contactTiles=[];
    for(const prop of world.scenery){
      if(prop.kind==='tnt'&&prop.state===2)continue;
      const image=prop.kind==='flowerpot'?art.scenery.pots[prop.state]:prop.kind==='decor'?art.scenery.decor[prop.variant]:prop.kind==='chest'?art.scenery.chests[prop.state]:null;
      const radius=clamp(prop.kind==='tnt'?.42:prop.height*(image?.footprint??1)*.38,.10,.65);
      for(let y=Math.max(0,Math.floor(prop.y-radius));y<=Math.min(MH-1,Math.floor(prop.y+radius));y++)for(let x=Math.max(0,Math.floor(prop.x-radius));x<=Math.min(MW-1,Math.floor(prop.x+radius));x++){
        const tile=contactTiles[y*MW+x]??=new Float32Array(256);
        for(let py=0;py<16;py++)for(let px=0;px<16;px++){
          const d=((x+(px+.5)/16-prop.x)**2+(y+(py+.5)/16-prop.y)**2)/(radius*radius);
          if(d<1)tile[py*16+px]=Math.max(tile[py*16+px],.40*(1-d)**2);
        }
      }
    }
  }
  function renderWorld(){
    const sceneryState=world.scenery.reduce((n,p)=>n+p.state,0);
    if(contactSource!==world.scenery||contactState!==sceneryState){prepareSceneryContacts();contactState=sceneryState;}
    const p=world.player,cs=Math.cos(p.angle),sn=Math.sin(p.angle),planeX=-sn*.72,planeY=cs*.72;
    const leftX=cs-planeX,leftY=sn-planeY;
    const recoil=world.shotTime<.09?(1-world.shotTime/.09)*WEAPONS[world.weapon].kick*.18:0;
    horizon=H*.5+Math.sin(state.bob*1.8)*world.moving*.65+recoil;
    const shake=world.damageFlash>0?Math.sin(world.time*120)*world.damageFlash*3:0;horizon+=shake;
    // A panoramic sky turns with the camera; openings are resolved at the
    // ceiling plane so indoor rooms and open courtyards share the same view.
    const sky=art.skies[world.levelIndex];
    upperDepth.fill(Infinity);spriteDepth.fill(Infinity);hasGlass=false;
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
        const tile=!floor?base:ground===1?4:ground===5?10:ground===4?(world.levelIndex===1?8:1):outdoor?world.level.ground:base;
        let tx=((wx*size)|0)&mask,ty=((wy*size)|0)&mask;
        if(tile===4){tx=(tx+Math.floor(world.time*size/64))&mask;ty=(ty+Math.floor(world.time*size/128))&mask;}
        let color=art.textures[tile].mips[lod].shades[floor&&outdoor?outdoorShade:shade][ty*size+tx];const tint=world.level.tint;
        if(tint&&tile!==4){const r=color&255,g=(color>>>8)&255,b=(color>>>16)&255;color=0xff000000|(Math.min(255,b*tint[2])<<16)|(Math.min(255,g*tint[1])<<8)|Math.min(255,r*tint[0]);}
        // Every scenic prop has a contact shadow on the actual floor plane.
        const contact=floor&&inside?contactTiles[index]:null;
        if(contact){const k=1-contact[Math.min(15,Math.floor((wy-my)*16))*16+Math.min(15,Math.floor((wx-mx)*16))];color=0xff000000|(((color>>>16&255)*k)<<16)|(((color>>>8&255)*k)<<8)|((color&255)*k);}
        // Recessed ceiling lamps repeat at intersections on the room grid.
        if(!floor&&distance<14&&mx%4===0&&my%4===0&&tx>size*.273&&tx<size*.727&&ty>size*.398&&ty<size*.602)color=0xffb1daef;
        pixels[y*W+x]=color;
      }
    }
    for(let x=0;x<W;x++){
      const cameraX=2*x/W-1,rayX=cs+planeX*cameraX,rayY=sn+planeY*cameraX;
      const headers=columnHeaders[x];headers.length=0;
      const glazing=columnGlass[x];glazing.length=0;
      const hit=world.wallRay(p.x,p.y,rayX,rayY,Math.max(MW,MH)*1.5,headers,glazing),dist=hit.distance;zBuffer[x]=dist;
      if(glazing.length){hasGlass=true;for(const pane of glazing){pane.screenTop=horizon+(.62-pane.top)*projection/pane.distance;pane.screenBottom=horizon+(.62-pane.bottom)*projection/pane.distance;}}
      let texture=hit.cell===2?3:hit.cell===3?5:0;if(hit.cell===4)texture=3;else if(texture===0||hit.cell===3)texture=world.level.indoorTexture;
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
      const leaf=world.doorRay(p.x,p.y,rayX,rayY,dist);columnDoors[x]=null;
      if(leaf){
        const height=leaf.height*projection/leaf.distance,top=horizon+(.62-leaf.height)*projection/leaf.distance,bottom=top+height;
        columnDoors[x]={distance:leaf.distance,screenTop:top,screenBottom:bottom};
        const light=(leaf.edge?.60:.95)/(1+leaf.distance*.065);
        const shade=clamp(Math.floor((light-.19)/.99*23),0,23);
        const mip=art.doors[leaf.door.material].mips[clamp(Math.floor(Math.log2(128/height)),0,5)];
        const tx=clamp(Math.floor((leaf.edge?.03:leaf.u)*mip.width),0,mip.width-1),tex=mip.shades[shade];
        for(let y=Math.max(0,Math.floor(top));y<=Math.min(H-1,Math.ceil(bottom));y++){
          const index=y*W+x;if(leaf.distance>upperDepth[index]+.02)continue;
          const ty=clamp(Math.floor((y-top)/height*mip.height),0,mip.height-1);
          pixels[index]=tex[ty*mip.width+tx];upperDepth[index]=leaf.distance;
        }
      }
      // Door lintels and window sills/heads use continuous building textures.
      for(let i=headers.length-1;i>=0;i--){
        const beam=headers[i],top=horizon+(.62-beam.height)*projection/beam.distance;
        const bottom=horizon+(.62-beam.bottom)*projection/beam.distance;
        beam.screenBottom=bottom;beam.screenTop=top;
        const shade=clamp(Math.floor(((beam.outside?1.17:1.08)/(1+beam.distance*(beam.outside?.055:.080))*(beam.side?.77:1)-.19)/.99*23),0,23);
        const fullHeight=beam.fullHeight??beam.height,wallHeight=fullHeight*projection/beam.distance;
        const textureTop=horizon+(.62-fullHeight)*projection/beam.distance;
        const mip=art.textures[beam.texture].mips[clamp(Math.floor(Math.log2(TEX_SIZE/wallHeight)),0,5)],tex=mip.shades[shade];
        const tx=clamp(Math.floor(beam.u*mip.size),0,mip.mask);
        for(let y=Math.max(0,Math.floor(top));y<=Math.min(H-1,Math.ceil(bottom));y++){
          const index=y*W+x;if(beam.distance>upperDepth[index]+.02)continue;
          const ty=clamp(Math.floor((y-textureTop)/wallHeight*mip.size),0,mip.mask);
          pixels[index]=tex[ty*mip.size+tx];upperDepth[index]=beam.distance;
        }
      }
    }
    sceneCtx.putImageData(buffer,0,0);ctx.drawImage(sceneCanvas,0,0,W,H);
    const sprites=[];
    for(const e of world.enemies){
      const image=art.enemies[e.type][e.frame];
      if(e.type===2&&e.detonated&&e.death>.32)continue;
      sprites.push({x:e.x,y:e.y,z:0,height:TYPES[e.type].height*image.worldScale,image,groundAnchor:image.groundAnchor,corpse:e.hp<=0,flash:e.type===2&&e.attack>=0&&Math.floor(e.attack*13)%2===1});
    }
    for(const prop of world.scenery){
      if(prop.kind==='tnt'){if(prop.state!==2)sprites.push({x:prop.x,y:prop.y,tnt:prop});continue;}
      const image=prop.kind==='flowerpot'?art.scenery.pots[prop.state]:prop.kind==='chest'?art.scenery.chests[prop.state]:art.scenery.decor[prop.variant];sprites.push({x:prop.x,y:prop.y,z:-image.groundInset,height:prop.height*image.worldScale,image,groundAnchor:image.groundAnchor});
    }
    for(const item of world.pickups)if(!item.taken){const image=art.props[item.kind];sprites.push({x:item.x,y:item.y,z:.025+Math.sin(world.time*2.4+item.id)*.025,height:.32,image,groundAnchor:image.groundAnchor});}
    for(const shot of world.projectiles){const image=art.shots[shot.kind];if(!image)continue;sprites.push({x:shot.x,y:shot.y,z:shot.z??.62,height:shot.kind==='rock'?.23:.085,image,groundAnchor:.5});}
    for(let i=bursts.length-1;i>=0;i--){const b=bursts[i],age=world.time-b.time;if(age>.38){bursts.splice(i,1);continue;}sprites.push({x:b.x,y:b.y,z:.08,height:(.9+age*1.6)*(b.scale??1),image:art.props.explosion,alpha:1-age/.38});}
    if(world.kills===world.enemies.length)sprites.push({x:world.exit.x,y:world.exit.y,z:0,height:1.42,image:art.props.exit});
    for(const s of sprites){s.depth=(s.x-p.x)*cs+(s.y-p.y)*sn;s.lateral=-(s.x-p.x)*sn+(s.y-p.y)*cs;}
    sprites.sort((a,b)=>b.depth-a.depth);
    for(const s of sprites){
      if(s.depth<.13||s.depth>28)continue;
      if(s.tnt){renderTNT(s.tnt);continue;}
      const dh=s.height*projection/s.depth,dw=dh*s.image.width/s.image.height,left=W*.5+s.lateral*projection/s.depth-dw*(s.image.centerAnchor??.5),top=horizon+(.62-s.z)*projection/s.depth-dh*(s.groundAnchor??s.image.groundAnchor??1);
      if(left>W||left+dw<0)continue;
      ctx.imageSmoothingEnabled=!s.image.pixelated;ctx.globalAlpha=s.alpha??1;drawOccluded(s.image,left,top,dw,dh,s.depth);if(s.flash){ctx.globalAlpha=.28;drawOccluded(s.image,left-1,top-1,dw+2,dh+2,s.depth);}ctx.globalAlpha=1;
    }
    ctx.imageSmoothingEnabled=true;
    for(const v of world.particles){
      const dx=v.x-p.x,dy=v.y-p.y,depth=dx*cs+dy*sn;if(depth<.15)continue;
      const x=W*.5+(-dx*sn+dy*cs)*projection/depth,y=horizon+(.62-v.z)*projection/depth;
      if(x<0||x>=W||depth>zBuffer[x|0]||(y>=0&&y<H&&depth>upperDepth[(y|0)*W+(x|0)]))continue;
      ctx.fillStyle=v.kind==='clay'?'#bb6841':v.kind==='glass'?'#b8edf3':v.kind==='wood'?'#ab743c':v.kind==='spark'?'#fff1a0':'#ec9539';ctx.globalAlpha=clamp(v.life*3,0,1);const size=Math.max(1,projection/depth*(v.kind==='clay'?.026:v.kind==='glass'?.022:v.kind==='wood'?.025:.012));ctx.fillRect(x|0,y|0,size,size);ctx.globalAlpha=1;
      if(hasGlass)for(let py=Math.max(0,y|0);py<Math.min(H,(y|0)+size);py++)for(let px=Math.max(0,x|0);px<Math.min(W,(x|0)+size);px++)spriteDepth[py*W+px]=Math.min(spriteDepth[py*W+px],depth);
    }
    if(hasGlass)renderGlass();
    renderWeapon();
    if(world.damageFlash>0){ctx.fillStyle=`rgba(182,30,12,${world.damageFlash*.7})`;ctx.fillRect(0,0,W,H);}
    if(world.pickupFlash>0){ctx.fillStyle=`rgba(205,200,72,${world.pickupFlash*.3})`;ctx.fillRect(0,0,W,H);}
    if(state.map)renderMap();
  }
  function drawOccluded(image,left,top,width,height,depth){
    const start=Math.max(0,Math.floor(left)),end=Math.min(W,Math.ceil(left+width));let run=-1,runTop=top,runBottom=top+height;
    for(let x=start;x<=end;x++){
      let visible=x<end&&depth<zBuffer[x];
      let clippedTop=top,clippedBottom=top+height;
      if(visible)for(const beam of columnHeaders[x])if(depth>beam.distance){
        if(beam.sill)clippedBottom=Math.min(clippedBottom,Math.floor(beam.screenTop));
        else clippedTop=Math.max(clippedTop,Math.ceil(beam.screenBottom));
      }
      const door=visible?columnDoors[x]:null;
      if(door&&depth>door.distance)clippedBottom=Math.min(clippedBottom,Math.floor(door.screenTop));
      visible=visible&&clippedBottom>clippedTop;
      if(run>=0&&(!visible||clippedTop!==runTop||clippedBottom!==runBottom)){
        const sx=clamp((run-left)/width*image.width,0,image.width),sw=Math.min(image.width-sx,(x-run)/width*image.width);
        const sy=clamp((runTop-top)/height*image.height,0,image.height),sh=clamp((runBottom-runTop)/height*image.height,0,image.height-sy);
        if(sw>0&&sh>0)ctx.drawImage(image,sx,sy,sw,sh,run,runTop,x-run,height*(sh/image.height));run=-1;
      }
      if(visible&&run<0){run=x;runTop=clippedTop;runBottom=clippedBottom;}
    }
    if(hasGlass&&ctx.globalAlpha>.95)trackSpriteDepth(image,left,top,width,height,depth);
  }
  function trackSpriteDepth(image,left,top,width,height,depth){
    // Only pixels in front of visible glass need a sprite mask. This prevents
    // distant reflections from being painted over a nearby mob or decoration.
    for(let x=Math.max(0,Math.floor(left));x<Math.min(W,Math.ceil(left+width));x++){
      const panes=columnGlass[x];if(!panes.length||depth>=panes[panes.length-1].distance||depth>=zBuffer[x])continue;
      if(!image.depthAlpha){
        const data=image.getContext('2d').getImageData(0,0,image.width,image.height).data;
        image.depthAlpha=new Uint8Array(image.width*image.height);for(let i=0;i<image.depthAlpha.length;i++)image.depthAlpha[i]=data[i*4+3];
      }
      const sx=clamp(Math.floor((x+.5-left)/width*image.width),0,image.width-1);
      for(let y=Math.max(0,Math.floor(top));y<Math.min(H,Math.ceil(top+height));y++){
        const index=y*W+x;if(depth>upperDepth[index]||depth>=spriteDepth[index])continue;
        const sy=clamp(Math.floor((y+.5-top)/height*image.height),0,image.height-1);
        if(image.depthAlpha[sy*image.width+sx]>128)spriteDepth[index]=depth;
      }
    }
  }
  function renderGlass(){
    glassPixels.fill(0);
    for(let x=0;x<W;x++){
      const panes=columnGlass[x];
      // Blend from the farthest pane forward so views through two buildings work.
      for(let p=panes.length-1;p>=0;p--){
        const pane=panes[p],height=pane.screenBottom-pane.screenTop;
        const tx=clamp(Math.floor((pane.u-Math.floor(pane.u))*32),0,31),texture=pane.broken?art.glassBrokenTint:art.glassTint;
        for(let y=Math.max(0,Math.ceil(pane.screenTop));y<Math.min(H,Math.ceil(pane.screenBottom));y++){
          const index=y*W+x;if(pane.distance>=zBuffer[x]||pane.distance>upperDepth[index]+.01||pane.distance>spriteDepth[index])continue;
          const ty=clamp(Math.floor((y-pane.screenTop)/height*32),0,31),sample=texture[ty*32+tx],old=glassPixels[index];
          if(!(sample>>>24))continue;
          // Most pixels see one pane: its color and opacity are cached already.
          if(!old){glassPixels[index]=sample;continue;}
          const a=sample>>>24,keep=(old>>>24)*(255-a)/255,combined=a+keep;
          glassPixels[index]=(Math.round(combined)<<24)|(Math.round(((sample>>>16&255)*a+(old>>>16&255)*keep)/combined)<<16)|(Math.round(((sample>>>8&255)*a+(old>>>8&255)*keep)/combined)<<8)|Math.round(((sample&255)*a+(old&255)*keep)/combined);
        }
      }
    }
    glassCtx.putImageData(glassBuffer,0,0);ctx.imageSmoothingEnabled=false;ctx.drawImage(glassCanvas,0,0,W,H);ctx.imageSmoothingEnabled=true;
  }
  function renderWeapon(){
    if(state.map)return;const frame=world.weaponFrame(),fireFrame=state.phase==='playing'?world.weaponFireFrame():-1;
    const image=fireFrame>=0?art.firing[world.weapon][fireFrame]:art.weapons[world.weapon][frame],weapon=WEAPONS[world.weapon];
    const moving=state.phase==='playing'?world.moving:0;
    const idle=Math.sin(world.time*1.8)*.7,bobX=Math.sin(state.bob)*moving*3,bobY=Math.abs(Math.cos(state.bob))*moving*2;
    const placement=CounterAnimation.weaponPlacement(art.weapons[world.weapon][0],image,world.weapon,W,H);
    const {width,height}=placement;
    const kick=world.shotTime<.15?Math.sin(Math.min(1,world.shotTime/.15)*Math.PI)*weapon.kick:0;
    const drop=world.switchTime>0?Math.sin(world.switchTime/.22*Math.PI)*height*.5:0;
    const left=placement.left+bobX,top=placement.top+Math.max(0,idle+bobY)+drop-kick;
    ctx.drawImage(image,left,top,width,height);
    for(let i=casings.length-1;i>=0;i--){const c=casings[i],age=world.time-c.time;if(age>.55){casings.splice(i,1);continue;}const x=W*(.58+age*.42),y=H*(.71-age*.6+age*age*1.5);ctx.save();ctx.translate(x,y);ctx.rotate(age*15+c.spin);ctx.fillStyle=c.shell?'#ba3924':'#d4ab57';ctx.fillRect(-3,-1.5,c.shell?8:6,3);ctx.fillStyle='#f5d89b';ctx.fillRect(-3,-1.5,2,3);ctx.restore();}
  }
  function renderTNT(prop){
    const p=world.player,cs=Math.cos(p.angle),sn=Math.sin(p.angle),r=.28,h=.58;
    const minX=prop.x-r,maxX=prop.x+r,minY=prop.y-r,maxY=prop.y+r;
    const vertices=[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY]].map(([x,y])=>{const dx=x-p.x,dy=y-p.y,d=dx*cs+dy*sn;return{x:W*.5+(-dx*sn+dy*cs)*projection/d,d};});
    if(vertices.some(v=>v.d<.05))return;
    const left=Math.max(0,Math.floor(Math.min(...vertices.map(v=>v.x)))),right=Math.min(W,Math.ceil(Math.max(...vertices.map(v=>v.x))));
    const near=Math.min(...vertices.map(v=>v.d)),far=Math.max(...vertices.map(v=>v.d));
    const top=Math.max(0,Math.floor(horizon+(.62-h)*projection/far)),bottom=Math.min(H,Math.ceil(horizon+.62*projection/near));
    const width=right-left,height=bottom-top;if(width<=0||height<=0)return;
    if(!art.tntPixels){art.tntPixels=new Uint32Array(art.tnt.getContext('2d').getImageData(0,0,128,128).data.buffer);art.tntTopPixels=new Uint32Array(art.tntTop.getContext('2d').getImageData(0,0,128,128).data.buffer);}
    let cache=prop.renderCache;if(!cache||cache.width!==width||cache.height!==height){const c=offscreen(width,height),g=c.getContext('2d'),buffer=g.createImageData(width,height);cache=prop.renderCache={c,g,buffer,width,height,pixels:new Uint32Array(buffer.data.buffer)};}else cache.pixels.fill(0);
    const flash=prop.state===1&&Math.floor(world.time*16)%2===1;
    for(let x=left;x<right;x++){
      const cameraX=2*(x+.5)/W-1,rx=cs-sn*.72*cameraX,ry=sn+cs*.72*cameraX;
      const ax=(minX-p.x)/(rx||1e-12),bx=(maxX-p.x)/(rx||1e-12),ay=(minY-p.y)/(ry||1e-12),by=(maxY-p.y)/(ry||1e-12);
      const tx=Math.min(ax,bx),ty=Math.min(ay,by),entry=Math.max(tx,ty),exit=Math.min(Math.max(ax,bx),Math.max(ay,by));
      if(entry<.05||entry>exit||entry>zBuffer[x])continue;
      const axis=tx>ty?0:1,hitX=p.x+entry*rx,hitY=p.y+entry*ry;
      let u=axis===0?(hitY-minY)/(2*r):(hitX-minX)/(2*r);if(axis===0&&rx<0||axis===1&&ry>0)u=1-u;
      const textureX=clamp(Math.floor(u*128),0,127),sideTop=horizon+(.62-h)*projection/entry,sideBottom=horizon+.62*projection/entry;
      const y0=Math.max(top,Math.floor(horizon+(.62-h)*projection/exit)),y1=Math.min(bottom,Math.ceil(sideBottom));
      for(let y=y0;y<y1;y++){
        let color,depth=entry,light=(axis===0?.94:.77)/(1+entry*.022);
        if(y+.5<sideTop){depth=(.62-h)*projection/(y+.5-horizon);const wx=p.x+rx*depth,wy=p.y+ry*depth;if(depth<entry||depth>exit)continue;const xx=clamp(Math.floor((wx-minX)/(2*r)*128),0,127),yy=clamp(Math.floor((wy-minY)/(2*r)*128),0,127);color=art.tntTopPixels[yy*128+xx];light=1/(1+depth*.018);}
        else{const yy=clamp(Math.floor((y+.5-sideTop)/(sideBottom-sideTop)*128),0,127);color=art.tntPixels[yy*128+textureX];}
        if(depth>zBuffer[x]||depth>upperDepth[y*W+x])continue;
        const rr=color&255,gg=color>>>8&255,bb=color>>>16&255;
        cache.pixels[(y-top)*width+x-left]=0xff000000|((flash?(bb*.28+175):bb*light)<<16)|((flash?(gg*.28+175):gg*light)<<8)|(flash?(rr*.28+175):rr*light);
        if(hasGlass)spriteDepth[y*W+x]=Math.min(spriteDepth[y*W+x],depth);
      }
    }
    cache.g.putImageData(cache.buffer,0,0);ctx.drawImage(cache.c,left,top);
  }
  function renderMap(){
    ctx.fillStyle='#211a14ed';ctx.fillRect(0,0,W,H);
    const size=Math.max(1,Math.min((W-32)/MW,(H-56)/MH)),ox=(W-MW*size)/2,oy=(H-MH*size)/2;
    for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){
      const i=y*MW+x;if(world.walls[i]){ctx.fillStyle=world.wallTextures[i]<255?'#5e5446':'#374131';}else ctx.fillStyle=world.floors[i]===1?'#376329':world.ceilings[i]?'#111b11':world.floors[i]===5?'#ac8841':world.floors[i]===4?'#52616a':'#263d48';ctx.fillRect(ox+x*size,oy+y*size,size-.7,size-.7);
      ctx.fillStyle='#889184';if(world.edgeX[i]===1)ctx.fillRect(ox+x*size-.5,oy+y*size,1,size);if(world.edgeY[i]===1)ctx.fillRect(ox+x*size,oy+y*size-.5,size,1);
    }
    ctx.strokeStyle='#e7bb63';ctx.lineWidth=1.5;
    for(const d of world.doors){ctx.strokeStyle=d.open>.9?'#a4ed83':'#e7bb63';for(const panel of d.panels){ctx.beginPath();ctx.moveTo(ox+panel.x*size,oy+panel.y*size);ctx.lineTo(ox+(panel.x+panel.ux*panel.length)*size,oy+(panel.y+panel.uy*panel.length)*size);ctx.stroke();}}
    ctx.strokeStyle='#a1d9e3';ctx.lineWidth=1;
    for(const window of world.windows)for(let pane=0;pane<window.panes;pane++){
      const lo=window.lo+(window.hi-window.lo)*pane/window.panes,hi=window.lo+(window.hi-window.lo)*(pane+1)/window.panes;
      ctx.strokeStyle=window.broken&(1<<pane)?'#586e71':'#a1d9e3';ctx.beginPath();
      if(window.axis){ctx.moveTo(ox+lo*size,oy+window.at*size);ctx.lineTo(ox+hi*size,oy+window.at*size);}else{ctx.moveTo(ox+window.at*size,oy+lo*size);ctx.lineTo(ox+window.at*size,oy+hi*size);}ctx.stroke();
    }
    if(size>=4.5){
      ctx.font='10px "Blockcraft UI",monospace';ctx.textAlign='center';
      for(const [name,x,y]of world.landmarks){const tx=ox+x*size,ty=oy+y*size;ctx.fillStyle='#071009df';ctx.fillRect(tx-ctx.measureText(name).width/2-2,ty-7,ctx.measureText(name).width+4,9);ctx.fillStyle='#bad0cc';ctx.fillText(name,tx,ty);}
      ctx.textAlign='start';
    }
    for(const prop of world.scenery)if(prop.kind==='tnt'&&prop.state!==2){ctx.strokeStyle='#d86443';ctx.lineWidth=1;ctx.strokeRect(ox+prop.x*size-1.5,oy+prop.y*size-1.5,3,3);}
    for(const p of world.pickups)if(!p.taken){ctx.fillStyle=p.kind==='health'?'#ed7252':'#6cb6b1';ctx.fillRect(ox+p.x*size-1,oy+p.y*size-1,2,2);}
    // Keep the bright centers visible above supplies and neighboring pulse rings.
    const hostiles=world.enemies.filter(e=>e.hp>0),pulse=(Math.sin(world.time*4.8)+1)/2;
    const marker=clamp(size*.35,2.4,3.2)+pulse*.5,halo=marker+2+pulse*2.5;
    ctx.save();ctx.strokeStyle='#ff574b';ctx.lineWidth=1.2;ctx.globalAlpha=.42-pulse*.18;
    for(const e of hostiles)ctx.strokeRect(ox+e.x*size-halo,oy+e.y*size-halo,halo*2,halo*2);
    ctx.globalAlpha=1;
    for(const e of hostiles){
      const x=ox+e.x*size,y=oy+e.y*size;
      ctx.fillStyle='#1b0705';ctx.fillRect(x-marker-1,y-marker-1,marker*2+2,marker*2+2);
      ctx.fillStyle='#ff574b';ctx.fillRect(x-marker,y-marker,marker*2,marker*2);
      ctx.fillStyle='#fff0d5';ctx.fillRect(x-1,y-1,2,2);
    }
    ctx.restore();
    const guide=world.extractionGuide();
    if(guide){ctx.strokeStyle='#a4ed83';ctx.lineWidth=1.5;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(ox+world.player.x*size,oy+world.player.y*size);for(const point of guide.route)ctx.lineTo(ox+point.x*size,oy+point.y*size);ctx.stroke();ctx.setLineDash([]);}
    ctx.fillStyle='#a4ed83';ctx.fillRect(ox+world.exit.x*size-2,oy+world.exit.y*size-2,4,4);
    const p=world.player;ctx.save();ctx.translate(ox+p.x*size,oy+p.y*size);ctx.rotate(p.angle);ctx.fillStyle='#ffeac0';ctx.beginPath();ctx.moveTo(5,0);ctx.lineTo(-3,-3);ctx.lineTo(-1,0);ctx.lineTo(-3,3);ctx.closePath();ctx.fill();ctx.restore();
    ctx.fillStyle='#ffff55';ctx.font='12px "Blockcraft UI",monospace';ctx.textAlign='center';ctx.fillText(world.level.name+' MAP  ·  M TO CLOSE',W/2,oy-10);ctx.fillStyle='#ded7c9';ctx.font='10px "Blockcraft UI",monospace';ctx.fillText('BLUE: OUTDOORS  ·  RED: HOSTILES  ·  GREEN: EXIT',W/2,oy+MH*size+14);ctx.textAlign='start';
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
      case'fire':{
        const low=[165,100,200,80,115,100][e.weapon],duration=[.11,.23,.075,.29,.13,.10][e.weapon];
        this.hiss(duration,e.weapon===3?.85:e.weapon===1?.72:.40,[2400,1700,2400,1400,1900,1800][e.weapon]);
        this.tone(low,duration,e.weapon===3?.7:.38,'triangle',35);break;}
      case'breakOpen':this.hiss(.09,.24,2400);this.tone(320,.07,.10,'square',130);break;
      case'shellEject':this.hiss(.045,.12,3400);this.tone(700,.065,.08,'triangle',300);break;
      case'shellLoad':this.hiss(.10,.2,1100);this.tone(220,.08,.10,'square',85);break;
      case'breakClose':this.hiss(.08,.3,1800);this.tone(150,.08,.17,'triangle',65);break;
      case'explosion':this.hiss(.65,.8,700);this.tone(65,.6,.75,'triangle',20);break;
      case'tntIgnite':this.hiss(.16,.2,1700);break;
      case'chestHit':this.hiss(.075,.2,1400);this.tone(180,.08,.13,'triangle',65);break;
      case'chestBreak':this.hiss(.28,.35,2600);this.tone(130,.16,.18,'square',35);break;
      case'potBreak':this.hiss(.15,.24,3700);this.tone(740,.09,.11,'triangle',210);this.tone(430,.16,.07,'triangle',140);break;
      case'glassBreak':this.hiss(.24,.26,7200);this.tone(2600,.11,.10,'triangle',1250);this.tone(3800,.18,.06,'sine',1900);break;
      case'door':this.hiss(e.metal?.18:.12,.14,e.metal?1800:550);this.tone(e.open?180:115,.18,.09,'triangle',e.open?95:55);break;
      case'kill':this.tone(e.typeId===1?85:140,.32,.17,'sawtooth',35);break;
      case'hit':this.hiss(.075,.17,850);break;
      case'damage':this.hiss(.13,.25,450);this.tone(80,.14,.24,'triangle',30);break;
      case'pickup':this.tone(600,.12,.15,'sine',1000);break;
      case'purchase':this.tone(660,.2,.18,'square',1100);break;
      case'switch':case'reload':case'reloadStep':case'loaded':this.hiss(.065,.14,1500);break;
      case'empty':this.hiss(.03,.14,2000);break;
      case'enemyFire':if(e.near){this.hiss(.11,.12,650);this.tone(190,.11,.10,'triangle',65);}break;
      case'step':this.hiss(.045,.05,220);break;
      case'won':this.tone(330,.3,.2,'sine',660);break;
    }}
  };
  function showMessage(text,time=2){$('message').textContent=text;$('message').style.opacity='1';state.message=time;}
  function processEvents(){
    let earned=0;
    for(const e of world.events){sound.event(e);
      if(e.type==='fire')casings.push({time:world.time,spin:world.shots,shell:e.weapon===3});
      if(e.type==='explosion')bursts.push({x:e.x,y:e.y,time:world.time,scale:e.scale??1});
      if(e.type==='pickup')showMessage(e.kind==='health'?'+35 HEALTH':e.kind==='armor'?'+35 ARMOR':'AMMUNITION REPLENISHED',1.5);
      if(e.type==='chestBreak')showMessage('CHEST BROKEN · '+e.kind.toUpperCase()+' DROPPED',1.8);
      if(e.type==='kill')earned+=e.cash;
      if(e.type==='locked')showMessage('BUY '+WEAPONS[e.weapon].name+' FOR '+money(WEAPONS[e.weapon].price)+' · '+(coarse()?'TAP BUY':'PRESS B'),2.5);
      if(e.type==='cleared'){showMessage(world.level.name+' CLEAR · REACH THE EXTRACTION PORTAL',5);$('objective').textContent='REACH THE EXTRACTION PORTAL';}
      if(e.type==='toxic')showMessage('TOXIC FLOOR — KEEP MOVING',1.2);
      if(e.type==='dead'){state.deathDelay=.75;clearInput();releaseLock();}
      if(e.type==='won')finish(true);
    }world.events.length=0;
    if(earned){state.cashGainTotal=(state.cashGain>0?state.cashGainTotal:0)+earned;state.cashGain=1.8;$('cashGain').textContent='+'+money(state.cashGainTotal);$('cashGain').style.opacity='1';}
  }
  const lastHud={};
  function hudText(key,value){if(lastHud[key]!==value){allHud[key].textContent=value;lastHud[key]=value;}}
  function updateHud(){
    const door=state.phase==='playing'&&!world.dead?world.nearbyDoor():null;
    $('doorAction').hidden=!door;
    if(door){const label=(door.target?'CLOSE':'OPEN')+' DOOR';$('doorAction').textContent=(coarse()?'TAP':'E')+' · '+label;$('doorAction').setAttribute('aria-label',label);}
    const ammoSlot=WEAPONS[world.weapon].ammoSlot??world.weapon;
    hudText('health',Math.ceil(world.player.health));hudText('armor',Math.ceil(world.player.armor));hudText('ammo',world.ammo[ammoSlot]);hudText('ammoReserve','/ '+(Number.isFinite(world.reserves[world.weapon])?world.reserves[world.weapon]:'∞'));
    hudText('remaining',world.enemies.length-world.kills);hudText('killCounter',`${world.kills} / ${world.enemies.length}`);
    hudText('cash',money(world.cash));
    hudText('timer',formatTime(world.time));hudText('weaponName',world.reloadTime>0?'RELOADING…':WEAPONS[world.weapon].name);hudText('weaponHint',String(world.weapon+1).padStart(2,'0')+' / '+String(WEAPONS.length).padStart(2,'0'));
    hudText('touchSwitch',(world.weapon+1)+' / '+WEAPONS.length);
    $('healthbar').style.width=world.player.health+'%';$('armorbar').style.width=world.player.armor+'%';$('ammobar').style.width=clamp(world.ammo[ammoSlot]/WEAPONS[world.weapon].cap*100,0,100)+'%';$('hitmarker').style.opacity=world.hitmarker>0?'1':'0';
    const boss=world.enemies.find(e=>e.type===5&&e.active&&e.hp>0);$('bossHud').hidden=!boss;if(boss)$('bossBar').style.width=(boss.hp/TYPES[5].hp*100)+'%';
    const guide=state.phase==='playing'?world.extractionGuide():null;$('extractionHud').hidden=!guide;
    if(guide){
      $('extractionArrow').style.transform=`rotate(${guide.angle}rad)`;
      hudText('extractionDistance',Math.ceil(guide.distance)+' M');
      hudText('extractionTurn',guide.distance<1.5?'ENTER THE PORTAL':Math.abs(guide.angle)>2.3?'TURN AROUND':guide.angle>.35?'BEAR RIGHT':guide.angle<-.35?'BEAR LEFT':'STRAIGHT AHEAD');
    }
  }
  const formatTime=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0');
  const money=value=>'$'+value.toLocaleString('en-US');
  function prepareBuyMenu(){
    WEAPONS.forEach((weapon,i)=>{
      $('buyName'+i).textContent=weapon.name;$('buyRole'+i).textContent=weapon.role;
      // Reuse the actual in-game weapon sprite as its shop icon.
      const icon=$('weaponIcon'+i),g=icon.getContext('2d'),frame=art.weapons[i][0],b=spriteBounds(frame);
      const scale=Math.min((icon.width-24)/b.width,(icon.height-12)/b.height),w=b.width*scale,h=b.height*scale;
      g.clearRect(0,0,icon.width,icon.height);g.drawImage(frame,b.left,b.top,b.width,b.height,(icon.width-w)/2,(icon.height-h)/2,w,h);
    });
  }
  function updateBuyMenu(){
    $('shopCash').textContent=money(world.cash);
    WEAPONS.forEach((weapon,i)=>{
      const owned=world.unlocked[i],equipped=owned&&world.weapon===i,affordable=world.cash>=weapon.price,button=$('buyWeapon'+i),card=$('weaponCard'+i);
      card.dataset.owned=String(owned);card.dataset.equipped=String(equipped);
      $('buyPrice'+i).textContent=owned?(i===0?'STARTER':'OWNED'):money(weapon.price);
      button.disabled=equipped||(!owned&&!affordable);
      button.textContent=equipped?'EQUIPPED':owned?'EQUIP':'BUY';
      button.title=!owned&&!affordable?'Need '+money(weapon.price-world.cash)+' more':'';
      button.setAttribute('aria-label',equipped?weapon.name+' equipped':owned?'Equip '+weapon.name:affordable?'Buy '+weapon.name+' for '+money(weapon.price):weapon.name+' costs '+money(weapon.price)+'. Need '+money(weapon.price-world.cash)+' more.');
    });
  }
  function shopInert(inert){for(const id of ['view','topbar','touchControls','overlay'])$(id).inert=inert;}
  function openBuyMenu(){
    if(!state.ready||world.dead||world.won||!['playing','paused'].includes(state.phase))return;
    state.shopReturn=state.phase;state.shopFocus=document.activeElement;state.phase='shop';clearInput();releaseLock();shopInert(true);
    document.body.classList.add('menu-active','shop-open');$('buyOverlay').hidden=false;
    $('buyStatus').textContent='Purchased weapons carry between sectors.';$('closeBuy').textContent=state.shopReturn==='paused'?'BACK TO PAUSE':'BACK TO COMBAT';
    updateBuyMenu();$('closeBuy').focus({preventScroll:true});
  }
  function closeBuyMenu(){
    if(state.phase!=='shop')return;
    $('buyOverlay').hidden=true;shopInert(false);document.body.classList.remove('shop-open');clearInput();
    state.phase=state.shopReturn;state.last=performance.now();
    if(state.phase==='playing'){
      document.body.classList.remove('menu-active');canvas.focus({preventScroll:true});sound.init();requestLock();
    }else (state.shopFocus||$('start')).focus({preventScroll:true});
  }
  function chooseShopWeapon(index){
    if(state.phase!=='shop'||!Number.isInteger(index)||!WEAPONS[index])return;
    const owned=world.unlocked[index];
    if(owned){world.setWeapon(index);$('buyStatus').textContent=WEAPONS[index].name+' EQUIPPED';}
    else if(world.buyWeapon(index)){$('buyStatus').textContent=WEAPONS[index].name+' PURCHASED · EQUIPPED';}
    else{$('buyStatus').textContent='NEED '+money(WEAPONS[index].price-world.cash)+' MORE FOR '+WEAPONS[index].name;return;}
    processEvents();updateBuyMenu();updateHud();$('closeBuy').focus({preventScroll:true});
  }
  function clearInput(){keys.clear();state.mouseDown=false;state.touchFire=false;state.stickX=0;state.stickY=0;state.dragX=null;stickPointer=null;lookPointer=null;$('stick').style.transform='';}
  function releaseLock(){if(document.pointerLockElement===canvas&&document.exitPointerLock)document.exitPointerLock();}
  async function requestLock(){
    if(coarse()||!canvas.requestPointerLock)return;
    try{await canvas.requestPointerLock();state.fallbackAim=false;}catch{if(!state.fallbackAim){state.fallbackAim=true;showMessage('DRAG TO AIM · ARROW KEYS ALSO TURN',4);}}
  }
  function begin(){
    if(state.phase==='error'){state.phase='loading';$('start').disabled=true;loadAssets();return;}
    if(!state.ready)return;
    if(state.phase==='shop')return;
    const resuming=state.phase==='paused';
    if(state.phase==='intermission'){world.advance();state.map=false;state.bob=0;}else if(!resuming){if(state.phase==='end'&&!state.endWon)world.restart();else world.newCampaign();state.map=false;state.bob=0;}
    $('menuUtility').hidden=true;
    $('sectorNumber').textContent='SECTOR 0'+(world.levelIndex+1);$('sectorName').textContent=world.level.name;$('objective').textContent=world.kills===world.enemies.length?'REACH THE EXTRACTION PORTAL':'CLEAR THE '+world.level.name;$('menuSubtitle').textContent='SECTOR 0'+(world.levelIndex+1)+' · '+world.level.tag;
    bursts.length=0;casings.length=0;clearInput();state.phase='playing';state.last=performance.now();state.deathDelay=0;document.body.classList.remove('menu-active','paused','endgame');document.body.classList.toggle('map-open',state.map);$('overlay').style.display='none';
    if(!resuming){state.cashGain=0;state.cashGainTotal=0;$('cashGain').style.opacity='0';}
    sound.init();canvas.focus({preventScroll:true});requestLock();showMessage('SECTOR 0'+(world.levelIndex+1)+' — '+world.level.name+' · '+(coarse()?'TAP BUY':'B: BUY WEAPONS'),3.5);
  }
  function pause(){
    if(state.phase!=='playing'||world.dead||world.won)return;state.phase='paused';clearInput();releaseLock();document.body.classList.add('menu-active','paused');$('overlay').style.display='flex';
    $('pauseBuy').hidden=false;$('pauseBuyDivider').hidden=false;
    $('menuPanel').querySelector('h1').innerHTML='MISSION<br><strong>PAUSED</strong>';$('menuText').textContent='Take a breath. Your mission will resume here.';$('menuUtility').hidden=false;$('startLabel').textContent='RESUME MISSION';$('start').focus({preventScroll:true});
  }
  function finish(won){
    if(state.phase==='end'||state.phase==='intermission')return;state.endWon=won;state.phase=won&&world.levelIndex<LEVELS.length-1?'intermission':'end';clearInput();releaseLock();document.body.classList.remove('paused');document.body.classList.add('menu-active','endgame');$('overlay').style.display='flex';
    $('pauseBuy').hidden=true;$('pauseBuyDivider').hidden=true;
    $('menuPanel').querySelector('h1').innerHTML=won?(state.phase==='intermission'?'SECTOR<br><strong>SECURED</strong>':'NETHER<br><strong>SEALED</strong>'):'SIGNAL<br><strong>LOST</strong>';
    $('menuText').textContent=won?(state.phase==='intermission'?`${world.level.name} clear. ${world.kills} hostiles eliminated. Next: ${LEVELS[world.levelIndex+1].name}.`:`All ${LEVELS.length} sectors secured. Time ${formatTime(world.campaignTime+world.time)}. Score ${world.campaignScore+world.score}.`):`${world.kills} / ${world.enemies.length} hostiles eliminated. Get back in there.`;
    $('startLabel').textContent=won?(state.phase==='intermission'?'ENTER '+LEVELS[world.levelIndex+1].name:'PLAY AGAIN'):'RETRY SECTOR';$('start').focus({preventScroll:true});$('menuUtility').hidden=false;
  }
  function loop(now){
    const dt=Math.min((now-(state.last||now))/1000,.04);state.last=now;
    if(state.phase==='playing'){
      if(world.dead){state.deathDelay-=dt;if(state.deathDelay<=0)finish(false);}else{
        const down=k=>keys.has(k)?1:0;
        world.update(dt,{forward:down('KeyW')+down('ArrowUp')-down('KeyS')-down('ArrowDown')-state.stickY,strafe:down('KeyD')-down('KeyA')+state.stickX,turn:down('ArrowRight')-down('ArrowLeft'),run:keys.has('ShiftLeft')||keys.has('ShiftRight'),fire:state.mouseDown||state.touchFire||keys.has('Space')});
        state.bob+=dt*world.moving*(keys.has('ShiftLeft')?14:10);processEvents();
      }
      if(state.message>0){state.message-=dt;if(state.message<=0)$('message').style.opacity='0';}
      if(state.cashGain>0){state.cashGain-=dt;if(state.cashGain<=0)$('cashGain').style.opacity='0';}
    }
    if(state.ready){if(state.phase==='playing'||state.needsRender!==false){renderWorld();state.needsRender=false;}updateHud();}
    requestAnimationFrame(loop);
  }
  $('start').addEventListener('click',begin);$('pause').addEventListener('click',pause);
  $('doorAction').addEventListener('click',()=>{if(state.phase==='playing')world.useDoor();});
  $('buyButton').addEventListener('click',openBuyMenu);$('pauseBuy').addEventListener('click',openBuyMenu);$('closeBuy').addEventListener('click',closeBuyMenu);
  WEAPONS.forEach((weapon,i)=>$('buyWeapon'+i).addEventListener('click',()=>chooseShopWeapon(i)));
  $('sound').addEventListener('click',()=>{state.muted=!state.muted;sound.init();if(sound.master)sound.master.gain.value=state.muted?0:.34;$('sound').textContent=state.muted?'SOUND OFF':'SOUND ON';$('sound').setAttribute('aria-pressed',String(!state.muted));});
  $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('game').requestFullscreen)await $('game').requestFullscreen();}catch{showMessage('FULLSCREEN IS NOT AVAILABLE HERE',2);}});
  addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(state.phase==='shop'){
      if(e.code==='Tab'){
        const buttons=[...$('buyOverlay').querySelectorAll('button:not(:disabled)')],at=buttons.indexOf(document.activeElement);
        e.preventDefault();buttons[(at+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus({preventScroll:true});
      }else if(['KeyB','Escape','KeyP'].includes(e.code)){e.preventDefault();if(!e.repeat)closeBuyMenu();}
      else if(/^Digit[1-6]$/.test(e.code)){e.preventDefault();if(!e.repeat)chooseShopWeapon(Number(e.code.slice(-1))-1);}
      else if(!['Enter','Space'].includes(e.code))e.preventDefault();
      return;
    }
    if(e.code==='KeyB'){e.preventDefault();if(!e.repeat)openBuyMenu();return;}
    // Keep menu links reachable with Tab and let Enter activate the focused link.
    if((e.code==='Enter'||e.code==='Space')&&e.target?.closest?.('button,a'))return;
    if(state.phase!=='playing'&&e.code==='Tab')return;
    const handled=['KeyW','KeyA','KeyS','KeyD','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab','KeyM','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','KeyR','Escape','KeyP','Enter'];
    if(handled.includes(e.code)&&!e.ctrlKey&&!e.metaKey)e.preventDefault();
    if(e.code==='Escape'||e.code==='KeyP'){if(state.phase==='playing')pause();else if(state.phase==='paused'&&!e.repeat)begin();return;}
    if(state.phase!=='playing'){if((e.code==='Enter'||e.code==='Space')&&!e.repeat)begin();return;}
    keys.add(e.code);if(e.repeat)return;
    if(e.code==='KeyE')world.useDoor();
    if(/^Digit[1-6]$/.test(e.code))world.setWeapon(Number(e.code.slice(-1))-1);if(e.code==='Tab')world.cycleWeapon();if(e.code==='KeyR')world.reload();
    if(e.code==='KeyM'){state.map=!state.map;document.body.classList.toggle('map-open',state.map);}
  });
  addEventListener('keyup',e=>keys.delete(e.code));
  canvas.addEventListener('pointerdown',e=>{if(state.phase!=='playing'||e.pointerType==='touch')return;e.preventDefault();state.mouseDown=true;state.dragX=e.clientX;requestLock();});
  addEventListener('pointerup',e=>{if(e.pointerType!=='touch'){state.mouseDown=false;state.dragX=null;}});
  addEventListener('mousemove',e=>{if(state.phase!=='playing'||world.dead)return;if(document.pointerLockElement===canvas)world.player.angle+=clamp(e.movementX,-180,180)*.0023;
    else if(state.mouseDown&&state.dragX!==null){world.player.angle+=(e.clientX-state.dragX)*.004;state.dragX=e.clientX;}});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{if(state.phase==='playing'){e.preventDefault();world.cycleWeapon(e.deltaY>0?1:-1);}},{passive:false});
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
  $('touchSwitch').addEventListener('click',()=>{if(state.phase==='playing')world.cycleWeapon();});
  $('touchReload').addEventListener('click',()=>{if(state.phase==='playing')world.reload();});
  $('touchMap').addEventListener('click',()=>{if(state.phase==='playing'){state.map=!state.map;document.body.classList.toggle('map-open',state.map);}});
  $('restartLevel').addEventListener('click',()=>{state.phase='end';state.endWon=false;begin();});
  $('mainMenu').addEventListener('click',()=>{
    clearInput();releaseLock();world.reset();state.phase='menu';state.endWon=false;state.map=false;state.bob=0;bursts.length=0;casings.length=0;
    Object.assign(world.player,world.start);state.needsRender=true;
    document.body.classList.remove('paused','endgame','map-open');document.body.classList.add('menu-active');$('overlay').style.display='flex';
    $('menuPanel').querySelector('h1').innerHTML='<span class="series-title">COUNTERCRAFT</span><strong class="game-subtitle">NETHER STRIKE</strong>';
    $('menuText').innerHTML='New layouts every campaign. Kill mobs. Buy weapons.<br>Retry a sector to master the same map.';
    $('menuSubtitle').textContent='OPERATION 01 · THE FIRST BREACH';$('menuUtility').hidden=true;$('startLabel').textContent='START GAME';$('start').focus({preventScroll:true});
  });
  // A small optional API exposes the same play/pause actions to browser agents.
  if(document.modelContext?.registerTool){
    const lifecycle=new AbortController();
    for(const tool of [
      {name:'get_countercraft_status',description:'Read the current Countercraft mission and player status.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({phase:state.phase,level:world.level.name,health:Math.ceil(world.player.health),hostiles:world.enemies.length-world.kills,weapon:WEAPONS[world.weapon].name,cash:world.cash,ownedWeapons:WEAPONS.filter((w,i)=>world.unlocked[i]).map(w=>w.name)})},
      {name:'pause_countercraft',description:'Pause the active Countercraft mission.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:()=>{pause();return{phase:state.phase};}}
    ]){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
    addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  }
  // Initial canvas remains a quiet backdrop until every source atlas decodes.
  ctx.fillStyle='#11160e';ctx.fillRect(0,0,W,H);loadAssets();
})();
