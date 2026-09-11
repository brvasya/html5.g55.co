const WASD={KeyS:0,KeyD:1,KeyW:2,KeyA:3};
const ARROWS={ArrowDown:0,ArrowRight:1,ArrowUp:2,ArrowLeft:3};
const SOLO={...WASD,...ARROWS};

export function isGameplayKey(code,playerCount=1){
 return code in SOLO||code==='Space'||code==='KeyE'||playerCount===2&&(code==='Enter'||code==='ShiftRight');
}

export function readPlayerInputs(held,touchHeld,playerCount=1){
 return Array.from({length:playerCount===2?2:1},(_,id)=>{
  const directions=id===1?ARROWS:playerCount===2?WASD:SOLO;
  let dir=-1,last=-1;
  for(const [code,n] of held)if(directions[code]!==undefined&&n>last){last=n;dir=directions[code];}
  const touches=playerCount===1?[...touchHeld.values()]:[];
  for(const touch of touches)if(touch.dir!==undefined&&touch.order>last){last=touch.order;dir=touch.dir;}
  return {dir,plant:held.has(id===0?'Space':'Enter')||touches.some(t=>t.action==='plant'),defuse:held.has(id===0?'KeyE':'ShiftRight')||touches.some(t=>t.action==='defuse')};
 });
}
