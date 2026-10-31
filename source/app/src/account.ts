import { Platform } from 'react-native';
import { deleteAllMyPhotos } from './storage';
import { supabase, uuid4 } from './supabase';

export type ServerMe = {
  public_id: string;
  codename: string;
  trust_score: number;
  ikp: number;
  rank: number;
  terms_version: string | null;
};

/** パスキーは現在 Web 版のみ対応（ネイティブは専用モジュールと関連ドメインの設定が要る） */
export const passkeySupported = (): boolean =>
  Platform.OS === 'web' && typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials;

/** Supabase / Postgres / WebAuthn のエラーを、利用者向けの日本語にする */
export function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as any).message) : String(e);
  const name = e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError' || /ERROR_CEREMONY_ABORTED|cancel/i.test(msg)) return 'パスキーの操作がキャンセルされました。';
  if (/codename_taken/.test(msg)) return 'そのコードネームは使われています。別の名前にしてください。';
  if (/invalid_codename/.test(msg)) return 'コードネームは1〜16文字で、使えない文字があります。';
  if (/Anonymous user not allowed/i.test(msg)) return '匿名アカウントにはパスキーを付けられません。いったんログアウトして登録し直してください。';
  if (/Signups not allowed|signup.*disabled/i.test(msg)) return 'Supabase 側で新規登録が無効になっています。（設定手順を参照）';
  if (/passkey|webauthn/i.test(msg) && /disabled|not enabled|not_enabled/i.test(msg)) return 'Supabase 側でパスキーが有効になっていません。（設定手順を参照）';
  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) return 'サーバに接続できません。';
  if (/score_required/.test(msg)) return '満足度が未入力です。';
  if (/oshi_not_found/.test(msg)) return 'その調査官は見つからないか、公開されていません。';
  if (/oshi_self/.test(msg)) return '自分自身は推せません。';
  if (/oshi_limit/.test(msg)) return '推しは20人までです。だれかを解除してから登録してください。';
  if (/not_registered/.test(msg)) return '店を追加するには、アカウント登録（ログイン）が必要です。';
  if (/invalid_name/.test(msg)) return '店名は1〜80文字で入れてください。';
  if (/invalid_location/.test(msg)) return '現在地を取得できませんでした。';
  if (/rate_limited/.test(msg)) return '店の追加は、1日20件までです。明日またお試しください。';
  if (/duplicate_shop/.test(msg)) return 'すでに登録されている店です。';
  return msg;
}

export async function fetchMe(): Promise<ServerMe | null> {
  const { data, error } = await supabase.rpc('me');
  if (error) throw error;
  return data as ServerMe | null;
}

/**
 * 新規登録（1/2）: 調査官のアカウントを作り、公開IDを発行する。
 * Supabase は匿名ユーザーにパスキーを付けられないため、使い捨ての合成メール + ランダムなパスワードの
 * 通常アカウントを作る。メールは実在せず（.invalid）、個人情報は入らない。ログインはパスキーだけで行う。
 * ※ Supabase 側で「Confirm email」をオフにしておく必要がある。
 * 失敗してもログイン状態は残すので、コードネームを変えて再試行できる。
 */
export async function startAccount(codename: string): Promise<{ publicId: string }> {
  const cur = await supabase.auth.getSession();
  let session = cur.data.session;
  if (session?.user.is_anonymous) {
    await supabase.auth.signOut({ scope: 'local' });
    session = null;
  }
  if (!session) {
    const email = `${uuid4().replace(/-/g, '')}@users.imakuite.invalid`;
    const { data, error } = await supabase.auth.signUp({ email, password: randomPassword() });
    if (error) throw error;
    if (!data.session) throw new Error('Supabase のメール確認(Confirm email)がオンのため登録できません。（設定手順を参照）');
  }
  const { data, error } = await supabase.rpc('register_inspector', { p_codename: codename });
  if (error) throw error;
  return { publicId: (data as any).public_id as string };
}

function randomPassword(len = 32): string {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 新規登録（2/2）／パスキーの追加: ログイン中のアカウントにこの端末のパスキーを登録する */
export async function addPasskey(): Promise<void> {
  const { error } = await supabase.auth.registerPasskey();
  if (error) throw error;
}

/** 登録済みの端末パスキーでログイン */
export async function loginWithPasskey(): Promise<ServerMe> {
  const { error } = await supabase.auth.signInWithPasskey();
  if (error) throw error;
  const me = await fetchMe();
  if (!me) throw new Error('このアカウントは削除されています。');
  return me;
}

/**
 * 復旧コード: パスキーをなくしたときの、もう1つのログイン手段。
 * アカウントの合成メール（32桁）と、新しいランダムなパスワード（128bit）を1本の文字列にしたもの。
 * 画面に出すのは発行時の1回だけ（サーバにはパスワードのハッシュしか残らない）。再発行すると、前のコードは使えなくなる。
 */
const RECOVERY_PREFIX = 'IKRC-';
const RECOVERY_DOMAIN = '@users.imakuite.invalid';

export async function issueRecoveryCode(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email ?? '';
  if (!email.endsWith(RECOVERY_DOMAIN)) throw new Error('このアカウントでは復旧コードを発行できません。');
  const password = randomPassword(16).replace(/[^A-Za-z0-9]/g, 'x').padEnd(22, 'x').slice(0, 22);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return `${RECOVERY_PREFIX}${email.slice(0, -RECOVERY_DOMAIN.length)}-${password}`;
}

export async function loginWithRecoveryCode(code: string): Promise<ServerMe> {
  const c = code.replace(/s+/g, '');
  const m = /^IKRC-([0-9a-f]{32})-([A-Za-z0-9]{22})$/.exec(c);
  if (!m) throw new Error('復旧コードの形式が正しくありません。コピーしたものをそのまま貼り付けてください。');
  const { error } = await supabase.auth.signInWithPassword({ email: m[1] + RECOVERY_DOMAIN, password: m[2] });
  if (error) throw new Error(/invalid/i.test(error.message) ? '復旧コードが違うか、再発行で無効になっています。' : error.message);
  const me = await fetchMe();
  if (!me) throw new Error('このアカウントは削除されています。');
  return me;
}

export async function hasPasskey(): Promise<boolean> {
  const { data, error } = await supabase.auth.passkey.list();
  return !error && Array.isArray(data) && data.length > 0;
}

export const logout = () => supabase.auth.signOut({ scope: 'local' });

export async function deleteAccount(): Promise<void> {
  await deleteAllMyPhotos().catch(() => {}); // 画像ファイルを先に消す（記録の削除は delete_account）
  const { error } = await supabase.rpc('delete_account');
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
}

/** 同意した規約の版をサーバに記録する（ログイン中のアカウントのみ） */
export async function recordTerms(version: string): Promise<void> {
  const { error } = await supabase.rpc('accept_terms', { p_version: version });
  if (error) throw error;
}

// ---- 推し・ランキング ----
export type PublicInspector = {
  public_id: string; codename: string; rank: number; rank_name: string;
  ikp: number; fans: number; visits: number; is_oshi: boolean;
  pos?: number; is_me?: boolean;
};
export type MyPublic = { is_public: boolean; fans: number; oshi_count: number };

const rows = async <T,>(p: PromiseLike<{ data: any; error: any }>): Promise<T[]> => {
  const { data, error } = await p;
  if (error) throw error;
  return (data as T[]) ?? [];
};

export async function getMyPublic(): Promise<MyPublic | null> {
  const { data, error } = await supabase.rpc('my_public');
  if (error) throw error;
  return data as MyPublic | null;
}
export async function setPublic(on: boolean): Promise<MyPublic> {
  const { data, error } = await supabase.rpc('set_public', { p_public: on });
  if (error) throw error;
  return data as MyPublic;
}
export const searchInspectors = (q: string) => rows<PublicInspector>(supabase.rpc('search_inspectors', { p_q: q, p_limit: 20 }));
export const inspectorRanking = (kind: 'points' | 'fans') =>
  rows<PublicInspector>(supabase.rpc('inspector_ranking', { p_kind: kind, p_limit: 50 })).then((l) => l.map((r) => ({ ...r, pos: Number(r.pos) })));
export const myOshi = () => rows<PublicInspector>(supabase.rpc('my_oshi'));
export async function addOshi(publicId: string): Promise<void> {
  const { error } = await supabase.rpc('add_oshi', { p_public_id: publicId });
  if (error) throw error;
}
export async function removeOshi(publicId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_oshi', { p_public_id: publicId });
  if (error) throw error;
}
export type OshiShop = { shop_id: string; names: string[]; last_at: string };
export const oshiShops = () => rows<OshiShop>(supabase.rpc('oshi_shops'));

/** 候補にない店を、いまの場所に追加する（ラーメン専門店でない店も含む）。新しい店は +100pt */
export async function createShop(name: string, lat: number, lng: number): Promise<string> {
  const { data, error } = await supabase.rpc('create_shop', { p_name: name, p_lat: lat, p_lng: lng, p_genre: 'その他' });
  if (error) throw error;
  return (data as { id: string }).id;
}
