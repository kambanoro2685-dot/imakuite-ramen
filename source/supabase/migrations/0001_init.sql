-- ImaKuite!Inspector! — Supabase (Postgres) スキーマ v1
-- 認証は Supabase Auth（匿名サインイン + パスキー）。氏名・メール・電話・住所は持たない。
--
-- 方針:
--   ・ポイント台帳・階級・信頼度・店舗登録・提出・訂正は、クライアントから直接書けない。
--     SECURITY DEFINER の関数（RPC）だけが書く。
--   ・自分の調査データ（visit / dish / visit_score / photo）は本人だけが読め、提出前だけ書ける（RLS + 列権限）。
--   ・他人のデータは集計（件数・平均）としてしか返さない。3件未満は null（k-匿名性）。
--
-- 適用: Supabase ダッシュボード → SQL Editor に貼って実行（1回だけ。同名テーブルが既にあるとエラーで止まり、何も壊さない）。

-- =====================================================================
-- 識別層
-- =====================================================================
create table public.inspector (
  id           uuid primary key,                 -- = auth.users.id（FKなし: アカウント削除後も匿名記録を残すため）
  public_id    char(13) not null unique,         -- 例: IKI-8FQ2-K7M3
  codename     varchar(16) not null unique,
  rank         smallint not null default 0 check (rank between 0 and 5),
  trust_score  smallint not null default 500 check (trust_score between 0 and 1000),
  status       text not null default 'active' check (status in ('active','restricted','frozen')),
  created_at   timestamptz not null default now()
);

create table public.inspector_profile (
  inspector_id     uuid primary key references public.inspector(id) on delete cascade,
  gender           text not null default 'unspecified' check (gender in ('female','male','other','unspecified')),
  age_band         smallint check (age_band between 10 and 100 and age_band % 10 = 0),
  nationality      char(2) check (nationality ~ '^[A-Z]{2}$'),
  height_bucket_cm smallint check (height_bucket_cm between 100 and 220 and height_bucket_cm % 5 = 0),
  allergen_bits    integer not null default 0 check (allergen_bits between 0 and 268435455),
  updated_at       timestamptz not null default now()
);

create table public.body_log (
  id               bigint generated always as identity primary key,
  inspector_id     uuid not null default auth.uid() references public.inspector(id) on delete cascade,
  measured_at      date not null,
  weight_bucket_kg smallint not null check (weight_bucket_kg between 20 and 300 and weight_bucket_kg % 5 = 0),
  created_at       timestamptz not null default now()
);
create index on public.body_log (inspector_id, measured_at);

-- =====================================================================
-- 記録層
-- =====================================================================
create table public.shop (
  id          uuid primary key default gen_random_uuid(),
  name        varchar(80) not null,
  name_norm   varchar(80) not null,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  genre       varchar(30),
  url         varchar(255),
  source      text not null default 'inspector' check (source in ('osm','inspector','shop_account')),
  status      text not null default 'active' check (status in ('active','merged','closed')),
  merged_into uuid references public.shop(id),
  created_by  uuid references public.inspector(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on public.shop (lat, lng);
create index on public.shop (name_norm);

-- visit / dish の id はクライアントが採番する（再送しても重複しない＝べき等キーを兼ねる）
create table public.visit (
  id                uuid primary key,
  inspector_id      uuid not null default auth.uid() references public.inspector(id) on delete cascade,
  shop_id           uuid not null references public.shop(id),
  entered_at        timestamptz not null,
  left_at           timestamptz,
  left_at_estimated boolean not null default false,
  party_size        smallint check (party_size between 1 and 20),
  hunger_before     smallint check (hunger_before between 0 and 100),
  fullness_after    smallint check (fullness_after between 0 and 100),
  mood              text check (mood in ('great','good','normal','tired','bad')),
  mood_tags         varchar(120),
  weather           varchar(20),                 -- 端末が Open-Meteo から取得した申告値（"wmo:<code>"）
  temp_c            numeric(4,1),
  pressure_hpa      numeric(6,1),
  comment           text check (char_length(comment) <= 1000),
  submitted_at      timestamptz,
  created_at        timestamptz not null default now()
);
create index on public.visit (inspector_id, entered_at);
create index on public.visit (shop_id, entered_at);

create table public.dish (
  id           uuid primary key,
  visit_id     uuid not null references public.visit(id) on delete cascade,
  name         varchar(60),
  genre        varchar(30),
  price_yen    integer check (price_yen between 0 and 1000000),
  tax_included boolean,
  volume       text check (volume in ('less','just_right','more','huge')),
  is_pick      boolean not null default false,
  taste_sweet  smallint check (taste_sweet between 0 and 5),
  taste_salty  smallint check (taste_salty between 0 and 5),
  taste_sour   smallint check (taste_sour between 0 and 5),
  taste_bitter smallint check (taste_bitter between 0 and 5),
  taste_umami  smallint check (taste_umami between 0 and 5),
  taste_hot    smallint check (taste_hot between 0 and 5),
  sort_order   smallint not null default 0
);
create index on public.dish (visit_id);

create table public.visit_score (
  visit_id          uuid primary key references public.visit(id) on delete cascade,
  clean_entrance    smallint check (clean_entrance between 0 and 2),
  clean_seating     smallint check (clean_seating between 0 and 2),
  clean_tableware   smallint check (clean_tableware between 0 and 2),
  clean_restroom    smallint check (clean_restroom between 0 and 2),
  clean_kitchen     smallint check (clean_kitchen between 0 and 2),
  quietness         smallint check (quietness between 0 and 4),
  noise_db          smallint check (noise_db between 0 and 200),
  aroma             smallint check (aroma between 0 and 2),
  texture           smallint check (texture between 0 and 2),
  temperature       smallint check (temperature between 0 and 2),
  presentation      smallint check (presentation between 0 and 2),
  service           smallint check (service between 0 and 4),
  serve_speed_min   smallint check (serve_speed_min between 0 and 600),
  wait_min          smallint check (wait_min between 0 and 600),
  crowdedness       smallint check (crowdedness between 0 and 4),
  payment_methods   varchar(80),
  smoking           text check (smoking in ('no','yes','separated')),
  seat_types        varchar(60),
  accessibility     boolean,
  multilingual_menu boolean,
  kids_friendly     boolean,
  solo_friendly     boolean,
  satisfaction      smallint not null check (satisfaction between 0 and 100),
  would_return      boolean,
  would_recommend   boolean
);

create table public.photo (
  id          uuid primary key default gen_random_uuid(),
  visit_id    uuid not null references public.visit(id) on delete cascade,
  dish_id     uuid references public.dish(id) on delete cascade,
  storage_url varchar(255) not null check (storage_url ~ '^https://'),
  ai_labels   varchar(200),
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);
create index on public.photo (visit_id);

-- 訂正履歴（追記のみ。書き込みは correct_field() だけ）
create table public.revision (
  id                 bigint generated always as identity primary key,
  target_table       text not null,
  target_id          uuid not null,
  field              text not null,
  old_value          text,
  new_value          text,
  reason             varchar(120),
  is_self_correction boolean not null default true,
  changed_by         uuid not null,
  changed_at         timestamptz not null default now()
);
create index on public.revision (target_table, target_id);

-- ポイント元帳（残高カラムは持たない。書き込みは RPC だけ）
create table public.point_ledger (
  id           bigint generated always as identity primary key,
  inspector_id uuid not null references public.inspector(id) on delete cascade,
  amount       integer not null,
  kind         text not null,
  ref_table    text,
  ref_id       uuid,
  status       text not null default 'pending' check (status in ('pending','fixed','revoked')),
  fixed_at     timestamptz,
  created_at   timestamptz not null default now()
);
create index on public.point_ledger (inspector_id, created_at);

-- =====================================================================
-- 権限（まず全部閉じてから、必要な分だけ開ける）
-- =====================================================================
alter table public.inspector         enable row level security;
alter table public.inspector_profile enable row level security;
alter table public.body_log          enable row level security;
alter table public.shop              enable row level security;
alter table public.visit             enable row level security;
alter table public.dish              enable row level security;
alter table public.visit_score       enable row level security;
alter table public.photo             enable row level security;
alter table public.revision          enable row level security;
alter table public.point_ledger      enable row level security;

revoke all on public.inspector, public.inspector_profile, public.body_log, public.shop, public.visit,
              public.dish, public.visit_score, public.photo, public.revision, public.point_ledger
  from anon, authenticated;

-- 自分の行だけ読める
grant select on public.inspector to authenticated;
create policy inspector_select_own on public.inspector for select to authenticated using (id = auth.uid());

grant select on public.shop to authenticated;
create policy shop_select on public.shop for select to authenticated using (status = 'active');

grant select on public.revision to authenticated;
create policy revision_select_own on public.revision for select to authenticated using (changed_by = auth.uid());

grant select on public.point_ledger to authenticated;
create policy ledger_select_own on public.point_ledger for select to authenticated using (inspector_id = auth.uid());

-- プロフィール・体重: 本人が自由に読み書き
grant select, insert, update, delete on public.inspector_profile to authenticated;
create policy profile_own on public.inspector_profile for all to authenticated
  using (inspector_id = auth.uid()) with check (inspector_id = auth.uid());

grant select, insert, delete on public.body_log to authenticated;
create policy bodylog_own on public.body_log for all to authenticated
  using (inspector_id = auth.uid()) with check (inspector_id = auth.uid());

-- 来店: 提出前だけ書ける。weather 等は申告値として入力を許す。inspector_id は既定値 auth.uid() で固定。
grant select on public.visit to authenticated;
grant insert (id, shop_id, entered_at, left_at, left_at_estimated, party_size, hunger_before, fullness_after,
              mood, mood_tags, weather, temp_c, pressure_hpa, comment) on public.visit to authenticated;
grant update (left_at, left_at_estimated, party_size, hunger_before, fullness_after, mood, mood_tags, comment)
  on public.visit to authenticated;
create policy visit_select_own on public.visit for select to authenticated using (inspector_id = auth.uid());
create policy visit_insert_own on public.visit for insert to authenticated
  with check (inspector_id = auth.uid() and submitted_at is null
              and exists (select 1 from public.inspector i where i.id = auth.uid() and i.status = 'active'));
create policy visit_update_open on public.visit for update to authenticated
  using (inspector_id = auth.uid() and submitted_at is null)
  with check (inspector_id = auth.uid() and submitted_at is null);

-- 皿・評価・写真: 自分の「未提出の来店」にだけ書ける
grant select, insert, update, delete on public.dish to authenticated;
grant select, insert, update, delete on public.visit_score to authenticated;
grant select, insert, delete on public.photo to authenticated;

create policy dish_select_own on public.dish for select to authenticated
  using (exists (select 1 from public.visit v where v.id = visit_id and v.inspector_id = auth.uid()));
create policy dish_write_open on public.dish for all to authenticated
  using (exists (select 1 from public.visit v where v.id = visit_id and v.inspector_id = auth.uid() and v.submitted_at is null))
  with check (exists (select 1 from public.visit v where v.id = visit_id and v.inspector_id = auth.uid() and v.submitted_at is null));

create policy score_select_own on public.visit_score for select to authenticated
  using (exists (select 1 from public.visit v where v.id = visit_id and v.inspector_id = auth.uid()));
create policy score_write_open on public.visit_score for all to authenticated
  using (exists (select 1 from public.visit v where v.id = visit_id and v.inspector_id = auth.uid() and v.submitted_at is null))
  with check (exists (select 1 from public.visit v where v.id = visit_id and v.inspector_id = auth.uid() and v.submitted_at is null));

create policy photo_select_own on public.photo for select to authenticated
  using (exists (select 1 from public.visit v where v.id = visit_id and v.inspector_id = auth.uid()));
create policy photo_write_open on public.photo for all to authenticated
  using (exists (select 1 from public.visit v where v.id = visit_id and v.inspector_id = auth.uid() and v.submitted_at is null))
  with check (exists (select 1 from public.visit v where v.id = visit_id and v.inspector_id = auth.uid() and v.submitted_at is null));

-- =====================================================================
-- 内部関数（クライアントからは呼べない）
-- =====================================================================
create function public.norm_name(p text) returns text
language sql immutable as $$
  select lower(regexp_replace(normalize(coalesce(p, ''), NFKC), '\s+', '', 'g'))
$$;

create function public.gen_public_id() returns text
language plpgsql as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  body text; sum int; idx int; cand text; tries int := 0;
begin
  loop
    body := ''; sum := 0;
    for i in 1..7 loop
      idx := floor(random() * 32)::int;
      body := body || substr(alphabet, idx + 1, 1);
      sum := sum + idx * i;
    end loop;
    body := body || substr(alphabet, (sum % 32) + 1, 1);   -- チェックディジット
    cand := 'IKI-' || substr(body, 1, 4) || '-' || substr(body, 5, 4);
    exit when not exists (select 1 from public.inspector where public_id = cand);
    tries := tries + 1;
    if tries > 20 then raise exception 'could not allocate public id'; end if;
  end loop;
  return cand;
end $$;

create function public.award(p_inspector uuid, p_amount int, p_kind text, p_ref_table text default null, p_ref uuid default null)
returns void language sql as $$
  insert into public.point_ledger (inspector_id, amount, kind, ref_table, ref_id)
  values (p_inspector, p_amount, p_kind, p_ref_table, p_ref)
$$;

create function public.balance_of(p_inspector uuid) returns int
language sql stable as $$
  select coalesce(sum(amount), 0)::int from public.point_ledger
  where inspector_id = p_inspector and status in ('pending','fixed')
$$;

create function public.refresh_rank(p_inspector uuid) returns int
language plpgsql as $$
declare bal int := public.balance_of(p_inspector); trust int; r int := 0;
begin
  select trust_score into trust from public.inspector where id = p_inspector;
  if bal >= 300 then r := 1; end if;
  if bal >= 1200 then r := 2; end if;
  if bal >= 3000 then r := 3; end if;
  if bal >= 8000 then r := 4; end if;
  if bal >= 20000 and trust >= 800 then r := 5; end if;
  update public.inspector set rank = r where id = p_inspector;
  return r;
end $$;

-- =====================================================================
-- 公開関数（RPC）。すべて SECURITY DEFINER、search_path 固定
-- =====================================================================

-- 匿名サインイン直後に1回呼ぶ。調査官の行と公開IDを作る（再呼び出しは既存IDを返す）
create function public.register_inspector(p_codename text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text := btrim(coalesce(p_codename, '')); pid text;
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  select public_id into pid from inspector where id = uid;
  if pid is not null then
    return jsonb_build_object('public_id', pid, 'created', false);
  end if;
  if char_length(c) < 1 or char_length(c) > 16 or c ~ '[\x00-\x1f<>]' then
    raise exception 'invalid_codename' using errcode = '22023';
  end if;
  pid := gen_public_id();
  begin
    insert into inspector (id, public_id, codename) values (uid, pid, c);
  exception when unique_violation then
    raise exception 'codename_taken' using errcode = '23505';
  end;
  return jsonb_build_object('public_id', pid, 'created', true);
end $$;

create function public.me() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); i inspector; bal int; r int; p inspector_profile;
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  select * into i from inspector where id = uid;
  if not found or i.status = 'frozen' then return null; end if;
  bal := balance_of(uid);
  r := refresh_rank(uid);
  select * into p from inspector_profile where inspector_id = uid;
  return jsonb_build_object(
    'public_id', i.public_id, 'codename', i.codename, 'trust_score', i.trust_score,
    'ikp', bal, 'rank', r,
    'profile', jsonb_build_object('gender', coalesce(p.gender, 'unspecified'), 'age_band', p.age_band,
                                  'nationality', p.nationality, 'height_bucket_cm', p.height_bucket_cm));
end $$;

-- 提出: 加点を計算して台帳に記録。二重提出しても二重加点しない
create function public.submit_visit(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); v visit; s visit_score; items jsonb := '[]'::jsonb;
  n_dish int; n_photo int; prior int; amount int; total int := 0; it record; r int;
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  select * into v from visit where id = p_visit and inspector_id = uid for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v.submitted_at is not null then
    return jsonb_build_object('visit_id', v.id, 'already_submitted', true, 'ikp', balance_of(uid));
  end if;
  select * into s from visit_score where visit_id = v.id;
  if not found then raise exception 'score_required' using errcode = '22023'; end if;

  select count(*) into n_dish from dish where visit_id = v.id;
  select count(*) into n_photo from photo where visit_id = v.id;
  select count(*) into prior from visit where inspector_id = uid and shop_id = v.shop_id and submitted_at is not null and id <> v.id;

  update visit set submitted_at = now() where id = v.id;

  items := items || jsonb_build_object('kind','quick_report','label','基本提出','amount',10);
  if n_photo > 1 then items := items || jsonb_build_object('kind','photo_extra','label','写真追加','amount', 5 * least(2, n_photo - 1)); end if;
  if n_dish > 0 then items := items || jsonb_build_object('kind','dish_card','label','皿カード','amount', 8 * least(n_dish, 5)); end if;
  if s.clean_entrance is not null and s.clean_seating is not null and s.clean_tableware is not null
     and s.clean_restroom is not null and s.clean_kitchen is not null then
    items := items || jsonb_build_object('kind','clean_5','label','清掃5項目','amount',15);
  end if;
  if s.quietness is not null and s.wait_min is not null then
    items := items || jsonb_build_object('kind','environment','label','環境（静かさ・待ち時間）','amount',10);
  end if;
  if v.hunger_before is not null and v.fullness_after is not null then
    items := items || jsonb_build_object('kind','condition','label','体調','amount',6);
  end if;
  if prior = 0 then items := items || jsonb_build_object('kind','first_visit_bonus','label','自分は未踏の店','amount',30); end if;

  for it in select * from jsonb_to_recordset(items) as x(kind text, amount int) loop
    perform award(uid, it.amount, it.kind, 'visit', v.id);
    total := total + it.amount;
  end loop;
  r := refresh_rank(uid);
  return jsonb_build_object('visit_id', v.id, 'breakdown', items, 'total', total, 'ikp', balance_of(uid), 'rank', r);
end $$;

-- 新規店舗登録（登録ボーナス +100）。同名・約100m以内は重複として拒否
create function public.create_shop(p_name text, p_lat double precision, p_lng double precision, p_genre text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n text := btrim(coalesce(p_name, '')); nn text; dup uuid; sid uuid; recent int;
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  if not exists (select 1 from inspector where id = uid and status = 'active') then
    raise exception 'not_registered' using errcode = '42501';
  end if;
  if char_length(n) < 1 or char_length(n) > 80 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_location' using errcode = '22023';
  end if;
  select count(*) into recent from shop where created_by = uid and created_at > now() - interval '1 day';
  if recent >= 20 then raise exception 'rate_limited' using errcode = '53400'; end if;
  nn := norm_name(n);
  select id into dup from shop
   where name_norm = nn and status = 'active' and abs(lat - p_lat) < 0.001 and abs(lng - p_lng) < 0.001 limit 1;
  if dup is not null then
    raise exception 'duplicate_shop:%', dup using errcode = '23505';
  end if;
  insert into shop (name, name_norm, lat, lng, genre, source, created_by)
  values (n, nn, p_lat, p_lng, nullif(btrim(p_genre), ''), 'inspector', uid) returning id into sid;
  perform award(uid, 100, 'new_shop_bonus', 'shop', sid);
  perform refresh_rank(uid);
  return jsonb_build_object('id', sid, 'bonus', jsonb_build_object('kind', 'new_shop_bonus', 'amount', 100));
end $$;

-- 近傍検索。他人の評価は件数だけ（3件未満は null = 調査待ち）
create function public.search_shops(p_lat double precision, p_lng double precision, p_radius_m int default 1500,
                                    p_q text default null, p_genre text default null)
returns table (id uuid, name text, lat double precision, lng double precision, genre text, url text,
               review_count int, distance_m int)
language sql stable security definer set search_path = public as $$
  select s.id, s.name::text, s.lat, s.lng, s.genre::text, s.url::text,
         case when c.n >= 3 then c.n::int end,
         round(d.m)::int
    from shop s
   cross join lateral (
     select 6371000 * acos(least(1, cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng))
                                    + sin(radians(p_lat)) * sin(radians(s.lat)))) as m) d
   cross join lateral (
     select count(*) as n from visit v join visit_score vs on vs.visit_id = v.id
      where v.shop_id = s.id and v.submitted_at is not null) c
   where auth.uid() is not null
     and s.status = 'active'
     and d.m <= least(20000, greatest(100, coalesce(p_radius_m, 1500)))
     and (p_genre is null or p_genre = '' or s.genre = p_genre)
     and (p_q is null or p_q = '' or s.name_norm like '%' ||
          replace(replace(replace(norm_name(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%')
   order by d.m
   limit 50
$$;

create function public.shop_stats(p_shop uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n int; n30 int; a numeric;
begin
  select count(*), count(*) filter (where v.entered_at >= now() - interval '30 days'), avg(vs.satisfaction)
    into n, n30, a
    from visit v join visit_score vs on vs.visit_id = v.id
   where v.shop_id = p_shop and v.submitted_at is not null;
  if n < 3 then return jsonb_build_object('review_count', null, 'review_count_30d', null, 'avg_satisfaction', null); end if;
  return jsonb_build_object('review_count', n, 'review_count_30d', n30, 'avg_satisfaction', round(a, 1));
end $$;

-- 今日の投稿者数・今まさに投稿中の人数（誰でも見られる集計）
create function public.stats_live() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'active_inspectors_today',
      (select count(distinct inspector_id) from visit
        where entered_at >= (date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo')),
    'posting_now',
      (select count(distinct inspector_id) from visit
        where submitted_at is null and entered_at >= now() - interval '30 minutes'))
$$;

-- 訂正: 対象行を更新し、旧値・新値を revision に追記。提出後72時間以内（または提出前）は減点なし +3pt
create function public.correct_field(p_table text, p_id uuid, p_field text, p_new text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); allowed boolean; owner uuid; submitted timestamptz;
  pk text; coltype text; old_val text; within72 boolean;
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;

  allowed := case p_table
    when 'visit' then p_field in ('party_size','hunger_before','fullness_after','mood','mood_tags','comment')
    when 'dish' then p_field in ('name','genre','price_yen','tax_included','volume','is_pick',
                                 'taste_sweet','taste_salty','taste_sour','taste_bitter','taste_umami','taste_hot')
    when 'visit_score' then p_field in ('clean_entrance','clean_seating','clean_tableware','clean_restroom','clean_kitchen',
                                 'quietness','noise_db','aroma','texture','temperature','presentation','service',
                                 'serve_speed_min','wait_min','crowdedness','payment_methods','smoking','seat_types',
                                 'accessibility','multilingual_menu','kids_friendly','solo_friendly',
                                 'satisfaction','would_return','would_recommend')
    else false end;
  if not coalesce(allowed, false) then raise exception 'invalid_field' using errcode = '22023'; end if;

  if p_table = 'dish' then
    select v.inspector_id, v.submitted_at into owner, submitted from dish d join visit v on v.id = d.visit_id where d.id = p_id;
  else
    select inspector_id, submitted_at into owner, submitted from visit where id = p_id;
  end if;
  if owner is distinct from uid then raise exception 'not_found' using errcode = 'P0002'; end if;

  pk := case when p_table = 'visit_score' then 'visit_id' else 'id' end;
  select data_type into coltype from information_schema.columns
   where table_schema = 'public' and table_name = p_table and column_name = p_field;
  execute format('select %I::text from public.%I where %I = $1', p_field, p_table, pk) into old_val using p_id;
  if old_val is not distinct from p_new then raise exception 'no_change' using errcode = '22023'; end if;

  execute format('update public.%I set %I = %L::%s where %I = $1', p_table, p_field, p_new, coltype, pk) using p_id;

  insert into revision (target_table, target_id, field, old_value, new_value, reason, changed_by)
  values (p_table, p_id, p_field, old_val, p_new, left(p_reason, 120), uid);

  within72 := submitted is null or now() - submitted <= interval '72 hours';
  if within72 then perform award(uid, 3, 'self_correction', p_table, p_id); end if;
  return jsonb_build_object('ok', true, 'penalty', not within72, 'bonus', case when within72 then 3 else 0 end);
end $$;

-- アカウント削除: 記録は匿名のまま残し、個人に結びつく情報と認証情報を消す
create function public.delete_account() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  update inspector set status = 'frozen', codename = '削除済み-' || right(replace(uid::text, '-', ''), 8) where id = uid;
  delete from inspector_profile where inspector_id = uid;
  delete from body_log where inspector_id = uid;
  delete from auth.users where id = uid;   -- パスキー・セッションも連鎖削除される
end $$;

-- =====================================================================
-- 関数の実行権限: 既定の PUBLIC 実行を外し、必要なものだけ付ける
-- =====================================================================
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.register_inspector(text)        to authenticated;
grant execute on function public.me()                             to authenticated;
grant execute on function public.submit_visit(uuid)               to authenticated;
grant execute on function public.create_shop(text, double precision, double precision, text) to authenticated;
grant execute on function public.search_shops(double precision, double precision, int, text, text) to authenticated;
grant execute on function public.shop_stats(uuid)                 to authenticated;
grant execute on function public.correct_field(text, uuid, text, text, text) to authenticated;
grant execute on function public.delete_account()                 to authenticated;
grant execute on function public.stats_live()                     to anon, authenticated;
