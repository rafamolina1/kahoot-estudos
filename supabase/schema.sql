create table if not exists public.simulations (
  id uuid primary key,
  owner_hash text not null check (length(owner_hash) = 64),
  subject text not null,
  difficulty text not null,
  question_count integer not null check (question_count between 1 and 50),
  source_simulation_id uuid references public.simulations(id),
  material_used boolean not null default false,
  demo boolean not null default false,
  questions jsonb not null,
  answers jsonb,
  correct_count integer,
  wrong_count integer,
  unanswered_count integer,
  percent integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists simulations_owner_completed_idx on public.simulations (owner_hash, completed_at desc);
create unique index if not exists simulations_open_retry_idx on public.simulations (owner_hash, source_simulation_id)
  where source_simulation_id is not null and completed_at is null;

create table if not exists public.generation_events (
  id bigint generated always as identity primary key,
  owner_hash text not null check (length(owner_hash) = 64),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists generation_events_owner_created_idx on public.generation_events (owner_hash, created_at desc);

alter table public.simulations enable row level security;
alter table public.generation_events enable row level security;
revoke all on public.simulations from anon, authenticated;
revoke all on public.generation_events from anon, authenticated;

create or replace function public.reserve_generation(p_owner_hash text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare reservation_id bigint;
begin
  if p_owner_hash !~ '^[a-f0-9]{64}$' then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner_hash, 0));
  if exists (
    select 1 from public.generation_events
    where owner_hash = p_owner_hash and finished_at is null and created_at > now() - interval '4 minutes'
  ) then return null; end if;
  if (
    select count(*) from public.generation_events
    where owner_hash = p_owner_hash and created_at > now() - interval '1 minute'
  ) >= 3 then return null; end if;
  insert into public.generation_events (owner_hash) values (p_owner_hash) returning id into reservation_id;
  return reservation_id;
end;
$$;

revoke all on function public.reserve_generation(text) from public, anon, authenticated;
grant execute on function public.reserve_generation(text) to service_role;
