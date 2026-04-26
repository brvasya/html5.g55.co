export function createHud() {
  injectHudStyles();

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

function injectHudStyles() {
  if (document.getElementById("csHudStyles")) return;

  const style = document.createElement("style");
  style.id = "csHudStyles";
  style.textContent = `
    .cs-hud {
      font-family: Impact, Haettenschweiler, 'Arial Narrow Bold', 'Trebuchet MS', Arial, sans-serif;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #f2d37b;
      text-shadow: 0 2px 0 #000, 0 0 10px rgba(255, 188, 64, 0.35);
    }

    .cs-hud #stats {
      position: static;
      padding: 0;
      background: transparent;
      border-radius: 0;
      line-height: 1;
      font-size: inherit;
      min-width: 0;
    }

    .cs-topbar {
      position: absolute;
      top: 14px;
      left: 50%;
      display: flex;
      align-items: center;
      gap: 14px;
      transform: translateX(-50%);
      padding: 8px 14px;
      background: linear-gradient(180deg, rgba(20, 18, 12, 0.88), rgba(0, 0, 0, 0.58));
      border: 1px solid rgba(242, 211, 123, 0.32);
      border-radius: 4px;
      box-shadow: 0 0 18px rgba(0, 0, 0, 0.6);
      font-size: 18px;
    }

    .cs-badge {
      color: #e8e8e8;
      font-size: 14px;
      opacity: 0.9;
    }

    .cs-score {
      min-width: 96px;
      text-align: center;
      color: #95e37f;
    }

    .cs-round {
      color: #f2d37b;
    }

    .cs-bottom-left,
    .cs-bottom-right {
      position: absolute;
      bottom: 24px;
      min-width: 155px;
      padding: 10px 14px 12px;
      background: linear-gradient(180deg, rgba(22, 20, 14, 0.82), rgba(0, 0, 0, 0.5));
      border: 1px solid rgba(242, 211, 123, 0.34);
      border-radius: 4px;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.68);
    }

    .cs-bottom-left { left: 28px; }

    .cs-bottom-right {
      right: 28px;
      text-align: right;
    }

    .cs-label {
      margin-bottom: 6px;
      color: rgba(255, 255, 255, 0.72);
      font-size: 13px;
      letter-spacing: 0.12em;
    }

    .cs-big,
    .cs-ammo {
      font-size: 48px;
      line-height: 0.9;
      color: #f2d37b;
    }

    .cs-ammo small {
      font-size: 22px;
      color: rgba(242, 211, 123, 0.75);
    }

    .cs-bottom-left.danger,
    .cs-bottom-right.danger {
      border-color: rgba(255, 95, 79, 0.55);
      text-shadow: 0 2px 0 #000, 0 0 12px rgba(255, 0, 0, 0.55);
    }

    .cs-bottom-left.danger .cs-big,
    .cs-bottom-right.danger .cs-ammo,
    .cs-bottom-right.danger small {
      color: #ff5f4f;
    }

    .cs-hud #crosshair {
      width: 42px;
      height: 42px;
      filter: none;
      transition: width 70ms ease, height 70ms ease;
      background:
        linear-gradient(#39ff14, #39ff14) center 0 / 2px 11px no-repeat,
        linear-gradient(#39ff14, #39ff14) center 100% / 2px 11px no-repeat,
        linear-gradient(#39ff14, #39ff14) 0 center / 11px 2px no-repeat,
        linear-gradient(#39ff14, #39ff14) 100% center / 11px 2px no-repeat;
      
    }

    .cs-hud #crosshair::before,
    .cs-hud #crosshair::after {
      display: none;
      content: none;
    }

    .cs-hud #crosshair.fire {
      width: 58px;
      height: 58px;
      background:
        linear-gradient(#39ff14, #39ff14) center 0 / 2px 12px no-repeat,
        linear-gradient(#39ff14, #39ff14) center 100% / 2px 12px no-repeat,
        linear-gradient(#39ff14, #39ff14) 0 center / 12px 2px no-repeat,
        linear-gradient(#39ff14, #39ff14) 100% center / 12px 2px no-repeat;
    }

    @media (max-width: 700px) {
      .cs-topbar { font-size: 14px; gap: 8px; }
      .cs-bottom-left,
      .cs-bottom-right { bottom: 16px; min-width: 118px; padding: 9px 11px; }
      .cs-bottom-left { left: 14px; }
      .cs-bottom-right { right: 14px; }
      .cs-big,
      .cs-ammo { font-size: 34px; }
    }
  `;

  document.head.appendChild(style);
}
