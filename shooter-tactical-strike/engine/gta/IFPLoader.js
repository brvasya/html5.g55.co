import * as THREE from "three";

// Native GTA San Andreas ANP3 packages (including ped.ifp). Parsed animation
// data is shared; Three.js tracks are bound to each DFF's HAnim bone IDs.
export class IFPLoader extends THREE.Loader {
  load(url, onLoad, onProgress, onError) {
    new THREE.FileLoader(this.manager).setPath(this.path)
      .setRequestHeader(this.requestHeader).setWithCredentials(this.withCredentials)
      .setResponseType("arraybuffer").load(url, buffer => {
        try { onLoad(this.parse(buffer)); }
        catch (error) {
          this.manager.itemError(url);
          if (onError) onError(error);
          else console.error(error);
        }
      }, onProgress, onError);
  }

  parse(buffer) {
    const view = new DataView(buffer);
    let offset = 0;
    const requireBytes = count => {
      if (!Number.isSafeInteger(count) || count < 0 || offset + count > view.byteLength) {
        throw new Error(`IFPLoader: truncated or invalid data at byte ${offset}.`);
      }
    };
    const string = size => {
      requireBytes(size);
      let result = "";
      for (let i = 0; i < size && view.getUint8(offset + i) !== 0; i++) result += String.fromCharCode(view.getUint8(offset + i));
      offset += size;
      return result;
    };
    const u32 = () => { requireBytes(4); const v = view.getUint32(offset, true); offset += 4; return v; };
    const i16 = () => { requireBytes(2); const v = view.getInt16(offset, true); offset += 2; return v; };
    const f32 = () => { requireBytes(4); const v = view.getFloat32(offset, true); offset += 4; return v; };
    const magic = string(4);
    if (magic !== "ANP3") throw new Error(`IFPLoader: unsupported ${magic} package; use a GTA SA ANP3 IFP.`);
    const declaredSize = u32();
    if (declaredSize + 8 > view.byteLength) throw new Error("IFPLoader: truncated package.");
    const name = string(24);
    const count = u32();
    requireBytes(count * 36);
    const animations = [];
    for (let i = 0; i < count; i++) {
      const clipName = string(24);
      const boneCount = u32();
      u32(); // Total keyframe data bytes, excluding sequence headers.
      u32(); // Package compression flags; each track specifies its own layout.
      requireBytes(boneCount * 36);
      const sequences = [];
      let duration = 0;
      for (let j = 0; j < boneCount; j++) {
        const boneName = string(24);
        const type = u32();
        const frames = u32();
        const boneId = u32() | 0;
        const frameSize = {1: 20, 2: 32, 3: 10, 4: 16}[type];
        if (!frameSize) throw new Error(`IFPLoader: unsupported keyframe type ${type}.`);
        requireBytes(frames * frameSize);
        const compressed = type >= 3;
        const hasPosition = type === 2 || type === 4;
        const times = new Float32Array(frames);
        const rotations = new Float32Array(frames * 4);
        const positions = hasPosition ? new Float32Array(frames * 3) : null;
        const quaternion = new THREE.Quaternion();
        for (let k = 0; k < frames; k++) {
          const scalar = () => compressed ? i16() / 4096 : f32();
          quaternion.set(scalar(), scalar(), scalar(), scalar());
          const time = compressed ? i16() / 60 : f32();
          if (!quaternion.toArray().every(Number.isFinite) || quaternion.lengthSq() < 1e-12 ||
              !Number.isFinite(time) || time < 0 || (k && time < times[k - 1] - 1e-5)) {
            throw new Error(`IFPLoader: invalid keyframe in ${clipName}/${boneName}.`);
          }
          quaternion.normalize();
          // Keep equivalent quaternion signs continuous for interpolation.
          if (k && rotations[k * 4 - 4] * quaternion.x + rotations[k * 4 - 3] * quaternion.y +
              rotations[k * 4 - 2] * quaternion.z + rotations[k * 4 - 1] * quaternion.w < 0) {
            quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
          }
          quaternion.toArray(rotations, k * 4);
          times[k] = time;
          duration = Math.max(duration, time);
          if (positions) {
            for (let axis = 0; axis < 3; axis++) {
              // SA compressed translation uses 1/1024 units, NOT 1/4096.
              const value = compressed ? i16() / 1024 : f32();
              if (!Number.isFinite(value)) throw new Error(`IFPLoader: invalid position in ${clipName}.`);
              positions[k * 3 + axis] = value;
            }
          }
        }
        if (frames) sequences.push({boneName, boneId, times, rotations, positions});
      }
      animations.push({name: clipName, duration, sequences});
    }
    return {name, animations};
  }
}

const normalizeName = name => String(name).toLowerCase().replace(/[^a-z0-9]/g, "")
  .replace(/^(bip0?1|normal)/, "");
const PED_BONE_IDS = {
  root: 0, pelvis: 1, spine: 2, spine1: 3, neck: 4, head: 5, lbrow: 6, rbrow: 7, jaw: 8,
  rclavicle: 21, rupperarm: 22, rforearm: 23, rhand: 24, rfinger: 25, rfingers: 25, rfinger0: 25, rfinger01: 26,
  lclavicle: 31, lupperarm: 32, lforearm: 33, lhand: 34, lfinger: 35, lfingers: 35, lfinger0: 35, lfinger01: 36,
  lthigh: 41, lcalf: 42, lfoot: 43, ltoe0: 44, rthigh: 51, rcalf: 52, rfoot: 53, rtoe0: 54,
  belly: 201, rbreast: 301, lbreast: 302
};

export function createIFPClips(library, model, clipNames = null) {
  if (!model.userData.gtaDff) throw new Error("IFPLoader: IFP clips require a DFF character.");
  const byId = new Map(), byName = new Map();
  model.traverse(bone => {
    if (!bone.isBone) return;
    const id = bone.userData.gtaBoneId;
    if (id !== undefined) {
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(bone);
    }
    const name = normalizeName(bone.userData.gtaBoneName || bone.name);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(bone);
  });
  const wanted = clipNames ? new Set(clipNames.map(name => name.trim().toLowerCase())) : null;
  return library.animations.filter(animation => !wanted || wanted.has(animation.name.toLowerCase())).map(animation => {
    const tracks = [];
    for (const sequence of animation.sequences) {
      const name = normalizeName(sequence.boneName);
      const id = sequence.boneId >= 0 ? sequence.boneId : (name === "" ? 0 : PED_BONE_IDS[name]);
      const bones = byId.get(id) || byName.get(name) || [];
      for (const bone of bones) {
        // UUIDs bind unambiguously even when a DFF contains multiple skins.
        tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.uuid}.quaternion`, sequence.times, sequence.rotations));
        if (sequence.positions) {
          tracks.push(new THREE.VectorKeyframeTrack(`${bone.uuid}.position`, sequence.times, sequence.positions));
        } else if (bone.userData.gtaBoneId === 0) {
          // Rotation-only clips must reset the root translation after a hit or
          // walk clip. A bind-position track avoids a crossfade back to a stale pose.
          tracks.push(new THREE.VectorKeyframeTrack(`${bone.uuid}.position`, [0], bone.position.toArray()));
        }
      }
    }
    return new THREE.AnimationClip(animation.name, animation.duration, tracks);
  }).filter(clip => clip.tracks.length);
}

export function findGTABone(model, target) {
  let result = null;
  const name = normalizeName(target);
  model.traverse(bone => {
    if (result || !bone.isBone) return;
    if ((typeof target === "number" && bone.userData.gtaBoneId === target) ||
        normalizeName(bone.userData.gtaBoneName || bone.name) === name) result = bone;
  });
  return result;
}
