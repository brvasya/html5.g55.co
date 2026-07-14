export const SNIPER_RIFLE = {
name: "Sniper Rifle",
view: {
posOffset: [3, -3, -8],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
magazineSize: 8,
damage: 240,
fireCooldownMs: 600,
reloadSpeed: 3,
pellets: 1,
spread: 0,
isSniper: true
},
shellEject: {
boneName: "tag_ads",
},
anim: {
idle: [0, 0],
shoot: [0, 27],
reload: [30, 275]
},
model: "./assets/weapon/bo2/c_bo2_xpr50.glb",
fireSound: "./assets/weapon/bo2/c_bo2_xpr50.ogg"
};
