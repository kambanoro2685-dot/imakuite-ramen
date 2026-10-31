-- 店の出どころ（source）を検索結果に添える。
--  ・osm: 取り込んだラーメン店のデータ ／ inspector: 調査官が追加した店（ラーメン専門店でない店を含む）
--  ・ルーレットを、ラーメンの店だけにするために使う
--  ・search_shops: source も返す

drop function if exists public.search_shops(double precision, double precision, int, text, text, int);

create function public.search_shops(
  p_lat double precision, p_lng double precision, p_radius_m int default 1500,
  p_q text default null, p_genre text default null, p_limit int default 50
)
returns table (id uuid, name text, lat double precision, lng double precision, genre text, url text,
               review_count int, distance_m int, rank_counts int[],
               soup_top text, richness_avg numeric, thick_top text, type_top text, toppings_top text[], source text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name::text, s.lat, s.lng, s.genre::text, s.url::text,
         case when c.n >= 3 then c.n::int end,
         round(d.m)::int,
         case when c.n >= 3 then c.ranks end,
         case when c.n >= 3 then rp.soup_top end,
         case when c.n >= 3 then rp.rich end,
         case when c.n >= 3 then rp.thick_top end,
         case when c.n >= 3 then rp.type_top end,
         case when c.n >= 3 then rp.toppings_top end,
         s.source::text
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
              group by x.noodle_thick order by count(*) desc, x.noodle_thick limit 1) as thick_top,
            (select x.noodle_type from dish x join visit v on v.id = x.visit_id
              where v.shop_id = s.id and v.submitted_at is not null and x.noodle_type is not null
              group by x.noodle_type order by count(*) desc, x.noodle_type limit 1) as type_top,
            -- いちばん多いトッピング（上位3つ）。toppings は「味玉,チャーシュー」のようなカンマ区切り
            (select array_agg(t.name order by t.n desc, t.name)
               from (select btrim(tn) as name, count(*) as n
                       from dish x join visit v on v.id = x.visit_id,
                            unnest(string_to_array(x.toppings, ',')) as tn
                      where v.shop_id = s.id and v.submitted_at is not null and x.toppings is not null and btrim(tn) <> ''
                      group by btrim(tn) order by count(*) desc, btrim(tn) limit 3) t) as toppings_top) rp
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
