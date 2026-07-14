export const BURST_PISTOL = {
name: "Burst Pistol",
view: {
posOffset: [0, -1, 2],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
magazineSize: 15,
damage: 25,
fireCooldownMs: 200,
reloadSpeed: 3,
pellets: 3,
spread: 0.025,
},
shellEject: {
boneName: "j_reload",
},
anim: {
idle: [0, 0],
shoot: [0, 12],
reload: [15, 135]
},
model: "./assets/weapon/bo2/c_bo2_kard.glb",
fireSound: "./assets/weapon/bo2/c_bo2_kard.ogg"
};
