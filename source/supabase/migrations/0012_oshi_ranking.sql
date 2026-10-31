-- 推しの調査官・公開ランキング
--  ・調査官は、自分で「公開」をオンにしたときだけ、コードネームと実績が他の人に見える（初期値はオフ）
--  ・公開している調査官を「推し」に登録できる（1人20人まで）。推しが行った店を、さがす・ルーレット・ホームで優先する
--  ・ランキングは「ポイント順」と「推されている数」。公開している調査官だけが対象
--  ・返すのはコードネーム・公開ID・階級・ポイント・推されている数・調査件数だけ。個々の投稿の中身は返さない
--    （店ごとの評価は、これまでどおり shop_reviews で階級に応じて黒塗りされる）
--  ・アカウントを削除（凍結）すると、公開はオフになり、推しの関係はすべて消える

alter table public.inspector add column if not exists is_public boolean not null default false;

create table if not exists public.oshi (
  follower   uuid not null references public.inspector(id) on delete cascade,
  target     uuid not null references public.inspector(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, target),
  check (follower <> target)
);
create index if not exists oshi_target_idx on public.oshi (target);
alter table public.oshi enable row level security;       -- ポリシーなし = 直接は読み書きできない（関数からだけ）
revoke all on public.oshi from anon, authenticated;

create or replace function public._inspector_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'frozen' and old.status is distinct from 'frozen' then
    new.is_public := false;
    delete from oshi where follower = new.id or target = new.id;
  end if;
  return new;
end $$;
drop trigger if exists inspector_guard on public.inspector;
create trigger inspector_guard before update on public.inspector for each row execute function public._inspector_guard();

-- 公開中の調査官の一覧（内部用。閲覧者ごとの「推し済み」「自分」付き）
create or replace function public._insp_rows(viewer uuid)
returns table (id uuid, public_id text, codename text, rank int, rank_name text, ikp int, fans int, visits int, is_oshi boolean, is_me boolean)
language sql stable security definer set search_path = public as $$
  select i.id, i.public_id::text, i.codename::text, i.rank::int,
         (array['見習い','三等','二等','一等','主任','特別監察官'])[i.rank + 1],
         balance_of(i.id)::int,
         (select count(*) from oshi o join inspector f on f.id = o.follower and f.status = 'active' where o.target = i.id)::int,
         (select count(*) from visit v where v.inspector_id = i.id and v.submitted_at is not null)::int,
         exists (select 1 from oshi o where o.follower = viewer and o.target = i.id),
         i.id = viewer
    from inspector i
   where i.is_public and i.status = 'active'
$$;
revoke execute on function public._insp_rows(uuid) from public, anon, authenticated;

create or replace function public.set_public(p_public boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  update inspector set is_public = coalesce(p_public, false) where id = uid and status = 'active';
  if not found then raise exception 'no_inspector' using errcode = 'P0002'; end if;
  return public.my_public();
end $$;

create or replace function public.my_public() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); i inspector;
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  select * into i from inspector where id = uid and status = 'active';
  if not found then return null; end if;
  return jsonb_build_object(
    'is_public', i.is_public,
    'fans', (select count(*) from oshi o join inspector f on f.id = o.follower and f.status = 'active' where o.target = uid),
    'oshi_count', (select count(*) from oshi where follower = uid));
end $$;

create or replace function public.search_inspectors(p_q text, p_limit int default 20)
returns table (public_id text, codename text, rank int, rank_name text, ikp int, fans int, visits int, is_oshi boolean)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); q text := btrim(coalesce(p_q, ''));
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  if char_length(q) < 1 then return; end if;
  return query
    select r.public_id, r.codename, r.rank, r.rank_name, r.ikp, r.fans, r.visits, r.is_oshi
      from _insp_rows(uid) r
     where not r.is_me
       and lower(r.codename) like '%' || replace(replace(replace(lower(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
     order by r.ikp desc, r.codename
     limit least(50, greatest(1, coalesce(p_limit, 20)));
end $$;

-- p_kind: 'points'（ポイント順）／ 'fans'（推されている数）。pos は順位（同点は同順位）
create or replace function public.inspector_ranking(p_kind text default 'points', p_limit int default 50)
returns table (pos bigint, public_id text, codename text, rank int, rank_name text, ikp int, fans int, visits int, is_oshi boolean, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  if p_kind = 'fans' then
    return query
      select rank() over (order by r.fans desc), r.public_id, r.codename, r.rank, r.rank_name, r.ikp, r.fans, r.visits, r.is_oshi, r.is_me
        from _insp_rows(uid) r
       order by 1, r.ikp desc, r.codename
       limit least(100, greatest(1, coalesce(p_limit, 50)));
  else
    return query
      select rank() over (order by r.ikp desc), r.public_id, r.codename, r.rank, r.rank_name, r.ikp, r.fans, r.visits, r.is_oshi, r.is_me
        from _insp_rows(uid) r
       order by 1, r.fans desc, r.codename
       limit least(100, greatest(1, coalesce(p_limit, 50)));
  end if;
end $$;

create or replace function public.add_oshi(p_public_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t uuid;
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  if not exists (select 1 from inspector where id = uid and status = 'active') then raise exception 'no_inspector' using errcode = 'P0002'; end if;
  select id into t from inspector where public_id = upper(btrim(p_public_id)) and is_public and status = 'active';
  if t is null then raise exception 'oshi_not_found' using errcode = 'P0002'; end if;
  if t = uid then raise exception 'oshi_self' using errcode = '22023'; end if;
  if (select count(*) from oshi where follower = uid) >= 20 and not exists (select 1 from oshi where follower = uid and target = t) then
    raise exception 'oshi_limit' using errcode = '54000';
  end if;
  insert into oshi (follower, target) values (uid, t) on conflict do nothing;
  return public.my_public();
end $$;

create or replace function public.remove_oshi(p_public_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  delete from oshi where follower = uid and target = (select id from inspector where public_id = upper(btrim(p_public_id)));
  return public.my_public();
end $$;

-- 自分の推し（公開をやめた人は一覧から消える）
create or replace function public.my_oshi()
returns table (public_id text, codename text, rank int, rank_name text, ikp int, fans int, visits int, is_oshi boolean)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  return query
    select r.public_id, r.codename, r.rank, r.rank_name, r.ikp, r.fans, r.visits, r.is_oshi
      from _insp_rows(uid) r
     where r.is_oshi
     order by r.ikp desc, r.codename;
end $$;

-- 推しが調査した店（店ごとに、行った推しのコードネームと最後の調査日）
create or replace function public.oshi_shops()
returns table (shop_id uuid, names text[], last_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  return query
    select v.shop_id, array_agg(distinct i.codename::text order by i.codename::text), max(v.submitted_at)
      from oshi o
      join inspector i on i.id = o.target and i.is_public and i.status = 'active'
      join visit v on v.inspector_id = o.target and v.submitted_at is not null
     where o.follower = uid
     group by v.shop_id;
end $$;

revoke execute on function public.set_public(boolean), public.my_public(), public.search_inspectors(text, int),
  public.inspector_ranking(text, int), public.add_oshi(text), public.remove_oshi(text), public.my_oshi(), public.oshi_shops()
  from public, anon, authenticated;
grant execute on function public.set_public(boolean), public.my_public(), public.search_inspectors(text, int),
  public.inspector_ranking(text, int), public.add_oshi(text), public.remove_oshi(text), public.my_oshi(), public.oshi_shops()
  to authenticated;
