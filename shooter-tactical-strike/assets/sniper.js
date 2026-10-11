export const SNIPER = {
name: "Sniper Rifle",
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
model: "./assets/c_iw5_l96a1.mdl",
fireSound: "./assets/sniper.ogg"
};
