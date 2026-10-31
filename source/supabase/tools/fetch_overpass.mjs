// 岡山市中心部のラーメン店を Overpass API から取得して overpass.json に保存する。  node tools/fetch_overpass.mjs
// 対象: cuisine=ramen/noodle、または店名にラーメン系の語を含む飲食店（岡山駅を中心に約 8km 四方）。
// Overpass は User-Agent と Accept ヘッダが無いと 406 を返す。出典: © OpenStreetMap contributors (ODbL)
import { writeFileSync } from 'node:fs';
const BBOX = '34.60,133.85,34.72,134.00';
const NAME = 'ラーメン|らーめん|拉麺|ラァメン|中華そば|つけ麺|つけめん|担々麺|担担麺|まぜそば|油そば|家系|二郎|麺屋|麺処|麺家|ramen|Ramen';
const data = `[out:json][timeout:90];(
  nwr["amenity"~"^(restaurant|fast_food|food_court)$"]["cuisine"~"ramen|noodle"](${BBOX});
  nwr["amenity"~"^(restaurant|fast_food|food_court)$"]["name"~"${NAME}"](${BBOX});
);out center tags;`;
const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'User-Agent': 'imakuite-ramen/1.0 (https://github.com/kambanoro2685-dot)', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ data }),
});
if (!res.ok) throw new Error('Overpass ' + res.status + ' ' + (await res.text()).slice(0, 300));
const j = await res.json();
writeFileSync(new URL('./overpass.json', import.meta.url), JSON.stringify(j));
console.log('件数', j.elements.length, 'OSM基準', j.osm3s?.timestamp_osm_base);
