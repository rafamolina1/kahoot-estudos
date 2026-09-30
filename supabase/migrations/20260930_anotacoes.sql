-- Guarda anotações pessoais por identificador de questão em simulados já existentes.
alter table public.simulations
  add column if not exists notes jsonb not null default '{}'::jsonb;
