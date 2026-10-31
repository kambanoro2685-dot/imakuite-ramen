import { Processed } from './photo';
import { supabase, uuid4 } from './supabase';

const BUCKET = 'visit-photos';

async function myId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('写真を保存するには、ログインが必要です。');
  return uid;
}

/**
 * 下ごしらえ済みの写真を自分のフォルダ（<自分のID>/…）にアップロードし、公開URLを返す。
 * 削除した写真が CDN のキャッシュに長く残らないよう、キャッシュは1時間にしている。
 */
export async function uploadPhoto(p: Processed): Promise<string> {
  const uid = await myId();
  const path = `${uid}/${uuid4()}.${p.type === 'image/webp' ? 'webp' : 'jpg'}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, p.blob, {
    contentType: p.type, upsert: false, cacheControl: '3600',
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** アカウント削除の前に、自分の写真ファイルを全部消す */
export async function deleteAllMyPhotos(): Promise<void> {
  const uid = await myId();
  const files = await supabase.storage.from(BUCKET).list(uid, { limit: 1000 });
  if (files.error) throw files.error;
  const names = (files.data ?? []).map((f) => `${uid}/${f.name}`);
  if (names.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(names);
    if (error) throw error;
  }
}
