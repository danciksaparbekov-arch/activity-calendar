// Вырезает область из картинки (с учётом поворота), уменьшает до maxSide и отдаёт JPEG-файл.
const MAX_SIDE = 1600; // длинная сторона результата, пикселей

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось открыть картинку'));
    img.src = src;
  });

// pixelCrop — область в пикселях повёрнутой картинки (как отдаёт react-easy-crop)
export async function cropToFile(src, pixelCrop, rotation, fileName) {
  const image = await loadImage(src);
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));

  // 1) рисуем повёрнутую картинку целиком
  const full = document.createElement('canvas');
  full.width = Math.round(image.width * cos + image.height * sin);
  full.height = Math.round(image.width * sin + image.height * cos);
  const fctx = full.getContext('2d');
  fctx.translate(full.width / 2, full.height / 2);
  fctx.rotate(rad);
  fctx.drawImage(image, -image.width / 2, -image.height / 2);

  // 2) вырезаем нужную область и сжимаем
  const scale = Math.min(1, MAX_SIDE / Math.max(pixelCrop.width, pixelCrop.height));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(pixelCrop.width * scale));
  out.height = Math.max(1, Math.round(pixelCrop.height * scale));
  const octx = out.getContext('2d');
  octx.fillStyle = '#ffffff'; // прозрачность PNG в JPEG стала бы чёрной
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(full, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, out.width, out.height);

  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) throw new Error('Не удалось сохранить картинку');
  const base = fileName.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}
