export const KNIFE = {
name: "Knife",
view: {
posOffset: [0, 0, 0],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
damage: 140,
fireCooldownMs: 600,
isMelee: true
},
anim: {
idle: [0, 0],
shoot: [5, 35]
},
model: "./assets/weapon/knife.glb",
fireSound: "./assets/weapon/knife.ogg"
};