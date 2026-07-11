```text
import bpy

# Converts all materials to simple:
# Image Texture -> Principled BSDF Base Color -> Material Output

def simplify_material_to_base_texture(mat):
    if not mat or not mat.use_nodes:
        return

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    # Try to find existing image texture
    image_node = None
    for node in nodes:
        if node.type == "TEX_IMAGE" and node.image:
            image_node = node
            break

    if not image_node:
        print(f"Skipped {mat.name}: no image texture found")
        return

    image = image_node.image

    nodes.clear()

    tex = nodes.new(type="ShaderNodeTexImage")
    tex.image = image
    tex.location = (-500, 0)

    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (-200, 0)

    output = nodes.new(type="ShaderNodeOutputMaterial")
    output.location = (100, 0)

    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

    print(f"Converted {mat.name} -> {image.name}")


for mat in bpy.data.materials:
    simplify_material_to_base_texture(mat)

print("Done: all possible materials converted to Base Color texture only.")
```

```text
from pathlib import Path
from PIL import Image

MAX = 256
COLORS = 16
OUT = Path(__file__).parent / "textures_256"
OUT.mkdir(exist_ok=True)

for p in Path(__file__).parent.glob("*.png"):
    img = Image.open(p).convert("RGBA")
    img.thumbnail((MAX, MAX), Image.Resampling.NEAREST)

    alpha = img.getchannel("A")
    transparent = alpha.getextrema()[0] < 255

    if transparent:
        bg = Image.new("RGBA", img.size, (0, 0, 0, 255))
        bg.alpha_composite(img)
        q = bg.convert("RGB").quantize(colors=COLORS - 1, dither=Image.Dither.NONE)

        out = Image.new("P", img.size, 0)
        out.putpalette([0, 0, 0] + q.getpalette()[:(COLORS - 1) * 3] + [0] * (768 - COLORS * 3))

        qp, op, ap = q.load(), out.load(), alpha.load()
        for y in range(img.height):
            for x in range(img.width):
                if ap[x, y] >= 128:
                    op[x, y] = qp[x, y] + 1

        out.info["transparency"] = 0
    else:
        out = img.convert("RGB").quantize(colors=COLORS, dither=Image.Dither.NONE)

    out.save(OUT / p.name, optimize=True)
    print(p.name, "->", out.size)

print("Done")
```

```text
gltfpack.exe -i m.glb -o m_small.glb -cc -kn
ffmpeg.exe -y -i s.wav -ac 1 -ar 22050 -c:a libvorbis -qscale:a 0 s.ogg
```
