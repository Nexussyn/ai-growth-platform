/*
  # Drop legacy always-true RLS policies

  Two policies created before the service-role lockdown remain active and grant
  unrestricted access to authenticated users, bypassing RLS entirely.

  1. api_calls — drops "Authenticated users can insert api calls" (INSERT, WITH CHECK true)
  2. revenue_stream — drops "Authenticated users can manage revenue stream" (ALL, always true)
*/

drop policy if exists "Authenticated users can insert api calls" on public.api_calls;
drop policy if exists "Authenticated users can manage revenue stream" on public.revenue_stream;
