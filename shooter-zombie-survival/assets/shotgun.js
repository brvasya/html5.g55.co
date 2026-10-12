export const SHOTGUN = {
name: "Shotgun",
attachment: "flashlight",
attachmentRotation: [0, Math.PI/2, 0],
muzzleFlash: "muzzle_flash",
shellEject: "shell",
behavior: {
magazineSize: 5,
damage: 25,
fireCooldownMs: 1000,
reloadSpeed: 1,
pellets: 6,
spread: 0.1,
},
anim: {
deploy: "deploy",
idle: "idle",
shoot: "fire",
reload: ["reload", "reload_loop", "reload_end"]
},
model: "./assets/shotgun/v_re4870.mdl",
fireSound: "./assets/shotgun.ogg"
};
