-- A library snapshot keeps local-first writes atomic. Entry/front progress and
-- stars remain separate keys inside state; mixed and starred are never dimensions.
create table public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint state_object check (jsonb_typeof(state) = 'object'),
  constraint state_fields check (state ?& array['folders','sets','entries','progress','stars']),
  constraint state_bounded check (octet_length(state::text) <= 8388608),
  constraint state_folders check (jsonb_typeof(state->'folders') = 'array'),
  constraint state_sets check (jsonb_typeof(state->'sets') = 'array'),
  constraint state_entries check (jsonb_typeof(state->'entries') = 'array'),
  constraint state_progress check (jsonb_typeof(state->'progress') = 'object'),
  constraint state_stars check (jsonb_typeof(state->'stars') = 'object')
);
alter table public.user_state enable row level security;
create policy "Read own library" on public.user_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own library" on public.user_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own library" on public.user_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own library" on public.user_state for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.user_state from anon;
grant select, insert, update, delete on public.user_state to authenticated;

-- Optimistic concurrency prevents a stale offline device overwriting newer work.
-- SECURITY INVOKER preserves RLS; no service-role key is used by the application.
create function public.save_user_state(new_state jsonb, expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare current_revision bigint; saved public.user_state;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  -- Serialize creation as well as update for one owner.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select revision into current_revision from public.user_state where user_id = auth.uid() for update;
  if current_revision is distinct from expected_revision then raise exception 'sync_conflict'; end if;
  insert into public.user_state (user_id, state) values (auth.uid(), new_state)
  on conflict (user_id) do update set state = excluded.state, revision = user_state.revision + 1, updated_at = now()
  returning * into saved;
  return jsonb_build_object('updated_at', saved.updated_at, 'revision', saved.revision);
end;
$$;
revoke all on function public.save_user_state(jsonb, bigint) from public, anon;
grant execute on function public.save_user_state(jsonb, bigint) to authenticated;
