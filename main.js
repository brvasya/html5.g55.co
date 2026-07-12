import { bootGame } from "./engine/main.js";
import { GAME_CONFIG, GAME_ASSETS } from "./gameConfig.js";

document.title = GAME_CONFIG.gameTitle;
document.querySelector("h1").textContent = GAME_CONFIG.gameTitle;
bootGame({ GAME_CONFIG, GAME_ASSETS });
