export const SMG = {
name: "SMG",
attachment: "5",
attachmentRotation: [0, Math.PI/2, 0],
muzzleFlash: "1",
shellEject: "2",
behavior: {
magazineSize: 50,
damage: 25,
fireCooldownMs: 90,
reloadSpeed: 1,
pellets: 1,
spread: 0.05,
},
anim: {
idle: "idle",
shoot: "fire",
reload: "reload_empty"
},
model: "./assets/smg.glb",
fireSound: "./assets/smg.ogg"
};
