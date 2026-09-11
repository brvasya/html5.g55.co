export const STORAGE_KEY='g55-highway-rush-v1';
export const CARS=[
 {id:'crimson-s',name:'Crimson S',kind:'Sports coupe',speedBonus:0,passBonus:0,challenges:0,accent:'#ff5262'},
 {id:'outlaw-v8',name:'Outlaw V8',kind:'Muscle car',speedBonus:10,passBonus:.05,challenges:3,accent:'#ffad56'},
 {id:'apex-gt',name:'Apex GT',kind:'Supercar',speedBonus:20,passBonus:.10,challenges:8,accent:'#5ccaff'},
 {id:'phantom-x',name:'Phantom X',kind:'Hypercar',speedBonus:30,passBonus:.15,challenges:15,accent:'#69fff1'}
];
export const getCar=id=>CARS.find(car=>car.id===id)||CARS[0];
const CHALLENGES=[
 {label:'Make 6 near misses',stat:'nearMisses',target:6},
 {label:'Pass 3 cars in Overdrive',stat:'boostedPasses',target:3},
 {label:'Reach a ×5 combo',stat:'maxCombo',target:5},
 {label:'Make 10 near misses',stat:'nearMisses',target:10},
 {label:'Pass 6 cars in Overdrive',stat:'boostedPasses',target:6}
];
const positive=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
export function normalizeProgress(raw){
 raw=raw&&typeof raw==='object'?raw:{};
 const progress={profileVersion:2,best:positive(raw.best),distance:positive(raw.distance),muted:!!raw.muted,completedChallenges:Math.min(1000000,Math.floor(positive(raw.completedChallenges))),unlockedCars:[]};
 // Carry old score-earned paints into equivalent cars once. New unlocks use challenges.
 const legacy=raw.profileVersion!==2;
 progress.unlockedCars=CARS.filter((car,i)=>progress.completedChallenges>=car.challenges||(Array.isArray(raw.unlockedCars)&&raw.unlockedCars.includes(car.id))||(legacy&&i>0&&i<3&&progress.best>=[0,2000,6000][i])).map(car=>car.id);
 const selected=legacy&&[0,1,2].includes(raw.paint)?CARS[raw.paint].id:raw.car;
 progress.car=carUnlocked(progress,selected)?selected:CARS[0].id;
 return progress;
}
export function createChallenge(sequence=0){return {...CHALLENGES[sequence%CHALLENGES.length],sequence,progress:0,complete:false,reward:500};}
export function carUnlocked(progress,id){const car=CARS.find(car=>car.id===id);return !!car&&(progress.completedChallenges>=car.challenges||progress.unlockedCars.includes(id));}
export function nextCar(progress){return CARS.find(car=>!carUnlocked(progress,car.id));}
export function selectCar(progress,id){if(!carUnlocked(progress,id))return false;progress.car=id;return true;}
export function recordChallenge(progress,challenge){
 if(!challenge.complete||challenge.sequence!==progress.completedChallenges)return false;
 progress.completedChallenges++;for(const car of CARS)if(carUnlocked(progress,car.id)&&!progress.unlockedCars.includes(car.id))progress.unlockedCars.push(car.id);return true;
}
