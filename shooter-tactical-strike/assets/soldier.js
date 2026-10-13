export const SOLDIER = {
animations: "./assets/m_anm.mdl",
models: ["./assets/soldier/sas_pm.mdl"],
source: {
bodygroups: {
head: [0, 1, 2],
gear: [0, 1, 2, 3, 4, 5],
upper: [0, 1],
lower: [0, 1]
}
},
poseParameters: { move_x: 1, move_y: 0, aim_yaw: 0, aim_pitch: 0 },
weapon: {
model: "./assets/rifle/w_iw5_m16a4.mdl",
anim: { idle: "idle" }
},
muzzleFlash: "muzzle",
weaponBone: "ValveBiped.Bip01_R_Hand",
weaponRotation: [-Math.PI/2, Math.PI/2, 0],
weaponScale: 1,
attackSound: "./assets/rifle.ogg",
scale: [0.032, 0.032, 0.032],
enemyHealth: 100,
enemySpeed: [1.5, 3],
enemyDamage: 1,
attackDistance: [6, 9, 12],
attackDamageDelay: 1,
animationBase: "idle_ar2",
anim: {
walk: ["walk_ar2", "run_ar2"],
attack: ["idle_ar2"],
hit: ["flinch_01", "flinch_02", "flinch_back_01"]
},
};
