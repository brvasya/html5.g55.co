export function createMuzzleFlashTexture(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const center = 64;

  const glow = ctx.createRadialGradient(center, center, 2, center, center, 58);
  glow.addColorStop(0, "rgba(255,255,235,1)");
  glow.addColorStop(0.12, "rgba(255,225,135,1)");
  glow.addColorStop(0.42, "rgba(255,145,45,0.82)");
  glow.addColorStop(1, "rgba(255,90,15,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);

  ctx.save();
  ctx.translate(center, center);
  ctx.globalCompositeOperation = "lighter";
  for (const rotation of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
    ctx.rotate(rotation);
    const streak = ctx.createLinearGradient(-58, 0, 58, 0);
    streak.addColorStop(0, "rgba(255,130,40,0)");
    streak.addColorStop(0.5, "rgba(255,245,200,0.9)");
    streak.addColorStop(1, "rgba(255,130,40,0)");
    ctx.fillStyle = streak;
    ctx.fillRect(-58, -2.2, 116, 4.4);
    ctx.rotate(-rotation);
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
