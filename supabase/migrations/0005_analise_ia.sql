-- Análise por IA do mapa de skills: cruza cargo, currículo, notas e projetos. Só sugere; nunca muda nota.
-- Guarda só a análise mais recente de cada pessoa; quem vê o perfil (gestor, líder, admin) também lê.
create table if not exists profile_analyses (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  content     jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists profile_analyses_profile_id_idx on profile_analyses (profile_id, created_at desc);

alter table profile_analyses enable row level security;
drop policy if exists own_read on profile_analyses;
create policy own_read on profile_analyses for select to authenticated using (can_view_profile(profile_id));
drop policy if exists own_write on profile_analyses;
create policy own_write on profile_analyses for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
