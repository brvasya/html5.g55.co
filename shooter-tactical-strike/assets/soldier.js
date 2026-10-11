export const SOLDIER = {
animations: "./assets/ped.ifp",
textures: "./assets/sas.txd",
models: ["./assets/sas1.dff", "./assets/sas2.dff", "./assets/sas3.dff", "./assets/sas4.dff", "./assets/sas5.dff", "./assets/sas6.dff"],
weapon: {
model: "./assets/w_iw5_m16a4.mdl",
anim: { idle: "idle" }
},
muzzleFlash: "muzzle",
weaponBone: 24,
weaponRotation: [Math.PI/2, Math.PI/2, 0],
weaponScale: 0.02286,
attackSound: "./assets/rifle.ogg",
positionY: 1.1,
scale: [1.1, 1.1, -1.1],
enemyHealth: 100,
enemySpeed: [1.5, 3],
enemyDamage: 1,
attackDistance: [6, 9, 12],
attackDamageDelay: 1,
anim: {
walk: ["GunMove_FWD"],
attack: ["Gun_stand"],
hit: ["HIT_L", "HIT_R", "HIT_back"],
headshot: ["KO_shot_face"],
death: ["KO_shot_front", "KO_spin_L", "KO_spin_R", "KO_skid_front", "KO_skid_back", "KO_shot_stom"]
},
};
