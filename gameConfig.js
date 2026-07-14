import { WORLD } from "./assets/world/gm_digitalcircus.js";
//weapon tier1
import { PISTOL } from "./assets/weapon/bo2/c_bo2_tac45.js";
import { BURST_PISTOL } from "./assets/weapon/bo2/c_bo2_kard.js";
import { MAGNUM } from "./assets/weapon/bo2/c_bo2_executioner1.js";
//weapon tier2
import { SMG } from "./assets/weapon/bo2/c_bo2_vector.js";
import { ASSAULT_RIFLE } from "./assets/weapon/bo2/c_bo2_an94.js";
import { HEAVY_RIFLE } from "./assets/weapon/bo2/c_bo2_scarh.js";
//weapon tier3
import { SHOTGUN } from "./assets/weapon/bo2/c_bo2_870.js";
import { SNIPER_RIFLE } from "./assets/weapon/bo2/c_bo2_xpr50.js";
import { MACHINE_GUN } from "./assets/weapon/bo2/c_bo2_deathmachine1.js";
//enemies
import { JAX } from "./assets/enemies/jax.js";
import { POMNI } from "./assets/enemies/pomni.js";

export const GAME_CONFIG = {
gameTitle: "Digital Circus Shooter",

wave: {
baseEnemies: 6,
enemiesPerWave: 3,
maxEnemies: 20
},
enemySpawn: {
types: [
"jax",
"pomni"
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
jax: { asset: JAX },
pomni: { asset: POMNI }
}
}
};
