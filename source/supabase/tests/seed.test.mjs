// 見本データ（seed/demo_200.sql）の検証。マイグレーションを Postgres(PGlite) に流し、RLS・列権限・RPC を検証する。 npm test
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


let failed = 0, passed = 0;
const ok = (c, name, extra = '') => { c ? passed++ : failed++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name}${c ? '' : '  ' + extra}`); };
const seedSql = readFileSync(new URL('../seed/demo_200.sql', import.meta.url), 'utf8');
const removeSql = readFileSync(new URL('../seed/demo_200_remove.sql', import.meta.url), 'utf8');
const q = (sql, p = []) => db.query(sql, p);
const one = async (sql) => (await q(sql)).rows[0];

// 本物の利用者（IKI-）を1人置いておく: 見本を消しても残ることの確認用
const realId = randomUUID();
await q('insert into auth.users (id) values ($1)', [realId]);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${realId}', false);`);
await q("select public.register_inspector('本物の人')");
await db.exec('reset role;');

await db.exec(seedSql);

ok((await one("select count(*)::int as n from public.inspector where public_id like 'IKS-%'")).n === 200, '見本の調査官が200人');
ok((await one("select count(distinct codename)::int as n from public.inspector where public_id like 'IKS-%' and codename like '見本%'")).n === 200, '名前はすべて「見本」で始まり、重複なし');
const byRank = (await q("select rank, count(*)::int as n from public.inspector where public_id like 'IKS-%' group by rank order by rank")).rows;
ok(byRank.length === 6 && byRank[0].n >= 100 && byRank[5].n === 1, '階級が見習い〜特別監察官まで揃う', JSON.stringify(byRank));
ok(byRank.every((r) => r.n >= 1), '全階級に人がいる', JSON.stringify(byRank));
const pub = (await one("select count(*)::int as n from public.inspector where public_id like 'IKS-%' and is_public")).n;
ok(pub >= 90 && pub <= 130, `およそ半分が公開（${pub}人）`);
ok((await one("select count(*)::int as n from public.inspector where public_id like 'IKS-%' and rank >= 3 and not is_public")).n === 0, '一等以上は全員公開');
const visits = (await one("select count(*)::int as n from public.visit v join public.inspector i on i.id = v.inspector_id where i.public_id like 'IKS-%' and v.submitted_at is not null")).n;
ok(visits >= 800, `投稿がたくさんある（${visits}件）`);
ok((await one('select count(*)::int as n from public.visit v left join public.visit_score s on s.visit_id = v.id where s.visit_id is null')).n === 0, 'すべての投稿に評価がある');
ok((await one('select count(*)::int as n from public.visit v left join public.dish d on d.visit_id = v.id where d.id is null')).n === 0, 'すべての投稿に皿がある');
const oshiN = (await one('select count(*)::int as n from public.oshi')).n;
ok(oshiN >= 150, `推しの関係がある（${oshiN}件）`);
ok((await one("select count(*)::int as n from (select follower, count(*) c from public.oshi group by follower having count(*) > 20) x")).n === 0, '推しは1人20人まで');
ok((await one("select count(*)::int as n from public.oshi o join public.inspector t on t.id = o.target where not t.is_public")).n === 0, '推されているのは公開している人だけ');
// 画面に出る集計
const rows = (await q("select * from public.search_shops(34.6667, 133.9188, 3000, null, null, 300)")).rows;
ok(rows.some((r) => r.review_count >= 3 && r.soup_top && r.richness_avg !== null), '口コミ3件以上の店に、スープ・濃さなどの集計が出る');
// ランキング（本物の利用者として呼ぶ）
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${realId}', false);`);
const rkp = (await q("select * from public.inspector_ranking('points', 100)")).rows;
const rkf = (await q("select * from public.inspector_ranking('fans', 100)")).rows;
await db.exec('reset role;');
ok(rkp.length === Math.min(100, pub) && Number(rkp[0].pos) === 1 && rkp[0].rank_name === '特別監察官', 'ポイント順ランキングの1位は特別監察官', JSON.stringify(rkp[0]));
ok(rkf.length === Math.min(100, pub) && rkf[0].fans >= 3 && rkf[0].fans < 100, '推され順ランキングに、推されている人がいる', JSON.stringify(rkf[0]));
ok(rkp.every((r) => r.codename.startsWith('見本')), 'ランキングには見本の調査官だけ（本物の人は非公開）');

// 2回入れない
let again = null; try { await db.exec(seedSql); } catch (e) { again = e.message; }
ok(again && /already present/.test(again), '2回目は止まる');

// 消す
await db.exec(removeSql);
ok((await one("select count(*)::int as n from public.inspector where public_id like 'IKS-%'")).n === 0, '消すと見本の調査官が0人');
ok((await one('select count(*)::int as n from public.visit')).n === 0 && (await one('select count(*)::int as n from public.oshi')).n === 0, '投稿と推しも連鎖して消える');
ok((await one("select count(*)::int as n from public.inspector where codename = '本物の人'")).n === 1, '本物の利用者は残る');
ok((await one('select count(*)::int as n from public.point_ledger')).n >= 0 && (await one("select count(*)::int as n from public.point_ledger where kind = 'demo_seed'")).n === 0, 'ポイントの記録も消える');

console.log(failed === 0 ? `\nALL PASSED (${passed})` : `\n${failed} FAILED / ${passed} passed`);
process.exit(failed === 0 ? 0 : 1);
