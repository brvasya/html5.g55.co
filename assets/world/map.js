export const WORLD = {
map: {
scale: [1.35, 1.35, 1.35],
model: "./assets/world/map.glb"
},
sky: {
skyColorTop: 0x6fb8ff,
skyColorMid: 0xa8d8ff,
skyColorHorizon: 0xd8f0ff,
fogColor: 0xd8f0ff,
sunColor: 0xfff4b0,
sunGlowColor: 0xffe7a0,
fogNear: 10,
fogFar: 100
},
spawnYaw: Math.PI,
spawnObjectName: "PLAYER_START",
floorObjectPrefixes: ["ENEMY_SPAWN"]
};