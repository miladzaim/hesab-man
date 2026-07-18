create table if not exists public.cloud_states (user_id uuid primary key references auth.users(id) on delete cascade,payload jsonb not null default '{}'::jsonb,updated_at timestamptz not null default now());
alter table public.cloud_states enable row level security;
grant usage on schema public to authenticated;
grant select,insert,update,delete on public.cloud_states to authenticated;
drop policy if exists cloud_states_select_own on public.cloud_states;create policy cloud_states_select_own on public.cloud_states for select to authenticated using(auth.uid()=user_id);
drop policy if exists cloud_states_insert_own on public.cloud_states;create policy cloud_states_insert_own on public.cloud_states for insert to authenticated with check(auth.uid()=user_id);
drop policy if exists cloud_states_update_own on public.cloud_states;create policy cloud_states_update_own on public.cloud_states for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists cloud_states_delete_own on public.cloud_states;create policy cloud_states_delete_own on public.cloud_states for delete to authenticated using(auth.uid()=user_id);
