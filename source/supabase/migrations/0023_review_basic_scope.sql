-- 見習いも、行っていない店の評価を読めるようにする（自分の階級の項目だけ）。
--  ・以前: 見習いは、自分が投稿した店の評価だけ読めた（行っていない店は件数だけ = scope 'locked'）。
--  ・今: どの店でも、新しい順に5件まで読める（scope 'basic'）。読める項目は、自分の階級までで、それより上の項目は黒塗り。
--  ・三級以上の読める範囲（30日・全期間）は変えない。
-- すでにある関数の定義から作り直す（1か所の置き換え）。
do $apply$
declare
  def text;
begin
  select pg_get_functiondef('public.shop_reviews(uuid,text,integer)'::regprocedure) into def;
  def := replace(def, $x$scope := case when own_visit then 'own_shop' else 'locked' end;$x$, $y$scope := 'basic';$y$);
  if position($z$scope := 'basic';$z$ in def) = 0 then
    raise exception 'shop_reviews: replacement failed';
  end if;
  execute def;
end $apply$;
