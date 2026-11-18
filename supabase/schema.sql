-- Portfolio: Supabase schema
--
-- Run this once in the SQL editor of your Supabase project. It is safe to run again.
--
-- BEFORE you run it: replace the address on the "insert into public.team_login" line
-- near the bottom with the e-mail of the single team user you create under
-- Authentication -> Users (the one whose password is the shared team password).
--
-- Access model: one shared team password. The app signs in as that one user. Only that
-- e-mail address may read or write, so somebody who signs up on their own gets nothing.

-- ---------------------------------------------------------------------------
-- Data: one row per person, project, allocation and PhD.
-- "data" holds the record exactly as the app uses it; "pos" keeps the order.
-- ---------------------------------------------------------------------------
create table if not exists public.people (
  id text primary key,
  data jsonb not null,
  pos integer not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.projects (
  id text primary key,
  data jsonb not null,
  pos integer not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.assignments (
  id text primary key,
  data jsonb not null,
  pos integer not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.phds (
  id text primary key,
  data jsonb not null,
  pos integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['people', 'projects', 'assignments', 'phds'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Who may get in: the e-mail of the one team user.
-- ---------------------------------------------------------------------------
create table if not exists public.team_login (email text primary key);
alter table public.team_login enable row level security; -- no policies: not readable from the app

create or replace function public.is_team() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_login where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

do $$
declare t text;
begin
  foreach t in array array['people', 'projects', 'assignments', 'phds'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists team_only on public.%I', t);
    execute format('create policy team_only on public.%I for all to authenticated using (public.is_team()) with check (public.is_team())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Live updates, so everyone sees each other's changes.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['people', 'projects', 'assignments', 'phds'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- REPLACE THIS ADDRESS with the e-mail of your team user, then run the file.
-- ---------------------------------------------------------------------------
insert into public.team_login (email) values ('portfolio-team@example.org') on conflict do nothing;
