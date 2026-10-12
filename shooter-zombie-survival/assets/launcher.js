export const LAUNCHER = {
name: "Grenade Launcher",
attachment: "flashlight",
attachmentRotation: [0, Math.PI/2, 0],
muzzleFlash: "muzzle_flash",
shellEject: "",
behavior: {
magazineSize: 1,
damage: 200,
fireCooldownMs: 1000,
reloadSpeed: 1,
pellets: 1,
spread: 0,
projectile: "grenade"
},
anim: {
deploy: "deploy",
idle: "idle",
shoot: "fire",
reload: "reload"
},
model: "./assets/launcher/v_re2gl.mdl",
fireSound: "./assets/launcher.ogg"
};
