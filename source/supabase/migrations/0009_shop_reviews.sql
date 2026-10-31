-- 他の調査官の評価一覧。「自分が入力している範囲しか見えない」「階級が上がるほど見える範囲が広がる」を守る。
--
-- 見える範囲（どの来店を読めるか）
--   見習い(0)   : 自分が投稿した店だけ。新しい順に5件
--   三等(1)     : どの店でも、直近30日の評価。20件
--   二等(2)     : 直近30日の評価 30件 ＋ 全期間の平均値
--   一等(3)〜   : 全期間・全件（最大100件）。並べ替えができる
-- 見える項目（黒塗りの条件）
--   (a) 階級: 項目ごとに必要な階級がある（入力項目が解放される階級と同じ）
--   (b) 入力: 自分がその項目を一度も入力したことがなければ、他人の値も見えない
--   黒塗りは {"masked": true, "reason": "rank"|"input", "need_rank": n} で返す。
--   主任(4)〜は、さらに「訂正履歴」が見える。
-- 他人の調査官名・IDは返さない（階級と信頼スコアのみ）。

-- 黒塗りの判定（内部用）
create function public._mask(p_need int, p_rank int, p_has boolean, p_val jsonb) returns jsonb
language sql immutable as $$
  select case
    when p_rank < p_need then jsonb_build_object('masked', true, 'reason', 'rank', 'need_rank', p_need)
    when not p_has then jsonb_build_object('masked', true, 'reason', 'input')
    else p_val
  end
$$;

create function public.shop_reviews(p_shop uuid, p_sort text default 'new', p_limit int default 20)
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
             d.taste_sweet, d.taste_salty, d.taste_sour, d.taste_bitter, d.taste_umami, d.taste_hot
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
           avg(d.taste_bitter) as t_bitter, avg(d.taste_umami) as t_umami, avg(d.taste_hot) as t_hot
      into a
      from visit v join visit_score s on s.visit_id = v.id left join dish d on d.visit_id = v.id
     where v.shop_id = p_shop and v.submitted_at is not null and v.inspector_id <> uid;
    summ := jsonb_build_object(
      'n', total,
      'satisfaction', _mask(2, rk, true,    jsonb_build_object('avg', round(a.sat, 1))),
      'price',        _mask(2, rk, h.price, jsonb_build_object('avg', round(a.price))),
      'wait',         _mask(2, rk, h.wait,  jsonb_build_object('avg', round(a.wait, 1))),
      'quiet',        _mask(2, rk, h.quiet, jsonb_build_object('avg', round(a.quiet, 1))),
      'taste',        _mask(2, rk, h.taste, jsonb_build_object('sweet', round(a.t_sweet, 1), 'salty', round(a.t_salty, 1), 'sour', round(a.t_sour, 1),
                                                               'bitter', round(a.t_bitter, 1), 'umami', round(a.t_umami, 1), 'hot', round(a.t_hot, 1))));
  end if;

  return jsonb_build_object(
    'viewer_rank', rk, 'scope', scope, 'sort', ord, 'limit', lim,
    'total', total, 'shown', jsonb_array_length(items), 'items', items, 'summary', summ);
end $$;

revoke execute on function public._mask(int, int, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.shop_reviews(uuid, text, int) from public, anon, authenticated;
grant execute on function public.shop_reviews(uuid, text, int) to authenticated;
