-- 利用規約・プライバシーポリシーへの同意の記録（どの版に、いつ同意したか）。
-- 規約の版（アプリの TERMS_VERSION）が変わると、アプリが再同意を求める。
-- 本人だけが記録でき（accept_terms）、直接の読み書きはできない。

create table public.terms_acceptance (
  inspector_id uuid not null references public.inspector(id) on delete cascade,
  version      text not null check (char_length(version) between 1 and 20),
  accepted_at  timestamptz not null default now(),
  primary key (inspector_id, version)
);
alter table public.terms_acceptance enable row level security;
revoke all on public.terms_acceptance from anon, authenticated;

create function public.accept_terms(p_version text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  if not exists (select 1 from inspector where id = uid and status = 'active') then
    raise exception 'not_registered' using errcode = '42501';
  end if;
  if p_version is null or p_version !~ '^[0-9A-Za-z._-]{1,20}$' then
    raise exception 'invalid_version' using errcode = '22023';
  end if;
  insert into terms_acceptance (inspector_id, version) values (uid, p_version) on conflict do nothing;
  return jsonb_build_object('ok', true, 'version', p_version);
end $$;

revoke execute on function public.accept_terms(text) from public, anon, authenticated;
grant execute on function public.accept_terms(text) to authenticated;

-- me(): 最後に同意した規約の版を返す（別の端末でログインしたとき、再同意が要るかの判定に使う）
create or replace function public.me() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); i inspector; bal int; r int; p inspector_profile; tv text;
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  select * into i from inspector where id = uid;
  if not found or i.status = 'frozen' then return null; end if;
  bal := balance_of(uid);
  r := refresh_rank(uid);
  select * into p from inspector_profile where inspector_id = uid;
  select version into tv from terms_acceptance where inspector_id = uid order by accepted_at desc, version desc limit 1;
  return jsonb_build_object(
    'public_id', i.public_id, 'codename', i.codename, 'trust_score', i.trust_score,
    'ikp', bal, 'rank', r, 'terms_version', tv,
    'profile', jsonb_build_object('gender', coalesce(p.gender, 'unspecified'), 'age_band', p.age_band,
                                  'nationality', p.nationality, 'height_bucket_cm', p.height_bucket_cm));
end $$;

revoke execute on function public.me() from public, anon, authenticated;
grant execute on function public.me() to authenticated;

-- アカウント削除: 同意の記録も消す（0007 の内容 + terms_acceptance）
create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  update inspector set status = 'frozen', codename = '削除済み-' || right(replace(uid::text, '-', ''), 8) where id = uid;
  delete from photo where visit_id in (select id from visit where inspector_id = uid);
  delete from terms_acceptance where inspector_id = uid;
  delete from inspector_profile where inspector_id = uid;
  delete from body_log where inspector_id = uid;
  delete from auth.users where id = uid;
end $$;

revoke execute on function public.delete_account() from public, anon, authenticated;
grant execute on function public.delete_account() to authenticated;
