export const ASSAULT_RIFLE = {
name: "Assault Rifle",
view: {
posOffset: [0, 0, 0],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
magazineSize: 30,
damage: 35,
fireCooldownMs: 120,
reloadSpeed: 1,
pellets: 1,
spread: 0.05,
},
shellEject: {
boneName: "Bone52",
},
anim: {
idle: [0, 0],
shoot: [5, 21],
reload: [25, 115]
},
model: "./assets/weapon/cscz/v_ak47.glb",
fireSound: "./assets/weapon/cscz/v_ak47.ogg"
};
