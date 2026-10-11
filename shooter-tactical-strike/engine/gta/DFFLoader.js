import * as THREE from "three";
import DFFReader from "./Reader.js";

// PC RenderWare skinned characters. HAnim IDs identify animation targets;
// HAnim nodeIndex identifies the slot used by the vertex skin indices.
export class DFFLoader extends THREE.Loader {
  setTextureDictionary(textures) {
    this.textures = textures;
    return this;
  }

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
    const clump = new DFFReader().parse(buffer);
    if (!clump?.RWFrameList || !clump.RWGeometryList || !clump.RWAtomicList) {
      throw new Error("DFFLoader: missing model clump.");
    }
    const model = new THREE.Group();
    model.name = "GTACharacter";
    model.userData.gtaDff = true;
    const rw = new THREE.Group();
    rw.name = "RenderWareCoordinates";
    model.add(rw);
    const frames = clump.RWFrameList;
    const frameById = new Map();
    frames.forEach((frame, index) => {
      const id = frame.RWExtension?.CHUNK_HANIM?.nodeId;
      if (id !== undefined && id !== 0xffffffff) frameById.set(id, index);
    });

    for (const atomic of clump.RWAtomicList) {
      const source = clump.RWGeometryList[atomic.geometryIndex];
      if (!source) throw new Error("DFFLoader: invalid geometry index.");
      const geometry = this.makeGeometry(source);
      const materials = source.RWMaterialList.map(entry => this.makeMaterial(entry.RWMaterial, source));
      const skin = source.RWExtension?.CHUNK_SKIN;
      if (!skin) {
        const mesh = new THREE.Mesh(geometry, materials);
        const world = new THREE.Matrix4();
        let index = atomic.frameIndex;
        const visited = new Set();
        while (index >= 0) {
          if (!frames[index] || visited.has(index)) throw new Error("DFFLoader: invalid frame hierarchy.");
          visited.add(index);
          const f = frames[index].RWFrame, r = f.rotationMatrix, p = f.position;
          world.premultiply(new THREE.Matrix4().set(
            r[0], r[3], r[6], p[0], r[1], r[4], r[7], p[1],
            r[2], r[5], r[8], p[2], 0, 0, 0, 1));
          index = f.parentIndex;
        }
        mesh.applyMatrix4(world);
        rw.add(mesh);
        continue;
      }

      const hierarchy = frames.map(frame => frame.RWExtension?.CHUNK_HANIM)
        .find(h => h?.numNodes === skin.numBones && h.nodes.every(n => frameById.has(n.nodeId)));
      if (!hierarchy) throw new Error("DFFLoader: no matching HAnim skin hierarchy.");
      const bones = new Array(skin.numBones);
      const boneByFrame = new Map();
      const inverseBinds = skin.skinToBoneMatrix.map(values => {
        // RenderWare stores flags in the last column of its 4x3 matrices.
        const matrix = new THREE.Matrix4().fromArray(values);
        matrix.elements[3] = matrix.elements[7] = matrix.elements[11] = 0;
        matrix.elements[15] = 1;
        if (!matrix.elements.every(Number.isFinite) || Math.abs(matrix.determinant()) < 1e-10) {
          throw new Error("DFFLoader: invalid skin inverse bind matrix.");
        }
        return matrix;
      });
      const bindWorld = inverseBinds.map(matrix => matrix.clone().invert());
      for (const node of hierarchy.nodes) {
        if (node.nodeIndex >= bones.length || bones[node.nodeIndex]) throw new Error("DFFLoader: invalid HAnim bone index.");
        const frameIndex = frameById.get(node.nodeId);
        const bone = new THREE.Bone();
        const sourceName = frames[frameIndex].RWExtension?.CHUNK_FRAME || `Bone_${node.nodeId}`;
        // Include the ID to keep duplicate display names safe for clip binding.
        bone.name = `GTA_${node.nodeId}_${THREE.PropertyBinding.sanitizeNodeName(sourceName)}`;
        bone.userData.gtaBoneId = node.nodeId;
        bone.userData.gtaBoneName = sourceName;
        bone.userData.gtaSkinIndex = node.nodeIndex;
        bones[node.nodeIndex] = bone;
        boneByFrame.set(frameIndex, bone);
      }
      if (bones.filter(Boolean).length !== skin.numBones) throw new Error("DFFLoader: incomplete skin hierarchy.");
      for (const [frameIndex, bone] of boneByFrame) {
        let parentIndex = frames[frameIndex].RWFrame.parentIndex;
        const visited = new Set([frameIndex]);
        while (parentIndex >= 0 && !boneByFrame.has(parentIndex)) {
          if (!frames[parentIndex] || visited.has(parentIndex)) throw new Error("DFFLoader: invalid bone parent.");
          visited.add(parentIndex);
          parentIndex = frames[parentIndex].RWFrame.parentIndex;
        }
        if (visited.has(parentIndex)) throw new Error("DFFLoader: cyclic bone parent.");
        const parent = boneByFrame.get(parentIndex);
        // The skin inverse binds are authoritative. DFF frame matrices can be
        // a different pose, particularly in exported GTA character mods.
        const local = bindWorld[bone.userData.gtaSkinIndex].clone();
        if (parent) local.premultiply(inverseBinds[parent.userData.gtaSkinIndex]);
        local.decompose(bone.position, bone.quaternion, bone.scale);
        bone.quaternion.normalize();
        (parent || rw).add(bone);
      }
      const mesh = new THREE.SkinnedMesh(geometry, materials);
      mesh.name = `GTASkin_${atomic.geometryIndex}`;
      mesh.userData.gtaDff = true;
      rw.add(mesh);
      rw.updateMatrixWorld(true);
      mesh.bind(new THREE.Skeleton(bones, inverseBinds), new THREE.Matrix4());
      mesh.normalizeSkinWeights();
      // Bind-pose bounds cannot represent the upright animated character.
      mesh.frustumCulled = false;
    }
    // Keep GTA bone-local coordinates intact, including weapon sockets.
    // GTA Z-up/+Y-forward becomes Three Y-up/-Z-forward here.
    rw.rotation.x = -Math.PI / 2;
    model.updateMatrixWorld(true);
    return model;
  }

  makeGeometry(source) {
    const morph = source.morphTargets?.[0];
    if ((source.format & 0x01000000) || !morph?.vertices?.length) {
      throw new Error("DFFLoader: only non-native PC geometry is supported.");
    }
    const geometry = new THREE.BufferGeometry();
    const vec = values => values.flatMap(v => [v.x, v.y, v.z]);
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vec(morph.vertices), 3));
    if (morph.normals) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(vec(morph.normals), 3));
    if (source.texCoords?.[0]) {
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(source.texCoords[0].flatMap(v => [v.u, v.v]), 2));
    }
    if (source.prelitcolor) {
      const color = new THREE.Color();
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(source.prelitcolor.flatMap(v =>
        color.setRGB(v.r / 255, v.g / 255, v.b / 255, THREE.SRGBColorSpace).toArray()), 3));
    }
    const materialCount = source.RWMaterialList.length;
    const groups = Array.from({length: materialCount}, () => []);
    const addFace = (a, b, c, material) => {
      if (![a, b, c].every(index => Number.isInteger(index) && index >= 0 && index < source.numVertices) || !groups[material]) {
        throw new Error("DFFLoader: invalid face or material index.");
      }
      if (a !== b && b !== c && a !== c) groups[material].push(a, b, c);
    };
    const bin = source.RWExtension?.CHUNK_BINMESH;
    if (bin?.splits?.length && bin.splits.every(split => split.indices?.length === split.numIndices)) {
      for (const split of bin.splits) {
        const indices = split.indices;
        if (bin.faceType & 1) {
          for (let i = 2; i < indices.length; i++) {
            addFace(indices[i - 2 + (i % 2)], indices[i - 1 - (i % 2)], indices[i], split.matIndex);
          }
        } else {
          for (let i = 0; i < indices.length; i += 3) addFace(indices[i], indices[i + 1], indices[i + 2], split.matIndex);
        }
      }
    } else {
      for (const face of source.triangles || []) addFace(face.vertex1, face.vertex2, face.vertex3, face.materialId);
    }
    const indices = [];
    groups.forEach((group, material) => {
      if (group.length) geometry.addGroup(indices.length, group.length, material);
      for (const index of group) indices.push(index);
    });
    if (!indices.length) throw new Error("DFFLoader: empty geometry.");
    geometry.setIndex(indices);
    if (!morph.normals) geometry.computeVertexNormals();
    const skin = source.RWExtension?.CHUNK_SKIN;
    if (skin) {
      const components = value => [value.x, value.y, value.z, value.w];
      const skinIndices = skin.vertexBoneIndices.flatMap(components);
      const skinWeights = skin.vertexBoneWeights.flatMap(components);
      skinIndices.forEach((index, i) => {
        if (!Number.isFinite(skinWeights[i]) || skinWeights[i] < 0 || (skinWeights[i] > 0 && index >= skin.numBones)) {
          throw new Error("DFFLoader: invalid vertex skin weight/index.");
        }
        if (skinWeights[i] === 0) skinIndices[i] = 0;
      });
      geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
      geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  makeMaterial(source, geometry) {
    const {r, g, b, a} = source.color;
    const modulate = !source.isTextured || Boolean(geometry.format & 0x40);
    const material = new THREE.MeshStandardMaterial({
      color: modulate ? new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace) : 0xffffff,
      opacity: modulate ? a / 255 : 1, transparent: modulate && a < 255,
      roughness: 0.9, metalness: 0, vertexColors: Boolean(geometry.prelitcolor)
    });
    const textureName = source.RWTexture?.name;
    if (source.isTextured && textureName) {
      const entry = this.textures?.get(textureName.toLowerCase());
      if (!entry) {
        // Some mods reference a texture absent from their own TXD. Keep the
        // material's authored color instead of failing the entire character.
        console.warn(`DFFLoader: texture "${textureName}" is missing from the configured TXD; using material color.`);
        material.color.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
        return material;
      }
      material.name = textureName;
      // Share dictionary textures across all six character variants.
      material.map = entry.texture;
      if (entry.hasAlpha) {
        material.alphaTest = 0.1;
        material.transparent = true;
      }
    }
    return material;
  }
}
