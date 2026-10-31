-- 0021_fields_points.sql を、すでにある関数の定義から作り直して適用する（Supabase の SQL エディタに貼る用。結果は 0021 と同じ）。
-- submit_visit: ポイントの組み立て部分を、新しい表に置き換える
-- shop_reviews: 入力と同じ階級で見えるように、5か所を置き換える
do $apply$
declare
  def text;
  a int;
  b int;
  blk text := $blk$  -- ポイントは「組」ごと（アプリの POINT_RULES と同じ表）。上の階級の組は、その階級になってから
  items := items || jsonb_build_object('kind','quick_report','label','基本提出','amount',10);
  if n_dish > 0 then items := items || jsonb_build_object('kind','dish_card','label','一杯カード','amount', 8 * least(n_dish, 5)); end if;
  if prior = 0 then items := items || jsonb_build_object('kind','first_visit_bonus','label','自分は未踏の店','amount',30); end if;
  if n_photo > 0 then items := items || jsonb_build_object('kind','photo','label','写真','amount', 5 * least(3, n_photo)); end if;

  -- 見習いから
  if exists (select 1 from dish where visit_id = v.id and soup is not null) then
    items := items || jsonb_build_object('kind','ramen_soup','label','スープの系統','amount',5);
  end if;
  if exists (select 1 from dish where visit_id = v.id and price_yen is not null and volume is not null)
     and char_length(btrim(coalesce(v.comment, ''))) >= 5 then
    items := items || jsonb_build_object('kind','basic_record','label','基本の記録（価格・量・感想）','amount',8);
  end if;
  if exists (select 1 from dish where visit_id = v.id and toppings is not null) then
    items := items || jsonb_build_object('kind','ramen_toppings','label','トッピング','amount',3);
  end if;

  -- 三級から
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
    if v.party_size is not null and v.mood is not null then
      items := items || jsonb_build_object('kind','visit_info','label','来店の状況（人数・気分）','amount',3);
    end if;
    if exists (select 1 from dish where visit_id = v.id and richness is not null and noodle_thick is not null and noodle_firm is not null) then
      items := items || jsonb_build_object('kind','ramen_noodle','label','濃さ・麺の太さと硬さ','amount',8);
    end if;
    if exists (select 1 from dish where visit_id = v.id and base_items is not null) then
      items := items || jsonb_build_object('kind','ramen_items','label','デフォルトの具材','amount',6);
    end if;
    if exists (select 1 from dish where visit_id = v.id and (sides is not null or removed_items is not null or disliked_items is not null)) then
      items := items || jsonb_build_object('kind','ramen_extras','label','付け合わせ・抜いた具材・嫌いな具材','amount',3);
    end if;
  end if;

  -- 二級から
  if rk >= 2 then
    if n_taste >= 3 then items := items || jsonb_build_object('kind','taste_analysis','label','スープの味の分析','amount',8); end if;
    if s.service is not null and s.serve_speed_min is not null then
      items := items || jsonb_build_object('kind','service_info','label','接客・提供時間','amount',5);
    end if;
  end if;

  -- 一級から
  if rk >= 3 then
    if s.aroma is not null and s.texture is not null and s.temperature is not null and s.presentation is not null then
      items := items || jsonb_build_object('kind','quality_4','label','品質4項目','amount',10);
    end if;
    if s.crowdedness is not null and s.payment_methods is not null and s.smoking is not null then
      items := items || jsonb_build_object('kind','facility_info','label','設備・支払い','amount',6);
    end if;
  end if;

  -- 主任から
  if rk >= 4 then
    if s.noise_db is not null then
      items := items || jsonb_build_object('kind','noise_measured','label','騒音の測定','amount',5);
    end if;
    if v.mood_tags is not null or exists (select 1 from dish where visit_id = v.id and (is_pick or tax_included is not null)) then
      items := items || jsonb_build_object('kind','chief_extra','label','推し一杯・価格の表記・来店の目的','amount',3);
    end if;
  end if;

$blk$;
begin
  -- submit_visit
  select pg_get_functiondef('public.submit_visit(uuid)'::regprocedure) into def;
  a := position($m$  items := items || jsonb_build_object('kind','quick_report'$m$ in def);
  b := position($m$  for it in select * from jsonb_to_recordset(items)$m$ in def);
  if a = 0 or b = 0 then raise exception 'submit_visit: markers not found'; end if;
  def := substr(def, 1, a - 1) || blk || substr(def, b);
  execute def;

  -- shop_reviews
  select pg_get_functiondef('public.shop_reviews(uuid,text,integer)'::regprocedure) into def;
  def := replace(def, $x$    coalesce(bool_or(d.toppings is not null or d.base_items is not null or d.sides is not null), false) as items,$x$,
    $y$    coalesce(bool_or(d.toppings is not null), false) as toppings,
    coalesce(bool_or(d.base_items is not null or d.sides is not null), false) as items,
    coalesce(bool_or(v.mood_tags is not null or d.is_pick or d.tax_included is not null), false) as extra,$y$);
  def := replace(def, $x$d.soup, d.richness, d.noodle_thick, d.noodle_firm, d.noodle_type, d.toppings, d.base_items, d.sides, d.kaedama$x$,
    $y$d.soup, d.richness, d.noodle_thick, d.noodle_firm, d.noodle_type, d.toppings, d.base_items, d.sides, d.kaedama,
             v.mood_tags, d.is_pick, d.tax_included$y$);
  def := replace(def, $x$'party',    _mask(0, rk, h.party,$x$, $y$'party',    _mask(1, rk, h.party,$y$);
  def := replace(def, $x$        'items',    _mask(0, rk, h.items,    jsonb_build_object('base_items', r.base_items, 'toppings', r.toppings, 'sides', r.sides)),$x$,
    $y$        'toppings', _mask(0, rk, h.toppings, jsonb_build_object('toppings', r.toppings)),
        'items',    _mask(1, rk, h.items,    jsonb_build_object('base_items', r.base_items, 'sides', r.sides)),
        'extra',    _mask(4, rk, h.extra,    jsonb_build_object('mood_tags', r.mood_tags, 'is_pick', r.is_pick, 'tax_included', r.tax_included)),$y$);
  if position($z$'extra',    _mask(4$z$ in def) = 0 or position($z$'party',    _mask(1$z$ in def) = 0 or position($z$as extra,$z$ in def) = 0 then
    raise exception 'shop_reviews: replacement failed';
  end if;
  execute def;
end $apply$;
