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

// Native .phy companion files are discovered beside each character .mdl.
// Missing/unsupported PHY files fall back to the configured death animation.
ragdolls: {
enabled: true,
maxRagdolls: 12,
lifetime: 24,
fadeDuration: 3,
gravity: 18,
fixedTimeStep: 1 / 120,
maxSubSteps: 8,
solverIterations: 20,
bulletImpulseScale: 0.32,
explosionStrength: 5.5
},

maps: {
defaultId: "world",
rememberSelection: true,
items: [
{ id: "world", name: "world", load: () => import("./assets/world.js") }
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
{ id: 2, asset: SMG, owned: true, price: 1500 },
{ id: 3, asset: RIFLE, owned: true, price: 2500 },
{ id: 4, asset: SHOTGUN, owned: true, price: 3500 },
{ id: 5, asset: SNIPER, owned: true, price: 4500 },
{ id: 6, asset: LAUNCHER, owned: true, price: 6000 }
],

enemies: {
types: {
zombie: { asset: ZOMBIE }
}
}
};
