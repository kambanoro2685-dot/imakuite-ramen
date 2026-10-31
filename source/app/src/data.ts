/** ラーメンの系統（好みの登録・店の絞り込み・投稿の「スープの系統」で使う） */
export const GENRES = ['醤油', '味噌', '塩', '豚骨', '家系', '二郎系', 'つけ麺', 'まぜそば・油そば', '担々麺', '煮干し・魚介', '鶏白湯'];

/** こってり度（0=あっさり … 4=こってり）。好みの登録と、投稿の「濃さ」で使う */
export const RICHNESS = ['あっさり', 'やや軽め', 'ふつう', 'こってり', '超こってり'];
export const THICKNESS = ['細', '中', '太', '極太'];
export const NOODLE_TYPES = ['ちぢれ', 'ストレート', '平打ち'];
export const TOPPINGS = ['チャーシュー', '味玉', 'メンマ', 'ネギ', '海苔', 'もやし', 'ほうれん草', '背脂', 'にんにく', '辛味噌'];
export const FIRMNESS = ['固め', '普通', '柔らかめ'];
/** デフォルトの具材（最初から丼に乗っているもの） */
export const INGREDIENTS = ['チャーシュー', 'メンマ', 'ネギ', '海苔', 'なると', 'もやし', 'ほうれん草', '青菜', 'きくらげ', 'キャベツ', '玉ねぎ', 'ニラ', 'コーン', 'わかめ'];
/** 付け合わせ（薬味・卓上の味付けなど。ご飯・餃子などは含めない） */
export const SIDES = ['高菜', '紅しょうが', '白ごま', 'おろしにんにく', '漬物', 'ゆず胡椒', 'ラー油', '酢', 'コショウ'];
/** 抜いてもらった具材・嫌いな具材の選択肢（丼の具材・トッピング・付け合わせをまとめたもの） */
export const ALL_ITEMS = Array.from(new Set([...INGREDIENTS, ...TOPPINGS, ...SIDES]));

export type FieldDef = { k: string; n: string; rank: number; hint?: string; /** ポイントの組（POINT_RULES の kind）。そろえるとその組のポイントが付く */ g?: string; /** 自由入力など、親の項目と一緒にON/OFFする（入力項目の一覧には出さない） */ parent?: string } & (
  | { type: 'photo' | 'price' | 'text' }
  | { type: 'item' } // 短い自由入力（ラーメン以外の品目は入力できない）
  | { type: 'range'; labels: string[] } // labels[1..5]
  | { type: 'pick'; opts: string[] }
  | { type: 'faces'; opts: [string, string][] }
  | { type: 'rating' } // 0〜5
  | { type: 'multi'; opts: string[] } // 複数選択（"," 区切りで保存）
);

const GOOD3 = ['良い', 'ふつう', '気になる'];

/**
 * 階級ごとの入力項目。rank は解放される階級（0=見習い … 4=主任）。
 * 「入力できる階級」と「他の調査官の評価で見られる階級」は同じ（評価一覧の黒塗りも同じ階級で外れる）。
 * ポイントは項目ごとではなく「組（g）」ごと。表は POINT_RULES。
 */
export const FIELDS: FieldDef[] = [
  // ---- 見習い（0pt〜）: 基本の7項目 ----
  { k: 'photo', n: '写真（最大3枚）', rank: 0, type: 'photo', g: 'photo' },
  { k: 'price', n: '価格', rank: 0, type: 'price', g: 'basic_record' },
  { k: 'amount', n: '量（麺・全体）', rank: 0, type: 'pick', opts: ['少なめ', 'ちょうど', '多め', '驚愕'], g: 'basic_record' },
  { k: 'note', n: '食べた後の感想（5文字以上）', rank: 0, type: 'text', g: 'basic_record' },
  { k: 'soup', n: 'スープの系統', rank: 0, type: 'pick', opts: [...GENRES, 'その他'], g: 'ramen_soup', hint: '好みのマッチングに使われます' },
  { k: 'rec', n: 'おすすめ度', rank: 0, type: 'pick', opts: ['また行く', '気が向いたら', '行かない'] },
  { k: 'toppings', n: 'トッピング（追加したもの）', rank: 0, type: 'multi', opts: TOPPINGS, g: 'ramen_toppings', hint: '追加したトッピングだけ。定食の具材・ご飯・チャーハン・餃子は入力できません' },
  { k: 'tops_other', n: 'トッピング（その他・自由入力）', rank: 0, type: 'item', parent: 'toppings', g: 'ramen_toppings' },

  // ---- 三級（300pt〜）: 体調・状況・環境・清掃・濃さと麺・具材 ----
  { k: 'hunger', n: 'おなかの減り具合（入店前）', rank: 1, type: 'range', labels: ['', '平気', '少し空いた', 'そこそこ', 'かなり', '限界'], g: 'condition' },
  { k: 'full', n: '食後の満腹度', rank: 1, type: 'range', labels: ['', 'まだ入る', 'ほどよい', '満足', 'お腹いっぱい', '食べすぎ'], g: 'condition' },
  { k: 'party', n: '何人で行ったか', rank: 1, type: 'pick', opts: ['1人', '2人', '3人', '4人', '5人以上'], g: 'visit_info' },
  { k: 'mood', n: 'その時の気分', rank: 1, type: 'faces', opts: [['😪', '疲れ'], ['😌', '穏やか'], ['🙂', '普通'], ['😆', '上機嫌'], ['🔥', '絶好調']], g: 'visit_info' },
  { k: 'quiet', n: '静かさ', rank: 1, type: 'pick', opts: ['騒がしい', 'ふつう', '会話しやすい', '静か'], g: 'environment' },
  { k: 'wait', n: '待ち時間', rank: 1, type: 'pick', opts: ['すぐ', '〜10分', '〜30分', '30分超'], g: 'environment' },
  { k: 'cl_entrance', n: '清掃｜入口・外観', rank: 1, type: 'pick', opts: GOOD3, g: 'clean_5' },
  { k: 'cl_seating', n: '清掃｜席まわり', rank: 1, type: 'pick', opts: GOOD3, g: 'clean_5' },
  { k: 'cl_tableware', n: '清掃｜食器・箸', rank: 1, type: 'pick', opts: GOOD3, g: 'clean_5' },
  { k: 'cl_restroom', n: '清掃｜お手洗い', rank: 1, type: 'pick', opts: GOOD3, g: 'clean_5' },
  { k: 'cl_kitchen', n: '清掃｜厨房・カウンター', rank: 1, type: 'pick', opts: GOOD3, g: 'clean_5' },
  { k: 'richness', n: '濃さ（こってり度）', rank: 1, type: 'pick', opts: RICHNESS, g: 'ramen_noodle' },
  { k: 'thick', n: '麺の太さ', rank: 1, type: 'pick', opts: THICKNESS, g: 'ramen_noodle' },
  { k: 'firm', n: '麺の硬さ', rank: 1, type: 'pick', opts: FIRMNESS, g: 'ramen_noodle' },
  { k: 'ntype', n: '麺の種類（ちぢれ・ストレート・平打ち）', rank: 1, type: 'pick', opts: NOODLE_TYPES, hint: '好みのマッチングに使われます' },
  { k: 'kaedama', n: '替え玉', rank: 1, type: 'pick', opts: ['替え玉した', 'しなかった', '替え玉なし（つけ麺など）'] },
  { k: 'base', n: 'デフォルトの具材（最初から乗っているもの）', rank: 1, type: 'multi', opts: INGREDIENTS, g: 'ramen_items', hint: '丼の中身だけ。定食の具材・ご飯・チャーハン・餃子は入力できません' },
  { k: 'base_other', n: 'デフォルトの具材（その他・自由入力）', rank: 1, type: 'item', parent: 'base', g: 'ramen_items' },
  { k: 'sides', n: '付け合わせ（薬味・卓上の味付けなど）', rank: 1, type: 'multi', opts: SIDES, g: 'ramen_extras', hint: '薬味や卓上の味付けなど。ご飯・餃子は入力できません' },
  { k: 'sides_other', n: '付け合わせ（その他・自由入力）', rank: 1, type: 'item', parent: 'sides', g: 'ramen_extras' },
  { k: 'removed', n: '抜いてもらった具材（この一杯で抜いたもの）', rank: 1, type: 'multi', opts: ALL_ITEMS, g: 'ramen_extras', hint: '「ネギ抜き」「にんにく抜き」など。他の人の評価には出ません（自分の記録用）' },
  { k: 'removed_other', n: '抜いてもらった具材（その他・自由入力）', rank: 1, type: 'item', parent: 'removed', g: 'ramen_extras' },
  { k: 'disliked', n: '嫌いな具材（苦手なもの）', rank: 1, type: 'multi', opts: ALL_ITEMS, g: 'ramen_extras', hint: '苦手な具材。他の人の評価には出ません（自分の記録用）' },
  { k: 'disliked_other', n: '嫌いな具材（その他・自由入力）', rank: 1, type: 'item', parent: 'disliked', g: 'ramen_extras' },

  // ---- 二級（1,200pt〜）: スープの味・接客 ----
  { k: 'ts_sweet', n: 'スープ｜甘み', rank: 2, type: 'rating', g: 'taste_analysis' },
  { k: 'ts_salty', n: 'スープ｜塩気', rank: 2, type: 'rating', g: 'taste_analysis' },
  { k: 'ts_sour', n: 'スープ｜酸味', rank: 2, type: 'rating', g: 'taste_analysis' },
  { k: 'ts_bitter', n: 'スープ｜苦み・焦がし', rank: 2, type: 'rating', g: 'taste_analysis' },
  { k: 'ts_umami', n: 'スープ｜うま味', rank: 2, type: 'rating', g: 'taste_analysis' },
  { k: 'ts_hot', n: 'スープ｜辛さ', rank: 2, type: 'rating', g: 'taste_analysis' },
  { k: 'service', n: '接客', rank: 2, type: 'pick', opts: ['残念', 'いまいち', 'ふつう', '良い', 'とても良い'], g: 'service_info' },
  { k: 'speed', n: '提供までの時間', rank: 2, type: 'pick', opts: ['すぐ', '〜5分', '〜10分', '10分超'], g: 'service_info' },

  // ---- 一級（3,000pt〜）: 品質・設備・支払い ----
  { k: 'aroma', n: '品質｜香り（スープ・油）', rank: 3, type: 'pick', opts: GOOD3, g: 'quality_4' },
  { k: 'texture', n: '品質｜麺の食感', rank: 3, type: 'pick', opts: GOOD3, g: 'quality_4' },
  { k: 'temperature', n: '品質｜スープの温度', rank: 3, type: 'pick', opts: GOOD3, g: 'quality_4' },
  { k: 'presentation', n: '品質｜見た目', rank: 3, type: 'pick', opts: GOOD3, g: 'quality_4' },
  { k: 'crowd', n: '混み具合', rank: 3, type: 'pick', opts: ['空いている', 'ふつう', 'やや混み', '満席', '行列'], g: 'facility_info' },
  { k: 'pay', n: '支払い方法', rank: 3, type: 'multi', opts: ['現金', '交通系IC', 'クレジット', 'QR'], g: 'facility_info' },
  { k: 'smoke', n: '喫煙', rank: 3, type: 'pick', opts: ['禁煙', '喫煙可', '分煙'], g: 'facility_info' },
  { k: 'seats', n: '席の種類', rank: 3, type: 'multi', opts: ['カウンター', 'テーブル', '座敷', '個室'] },
  { k: 'facil', n: '設備・使いやすさ', rank: 3, type: 'multi', opts: ['バリアフリー', '子連れ向き', '一人向き', '多言語メニュー'] },

  // ---- 主任（8,000pt〜）: 計測・推し一杯 ----
  { k: 'noise', n: '騒音の測定値', rank: 4, type: 'pick', opts: ['〜40dB', '〜55dB', '〜70dB', '70dB超'], g: 'noise_measured', hint: 'スマホの騒音計などで測った値' },
  { k: 'pickdish', n: '推し一杯', rank: 4, type: 'pick', opts: ['この一杯が一押し'], g: 'chief_extra' },
  { k: 'tax', n: '価格の表記', rank: 4, type: 'pick', opts: ['税込', '税別'], g: 'chief_extra' },
  { k: 'tags', n: '来店の目的', rank: 4, type: 'multi', opts: ['疲れた', 'お祝い', '仕事', '一人', 'デート', '急ぎ'], g: 'chief_extra' },
];

/**
 * ポイントの表（サーバの submit_visit と同じ。画面の「+◯pt」も、ここから出す）。
 * 項目ごとではなく「組」ごとに付く。上の階級の組は、その階級になってから。
 */
export type PointRule = { kind: string; n: string; pt: number; rank: number; note?: string };
export const POINT_RULES: PointRule[] = [
  { kind: 'quick_report', n: '基本提出', pt: 10, rank: 0 },
  { kind: 'dish_card', n: '一杯カード（品名）', pt: 8, rank: 0, note: '1来店で最大5枚' },
  { kind: 'first_visit_bonus', n: '自分は未踏の店で投稿', pt: 30, rank: 0 },
  { kind: 'photo', n: '写真', pt: 5, rank: 0, note: '1枚ごと・最大3枚。Web版・アカウント登録時にサーバへ保存' },
  { kind: 'ramen_soup', n: 'スープの系統', pt: 5, rank: 0 },
  { kind: 'basic_record', n: '基本の記録（価格・量・感想）', pt: 8, rank: 0, note: '3つともそろえる。感想は5文字以上' },
  { kind: 'ramen_toppings', n: 'トッピング', pt: 3, rank: 0 },
  { kind: 'clean_5', n: '清掃5項目', pt: 15, rank: 1, note: '5つともそろえる' },
  { kind: 'environment', n: '環境（静かさ＋待ち時間）', pt: 10, rank: 1 },
  { kind: 'condition', n: '体調（入店前の空腹＋食後の満腹）', pt: 6, rank: 1 },
  { kind: 'visit_info', n: '来店の状況（人数＋気分）', pt: 3, rank: 1 },
  { kind: 'ramen_noodle', n: '濃さ・麺の太さ・麺の硬さ', pt: 8, rank: 1, note: '3つともそろえる' },
  { kind: 'ramen_items', n: 'デフォルトの具材', pt: 6, rank: 1 },
  { kind: 'ramen_extras', n: '付け合わせ・抜いた具材・嫌いな具材', pt: 3, rank: 1, note: 'どれか1つ' },
  { kind: 'taste_analysis', n: 'スープの味の分析', pt: 8, rank: 2, note: '6つのうち3つ以上' },
  { kind: 'service_info', n: '接客＋提供までの時間', pt: 5, rank: 2 },
  { kind: 'quality_4', n: '品質4項目', pt: 10, rank: 3, note: '香り・食感・温度・見た目' },
  { kind: 'facility_info', n: '混み具合＋支払い方法＋喫煙', pt: 6, rank: 3 },
  { kind: 'noise_measured', n: '騒音の測定', pt: 5, rank: 4 },
  { kind: 'chief_extra', n: '推し一杯・価格の表記・来店の目的', pt: 3, rank: 4, note: 'どれか1つ' },
];

export const ruleOf = (kind?: string) => (kind ? POINT_RULES.find((r) => r.kind === kind) : undefined);

type Ctx = { dish: string; vals: Record<string, string>; photos: number; firstVisit: boolean; rankIdx: number };
const has = (v: Record<string, string>, ...ks: string[]) => ks.every((k) => !!(v[k] ?? '').toString().trim());
const any = (v: Record<string, string>, ...ks: string[]) => ks.some((k) => !!(v[k] ?? '').toString().trim());

/** いまの入力で付くポイントの組（サーバの submit_visit と同じ条件）。写真は枚数分 */
export function evalRules(c: Ctx): { kind: string; n: string; pt: number }[] {
  const v = c.vals;
  const ok: Record<string, boolean> = {
    quick_report: true,
    dish_card: !!c.dish.trim(),
    first_visit_bonus: c.firstVisit,
    photo: c.photos > 0,
    ramen_soup: has(v, 'soup'),
    basic_record: has(v, 'price', 'amount') && (v.note ?? '').trim().length >= 5,
    ramen_toppings: any(v, 'toppings', 'tops_other'),
    clean_5: has(v, 'cl_entrance', 'cl_seating', 'cl_tableware', 'cl_restroom', 'cl_kitchen'),
    environment: has(v, 'quiet', 'wait'),
    condition: has(v, 'hunger', 'full'),
    visit_info: has(v, 'party', 'mood'),
    ramen_noodle: has(v, 'richness', 'thick', 'firm'),
    ramen_items: any(v, 'base', 'base_other'),
    ramen_extras: any(v, 'sides', 'sides_other', 'removed', 'removed_other', 'disliked', 'disliked_other'),
    taste_analysis: ['ts_sweet', 'ts_salty', 'ts_sour', 'ts_bitter', 'ts_umami', 'ts_hot'].filter((k) => v[k] !== undefined && v[k] !== '').length >= 3,
    service_info: has(v, 'service', 'speed'),
    quality_4: has(v, 'aroma', 'texture', 'temperature', 'presentation'),
    facility_info: has(v, 'crowd', 'pay', 'smoke'),
    noise_measured: has(v, 'noise'),
    chief_extra: any(v, 'pickdish', 'tags', 'tax'),
  };
  return POINT_RULES.filter((r) => r.rank <= c.rankIdx && ok[r.kind]).map((r) => ({ kind: r.kind, n: r.n, pt: r.kind === 'photo' ? r.pt * Math.min(3, c.photos) : r.kind === 'dish_card' ? r.pt : r.pt }));
}

/** 階級ごとの見出し（入力項目画面で使う） */
export const TIER_TITLES = [
  '基本の7項目（写真・価格・量・感想・スープ・おすすめ・トッピング）',
  '体調・状況・環境・清掃・濃さと麺・具材',
  'スープの味・接客',
  '品質・設備・支払い',
  '計測・推し一杯',
];

export const DEFAULT_PALETTE: Record<string, boolean> = { photo: true, price: true, amount: true, note: true, soup: true, rec: true, toppings: true };

export const RANKS = [
  { n: '見習い', at: 0, unlock: '基本の7項目（写真・価格・量・感想・スープの系統・おすすめ度・トッピング）。ルーレットは1日3回。評価を読めるのは、自分が投稿した店だけです。' },
  { n: '三級インスペクター', at: 300, unlock: '体調・人数と気分・静かさと待ち時間・清掃5項目・濃さと麺（太さ・硬さ・種類・替え玉）・デフォルトの具材・付け合わせ・抜いた具材・嫌いな具材が入力できます。ルーレット無制限。どの店でも、直近30日の他の調査官の評価が読めます。' },
  { n: '二級インスペクター', at: 1200, unlock: 'スープの味5評価・接客・提供時間が入力できます。全期間の平均値（満足度・価格・待ち時間・濃さ・味など）が読めます。' },
  { n: '一級インスペクター', at: 3000, unlock: '品質4項目・混み具合・支払い・喫煙・席・設備が入力できます。全期間・全件の評価が読めて、並べ替えもできます。' },
  { n: '主任インスペクター', at: 8000, unlock: '騒音の測定・推し一杯・価格の表記・来店の目的が入力できます。他の調査官の訂正履歴が読めます。' },
  { n: '特別監察官', at: 20000, unlock: '指摘の検証キューに参加できます（信頼度800以上）。' },
];


export const WEATHER_CODES: Record<number, string> = {
  0: '☀️ 晴れ', 1: '🌤️ 晴れ', 2: '⛅ くもり', 3: '☁️ くもり', 45: '🌫️ 霧', 48: '🌫️ 霧',
  51: '🌦️ 小雨', 53: '🌦️ 小雨', 55: '🌧️ 雨', 61: '🌧️ 雨', 63: '🌧️ 雨', 65: '🌧️ 大雨',
  71: '🌨️ 雪', 73: '🌨️ 雪', 75: '🌨️ 大雪', 80: '🌦️ にわか雨', 81: '🌧️ にわか雨', 82: '⛈️ 激しい雨', 95: '⛈️ 雷雨',
};
