-- 見本データ（demo_200.sql）を全部消す。
-- 見本の調査官（公開ID が IKS- で始まる人）を消すと、投稿（来店・皿・評価）・ポイント・推しの関係・プロフィールも連鎖して消える。
-- 本物の利用者（IKI-…）には影響しない。
delete from public.inspector where public_id like 'IKS-%';
