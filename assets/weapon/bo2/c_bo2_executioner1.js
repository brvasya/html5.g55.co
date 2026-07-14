export const MAGNUM = {
name: "Magnum",
view: {
posOffset: [1, -1, 2],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
magazineSize: 5,
damage: 140,
fireCooldownMs: 600,
reloadSpeed: 3,
pellets: 1,
spread: 0.025,
},
shellEject: {
boneName: "",
},
anim: {
idle: [0, 0],
shoot: [0, 30],
reload: [31, 310]
},
model: "./assets/weapon/bo2/c_bo2_executioner1.glb",
fireSound: "./assets/weapon/bo2/c_bo2_executioner1.ogg"
};
