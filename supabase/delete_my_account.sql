-- アカウント削除用の関数
-- Supabase ダッシュボード → SQL Editor にこのファイルの中身を貼り付けて「Run」してください（1回だけでOK）。
-- ログイン中のユーザー本人のデータ（stories / user_meta）とアカウントを削除します。
-- 画像（Storage）はアプリ側で先に削除します。

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  delete from public.stories   where user_id = me;
  delete from public.user_meta where user_id = me;
  delete from auth.users       where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 自分のフォルダ（<ユーザーID>/...）の画像を、本人が削除できるようにするポリシー
drop policy if exists "tl_delete_own_images" on storage.objects;
create policy "tl_delete_own_images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'character-images' and (storage.foldername(name))[1] = auth.uid()::text);
