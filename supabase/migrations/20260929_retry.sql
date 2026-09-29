begin;

alter table public.simulations
  add column if not exists source_simulation_id uuid references public.simulations(id);

alter table public.simulations
  drop constraint if exists simulations_question_count_check;
alter table public.simulations
  add constraint simulations_question_count_check check (question_count between 1 and 50);

create unique index if not exists simulations_open_retry_idx
  on public.simulations (owner_hash, source_simulation_id)
  where source_simulation_id is not null and completed_at is null;

commit;
