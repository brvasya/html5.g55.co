export function makeMaterialCrisp(THREE, material) {
  if (!material) return;

  const materials = Array.isArray(material) ? material : [material];

  materials.forEach(mat => {
    if (!mat) return;

    [
      mat.map,
      mat.normalMap,
      mat.roughnessMap,
      mat.metalnessMap,
      mat.emissiveMap,
      mat.aoMap
    ]
      .filter(Boolean)
      .forEach(texture => {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
      });
  });
}
