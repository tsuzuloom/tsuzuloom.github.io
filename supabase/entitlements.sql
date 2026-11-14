-- プレミアム（有料機能）の権利
-- 本人は「読むだけ」。書き換えはサーバー側（将来は課金の通知を受ける処理）か、ダッシュボードからだけ。

create table if not exists public.entitlements (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  premium    boolean not null default false,
  source     text,                         -- 'owner'（運営者本人）/ 'appstore' など
  expires_at timestamptz,                  -- null = 期限なし
  updated_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;

drop policy if exists "entitlements_select_own" on public.entitlements;
create policy "entitlements_select_own" on public.entitlements
  for select to authenticated using (auth.uid() = user_id);
-- insert / update / delete のポリシーは作らない（本人が自分をプレミアムにできないように）

-- 運営者本人のアカウントをプレミアムにする（テスト用）
-- insert into public.entitlements (user_id, premium, source)
-- select id, true, 'owner' from auth.users where email = '<運営者のメールアドレス>'
-- on conflict (user_id) do update set premium = true, source = 'owner', updated_at = now();
