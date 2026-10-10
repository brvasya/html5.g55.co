export const LAUNCHER = {
name: "Grenade Launcher",
view: {
rotOffset: [0, -Math.PI, 0]
},
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
idle: "ta_trans_idle",
shoot: "fire",
reload: "reload"
},
model: "./assets/launcher.glb",
fireSound: "./assets/launcher.ogg"
};
