-- Contador de gasto da IA: cada chamada das Edge Functions registra tokens e custo estimado em dólar.
-- Ninguém lê a tabela direto; o painel de Adoção usa só o total agregado (sem nomes).
create table if not exists ai_usage (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid references profiles(id) on delete set null default auth.uid(),
  feature        text not null check (feature in ('ler-curriculo', 'analisar-perfil')),
  model          text not null,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  cost_usd       numeric(10, 4) not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists ai_usage_created_at_idx on ai_usage (created_at);

alter table ai_usage enable row level security;
drop policy if exists usage_insert_own on ai_usage;
create policy usage_insert_own on ai_usage for insert to authenticated with check (profile_id = auth.uid());

-- Total por mês e por função, para o painel de Adoção (mesma regra de acesso dos outros números agregados)
create or replace function ai_usage_summary()
returns table (month date, feature text, calls bigint, input_tokens bigint, output_tokens bigint, cost_usd numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce((select app_role from profiles where id = auth.uid()), 'colaborador') = 'colaborador' then
    raise exception 'Painel de adoção disponível para especialistas, gestores, líder e admin';
  end if;
  return query
  select date_trunc('month', u.created_at)::date, u.feature, count(*),
         sum(u.input_tokens)::bigint, sum(u.output_tokens)::bigint, sum(u.cost_usd)
  from ai_usage u
  group by 1, 2
  order by 1 desc, 2;
end $$;
