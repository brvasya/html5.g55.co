import * as THREE from "three";
import { BinaryReader } from "./BinaryReader.js";

// Decode on CPU so DXT textures also work on devices without S3TC extensions.
function imageSize(width, height, format) {
  if ([13, 20].includes(format)) return Math.ceil(width / 4) * Math.ceil(height / 4) * 8;
  if ([14, 15, 37].includes(format)) return Math.ceil(width / 4) * Math.ceil(height / 4) * 16;
  const bytes = { 0: 4, 1: 4, 2: 3, 3: 3, 4: 2, 5: 1, 6: 2, 8: 1, 11: 4, 12: 4, 16: 4, 17: 2, 18: 2, 19: 2, 21: 2, 22: 2 }[format];
  if (!bytes) throw new Error(`Unsupported VTF image format ${format}.`);
  return width * height * bytes;
}

function color565(value) {
  return [Math.round((value >>> 11) * 255 / 31), Math.round(((value >>> 5) & 63) * 255 / 63), Math.round((value & 31) * 255 / 31), 255];
}

function alphaBlock(reader, offset) {
  const a = reader.u8(offset), b = reader.u8(offset + 1), palette = [a, b];
  if (a > b) for (let i = 1; i <= 6; i++) palette.push(Math.round(((7 - i) * a + i * b) / 7));
  else {
    for (let i = 1; i <= 4; i++) palette.push(Math.round(((5 - i) * a + i * b) / 5));
    palette.push(0, 255);
  }
  let bits = 0;
  for (let i = 0; i < 6; i++) bits += reader.u8(offset + 2 + i) * 2 ** (8 * i);
  return Array.from({ length: 16 }, (_, i) => palette[Math.floor(bits / 2 ** (i * 3)) % 8]);
}

function decodeBlocks(reader, offset, width, height, format) {
  const output = new Uint8Array(width * height * 4);
  const blockBytes = [13, 20].includes(format) ? 8 : 16;
  let cursor = offset;
  for (let by = 0; by < height; by += 4) for (let bx = 0; bx < width; bx += 4, cursor += blockBytes) {
    let colors, indices, alphas, red, green;
    if (format === 37) {
      red = alphaBlock(reader, cursor); green = alphaBlock(reader, cursor + 8);
    } else {
      const colorOffset = cursor + (blockBytes === 16 ? 8 : 0);
      const a = reader.u16(colorOffset), b = reader.u16(colorOffset + 2);
      colors = [color565(a), color565(b)];
      if (a > b || blockBytes === 16) {
        colors.push(colors[0].map((value, i) => i === 3 ? 255 : Math.round((2 * value + colors[1][i]) / 3)));
        colors.push(colors[0].map((value, i) => i === 3 ? 255 : Math.round((value + 2 * colors[1][i]) / 3)));
      } else {
        colors.push(colors[0].map((value, i) => i === 3 ? 255 : Math.round((value + colors[1][i]) / 2)));
        colors.push([0, 0, 0, 0]);
      }
      indices = reader.u32(colorOffset + 4);
      if (format === 15) alphas = alphaBlock(reader, cursor);
      if (format === 14) alphas = Array.from({ length: 16 }, (_, i) => ((reader.u8(cursor + (i >> 1)) >>> ((i % 2) * 4)) & 15) * 17);
    }
    for (let py = 0; py < 4 && by + py < height; py++) for (let px = 0; px < 4 && bx + px < width; px++) {
      const i = py * 4 + px, target = ((by + py) * width + bx + px) * 4;
      if (format === 37) {
        const x = red[i] / 127.5 - 1, y = green[i] / 127.5 - 1;
        output.set([red[i], green[i], Math.round((Math.sqrt(Math.max(0, 1 - x * x - y * y)) + 1) * 127.5), 255], target);
      } else {
        output.set(colors[(indices >>> (i * 2)) & 3], target);
        if (alphas) output[target + 3] = alphas[i];
      }
    }
  }
  return output;
}

function decodePixels(reader, offset, width, height, format) {
  const output = new Uint8Array(width * height * 4);
  const bytes = imageSize(1, 1, format);
  for (let i = 0; i < width * height; i++) {
    const o = offset + i * bytes;
    let rgba;
    switch (format) {
      case 0: rgba = [reader.u8(o), reader.u8(o + 1), reader.u8(o + 2), reader.u8(o + 3)]; break;
      case 1: rgba = [reader.u8(o + 3), reader.u8(o + 2), reader.u8(o + 1), reader.u8(o)]; break;
      case 2: rgba = [reader.u8(o), reader.u8(o + 1), reader.u8(o + 2), 255]; break;
      case 3: rgba = [reader.u8(o + 2), reader.u8(o + 1), reader.u8(o), 255]; break;
      case 4: rgba = color565(reader.u16(o)); break;
      case 5: rgba = [reader.u8(o), reader.u8(o), reader.u8(o), 255]; break;
      case 6: rgba = [reader.u8(o), reader.u8(o), reader.u8(o), reader.u8(o + 1)]; break;
      case 8: rgba = [255, 255, 255, reader.u8(o)]; break;
      case 11: rgba = [reader.u8(o + 1), reader.u8(o + 2), reader.u8(o + 3), reader.u8(o)]; break;
      case 12: case 16: rgba = [reader.u8(o + 2), reader.u8(o + 1), reader.u8(o), format === 12 ? reader.u8(o + 3) : 255]; break;
      case 17: { const c = color565(reader.u16(o)); rgba = [c[2], c[1], c[0], 255]; break; }
      case 18: case 21: {
        const c = reader.u16(o);
        rgba = [((c >>> 10) & 31) * 255 / 31, ((c >>> 5) & 31) * 255 / 31, (c & 31) * 255 / 31, format === 21 ? (c >>> 15) * 255 : 255]; break;
      }
      case 19: { const c = reader.u16(o); rgba = [((c >>> 8) & 15) * 17, ((c >>> 4) & 15) * 17, (c & 15) * 17, (c >>> 12) * 17]; break; }
      case 22: {
        const x = reader.u8(o), y = reader.u8(o + 1), nx = x / 127.5 - 1, ny = y / 127.5 - 1;
        rgba = [x, y, (Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) + 1) * 127.5, 255]; break;
      }
      default: throw new Error(`Unsupported VTF pixel format ${format}.`);
    }
    output.set(rgba, i * 4);
  }
  return output;
}

export class VTFLoader {
  constructor(manager = THREE.DefaultLoadingManager) { this.manager = manager; }
  async loadAsync(url) {
    const bytes = await new THREE.FileLoader(this.manager).setResponseType("arraybuffer").loadAsync(url);
    return this.parse(bytes);
  }
  parse(buffer) {
    const reader = new BinaryReader(buffer, "VTF");
    reader.check(0, 64);
    const major = reader.u32(4), minor = reader.u32(8);
    if (reader.string(0, 4) !== "VTF" || major !== 7 || minor > 5) throw new Error(`Unsupported VTF version ${major}.${minor}.`);
    const headerSize = reader.u32(12), width = reader.u16(16), height = reader.u16(18), flags = reader.u32(20);
    const frames = reader.u16(24), format = reader.i32(52), levels = reader.u8(56);
    const depth = minor >= 2 ? reader.u16(63) : 1;
    if (!width || !height || width * height > 16777216 || !frames || !levels || levels > 16) throw new Error("Invalid/oversized VTF image.");
    if (depth > 1 || flags & 0x4000) throw new Error("Volume/cubemap VTFs are not supported as model texture maps.");
    reader.check(0, headerSize);
    let offset = headerSize, resourceImage = false;
    if (minor >= 3) {
      const count = reader.u32(68);
      reader.table(80, count, 8);
      for (let i = 0; i < count; i++) {
        const record = 80 + i * 8;
        if (reader.u8(record) === 0x30 && reader.u8(record + 1) === 0 && reader.u8(record + 2) === 0) {
          if (reader.u8(record + 3) & 2) throw new Error("Invalid inline VTF image resource.");
          offset = reader.u32(record + 4); resourceImage = true;
        }
      }
      if (count && !resourceImage) throw new Error("VTF high-resolution image resource is missing.");
    }
    if (!resourceImage) {
      const thumbWidth = reader.u8(61), thumbHeight = reader.u8(62);
      if (thumbWidth && thumbHeight) offset += imageSize(thumbWidth, thumbHeight, reader.i32(57));
    }
    // Source stores mipmaps from smallest to largest, with all frames per mip.
    for (let mip = levels - 1; mip > 0; mip--) offset += imageSize(Math.max(1, width >> mip), Math.max(1, height >> mip), format) * frames;
    reader.check(offset, imageSize(width, height, format));
    const data = [13, 14, 15, 20, 37].includes(format) ? decodeBlocks(reader, offset, width, height, format) : decodePixels(reader, offset, width, height, format);
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    texture.flipY = false;
    texture.wrapS = flags & 4 ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    texture.wrapT = flags & 8 ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    texture.magFilter = flags & 1 ? THREE.NearestFilter : THREE.LinearFilter;
    texture.minFilter = flags & 1 ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = !(flags & 1);
    texture.needsUpdate = true;
    return texture;
  }
}
