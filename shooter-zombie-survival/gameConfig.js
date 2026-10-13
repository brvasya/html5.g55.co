import { HANDS } from "./assets/hands.js";
import { PISTOL } from "./assets/pistol.js";
import { SMG } from "./assets/smg.js";
import { RIFLE } from "./assets/rifle.js";
import { SHOTGUN } from "./assets/shotgun.js";
import { SNIPER } from "./assets/sniper.js";
import { LAUNCHER } from "./assets/launcher.js";
import { ZOMBIE } from "./assets/zombie.js";

export const GAME_CONFIG = {
weaponFov: 40,

maps: {
defaultId: "map_city",
rememberSelection: true,
items: [
{ id: "map_city", name: "Raccoon City", load: () => import("./assets/map_city.js") },
{ id: "map_police", name: "Police Station", load: () => import("./assets/map_police.js") },
{ id: "map_lab", name: "Umbrella Lab", load: () => import("./assets/map_lab.js") }
]
},

wave: {
baseEnemies: 6,
enemiesPerWave: 3,
maxEnemies: 24
},
enemySpawn: {
types: ["zombie"]
}
};

export const GAME_ASSETS = {
hands: HANDS,
weaponSlots: [
{ id: 1, asset: PISTOL, owned: true, price: 0 },
{ id: 2, asset: SMG, owned: false, price: 1500 },
{ id: 3, asset: RIFLE, owned: false, price: 2500 },
{ id: 4, asset: SHOTGUN, owned: false, price: 3500 },
{ id: 5, asset: SNIPER, owned: false, price: 4500 },
{ id: 6, asset: LAUNCHER, owned: false, price: 6000 }
],

enemies: {
types: {
zombie: { asset: ZOMBIE }
}
}
};
