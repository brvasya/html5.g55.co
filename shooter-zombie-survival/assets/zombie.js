export const ZOMBIE = {
animations: "./assets/anim_common.mdl",
models: ["./assets/zombie/common_male_suit.mdl", "./assets/zombie/common_police_male01.mdl"],
poseParameters: { move_x: 1, move_y: 0, aim_yaw: 0, aim_pitch: 0 },
attackSound: "./assets/zombie.ogg",
scale: [0.03, 0.03, 0.03],
enemyHealth: 100,
enemySpeed: [1.5, 3],
enemyDamage: 1,
attackDistance: 2,
attackDamageDelay: 0.5,
animationBase: "Idle",
anim: {
walk: ["Run_OnFire", "Run_OnFire_01"],
attack: ["Melee_Moving01"],
hit: ["Flinch_01"]
},
};
