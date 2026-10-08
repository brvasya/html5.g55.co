export const SOLDIER = {
animations: "./assets/soldier.glb",
models: ["./assets/sas6.glb"],
weapon: "./assets/gun.glb",
muzzleFlash: "muzzle_flash",
weaponBone: "_R_Hand",
weaponRotation: [Math.PI/2, Math.PI/2, 0],
weaponScale: 1.2,
attackSound: "./assets/smg.ogg",
positionY: 1.1,
scale: [1.1, 1.1, -1.1],
enemyHealth: 100,
enemySpeed: [1.5, 3],
enemyDamage: 1,
attackDistance: [6, 12],
attackDamageDelay: 1,
anim: {
walk: ["GunMove_FWD"],
attack: ["Gun_stand"],
hit: ["HIT_L", "HIT_R", "HIT_back"],
headshot: ["KO_shot_face"],
death: ["KO_shot_front", "KO_spin_L", "KO_spin_R", "KO_skid_front", "KO_skid_back", "KO_shot_stom"]
},
};
