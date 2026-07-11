import { WORLD } from "./assets/world/map.js";
//weapon tier1
import { PISTOL } from "./assets/weapon/pistol.js";
import { BURST_PISTOL } from "./assets/weapon/burst_pistol.js";
import { MAGNUM } from "./assets/weapon/magnum.js";
//weapon tier2
import { SMG } from "./assets/weapon/smg.js";
import { ASSAULT_RIFLE } from "./assets/weapon/assault_rifle.js";
import { HEAVY_RIFLE } from "./assets/weapon/heavy_rifle.js";
//weapon tier3
import { SHOTGUN } from "./assets/weapon/shotgun.js";
import { SNIPER_RIFLE } from "./assets/weapon/sniper_rifle.js";
import { MACHINE_GUN } from "./assets/weapon/machine_gun.js";
//enemies
import { ENEMY } from "./assets/enemies/enemy.js";

export const GAME_CONFIG = {
wave: {
baseEnemies: 6,
enemiesPerWave: 3,
maxEnemies: 30
},
enemySpawn: {
types: [
"enemy"
]
}
};

export const GAME_ASSETS = {
world: WORLD,

weaponSlots: [
{ id: 1, asset: PISTOL, owned: true, price: 0 },
{ id: 2, asset: BURST_PISTOL, owned: true, price: 600 },
{ id: 3, asset: MAGNUM, owned: true, price: 1200 },

{ id: 4, asset: SMG, owned: true, price: 1800 },
{ id: 5, asset: ASSAULT_RIFLE, owned: true, price: 2400 },
{ id: 6, asset: HEAVY_RIFLE, owned: true, price: 3000 },

{ id: 7, asset: SHOTGUN, owned: true, price: 3600 },
{ id: 8, asset: SNIPER_RIFLE, owned: true, price: 4200 },
{ id: 9, asset: MACHINE_GUN, owned: true, price: 4800 }
],

enemies: {
types: {
enemy: { asset: ENEMY }
}
}
};