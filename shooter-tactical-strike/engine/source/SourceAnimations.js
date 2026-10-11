import * as THREE from "three";

const RAW_POS = 1, RAW_ROT = 2, ANIM_POS = 4, ANIM_ROT = 8, DELTA = 16, RAW_ROT64 = 32;
const euler = new THREE.Euler(0, 0, 0, "ZYX");

function half(value) { return THREE.DataUtils.fromHalfFloat(value); }

function packedQuaternion(reader, offset, wide) {
  let x, y, z, negative;
  if (wide) {
    // Decode 21/21/21/1 bits without losing precision to a JS 64-bit number.
    const low = reader.u32(offset), high = reader.u32(offset + 4);
    x = ((low & 0x1fffff) - 1048576) / 1048576.5;
    y = (((low >>> 21) | ((high & 1023) << 11)) - 1048576) / 1048576.5;
    z = (((high >>> 10) & 0x1fffff) - 1048576) / 1048576.5;
    negative = high >>> 31;
  } else {
    x = (reader.u16(offset) - 32768) / 32768;
    y = (reader.u16(offset + 2) - 32768) / 32768;
    const last = reader.u16(offset + 4);
    z = ((last & 32767) - 16384) / 16384;
    negative = last >>> 15;
  }
  const w = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z)) * (negative ? -1 : 1);
  return new THREE.Quaternion(x, y, z, w).normalize();
}

function channelValue(reader, ptr, axis, frame) {
  const relative = reader.i16(ptr + axis * 2);
  if (relative <= 0) return 0;
  let cursor = ptr + relative, remaining = frame;
  for (;;) {
    const valid = reader.u8(cursor), total = reader.u8(cursor + 1);
    if (!total || valid > total || !valid) throw new Error(`${reader.label}: invalid animation RLE span.`);
    if (remaining < total) return reader.i16(cursor + 2 * (Math.min(remaining, valid - 1) + 1));
    remaining -= total;
    cursor += (valid + 1) * 2;
  }
}

function readRecords(reader, offset, boneCount) {
  const records = new Map();
  if (!offset) return records;
  let cursor = offset;
  for (let count = 0; count <= boneCount; count++) {
    const index = reader.u8(cursor);
    if (index === 255) return records;
    if (index >= boneCount || records.has(index)) throw new Error(`${reader.label}: invalid animation bone chain.`);
    records.set(index, cursor);
    const next = reader.i16(cursor + 2);
    if (!next) return records;
    if (next < 4) throw new Error(`${reader.label}: invalid animation record offset.`);
    cursor += next;
  }
  throw new Error(`${reader.label}: unterminated animation bone chain.`);
}

function sampleBone(reader, record, frame, bone) {
  if (record === undefined) return { position: bone.position.clone(), quaternion: bone.quaternion.clone() };
  const flags = reader.u8(record + 1), data = record + 4;
  if (flags & 0xc0) throw new Error(`${reader.label}: unsupported animation encoding ${flags}.`);
  const delta = Boolean(flags & DELTA);
  let position = delta ? new THREE.Vector3() : bone.position.clone();
  let quaternion = delta ? new THREE.Quaternion() : bone.quaternion.clone();
  if (flags & RAW_ROT64) quaternion = packedQuaternion(reader, data, true);
  else if (flags & RAW_ROT) quaternion = packedQuaternion(reader, data, false);
  else if (flags & ANIM_ROT) {
    const angles = bone.rotation.map((base, axis) => channelValue(reader, data, axis, frame) * bone.rotationScale[axis] + (delta ? 0 : base));
    quaternion.setFromEuler(euler.set(...angles, "ZYX"));
  }
  if (flags & RAW_POS) {
    const ptr = data + ((flags & RAW_ROT) ? 6 : 0) + ((flags & RAW_ROT64) ? 8 : 0);
    position.set(half(reader.u16(ptr)), half(reader.u16(ptr + 2)), half(reader.u16(ptr + 4)));
  } else if (flags & ANIM_POS) {
    const ptr = data + ((flags & ANIM_ROT) ? 6 : 0);
    position.fromArray(bone.positionScale.map((scale, axis) => channelValue(reader, ptr, axis, frame) * scale + (delta ? 0 : bone.position.getComponent(axis))));
  }
  if (delta) {
    position.add(bone.position);
    quaternion.premultiply(bone.quaternion).normalize();
  }
  return { position, quaternion };
}

export function describeSequences(reader) {
  const count = reader.i32(188), start = reader.i32(192);
  reader.table(start, count, 212);
  return Array.from({ length: count }, (_, index) => {
    const offset = start + index * 212;
    return { name: reader.relativeString(offset, 4), offset, flags: reader.i32(offset + 12) };
  });
}

export function parseAnimations(mdl, bones, options = {}, ani = null) {
  const count = mdl.i32(180), start = mdl.i32(184);
  mdl.table(start, count, 100);
  const requested = options.animations ? new Set(options.animations.map(name => name.toLowerCase())) : null;
  const sequences = describeSequences(mdl);
  const clips = [], warnings = [];
  for (const sequence of sequences) {
    if (requested && !requested.has(sequence.name.toLowerCase())) continue;
    const seq = sequence.offset;
    try {
      if (mdl.i32(seq + 56) !== 1 || mdl.i32(seq + 148) || (sequence.flags & 4)) {
        throw new Error("pose-parameter blends, sequence layers, and additive sequences are not supported");
      }
      const animIndex = mdl.i16(seq + mdl.i32(seq + 60));
      if (animIndex < 0 || animIndex >= count) throw new Error("animation is in an external included model");
      const desc = start + animIndex * 100;
      const frames = mdl.i32(desc + 16), fps = mdl.f32(desc + 8);
      if (frames < 1 || frames > 100000 || fps <= 0) throw new Error("invalid animation frame count/rate");
      if (mdl.i32(desc + 12) & (4 | 64)) throw new Error("additive/frame-encoded animation is not supported");
      if (mdl.i32(desc + 72)) throw new Error("animated local hierarchy is not supported");
      const sectionFrames = mdl.i32(desc + 84), sections = desc + mdl.i32(desc + 80);
      const cache = new Map();
      const samples = bones.map(() => ({ positions: [], quaternions: [] }));
      const times = Array.from({ length: frames }, (_, frame) => frame / fps);
      const weightOffset = mdl.i32(seq + 156);
      for (let frame = 0; frame < frames; frame++) {
        let localFrame = frame, block = mdl.i32(desc + 52), offset = mdl.i32(desc + 56);
        if (sectionFrames > 0) {
          const last = frames > sectionFrames && frame === frames - 1;
          const section = last ? Math.floor(frames / sectionFrames) + 1 : Math.floor(frame / sectionFrames);
          localFrame = last ? 0 : frame % sectionFrames;
          block = mdl.i32(sections + section * 8);
          offset = mdl.i32(sections + section * 8 + 4);
        }
        let reader = mdl, base = desc;
        if (block < 0) throw new Error("missing compiled animation block");
        if (block > 0) {
          if (!ani) throw new Error("external .ani file is required");
          if (block >= mdl.i32(352)) throw new Error("invalid external animation block");
          reader = ani;
          const entry = mdl.i32(356) + block * 8;
          base = mdl.i32(entry);
          reader.check(base, mdl.i32(entry + 4) - base);
        }
        const key = `${block}:${offset}`;
        if (!cache.has(key)) cache.set(key, readRecords(reader, offset ? base + offset : 0, bones.length));
        const records = cache.get(key);
        for (let index = 0; index < bones.length; index++) {
          const bone = bones[index];
          const pose = sampleBone(reader, records.get(index), localFrame, bone);
          const weight = weightOffset ? mdl.f32(seq + weightOffset + index * 4) : 1;
          if (weight !== 1) {
            pose.position.lerpVectors(bone.position, pose.position, Math.max(0, Math.min(1, weight)));
            pose.quaternion.copy(bone.quaternion.clone().slerp(pose.quaternion, Math.max(0, Math.min(1, weight))));
          }
          samples[index].positions.push(...pose.position.toArray());
          samples[index].quaternions.push(...pose.quaternion.toArray());
        }
      }
      const tracks = [];
      bones.forEach((bone, index) => {
        tracks.push(new THREE.VectorKeyframeTrack(`${bone.name}.position`, times, samples[index].positions));
        tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, samples[index].quaternions));
      });
      clips.push(new THREE.AnimationClip(sequence.name, Math.max(1, frames - 1) / fps, tracks).optimize());
    } catch (error) {
      const message = `Source sequence "${sequence.name}": ${error.message}`;
      if (requested) throw new Error(message);
      warnings.push(message);
    }
  }
  if (requested) {
    for (const name of requested) {
      if (!clips.some(clip => clip.name.toLowerCase() === name)) throw new Error(`Source animation "${name}" is missing. Available: ${sequences.map(s => s.name).join(", ")}`);
    }
  }
  return { clips, warnings };
}
