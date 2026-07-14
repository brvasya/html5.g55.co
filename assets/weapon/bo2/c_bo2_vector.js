export const SMG = {
name: "SMG",
view: {
posOffset: [0, 0, 0],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
magazineSize: 36,
damage: 25,
fireCooldownMs: 90,
reloadSpeed: 3,
pellets: 1,
spread: 0.05,
},
shellEject: {
boneName: "tag_weapon",
},
anim: {
idle: [0, 0],
shoot: [0, 17],
reload: [20, 182]
},
model: "./assets/weapon/bo2/c_bo2_vector.glb",
fireSound: "./assets/weapon/bo2/c_bo2_vector.ogg"
};
