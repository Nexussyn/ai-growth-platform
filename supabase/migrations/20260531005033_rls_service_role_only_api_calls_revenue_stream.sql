/*
  # Service-role-only RLS for api_calls and revenue_stream

  Both tables lack a user_id column, so ownership-based policies are not possible.
  All access is locked to service_role, meaning only the edge function (using the
  service key) can read or write these tables.

  1. Drops all existing policies on both tables (cleanup)
  2. Enables RLS on both tables
  3. api_calls — service_role only: SELECT, INSERT, UPDATE, DELETE
  4. revenue_stream — service_role only: SELECT, INSERT, UPDATE, DELETE
*/

-- Drop all existing policies
drop policy if exists "RLS Policy Always True" on public.api_calls;
drop policy if exists "RLS Policy Always True" on public.revenue_stream;
drop policy if exists "api_calls_select_own" on public.api_calls;
drop policy if exists "api_calls_insert_own" on public.api_calls;
drop policy if exists "api_calls_update_own" on public.api_calls;
drop policy if exists "api_calls_delete_own" on public.api_calls;
drop policy if exists "revenue_stream_select_own" on public.revenue_stream;
drop policy if exists "revenue_stream_insert_own" on public.revenue_stream;
drop policy if exists "revenue_stream_update_admin" on public.revenue_stream;
drop policy if exists "revenue_stream_delete_admin" on public.revenue_stream;

-- Enable RLS
alter table public.api_calls enable row level security;
alter table public.revenue_stream enable row level security;

-- api_calls: service_role only
create policy "api_calls_service_role_select"
  on public.api_calls
  for select
  using (auth.role() = 'service_role');

create policy "api_calls_service_role_insert"
  on public.api_calls
  for insert
  with check (auth.role() = 'service_role');

create policy "api_calls_service_role_update"
  on public.api_calls
  for update
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "api_calls_service_role_delete"
  on public.api_calls
  for delete
  using (auth.role() = 'service_role');

-- revenue_stream: service_role only
create policy "revenue_stream_service_role_select"
  on public.revenue_stream
  for select
  using (auth.role() = 'service_role');

create policy "revenue_stream_service_role_insert"
  on public.revenue_stream
  for insert
  with check (auth.role() = 'service_role');

create policy "revenue_stream_service_role_update"
  on public.revenue_stream
  for update
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "revenue_stream_service_role_delete"
  on public.revenue_stream
  for delete
  using (auth.role() = 'service_role');
