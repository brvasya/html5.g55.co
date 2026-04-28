export function createHud() {
  const hud = document.getElementById("hud");
  const stats = document.getElementById("stats");
  const crosshair = document.getElementById("crosshair");

  stats.innerHTML = `
    <div class="cs-topbar">
      <div class="cs-badge">ENEMIES <span id="enemiesLeft">0</span></div>
      <div class="cs-score">$<span id="score">0</span></div>
      <div class="cs-round">WAVE <span id="wave">1</span></div>
    </div>
    <div class="cs-bottom-left">
      <div class="cs-label">HEALTH</div>
      <div class="cs-big"><span id="health">100</span></div>
    </div>
    <div class="cs-bottom-right">
      <div class="cs-label"><span id="weaponSlot">1</span> · <span id="weaponName">WEAPON</span></div>
      <div class="cs-ammo"><span id="ammo">30</span><small>/ <span id="reserve">90</span></small></div>
    </div>
  `;

  const refs = {
    health: document.getElementById("health"),
    ammo: document.getElementById("ammo"),
    reserve: document.getElementById("reserve"),
    score: document.getElementById("score"),
    wave: document.getElementById("wave"),
    enemiesLeft: document.getElementById("enemiesLeft"),
    weaponSlot: document.getElementById("weaponSlot"),
    weaponName: document.getElementById("weaponName")
  };

  hud.classList.add("cs-hud");

  function setCrosshairFire() {
    crosshair.classList.remove("fire");
    void crosshair.offsetWidth;
    crosshair.classList.add("fire");
    setTimeout(() => crosshair.classList.remove("fire"), 120);
  }

  function update(state) {
    refs.health.textContent = state.health;
    refs.ammo.textContent = state.ammo;
    refs.reserve.textContent = state.reserveAmmo;
    refs.score.textContent = state.score;
    refs.wave.textContent = state.wave;
    refs.enemiesLeft.textContent = state.enemiesLeft ?? 0;
    refs.weaponSlot.textContent = state.weaponSlot ?? 1;
    refs.weaponName.textContent = state.weaponName ?? "WEAPON";

    refs.health.closest(".cs-bottom-left").classList.toggle("danger", state.health <= 30);
    refs.ammo.closest(".cs-bottom-right").classList.toggle("danger", state.ammo <= 5);
  }

  return { update, setCrosshairFire };
}
