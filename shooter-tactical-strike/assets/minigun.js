export const MINIGUN = {
name: "Machine Gun",
attachment: "3",
attachmentRotation: [0, Math.PI/2, 0],
muzzleFlash: "1",
shellEject: "2",
behavior: {
magazineSize: 100,
damage: 35,
fireCooldownMs: 90,
reloadSpeed: 1,
pellets: 1,
spread: 0.05,
},
anim: {
idle: "idle",
shoot: "fire",
reload: "reload"
},
model: "./assets/minigun/c_iw5_m60e4.mdl",
source: { bodygroups: { bullet: 14 } },
fireSound: "./assets/minigun.ogg"
};
