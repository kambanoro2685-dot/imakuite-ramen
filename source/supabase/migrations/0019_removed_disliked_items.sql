-- 嫌いな具材・抜いてもらった具材の入力。
--  ・dish.removed_items: 抜いてもらった具材（この一杯で抜いたもの。カンマ区切り）
--  ・dish.disliked_items: 嫌いな具材（苦手なもの。カンマ区切り）
--  ・0017 の「ラーメン以外の品目は入力できない」決まりを、この2つにも広げる

alter table public.dish
  add column if not exists removed_items  varchar(200),
  add column if not exists disliked_items varchar(200);

alter table public.dish drop constraint if exists dish_ramen_only;
alter table public.dish add constraint dish_ramen_only check (
  (coalesce(name, '') || ' ' || coalesce(toppings, '') || ' ' || coalesce(base_items, '') || ' ' || coalesce(sides, '')
   || ' ' || coalesce(removed_items, '') || ' ' || coalesce(disliked_items, ''))
  !~ '(定食|ご飯|ごはん|ゴハン|ライス|らいす|白飯|炒飯|チャーハン|ちゃーはん|焼飯|焼き飯|餃子|ぎょうざ|ギョウザ|ギョーザ|ぎょーざ)'
);
