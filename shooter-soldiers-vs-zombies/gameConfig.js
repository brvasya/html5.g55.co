import { HANDS } from "./assets/hands.js";
import { PISTOL } from "./assets/pistol.js";
import { SMG } from "./assets/smg.js";
import { RIFLE } from "./assets/rifle.js";
import { SHOTGUN } from "./assets/shotgun.js";
import { SNIPER } from "./assets/sniper.js";
import { MINIGUN } from "./assets/minigun.js";
import { SOLDIER } from "./assets/soldier.js";
import { ZOMBIE } from "./assets/zombie.js";

export const GAME_CONFIG = {
weaponFov: 50,

mode: "teamDeathmatch",
teamDeathmatch: {
scoreLimit: 50,
timeLimit: 300,
respawnDelay: 3,
spawnProtection: 2,
playerTeam: "blue",
teams: {
blue: {
type: "soldier", bots: 3,
stats: { enemyDamage: 25 }
},
red: {
type: "zombie", bots: 16,
stats: { enemyDamage: 100 }
}
}
},

maps: {
defaultId: "map_italy",
rememberSelection: true,
items: [
{ id: "map_italy", name: "Italy", load: () => import("./assets/map_italy.js") }
]
},

wave: {
baseEnemies: 6,
enemiesPerWave: 3,
maxEnemies: 24
},
enemySpawn: {
types: ["soldier", "zombie"]
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
{ id: 6, asset: MINIGUN, owned: false, price: 6000 }
],

enemies: {
types: {
soldier: { asset: SOLDIER },
zombie: { asset: ZOMBIE }
}
}
};
