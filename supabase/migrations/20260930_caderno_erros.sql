begin;
set local lock_timeout = '5s';

alter table public.simulations
  drop constraint if exists simulations_source_simulation_id_fkey;
alter table public.simulations
  add constraint simulations_source_simulation_id_fkey
  foreign key (source_simulation_id) references public.simulations(id) on delete cascade;

create index if not exists simulations_source_idx
  on public.simulations (source_simulation_id)
  where source_simulation_id is not null;

commit;
