import * as THREE from "three";
import { SourceModelLoader, parseSourceBones } from "./source/SourceModelLoader.js";
import { BinaryReader } from "./source/BinaryReader.js";
import { parseAnimations, describeSequences } from "./source/SourceAnimations.js";

// Animation-only MDLs need their .ani companion, but no VVD/VTX geometry.
// Raw libraries are shared by every character; failed requests can be retried.
const animationLibraries = new Map();
export const characterCacheKey = (src, asset = {}) => JSON.stringify([
  src, asset.source || {}, asset.animations || "", asset.animationSource || {},
  asset.anim || {}, asset.animationBase || "", asset.poseParameters || {}
]);

export async function loadCharacterAnimations(src, options = {}) {
  if (typeof src !== "string" || !/\.mdl(?:[?#]|$)/i.test(src)) {
    throw new Error("Character animation libraries must use a Source .mdl file.");
  }
  const key = JSON.stringify([src, options.ani || ""]);
  if (!animationLibraries.has(key)) {
    const promise = (async () => {
      const read = path => new THREE.FileLoader().setResponseType("arraybuffer").loadAsync(path);
      const mdl = new BinaryReader(await read(src), src);
      new SourceModelLoader().validateHeader(mdl);
      let ani = null;
      if (mdl.i32(352) > 1) {
        mdl.table(mdl.i32(356), mdl.i32(352), 8);
        const filename = mdl.string(mdl.i32(348)).replaceAll("\\", "/").split("/").pop();
        const companion = options.ani || (filename
          ? src.slice(0, src.lastIndexOf("/") + 1) + filename
          : src.replace(/\.mdl(?=([?#]|$))/i, ".ani"));
        ani = new BinaryReader(await read(companion), companion);
      }
      return { mdl, ani, bones: parseSourceBones(mdl), sequences: describeSequences(mdl).map(seq => seq.name) };
    })();
    animationLibraries.set(key, promise);
    promise.catch(() => animationLibraries.delete(key));
  }
  return animationLibraries.get(key);
}

export async function loadCharacterAsset(src, asset = {}) {
  if (typeof src !== "string" || !/\.mdl(?:[?#]|$)/i.test(src)) {
    throw new Error("Character models must use a Source/Garry's Mod .mdl file.");
  }
  const names = [...new Set(Object.values(asset.anim || {}).flat()
    .filter(name => typeof name === "string" && name.trim()).map(name => name.trim()))];
  const animationOptions = {
    animations: names,
    poseParameters: asset.poseParameters || { move_x: 1, move_y: 0 },
    baseSequence: asset.animationBase
  };
  const [result, library] = await Promise.all([
    new SourceModelLoader().loadAsync(src, {
      ...asset.source, ...animationOptions,
      animations: asset.animations ? [] : names
    }),
    asset.animations ? loadCharacterAnimations(asset.animations, asset.animationSource) : null
  ]);
  if (library) {
    const parsed = parseAnimations(library.mdl, library.bones,
      { ...animationOptions, targetBones: result.boneData }, library.ani);
    result.animations = parsed.clips;
    result.warnings.push(...parsed.warnings);
    result.metadata.sequences = library.sequences;
    result.metadata.animationLibrary = asset.animations;
  }
  // Keep the native Source axis conversion inside an outer placement group.
  // Enemy scale/rotation edits must never overwrite the Z-up -> Y-up transform.
  const scene = new THREE.Group();
  scene.name = "SourceCharacter";
  scene.userData.source = result.metadata;
  scene.add(result.scene);
  return { ...result, scene };
}

export function findCharacterBone(model, name) {
  const wanted = THREE.PropertyBinding.sanitizeNodeName(String(name)).toLowerCase();
  let result = null;
  model.traverse(bone => {
    if (!result && bone.isBone && bone.name.toLowerCase() === wanted) result = bone;
  });
  return result;
}
