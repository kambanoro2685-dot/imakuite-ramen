/** ラーメンの系統（好みの登録・店の絞り込み・投稿の「スープの系統」で使う） */
export const GENRES = ['醤油', '味噌', '塩', '豚骨', '家系', '二郎系', 'つけ麺', 'まぜそば・油そば', '担々麺', '煮干し・魚介', '鶏白湯'];

/** こってり度（0=あっさり … 4=こってり）。好みの登録と、投稿の「濃さ」で使う */
export const RICHNESS = ['あっさり', 'やや軽め', 'ふつう', 'こってり', '超こってり'];
export const THICKNESS = ['細', '中', '太', '極太'];
export const FIRMNESS = ['固め', '普通', '柔らかめ'];

export type FieldDef = { k: string; n: string; pt: number; rank: number; hint?: string } & (
  | { type: 'photo' | 'price' | 'text' }
  | { type: 'range'; labels: string[] } // labels[1..5]
  | { type: 'pick'; opts: string[] }
  | { type: 'faces'; opts: [string, string][] }
  | { type: 'rating' } // 0〜5
  | { type: 'multi'; opts: string[] } // 複数選択（"," 区切りで保存）
);

const GOOD3 = ['良い', 'ふつう', '気になる'];

/** 階級ごとの入力項目。rank は解放される階級（0=見習い … 4=主任）。上の階級ほど詳しい調査ができる */
export const FIELDS: FieldDef[] = [
  // ---- 見習い（0pt〜）: 基本項目 ----
  { k: 'photo', n: '写真（最大3枚）', pt: 5, rank: 0, type: 'photo', hint: '1枚ごとに +5pt（最大 +15pt）' },
  { k: 'price', n: '価格', pt: 10, rank: 0, type: 'price' },
  { k: 'note', n: '食べた後の感想', pt: 10, rank: 0, type: 'text' },
  { k: 'amount', n: '量（麺・全体）', pt: 5, rank: 0, type: 'pick', opts: ['少なめ', 'ちょうど', '多め', '驚愕'] },
  { k: 'soup', n: 'スープの系統', pt: 5, rank: 0, type: 'pick', opts: [...GENRES, 'その他'], hint: '好みのマッチングに使われます' },
  { k: 'rec', n: 'おすすめ度', pt: 5, rank: 0, type: 'pick', opts: ['また行く', '気が向いたら', '行かない'] },
  { k: 'hunger', n: 'おなかの減り具合（入店前）', pt: 3, rank: 0, type: 'range', labels: ['', '平気', '少し空いた', 'そこそこ', 'かなり', '限界'] },
  { k: 'party', n: '何人で行ったか', pt: 3, rank: 0, type: 'pick', opts: ['1人', '2人', '3人', '4人', '5人以上'] },

  // ---- 三等（300pt〜）: 清掃・環境・体調 ----
  { k: 'cl_entrance', n: '清掃｜入口・外観', pt: 3, rank: 1, type: 'pick', opts: GOOD3 },
  { k: 'cl_seating', n: '清掃｜席まわり', pt: 3, rank: 1, type: 'pick', opts: GOOD3 },
  { k: 'cl_tableware', n: '清掃｜食器・箸', pt: 3, rank: 1, type: 'pick', opts: GOOD3 },
  { k: 'cl_restroom', n: '清掃｜お手洗い', pt: 3, rank: 1, type: 'pick', opts: GOOD3 },
  { k: 'cl_kitchen', n: '清掃｜厨房・カウンター', pt: 3, rank: 1, type: 'pick', opts: GOOD3, hint: '5項目そろえると +15pt' },
  { k: 'quiet', n: '静かさ', pt: 4, rank: 1, type: 'pick', opts: ['騒がしい', 'ふつう', '会話しやすい', '静か'] },
  { k: 'wait', n: '待ち時間', pt: 4, rank: 1, type: 'pick', opts: ['すぐ', '〜10分', '〜30分', '30分超'], hint: '静かさと合わせて +10pt' },
  { k: 'size', n: '店の規模', pt: 3, rank: 1, type: 'pick', opts: ['〜10席', '〜30席', '〜60席', '大型店'] },
  { k: 'mood', n: 'その時の気分', pt: 3, rank: 1, type: 'faces', opts: [['😪', '疲れ'], ['😌', '穏やか'], ['🙂', '普通'], ['😆', '上機嫌'], ['🔥', '絶好調']] },
  { k: 'richness', n: '濃さ（こってり度）', pt: 3, rank: 1, type: 'pick', opts: RICHNESS, hint: '濃さ・麺の太さ・硬さの3つで +8pt' },
  { k: 'thick', n: '麺の太さ', pt: 3, rank: 1, type: 'pick', opts: THICKNESS },
  { k: 'firm', n: '麺の硬さ', pt: 2, rank: 1, type: 'pick', opts: FIRMNESS },
  { k: 'kaedama', n: '替え玉', pt: 0, rank: 1, type: 'pick', opts: ['替え玉した', 'しなかった', '替え玉なし（つけ麺など）'] },
  { k: 'full', n: '食後の満腹度', pt: 3, rank: 1, type: 'range', labels: ['', 'まだ入る', 'ほどよい', '満足', 'お腹いっぱい', '食べすぎ'], hint: '入店前の空腹と合わせて +6pt' },

  // ---- 二等（1,200pt〜）: 味の分析・接客 ----
  { k: 'ts_sweet', n: 'スープ｜甘み', pt: 2, rank: 2, type: 'rating' },
  { k: 'ts_salty', n: 'スープ｜塩気', pt: 2, rank: 2, type: 'rating' },
  { k: 'ts_sour', n: 'スープ｜酸味', pt: 2, rank: 2, type: 'rating' },
  { k: 'ts_bitter', n: 'スープ｜苦み・焦がし', pt: 2, rank: 2, type: 'rating' },
  { k: 'ts_umami', n: 'スープ｜うま味', pt: 2, rank: 2, type: 'rating' },
  { k: 'ts_hot', n: 'スープ｜辛さ', pt: 2, rank: 2, type: 'rating', hint: '3つ以上そろえると +8pt' },
  { k: 'service', n: '接客', pt: 3, rank: 2, type: 'pick', opts: ['残念', 'いまいち', 'ふつう', '良い', 'とても良い'] },
  { k: 'speed', n: '提供までの時間', pt: 3, rank: 2, type: 'pick', opts: ['すぐ', '〜5分', '〜10分', '10分超'], hint: '接客と合わせて +5pt' },

  // ---- 一等（3,000pt〜）: 品質・設備・支払い ----
  { k: 'aroma', n: '品質｜香り（スープ・油）', pt: 3, rank: 3, type: 'pick', opts: GOOD3 },
  { k: 'texture', n: '品質｜麺の食感', pt: 3, rank: 3, type: 'pick', opts: GOOD3 },
  { k: 'temperature', n: '品質｜スープの温度', pt: 3, rank: 3, type: 'pick', opts: GOOD3 },
  { k: 'presentation', n: '品質｜見た目', pt: 3, rank: 3, type: 'pick', opts: GOOD3, hint: '4項目そろえると +10pt' },
  { k: 'toppings', n: 'トッピング', pt: 3, rank: 3, type: 'multi', opts: ['チャーシュー', '味玉', 'メンマ', 'ネギ', '海苔', 'もやし', 'ほうれん草', '背脂', 'にんにく', '辛味噌'], hint: '1つ以上選ぶと +3pt' },
  { k: 'crowd', n: '混み具合', pt: 2, rank: 3, type: 'pick', opts: ['空いている', 'ふつう', 'やや混み', '満席', '行列'] },
  { k: 'pay', n: '支払い方法', pt: 2, rank: 3, type: 'multi', opts: ['現金', '交通系IC', 'クレジット', 'QR'] },
  { k: 'smoke', n: '喫煙', pt: 2, rank: 3, type: 'pick', opts: ['禁煙', '喫煙可', '分煙'], hint: '混み具合・支払い・喫煙で +6pt' },
  { k: 'seats', n: '席の種類', pt: 2, rank: 3, type: 'multi', opts: ['カウンター', 'テーブル', '座敷', '個室'] },
  { k: 'facil', n: '設備・使いやすさ', pt: 2, rank: 3, type: 'multi', opts: ['バリアフリー', '子連れ向き', '一人向き', '多言語メニュー'] },

  // ---- 主任（8,000pt〜）: 計測・推し皿 ----
  { k: 'noise', n: '騒音の測定値', pt: 5, rank: 4, type: 'pick', opts: ['〜40dB', '〜55dB', '〜70dB', '70dB超'], hint: 'スマホの騒音計などで測った値。+5pt' },
  { k: 'tax', n: '価格の表記', pt: 2, rank: 4, type: 'pick', opts: ['税込', '税別'] },
  { k: 'pickdish', n: '推し一杯', pt: 3, rank: 4, type: 'pick', opts: ['この一杯が一押し'] },
  { k: 'tags', n: '来店の目的', pt: 2, rank: 4, type: 'multi', opts: ['疲れた', 'お祝い', '仕事', '一人', 'デート', '急ぎ'] },
];

/** 階級ごとの見出し（入力項目画面で使う） */
export const TIER_TITLES = [
  '基本項目・スープの系統',
  '清掃・環境・濃さと麺',
  'スープの味・接客',
  '品質・トッピング・設備',
  '計測・推し一杯',
];

export const DEFAULT_PALETTE: Record<string, boolean> = { soup: true, price: true, note: true, amount: true };

export const RANKS = [
  { n: '見習い', at: 0, unlock: '基本の入力項目（写真・価格・感想・スープの系統など8項目）。ルーレットは1日3回。評価できる範囲は自分が投稿した店だけです。' },
  { n: '三等インスペクター', at: 300, unlock: '入力項目「濃さ・麺の太さと硬さ・替え玉」「清掃5項目・静かさ・待ち時間・満腹度」など14項目が増えます。ルーレット無制限。どの店でも、直近30日の他の調査官の評価が読めます。' },
  { n: '二等インスペクター', at: 1200, unlock: '入力項目「スープの味5評価・接客・提供時間」の8項目が増えます。全期間の平均値（満足度・価格・待ち時間・濃さ・味など）が読めます。' },
  { n: '一等インスペクター', at: 3000, unlock: '入力項目「品質4項目・トッピング・混み具合・支払い・設備」の10項目が増えます。全期間・全件の評価が読めて、並べ替えもできます。' },
  { n: '主任インスペクター', at: 8000, unlock: '入力項目「騒音の測定・推し一杯・来店の目的」が増えます。他の調査官の訂正履歴が読めます。' },
  { n: '特別監察官', at: 20000, unlock: '指摘の検証キューに参加できます（信頼度800以上）。' },
];


export const WEATHER_CODES: Record<number, string> = {
  0: '☀️ 晴れ', 1: '🌤️ 晴れ', 2: '⛅ くもり', 3: '☁️ くもり', 45: '🌫️ 霧', 48: '🌫️ 霧',
  51: '🌦️ 小雨', 53: '🌦️ 小雨', 55: '🌧️ 雨', 61: '🌧️ 雨', 63: '🌧️ 雨', 65: '🌧️ 大雨',
  71: '🌨️ 雪', 73: '🌨️ 雪', 75: '🌨️ 大雪', 80: '🌦️ にわか雨', 81: '🌧️ にわか雨', 82: '⛈️ 激しい雨', 95: '⛈️ 雷雨',
};
