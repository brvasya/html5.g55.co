export const MAGNUM = {
name: "Magnum",
view: {
posOffset: [0, 0, 0],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
magazineSize: 7,
damage: 140,
fireCooldownMs: 600,
reloadSpeed: 1,
pellets: 1,
spread: 0.025,
},
shellEject: {
boneName: "Dummy01",
},
anim: {
idle: [0, 0],
shoot: [5, 33],
reload: [37, 102]
},
model: "./assets/weapon/v_deagle.glb",
fireSound: "./assets/weapon/v_deagle.ogg"
};
