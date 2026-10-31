-- 階級に応じて解放される詳細項目に点数をつけ、階級が足りない項目には加点しない。
-- （クライアントは階級に応じて入力欄を出し分けるが、画面を迂回して書き込まれても加点されないようにサーバで守る）
--
--   見習い(0): 基本提出・皿カード・初訪問
--   三等(1)  : 清掃5項目 +15 / 環境（静かさ＋待ち時間）+10 / 体調（空腹＋満腹）+6
--   二等(2)  : 味の分析（3味以上）+8 / 接客情報（接客＋提供時間）+5
--   一等(3)  : 品質4項目 +10 / 設備情報（混み具合＋支払い＋喫煙）+6
--   主任(4)  : 騒音の測定 +5

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

  -- 見習いから
  items := items || jsonb_build_object('kind','quick_report','label','基本提出','amount',10);
  if n_photo > 1 then items := items || jsonb_build_object('kind','photo_extra','label','写真追加','amount', 5 * least(2, n_photo - 1)); end if;
  if n_dish > 0 then items := items || jsonb_build_object('kind','dish_card','label','皿カード','amount', 8 * least(n_dish, 5)); end if;
  if prior = 0 then items := items || jsonb_build_object('kind','first_visit_bonus','label','自分は未踏の店','amount',30); end if;

  -- 三等から
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

  -- 二等から
  if rk >= 2 then
    if n_taste >= 3 then items := items || jsonb_build_object('kind','taste_analysis','label','味の分析','amount',8); end if;
    if s.service is not null and s.serve_speed_min is not null then
      items := items || jsonb_build_object('kind','service_info','label','接客・提供時間','amount',5);
    end if;
  end if;

  -- 一等から
  if rk >= 3 then
    if s.aroma is not null and s.texture is not null and s.temperature is not null and s.presentation is not null then
      items := items || jsonb_build_object('kind','quality_4','label','品質4項目','amount',10);
    end if;
    if s.crowdedness is not null and s.payment_methods is not null and s.smoking is not null then
      items := items || jsonb_build_object('kind','facility_info','label','設備・支払い','amount',6);
    end if;
  end if;

  -- 主任から
  if rk >= 4 and s.noise_db is not null then
    items := items || jsonb_build_object('kind','noise_measured','label','騒音の測定','amount',5);
  end if;

  for it in select * from jsonb_to_recordset(items) as x(kind text, amount int) loop
    perform award(uid, it.amount, it.kind, 'visit', v.id);
    total := total + it.amount;
  end loop;
  r := refresh_rank(uid);
  return jsonb_build_object('visit_id', v.id, 'breakdown', items, 'total', total, 'ikp', balance_of(uid), 'rank', r);
end $$;

revoke execute on function public.submit_visit(uuid) from public, anon, authenticated;
grant execute on function public.submit_visit(uuid) to authenticated;
