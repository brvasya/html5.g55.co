import { SourceModelLoader } from "./source/SourceModelLoader.js";

// Player weapons, enemy weapons and shared hands all use native Source models.
export async function loadWeaponAsset(asset, { hands = false } = {}) {
  if (typeof asset?.model !== "string" || !/\.mdl(?:[?#]|$)/i.test(asset.model)) {
    throw new Error(`${hands ? "Shared hands" : "Weapon models"} must use a .mdl file.`);
  }
  const animations = hands ? [] : [...new Set(
    Object.values(asset.anim || {}).flat().filter(name => typeof name === "string")
  )];
  return new SourceModelLoader().loadAsync(asset.model, { ...asset.source, animations });
}
