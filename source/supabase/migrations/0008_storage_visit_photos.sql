-- 写真の保存先（Supabase Storage）: 公開バケット visit-photos。
--  ・読み取り: 公開URLで誰でも（ファイル名は推測できない乱数）
--  ・書き込み・削除: ログイン中の本人が、自分のフォルダ（<自分のID>/…）にだけ
--  ・1ファイル 1MB まで、WebP / JPEG のみ（アプリが端末で縮小・再エンコードして位置情報(EXIF)を除去してから送る）
-- 注意: 顔のぼかしはまだ実装していない。人の顔が写らないように撮影してもらう。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visit-photos', 'visit-photos', true, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy visit_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy visit_photos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy visit_photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = auth.uid()::text);
