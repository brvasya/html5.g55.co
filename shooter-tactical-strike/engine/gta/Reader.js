// Adapted from Jackal1337/DFF-Loader (MIT); see LICENSE.txt.
/**
 * DFFReader - RenderWare binary stream parser
 *
 * Parses the binary DFF format used by RenderWare 3.x engine.
 */

import ChunkType from './ChunkType.js';

const GeometryFlag = {
    rwTRISTRIP: 0x00000001,
    rwPOSITIONS: 0x00000002,
    rwTEXTURED: 0x00000004,
    rwPRELIT: 0x00000008,
    rwNORMALS: 0x00000010,
    rwLIGHT: 0x00000020,
    rwMODULATE_MATERIAL_COLOR: 0x00000040,
    rwTEXTURED2: 0x00000080,
    rwNATIVE: 0x01000000,
    rwNATIVE_INSTANCE: 0x02000000,
    rwFLAGS_MASK: 0x000000FF,
    rwNATIVE_FLAGS_MASK: 0x0F000000
};

class DFFReader {
    constructor() {
        this.data = null;
        this.position = 0;
    }

    parse(arraybuffer) {
        this.data = new DataView(arraybuffer);
        this.position = 0;

        while (this.position < arraybuffer.byteLength) {
            const clump = this.readChunk(ChunkType.CHUNK_CLUMP);
            if (clump) return clump;
        }

        return null;
    }

    readHeader(parent) {
        const header = {
            type: this.readUInt32(),
            length: 0,
            build: 0,
            version: 0
        };

        header.name = this.getChunkName(header.type);
        header.length = this.readUInt32();
        header.build = this.readUInt32();
        this.checkBounds(header.length);

        if (header.build & 0xFFFF0000) {
            header.version = ((header.build >> 14) & 0x3FF00) | ((header.build >> 16) & 0x3F) | 0x30000;
        } else {
            header.version = header.build << 8;
        }

        if (parent !== undefined) {
            header.parent = parent;
        }

        return header;
    }

    getChunkName(type) {
        for (const name in ChunkType) {
            if (ChunkType[name] === type) return name;
        }
        return 'CHUNK_UNKNOWN';
    }

    checkBounds(size) {
        if (this.position + size > this.data.byteLength) {
            throw new Error(`DFFLoader: Buffer overflow at position ${this.position} (need ${size} bytes, have ${this.data.byteLength - this.position})`);
        }
    }

    readInt32() {
        this.checkBounds(4);
        const v = this.data.getInt32(this.position, true);
        this.position += 4;
        return v;
    }

    readUInt32() {
        this.checkBounds(4);
        const v = this.data.getUint32(this.position, true);
        this.position += 4;
        return v;
    }

    readUInt16() {
        this.checkBounds(2);
        const v = this.data.getUint16(this.position, true);
        this.position += 2;
        return v;
    }

    readUInt8() {
        this.checkBounds(1);
        const v = this.data.getUint8(this.position);
        this.position += 1;
        return v;
    }

    readFloat32() {
        this.checkBounds(4);
        const v = this.data.getFloat32(this.position, true);
        this.position += 4;
        return v;
    }

    readString(length) {
        this.checkBounds(length);
        let v = '';
        const end = this.position + length;

        while (this.position < end) {
            const val = this.data.getUint8(this.position++);
            if (val === 0) {
                this.position = end;
                break;
            }
            v += String.fromCharCode(val);
        }

        return v.trim();
    }

    readChunk(type, parent) {
        const position = this.position;
        const header = this.readHeader(parent);

        if (type !== header.type) {
            if (type !== ChunkType.CHUNK_CLUMP) {
                console.error(`DFFLoader: Chunk "${this.getChunkName(type)}" not found at position ${position}`);
            }
            this.position += header.length;
            return null;
        }

        const chunkStart = this.position;
        const chunk = this.readData(header);

        if (this.position < chunkStart + header.length) {
            console.warn(`DFFLoader: Chunk ${header.name} not read to end`);
            this.position = chunkStart + header.length;
        } else if (this.position > chunkStart + header.length) {
            throw new Error(`DFFLoader: Offset is outside the bounds of chunk ${header.name}`);
        }

        return chunk;
    }

    readData(chunkHeader) {
        let data = null;

        switch (chunkHeader.type) {
            case ChunkType.CHUNK_CLUMP: {
                const header = this.readHeader();
                const numAtomics = this.readUInt32();
                let numLights = 0;
                let numCameras = 0;

                if (header.length === 0xC) {
                    numLights = this.readUInt32();
                    numCameras = this.readUInt32();
                }

                data = {
                    RWFrameList: this.readChunk(ChunkType.CHUNK_FRAMELIST),
                    RWGeometryList: this.readChunk(ChunkType.CHUNK_GEOMETRYLIST),
                    RWAtomicList: []
                };

                for (let i = 0; i < numAtomics; i++) {
                    data.RWAtomicList[i] = this.readChunk(ChunkType.CHUNK_ATOMIC);
                }

                this.readExtension(data);
                break;
            }

            case ChunkType.CHUNK_FRAMELIST: {
                this.readHeader(); // struct header
                const numFrames = this.readUInt32();
                data = new Array(numFrames);

                for (let i = 0; i < numFrames; i++) {
                    const frame = {
                        rotationMatrix: [
                            this.readFloat32(), this.readFloat32(), this.readFloat32(),
                            this.readFloat32(), this.readFloat32(), this.readFloat32(),
                            this.readFloat32(), this.readFloat32(), this.readFloat32()
                        ],
                        position: [this.readFloat32(), this.readFloat32(), this.readFloat32()],
                        parentIndex: this.readInt32(),
                        flags: this.readUInt32()
                    };
                    data[i] = { RWFrame: frame };
                }

                for (let i = 0; i < numFrames; i++) {
                    this.readExtension(data[i]);
                }
                break;
            }

            case ChunkType.CHUNK_GEOMETRYLIST: {
                this.readHeader(); // struct header
                const numGeometries = this.readUInt32();
                data = new Array(numGeometries);

                for (let i = 0; i < numGeometries; i++) {
                    data[i] = this.readChunk(ChunkType.CHUNK_GEOMETRY);
                }
                break;
            }

            case ChunkType.CHUNK_GEOMETRY: {
                const header = this.readHeader();

                data = {
                    format: this.readUInt32(),
                    numTriangles: this.readUInt32(),
                    numVertices: this.readUInt32(),
                    numMorphTargets: this.readUInt32()
                };

                // UV count is stored in bits 16-23
                let numUVs = (data.format >> 16) & 0xFF;
                if (numUVs === 0 && (data.format & GeometryFlag.rwTEXTURED2)) numUVs = 2;
                else if (numUVs === 0 && (data.format & GeometryFlag.rwTEXTURED)) numUVs = 1;

                if (header.version < 0x34000) {
                    data.ambient = this.readFloat32();
                    data.specular = this.readFloat32();
                    data.diffuse = this.readFloat32();
                }

                const isNative = (data.format & GeometryFlag.rwNATIVE) !== 0;

                if (!isNative) {
                    // Vertex colors
                    if (data.format & GeometryFlag.rwPRELIT) {
                        data.prelitcolor = new Array(data.numVertices);
                        for (let i = 0; i < data.numVertices; i++) {
                            data.prelitcolor[i] = {
                                r: this.readUInt8(),
                                g: this.readUInt8(),
                                b: this.readUInt8(),
                                a: this.readUInt8()
                            };
                        }
                    }

                    // Texture coordinates
                    if (data.format & (GeometryFlag.rwTEXTURED | GeometryFlag.rwTEXTURED2)) {
                        data.texCoords = new Array(numUVs);
                        for (let i = 0; i < numUVs; i++) {
                            data.texCoords[i] = new Array(data.numVertices);
                            for (let j = 0; j < data.numVertices; j++) {
                                data.texCoords[i][j] = {
                                    u: this.readFloat32(),
                                    v: this.readFloat32()
                                };
                            }
                        }
                    }

                    // Triangles
                    data.triangles = new Array(data.numTriangles);
                    for (let i = 0; i < data.numTriangles; i++) {
                        // Read 4 uint16 values
                        const v0 = this.readUInt16();
                        const v1 = this.readUInt16();
                        const v2 = this.readUInt16();
                        const v3 = this.readUInt16();

                        data.triangles[i] = {
                            vertex2: v0,
                            vertex1: v1,
                            materialId: v2,
                            vertex3: v3
                        };
                    }
                }

                // Morph targets (vertices and normals)
                // Note: For native geometry, morph targets only contain bounding sphere
                data.morphTargets = new Array(data.numMorphTargets);
                for (let i = 0; i < data.numMorphTargets; i++) {
                    data.morphTargets[i] = {
                        boundingSphere: {
                            x: this.readFloat32(),
                            y: this.readFloat32(),
                            z: this.readFloat32(),
                            radius: this.readFloat32()
                        },
                        hasVertices: 0,
                        hasNormals: 0
                    };

                    // Only read vertex/normal flags and data for non-native geometry
                    if (!isNative) {
                        data.morphTargets[i].hasVertices = this.readUInt32();
                        data.morphTargets[i].hasNormals = this.readUInt32();

                        if (data.morphTargets[i].hasVertices) {
                            data.morphTargets[i].vertices = new Array(data.numVertices);
                            for (let j = 0; j < data.numVertices; j++) {
                                data.morphTargets[i].vertices[j] = {
                                    x: this.readFloat32(),
                                    y: this.readFloat32(),
                                    z: this.readFloat32()
                                };
                            }
                        }

                        if (data.morphTargets[i].hasNormals) {
                            data.morphTargets[i].normals = new Array(data.numVertices);
                            for (let j = 0; j < data.numVertices; j++) {
                                data.morphTargets[i].normals[j] = {
                                    x: this.readFloat32(),
                                    y: this.readFloat32(),
                                    z: this.readFloat32()
                                };
                            }
                        }
                    }
                }

                data.RWMaterialList = this.readChunk(ChunkType.CHUNK_MATERIALLIST);
                this.readExtension(data);
                break;
            }

            case ChunkType.CHUNK_MATERIALLIST: {
                this.readHeader(); // struct header
                const numMaterials = this.readUInt32();
                data = new Array(numMaterials);

                for (let i = 0; i < numMaterials; i++) {
                    data[i] = { id: this.readUInt32() };
                }
                for (let i = 0; i < numMaterials; i++) {
                    const shared = data[i].id;
                    if (shared !== 0xffffffff && shared >= i) throw new Error('DFFLoader: invalid shared material index');
                    data[i].RWMaterial = shared === 0xffffffff
                        ? this.readChunk(ChunkType.CHUNK_MATERIAL)
                        : data[shared].RWMaterial;
                }
                break;
            }

            case ChunkType.CHUNK_MATERIAL: {
                const header = this.readHeader();
                data = {
                    flags: this.readUInt32(),
                    color: {
                        r: this.readUInt8(),
                        g: this.readUInt8(),
                        b: this.readUInt8(),
                        a: this.readUInt8()
                    }
                };

                this.readUInt32(); // unused
                data.isTextured = this.readUInt32();

                if (header.version > 0x30400) {
                    data.ambient = this.readFloat32();
                    data.specular = this.readFloat32();
                    data.diffuse = this.readFloat32();
                }

                if (data.isTextured) {
                    data.RWTexture = this.readChunk(ChunkType.CHUNK_TEXTURE);
                }

                this.readExtension(data);
                break;
            }

            case ChunkType.CHUNK_TEXTURE: {
                this.readHeader(); // struct header
                data = {
                    filterFlags: this.readUInt16()
                };
                this.readUInt16(); // unused
                data.name = this.readChunk(ChunkType.CHUNK_STRING);
                data.maskName = this.readChunk(ChunkType.CHUNK_STRING);
                this.readExtension(data);
                break;
            }

            case ChunkType.CHUNK_STRING:
                data = this.readString(chunkHeader.length);
                break;

            case ChunkType.CHUNK_ATOMIC: {
                this.readHeader(); // struct header
                data = {
                    frameIndex: this.readUInt32(),
                    geometryIndex: this.readUInt32(),
                    flags: this.readUInt32()
                };
                this.readUInt32(); // unused
                this.readExtension(data);
                break;
            }

            case ChunkType.CHUNK_EXTENSION: {
                data = {};
                const chunkEnd = this.position + chunkHeader.length;

                while (this.position < chunkEnd) {
                    const header = this.readHeader();
                    let extension = {};
                    const extStart = this.position;

                    switch (header.type) {
                        case ChunkType.CHUNK_HANIM:
                            extension = {
                                hAnimVersion: this.readUInt32(),
                                nodeId: this.readUInt32(),
                                numNodes: this.readUInt32()
                            };

                            if (extension.numNodes) {
                                extension.flags = this.readUInt32();
                                extension.keyFrameSize = this.readUInt32();
                                extension.nodes = new Array(extension.numNodes);

                                for (let i = 0; i < extension.numNodes; i++) {
                                    extension.nodes[i] = {
                                        nodeId: this.readUInt32(),
                                        nodeIndex: this.readUInt32(),
                                        flags: this.readUInt32()
                                    };
                                }
                            }
                            break;

                        case ChunkType.CHUNK_FRAME:
                            extension = this.readString(header.length);
                            break;

                        case ChunkType.CHUNK_BINMESH: {
                            extension = {
                                faceType: this.readUInt32()
                            };
                            const numSplits = this.readUInt32();
                            extension.numIndices = this.readUInt32();
                            extension.splits = new Array(numSplits);

                            const hasData = header.length > 12 + numSplits * 8;

                            for (let i = 0; i < numSplits; i++) {
                                const numIndices = this.readUInt32();
                                extension.splits[i] = { numIndices: numIndices, matIndex: this.readUInt32() };

                                if (hasData) {
                                    extension.splits[i].indices = new Array(numIndices);
                                    for (let j = 0; j < numIndices; j++) {
                                        extension.splits[i].indices[j] = this.readUInt32();
                                    }
                                }
                            }
                            // BinMesh debug log removed

                            break;
                        }

                        case ChunkType.CHUNK_SKIN: {
                            extension = {
                                numBones: this.readUInt8(),
                                numUsedBones: this.readUInt8(),
                                maxWeightsPerVertex: this.readUInt8(),
                                padding: this.readUInt8()
                            };

                            extension.bonesUsed = new Array(extension.numUsedBones);
                            for (let i = 0; i < extension.numUsedBones; i++) {
                                extension.bonesUsed[i] = this.readUInt8();
                            }

                            const numVertices = chunkHeader.parent.numVertices;

                            extension.vertexBoneIndices = new Array(numVertices);
                            for (let i = 0; i < numVertices; i++) {
                                extension.vertexBoneIndices[i] = {
                                    x: this.readUInt8(),
                                    y: this.readUInt8(),
                                    z: this.readUInt8(),
                                    w: this.readUInt8()
                                };
                            }

                            extension.vertexBoneWeights = new Array(numVertices);
                            for (let i = 0; i < numVertices; i++) {
                                extension.vertexBoneWeights[i] = {
                                    x: this.readFloat32(),
                                    y: this.readFloat32(),
                                    z: this.readFloat32(),
                                    w: this.readFloat32()
                                };
                            }

                            extension.skinToBoneMatrix = new Array(extension.numBones);
                            for (let i = 0; i < extension.numBones; i++) {
                                if (extension.numUsedBones === 0) {
                                    this.position += 4; // skip 0xDEADDEAD marker
                                }
                                extension.skinToBoneMatrix[i] = [];
                                for (let j = 0; j < 16; j++) {
                                    extension.skinToBoneMatrix[i][j] = this.readFloat32();
                                }
                            }

                            if (extension.numUsedBones !== 0) {
                                this.position += 0x0C; // skip padding
                            }
                            break;
                        }

                        case ChunkType.CHUNK_MESHEXTENSION: {
                            const magicNumber = this.readUInt32();
                            if (magicNumber === 0) break;
                            console.warn('DFFLoader: MESHEXTENSION not fully implemented');
                            this.position = extStart + header.length;
                            break;
                        }

                        default:
                            this.position += header.length;
                            // Silently skip unknown extensions to reduce console noise
                            break;
                    }

                    if (this.position < extStart + header.length) {
                        console.warn(`DFFLoader: Extension ${header.name} not read to end`);
                        this.position = extStart + header.length;
                    }

                    if (data[header.name]) {
                        console.warn(`DFFLoader: Duplicate extension ${header.name}`);
                    }

                    data[header.name] = extension;
                }
                break;
            }

            default:
                console.warn(`DFFLoader: Unknown chunk type ${chunkHeader.name}`);
                break;
        }

        return data;
    }

    readExtension(chunk) {
        chunk.RWExtension = this.readChunk(ChunkType.CHUNK_EXTENSION, chunk);
    }
}

export default DFFReader;
