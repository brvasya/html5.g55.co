export const HEAVY_RIFLE = {
name: "Heavy Rifle",
view: {
posOffset: [0, -1, 1],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
magazineSize: 30,
damage: 40,
fireCooldownMs: 120,
reloadSpeed: 3,
pellets: 1,
spread: 0.05,
},
shellEject: {
boneName: "tag_clip",
},
anim: {
idle: [0, 0],
shoot: [0, 12],
reload: [13, 210]
},
model: "./assets/weapon/bo2/c_bo2_scarh.glb",
fireSound: "./assets/weapon/bo2/c_bo2_scarh.ogg"
};
