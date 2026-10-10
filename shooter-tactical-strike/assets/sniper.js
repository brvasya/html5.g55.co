export const SNIPER = {
name: "Sniper Rifle",
view: {
posOffset: [0, 0, 2],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
attachment: "3",
attachmentRotation: [0, Math.PI/2, 0],
muzzleFlash: "1",
shellEject: "2",
behavior: {
magazineSize: 5,
damage: 100,
fireCooldownMs: 1000,
reloadSpeed: 1,
pellets: 1,
spread: 0,
isSniper: true
},
anim: {
idle: "idle",
shoot: ["fire", "bolt"],
reload: "reload_empty"
},
model: "./assets/sniper.glb",
fireSound: "./assets/sniper.ogg"
};
