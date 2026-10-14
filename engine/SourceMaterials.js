import * as THREE from "three";
import { VTFLoader } from "./VTFLoader.js";

const cleanPath = path => String(path).replaceAll("\\", "/").replace(/^\/+/, "");

export function parseVMT(text) {
  const tokens = [];
  const pattern = /\/\/[^\n\r]*|\/\*[\s\S]*?\*\/|"([^"\\]*(?:\\.[^"\\]*)*)"|([{}])|([^\s{}"]+)/g;
  for (const match of text.matchAll(pattern)) {
    if (match[0].startsWith("//") || match[0].startsWith("/*")) continue;
    tokens.push(match[1] !== undefined ? match[1].replace(/\\"/g, '"') : match[2] || match[3]);
  }
  let cursor = 0;
  function block() {
    if (tokens[cursor++] !== "{") throw new Error("Malformed VMT: expected an opening brace.");
    const result = Object.create(null);
    while (cursor < tokens.length && tokens[cursor] !== "}") {
      const key = tokens[cursor++].toLowerCase();
      result[key] = tokens[cursor] === "{" ? block() : tokens[cursor++];
    }
    if (tokens[cursor++] !== "}") throw new Error("Malformed VMT: unclosed block.");
    return result;
  }
  const shader = tokens[cursor++]?.toLowerCase();
  return { shader, values: block() };
}

const IMAGE_EXTENSIONS = ["webp", "vtf"];
const IMAGE_MIME = { webp: "image/webp" };

function materialPath(name) {
  const path = cleanPath(name).replace(/^materials\//i, "");
  if (!path || path.split("/").some(part => !part || part === ".." || part === ".") || /[:?#]/.test(path)) {
    throw new Error(`Invalid Source material path: ${name}`);
  }
  return path;
}

function materialPaths(name) {
  const path = materialPath(name);
  // Prefer files beside the MDL, even when Source records an original folder path.
  return [...new Set([path.split("/").pop(), path])];
}

export async function loadSourceMaterials(metadata, options = {}, manager = THREE.DefaultLoadingManager, usedMaterials = null) {
  const materialRoot = (options.materialRoot || "./").replace(/\/?$/, "/");
  const textureRoot = (options.textureRoot || "./").replace(/\/?$/, "/");
  const byteCache = new Map(), textureCache = new Map(), vmtCache = new Map();

  // Static servers cannot list a folder. Probe documented filenames, caching
  // both hits and misses so shared textures are fetched only once per model.
  const readOptional = url => {
    if (!byteCache.has(url)) byteCache.set(url, (async () => {
      const response = await fetch(manager.resolveURL(url));
      if (response.status === 404 || response.status === 410) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`);
      return response.arrayBuffer();
    })());
    return byteCache.get(url);
  };

  const findTexture = async (stem, extensions = IMAGE_EXTENSIONS) => {
    for (const extension of extensions) {
      const url = `${stem}.${extension}`;
      const bytes = await readOptional(url);
      if (bytes) return { url, bytes, extension };
    }
    return null;
  };

  const texture = (file, color = false) => {
    const key = `${file.url}:${color}`;
    if (!textureCache.has(key)) textureCache.set(key, (async () => {
      let map;
      if (file.extension === "vtf") {
        map = new VTFLoader(manager).parse(file.bytes);
      } else {
        const blobURL = URL.createObjectURL(new Blob([file.bytes], { type: IMAGE_MIME[file.extension] }));
        try { map = await new THREE.TextureLoader(manager).loadAsync(blobURL); }
        finally { URL.revokeObjectURL(blobURL); }
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
      }
      map.flipY = false;
      map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      map.name = file.url;
      return map;
    })());
    return textureCache.get(key);
  };

  const nativeURLs = (name, extension) => materialPaths(name).map(path =>
    materialRoot + path.replace(new RegExp(`\\.${extension}$`, "i"), "") + "." + extension);
  const vmt = async (url, parents = []) => {
    if (parents.includes(url) || parents.length >= 8) throw new Error("Cyclic/deep VMT Patch include.");
    if (!vmtCache.has(url)) vmtCache.set(url, (async () => {
      const bytes = await readOptional(url);
      return bytes ? parseVMT(new TextDecoder().decode(bytes)) : null;
    })());
    const parsed = await vmtCache.get(url);
    if (!parsed || parsed.shader !== "patch") return parsed;
    if (!parsed.values.include) throw new Error("VMT Patch has no include.");
    let base = null;
    for (const includeURL of nativeURLs(parsed.values.include, "vmt")) {
      base = await vmt(includeURL, [...parents, url]);
      if (base) break;
    }
    if (!base) throw new Error(`VMT Patch include not found: ${parsed.values.include}`);
    return { shader: base.shader, values: { ...base.values, ...parsed.values.insert, ...parsed.values.replace } };
  };

  const nativeTexture = async name => {
    const paths = materialPaths(name);
    const explicitExtension = paths[0].match(/\.(vtf|webp)$/i)?.[1].toLowerCase();
    const extensions = explicitExtension ? [...new Set([explicitExtension, ...IMAGE_EXTENSIONS])] : IMAGE_EXTENSIONS;
    for (const path of paths) {
      const stem = materialRoot + path.replace(/\.(vtf|webp)$/i, "");
      const file = await findTexture(stem, extensions);
      if (file) return file;
    }
    throw new Error(`Material texture not found: ${name}`);
  };

  const assignAutomatic = async (material, stem, base) => {
    material.color.set(0xffffff);
    material.side = THREE.DoubleSide;
    material.specularIntensity = 0.1;
    material.map = await texture(base, true);
    // Prefer the base image's format but allow mixed image formats.
    const extensions = [...new Set([base.extension, ...IMAGE_EXTENSIONS])];
    const [normal, packed] = await Promise.all([
      findTexture(stem + "_normal", extensions),
      findTexture(stem + "_metallicRoughness", extensions)
    ]);
    if (normal) {
      material.normalMap = await texture(normal);
      if (normal.extension === "vtf") material.normalScale.y = -1;
    }
    if (packed) {
      material.roughnessMap = material.metalnessMap = await texture(packed);
      material.roughness = material.metalness = 1;
    } else {
      const [roughness, metalness] = await Promise.all([
        findTexture(stem + "_roughness", extensions),
        findTexture(stem + "_metalness", extensions)
      ]);
      if (roughness) { material.roughnessMap = await texture(roughness); material.roughness = 1; }
      if (metalness) { material.metalnessMap = await texture(metalness); material.metalness = 1; }
    }
    material.userData.sourceMaterial = { mode: "automatic", baseTexture: base.url };
  };

  const assignVMT = async (material, parsed, url) => {
    const values = parsed.values;
    material.color.set(0xffffff);
    const tint = String(values.$color2 || values.$color || "").match(/[-+]?[\d.]+/g)?.map(Number);
    if (tint?.length >= 3) {
      const divisor = String(values.$color2 || values.$color).includes("{") ? 255 : 1;
      material.color.setRGB(tint[0] / divisor, tint[1] / divisor, tint[2] / divisor);
    }
    await Promise.all([
      values.$basetexture && nativeTexture(values.$basetexture).then(file => texture(file, true)).then(map => { material.map = map; }),
      values.$bumpmap && nativeTexture(values.$bumpmap).then(async file => {
        material.normalMap = await texture(file);
        if (file.extension === "vtf") material.normalScale.y = -1;
      })
    ]);
    material.side = Number(values.$nocull) ? THREE.DoubleSide : THREE.FrontSide;
    material.opacity = Math.max(0, Math.min(1, Number(values.$alpha ?? 1)));
    material.transparent = Boolean(Number(values.$translucent) || material.opacity < 1 || Number(values.$additive));
    material.alphaTest = Number(values.$alphatest) ? Number(values.$alphatestreference ?? 0.5) : 0;
    material.depthWrite = !material.transparent;
    if (Number(values.$additive)) material.blending = THREE.AdditiveBlending;
    if (Number(values.$selfillum) || parsed.shader === "unlitgeneric") {
      material.emissive.copy(material.color); material.emissiveMap = material.map;
    }
    if (Number(values.$phong)) material.roughness = Math.max(0.08, Math.min(1, Math.sqrt(2 / (Number(values.$phongexponent) || 32))));
    material.userData.sourceMaterial = { mode: "vmt", url };
  };

  return Promise.all(metadata.materialNames.map(async (name, index) => {
    const material = new THREE.MeshPhysicalMaterial({ name, color: 0x858585, roughness: 0.65, metalness: 0 });
    if (usedMaterials && !usedMaterials.has(index)) return material;
    try {
      // A matching loose image takes priority, allowing drop-in replacements.
      let stem, base;
      for (const path of materialPaths(name)) {
        stem = textureRoot + path;
        base = await findTexture(stem);
        if (base) break;
      }
      if (base) {
        await assignAutomatic(material, stem, base);
      } else {
        const candidates = [...new Set([...metadata.directories, ""].flatMap(directory => nativeURLs(directory + name, "vmt")))];
        let found = false;
        for (const url of candidates) {
          const parsed = await vmt(url);
          if (!parsed) continue;
          await assignVMT(material, parsed, url);
          found = true;
          break;
        }
        if (!found) throw new Error(`No texture ${stem}.{${IMAGE_EXTENSIONS.join(",")}} or matching VMT was found.`);
      }
    } catch (error) {
      if (options.strictMaterials) { material.dispose(); throw new Error(`Source material "${name}": ${error.message}`); }
      console.warn(`Source material "${name}" uses a plain fallback: ${error.message}`);
    }
    return material;
  }));
}
