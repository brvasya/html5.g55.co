/* Cached sprite animation. Art supplies the surfaces; joints supply the gait. */
(() => {
  'use strict';
  const COUNT=24,TAU=Math.PI*2;
  const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  const rigs={
    0:{body:[96,79,72,79],head:[90,10,80,77],arms:[[60,81,43,99],[164,81,41,99]],legs:[[99,151,34,100],[133,151,34,100]],floor:250},
    1:{body:[104,89,60,80],head:[94,9,80,84],arms:[[61,95,47,110],[163,93,39,88]],legs:[[106,163,22,88],[133,163,24,88]],floor:250},
    4:{body:[106,57,65,88],head:[101,0,73,64],arms:[[75,58,34,50],[169,58,31,50]],legs:[[104,140,34,82],[138,140,35,82]],floor:222},
    5:{body:[84,26,98,91],head:[107,0,57,53],arms:[[29,29,57,176],[180,29,58,176]],legs:[[90,111,42,118],[137,111,42,118]],floor:229}
  };
  function crop(source,rect){const c=canvas(rect[2],rect[3]);c.getContext('2d').drawImage(source,...rect,0,0,c.width,c.height);return c;}
  function quad(g,image,p){
    // Affine triangles are only drawn at loading time, never per game frame.
    const w=image.width,h=image.height;
    const triangle=(a,b,c,sa,sb,sc)=>{
      const den=sa[0]*(sb[1]-sc[1])+sb[0]*(sc[1]-sa[1])+sc[0]*(sa[1]-sb[1]);
      const coeff=k=>[(a[k]*(sb[1]-sc[1])+b[k]*(sc[1]-sa[1])+c[k]*(sa[1]-sb[1]))/den,(a[k]*(sc[0]-sb[0])+b[k]*(sa[0]-sc[0])+c[k]*(sb[0]-sa[0]))/den,(a[k]*(sb[0]*sc[1]-sc[0]*sb[1])+b[k]*(sc[0]*sa[1]-sa[0]*sc[1])+c[k]*(sa[0]*sb[1]-sb[0]*sa[1]))/den];
      const x=coeff(0),y=coeff(1);g.save();g.beginPath();g.moveTo(...a);g.lineTo(...b);g.lineTo(...c);g.closePath();g.clip();g.transform(x[0],y[0],x[1],y[1],x[2],y[2]);g.drawImage(image,0,0);g.restore();
    };
    triangle(p[0],p[1],p[2],[0,0],[w,0],[w,h]);triangle(p[0],p[2],p[3],[0,0],[w,h],[0,h]);
  }
  function step(phase){
    phase=((phase%1)+1)%1;
    if(phase<.58)return {reach:1-phase/.58*2,lift:0};
    const t=(phase-.58)/.42,s=t*t*(3-2*t);
    return {reach:-1+s*2,lift:Math.sin(t*Math.PI)};
  }
  function walkFrames(source,type,standingHeight){
    const frames=[],pad=32,rig=rigs[type],floor=rig?.floor??(type===2?232:202);
    const drawPart=(g,rect,dx=0,dy=0)=>g.drawImage(source,...rect,rect[0]+dx,rect[1]+dy,rect[2],rect[3]);
    const legImages=rig?.legs.map(r=>crop(source,r)),armImages=rig?.arms.map(r=>crop(source,r));
    const creeperLegs=type===2?[[88,173,36,59],[136,173,39,59]].map(r=>crop(source,r)):null;
    // Spider legs are cut on separate diagonal bands, keeping its generated
    // material while letting all eight feet alternate in two support groups.
    const spiderLegs=[];
    if(type===3)for(let side=0;side<2;side++)for(let n=0;n<4;n++){
      const c=canvas(256,256),g=c.getContext('2d'),sx=side?1:-1;
      g.beginPath();g.moveTo(128+sx*24,122+n*7);g.lineTo(128+sx*48,96+n*20);g.lineTo(128+sx*120,110+n*26);g.lineTo(128+sx*99,140+n*24);g.lineTo(128+sx*23,138+n*7);g.closePath();g.clip();g.drawImage(source,0,0);spiderLegs.push(c);
    }
    for(let i=0;i<COUNT;i++){
      const phase=i/COUNT,c=canvas(320,320),g=c.getContext('2d'),weight=Math.cos(phase*TAU*2)*1.0;
      g.translate(pad,pad);g.imageSmoothingEnabled=true;
      if(rig){
        const steps=[step(phase),step(phase+.5)],order=steps[0].reach<steps[1].reach?[0,1]:[1,0];
        for(const k of order){
          const r=rig.legs[k],s=steps[k],cx=r[0]+r[2]/2;
          const toeX=cx+s.reach*(k?1.8:-1.8),toeY=floor+s.reach*5-s.lift*(type===5?7:11);
          const half=r[2]/2*(1+s.reach*.07);
          quad(g,legImages[k],[[r[0],r[1]+weight],[r[0]+r[2],r[1]+weight],[toeX+half,toeY],[toeX-half,toeY]]);
        }
        for(let k=0;k<2;k++){
          const r=rig.arms[k],s=steps[1-k],pivotX=r[0]+r[2]*(k?.2:.8),pivotY=r[1]+6;
          g.save();g.translate(pivotX,pivotY+weight);g.rotate(s.reach*(type===5?.06:.10));g.scale(1,1+s.reach*.025);g.drawImage(armImages[k],r[0]-pivotX,r[1]-pivotY);g.restore();
        }
        drawPart(g,rig.body,0,weight);drawPart(g,rig.head,0,weight*.65);
      }else if(type===2){
        // Four feet: rear-left/front-right plant while the diagonal pair swings.
        for(const back of [true,false])for(let k=0;k<2;k++){
          const s=step(phase+(k===Number(back)?.5:0)),x=(k?137:88)+(back?(k?-7:7):0),y=back?171:179;
          const toe=y+(back?43:53)+s.reach*4-s.lift*7,half=(k?39:36)/2;
          quad(g,creeperLegs[k],[[x,y+weight],[x+half*2,y+weight],[x+half*2+s.reach*2,toe],[x+s.reach*2,toe]]);
        }
        drawPart(g,[94,92,79,88],0,weight);drawPart(g,[87,19,89,82],0,weight*.5);
      }else{
        for(let side=0;side<2;side++)for(let n=0;n<4;n++){
          const s=step(phase+(n%2===side?0:.5)),pivotX=side?153:103,pivotY=131+n*5;
          g.save();g.translate(pivotX,pivotY);g.rotate((side?1:-1)*s.reach*.12);g.scale(1+s.reach*.04,1-s.lift*.10);g.drawImage(spiderLegs[side*4+n],-pivotX,-pivotY);g.restore();
        }
        drawPart(g,[103,82,66,95],0,weight*.4);
      }
      c.groundAnchor=(floor+pad)/c.height;c.centerAnchor=(128+pad)/c.width;c.worldScale=c.height/standingHeight;frames.push(c);
    }
    return frames;
  }
  function fireFrames(base,source){
    // Each PNG cell already contains the weapon and its complete muzzle flash.
    // Fixed canvas padding keeps the hands and bore registered with the idle gun.
    const width=source.width/3,height=source.height;
    return Array.from({length:3},(_,frame)=>{
      const c=canvas(width,height);c.getContext('2d').drawImage(source,frame*width,0,width,height,0,0,width,height);
      Object.assign(c,{nominalWidth:base.nominalWidth,nominalHeight:base.nominalHeight,sizeRatio:base.sizeRatio,groundAnchor:(128+base.groundAnchor*base.height)/height});
      return c;
    });
  }
  // Bore centerlines measured on the 444px idle artwork. These describe the
  // gun's direction, independent of transparent margins, sleeves or flash size.
  const weaponAxes=[
    [[220,164],[220,250]],
    [[222,145],[254,277]],
    [[216,95],[344,320]],
    [[197,151],[342,318]],
    [[174,121],[353,296]],
    [[210,140],[341,339]]
  ];
  function weaponPlacement(base,image,weapon,width,height){
    const scale=Math.min(height*base.sizeRatio/base.nominalHeight,width*1.4/base.nominalWidth);
    const [front,rear]=weaponAxes[weapon],sx=base.nominalWidth/444,sy=base.nominalHeight/444;
    const slope=(rear[0]-front[0])*sx/((rear[1]-front[1])*sy);
    const baseTop=height-base.height*base.groundAnchor*scale;
    const frontY=baseTop+front[1]*sy*scale;
    // Extend the bore to the crosshair's height, then place that intersection
    // at screen center. Forearms remain attached to the bottom of the viewport.
    const baseLeft=width*.5-front[0]*sx*scale-(height*.5-frontY)*slope;
    return {scale,width:image.width*scale,height:image.height*scale,
      left:baseLeft-(image.width-base.width)*.5*scale,
      top:height-image.height*image.groundAnchor*scale};
  }
  globalThis.CounterAnimation={walkFrames,fireFrames,weaponPlacement,COUNT};
})();
