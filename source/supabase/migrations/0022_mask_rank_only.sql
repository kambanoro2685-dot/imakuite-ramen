-- 黒塗りは「階級が足りない項目」だけにする。
--  ・以前は「自分が一度も入力していない項目」も黒塗りだった（reason = 'input'）。これをやめる。
--  ・自分の階級で入力できる項目は、自分が入力していなくても、他の調査官の分が見える。
--  ・階級が足りない項目だけが、「██████（◯級から）」になる。
-- _mask の引数 p_has は、呼び出し側（shop_reviews）を変えずに済むよう残してあるが、もう使わない。

create or replace function public._mask(p_need int, p_rank int, p_has boolean, p_val jsonb) returns jsonb
language sql immutable as $$
  select case
    when p_rank < p_need then jsonb_build_object('masked', true, 'reason', 'rank', 'need_rank', p_need)
    else p_val
  end
$$;
