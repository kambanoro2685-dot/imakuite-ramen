import { Post, Profile } from './store';
import { supabase } from './supabase';

/** step: 0=未 1=来店を保存 2=皿を保存 3=評価を保存 4=提出済み */
export const SYNC_DONE = 4;
type Sync = NonNullable<Post['sync']>;

const MOOD: Record<string, string> = { 疲れ: 'tired', 穏やか: 'good', 普通: 'normal', 上機嫌: 'good', 絶好調: 'great' };
const VOLUME: Record<string, string> = { 少なめ: 'less', ちょうど: 'just_right', 多め: 'more', 驚愕: 'huge' };
// 調査票の「静かさ」: 0=静か 〜 4=賑やか
const QUIET: Record<string, number> = { 静か: 0, 会話しやすい: 1, ふつう: 2, 騒がしい: 4 };

const GOOD3: Record<string, number> = { 良い: 0, ふつう: 1, 気になる: 2 };
const WAIT: Record<string, number> = { すぐ: 0, '〜10分': 10, '〜30分': 30, '30分超': 45 };
const SPEED: Record<string, number> = { すぐ: 2, '〜5分': 5, '〜10分': 10, '10分超': 15 };
const SERVICE: Record<string, number> = { 残念: 0, いまいち: 1, ふつう: 2, 良い: 3, とても良い: 4 };
const CROWD: Record<string, number> = { 空いている: 0, ふつう: 1, やや混み: 2, 満席: 3, 行列: 4 };
const SMOKE: Record<string, string> = { 禁煙: 'no', 喫煙可: 'yes', 分煙: 'separated' };
const NOISE: Record<string, number> = { '〜40dB': 40, '〜55dB': 55, '〜70dB': 70, '70dB超': 80 };
const PAY: Record<string, string> = { 現金: 'cash', 交通系IC: 'ic', クレジット: 'credit', QR: 'qr' };
const SEATS: Record<string, string> = { カウンター: 'counter', テーブル: 'table', 座敷: 'tatami', 個室: 'private_room' };
const TAGS: Record<string, string> = { 疲れた: 'tired', お祝い: 'celebration', 仕事: 'business', 一人: 'solo', デート: 'date', 急ぎ: 'rush' };
const RICH: Record<string, number> = { あっさり: 0, やや軽め: 1, ふつう: 2, こってり: 3, 超こってり: 4 };
const list = (s?: string) => (s ? s.split(',').filter(Boolean) : []);
const csv = (s: string | undefined, m: Record<string, string>) => list(s).map((x) => m[x]).filter(Boolean).join(',');

const partyNum = (s?: string) => (s ? Math.min(20, parseInt(s, 10) || 0) || undefined : undefined);
/** 同じ id の再送は「保存済み」として成功扱いにする（べき等） */
const dupOk = (e: { code?: string } | null) => (e && e.code !== '23505' ? e : null);

/**
 * 投稿を Supabase へ送る。id は端末で採番済みなので、途中で失敗しても何度でも再送できる。
 * ステップごとに進捗を保存し、続きから送る。
 * 端末の調査票とDBの評価項目にはまだ差があり、対応できる項目だけ送る
 * （清掃・店の規模などは端末内のみ。調査票UIをDB項目に合わせるまでの暫定）。
 */
export async function syncPost(post: Post, save: (s: Sync) => void): Promise<void> {
  let sy: Sync = post.sync ?? { key: '', dishId: '', step: 0 };
  const persist = (step: number, extra: Partial<Sync> = {}) => {
    sy = { ...sy, step, ...extra };
    save(sy);
  };
  const v = post.vals;
  const visitId = sy.key;

  if (sy.step < 1) {
    const row: Record<string, unknown> = {
      id: visitId,
      shop_id: post.venue,
      entered_at: new Date(post.enteredAt ?? post.t).toISOString(),
    };
    if (post.weather && post.weather[2] > 0) {
      [row.weather, row.temp_c, row.pressure_hpa] = post.weather;
    }
    const party = partyNum(v.party);
    if (party) row.party_size = party;
    if (v.hunger) row.hunger_before = (Number(v.hunger) - 1) * 25;
    if (v.mood && MOOD[v.mood]) row.mood = MOOD[v.mood];
    if (v.note) row.comment = v.note;
    if (v.full) row.fullness_after = (Number(v.full) - 1) * 25;
    const tags = csv(v.tags, TAGS);
    if (tags) row.mood_tags = tags;
    const e = dupOk((await supabase.from('visit').insert(row)).error);
    if (e) throw e;
    persist(1);
  }
  if (sy.step < 2) {
    const row: Record<string, unknown> = { id: sy.dishId, visit_id: visitId, name: post.dish };
    if (v.price) row.price_yen = Number(v.price);
    if (v.amount && VOLUME[v.amount]) row.volume = VOLUME[v.amount];
    if (v.soup) row.soup = v.soup;
    if (v.richness && RICH[v.richness] !== undefined) row.richness = RICH[v.richness];
    if (v.thick) row.noodle_thick = v.thick;
    if (v.firm) row.noodle_firm = v.firm;
    if (v.ntype) row.noodle_type = v.ntype;
    if (v.kaedama === '替え玉あり' || v.kaedama === '替え玉した') row.kaedama = true;
    else if (v.kaedama === '替え玉なし' || v.kaedama === 'しなかった') row.kaedama = false;
    // 具材・トッピング・付け合わせ: 選んだもの + 自由入力（カンマ区切り）
    const merge = (chips?: string, other?: string) => [...list(chips), ...(other ? other.split(/[,、，\s]+/).filter(Boolean) : [])].join(',');
    const base = merge(v.base, v.base_other);
    if (base) row.base_items = base.slice(0, 200);
    const tops = merge(v.toppings, v.tops_other);
    if (tops) row.toppings = tops.slice(0, 120);
    const sides = merge(v.sides, v.sides_other);
    if (sides) row.sides = sides.slice(0, 200);
    const removed = merge(v.removed, v.removed_other);
    if (removed) row.removed_items = removed.slice(0, 200);
    const disliked = merge(v.disliked, v.disliked_other);
    if (disliked) row.disliked_items = disliked.slice(0, 200);
    const taste: Record<string, string> = { ts_sweet: 'taste_sweet', ts_salty: 'taste_salty', ts_sour: 'taste_sour', ts_bitter: 'taste_bitter', ts_umami: 'taste_umami', ts_hot: 'taste_hot' };
    for (const [k, col] of Object.entries(taste)) if (v[k] !== undefined && v[k] !== '') row[col] = Number(v[k]);
    if (v.tax) row.tax_included = v.tax === '税込';
    if (v.pickdish) row.is_pick = true;
    const e = dupOk((await supabase.from('dish').insert(row)).error);
    if (e) throw e;
    persist(2);
  }
  // 写真（端末でアップロード済みのURLを記録する。id は端末で採番済みなので再送しても重複しない）
  if (sy.step >= 2 && !sy.photosDone) {
    let i = 0;
    for (const ph of post.photos ?? []) {
      const e = dupOk((await supabase.from('photo').insert({ id: ph.id, visit_id: visitId, storage_url: ph.url, sort_order: i++ })).error);
      if (e) throw e;
    }
    persist(sy.step, { photosDone: true });
  }
  if (sy.step < 3) {
    const row: Record<string, unknown> = { visit_id: visitId, satisfaction: post.sat * 20 };
    if (v.rec === 'また行く') { row.would_return = true; row.would_recommend = true; }
    if (v.rec === '行かない') row.would_return = false;
    if (v.quiet && QUIET[v.quiet] !== undefined) row.quietness = QUIET[v.quiet];
    const grade: Record<string, string> = {
      cl_entrance: 'clean_entrance', cl_seating: 'clean_seating', cl_tableware: 'clean_tableware', cl_restroom: 'clean_restroom', cl_kitchen: 'clean_kitchen',
      aroma: 'aroma', texture: 'texture', temperature: 'temperature', presentation: 'presentation',
    };
    for (const [k, col] of Object.entries(grade)) if (v[k] && GOOD3[v[k]] !== undefined) row[col] = GOOD3[v[k]];
    if (v.wait && WAIT[v.wait] !== undefined) row.wait_min = WAIT[v.wait];
    if (v.speed && SPEED[v.speed] !== undefined) row.serve_speed_min = SPEED[v.speed];
    if (v.service && SERVICE[v.service] !== undefined) row.service = SERVICE[v.service];
    if (v.crowd && CROWD[v.crowd] !== undefined) row.crowdedness = CROWD[v.crowd];
    if (v.smoke && SMOKE[v.smoke]) row.smoking = SMOKE[v.smoke];
    if (v.noise && NOISE[v.noise] !== undefined) row.noise_db = NOISE[v.noise];
    const pay = csv(v.pay, PAY);
    if (pay) row.payment_methods = pay;
    const seats = csv(v.seats, SEATS);
    if (seats) row.seat_types = seats;
    const fac = list(v.facil);
    if (fac.length) {
      row.accessibility = fac.includes('バリアフリー');
      row.kids_friendly = fac.includes('子連れ向き');
      row.solo_friendly = fac.includes('一人向き');
      row.multilingual_menu = fac.includes('多言語メニュー');
    }
    const { error } = await supabase.from('visit_score').upsert(row);
    if (error) throw error;
    persist(3);
  }
  if (sy.step < 4) {
    const { error } = await supabase.rpc('submit_visit', { p_visit: visitId });
    if (error) throw error;
    persist(4);
  }
}

const NATIONS: Record<string, string> = { 日本: 'JP', アメリカ: 'US', 中国: 'CN', 韓国: 'KR', 台湾: 'TW', ベトナム: 'VN', フィリピン: 'PH', ブラジル: 'BR', タイ: 'TH' };

/** 端末のプロフィール → DBの丸め値形式に変換して保存（わからない項目は送らない。失敗しても登録は止めない） */
export async function pushProfile(p: Profile): Promise<void> {
  const row: Record<string, unknown> = {};
  const g = { 女性: 'female', 男性: 'male', その他: 'other', 回答しない: 'unspecified' }[p.gender];
  if (g) row.gender = g;
  const age = parseInt(p.age, 10);
  if (p.age === '〜19') row.age_band = 10;
  else if (age >= 20) row.age_band = Math.min(100, Math.floor(age / 10) * 10);
  const nat = NATIONS[p.nationality.trim()] ?? (/^[A-Za-z]{2}$/.test(p.nationality.trim()) ? p.nationality.trim().toUpperCase() : null);
  if (nat) row.nationality = nat;
  if (!Object.keys(row).length) return;
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return;
  await supabase.from('inspector_profile').upsert({ inspector_id: uid, ...row, updated_at: new Date().toISOString() });
}
