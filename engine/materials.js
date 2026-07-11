export function makeMaterialCrisp(THREE, material) {
  if (!material) return;

  if (Array.isArray(material)) {
    for (const mat of material) {
      makeMaterialCrisp(THREE, mat);
    }
    return;
  }

  const mat = material;

  if (mat.userData.crispApplied) return;

  if ("metalness" in mat) mat.metalness = 0;
  if ("roughness" in mat) mat.roughness = 1;

  applyCrispTexture(THREE, mat.map);

  mat.userData.crispApplied = true;
  mat.needsUpdate = true;
}

function applyCrispTexture(THREE, texture) {
  if (!texture || texture.userData.crispApplied) return;

  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.userData.crispApplied = true;
}
