export const SMG = {
name: "SMG",
view: {
posOffset: [0, 0, 0],
rotOffset: [0, -Math.PI, 0],
scl: [1, 1, 1]
},
behavior: {
magazineSize: 50,
damage: 25,
fireCooldownMs: 90,
reloadSpeed: 1,
pellets: 1,
spread: 0.05,
},
shellEject: {
boneName: "Dummy01",
},
anim: {
idle: [0, 0],
shoot: [5, 20],
reload: [25, 160]
},
model: "./assets/weapon/v_p90.glb",
fireSound: "./assets/weapon/v_p90.ogg"
};
