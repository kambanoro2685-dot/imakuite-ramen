-- 店舗マスタ（OpenStreetMap 由来）を、ログイン前でも検索・地図表示できるようにする。
--  ・shop に osm_id を追加（再取り込みで重複させないため）
--  ・search_shops を、未ログイン(anon)にも開放し、件数の上限(p_limit)を指定できるようにする
--    （返すのは公開情報の店舗名・位置・ジャンルと、3件以上のときだけの評価件数）

alter table public.shop add column if not exists osm_id text unique;

drop function if exists public.search_shops(double precision, double precision, int, text, text);

create function public.search_shops(
  p_lat double precision, p_lng double precision, p_radius_m int default 1500,
  p_q text default null, p_genre text default null, p_limit int default 50
)
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
