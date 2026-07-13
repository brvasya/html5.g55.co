import { WORLD } from "./assets/world/gm_metro_cso2_night.js";
//weapon tier1
import { PISTOL } from "./assets/weapon/cscz/v_usp.js";
import { BURST_PISTOL } from "./assets/weapon/cscz/v_glock18.js";
import { MAGNUM } from "./assets/weapon/cscz/v_deagle.js";
//weapon tier2
import { SMG } from "./assets/weapon/cscz/v_p90.js";
import { ASSAULT_RIFLE } from "./assets/weapon/cscz/v_ak47.js";
import { HEAVY_RIFLE } from "./assets/weapon/cscz/v_aug.js";
//weapon tier3
import { SHOTGUN } from "./assets/weapon/cscz/v_m3.js";
import { SNIPER_RIFLE } from "./assets/weapon/cscz/v_awp.js";
import { MACHINE_GUN } from "./assets/weapon/cscz/v_m249.js";
//enemies
import { BONNIE } from "./assets/enemies/bonnie.js";
import { CHICA } from "./assets/enemies/chica.js";
import { FOXY } from "./assets/enemies/foxy.js";
import { FREDDY } from "./assets/enemies/freddy.js";

export const GAME_CONFIG = {
gameTitle: "FNAF Shooter: Metro",

wave: {
baseEnemies: 6,
enemiesPerWave: 3,
maxEnemies: 20
},
enemySpawn: {
types: [
"bonnie",
"chica",
"foxy",
"freddy"
]
}
};

export const GAME_ASSETS = {
world: WORLD,

weaponSlots: [
{ id: 1, asset: PISTOL, owned: true, price: 0 },
{ id: 2, asset: BURST_PISTOL, owned: false, price: 600 },
{ id: 3, asset: MAGNUM, owned: false, price: 1200 },

{ id: 4, asset: SMG, owned: true, price: 1800 },
{ id: 5, asset: ASSAULT_RIFLE, owned: false, price: 2400 },
{ id: 6, asset: HEAVY_RIFLE, owned: false, price: 3000 },

{ id: 7, asset: SHOTGUN, owned: true, price: 3600 },
{ id: 8, asset: SNIPER_RIFLE, owned: false, price: 4200 },
{ id: 9, asset: MACHINE_GUN, owned: false, price: 4800 }
],

enemies: {
types: {
bonnie: { asset: BONNIE },
chica: { asset: CHICA },
foxy: { asset: FOXY },
freddy: { asset: FREDDY }
}
}
};
