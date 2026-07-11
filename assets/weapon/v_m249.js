export const MACHINE_GUN = {
name: "Machine Gun",
view: {
posOffset: [0, 0, 0],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
magazineSize: 100,
damage: 35,
fireCooldownMs: 90,
reloadSpeed: 1,
pellets: 1,
spread: 0.05,
},
shellEject: {
boneName: "Bone58",
},
anim: {
idle: [0, 0],
shoot: [5, 20],
reload: [25, 166]
},
model: "./assets/weapon/v_m249.glb",
fireSound: "./assets/weapon/v_m249.ogg"
};
