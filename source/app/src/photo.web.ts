// 写真の下ごしらえ（Web）: 長辺1600pxに縮小し、WebP(なければJPEG)で再エンコードして保存する。
// canvas に描き直して書き出すため、撮影場所・機種などの EXIF は残らない。
export const photoSupported = true;

export type Processed = { blob: Blob; uri: string; type: 'image/webp' | 'image/jpeg' };

const LIMIT = 900 * 1024; // バケットの上限(1MB)に余裕を持たせる

const toBlob = (c: HTMLCanvasElement, type: string, q: number) =>
  new Promise<Blob | null>((res) => c.toBlob((b) => res(b), type, q));

export async function processPhoto(srcUri: string): Promise<Processed> {
  const src = await (await fetch(srcUri)).blob();
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(src, { imageOrientation: 'from-image' });
  } catch {
    bmp = await createImageBitmap(src);
  }
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();

  let type: Processed['type'] = 'image/webp';
  let blob = await toBlob(canvas, 'image/webp', 0.8);
  if (!blob || blob.type !== 'image/webp') {
    type = 'image/jpeg';
    blob = await toBlob(canvas, 'image/jpeg', 0.8);
  }
  for (const q of [0.7, 0.6, 0.5, 0.4]) {
    if (blob && blob.size <= LIMIT) break;
    blob = await toBlob(canvas, type, q);
  }
  if (!blob || blob.size > LIMIT) throw new Error('写真が大きすぎます。別の写真を選んでください。');
  return { blob, uri: URL.createObjectURL(blob), type };
}
