-- 見本データ: 調査官200人（階級はポイントに合わせてばらつかせる）、投稿、推しの関係。
--  ・見本の調査官は、公開ID が「IKS-」で始まり、名前が「見本」で始まる。本物の利用者（IKI-…）とは区別できる。
--  ・およそ半分と、一等以上の全員を「公開」にする（ランキング・検索に出る）。
--  ・店は、取り込んだラーメン店（source = 'osm'）の中から、人気に偏りをつけて選ぶ（口コミが3件以上たまる店ができる）。
--  ・階級で解放される入力項目に合わせて、上の階級ほど細かい項目を埋める。
--  ・消すとき: demo_200_remove.sql（見本の調査官を消すと、投稿・ポイント・推しも連鎖して消える）。
--  ・2回入れないよう、すでにあればエラーで止まる。

select setseed(0.314);

do $$
begin
  if exists (select 1 from public.inspector where public_id like 'IKS-%') then
    raise exception 'demo seed already present (IKS-)';
  end if;
  if (select count(*) from public.shop where status = 'active' and source = 'osm') = 0 then
    raise exception 'no shops to visit';
  end if;
end $$;

drop table if exists seed_insp, seed_shops, seed_vpick, seed_pub;

-- 1) 調査官200人（階級の配分: 見習い110・三等50・二等25・一等10・主任4・特別監察官1）
create temp table seed_insp as
select gen_random_uuid() as id, i,
       case when i <= 110 then 0 when i <= 160 then 1 when i <= 185 then 2 when i <= 195 then 3 when i <= 199 then 4 else 5 end as rk
  from generate_series(1, 200) i;

insert into public.inspector (id, public_id, codename, trust_score, is_public, created_at)
select id,
       'IKS-' || upper(substr(md5('a' || i), 1, 4)) || '-' || upper(substr(md5('b' || i), 1, 4)),
       '見本' || (array['替え玉','背脂','麺固め','煮干','豚骨','味玉','醤油','塩','味噌','家系','二郎','つけ麺','辛味噌','ネギ','海苔','メンマ','ちぢれ','細麺','太麺','鶏白湯'])[1 + i % 20] || lpad(i::text, 3, '0'),
       case when rk = 5 then 850 else 400 + floor(random() * 450)::int end,
       (i % 2 = 0 or rk >= 3),
       now() - (random() * 120) * interval '1 day'
  from seed_insp;

insert into public.inspector_profile (inspector_id, gender, age_band, nationality)
select id, (array['female','male','other','unspecified'])[1 + floor(random() * 4)::int], (2 + floor(random() * 5)::int) * 10, 'JP'
  from seed_insp;

-- 2) ポイント（階級の範囲の中でばらつかせ、階級を計算し直す）
insert into public.point_ledger (inspector_id, amount, kind, status, fixed_at)
select id,
       (case rk when 0 then floor(random() * 280)
                when 1 then 300 + floor(random() * 800)
                when 2 then 1200 + floor(random() * 1700)
                when 3 then 3000 + floor(random() * 4500)
                when 4 then 8000 + floor(random() * 11000)
                else 21000 + floor(random() * 9000) end)::int,
       'demo_seed', 'fixed', now()
  from seed_insp;
select public.refresh_rank(id) from seed_insp;

-- 3) 投稿（来店・皿・評価）。1人あたり 2〜（6 + 階級×2）件くらい
create temp table seed_shops as
select id, genre, row_number() over (order by name_norm, id) as rn
  from public.shop where status = 'active' and source = 'osm';

create temp table seed_vpick as
select gen_random_uuid() as vid, s.id as iid, s.rk, v,
       (select count(*) from seed_shops)::int as ns,
       random() as r1, random() as r2,
       now() - (random() * 90) * interval '1 day' as t
  from seed_insp s
  cross join lateral generate_series(1, 2 + floor(random() * 5)::int + s.rk * 2) v;

create temp table seed_v2 as
select p.*, sh.id as shop_id, sh.genre as shop_genre,
       -- 人気に偏りをつけた店選びのあと、スープの系統（その店の系統が7割）
       (select case when sh.genre in ('醤油','味噌','塩','豚骨','家系','二郎系','つけ麺','まぜそば・油そば','担々麺','煮干し・魚介','鶏白湯') and random() < 0.7 then sh.genre
                    else (array['醤油','味噌','塩','豚骨','家系','二郎系','つけ麺','まぜそば・油そば','担々麺','煮干し・魚介','鶏白湯'])[1 + floor(random() * 11)::int] end) as soup
  from seed_vpick p
  join seed_shops sh on sh.rn = 1 + floor(p.ns * power(p.r1, 1.6))::int;

insert into public.visit (id, inspector_id, shop_id, entered_at, party_size, hunger_before, fullness_after, mood, comment, submitted_at)
select vid, iid, shop_id, t,
       1 + floor(random() * 3)::int,
       case when rk >= 1 then 25 * floor(random() * 5)::int end,
       case when rk >= 1 then 25 * floor(random() * 5)::int end,
       case when rk >= 1 then (array['great','good','normal','tired'])[1 + floor(random() * 4)::int] end,
       (array['スープがおいしかった。','麺の茹で加減がちょうどよい。','また行きたい。','並んだけれど待つ価値あり。','あっさりで食べやすい。','こってりで満足。'])[1 + floor(random() * 6)::int],
       t + interval '55 minutes'
  from seed_v2;

insert into public.visit_score (visit_id, satisfaction, would_return, would_recommend,
       clean_entrance, clean_seating, clean_tableware, clean_restroom, clean_kitchen, quietness, wait_min,
       service, serve_speed_min,
       aroma, texture, temperature, presentation, crowdedness, payment_methods, smoking, seat_types)
select vid,
       least(5, 2 + ((abs(hashtext(shop_id::text)) % 4) + floor(random() * 2)::int)) * 20,
       random() < 0.8, random() < 0.5,
       case when rk >= 1 then floor(random() * 3)::int end, case when rk >= 1 then floor(random() * 3)::int end,
       case when rk >= 1 then floor(random() * 3)::int end, case when rk >= 1 then floor(random() * 3)::int end,
       case when rk >= 1 then floor(random() * 3)::int end,
       case when rk >= 1 then floor(random() * 5)::int end,
       case when rk >= 1 then (array[0, 10, 30, 45])[1 + floor(random() * 4)::int] end,
       case when rk >= 2 then floor(random() * 5)::int end,
       case when rk >= 2 then (array[2, 5, 10, 15])[1 + floor(random() * 4)::int] end,
       case when rk >= 3 then floor(random() * 3)::int end, case when rk >= 3 then floor(random() * 3)::int end,
       case when rk >= 3 then floor(random() * 3)::int end, case when rk >= 3 then floor(random() * 3)::int end,
       case when rk >= 3 then floor(random() * 5)::int end,
       case when rk >= 3 then (array['cash', 'cash,ic', 'cash,credit,qr'])[1 + floor(random() * 3)::int] end,
       case when rk >= 3 then (array['no', 'yes', 'separated'])[1 + floor(random() * 3)::int] end,
       case when rk >= 3 then (array['counter', 'counter,table', 'table'])[1 + floor(random() * 3)::int] end
  from seed_v2;

insert into public.dish (id, visit_id, name, soup, price_yen, volume, richness, noodle_thick, noodle_firm, noodle_type,
       toppings, base_items, sides, kaedama, taste_sweet, taste_salty, taste_sour, taste_bitter, taste_umami, taste_hot)
select gen_random_uuid(), vid,
       case when soup in ('つけ麺', 'まぜそば・油そば', '担々麺') then soup else soup || 'ラーメン' end,
       soup,
       700 + 50 * floor(random() * 9)::int,
       (array['less', 'just_right', 'just_right', 'more', 'huge'])[1 + floor(random() * 5)::int],
       case when rk >= 1 then (case when soup in ('豚骨', '家系', '二郎系', '鶏白湯') then 3 + floor(random() * 2)
                                    when soup in ('醤油', '塩', '煮干し・魚介') then floor(random() * 3)
                                    else 2 + floor(random() * 2) end)::int end,
       case when rk >= 1 then (case when soup = '豚骨' then '細' when soup in ('二郎系', 'つけ麺') then '太'
                                    else (array['細', '中', '太'])[1 + floor(random() * 3)::int] end) end,
       case when rk >= 1 then (array['固め', '普通', '柔らかめ'])[1 + floor(random() * 3)::int] end,
       case when rk >= 1 then (case when soup = '豚骨' then 'ストレート' when soup = '味噌' then 'ちぢれ'
                                    else (array['ちぢれ', 'ストレート', '平打ち'])[1 + floor(random() * 3)::int] end) end,
       (select string_agg(x, ',') from (select x from unnest(array['チャーシュー', '味玉', 'メンマ', 'ネギ', '海苔', 'もやし', 'ほうれん草', '背脂', 'にんにく', '辛味噌']) x order by random() limit 1 + floor(random() * 3)::int) q),
       (select string_agg(x, ',') from (select x from unnest(array['チャーシュー', 'メンマ', 'ネギ', '海苔', 'なると', 'もやし', 'ほうれん草', '青菜', 'きくらげ', 'キャベツ']) x order by random() limit 2 + floor(random() * 3)::int) q),
       (select string_agg(x, ',') from (select x from unnest(array['高菜', '紅しょうが', '白ごま', 'おろしにんにく', '漬物', 'ゆず胡椒', 'ラー油', '酢', 'コショウ']) x order by random() limit floor(random() * 3)::int) q),
       case when rk >= 1 and soup in ('豚骨', '家系') then random() < 0.5 end,
       case when rk >= 2 then floor(random() * 6)::int end, case when rk >= 2 then floor(random() * 6)::int end,
       case when rk >= 2 then floor(random() * 6)::int end, case when rk >= 2 then floor(random() * 6)::int end,
       case when rk >= 2 then floor(random() * 6)::int end, case when rk >= 2 then floor(random() * 6)::int end
  from seed_v2;

-- 4) 推し（1人 1〜4人。公開している調査官を、階級が上の人ほど推されやすく選ぶ）
create temp table seed_pub as
select s.id, row_number() over (order by s.rk desc, s.i) as rn
  from seed_insp s join public.inspector p on p.id = s.id where p.is_public;

insert into public.oshi (follower, target)
select distinct f.id, t.id
  from seed_insp f
  cross join lateral generate_series(1, 1 + floor(random() * 4)::int) g
  -- 行ごとに違う疑似乱数（f と g から作る）。random() だけだと全員が同じ人を選んでしまう
  cross join lateral (select 1 + floor((select count(*) from seed_pub) * power((abs(hashtext(f.id::text || '-' || g::text)) % 100000) / 100000.0, 1.8))::int as pick) pk
  join seed_pub t on t.rn = pk.pick
 where t.id <> f.id
on conflict do nothing;

drop table seed_insp, seed_shops, seed_vpick, seed_v2, seed_pub;
