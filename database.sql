-- 个人经营工作台 V2.0：在 Supabase 项目 SQL Editor 中执行一次。
-- 使用 PostgreSQL Row Level Security：只有登录用户可以访问自己的整份账本。
-- 注意：不要把 service_role / sb_secret_* 密钥放到网页里。

create table if not exists public.business_desks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

alter table public.business_desks enable row level security;

revoke all privileges on table public.business_desks from anon, authenticated;
grant select, insert, update on table public.business_desks to authenticated;

-- 各项操作分别授权，且仅允许访问当前登录账号对应的一行。
drop policy if exists desk_select_own on public.business_desks;
create policy desk_select_own on public.business_desks
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists desk_insert_own on public.business_desks;
create policy desk_insert_own on public.business_desks
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists desk_update_own on public.business_desks;
create policy desk_update_own on public.business_desks
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- 不开放匿名读写和客户端直接删除。
-- 客户端通过 revision 条件更新来检测来自其他设备的冲突。
