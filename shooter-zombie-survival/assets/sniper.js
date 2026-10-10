export const SNIPER = {
name: "Sniper Rifle",
attachment: "flashlight",
attachmentRotation: [0, Math.PI/2, 0],
muzzleFlash: "muzzle_flash",
shellEject: "shell",
behavior: {
magazineSize: 10,
damage: 100,
fireCooldownMs: 1000,
reloadSpeed: 1,
pellets: 1,
spread: 0,
isSniper: true
},
anim: {
idle: "a_idle_1",
shoot: "shoot",
reload: ["reload", "reload_1", "reload_end"]
},
model: "./assets/sniper.glb",
fireSound: "./assets/sniper.ogg"
};
