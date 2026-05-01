import { MAP_GLB_BASE64 } from "./map.js";
import { AK47 } from "../../app/assets/weapon/ak47.js";
import { P90 } from "../../app/assets/weapon/p90.js";
import { AWP } from "../../app/assets/weapon/awp.js";
import { KNIFE } from "../../app/assets/weapon/knife.js";
import { ZOMBIE } from "../../app/assets/enemies/zombie.js";

export const GAME_CONFIG = {
  wave: {
    baseEnemies: 3,
    enemiesPerWave: 3,
    maxEnemies: 30
  },
    enemySpawn: {
    types: ["zombie"]
  }
};

export const GAME_ASSETS = {
  world: {
    map: MAP_GLB_BASE64,
    spawnYaw: 0,
    spawnObjectName: "G55START001",
    floorObjectPrefixes: ["G55FLR", "G55OUT0"],
    sky: {
      skyColorTop: 0x6fb8ff,
      skyColorMid: 0xa8d8ff,
      skyColorHorizon: 0xd8f0ff,
      fogColor: 0xd8f0ff,
      cloudColor: 0xffffff,
      sunColor: 0xfff4b0,
      sunGlowColor: 0xffe7a0,
      fogNear: 10,
      fogFar: 100
    }
  },

  weaponSlots: [
    { id: 1, asset: AK47, owned: true },
    { id: 2, asset: P90, owned: false },
    { id: 3, asset: AWP, owned: false },
    { id: 4, asset: AK47, owned: false },
    { id: 5, asset: AK47, owned: false },
    { id: 6, asset: AK47, owned: false },
    { id: 7, asset: AK47, owned: false },
    { id: 8, asset: AK47, owned: false },
    { id: 9, asset: KNIFE, owned: true }
  ],

  enemies: {
    types: {
      zombie: { asset: ZOMBIE }
    }
  }
};