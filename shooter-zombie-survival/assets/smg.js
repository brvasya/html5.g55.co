export const SMG = {
name: "SMG",
attachment: "flashlight",
attachmentRotation: [0, Math.PI/2, 0],
muzzleFlash: "muzzle_flash",
shellEject: "shell",
behavior: {
magazineSize: 30,
damage: 25,
fireCooldownMs: 90,
reloadSpeed: 1,
pellets: 1,
spread: 0.05,
},
anim: {
deploy: "deploy",
idle: "idle",
shoot: "shoot1",
reload: "reload"
},
model: "./assets/smg/v_re4le5.mdl",
fireSound: "./assets/smg.ogg"
};
