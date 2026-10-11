import { DFFLoader } from "./gta/DFFLoader.js";
import { TXDLoader } from "./gta/TXDLoader.js";
import { IFPLoader } from "./gta/IFPLoader.js";

const textureDictionaries = new Map();
export const characterCacheKey = (src, asset = {}) => JSON.stringify([src, asset.textures || ""]);

export async function loadCharacterAsset(src, asset = {}) {
  if (typeof src !== "string" || !/\.dff(?:[?#]|$)/i.test(src)) {
    throw new Error("Character models must use a .dff file.");
  }
  const textureSrc = asset.textures;
  if (typeof textureSrc !== "string" || !/\.txd(?:[?#]|$)/i.test(textureSrc)) {
    throw new Error(`DFF character ${src} needs a textures: "./assets/file.txd" setting.`);
  }
  let textures = textureDictionaries.get(textureSrc);
  if (!textures) {
    textures = new TXDLoader().loadAsync(textureSrc);
    textureDictionaries.set(textureSrc, textures);
    textures.catch(() => textureDictionaries.delete(textureSrc));
  }
  const dictionary = await textures;
  const scene = await new DFFLoader().setTextureDictionary(dictionary).loadAsync(src);
  return { scene };
}

export async function loadCharacterAnimations(src) {
  if (typeof src !== "string" || !/\.ifp(?:[?#]|$)/i.test(src)) {
    throw new Error("Character animations must use an .ifp file.");
  }
  return new IFPLoader().loadAsync(src);
}
