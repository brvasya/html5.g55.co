export const BURST_PISTOL = {
name: "Burst Pistol",
view: {
posOffset: [0, 0, 0],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
magazineSize: 20,
damage: 25,
fireCooldownMs: 200,
reloadSpeed: 1,
pellets: 3,
spread: 0.025,
},
shellEject: {
boneName: "USP_Slide-handle",
},
anim: {
idle: [0, 0],
shoot: [0, 20],
reload: [21, 96]
},
model: "./assets/weapon/burst_pistol.glb",
fireSound: "./assets/weapon/burst_pistol.ogg"
};