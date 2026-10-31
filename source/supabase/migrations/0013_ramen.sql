-- ラーメン専用の調査項目（スープの系統・濃さ・麺の太さ/硬さ・替え玉・トッピング）と、好みのマッチング用の集計。
--  ・dish に列を追加（スープ=見習い、濃さ・麺・替え玉=三等、トッピング=一等から入力できる）
--  ・submit_visit: ラーメン専用項目のポイントを追加（スープ +5 / 濃さ・麺の太さと硬さ +8 / トッピング +3）
--  ・shop_reviews: 他の調査官のラーメン項目も、階級に応じて黒塗りで返す
--  ・search_shops: 3件以上の店は、いちばん多いスープ・濃さの平均・いちばん多い麺の太さを返す（好みのマッチングに使う）

alter table public.dish
  add column if not exists soup         varchar(20),
  add column if not exists richness     smallint check (richness between 0 and 4),   -- 0=あっさり … 4=こってり
  add column if not exists noodle_thick varchar(10) check (noodle_thick in ('細','中','太','極太')),
  add column if not exists noodle_firm  varchar(10) check (noodle_firm in ('固め','普通','柔らかめ')),
  add column if not exists toppings     varchar(120),
  add column if not exists kaedama      boolean;

create or replace function public.submit_visit(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); v visit; s visit_score; items jsonb := '[]'::jsonb;
  n_dish int; n_photo int; prior int; total int := 0; it record; r int; rk int; n_taste int;
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  select * into v from visit where id = p_visit and inspector_id = uid for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v.submitted_at is not null then
    return jsonb_build_object('visit_id', v.id, 'already_submitted', true, 'ikp', balance_of(uid));
  end if;
  select * into s from visit_score where visit_id = v.id;
  if not found then raise exception 'score_required' using errcode = '22023'; end if;

  select rank into rk from inspector where id = uid;
  select count(*) into n_dish from dish where visit_id = v.id;
  select count(*) into n_photo from photo where visit_id = v.id;
  select count(*) into prior from visit where inspector_id = uid and shop_id = v.shop_id and submitted_at is not null and id <> v.id;
  select coalesce(max(
           (taste_sweet is not null)::int + (taste_salty is not null)::int + (taste_sour is not null)::int
         + (taste_bitter is not null)::int + (taste_umami is not null)::int + (taste_hot is not null)::int), 0)
    into n_taste from dish where visit_id = v.id;

  update visit set submitted_at = now() where id = v.id;

  items := items || jsonb_build_object('kind','quick_report','label','基本提出','amount',10);
  if n_photo > 0 then items := items || jsonb_build_object('kind','photo','label','写真','amount', 5 * least(3, n_photo)); end if;
  if n_dish > 0 then items := items || jsonb_build_object('kind','dish_card','label','皿カード','amount', 8 * least(n_dish, 5)); end if;
  if prior = 0 then items := items || jsonb_build_object('kind','first_visit_bonus','label','自分は未踏の店','amount',30); end if;

  if rk >= 1 then
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
  end if;
  if rk >= 2 then
    if n_taste >= 3 then items := items || jsonb_build_object('kind','taste_analysis','label','味の分析','amount',8); end if;
    if s.service is not null and s.serve_speed_min is not null then
      items := items || jsonb_build_object('kind','service_info','label','接客・提供時間','amount',5);
    end if;
  end if;
  if rk >= 3 then
    if s.aroma is not null and s.texture is not null and s.temperature is not null and s.presentation is not null then
      items := items || jsonb_build_object('kind','quality_4','label','品質4項目','amount',10);
    end if;
    if s.crowdedness is not null and s.payment_methods is not null and s.smoking is not null then
      items := items || jsonb_build_object('kind','facility_info','label','設備・支払い','amount',6);
    end if;
  end if;
  if rk >= 4 and s.noise_db is not null then
    items := items || jsonb_build_object('kind','noise_measured','label','騒音の測定','amount',5);
  end if;

  -- ラーメン専用の項目
  if exists (select 1 from dish where visit_id = v.id and soup is not null) then
    items := items || jsonb_build_object('kind','ramen_soup','label','スープの系統','amount',5);
  end if;
  if rk >= 1 and exists (select 1 from dish where visit_id = v.id and richness is not null and noodle_thick is not null and noodle_firm is not null) then
    items := items || jsonb_build_object('kind','ramen_noodle','label','濃さ・麺の太さと硬さ','amount',8);
  end if;
  if rk >= 3 and exists (select 1 from dish where visit_id = v.id and toppings is not null) then
    items := items || jsonb_build_object('kind','ramen_toppings','label','トッピング','amount',3);
  end if;

  for it in select * from jsonb_to_recordset(items) as x(kind text, amount int) loop
    perform award(uid, it.amount, it.kind, 'visit', v.id);
    total := total + it.amount;
  end loop;
  r := refresh_rank(uid);
  return jsonb_build_object('visit_id', v.id, 'breakdown', items, 'total', total, 'ikp', balance_of(uid), 'rank', r);
end $$;

create or replace function public.shop_reviews(p_shop uuid, p_sort text default 'new', p_limit int default 20)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  rk int;
  h record;
  scope text;
  since timestamptz;
  lim int;
  ord text;
  total int;
  own_visit boolean;
  items jsonb := '[]'::jsonb;
  r record;
  summ jsonb := '{}'::jsonb;
  a record;
  rank_names text[] := array['見習い','三等インスペクター','二等インスペクター','一等インスペクター','主任インスペクター','特別監察官'];
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  select rank into rk from inspector where id = uid and status = 'active';
  if rk is null then raise exception 'not_registered' using errcode = '42501'; end if;

  -- 自分がこれまでに入力したことのある項目
  select
    coalesce(bool_or(d.price_yen is not null), false) as price,
    coalesce(bool_or(d.soup is not null), false) as soup,
    coalesce(bool_or(d.richness is not null or d.noodle_thick is not null or d.noodle_firm is not null or d.kaedama is not null), false) as noodle,
    coalesce(bool_or(d.toppings is not null), false) as toppings,
    coalesce(bool_or(d.volume is not null), false) as volume,
    coalesce(bool_or(v.comment is not null), false) as note,
    coalesce(bool_or(s.would_return is not null or s.would_recommend is not null), false) as rec,
    coalesce(bool_or(v.party_size is not null), false) as party,
    coalesce(bool_or(v.mood is not null), false) as mood,
    coalesce(bool_or(v.hunger_before is not null or v.fullness_after is not null), false) as condition,
    coalesce(bool_or(s.clean_entrance is not null or s.clean_seating is not null or s.clean_tableware is not null
                     or s.clean_restroom is not null or s.clean_kitchen is not null), false) as clean,
    coalesce(bool_or(s.quietness is not null), false) as quiet,
    coalesce(bool_or(s.wait_min is not null), false) as wait,
    coalesce(bool_or(d.taste_sweet is not null or d.taste_salty is not null or d.taste_sour is not null
                     or d.taste_bitter is not null or d.taste_umami is not null or d.taste_hot is not null), false) as taste,
    coalesce(bool_or(s.service is not null or s.serve_speed_min is not null), false) as service,
    coalesce(bool_or(s.aroma is not null or s.texture is not null or s.temperature is not null or s.presentation is not null), false) as quality,
    coalesce(bool_or(s.crowdedness is not null or s.payment_methods is not null or s.smoking is not null or s.seat_types is not null
                     or s.accessibility is not null or s.kids_friendly is not null or s.solo_friendly is not null
                     or s.multilingual_menu is not null), false) as facility,
    coalesce(bool_or(s.noise_db is not null), false) as noise
  into h
  from visit v
  left join visit_score s on s.visit_id = v.id
  left join dish d on d.visit_id = v.id
  where v.inspector_id = uid and v.submitted_at is not null;

  select exists (select 1 from visit where inspector_id = uid and shop_id = p_shop and submitted_at is not null) into own_visit;

  -- 見える範囲
  if rk = 0 then
    scope := case when own_visit then 'own_shop' else 'locked' end;
    since := null; lim := least(greatest(coalesce(p_limit, 5), 1), 5);
  elsif rk in (1, 2) then
    scope := '30days'; since := now() - interval '30 days';
    lim := least(greatest(coalesce(p_limit, 20), 1), case rk when 1 then 20 else 30 end);
  else
    scope := 'all'; since := null; lim := least(greatest(coalesce(p_limit, 20), 1), 100);
  end if;
  ord := case when rk >= 3 and p_sort in ('new', 'high', 'low', 'cheap') then p_sort else 'new' end;

  select count(*) into total
    from visit v join visit_score s on s.visit_id = v.id
   where v.shop_id = p_shop and v.submitted_at is not null and v.inspector_id <> uid;

  if scope <> 'locked' then
    for r in
      select v.id, v.entered_at, v.party_size, v.hunger_before, v.fullness_after, v.mood, v.comment,
             i.rank as reviewer_rank, i.trust_score,
             s.satisfaction, s.would_return, s.would_recommend,
             s.clean_entrance, s.clean_seating, s.clean_tableware, s.clean_restroom, s.clean_kitchen,
             s.quietness, s.wait_min, s.service, s.serve_speed_min,
             s.aroma, s.texture, s.temperature, s.presentation,
             s.crowdedness, s.payment_methods, s.smoking, s.seat_types,
             s.accessibility, s.kids_friendly, s.solo_friendly, s.multilingual_menu, s.noise_db,
             d.name as dish_name, d.price_yen, d.volume,
             d.taste_sweet, d.taste_salty, d.taste_sour, d.taste_bitter, d.taste_umami, d.taste_hot,
             d.soup, d.richness, d.noodle_thick, d.noodle_firm, d.toppings, d.kaedama
        from visit v
        join visit_score s on s.visit_id = v.id
        join inspector i on i.id = v.inspector_id
        left join lateral (select * from dish d0 where d0.visit_id = v.id order by d0.sort_order, d0.id limit 1) d on true
       where v.shop_id = p_shop and v.submitted_at is not null and v.inspector_id <> uid
         and (since is null or v.entered_at >= since)
       order by (case when ord = 'high' then s.satisfaction end) desc nulls last,
                (case when ord = 'low' then s.satisfaction end) asc nulls last,
                (case when ord = 'cheap' then d.price_yen end) asc nulls last,
                v.entered_at desc
       limit lim
    loop
      items := items || jsonb_build_array(jsonb_build_object(
        'id', r.id,
        'date', to_char(r.entered_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD'),
        'reviewer', jsonb_build_object('rank', r.reviewer_rank, 'rank_name', rank_names[r.reviewer_rank + 1], 'trust', round(r.trust_score / 10.0)),
        'satisfaction', r.satisfaction,
        'dish', r.dish_name,
        'price',    _mask(0, rk, h.price,  jsonb_build_object('price_yen', r.price_yen)),
        'volume',   _mask(0, rk, h.volume, jsonb_build_object('volume', r.volume)),
        'note',     _mask(0, rk, h.note,   jsonb_build_object('comment', r.comment)),
        'rec',      _mask(0, rk, h.rec,    jsonb_build_object('would_return', r.would_return, 'would_recommend', r.would_recommend)),
        'party',    _mask(0, rk, h.party,  jsonb_build_object('party_size', r.party_size)),
        'soup',     _mask(0, rk, h.soup,     jsonb_build_object('soup', r.soup)),
        'noodle',   _mask(1, rk, h.noodle,   jsonb_build_object('richness', r.richness, 'noodle_thick', r.noodle_thick, 'noodle_firm', r.noodle_firm, 'kaedama', r.kaedama)),
        'toppings', _mask(3, rk, h.toppings, jsonb_build_object('toppings', r.toppings)),
        'photos',   case when rk >= 1 then coalesce((select jsonb_agg(storage_url order by sort_order) from photo where visit_id = r.id), '[]'::jsonb)
                         else jsonb_build_object('masked', true, 'reason', 'rank', 'need_rank', 1) end,
        'mood',     _mask(1, rk, h.mood,      jsonb_build_object('mood', r.mood)),
        'condition',_mask(1, rk, h.condition, jsonb_build_object('hunger_before', r.hunger_before, 'fullness_after', r.fullness_after)),
        'clean',    _mask(1, rk, h.clean,     jsonb_build_object('entrance', r.clean_entrance, 'seating', r.clean_seating, 'tableware', r.clean_tableware,
                                                                 'restroom', r.clean_restroom, 'kitchen', r.clean_kitchen)),
        'quiet',    _mask(1, rk, h.quiet,     jsonb_build_object('quietness', r.quietness)),
        'wait',     _mask(1, rk, h.wait,      jsonb_build_object('wait_min', r.wait_min)),
        'taste',    _mask(2, rk, h.taste,     jsonb_build_object('sweet', r.taste_sweet, 'salty', r.taste_salty, 'sour', r.taste_sour,
                                                                 'bitter', r.taste_bitter, 'umami', r.taste_umami, 'hot', r.taste_hot)),
        'service',  _mask(2, rk, h.service,   jsonb_build_object('service', r.service, 'serve_speed_min', r.serve_speed_min)),
        'quality',  _mask(3, rk, h.quality,   jsonb_build_object('aroma', r.aroma, 'texture', r.texture, 'temperature', r.temperature, 'presentation', r.presentation)),
        'facility', _mask(3, rk, h.facility,  jsonb_build_object('crowdedness', r.crowdedness, 'payment_methods', r.payment_methods, 'smoking', r.smoking,
                                                                 'seat_types', r.seat_types, 'accessibility', r.accessibility, 'kids_friendly', r.kids_friendly,
                                                                 'solo_friendly', r.solo_friendly, 'multilingual_menu', r.multilingual_menu)),
        'noise',    _mask(4, rk, h.noise,     jsonb_build_object('noise_db', r.noise_db)),
        'corrections', case when rk >= 4 then coalesce((
              select jsonb_agg(jsonb_build_object('field', rv.field, 'old', rv.old_value, 'new', rv.new_value, 'at', rv.changed_at) order by rv.id)
                from revision rv
               where (rv.target_table in ('visit', 'visit_score') and rv.target_id = r.id)
                  or (rv.target_table = 'dish' and rv.target_id in (select id from dish where visit_id = r.id))), '[]'::jsonb)
              else jsonb_build_object('masked', true, 'reason', 'rank', 'need_rank', 4) end
      ));
    end loop;
  end if;

  -- 全期間の平均値（二等〜。3件以上のときだけ）
  if total >= 3 then
    select avg(s.satisfaction) as sat, avg(d.price_yen) as price, avg(s.wait_min) as wait, avg(s.quietness) as quiet,
           avg(d.taste_sweet) as t_sweet, avg(d.taste_salty) as t_salty, avg(d.taste_sour) as t_sour,
           avg(d.taste_bitter) as t_bitter, avg(d.taste_umami) as t_umami, avg(d.taste_hot) as t_hot,
           avg(d.richness) as rich
      into a
      from visit v join visit_score s on s.visit_id = v.id left join dish d on d.visit_id = v.id
     where v.shop_id = p_shop and v.submitted_at is not null and v.inspector_id <> uid;
    summ := jsonb_build_object(
      'n', total,
      'satisfaction', _mask(2, rk, true,    jsonb_build_object('avg', round(a.sat, 1))),
      'price',        _mask(2, rk, h.price, jsonb_build_object('avg', round(a.price))),
      'wait',         _mask(2, rk, h.wait,  jsonb_build_object('avg', round(a.wait, 1))),
      'quiet',        _mask(2, rk, h.quiet, jsonb_build_object('avg', round(a.quiet, 1))),
      'richness',     _mask(1, rk, h.noodle, jsonb_build_object('avg', round(a.rich, 1))),
      'taste',        _mask(2, rk, h.taste, jsonb_build_object('sweet', round(a.t_sweet, 1), 'salty', round(a.t_salty, 1), 'sour', round(a.t_sour, 1),
                                                               'bitter', round(a.t_bitter, 1), 'umami', round(a.t_umami, 1), 'hot', round(a.t_hot, 1))));
  end if;

  return jsonb_build_object(
    'viewer_rank', rk, 'scope', scope, 'sort', ord, 'limit', lim,
    'total', total, 'shown', jsonb_array_length(items), 'items', items, 'summary', summ);
end $$;

drop function if exists public.search_shops(double precision, double precision, int, text, text, int);

create function public.search_shops(
  p_lat double precision, p_lng double precision, p_radius_m int default 1500,
  p_q text default null, p_genre text default null, p_limit int default 50
)
returns table (id uuid, name text, lat double precision, lng double precision, genre text, url text,
               review_count int, distance_m int, rank_counts int[],
               soup_top text, richness_avg numeric, thick_top text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name::text, s.lat, s.lng, s.genre::text, s.url::text,
         case when c.n >= 3 then c.n::int end,
         round(d.m)::int,
         case when c.n >= 3 then c.ranks end,
         case when c.n >= 3 then rp.soup_top end,
         case when c.n >= 3 then rp.rich end,
         case when c.n >= 3 then rp.thick_top end
    from shop s
   cross join lateral (
     select 6371000 * acos(least(1, cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng))
                                    + sin(radians(p_lat)) * sin(radians(s.lat)))) as m) d
   cross join lateral (
     select count(*) as n,
            array[count(*) filter (where i.rank = 0), count(*) filter (where i.rank = 1),
                  count(*) filter (where i.rank = 2), count(*) filter (where i.rank = 3),
                  count(*) filter (where i.rank = 4), count(*) filter (where i.rank >= 5)]::int[] as ranks
       from visit v join visit_score vs on vs.visit_id = v.id
       join inspector i on i.id = v.inspector_id
      where v.shop_id = s.id and v.submitted_at is not null) c
   cross join lateral (
     select (select x.soup from dish x join visit v on v.id = x.visit_id
              where v.shop_id = s.id and v.submitted_at is not null and x.soup is not null
              group by x.soup order by count(*) desc, x.soup limit 1) as soup_top,
            (select round(avg(x.richness)::numeric, 1) from dish x join visit v on v.id = x.visit_id
              where v.shop_id = s.id and v.submitted_at is not null and x.richness is not null) as rich,
            (select x.noodle_thick from dish x join visit v on v.id = x.visit_id
              where v.shop_id = s.id and v.submitted_at is not null and x.noodle_thick is not null
              group by x.noodle_thick order by count(*) desc, x.noodle_thick limit 1) as thick_top) rp
   where s.status = 'active'
     and p_lat between -90 and 90 and p_lng between -180 and 180
     and d.m <= least(20000, greatest(100, coalesce(p_radius_m, 1500)))
     and (p_genre is null or p_genre = '' or s.genre = p_genre)
     and (p_q is null or p_q = '' or s.name_norm like '%' ||
          replace(replace(replace(norm_name(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%')
   order by d.m
   limit least(300, greatest(1, coalesce(p_limit, 50)))
$$;

revoke execute on function public.search_shops(double precision, double precision, int, text, text, int) from public, anon, authenticated;
grant execute on function public.search_shops(double precision, double precision, int, text, text, int) to anon, authenticated;
