export const SNIPER_RIFLE = {
name: "Sniper Rifle",
view: {
posOffset: [0, 0, 0],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
magazineSize: 10,
damage: 240,
fireCooldownMs: 1200,
reloadSpeed: 1,
pellets: 1,
spread: 0,
isSniper: true
},
shellEject: {
boneName: "Bone51",
},
anim: {
idle: [0, 0],
shoot: [5, 46],
reload: [50, 137]
},
model: "./assets/weapon/cscz/v_awp.glb",
fireSound: "./assets/weapon/cscz/v_awp.ogg"
};
