export const PISTOL = {
name: "Pistol",
view: {
posOffset: [0, 0, 3],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
attachment: "5",
attachmentRotation: [0, Math.PI/2, 0],
muzzleFlash: "1",
shellEject: "2",
behavior: {
magazineSize: 12,
damage: 25,
fireCooldownMs: 200,
reloadSpeed: 1,
pellets: 1,
spread: 0.025,
},
anim: {
idle: "idle",
shoot: "fire",
reload: "reload_empty"
},
model: "./assets/pistol.glb",
fireSound: "./assets/pistol.ogg"
};
