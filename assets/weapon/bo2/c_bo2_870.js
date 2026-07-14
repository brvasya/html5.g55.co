export const SHOTGUN = {
name: "Shotgun",
view: {
posOffset: [0, -1, 2],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
magazineSize: 1,
damage: 25,
fireCooldownMs: 120,
reloadSpeed: 2,
pellets: 6,
spread: 0.1,
},
shellEject: {
boneName: "j_bolt",
},
anim: {
idle: [0, 0],
shoot: [0, 17],
reload: [20, 72]
},
model: "./assets/weapon/bo2/c_bo2_870.glb",
fireSound: "./assets/weapon/bo2/c_bo2_870.ogg"
};
