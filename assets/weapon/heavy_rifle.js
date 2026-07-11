export const HEAVY_RIFLE = {
name: "Heavy Rifle",
view: {
posOffset: [0, 0, 0],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
magazineSize: 30,
damage: 40,
fireCooldownMs: 120,
reloadSpeed: 1,
pellets: 1,
spread: 0.025,
isSniper: true
},
shellEject: {
boneName: "Dummy01",
},
anim: {
idle: [0, 0],
shoot: [5, 35],
reload: [40, 172]
},
model: "./assets/weapon/heavy_rifle.glb",
fireSound: "./assets/weapon/heavy_rifle.ogg"
};