// Adapted from Jackal1337/DFF-Loader (MIT); see LICENSE.txt.
/**
 * TXDLoader - RenderWare Texture Dictionary loader for Three.js
 *
 * Loads .txd texture archives from GTA San Andreas, Vice City, III
 * and other RenderWare-powered games.
 *
 * Supports:
 * - DXT1, DXT3, DXT5 compressed textures
 * - Uncompressed RGBA/RGB textures
 * - Paletted textures (8-bit, 4-bit)
 * - Mipmaps
 */

import * as THREE from 'three';
import ChunkType from './ChunkType.js';

// Texture format constants
const TextureFormat = {
    FORMAT_DEFAULT: 0x0000,
    FORMAT_1555: 0x0100,
    FORMAT_565: 0x0200,
    FORMAT_4444: 0x0300,
    FORMAT_LUM8: 0x0400,
    FORMAT_8888: 0x0500,
    FORMAT_888: 0x0600,
    FORMAT_555: 0x0A00,

    // Compression
    FORMAT_EXT_AUTO_MIPMAP: 0x1000,
    FORMAT_EXT_PAL8: 0x2000,
    FORMAT_EXT_PAL4: 0x4000,
    FORMAT_EXT_MIPMAP: 0x8000
};

// D3D Formats
const D3DFORMAT = {
    D3DFMT_A8R8G8B8: 21,
    D3DFMT_X8R8G8B8: 22,
    D3DFMT_R5G6B5: 23,
    D3DFMT_X1R5G5B5: 24,
    D3DFMT_A1R5G5B5: 25,
    D3DFMT_A4R4G4B4: 26,
    D3DFMT_P8: 41,
    D3DFMT_DXT1: 0x31545844, // 'DXT1'
    D3DFMT_DXT2: 0x32545844,
    D3DFMT_DXT3: 0x33545844, // 'DXT3'
    D3DFMT_DXT4: 0x34545844,
    D3DFMT_DXT5: 0x35545844  // 'DXT5'
};

class TXDLoader extends THREE.Loader {
    constructor(manager) {
        super(manager);
        this.textures = new Map();
    }

    load(url, onLoad, onProgress, onError) {
        const loader = new THREE.FileLoader(this.manager);
        loader.setResponseType('arraybuffer');
        loader.setPath(this.path);
        loader.setRequestHeader(this.requestHeader);
        loader.setWithCredentials(this.withCredentials);

        loader.load(url, (buffer) => {
            try {
                onLoad(this.parse(buffer));
            } catch (e) {
                if (onError) {
                    onError(e);
                } else {
                    console.error(e);
                }
                this.manager.itemError(url);
            }
        }, onProgress, onError);
    }

    parse(arraybuffer) {
        this.arraybuffer = arraybuffer;
        this.data = new DataView(arraybuffer);
        this.position = 0;
        this.textures = new Map();

        // Read texture dictionary
        const header = this.readHeader();
        if (header.type !== ChunkType.CHUNK_TEXDICTIONARY) {
            throw new Error('TXDLoader: Not a valid TXD file');
        }

        // Struct header
        this.readHeader();
        const textureCount = this.readUInt16();
        const deviceId = this.readUInt16(); // 1 = D3D8, 2 = D3D9, 6 = OpenGL, etc.

        // Read each texture
        for (let i = 0; i < textureCount; i++) {
            try {
                const texture = this.readTextureNative();
                if (texture) {
                    this.textures.set(texture.name.toLowerCase(), { texture: texture.texture, hasAlpha: texture.hasAlpha });
                }
            } catch (e) {
                for (const entry of this.textures.values()) entry.texture.dispose();
                throw new Error(`TXDLoader: Failed to load texture ${i}: ${e.message}`);
            }
        }

        return this.textures;
    }

    readHeader() {
        const header = {
            type: this.readUInt32(),
            length: this.readUInt32(),
            build: this.readUInt32()
        };
        if (this.position + header.length > this.data.byteLength) throw new Error('TXDLoader: truncated chunk');
        return header;
    }

    readTextureNative() {
        const header = this.readHeader();
        if (header.type !== ChunkType.CHUNK_TEXTURENATIVE) {
            this.position += header.length;
            return null;
        }

        const chunkEnd = this.position + header.length;

        // Struct header
        this.readHeader();

        // Platform ID
        const platformId = this.readUInt32();

        // Filter flags
        const filterFlags = this.readUInt32();

        // Texture name (32 bytes)
        const name = this.readString(32);

        // Alpha name / mask name (32 bytes)
        const alphaName = this.readString(32);

        // Raster format
        const rasterFormat = this.readUInt32();

        let width, height, depth, numLevels, rasterType, compression;
        let hasAlpha = false;
        let d3dFormat = 0;

        if (platformId === 9) {
            // PC (D3D9) format
            d3dFormat = this.readUInt32();
            width = this.readUInt16();
            height = this.readUInt16();
            depth = this.readUInt8();
            numLevels = this.readUInt8();
            rasterType = this.readUInt8();
            compression = this.readUInt8();

            hasAlpha = Boolean(compression & 1) || (d3dFormat === D3DFORMAT.D3DFMT_DXT3 ||
                       d3dFormat === D3DFORMAT.D3DFMT_DXT5 ||
                       d3dFormat === D3DFORMAT.D3DFMT_A8R8G8B8 ||
                       d3dFormat === D3DFORMAT.D3DFMT_A4R4G4B4 ||
                       d3dFormat === D3DFORMAT.D3DFMT_A1R5G5B5);
        } else if (platformId === 8) {
            // PC (D3D8) format
            hasAlpha = this.readUInt32() !== 0;
            width = this.readUInt16();
            height = this.readUInt16();
            depth = this.readUInt8();
            numLevels = this.readUInt8();
            rasterType = this.readUInt8();
            compression = this.readUInt8();
        } else {
            throw new Error(`TXDLoader: unsupported platform ID ${platformId}; use a PC D3D8/D3D9 TXD.`);
        }

        // Determine if paletted
        const isPal8 = (rasterFormat & TextureFormat.FORMAT_EXT_PAL8) !== 0;
        const isPal4 = (rasterFormat & TextureFormat.FORMAT_EXT_PAL4) !== 0;

        // Read palette if present
        let palette = null;
        if (isPal8) {
            palette = new Uint8Array(256 * 4);
            for (let i = 0; i < 256; i++) {
                palette[i * 4 + 2] = this.readUInt8(); // B
                palette[i * 4 + 1] = this.readUInt8(); // G
                palette[i * 4 + 0] = this.readUInt8(); // R
                palette[i * 4 + 3] = this.readUInt8(); // A
            }
        } else if (isPal4) {
            palette = new Uint8Array(16 * 4);
            for (let i = 0; i < 16; i++) {
                palette[i * 4 + 2] = this.readUInt8();
                palette[i * 4 + 1] = this.readUInt8();
                palette[i * 4 + 0] = this.readUInt8();
                palette[i * 4 + 3] = this.readUInt8();
            }
        }

        // Read texture data size
        const dataSize = this.readUInt32();
        if (!width || !height || !numLevels || this.position + dataSize > chunkEnd) {
            throw new Error('TXDLoader: invalid texture size or mip data');
        }

        // Read raw texture data (main level only for now)
        const rawData = new Uint8Array(this.arraybuffer.slice(this.position, this.position + dataSize));
        this.position += dataSize;

        // Decode texture to RGBA
        let rgba;
        if ((platformId === 9 && d3dFormat === D3DFORMAT.D3DFMT_DXT1) || (platformId === 8 && compression === 1)) {
            // DXT1
            rgba = this.decodeDXT1(rawData, width, height);
        } else if ((platformId === 9 && d3dFormat === D3DFORMAT.D3DFMT_DXT3) || (platformId === 8 && compression === 3)) {
            // DXT3
            rgba = this.decodeDXT3(rawData, width, height);
        } else if ((platformId === 9 && d3dFormat === D3DFORMAT.D3DFMT_DXT5) || (platformId === 8 && compression === 5)) {
            // DXT5
            rgba = this.decodeDXT5(rawData, width, height);
        } else if (isPal8) {
            rgba = this.decodePal8(rawData, palette, width, height);
        } else if (isPal4) {
            rgba = this.decodePal4(rawData, palette, width, height);
        } else {
            // Uncompressed
            rgba = this.decodeUncompressed(rawData, width, height, d3dFormat, rasterFormat);
        }

        // Skip remaining mipmap levels
        for (let level = 1; level < numLevels; level++) {
            const mipSize = this.readUInt32();
            this.position += mipSize;
        }

        // Read extension
        const extHeader = this.readHeader();
        this.position += extHeader.length;

        // Create Three.js texture
        const texture = new THREE.DataTexture(
            rgba,
            width,
            height,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
        );

        texture.name = name;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.needsUpdate = true;

        return {
            name,
            alphaName,
            width,
            height,
            hasAlpha,
            compression,
            d3dFormat,
            texture
        };
    }

    // DXT1 decoder (4bpp, optional 1-bit alpha)
    decodeDXT1(data, width, height) {
        const output = new Uint8Array(width * height * 4);
        const blocksX = Math.ceil(width / 4);
        const blocksY = Math.ceil(height / 4);

        let srcOffset = 0;

        for (let by = 0; by < blocksY; by++) {
            for (let bx = 0; bx < blocksX; bx++) {
                // Read color endpoints
                const c0 = data[srcOffset] | (data[srcOffset + 1] << 8);
                const c1 = data[srcOffset + 2] | (data[srcOffset + 3] << 8);
                srcOffset += 4;

                // Decode colors (RGB565)
                const colors = [];
                colors[0] = this.rgb565ToRgba(c0);
                colors[1] = this.rgb565ToRgba(c1);

                if (c0 > c1) {
                    // 4 color mode
                    colors[2] = this.interpolateColor(colors[0], colors[1], 1/3);
                    colors[3] = this.interpolateColor(colors[0], colors[1], 2/3);
                } else {
                    // 3 color + transparent mode
                    colors[2] = this.interpolateColor(colors[0], colors[1], 0.5);
                    colors[3] = [0, 0, 0, 0]; // Transparent
                }

                // Read indices (4 bytes = 16 2-bit indices)
                const indices = data[srcOffset] | (data[srcOffset + 1] << 8) |
                               (data[srcOffset + 2] << 16) | (data[srcOffset + 3] << 24);
                srcOffset += 4;

                // Decode 4x4 block
                for (let py = 0; py < 4; py++) {
                    for (let px = 0; px < 4; px++) {
                        const x = bx * 4 + px;
                        const y = by * 4 + py;
                        if (x >= width || y >= height) continue;

                        const idx = (indices >> ((py * 4 + px) * 2)) & 0x3;
                        const color = colors[idx];

                        const dstOffset = (y * width + x) * 4;
                        output[dstOffset + 0] = color[0];
                        output[dstOffset + 1] = color[1];
                        output[dstOffset + 2] = color[2];
                        output[dstOffset + 3] = color[3];
                    }
                }
            }
        }

        return output;
    }

    // DXT3 decoder (8bpp, explicit 4-bit alpha)
    decodeDXT3(data, width, height) {
        const output = new Uint8Array(width * height * 4);
        const blocksX = Math.ceil(width / 4);
        const blocksY = Math.ceil(height / 4);

        let srcOffset = 0;

        for (let by = 0; by < blocksY; by++) {
            for (let bx = 0; bx < blocksX; bx++) {
                // Read alpha (8 bytes = 16 4-bit alpha values)
                const alphaData = [];
                for (let i = 0; i < 8; i++) {
                    alphaData.push(data[srcOffset + i]);
                }
                srcOffset += 8;

                // Read color block (same as DXT1)
                const c0 = data[srcOffset] | (data[srcOffset + 1] << 8);
                const c1 = data[srcOffset + 2] | (data[srcOffset + 3] << 8);
                srcOffset += 4;

                const colors = [];
                colors[0] = this.rgb565ToRgba(c0);
                colors[1] = this.rgb565ToRgba(c1);
                colors[2] = this.interpolateColor(colors[0], colors[1], 1/3);
                colors[3] = this.interpolateColor(colors[0], colors[1], 2/3);

                const indices = data[srcOffset] | (data[srcOffset + 1] << 8) |
                               (data[srcOffset + 2] << 16) | (data[srcOffset + 3] << 24);
                srcOffset += 4;

                // Decode 4x4 block
                for (let py = 0; py < 4; py++) {
                    for (let px = 0; px < 4; px++) {
                        const x = bx * 4 + px;
                        const y = by * 4 + py;
                        if (x >= width || y >= height) continue;

                        const idx = (indices >> ((py * 4 + px) * 2)) & 0x3;
                        const color = colors[idx];

                        // Get alpha from explicit alpha block
                        const alphaIdx = py * 4 + px;
                        const alphaByte = alphaData[Math.floor(alphaIdx / 2)];
                        const alpha = ((alphaIdx % 2 === 0) ? (alphaByte & 0xF) : (alphaByte >> 4)) * 17;

                        const dstOffset = (y * width + x) * 4;
                        output[dstOffset + 0] = color[0];
                        output[dstOffset + 1] = color[1];
                        output[dstOffset + 2] = color[2];
                        output[dstOffset + 3] = alpha;
                    }
                }
            }
        }

        return output;
    }

    // DXT5 decoder (8bpp, interpolated alpha)
    decodeDXT5(data, width, height) {
        const output = new Uint8Array(width * height * 4);
        const blocksX = Math.ceil(width / 4);
        const blocksY = Math.ceil(height / 4);

        let srcOffset = 0;

        for (let by = 0; by < blocksY; by++) {
            for (let bx = 0; bx < blocksX; bx++) {
                // Read alpha endpoints
                const a0 = data[srcOffset];
                const a1 = data[srcOffset + 1];
                srcOffset += 2;

                // Read alpha indices (6 bytes = 16 3-bit indices)
                let alphaBits = 0n;
                for (let i = 0; i < 6; i++) {
                    alphaBits |= BigInt(data[srcOffset + i]) << BigInt(i * 8);
                }
                srcOffset += 6;

                // Calculate alpha palette
                const alphas = [a0, a1];
                if (a0 > a1) {
                    for (let i = 1; i <= 6; i++) {
                        alphas.push(Math.floor(((7 - i) * a0 + i * a1) / 7));
                    }
                } else {
                    for (let i = 1; i <= 4; i++) {
                        alphas.push(Math.floor(((5 - i) * a0 + i * a1) / 5));
                    }
                    alphas.push(0);
                    alphas.push(255);
                }

                // Read color block
                const c0 = data[srcOffset] | (data[srcOffset + 1] << 8);
                const c1 = data[srcOffset + 2] | (data[srcOffset + 3] << 8);
                srcOffset += 4;

                const colors = [];
                colors[0] = this.rgb565ToRgba(c0);
                colors[1] = this.rgb565ToRgba(c1);
                colors[2] = this.interpolateColor(colors[0], colors[1], 1/3);
                colors[3] = this.interpolateColor(colors[0], colors[1], 2/3);

                const indices = data[srcOffset] | (data[srcOffset + 1] << 8) |
                               (data[srcOffset + 2] << 16) | (data[srcOffset + 3] << 24);
                srcOffset += 4;

                // Decode 4x4 block
                for (let py = 0; py < 4; py++) {
                    for (let px = 0; px < 4; px++) {
                        const x = bx * 4 + px;
                        const y = by * 4 + py;
                        if (x >= width || y >= height) continue;

                        const colorIdx = (indices >> ((py * 4 + px) * 2)) & 0x3;
                        const color = colors[colorIdx];

                        const alphaIdx = py * 4 + px;
                        const alphaPaletteIdx = Number((alphaBits >> BigInt(alphaIdx * 3)) & 0x7n);
                        const alpha = alphas[alphaPaletteIdx];

                        const dstOffset = (y * width + x) * 4;
                        output[dstOffset + 0] = color[0];
                        output[dstOffset + 1] = color[1];
                        output[dstOffset + 2] = color[2];
                        output[dstOffset + 3] = alpha;
                    }
                }
            }
        }

        return output;
    }

    // Palette 8-bit decoder
    decodePal8(data, palette, width, height) {
        const output = new Uint8Array(width * height * 4);

        for (let i = 0; i < width * height; i++) {
            const paletteIdx = data[i];
            output[i * 4 + 0] = palette[paletteIdx * 4 + 0];
            output[i * 4 + 1] = palette[paletteIdx * 4 + 1];
            output[i * 4 + 2] = palette[paletteIdx * 4 + 2];
            output[i * 4 + 3] = palette[paletteIdx * 4 + 3];
        }

        return output;
    }

    // Palette 4-bit decoder
    decodePal4(data, palette, width, height) {
        const output = new Uint8Array(width * height * 4);

        for (let i = 0; i < width * height; i++) {
            const byteIdx = Math.floor(i / 2);
            const paletteIdx = (i % 2 === 0) ? (data[byteIdx] & 0xF) : (data[byteIdx] >> 4);

            output[i * 4 + 0] = palette[paletteIdx * 4 + 0];
            output[i * 4 + 1] = palette[paletteIdx * 4 + 1];
            output[i * 4 + 2] = palette[paletteIdx * 4 + 2];
            output[i * 4 + 3] = palette[paletteIdx * 4 + 3];
        }

        return output;
    }

    // Uncompressed decoder
    decodeUncompressed(data, width, height, d3dFormat, rasterFormat) {
        const output = new Uint8Array(width * height * 4);
        const formatType = rasterFormat & 0x0F00;

        for (let i = 0; i < width * height; i++) {
            let r, g, b, a;

            if (d3dFormat === D3DFORMAT.D3DFMT_A8R8G8B8 || formatType === TextureFormat.FORMAT_8888) {
                // BGRA 32-bit
                b = data[i * 4 + 0];
                g = data[i * 4 + 1];
                r = data[i * 4 + 2];
                a = data[i * 4 + 3];
            } else if (d3dFormat === D3DFORMAT.D3DFMT_X8R8G8B8) {
                // BGRX 32-bit (alpha byte unused but present)
                b = data[i * 4 + 0];
                g = data[i * 4 + 1];
                r = data[i * 4 + 2];
                // data[i * 4 + 3] is unused X byte
                a = 255;
            } else if (formatType === TextureFormat.FORMAT_888) {
                // BGR 24-bit (no padding byte)
                b = data[i * 3 + 0];
                g = data[i * 3 + 1];
                r = data[i * 3 + 2];
                a = 255;
            } else if (d3dFormat === D3DFORMAT.D3DFMT_R5G6B5 || formatType === TextureFormat.FORMAT_565) {
                // RGB565
                const pixel = data[i * 2] | (data[i * 2 + 1] << 8);
                r = ((pixel >> 11) & 0x1F) * 255 / 31;
                g = ((pixel >> 5) & 0x3F) * 255 / 63;
                b = (pixel & 0x1F) * 255 / 31;
                a = 255;
            } else if (d3dFormat === D3DFORMAT.D3DFMT_A1R5G5B5 || formatType === TextureFormat.FORMAT_1555) {
                // ARGB1555
                const pixel = data[i * 2] | (data[i * 2 + 1] << 8);
                a = (pixel >> 15) ? 255 : 0;
                r = ((pixel >> 10) & 0x1F) * 255 / 31;
                g = ((pixel >> 5) & 0x1F) * 255 / 31;
                b = (pixel & 0x1F) * 255 / 31;
            } else if (d3dFormat === D3DFORMAT.D3DFMT_A4R4G4B4 || formatType === TextureFormat.FORMAT_4444) {
                // ARGB4444
                const pixel = data[i * 2] | (data[i * 2 + 1] << 8);
                a = ((pixel >> 12) & 0xF) * 17;
                r = ((pixel >> 8) & 0xF) * 17;
                g = ((pixel >> 4) & 0xF) * 17;
                b = (pixel & 0xF) * 17;
            } else {
                // Default: assume BGRA
                b = data[i * 4 + 0] || 0;
                g = data[i * 4 + 1] || 0;
                r = data[i * 4 + 2] || 0;
                a = data[i * 4 + 3] || 255;
            }

            output[i * 4 + 0] = r;
            output[i * 4 + 1] = g;
            output[i * 4 + 2] = b;
            output[i * 4 + 3] = a;
        }

        return output;
    }

    // Helper: RGB565 to RGBA
    rgb565ToRgba(color) {
        const r = ((color >> 11) & 0x1F) * 255 / 31;
        const g = ((color >> 5) & 0x3F) * 255 / 63;
        const b = (color & 0x1F) * 255 / 31;
        return [Math.round(r), Math.round(g), Math.round(b), 255];
    }

    // Helper: Interpolate colors
    interpolateColor(c0, c1, t) {
        return [
            Math.round(c0[0] + (c1[0] - c0[0]) * t),
            Math.round(c0[1] + (c1[1] - c0[1]) * t),
            Math.round(c0[2] + (c1[2] - c0[2]) * t),
            255
        ];
    }

    // Binary readers
    readUInt32() {
        const v = this.data.getUint32(this.position, true);
        this.position += 4;
        return v;
    }

    readUInt16() {
        const v = this.data.getUint16(this.position, true);
        this.position += 2;
        return v;
    }

    readUInt8() {
        const v = this.data.getUint8(this.position);
        this.position += 1;
        return v;
    }

    readString(length) {
        let str = '';
        for (let i = 0; i < length; i++) {
            const char = this.data.getUint8(this.position + i);
            if (char === 0) break;
            str += String.fromCharCode(char);
        }
        this.position += length;
        return str.trim();
    }

    // Get texture by name
    getTexture(name) {
        return this.textures.get(name.toLowerCase());
    }
}

export { TXDLoader };
export default TXDLoader;
