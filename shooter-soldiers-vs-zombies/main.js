import { GAME_CONFIG, GAME_ASSETS } from "./gameConfig.js";
import { importEngine } from "./engineLoader.js";

// The config-driven selector is complete before the first visible menu frame.
if (await window.mapMenuReady) {
  try {
    const [{ bootGame }, { renderGameTitle, controlsText }, { isTouchDevice }] = await Promise.all([
      importEngine("main.js"), importEngine("ui.js"), importEngine("touchControls.js")
    ]);
    renderGameTitle(document.querySelector("#panel h1"), document.title);
    // Preserve the head-selected HTML controls instead of replacing text after paint.
    const touch = isTouchDevice();
    const description = document.querySelector("#panel p");
    const initialCopy = description.querySelector(touch ? ".controls-touch" : ".controls-desktop");
    if (!initialCopy || initialCopy.textContent !== controlsText(touch)) {
      description.textContent = controlsText(touch);
    }
    document.body.classList.add("main-menu-active");
    document.getElementById("overlay").classList.add("main-menu");
    bootGame({ GAME_CONFIG, GAME_ASSETS });
  } catch (error) {
    await window.showGameLoadError(error);
  }
}
