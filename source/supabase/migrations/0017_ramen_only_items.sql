-- 具材・付け合わせの入力と、「ラーメン以外の品目は入力できない」決まり。
--  ・dish.base_items: デフォルトの具材（最初から丼に乗っているもの。カンマ区切り）
--  ・dish.sides: 付け合わせ（薬味・卓上の味付けなど。カンマ区切り）
--  ・品名・具材・トッピング・付け合わせに、定食・ご飯（ライス）・チャーハン・餃子を入れられない（アプリと同じ決まり）

alter table public.dish
  add column if not exists base_items varchar(200),
  add column if not exists sides      varchar(200);

alter table public.dish drop constraint if exists dish_ramen_only;
alter table public.dish add constraint dish_ramen_only check (
  (coalesce(name, '') || ' ' || coalesce(toppings, '') || ' ' || coalesce(base_items, '') || ' ' || coalesce(sides, ''))
  !~ '(定食|ご飯|ごはん|ゴハン|ライス|らいす|白飯|炒飯|チャーハン|ちゃーはん|焼飯|焼き飯|餃子|ぎょうざ|ギョウザ|ギョーザ|ぎょーざ)'
);
