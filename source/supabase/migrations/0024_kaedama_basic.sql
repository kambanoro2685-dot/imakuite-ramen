-- 替え玉の有無を、見習いから入力・閲覧できるようにする。
--  ・以前は「濃さ・麺」の組の一部（三級から）だった。
--  ・今は独立した項目 'kaedama'（見習いから）。「濃さ・麺」（三級から）には含めない。
-- すでにある関数の定義から作り直す（置き換え3か所）。
do $apply$
declare
  def text;
begin
  select pg_get_functiondef('public.shop_reviews(uuid,text,integer)'::regprocedure) into def;
  def := replace(def, $x$    coalesce(bool_or(d.toppings is not null), false) as toppings,$x$,
    $y$    coalesce(bool_or(d.toppings is not null), false) as toppings,
    coalesce(bool_or(d.kaedama is not null), false) as kaedama,$y$);
  def := replace(def, $x$'noodle_type', r.noodle_type, 'kaedama', r.kaedama)),$x$,
    $y$'noodle_type', r.noodle_type)),
        'kaedama',  _mask(0, rk, h.kaedama,  jsonb_build_object('kaedama', r.kaedama)),$y$);
  if position($z$as kaedama,$z$ in def) = 0 or position($z$'kaedama',  _mask(0$z$ in def) = 0 then
    raise exception 'shop_reviews: replacement failed';
  end if;
  execute def;
end $apply$;
