import * as THREE from "three";
import { SourceModelLoader, parseSourceBones } from "./SourceModelLoader.js";
import { BinaryReader } from "./BinaryReader.js";
import { parseAnimations, describeSequences } from "./SourceAnimations.js";

// Animation-only MDLs need their .ani companion, but no VVD/VTX geometry.
// Raw libraries are shared by every character; failed requests can be retried.
const animationLibraries = new Map();
export const characterCacheKey = (src, asset = {}) => JSON.stringify([
  src, asset.source || {}, asset.animations || "", asset.animationSource || {},
  asset.anim || {}, asset.animationBase || "", asset.poseParameters || {}
]);

function characterBodygroupOptions(asset) {
  const bodygroups = {}, bodygroupVariants = {};
  for (const [name, configured] of Object.entries(asset.source?.bodygroups || {})) {
    if (Array.isArray(configured)) {
      if (!configured.length) throw new Error(`Character bodygroup ${name} requires at least one variant.`);
      bodygroups[name] = configured[0];
      bodygroupVariants[name] = configured;
    } else {
      bodygroups[name] = configured;
    }
  }
  return { ...asset.source, bodygroups, bodygroupVariants };
}

// Resolve arrays once at spawn; fixed numeric selections keep their old behavior.
export function pickCharacterBodygroups(asset = {}, random = Math.random) {
  return Object.fromEntries(Object.entries(asset.source?.bodygroups || {}).map(([name, configured]) => {
    if (!Array.isArray(configured)) return [name, configured];
    if (!configured.length) throw new Error(`Character bodygroup ${name} requires at least one variant.`);
    const choices = [...new Set(configured)];
    return [name, choices[Math.floor(random() * choices.length)]];
  }));
}

export function applyCharacterBodygroups(model, selections = {}) {
  const unused = [], retainedSkeletons = new Set();
  model.traverse(object => {
    const bodygroup = object.userData.sourceBodygroup;
    if (bodygroup && bodygroup.variant !== (selections[bodygroup.name] ?? selections[bodygroup.index] ?? 0)) {
      unused.push(object);
    } else {
      if (bodygroup) object.visible = true;
      if (object.isSkinnedMesh) retainedSkeletons.add(object.skeleton);
    }
  });
  const disposedSkeletons = new Set();
  for (const object of unused) {
    object.removeFromParent();
    // SkeletonUtils owns the cloned skeletons; geometry, materials and textures
    // still belong to the shared model pool and must not be disposed here.
    if (object.isSkinnedMesh && !retainedSkeletons.has(object.skeleton) && !disposedSkeletons.has(object.skeleton)) {
      object.skeleton.dispose();
      disposedSkeletons.add(object.skeleton);
    }
  }
}

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
      ...characterBodygroupOptions(asset), ...animationOptions,
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
