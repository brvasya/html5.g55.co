import { PISTOL } from "./assets/pistol.js";
import { SMG } from "./assets/smg.js";
import { RIFLE } from "./assets/rifle.js";
import { SHOTGUN } from "./assets/shotgun.js";
import { SNIPER } from "./assets/sniper.js";
import { MINIGUN } from "./assets/minigun.js";
import { SOLDIER } from "./assets/soldier.js";

export const GAME_CONFIG = {
gameTitle: "Shooter: Tactical Strike",

maps: {
defaultId: "office",
rememberSelection: true,
items: [
{ id: "office", name: "Office", load: () => import("./assets/office.js") },
{ id: "assault", name: "Assault", load: () => import("./assets/assault.js") },
{ id: "militia", name: "Militia", load: () => import("./assets/militia.js") }
]
},

wave: {
baseEnemies: 6,
enemiesPerWave: 3,
maxEnemies: 24
},
enemySpawn: {
types: ["soldier"]
}
};

export const GAME_ASSETS = {
weaponSlots: [
{ id: 1, asset: PISTOL, owned: true, price: 0 },
{ id: 2, asset: SMG, owned: true, price: 1500 },
{ id: 3, asset: RIFLE, owned: true, price: 2500 },
{ id: 4, asset: SHOTGUN, owned: true, price: 3500 },
{ id: 5, asset: SNIPER, owned: true, price: 4500 },
{ id: 6, asset: MINIGUN, owned: true, price: 6000 }
],

enemies: {
types: {
soldier: { asset: SOLDIER }
}
}
};
