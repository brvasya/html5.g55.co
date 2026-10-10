export const RIFLE = {
name: "Assault Rifle",
view: {
posOffset: [0, 0, 3],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
attachment: "3",
attachmentRotation: [0, Math.PI/2, 0],
muzzleFlash: "1",
shellEject: "2",
behavior: {
magazineSize: 30,
damage: 35,
fireCooldownMs: 120,
reloadSpeed: 1,
pellets: 1,
spread: 0.05,
},
anim: {
idle: "idle",
shoot: "fire",
reload: "reload_empty"
},
model: "./assets/rifle.glb",
fireSound: "./assets/rifle.ogg"
};
