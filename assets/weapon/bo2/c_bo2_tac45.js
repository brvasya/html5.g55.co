export const PISTOL = {
name: "Pistol",
view: {
posOffset: [0, -1, 2],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
magazineSize: 10,
damage: 25,
fireCooldownMs: 200,
reloadSpeed: 3,
pellets: 1,
spread: 0.025,
},
shellEject: {
boneName: "j_bolt",
},
anim: {
idle: [0, 0],
shoot: [0, 25],
reload: [30, 130]
},
model: "./assets/weapon/bo2/c_bo2_tac45.glb",
fireSound: "./assets/weapon/bo2/c_bo2_tac45.ogg"
};
