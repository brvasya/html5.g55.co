export function createHud() {
  const hud = document.getElementById("hud");
  const stats = document.getElementById("stats");
  const crosshair = document.getElementById("crosshair");

  // HUD structure moved to index.html for better performance and no reflow
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

  let buyCallback = null;
  let buyCloseCallback = null;

  const buyMenu = document.createElement("div");
  buyMenu.id = "buyMenu";
  buyMenu.className = "cs-buy-menu";
  buyMenu.innerHTML = `
    <div class="cs-buy-panel">
      <div class="cs-buy-head">
        <div>
          <div class="cs-buy-title">Buy Weapons</div>
          <div class="cs-buy-subtitle">Press B to close</div>
        </div>
        <button id="buyMenuClose" class="cs-buy-close" type="button">×</button>
      </div>
      <div class="cs-buy-score">$<span id="buyMenuScore">0</span></div>
      <div id="buyMenuGrid" class="cs-buy-grid"></div>
    </div>
  `;
  document.body.appendChild(buyMenu);

  const buyHint = document.createElement("div");
  buyHint.id = "buyHint";
  buyHint.textContent = "PRESS B TO BUY WEAPONS";
  document.body.appendChild(buyHint);

  const buyMenuGrid = buyMenu.querySelector("#buyMenuGrid");
  const buyMenuScore = buyMenu.querySelector("#buyMenuScore");
  const buyMenuClose = buyMenu.querySelector("#buyMenuClose");

  hud.classList.add("cs-hud");

  buyMenu.addEventListener("click", event => {
    if (event.target === buyMenu) requestBuyMenuClose();
  });

  buyMenuClose.addEventListener("click", requestBuyMenuClose);

  buyMenuGrid.addEventListener("click", event => {
    const button = event.target.closest("[data-buy-slot]");
    if (!button || !buyCallback) return;
    buyCallback(Number(button.dataset.buySlot));
  });

  function setBuyCallback(callback) {
    buyCallback = callback;
  }

  function setBuyCloseCallback(callback) {
    buyCloseCallback = callback;
  }

  function requestBuyMenuClose() {
    if (buyCloseCallback) {
      buyCloseCallback();
      return;
    }

    hideBuyMenu();
  }

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

  function updateBuyMenu({ score, weapons }) {
    buyMenuScore.textContent = score;

    buyMenuGrid.innerHTML = weapons.map(weapon => {
      const canBuy = !weapon.owned && score >= weapon.price;
      const priceClass = canBuy ? "affordable" : "expensive";
      const status = weapon.active
        ? '<span class="cs-buy-owned-text">ACTIVE</span>'
        : weapon.owned
          ? '<span class="cs-buy-owned-text">OWNED</span>'
          : `<span class="cs-buy-price ${priceClass}">$${weapon.price}</span>`;
      const actionText = weapon.owned ? "Select" : "Buy";
      const disabled = weapon.active || (!weapon.owned && !canBuy) ? "disabled" : "";
      const stateClass = weapon.active ? "active" : weapon.owned ? "owned" : canBuy ? "available" : "locked";

      return `
        <button class="cs-buy-card ${stateClass}" data-buy-slot="${weapon.id}" type="button" ${disabled}>
          <span class="cs-buy-key">${weapon.id}</span>
          <span class="cs-buy-name">${weapon.name}</span>
          <span class="cs-buy-stats">${weapon.damage} DMG · ${weapon.magazineSize} MAG</span>
          <span class="cs-buy-status">${status}</span>
          <span class="cs-buy-action">${actionText}</span>
        </button>
      `;
    }).join("");
  }

  function showBuyMenu() {
    buyMenu.classList.add("open");
    buyHint.classList.add("hidden");
  }

  function hideBuyMenu() {
    buyMenu.classList.remove("open");
    buyHint.classList.remove("hidden");
  }

  function isBuyMenuOpen() {
    return buyMenu.classList.contains("open");
  }

  return {
    update,
    setCrosshairFire,
    setBuyCallback,
    setBuyCloseCallback,
    updateBuyMenu,
    showBuyMenu,
    hideBuyMenu,
    isBuyMenuOpen
  };
}
