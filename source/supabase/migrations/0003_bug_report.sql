-- 不具合・要望の報告。誰でも（ログイン前でも）送れるが、読めるのは運営（Table Editor / SQL）だけ。
-- 連絡先は集めない。ログイン中なら調査官IDだけ紐づく。

create table public.bug_report (
  id           bigint generated always as identity primary key,
  inspector_id uuid references public.inspector(id) on delete set null,
  category     text not null check (category in ('bug', 'request', 'other')),
  message      text not null check (char_length(message) between 1 and 2000),
  screen       varchar(30),
  build        varchar(30),
  user_agent   varchar(300),
  status       text not null default 'open' check (status in ('open', 'triaged', 'closed')),
  created_at   timestamptz not null default now()
);
create index on public.bug_report (status, created_at);

alter table public.bug_report enable row level security;
revoke all on public.bug_report from anon, authenticated;   -- 直接の読み書きは不可（ポリシーも作らない）

create function public.submit_bug_report(
  p_category text, p_message text, p_screen text default null, p_build text default null, p_user_agent text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m text := btrim(coalesce(p_message, '')); recent int; who uuid;
begin
  if p_category is null or p_category not in ('bug', 'request', 'other') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if char_length(m) < 1 or char_length(m) > 2000 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  -- 連投対策: ログイン中は1日10件、未ログインは全体で1時間30件まで
  if uid is not null then
    select count(*) into recent from bug_report where inspector_id = uid and created_at > now() - interval '1 day';
    if recent >= 10 then raise exception 'rate_limited' using errcode = '53400'; end if;
  else
    select count(*) into recent from bug_report where inspector_id is null and created_at > now() - interval '1 hour';
    if recent >= 30 then raise exception 'rate_limited' using errcode = '53400'; end if;
  end if;
  select id into who from inspector where id = uid and status = 'active';
  insert into bug_report (inspector_id, category, message, screen, build, user_agent)
  values (who, p_category, m, left(p_screen, 30), left(p_build, 30), left(p_user_agent, 300));
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.submit_bug_report(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_bug_report(text, text, text, text, text) to anon, authenticated;
