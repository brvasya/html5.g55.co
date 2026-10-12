export const PISTOL = {
name: "Pistol",
attachment: "flashlight",
attachmentRotation: [0, Math.PI/2, 0],
muzzleFlash: "muzzle_flash",
shellEject: "shell",
behavior: {
magazineSize: 20,
damage: 25,
fireCooldownMs: 200,
reloadSpeed: 1,
pellets: 1,
spread: 0.025,
},
anim: {
deploy: "deploy",
idle: "idle",
shoot: "fire",
reload: "reload_empty"
},
model: "./assets/pistol/v_re4usp.mdl",
fireSound: "./assets/pistol.ogg"
};
