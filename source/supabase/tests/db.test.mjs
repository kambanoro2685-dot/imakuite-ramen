// マイグレーションを Postgres(PGlite) に流し、RLS・列権限・RPC を検証する。 npm test
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const read = (f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');
const db = new PGlite();

// ---- Supabase の最小スタブ（auth スキーマとロール）----
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
await db.exec(`
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, delete on storage.objects to authenticated;
`);
await db.exec(read('0001_init.sql'));
await db.exec(read('0002_seed_shops.sql'));
await db.exec(read('0003_bug_report.sql'));
await db.exec(read('0004_rank_gated_points.sql'));
await db.exec(read('0005_public_shop_search.sql'));
await db.exec(read('0007_photos.sql'));
await db.exec(read('0008_storage_visit_photos.sql'));
await db.exec(read('0009_shop_reviews.sql'));
await db.exec(read('0010_terms_acceptance.sql'));
await db.exec(read('0011_shop_rank_mix.sql'));
await db.exec(read('0012_oshi_ranking.sql'));
await db.exec(read('0013_ramen.sql'));
await db.exec(read('0014_noodle_type.sql'));
await db.exec(read('0015_toppings_top.sql'));
await db.exec(read('0016_shop_source.sql'));
await db.exec(read('0017_ramen_only_items.sql'));
await db.exec(read('0018_review_items.sql'));
await db.exec(read('0019_removed_disliked_items.sql'));

let failed = 0, passed = 0;
const ok = (c, name, extra = '') => { c ? passed++ : failed++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name}${c ? '' : '  ' + extra}`); };

/** ある利用者（uid）として SQL を実行。uid=null は未ログイン(anon) */
async function as(uid, fn) {
  await db.exec(uid ? `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);` : `set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const q = (sql, p = []) => db.query(sql, p);
const err = async (p) => { try { await p; return null; } catch (e) { return e.message ?? String(e); } };

async function newUser(codename) {
  const id = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [id]);
  const r = await as(id, () => q('select public.register_inspector($1) as r', [codename]));
  return { id, pid: r.rows[0].r.public_id };
}
const me = (u) => as(u.id, async () => (await q('select public.me() as m')).rows[0].m);

// ===== 登録 =====
const A = await newUser('調査官A');
ok(/^IKI-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(A.pid), '公開IDの形式');
const again = await as(A.id, () => q('select public.register_inspector($1) as r', ['別名']));
ok(again.rows[0].r.public_id === A.pid && again.rows[0].r.created === false, '再登録は既存IDを返す');
const B = await newUser('調査官B');
const dupName = await as((await (async () => { const id = randomUUID(); await db.query('insert into auth.users (id) values ($1)', [id]); return { id }; })()).id.toString(), async () => null);
const C0 = randomUUID(); await db.query('insert into auth.users (id) values ($1)', [C0]);
ok((await as(C0, () => err(q('select public.register_inspector($1)', ['調査官A'])))).includes('codename_taken'), 'コードネーム重複を拒否');
ok((await as(C0, () => err(q('select public.register_inspector($1)', ['<script>'])))).includes('invalid_codename'), '不正なコードネームを拒否');
ok((await as(null, () => err(q('select public.me()')))) !== null, '未ログイン(anon)は RPC を呼べない（実行権限なし）');
ok((await as(null, () => err(q('select * from public.shop')))) !== null, '未ログインは店舗を読めない');

// ===== RLS: 他人のデータ・直接書き込み =====
const m = await me(A);
ok(m.ikp === 0 && m.rank === 0 && m.trust_score === 500, 'me(): 初期状態');
ok((await as(A.id, () => q('select * from public.inspector'))).rows.length === 1, 'inspector は自分の行だけ見える');
ok((await as(A.id, () => err(q(`insert into public.point_ledger (inspector_id, amount, kind) values ('${A.id}', 9999, 'cheat')`)))) !== null, 'ポイント台帳へ直接書けない');
ok((await as(A.id, () => err(q(`update public.inspector set rank = 5, trust_score = 1000 where id = '${A.id}'`)))) !== null, '階級・信頼度を直接書き換えられない');
ok((await as(A.id, () => err(q(`insert into public.shop (name, name_norm, lat, lng) values ('x','x',0,0)`)))) !== null, '店舗を直接INSERTできない');

// プロフィール
ok(!(await as(A.id, () => err(q(`insert into public.inspector_profile (inspector_id, age_band, nationality, height_bucket_cm) values ('${A.id}', 30, 'JP', 170)`)))), 'プロフィールを保存');
ok((await as(A.id, () => err(q(`update public.inspector_profile set height_bucket_cm = 171 where inspector_id = '${A.id}'`)))) !== null, '身長の刻みを検証');
ok((await as(B.id, () => err(q(`insert into public.inspector_profile (inspector_id) values ('${A.id}')`)))) !== null, '他人のプロフィールは作れない');
ok((await as(A.id, () => err(q(`insert into public.body_log (measured_at, weight_bucket_kg) values ('2026-10-17', 65)`)))) === null, '体重ログを保存');
ok((await as(A.id, () => err(q(`insert into public.body_log (measured_at, weight_bucket_kg) values ('2026-10-17', 66)`)))) !== null, '体重の刻みを検証');

// ===== 店舗検索 =====
const SHOP = '00000000-0000-4000-8000-000000000001';
const search = await as(A.id, () => q('select * from public.search_shops(34.6667, 133.9188, 1500)'));
const dists = search.rows.map((r) => r.distance_m);
ok(search.rows.length === 8 && dists.every((x, i) => !i || dists[i - 1] <= x), '店舗検索（距離順）');
ok(search.rows.every((r) => r.review_count === null), '3件未満は review_count=null');
ok((await as(A.id, () => q(`select * from public.search_shops(34.6667, 133.9188, 1500, 'ｶﾚｰ')`))).rows.length === 1, '店名検索（半角カナ正規化）');
ok((await as(A.id, () => q(`select * from public.search_shops(34.6667, 133.9188, 1500, '%')`))).rows.length === 0, 'LIKE のワイルドカードを無害化');

// ===== 来店 → 提出 =====
const V = randomUUID(), D = randomUUID();
const ins = (sql, p) => err(q(sql, p));
ok(!(await as(A.id, () => ins(`insert into public.visit (id, shop_id, entered_at, weather, temp_c, pressure_hpa) values ($1, $2, now() - interval '40 minutes', 'wmo:0', 24.8, 1025.2)`, [V, SHOP]))), '来店を作成');
ok((await as(A.id, () => ins(`insert into public.visit (id, shop_id, entered_at, inspector_id) values ($1, $2, now(), $3)`, [randomUUID(), SHOP, B.id]))) !== null, '他人の名義で来店を作れない');
ok((await as(A.id, () => ins(`insert into public.visit (id, shop_id, entered_at, submitted_at) values ($1, $2, now(), now())`, [randomUUID(), SHOP]))) !== null, '提出済みとして直接作れない');
ok((await as(A.id, () => ins(`insert into public.visit (id, shop_id, entered_at) values ($1, $2, now())`, [V, SHOP]))) !== null, '同じ id の再INSERTは拒否（べき等）');
ok((await as(B.id, async () => (await q('select * from public.visit')).rows.length)) === 0, '他人の来店は見えない');
ok(!(await as(A.id, () => ins(`update public.visit set party_size = 2, hunger_before = 75, fullness_after = 90, mood = 'good', comment = 'うまい' where id = $1`, [V]))), '来店の追記（UPDATE）');
ok((await as(A.id, () => ins(`update public.visit set party_size = 99 where id = $1`, [V]))) !== null, '範囲外の値を拒否');
ok((await as(A.id, () => ins(`update public.visit set submitted_at = now() where id = $1`, [V]))) !== null, 'submitted_at を直接書けない');
ok(!(await as(A.id, () => ins(`insert into public.dish (id, visit_id, name, price_yen, volume) values ($1, $2, '味噌ラーメン', 850, 'just_right')`, [D, V]))), '皿カードを追加');
ok((await as(B.id, () => ins(`insert into public.dish (id, visit_id, name) values ($1, $2, 'x')`, [randomUUID(), V]))) !== null, '他人の来店に皿を足せない');
ok((await as(A.id, () => err(q('select public.submit_visit($1)', [V])))).includes('score_required'), '評価なしの提出を拒否');
ok(!(await as(A.id, () => ins(`insert into public.visit_score (visit_id, satisfaction, quietness, wait_min) values ($1, 80, 1, 5)`, [V]))), '評価を保存');

const sub = await as(A.id, async () => (await q('select public.submit_visit($1) as r', [V])).rows[0].r);
const kinds = sub.breakdown.map((x) => x.kind).sort().join(',');
ok(kinds === 'dish_card,first_visit_bonus,quick_report', '提出と加点内訳', kinds);
ok(sub.total === 48 && sub.ikp === 48, '見習いの加点合計 48pt（詳細項目は階級が足りず加点なし）');
const sub2 = await as(A.id, async () => (await q('select public.submit_visit($1) as r', [V])).rows[0].r);
ok(sub2.already_submitted === true && (await me(A)).ikp === 48, '再提出で二重加点されない');
ok((await as(A.id, () => ins(`update public.visit set party_size = 3 where id = $1`, [V]))) === null
   && (await q('select party_size from public.visit where id = $1', [V])).rows[0].party_size === 2, '提出後の UPDATE は0行（変更されない）');
ok((await as(A.id, () => ins(`insert into public.dish (id, visit_id, name) values ($1, $2, 'y')`, [randomUUID(), V]))) !== null, '提出後は皿を足せない');
ok((await as(B.id, () => err(q('select public.submit_visit($1)', [V])))).includes('not_found'), '他人の来店は提出できない');

// ===== 訂正 =====
const cor = await as(A.id, async () => (await q(`select public.correct_field('dish', $1, 'price_yen', '880', 'レシート確認') as r`, [D])).rows[0].r);
ok(cor.ok && cor.penalty === false && cor.bonus === 3, '訂正（72時間以内は減点なし +3pt）');
ok((await q('select price_yen from public.dish where id = $1', [D])).rows[0].price_yen === 880, '値が更新される');
const rev = await as(A.id, () => q('select field, old_value, new_value, reason from public.revision'));
ok(rev.rows.length === 1 && rev.rows[0].old_value === '850' && rev.rows[0].new_value === '880', '訂正履歴に旧値・新値が残る');
ok((await as(B.id, () => q('select * from public.revision'))).rows.length === 0, '他人の訂正履歴は見えない');
ok((await as(B.id, () => err(q(`select public.correct_field('dish', $1, 'price_yen', '1')`, [D])))).includes('not_found'), '他人の投稿は訂正できない');
ok((await as(A.id, () => err(q(`select public.correct_field('visit', $1, 'submitted_at', now()::text)`, [V])))).includes('invalid_field'), '訂正できない列を拒否');
ok((await as(A.id, () => err(q(`select public.correct_field('dish', $1, 'price_yen', '880')`, [D])))).includes('no_change'), '変更なしを拒否');
ok((await as(A.id, () => err(q(`select public.correct_field('dish', $1, 'price_yen', '-5')`, [D])))) !== null, '訂正でも範囲検証が効く');
ok((await as(A.id, () => err(q(`select public.correct_field('visit_score', $1, 'satisfaction', null)`, [V])))) !== null, '必須項目は空にできない');
await q(`update public.visit set submitted_at = now() - interval '100 hours' where id = $1`, [V]); // 時間経過を再現
const late = await as(A.id, async () => (await q(`select public.correct_field('dish', $1, 'name', '味噌ラーメン大盛') as r`, [D])).rows[0].r);
ok(late.penalty === true && late.bonus === 0, '72時間超の訂正は減点対象扱い・加点なし');

// ===== 再訪 / 新規店舗 =====
const V2 = randomUUID();
await as(A.id, () => q(`insert into public.visit (id, shop_id, entered_at) values ($1, $2, now())`, [V2, SHOP]));
await as(A.id, () => q(`insert into public.visit_score (visit_id, satisfaction) values ($1, 60)`, [V2]));
const sub3 = await as(A.id, async () => (await q('select public.submit_visit($1) as r', [V2])).rows[0].r);
ok(!sub3.breakdown.some((x) => x.kind === 'first_visit_bonus'), '再訪には初訪問ボーナスが付かない');
ok((await me(A)).ikp === 48 + 3 + 10, 'ポイント残高', String((await me(A)).ikp));

const ns = await as(A.id, async () => (await q(`select public.create_shop('テスト食堂', 34.67, 133.92, '定食') as r`)).rows[0].r);
ok(ns.bonus.amount === 100, '新規店舗登録 +100');
ok((await as(A.id, () => err(q(`select public.create_shop('テスト　食堂', 34.67, 133.92)`)))).includes('duplicate_shop'), '同名近接（全角空白違い）の重複を拒否');
ok((await as(null, () => err(q(`select public.create_shop('x', 1, 1)`)))) !== null, '未ログインは店舗登録できない');

// ===== 集計 =====
const live = await as(null, async () => (await q('select public.stats_live() as r')).rows[0].r);
ok(live.active_inspectors_today >= 1, '集計（stats_live）は未ログインでも見える', JSON.stringify(live));
const st = await as(A.id, async () => (await q('select public.shop_stats($1) as r', [SHOP])).rows[0].r);
ok(st.review_count === null && st.avg_satisfaction === null, '店舗統計は3件未満なら null');
for (const u of [B, C0 && { id: C0 }]) { /* 3件に到達させる */ }
// 3人目までの提出を作って集計が開くことを確認
for (let i = 0; i < 3; i++) {
  const u = await newUser(`集計用${i}`);
  const v = randomUUID();
  await as(u.id, () => q(`insert into public.visit (id, shop_id, entered_at) values ($1, $2, now())`, [v, SHOP]));
  await as(u.id, () => q(`insert into public.visit_score (visit_id, satisfaction) values ($1, 70)`, [v]));
  await as(u.id, () => q('select public.submit_visit($1)', [v]));
}
const st2 = await as(A.id, async () => (await q('select public.shop_stats($1) as r', [SHOP])).rows[0].r);
ok(st2.review_count >= 3 && st2.avg_satisfaction !== null, '3件以上で集計が開く', JSON.stringify(st2));
const s2 = await as(A.id, () => q('select * from public.search_shops(34.6667, 133.9188, 300)'));
ok(s2.rows.find((r) => r.id === SHOP)?.review_count >= 3, '検索結果にも件数が出る');
const rc = s2.rows.find((r) => r.id === SHOP)?.rank_counts;
ok(Array.isArray(rc) && rc.length === 6 && rc.reduce((a, b) => a + b, 0) === s2.rows.find((r) => r.id === SHOP).review_count, '検索結果に階級ごとの件数が出る', JSON.stringify(rc));

// ===== 階級ごとの詳細項目と加点 =====
const R = await newUser('階級試験');
const detail = async (shopNo) => {
  const v = randomUUID(), d = randomUUID();
  const shop = '00000000-0000-4000-8000-00000000000' + shopNo;
  await as(R.id, () => q('insert into public.visit (id, shop_id, entered_at, hunger_before, fullness_after) values ($1, $2, now(), 50, 75)', [v, shop]));
  await as(R.id, () => q('insert into public.dish (id, visit_id, name, taste_sweet, taste_salty, taste_umami) values ($1, $2, $3, 1, 3, 5)', [d, v, '試験皿']));
  await as(R.id, () => q(`insert into public.visit_score (visit_id, satisfaction, clean_entrance, clean_seating, clean_tableware, clean_restroom, clean_kitchen,
      quietness, wait_min, service, serve_speed_min, aroma, texture, temperature, presentation, crowdedness, payment_methods, smoking, noise_db)
      values ($1, 80, 0,1,0,1,0, 1, 5, 3, 5, 0,0,1,1, 2, 'cash,ic', 'no', 55)`, [v]));
  const r = await as(R.id, async () => (await q('select public.submit_visit($1) as r', [v])).rows[0].r);
  return r.breakdown.map((x) => x.kind).sort().join(',');
};
const k0 = await detail(1);
ok(k0 === 'dish_card,first_visit_bonus,quick_report', '見習い: 詳細項目を書いても加点されない', k0);
await q('update public.inspector set rank = 1 where id = $1', [R.id]);
const k1 = await detail(2);
ok(k1 === 'clean_5,condition,dish_card,environment,first_visit_bonus,quick_report', '三等: 清掃・環境・体調が加点される', k1);
await q('update public.inspector set rank = 2 where id = $1', [R.id]);
const k2 = await detail(3);
ok(k2.includes('taste_analysis') && k2.includes('service_info') && !k2.includes('quality_4'), '二等: 味の分析・接客が加点され、品質はまだ', k2);
await q('update public.inspector set rank = 3 where id = $1', [R.id]);
const k3 = await detail(4);
ok(k3.includes('quality_4') && k3.includes('facility_info') && !k3.includes('noise_measured'), '一等: 品質・設備が加点され、騒音はまだ', k3);
await q('update public.inspector set rank = 4 where id = $1', [R.id]);
const k4 = await detail(5);
ok(k4.includes('noise_measured'), '主任: 騒音の測定が加点される', k4);

// ===== 店舗検索の公開 =====
const pub = await as(null, () => q('select * from public.search_shops(34.6667, 133.9188, 1500)'));
ok(pub.rows.length >= 8, '未ログインでも店舗検索ができる');
ok(pub.rows.every((r) => r.review_count === null ? r.rank_counts === null : true), '3件未満の店は階級の内訳を出さない');
ok((await as(null, () => q('select * from public.search_shops(34.6667, 133.9188, 1500, null, null, 3)'))).rows.length === 3, '件数の上限(p_limit)が効く');
ok((await as(null, () => q('select * from public.search_shops(34.6667, 133.9188, 1500, null, $1)', ['ラーメン']))).rows.length === 1, 'ジャンルで絞り込める');
ok((await as(null, () => err(q('select * from public.shop')))) !== null, '店舗テーブルの直接参照は引き続き不可');
await q("insert into public.shop (name, name_norm, lat, lng, genre, source, osm_id) values ('重複試験', '重複試験', 34.6, 133.9, 'その他', 'osm', 'node/1')");
ok((await err(q("insert into public.shop (name, name_norm, lat, lng, genre, source, osm_id) values ('重複試験', '重複試験', 34.6, 133.9, 'その他', 'osm', 'node/1')"))) !== null, 'osm_id の重複は入らない');

// ===== 写真 =====
const P = await newUser('写真試験');
const pv = randomUUID();
await as(P.id, () => q('insert into public.visit (id, shop_id, entered_at) values ($1, $2, now())', [pv, '00000000-0000-4000-8000-000000000001']));
const url = (n) => `https://abcdefgh.supabase.co/storage/v1/object/public/visit-photos/${P.id}/${n}.webp`;
const addPhoto = (n, u) => as(P.id, () => err(q('insert into public.photo (id, visit_id, storage_url) values ($1, $2, $3)', [randomUUID(), pv, u ?? url(n)])));
ok((await addPhoto(1, 'https://evil.example/x.png')) !== null, '写真のURLは保存先バケット以外を拒否');
const e1 = await addPhoto(1); const e2 = await addPhoto(2); const e3 = await addPhoto(3);
ok(e1 === null && e2 === null && e3 === null, '写真を3枚まで追加できる', [e1, e2, e3].join(' | '));
ok((await addPhoto(4)) !== null, '4枚目は拒否');
await as(P.id, () => q("insert into public.visit_score (visit_id, satisfaction) values ($1, 70)", [pv]));
const ps = await as(P.id, async () => (await q('select public.submit_visit($1) as r', [pv])).rows[0].r);
ok(ps.breakdown.find((x) => x.kind === 'photo')?.amount === 15, '写真は1枚ごとに +5（3枚で +15）', JSON.stringify(ps.breakdown));
ok((await as(P.id, () => err(q('insert into public.photo (id, visit_id, storage_url) values ($1, $2, $3)', [randomUUID(), pv, url(9)])))) !== null, '提出後は写真を足せない');

// Storage: 自分のフォルダにだけ書ける
const putObj = (uid, name) => as(uid, () => err(q("insert into storage.objects (bucket_id, name) values ('visit-photos', $1)", [name])));
ok((await putObj(P.id, `${P.id}/a.webp`)) === null, '自分のフォルダには保存できる');
ok((await putObj(P.id, `${A.id}/a.webp`)) !== null, '他人のフォルダには保存できない');
ok((await putObj(P.id, 'root.webp')) !== null, 'フォルダ外には保存できない');
ok((await as(null, () => err(q("insert into storage.objects (bucket_id, name) values ('visit-photos', 'x/y.webp')")))) !== null, '未ログインは保存できない');
ok((await as(A.id, () => q("select * from storage.objects"))).rows.length === 0, '他人の画像一覧は見えない');
ok((await q("select public, file_size_limit from storage.buckets where id = 'visit-photos'")).rows[0].file_size_limit === 1048576, 'バケットは1MB上限');

// アカウント削除で写真の記録も消える
await as(P.id, () => q('select public.delete_account()'));
ok((await q('select count(*)::int as n from public.photo where visit_id = $1', [pv])).rows[0].n === 0, '削除: 写真の記録も消える');

// ===== 評価一覧（階級・自分の入力による黒塗り）=====
const SH = randomUUID(); // 他のテストと混ざらないよう、評価一覧専用の店を作る
await q("insert into public.shop (id, name, name_norm, lat, lng, genre, source) values ($1, '評価一覧試験店', '評価一覧試験店', 34.7, 133.9, 'その他', 'osm')", [SH]);
const reviewers = [];
for (let i = 0; i < 4; i++) reviewers.push(await newUser('評価者' + i));
const addReview = async (u, { days = 1, sat = 70, price = 900, comment = '感想', rank = 0 }) => {
  const v = randomUUID();
  await q('update public.inspector set rank = $2 where id = $1', [u.id, rank]);
  await q(`insert into public.visit (id, inspector_id, shop_id, entered_at, submitted_at, comment, party_size, mood)
           values ($1, $2, $3, now() - ($4 || ' days')::interval, now() - ($4 || ' days')::interval, $5, 2, 'good')`, [v, u.id, SH, String(days), comment]);
  await q(`insert into public.visit_score (visit_id, satisfaction, clean_entrance, clean_seating, clean_tableware, clean_restroom, clean_kitchen, quietness, wait_min)
           values ($1, $2, 0, 1, 0, 1, 0, 2, 10)`, [v, sat]);
  await q(`insert into public.dish (id, visit_id, name, price_yen, volume, taste_sweet, taste_salty, taste_umami) values ($1, $2, '一押し', $3, 'just_right', 1, 4, 5)`, [randomUUID(), v, price]);
  return v;
};
const r1 = await addReview(reviewers[0], { days: 2, sat: 90, price: 1100, rank: 2 });
const r2 = await addReview(reviewers[1], { days: 10, sat: 40, price: 700 });
const r3 = await addReview(reviewers[2], { days: 20, sat: 60, price: 900 });
const r4 = await addReview(reviewers[3], { days: 60, sat: 80, price: 800 });
await q("insert into public.revision (target_table, target_id, field, old_value, new_value, changed_by) values ('visit_score', $1, 'satisfaction', '70', '90', $2)", [r1, reviewers[0].id]);

const VW = await newUser('閲覧者');
const reviews = (sort = 'new') => as(VW.id, async () => (await q('select public.shop_reviews($1, $2, 50) as r', [SH, sort])).rows[0].r);
const setRank = (n) => q('update public.inspector set rank = $2 where id = $1', [VW.id, n]);

// 見習い・その店に行ったことがない → 読めない
let rv = await reviews();
ok(rv.scope === 'locked' && rv.items.length === 0 && rv.total === 4, '見習い: 行っていない店の評価は読めない（件数だけ）', JSON.stringify(rv).slice(0, 120));

// その店に自分も投稿（価格とコメントだけ入力）
const myv = randomUUID();
await q("insert into public.visit (id, inspector_id, shop_id, entered_at, submitted_at, comment) values ($1, $2, $3, now(), now(), '自分の感想')", [myv, VW.id, SH]);
await q("insert into public.visit_score (visit_id, satisfaction) values ($1, 75)", [myv]);
await q("insert into public.dish (id, visit_id, name, price_yen) values ($1, $2, '自分の皿', 950)", [randomUUID(), myv]);

rv = await reviews();
const it = rv.items[0];
ok(rv.scope === 'own_shop' && rv.items.length === 4, '見習い: 自分が行った店は読める', JSON.stringify(rv).slice(0, 100));
ok(it.price.masked !== true && it.note.masked !== true, '見習い: 自分が入力した項目（価格・感想）は見える');
ok(it.volume.masked && it.volume.reason === 'input', '見習い: 自分が入力していない項目は黒塗り（reason=input）');
ok(it.clean.masked && it.clean.reason === 'rank' && it.clean.need_rank === 1, '見習い: 階級が足りない項目は黒塗り（reason=rank, need_rank=1）');
ok(it.taste.masked && it.taste.need_rank === 2 && it.noise.need_rank === 4, '見習い: 味は二等、騒音は主任から');
ok(it.photos.masked === true, '見習い: 写真は三等から');
ok(!JSON.stringify(rv).includes('評価者') && !JSON.stringify(rv).includes(reviewers[0].id) && !JSON.stringify(rv).includes(reviewers[0].pid), '他人の名前・IDは返らない');
ok(!rv.items.some((x) => x.dish === '自分の皿'), '自分の来店は「他の調査官」に含まれない');
ok(Object.keys(rv.summary).length === 0 || rv.summary.satisfaction?.masked, '見習い: 平均値は見えない');

// 三等: 直近30日だけ（60日前は除外）
await setRank(1);
rv = await reviews();
ok(rv.scope === '30days' && rv.items.length === 3 && rv.total === 4, '三等: 直近30日の3件だけ見える（全4件）', JSON.stringify([rv.scope, rv.items.length]));
ok(rv.items[0].clean.masked && rv.items[0].clean.reason === 'input', '三等: 階級は足りていても、未入力の項目（清掃）は黒塗り');
ok(rv.items[0].photos.masked !== true, '三等: 写真が見える');
await q("insert into public.visit_score (visit_id, satisfaction, clean_entrance) select id, 50, 0 from public.visit where inspector_id = $1 and id <> $2 and false", [VW.id, myv]);
await q("update public.visit_score set clean_entrance = 0, quietness = 1 where visit_id = $1", [myv]);
rv = await reviews();
ok(rv.items[0].clean.masked !== true && rv.items[0].quiet.masked !== true, '三等: 清掃・静かさを入力したら見える');
ok(rv.sort === 'new', '三等: 並べ替えはできない（常に新しい順）');
ok(rv.items[0].taste.masked && rv.items[0].taste.reason === 'rank', '三等: 味は二等から');

// 二等: 平均値
await setRank(2);
rv = await reviews();
ok(rv.summary.satisfaction.avg !== undefined && rv.summary.n === 4, '二等: 全期間の平均満足度が見える', JSON.stringify(rv.summary.satisfaction));
ok(rv.summary.taste.masked && rv.summary.taste.reason === 'input', '二等: 味の平均は、自分が味を入力するまで黒塗り');
ok(rv.items.length === 3, '二等: 個別の評価は直近30日');

// 一等: 全期間・並べ替え
await setRank(3);
rv = await reviews('high');
ok(rv.scope === 'all' && rv.items.length === 4, '一等: 全期間の4件が見える');
ok(rv.items.map((x) => x.satisfaction).join(',') === '90,80,60,40', '一等: 満足度の高い順に並べ替えできる', rv.items.map((x) => x.satisfaction).join(','));
rv = await reviews('cheap');
ok(rv.items[0].price.price_yen === 700, '一等: 安い順に並べ替えできる');
ok(rv.items[0].corrections.masked && rv.items[0].corrections.need_rank === 4, '一等: 訂正履歴は主任から');

// 主任: 訂正履歴
await setRank(4);
rv = await reviews('high');
ok(rv.items.some((x) => Array.isArray(x.corrections) && x.corrections.length === 1 && x.corrections[0].field === 'satisfaction'), '主任: 訂正履歴が見える');
ok(rv.items.every((x) => x.reviewer.rank_name && x.reviewer.trust !== undefined), '評価者は階級と信頼スコアだけ表示');

// 権限
ok((await as(null, () => err(q('select public.shop_reviews($1)', [SH])))) !== null, '未ログインは評価一覧を呼べない');

// ===== 利用規約の同意 =====
const TU = await newUser('規約試験');
const accept = (u, v) => as(u.id, () => q('select public.accept_terms($1) as r', [v]));
ok((await me(TU)).terms_version === null, '最初は同意の記録がない');
ok((await accept(TU, '2026-10-18')).rows[0].r.ok === true, '規約に同意できる');
ok((await me(TU)).terms_version === '2026-10-18', 'me() が同意した版を返す');
await accept(TU, '2026-10-18');
ok((await q('select count(*)::int as n from public.terms_acceptance where inspector_id = $1', [TU.id])).rows[0].n === 1, '同じ版への再同意は重複しない');
await new Promise((r) => setTimeout(r, 15));
await accept(TU, '2027-01-01');
ok((await me(TU)).terms_version === '2027-01-01', '新しい版に同意すると、最新の版が返る');
ok((await as(TU.id, () => err(q('select public.accept_terms($1)', ['<script>'])))).includes('invalid_version'), '不正な版の文字列を拒否');
ok((await as(null, () => err(q("select public.accept_terms('x')")))) !== null, '未ログインは同意を記録できない');
ok((await as(TU.id, () => err(q('select * from public.terms_acceptance')))) !== null, '同意の記録は直接読めない');
ok((await as(TU.id, () => err(q("insert into public.terms_acceptance (inspector_id, version) values ($1, 'x')", [TU.id])))) !== null, '直接INSERTできない');
const anonUser = randomUUID(); await q('insert into auth.users (id) values ($1)', [anonUser]);
ok((await as(anonUser, () => err(q("select public.accept_terms('2026-10-18')")))).includes('not_registered'), '調査官として未登録だと記録できない');
await as(TU.id, () => q('select public.delete_account()'));
ok((await q('select count(*)::int as n from public.terms_acceptance where inspector_id = $1', [TU.id])).rows[0].n === 0, '削除: 同意の記録も消える');

// ===== 不具合報告 =====
const rep = (u, cat, msg) => as(u, () => q('select public.submit_bug_report($1, $2, $3, $4, $5) as r', [cat, msg, 'home', 'test-build', 'UA/1.0']));
ok((await rep(null, 'bug', '押しても反応しません')).rows[0].r.ok === true, '未ログインでも不具合を報告できる');
ok((await rep(A.id, 'request', 'ダークモードが欲しい')).rows[0].r.ok === true, 'ログイン中も報告できる');
const reps = await q('select inspector_id, category, screen, build from public.bug_report order by id');
ok(reps.rows[0].inspector_id === null && reps.rows[1].inspector_id === A.id, 'ログイン中だけ調査官IDが紐づく');
ok((await as(A.id, () => err(q('select * from public.bug_report')))) !== null, '報告は直接読めない（運営だけ）');
ok((await as(null, () => err(q("insert into public.bug_report (category, message) values ('bug','x')")))) !== null, '直接INSERTできない');
ok((await rep(A.id, 'xxx', 'a').then(() => null, (e) => e.message)).includes('invalid_category'), '不正な種別を拒否');
ok((await rep(A.id, 'bug', '   ').then(() => null, (e) => e.message)).includes('invalid_message'), '空の本文を拒否');
ok((await rep(A.id, 'bug', 'あ'.repeat(2001)).then(() => null, (e) => e.message)).includes('invalid_message'), '長すぎる本文を拒否');
for (let i = 0; i < 9; i++) await rep(A.id, 'bug', 'n' + i);
ok((await rep(A.id, 'bug', '11件目').then(() => null, (e) => e.message)).includes('rate_limited'), 'ログイン中は1日10件まで');

// ===== ラーメン専用の項目 =====
const RS = (await as(A.id, async () => (await q(`select public.create_shop('試験ラーメン店', 34.671, 133.921, '豚骨') as r`)).rows[0].r)).id;
const ramenVisit = async (u, dish) => {
  const v = randomUUID();
  await as(u.id, () => q('insert into public.visit (id, shop_id, entered_at) values ($1, $2, now())', [v, RS]));
  await as(u.id, () => q('insert into public.dish (id, visit_id, name, soup, richness, noodle_thick, noodle_firm, toppings, kaedama) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [randomUUID(), v, '豚骨ラーメン', dish.soup, dish.rich, dish.thick, dish.firm, dish.top ?? null, dish.kae ?? null]));
  await as(u.id, () => q('insert into public.visit_score (visit_id, satisfaction) values ($1, 80)', [v]));
  return (await as(u.id, () => q('select public.submit_visit($1) as r', [v]))).rows[0].r;
};
const R0 = await newUser('麺見習い'), R1 = await newUser('麺三等'), R2 = await newUser('麺三等二');
await q("update public.inspector set rank = 1 where id in ($1, $2)", [R1.id, R2.id]);
const b0 = await ramenVisit(R0, { soup: '豚骨', rich: 4, thick: '細', firm: '固め' });
ok(b0.breakdown.some((x) => x.kind === 'ramen_soup'), 'ラーメン: スープで +5pt');
ok(!b0.breakdown.some((x) => x.kind === 'ramen_noodle'), 'ラーメン: 見習いは麺の項目で加点されない（階級で解放）');
const b1 = await ramenVisit(R1, { soup: '豚骨', rich: 3, thick: '細', firm: '固め', kae: true });
ok(b1.breakdown.some((x) => x.kind === 'ramen_noodle'), 'ラーメン: 三等は濃さ・麺で +8pt');
await ramenVisit(R2, { soup: '醤油', rich: 4, thick: '中', firm: '普通', top: '味玉,チャーシュー' });
const sr = (await as(A.id, () => q('select * from public.search_shops(34.671, 133.921, 300)'))).rows.find((r) => r.id === RS);
ok(sr.soup_top === '豚骨' && sr.thick_top === '細' && Number(sr.richness_avg) === 3.7, '検索: 3件以上でスープ・濃さ・麺の太さが集計される', JSON.stringify(sr));
const sr0 = (await as(A.id, () => q('select * from public.search_shops(34.6667, 133.9188, 1500)'))).rows.find((r) => r.review_count === null);
ok(sr0 && sr0.soup_top === null && sr0.richness_avg === null, '検索: 3件未満は集計を出さない');
ok((await err(q("insert into public.dish (id, visit_id, name, noodle_thick) values ($1, (select id from public.visit limit 1), 'x', '極細')", [randomUUID()]))) !== null, '麺の太さは決まった値だけ');
// 他の調査官のラーメン項目の黒塗り
const RV = await newUser('麺閲覧');
const rr = await as(RV.id, async () => (await q('select public.shop_reviews($1) as r', [RS])).rows[0].r);
ok(rr.scope === 'locked', 'ラーメン: 見習いは自分が行っていない店のレビューを読めない');
await ramenVisit(RV, { soup: '味噌', rich: 2, thick: '太', firm: '普通' });
await q('update public.inspector set rank = 1 where id = $1', [RV.id]);
const rr2 = await as(RV.id, async () => (await q('select public.shop_reviews($1) as r', [RS])).rows[0].r);
const it0 = rr2.items[0];
ok(it0.soup.soup && it0.noodle.richness !== undefined && it0.items.masked === true && it0.items.reason === 'input', 'ラーメン: 具材・トッピングは、自分が入力していないと黒塗り', JSON.stringify(it0.items));
ok(rr2.summary?.richness && rr2.summary.richness.masked === undefined, 'ラーメン: 濃さの平均が出る（三等・入力済み）', JSON.stringify(rr2.summary));

// ===== 麺の種類 =====
{
  const s = await as(A.id, () => q('select * from public.search_shops(34.671, 133.921, 300)'));
  const row = s.rows.find((r) => r.id === RS);
  ok(row.type_top === null, '麺の種類: 口コミに無いうちは null');
  for (const u of [R0, R1, R2]) {
    const v = (await q("select v.id from public.visit v where v.inspector_id = $1 and v.shop_id = $2", [u.id, RS])).rows[0].id;
    await q("update public.dish set noodle_type = 'ちぢれ' where visit_id = $1", [v]);
  }
  const s2 = await as(A.id, () => q('select * from public.search_shops(34.671, 133.921, 300)'));
  ok(s2.rows.find((r) => r.id === RS).type_top === 'ちぢれ', '麺の種類: 3件以上でいちばん多い種類が出る');
  ok((await err(q("update public.dish set noodle_type = 'ぐにゃぐにゃ' where id = (select id from public.dish limit 1)"))) !== null, '麺の種類は決まった値だけ');
}

// ===== トッピングの集計 =====
{
  const s0 = await as(A.id, () => q('select * from public.search_shops(34.671, 133.921, 300)'));
  ok(s0.rows.find((r) => r.id === RS).toppings_top === null || Array.isArray(s0.rows.find((r) => r.id === RS).toppings_top), 'トッピング: 列が返る');
  const vs = (await q('select v.id, v.inspector_id from public.visit v where v.shop_id = $1 order by v.submitted_at', [RS])).rows;
  const tops = ['味玉,チャーシュー', '味玉,メンマ', '味玉,ネギ,チャーシュー'];
  for (let k = 0; k < 3; k++) await q('update public.dish set toppings = $1 where visit_id = $2', [tops[k], vs[k].id]);
  const s1 = await as(A.id, () => q('select * from public.search_shops(34.671, 133.921, 300)'));
  const row = s1.rows.find((r) => r.id === RS);
  ok(Array.isArray(row.toppings_top) && row.toppings_top[0] === '味玉' && row.toppings_top[1] === 'チャーシュー' && row.toppings_top.length <= 3, 'トッピング: 3件以上で、多い順に上位3つが出る', JSON.stringify(row.toppings_top));
  const sNone = (await as(A.id, () => q('select * from public.search_shops(34.6667, 133.9188, 1500)'))).rows.find((r) => r.review_count === null);
  ok(sNone.toppings_top === null, 'トッピング: 3件未満は出さない');
}

// ===== 店の出どころ =====
{
  const s = await as(A.id, () => q('select id, source from public.search_shops(34.671, 133.921, 300)'));
  ok(s.rows.find((r) => r.id === RS)?.source === 'inspector', '店の出どころ: 調査官が追加した店は inspector');
  const all = await as(A.id, () => q('select id, source from public.search_shops(34.6667, 133.9188, 1500)'));
  ok(all.rows.some((r) => r.source === 'osm'), '店の出どころ: 取り込んだ店は osm');
}

// ===== ラーメン以外の品目は入力できない =====
{
  const u = await newUser('具材試験');
  const mk = async (cols, name = '醤油ラーメン') => {
    const v = randomUUID();
    await as(u.id, () => q('insert into public.visit (id, shop_id, entered_at) values ($1, $2, now())', [v, RS]));
    const keys = Object.keys(cols);
    const sql = 'insert into public.dish (id, visit_id, name' + keys.map((k) => ', ' + k).join('') + ') values ($1, $2, $3' + keys.map((_, i) => ', $' + (i + 4)).join('') + ')';
    return as(u.id, () => err(q(sql, [randomUUID(), v, name, ...keys.map((k) => cols[k])])));
  };
  ok((await mk({ base_items: 'チャーシュー,メンマ,ネギ', toppings: '味玉', sides: '高菜,紅しょうが' })) === null, '具材・トッピング・付け合わせを保存できる');
  ok((await mk({ base_items: '定食のコロッケ' })) !== null, '定食の具材は保存できない');
  ok((await mk({ sides: '半ライス' })) !== null, 'ご飯（ライス）は付け合わせに保存できない');
  ok((await mk({ toppings: 'チャーハン' })) !== null, 'チャーハンはトッピングに保存できない');
  ok((await mk({ sides: 'ギョーザ' })) !== null, '餃子（ギョーザ）は保存できない');
  ok((await mk({ sides: 'ごはん' })) !== null, 'ごはんは保存できない');
  ok((await mk({ toppings: '味玉' }, '餃子定食')) !== null, '品名にも定食・餃子は入れられない');
}

// ===== 評価一覧: 具材・トッピング・付け合わせ =====
{
  const VB = await newUser('具材閲覧');
  await ramenVisit(VB, { soup: '醤油', rich: 2, thick: '中', firm: '普通', top: '味玉' }); // 自分も入力した → 見える
  const rv = await as(VB.id, async () => (await q('select public.shop_reviews($1) as r', [RS])).rows[0].r);
  const withTops = rv.items.find((x) => x.items && !x.items.masked && x.items.toppings);
  ok(!!withTops && /味玉/.test(withTops.items.toppings), '評価一覧: 自分も入力していれば、他の人の具材・トッピングが見える', JSON.stringify(rv.items.map((x) => x.items)));
  ok(rv.items.every((x) => 'items' in x && 'noodle' in x && !('toppings' in x)), '評価一覧: items グループになった（旧 toppings は無い）');
  ok(rv.items.some((x) => x.noodle && !x.noodle.masked ? 'noodle_type' in x.noodle : true), '評価一覧: 麺の種類も返す');
}

// ===== 抜いてもらった具材・嫌いな具材 =====
{
  const u = await newUser('抜き試験');
  const mk = async (cols) => {
    const v = randomUUID();
    await as(u.id, () => q('insert into public.visit (id, shop_id, entered_at) values ($1, $2, now())', [v, RS]));
    const keys = Object.keys(cols);
    const sql = 'insert into public.dish (id, visit_id, name' + keys.map((k) => ', ' + k).join('') + ') values ($1, $2, $3' + keys.map((_, i) => ', $' + (i + 4)).join('') + ')';
    return as(u.id, () => err(q(sql, [randomUUID(), v, '醤油ラーメン', ...keys.map((k) => cols[k])])));
  };
  ok((await mk({ removed_items: 'ネギ,海苔', disliked_items: 'きくらげ,にんにく' })) === null, '抜いてもらった具材・嫌いな具材を保存できる');
  ok((await mk({ removed_items: 'ライス' })) !== null, '抜いた具材にも、ご飯などは入れられない');
  ok((await mk({ disliked_items: '餃子' })) !== null, '嫌いな具材にも、餃子などは入れられない');
}

// ===== 推し・公開ランキング =====
const F1 = await newUser('ファン一'), F2 = await newUser('ファン二'), HK = await newUser('ヒーロー'), HD = await newUser('ひみつ');
const rpc = (u, sql, p = []) => as(u.id, () => q(sql, p));
ok((await as(null, () => err(q('select * from public.inspector_ranking()')))) !== null, '未ログインではランキングが使えない');
ok((await rpc(F1, "select * from public.search_inspectors('ヒーロー')")).rows.length === 0, '初期値は非公開: 検索に出ない');
ok((await rpc(F1, 'select * from public.inspector_ranking()')).rows.length === 0, '初期値は非公開: ランキングに出ない');
ok((await rpc(F1, 'select err from (select 1) x, lateral (select public.add_oshi($1) as err) y', [HK.pid]).then(() => null, (e) => e.message))?.includes('oshi_not_found'), '非公開の調査官は推せない');
await rpc(HK, 'select public.set_public(true)');
await rpc(F1, 'select public.set_public(true)');
ok((await rpc(F2, "select * from public.search_inspectors('ヒーロ')")).rows.map((r) => r.codename).join() === 'ヒーロー', '公開すると、コードネームで検索できる');
ok((await rpc(F2, "select * from public.search_inspectors('%')")).rows.length === 0, '検索のワイルドカードを無害化');
ok(!(await rpc(HK, "select * from public.search_inspectors('ヒーロー')")).rows.length, '自分自身は検索結果に出ない');
const addErr = (u, pid) => rpc(u, 'select public.add_oshi($1)', [pid]).then(() => null, (e) => e.message);
ok((await addErr(HK, HK.pid))?.includes('oshi_self'), '自分は推せない');
ok((await addErr(F2, HD.pid))?.includes('oshi_not_found'), '非公開の人は推せない（ひみつ）');
ok((await rpc(F2, 'select public.add_oshi($1) as r', [HK.pid])).rows[0].r.oshi_count === 1, '推しを登録できる');
await rpc(F1, 'select public.add_oshi($1)', [HK.pid]);
await rpc(F1, 'select public.add_oshi($1)', [HK.pid]); // 二重登録しても増えない
ok((await rpc(HK, 'select public.my_public() as r')).rows[0].r.fans === 2, '推されている数が数えられる');
// 推しの調査した店
const HV = randomUUID();
await rpc(HK, 'insert into public.visit (id, shop_id, entered_at) values ($1, $2, now())', [HV, SHOP]);
await rpc(HK, 'insert into public.visit_score (visit_id, satisfaction) values ($1, 80)', [HV]);
await rpc(HK, 'select public.submit_visit($1)', [HV]);
const os = (await rpc(F2, 'select * from public.oshi_shops()')).rows;
ok(os.length === 1 && os[0].shop_id === SHOP && os[0].names.join() === 'ヒーロー', '推しが行った店が取れる');
ok((await rpc(HD, 'select * from public.oshi_shops()')).rows.length === 0, '推しがいない人には何も出ない');
const rk = (await rpc(F2, "select * from public.inspector_ranking('points')")).rows;
ok(rk.length === 2 && rk[0].codename === 'ヒーロー' && Number(rk[0].pos) === 1 && rk.every((r) => !('id' in r)), 'ポイント順ランキング（公開2人・内部IDは返さない）', JSON.stringify(rk));
const rf = (await rpc(F2, "select * from public.inspector_ranking('fans')")).rows;
ok(rf[0].codename === 'ヒーロー' && rf[0].fans === 2 && rf.find((r) => r.codename === 'ファン一').fans === 0, '推され順ランキング');
ok(!rk.some((r) => r.codename === 'ひみつ'), '非公開の人はランキングに出ない');
ok(rk.find((r) => r.codename === 'ヒーロー').is_oshi === true && (await rpc(F1, "select * from public.inspector_ranking('points')")).rows.find((r) => r.codename === 'ファン一').is_me === true, '「推し済み」「自分」の印が付く');
ok((await rpc(F2, 'select * from public.my_oshi()')).rows.length === 1, '自分の推し一覧');
await rpc(HK, 'select public.set_public(false)');
ok((await rpc(F2, 'select * from public.my_oshi()')).rows.length === 0 && (await rpc(F2, 'select * from public.oshi_shops()')).rows.length === 0, '公開をやめると、推し一覧・推しの店から消える');
await rpc(HK, 'select public.set_public(true)');
await rpc(F2, 'select public.remove_oshi($1)', [HK.pid]);
ok((await rpc(F2, 'select * from public.my_oshi()')).rows.length === 0, '推しを解除できる');
ok((await as(F1, () => err(q('select * from public.oshi')))) !== null, 'oshi テーブルは直接読めない');
// 上限20人
const crowd = [];
for (let i = 0; i < 21; i++) { const u = await newUser('推し候補' + i); await rpc(u, 'select public.set_public(true)'); crowd.push(u); }
for (let i = 0; i < 20; i++) await rpc(F2, 'select public.add_oshi($1)', [crowd[i].pid]);
ok((await addErr(F2, crowd[20].pid))?.includes('oshi_limit'), '推しは20人まで');
// 削除すると公開もオフ・推しの関係も消える
await rpc(crowd[0], 'select public.delete_account()');
ok((await q('select count(*)::int as n from public.oshi where follower = $1 or target = $1', [crowd[0].id])).rows[0].n === 0, '削除すると推しの関係が消える');
ok((await q('select is_public from public.inspector where id = $1', [crowd[0].id])).rows[0].is_public === false, '削除すると公開もオフ');

// ===== アカウント削除 =====
await as(B.id, () => q('select public.delete_account()'));
ok((await q('select status, codename from public.inspector where id = $1', [B.id])).rows[0].status === 'frozen', '削除: 凍結・匿名化');
ok((await q('select count(*)::int as n from auth.users where id = $1', [B.id])).rows[0].n === 0, '削除: 認証情報が消える');
await q(`insert into auth.users (id) values ($1) on conflict do nothing`, [B.id]); // 同じ id で戻ってきたと仮定
ok(!(await as(B.id, async () => (await q('select public.me() as m')).rows[0].m)), '削除後は me() が null');
ok((await as(B.id, () => err(q(`insert into public.visit (id, shop_id, entered_at) values ($1, $2, now())`, [randomUUID(), SHOP])))) !== null, '凍結アカウントは来店を作れない');

console.log(failed === 0 ? `\nALL PASSED (${passed})` : `\n${failed} FAILED / ${passed} passed`);
process.exit(failed === 0 ? 0 : 1);
