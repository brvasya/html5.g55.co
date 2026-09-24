const GameAudio=(()=>{
'use strict';
let context=null,master=null,limiter=null,resuming=null,muted=false,epoch=0,lastError='';
const buffers=new Map(),voices=new Set(),lastPlayed=new Map(),volume=.82;
const durations={punch:.16,kick:.24,shoot:.25,hurt:.24,clear:.58,reload:.4,dodge:.22,burst:.68,click:.1,step:.085,break:.36};
const levels={punch:.68,kick:.76,shoot:.76,hurt:.56,clear:.35,reload:.48,dodge:.38,burst:.78,click:.3,step:.24,break:.65};
function initialize(){
 if(context&&context.state!=='closed')return;
 const AudioContextClass=window.AudioContext||window.webkitAudioContext;
 if(!AudioContextClass)throw new Error('Web Audio is unavailable');
 context=new AudioContextClass({latencyHint:'interactive'});master=context.createGain();limiter=context.createDynamicsCompressor();
 master.gain.value=muted?0:volume;limiter.threshold.value=-8;limiter.knee.value=12;limiter.ratio.value=5;limiter.attack.value=.003;limiter.release.value=.12;
 master.connect(limiter);limiter.connect(context.destination);buffers.clear();lastPlayed.clear();lastError='';
}
function unlock(){
 try{
  initialize();if(context.state==='running')return Promise.resolve(true);
  if(!resuming)resuming=Promise.resolve(context.resume()).then(()=>context.state==='running').catch(error=>{lastError=String(error);return false}).finally(()=>{resuming=null});
  return resuming;
 }catch(error){lastError=String(error);return Promise.resolve(false)}
}
function makeBuffer(type){
 if(buffers.has(type))return buffers.get(type);
 const duration=durations[type]||durations.click,rate=context.sampleRate,buffer=context.createBuffer(1,Math.ceil(duration*rate),rate),data=buffer.getChannelData(0);
 let seed=type.split('').reduce((a,c)=>Math.imul(a,31)+c.charCodeAt(0),1709)>>>0,low=0,peak=0;
 const sine=(frequency,t)=>Math.sin(2*Math.PI*frequency*t);
 const thump=(start,end,t,decay)=>Math.sin(2*Math.PI*(end*t+(start-end)*(1-Math.exp(-28*t))/28))*Math.exp(-decay*t);
 for(let i=0;i<data.length;i++){
  const t=i/rate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;low+=.13*(noise-low);const high=noise-low;
  let value=0;
  if(type==='shoot')value=.68*high*Math.exp(-48*t)+1.1*low*Math.exp(-16*t)+.55*thump(230,75,t,24);
  else if(type==='punch')value=.75*thump(260,95,t,28)+.55*noise*Math.exp(-65*t);
  else if(type==='kick')value=.85*thump(200,65,t,19)+.4*high*Math.exp(-45*t);
  else if(type==='hurt')value=.7*thump(180,70,t,18)+.65*low*Math.exp(-20*t);
  else if(type==='dodge')value=high*Math.sin(Math.PI*t/duration)*Math.exp(-8*t);
  else if(type==='burst')value=.6*thump(185,38,t,5)+1.2*low*Math.exp(-7*t)+.25*high*Math.exp(-22*t);
  else if(type==='step')value=.7*noise*Math.exp(-72*t)+.35*thump(200,105,t,55);
  else if(type==='break')value=.8*high*Math.exp(-25*t)+.75*low*Math.exp(-9*t)+.45*thump(220,70,t,18)+.2*high*Math.max(0,Math.sin(t*130))*Math.exp(-8*t);
  else if(type==='reload'){
   for(const delay of [0,.12,.27]){const u=t-delay;if(u>=0&&u<.1)value+=(.7*high+.28*sine(1800,u)+.2*sine(2600,u))*Math.exp(-55*u)}
  }else if(type==='clear'){
   for(const [delay,hz] of [[0,440],[.09,554.37],[.18,659.25]]){const u=t-delay;if(u>=0)value+=(sine(hz,u)+.2*sine(hz*2,u))*Math.exp(-9*u)*Math.min(1,u/.008)}
  }else value=(sine(880,t)+.3*sine(1320,t))*Math.exp(-42*t);
  value*=Math.min(1,t/.0015,(duration-t)/.008);data[i]=value;peak=Math.max(peak,Math.abs(value));
 }
 if(peak>0)for(let i=0;i<data.length;i++)data[i]=data[i]/peak*.9;
 buffers.set(type,buffer);return buffer;
}
function play(type){
 if(muted)return;
 if(!context||context.state!=='running'){
  const requested=performance.now(),requestEpoch=epoch;
  unlock().then(ready=>{if(ready&&!muted&&epoch===requestEpoch&&performance.now()-requested<350)play(type)});return;
 }
 try{
  const now=context.currentTime;if(now-(lastPlayed.get(type)??-1)<(type==='step'?.08:.025)||voices.size>=20)return;
  lastPlayed.set(type,now);const source=context.createBufferSource(),gain=context.createGain();source.buffer=makeBuffer(type);gain.gain.value=levels[type]??levels.click;
  source.connect(gain);gain.connect(master);voices.add(source);source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect()};source.start(now);
 }catch(error){lastError=String(error)}
}
function stop(){epoch++;for(const source of voices){try{source.stop()}catch{}}voices.clear();lastPlayed.clear()}
function setMuted(value){
 muted=Boolean(value);epoch++;
 if(master){master.gain.cancelScheduledValues(context.currentTime);master.gain.setValueAtTime(muted?0:volume,context.currentTime)}
 if(muted)stop();
}
return {unlock,play,stop,setMuted,status:()=>({state:context?.state??'not-created',muted,activeVoices:voices.size,error:lastError})};
})();
