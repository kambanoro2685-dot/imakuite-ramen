// ネイティブ（iOS/Android）の写真保存は未対応。EXIF（撮影場所など）を確実に除去する処理が
// まだ無いため、Web 版（photo.web.ts）でのみ保存できるようにしている。
export const photoSupported = false;

export type Processed = { blob: Blob; uri: string; type: 'image/webp' | 'image/jpeg' };

export async function processPhoto(_srcUri: string): Promise<Processed> {
  throw new Error('写真の保存は、いまは Web 版でのみ使えます。');
}
