export const ZOMBIE = {
animations: "./assets/m_anm.mdl",
models: ["./assets/zombie/sas_pm.mdl"],
source: {
bodygroups: {
head: [0, 1, 2],
gear: [0, 1, 2, 3, 4, 5],
upper: [0, 1],
lower: [0, 1]
}
},
animationBase: "idle_ar2",
poseParameters: { move_x: 1, move_y: 0, aim_yaw: 0, aim_pitch: 0 },
attackSound: "./assets/rifle.ogg",
scale: [0.032, 0.032, 0.032],
enemyHealth: 100,
enemySpeed: [1.5, 3],
enemyDamage: 1,
attackDistance: 2,
attackDamageDelay: 1,
anim: {
walk: ["walk_ar2"],
attack: ["idle_ar2"],
hit: ["flinch_01", "flinch_02", "flinch_back_01"],
headshot: ["death_04"],
death: ["death_01", "death_02", "death_03"]
},
};
