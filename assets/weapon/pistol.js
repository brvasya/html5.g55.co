export const PISTOL = {
name: "Pistol",
view: {
posOffset: [0, 0, 0],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
magazineSize: 12,
damage: 25,
fireCooldownMs: 200,
reloadSpeed: 1,
pellets: 1,
spread: 0.025,
},
shellEject: {
boneName: "Bone54",
},
anim: {
idle: [0, 0],
shoot: [5, 35],
reload: [40, 140]
},
model: "./assets/weapon/pistol.glb",
fireSound: "./assets/weapon/pistol.ogg"
};