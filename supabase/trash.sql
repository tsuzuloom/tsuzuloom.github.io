-- 作品のゴミ箱
-- deleted_at が入っている作品はゴミ箱にある扱い。30日たったものは毎日自動で完全削除する。

alter table public.stories add column if not exists deleted_at timestamptz;
create index if not exists stories_user_deleted_idx on public.stories (user_id, deleted_at);

-- 毎日 18:00 UTC（日本時間 3:00）に、ゴミ箱に入れて30日たった作品を削除
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'tl_purge_trash';
select cron.schedule(
  'tl_purge_trash',
  '0 18 * * *',
  $$delete from public.stories where deleted_at is not null and deleted_at < now() - interval '30 days'$$
);
