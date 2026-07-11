export const SHOTGUN = {
name: "Shotgun",
view: {
posOffset: [0, 0, 0],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
magazineSize: 1,
damage: 25,
fireCooldownMs: 120,
reloadSpeed: 1,
pellets: 12,
spread: 0.1,
},
shellEject: {
boneName: "Bone48",
},
anim: {
idle: [0, 0],
shoot: [5, 15],
reload: [16, 42]
},
model: "./assets/weapon/shotgun.glb",
fireSound: "./assets/weapon/shotgun.ogg"
};