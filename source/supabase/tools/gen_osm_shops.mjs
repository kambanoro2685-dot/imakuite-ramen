// Overpass の取得結果 (overpass.json) を、shop テーブルへの投入SQL (migrations/0006_osm_shops.sql) に変換する。
// 取得: node tools/fetch_overpass.mjs   変換: node tools/gen_osm_shops.mjs
// 出典: © OpenStreetMap contributors (ODbL)
import { readFileSync, writeFileSync } from 'node:fs';

const j = JSON.parse(readFileSync(new URL('./overpass.json', import.meta.url), 'utf8'));

// 店名から、ラーメンの系統を推定する（OSM には系統がないため）。上にあるものほど優先。分からなければ「その他」。
const STYLES = [
  ['家系', /家系|横浜家/],
  ['二郎系', /二郎|ジロリアン/],
  ['つけ麺', /つけ麺|つけめん|つけ蕎麦|つけそば/],
  ['まぜそば・油そば', /まぜそば|油そば|混ぜそば|汁なし/],
  ['担々麺', /担々|担担|坦々|タンタン/],
  ['鶏白湯', /鶏白湯|とりぱいたん|鶏そば|鶏ガラ/],
  ['煮干し・魚介', /煮干|にぼし|魚介|貝出汁/],
  ['豚骨', /豚骨|とんこつ|博多|長浜|久留米|ちゃんめん|天下一品|ラー麦/],
  ['味噌', /味噌|みそ|ミソ/],
  ['塩', /塩|しお/],
  ['醤油', /中華そば|醤油|しょうゆ|支那そば/],
];
const RAMEN_WORD = /ラーメン|らーめん|拉麺|ラァメン|中華そば|つけ麺|つけめん|担々麺|担担麺|まぜそば|油そば|家系|二郎|ramen/i;
const styleOf = (name) => (STYLES.find(([, re]) => re.test(name)) ?? ['その他'])[0];

const norm = (s) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const seen = [];
const rows = [];
let skipped = 0;
for (const e of j.elements) {
  const t = e.tags ?? {};
  const name = (t['name:ja'] ?? t.name ?? '').trim().slice(0, 80);
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (!name || lat == null || lng == null) continue;
  const cuisine = String(t.cuisine ?? '');
  // うどん・そば・韓国料理などだけの店（ラーメンの語も cuisine=ramen も無い）は除く
  if (!/ramen/.test(cuisine) && !RAMEN_WORD.test(name) && !/二郎|家系|麺屋|麺処|麺家/.test(name)) { skipped++; continue; }
  const nn = norm(name);
  // 同名・約50m以内は重複とみなして最初の1件だけ残す
  if (seen.some((s) => s.nn === nn && Math.abs(s.lat - lat) < 0.0005 && Math.abs(s.lng - lng) < 0.0005)) continue;
  seen.push({ nn, lat, lng });
  let url = (t.website ?? t['contact:website'] ?? '').trim();
  if (!/^https?:\/\//i.test(url)) url = '';
  rows.push(
    `  (${q(name)}, ${q(nn.slice(0, 80))}, ${lat.toFixed(6)}, ${lng.toFixed(6)}, ${q(styleOf(name))}, ${url && url.length <= 255 ? q(url) : 'null'}, 'osm', ${q(e.type + '/' + e.id)})`,
  );
}

const sql = `-- 実在のラーメン店（OpenStreetMap / Overpass API から取得）。岡山市中心部（岡山駅を中心に約8km四方）。
-- 取得日時(OSMデータ基準): ${j.osm3s?.timestamp_osm_base ?? '不明'}  件数: ${rows.length}（ラーメン以外の麺類店などは除外: ${skipped}件）
-- genre は、店名から推定したラーメンの系統（家系・つけ麺など）。分からない店は「その他」。
-- 出典: © OpenStreetMap contributors（ODbL）。アプリ内の地図にも必ず表示すること。
-- 注意: OSM の情報は古い場合がある（閉店済み・移転など）。投稿のたびに調査官が確認する運用。

insert into public.shop (name, name_norm, lat, lng, genre, url, source, osm_id) values
${rows.join(',\n')}
on conflict (osm_id) do nothing;

-- 試作用の架空サンプル店舗（0002）は無効にする（履歴は残る）
update public.shop set status = 'closed'
 where id in (
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004',
   '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006',
   '00000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000008');
`;
writeFileSync(new URL('../migrations/0006_osm_shops.sql', import.meta.url), sql);
const by = {}; rows.forEach((r) => { const g = /, '([^']+)', (?:'[^']*'|null), 'osm'/.exec(r)?.[1]; by[g] = (by[g] ?? 0) + 1; });
console.log('書き出し', rows.length, '件 / 除外', skipped, JSON.stringify(by));
