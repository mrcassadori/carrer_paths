-- =====================================================================
-- Career Paths · Modelo de dados do MVP (Supabase / Postgres 15+)
-- Rodar no SQL Editor do Supabase (ou como migration 0001), depois
-- seed-catalogo.sql (gerado por gerar_seed.py a partir de
-- trilhas/catalogo-skills.json).
-- Regras de negócio seguem trilhas/modelo-trilhas-e-niveis.md, seção 9:
-- autoavaliação -> revisão do líder com justificativa -> nota validada
-- oficial -> contestação -> calibração. Nomes em inglês no banco,
-- rótulos em português na interface.
-- =====================================================================

-- ---------- Tipos ----------
create type app_role as enum (
  'colaborador',    -- time de Design e Produto: preenche o próprio perfil
  'especialista',   -- referência de uma trilha: tira dúvidas, vê agregados
  'gestor',         -- vê o time direto (manager_id) e o painel de adoção
  'lider_pratica',  -- valida mapas da prática
  'admin'           -- catálogo, convites, calibração
);
create type skill_kind as enum ('hard', 'soft');
create type skill_weight as enum ('nucleo', 'complementar', 'exposicao');
create type assessment_status as enum ('rascunho', 'enviada', 'em_revisao', 'validada', 'contestada');
create type course_kind as enum ('curso', 'certificacao', 'graduacao', 'pos_graduacao', 'outro');
create type language_level as enum ('basico', 'intermediario', 'avancado', 'fluente', 'nativo');
create type resume_status as enum ('enviado', 'processando', 'pronto_para_revisao', 'aplicado', 'erro');

-- ---------- Catálogo (carregado de trilhas/catalogo-skills.json) ----------
create table practices (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,                 -- "Design & Produto"
  created_at  timestamptz not null default now()
);

create table career_tracks (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,                -- product-design, ux-research...
  practice_id  uuid not null references practices(id) on delete cascade,
  name         text not null,
  description  text
);

-- Níveis são globais: N1 Júnior, N2 Pleno, N3 Sênior, N4-E Especialista, N4-L Lead, N5 Principal/Head
create table career_levels (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  name                 text not null,
  rank                 smallint not null,
  description          text,
  min_months_previous  smallint,                    -- referência, não trava
  extra_rule           text
);

-- Escala 0–5 com evidência mínima, exibida ao lado de cada nota
create table scale_levels (
  score         smallint primary key check (score between 0 and 5),
  label         text not null,
  description   text not null,
  min_evidence  text
);

create table skill_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  kind        skill_kind not null default 'hard',
  sort_order  smallint not null default 0
);

create table skills (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  category_id  uuid not null references skill_categories(id) on delete restrict,
  name         text not null,
  description  text,
  origin       text,                                -- planilha de origem
  active       boolean not null default true,       -- saiu do catálogo = inativa, histórico fica
  sort_order   smallint not null default 0
);

create table skill_track_weights (
  track_id  uuid not null references career_tracks(id) on delete cascade,
  skill_id  uuid not null references skills(id) on delete cascade,
  weight    skill_weight not null,
  primary key (track_id, skill_id)
);

-- Nota esperada trilha x nível x skill (materializada pelo gerador de seed)
create table skill_expectations (
  track_id        uuid not null references career_tracks(id) on delete cascade,
  level_id        uuid not null references career_levels(id) on delete cascade,
  skill_id        uuid not null references skills(id) on delete cascade,
  expected_level  smallint not null check (expected_level between 0 and 5),
  primary key (track_id, level_id, skill_id)
);

-- ---------- Acesso por link aberto ----------
-- Qualquer pessoa com e-mail de um domínio listado aqui pode se cadastrar pelo link.
-- O link mágico/código por e-mail prova que a pessoa é dona do endereço.
create table allowed_email_domains (
  domain       text primary key check (domain = lower(domain)),   -- ex.: empresa.com
  practice_id  uuid references practices(id)                      -- prática atribuída no cadastro
);

-- ---------- Pessoas ----------
create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text not null unique,
  full_name           text not null default '',
  avatar_url          text,
  app_role            app_role not null default 'colaborador',
  practice_id         uuid references practices(id),
  manager_id          uuid references profiles(id),   -- gestor direto (a pessoa escolhe no onboarding)
  track_id            uuid references career_tracks(id),
  secondary_track_id  uuid references career_tracks(id),
  level_id            uuid references career_levels(id),
  job_title           text,                           -- cargo como está no RH
  job_summary         text,                           -- pequena descrição da atuação
  hire_date           date,                           -- tempo de casa
  level_since         date,                           -- tempo no cargo/nível atual
  location            text,
  linkedin_url        text,
  first_login_at      timestamptz,
  signup_source       text,                           -- canal do link (?origem=...), ex.: email-lider, teams, daily
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on profiles (practice_id);
create index on profiles (manager_id);

create table role_history (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  track_id    uuid references career_tracks(id),
  level_id    uuid references career_levels(id),
  job_title   text,
  started_on  date not null,
  ended_on    date,
  created_at  timestamptz not null default now()
);
create index on role_history (profile_id);

create table profile_languages (
  profile_id  uuid not null references profiles(id) on delete cascade,
  language    text not null,
  level       language_level not null,
  primary key (profile_id, language)
);

-- ---------- Evidências: projetos/cases e cursos/certificados ----------
create table projects (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references profiles(id) on delete cascade,
  title            text not null,
  client           text,
  role_in_project  text,                            -- papel da pessoa no projeto
  summary          text,                            -- contexto, desafio, resultado
  started_on       date,
  ended_on         date,
  link_url         text,
  is_case          boolean not null default false,
  created_at       timestamptz not null default now()
);
create index on projects (profile_id);

create table project_skills (
  project_id  uuid not null references projects(id) on delete cascade,
  skill_id    uuid not null references skills(id) on delete cascade,
  primary key (project_id, skill_id)
);

create table courses (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles(id) on delete cascade,
  kind            course_kind not null default 'curso',
  name            text not null,
  institution     text,
  completed_on    date,
  workload_hours  smallint,
  credential_url  text,
  created_at      timestamptz not null default now()
);
create index on courses (profile_id);

-- ---------- Ciclos e avaliações ----------
create table review_cycles (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null unique,     -- "2026.2 (linha de base)"
  starts_on               date not null,
  ends_on                 date not null,
  catalog_version         text not null,            -- versão do catalogo-skills.json
  is_current              boolean not null default false,
  is_baseline             boolean not null default false,  -- não gera promoção
  evidence_required_from  smallint not null default 3 check (evidence_required_from between 1 and 6),
  contest_window_days     smallint not null default 10
);
create unique index review_cycles_one_current on review_cycles (is_current) where is_current;

-- Uma avaliação por pessoa por ciclo
create table assessments (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references profiles(id) on delete cascade,
  cycle_id           uuid not null references review_cycles(id) on delete restrict,
  status             assessment_status not null default 'rascunho',
  submitted_at       timestamptz,
  review_started_at  timestamptz,
  reviewer_id        uuid references profiles(id),
  validated_at       timestamptz,
  one_on_one_done    boolean not null default false, -- obrigatória se ajuste >= 2 pontos ou nota 5
  return_note        text,                           -- motivo de devolução pelo líder
  contest_note       text,
  contested_at       timestamptz,
  created_at         timestamptz not null default now(),
  unique (profile_id, cycle_id)
);

-- Uma nota por skill dentro da avaliação
create table assessment_scores (
  assessment_id    uuid not null references assessments(id) on delete cascade,
  skill_id         uuid not null references skills(id) on delete restrict,
  self_score       smallint check (self_score between 0 and 5),
  target_score     smallint check (target_score between 0 and 5),  -- onde quer chegar (PDI)
  self_note        text,
  leader_score     smallint check (leader_score between 0 and 5),
  justification    text,                            -- obrigatória quando leader_score <> self_score
  validated_score  smallint check (validated_score between 0 and 5),  -- oficial; só muda via validação/calibração
  updated_at       timestamptz not null default now(),
  primary key (assessment_id, skill_id)
);

-- Evidência ligada a uma nota: um projeto/case OU um curso/certificado
create table score_evidence (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null,
  skill_id       uuid not null,
  project_id     uuid references projects(id) on delete cascade,
  course_id      uuid references courses(id) on delete cascade,
  foreign key (assessment_id, skill_id) references assessment_scores(assessment_id, skill_id) on delete cascade,
  check (num_nonnulls(project_id, course_id) = 1)
);
create index on score_evidence (assessment_id, skill_id);

-- Histórico imutável de toda alteração de nota (quem, quando, por quê)
create table score_events (
  id             bigint generated always as identity primary key,
  assessment_id  uuid not null references assessments(id) on delete cascade,
  skill_id       uuid not null references skills(id) on delete cascade,
  field          text not null check (field in ('self_score', 'target_score', 'leader_score', 'validated_score')),
  old_value      smallint,
  new_value      smallint,
  reason         text,
  changed_by     uuid references profiles(id),
  changed_at     timestamptz not null default now()
);
create index on score_events (assessment_id, skill_id, changed_at);

-- ---------- Importação de currículo ----------
create table resume_imports (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles(id) on delete cascade,
  storage_path  text not null,                      -- bucket "resumes", pasta = profile_id
  file_name     text not null,
  mime_type     text not null,
  status        resume_status not null default 'enviado',
  extracted     jsonb,                              -- sugestões da IA; nunca contém notas
  error         text,
  created_at    timestamptz not null default now(),
  applied_at    timestamptz
);
create index on resume_imports (profile_id);

-- =====================================================================
-- Funções de permissão (security definer evita recursão no RLS)
-- =====================================================================
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select app_role = 'admin' from profiles where id = auth.uid()), false)
$$;

-- Vê o perfil individual: o próprio, admin, líder da prática da pessoa, ou gestor direto.
-- Especialista e gestor veem o restante só de forma agregada.
create or replace function can_view_profile(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select target = auth.uid()
      or exists (
        select 1 from profiles me, profiles t
        where me.id = auth.uid() and t.id = target
          and (me.app_role = 'admin'
               or t.manager_id = me.id
               or (me.app_role = 'lider_pratica' and me.practice_id = t.practice_id))
      )
$$;

-- Valida notas: líder da prática da pessoa ou admin; nunca a si mesmo
create or replace function can_review_profile(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select target <> auth.uid() and exists (
    select 1 from profiles me, profiles t
    where me.id = auth.uid() and t.id = target
      and (me.app_role = 'admin'
           or (me.app_role = 'lider_pratica' and me.practice_id = t.practice_id))
  )
$$;

create or replace function assessment_owner(a uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select profile_id from assessments where id = a
$$;

create or replace function assessment_status_of(a uuid) returns assessment_status
language sql stable security definer set search_path = public as $$
  select status from assessments where id = a
$$;

-- =====================================================================
-- Triggers
-- =====================================================================
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();
create trigger scores_touch before update on assessment_scores
  for each row execute function touch_updated_at();

-- Auth Hook "Before User Created" do Supabase: barra e-mail fora dos domínios
-- liberados com mensagem amigável (ativar em Authentication > Hooks).
create or replace function hook_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from allowed_email_domains
                 where domain = lower(split_part(event -> 'user' ->> 'email', '@', 2))) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Use seu e-mail corporativo para entrar no Career Paths.'));
  end if;
  return '{}'::jsonb;
end $$;
grant execute on function hook_before_user_created(jsonb) to supabase_auth_admin;

-- Cria o perfil no primeiro login, já na prática do domínio. Repete a checagem
-- de domínio como segunda barreira caso o hook esteja desligado.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pr uuid;
begin
  select practice_id into pr from allowed_email_domains
  where domain = lower(split_part(new.email, '@', 2));
  if not found then
    raise exception 'Domínio de e-mail não liberado: %', split_part(new.email, '@', 2);
  end if;
  insert into profiles (id, email, full_name, practice_id, signup_source)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), pr,
          coalesce(nullif(lower(btrim(new.raw_user_meta_data ->> 'origem')), ''), 'direto'))
  on conflict (id) do nothing;
  return new;
end $$;

-- Lista de gestores para a pessoa escolher o próprio no onboarding (só nome)
create or replace function list_managers() returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name from profiles p
  where p.app_role in ('gestor', 'lider_pratica', 'admin')
    and p.practice_id = (select practice_id from profiles where id = auth.uid())
  order by p.full_name
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Governança do perfil: papel e prática só por admin.
-- Gestor, trilha e nível: a pessoa escolhe no onboarding; depois só líder da prática ou admin muda.
create or replace function guard_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  if new.app_role is distinct from old.app_role
     or new.practice_id is distinct from old.practice_id then
    raise exception 'Somente admin altera papel ou prática';
  end if;
  if new.manager_id = new.id then
    raise exception 'A pessoa não pode ser gestora de si mesma';
  end if;
  if new.manager_id is distinct from old.manager_id and new.manager_id is not null
     and not exists (select 1 from profiles g where g.id = new.manager_id
                     and g.app_role in ('gestor', 'lider_pratica', 'admin')) then
    raise exception 'Escolha um gestor da lista';
  end if;
  if ((old.track_id is not null and new.track_id is distinct from old.track_id)
      or (old.level_id is not null and new.level_id is distinct from old.level_id)
      or (old.manager_id is not null and new.manager_id is distinct from old.manager_id))
     and not can_review_profile(new.id) then
    raise exception 'Depois do onboarding, só o líder da prática muda gestor, trilha ou nível';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on profiles
  for each row execute function guard_profile_fields();

-- Quem escreve qual coluna da nota, e em qual status da avaliação
create or replace function guard_score_fields() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  st        assessment_status := assessment_status_of(new.assessment_id);
  is_owner  boolean := assessment_owner(new.assessment_id) = auth.uid();
  is_rev    boolean := can_review_profile(assessment_owner(new.assessment_id));
  self_chg  boolean;
  lead_chg  boolean;
  val_chg   boolean;
begin
  if auth.uid() is null then
    return new;  -- service role (importação das planilhas, Edge Functions)
  end if;
  if tg_op = 'INSERT' then
    self_chg := num_nonnulls(new.self_score, new.target_score, new.self_note) > 0;
    lead_chg := num_nonnulls(new.leader_score, new.justification) > 0;
    val_chg  := new.validated_score is not null;
  else
    self_chg := (new.self_score, new.target_score, new.self_note)
                is distinct from (old.self_score, old.target_score, old.self_note);
    lead_chg := (new.leader_score, new.justification)
                is distinct from (old.leader_score, old.justification);
    val_chg  := new.validated_score is distinct from old.validated_score;
  end if;

  if self_chg and not (is_owner and st = 'rascunho') then
    raise exception 'Autoavaliação só pelo próprio colaborador, com a avaliação em rascunho';
  end if;
  if lead_chg and not (is_rev and st in ('enviada', 'em_revisao')) then
    raise exception 'Nota do líder só pelo líder da prática, com a avaliação enviada ou em revisão';
  end if;
  if lead_chg and new.leader_score is distinct from new.self_score
     and coalesce(btrim(new.justification), '') = '' then
    raise exception 'Ajuste de nota exige justificativa';
  end if;
  if val_chg and coalesce(current_setting('app.validating', true), '') <> 'on' then
    raise exception 'Nota validada só muda na validação ou calibração';
  end if;
  return new;
end $$;

create trigger scores_guard before insert or update on assessment_scores
  for each row execute function guard_score_fields();

create or replace function log_score_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  f text;
  o smallint;
  n smallint;
begin
  foreach f in array array['self_score', 'target_score', 'leader_score', 'validated_score'] loop
    n := (to_jsonb(new) ->> f)::smallint;
    o := case when tg_op = 'UPDATE' then (to_jsonb(old) ->> f)::smallint end;
    if n is distinct from o then
      insert into score_events (assessment_id, skill_id, field, old_value, new_value, reason, changed_by)
      values (new.assessment_id, new.skill_id, f, o, n,
              case when f = 'leader_score' then new.justification
                   when f = 'validated_score' then current_setting('app.reason', true) end,
              auth.uid());
    end if;
  end loop;
  return null;
end $$;

create trigger scores_log after insert or update on assessment_scores
  for each row execute function log_score_change();

-- Evidência só pelo dono, em rascunho, apontando para projeto/curso dele
create or replace function guard_evidence() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  aid   uuid := case when tg_op = 'DELETE' then old.assessment_id else new.assessment_id end;
  owner uuid := assessment_owner(aid);
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if owner <> auth.uid() or assessment_status_of(aid) <> 'rascunho' then
    raise exception 'Evidências só pelo colaborador, com a avaliação em rascunho';
  end if;
  if tg_op <> 'DELETE' and not exists (
       select 1 from projects where id = new.project_id and profile_id = owner
       union all
       select 1 from courses where id = new.course_id and profile_id = owner) then
    raise exception 'A evidência precisa ser um projeto ou curso do próprio perfil';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger evidence_guard before insert or update or delete on score_evidence
  for each row execute function guard_evidence();

-- =====================================================================
-- Transições de status (chamadas pelo app via supabase.rpc)
-- =====================================================================

-- Cria (ou devolve) a avaliação do ciclo vigente com uma linha por skill ativa
create or replace function start_my_assessment() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cyc uuid;
  aid uuid;
begin
  select id into cyc from review_cycles where is_current;
  if cyc is null then raise exception 'Nenhum ciclo vigente'; end if;
  insert into assessments (profile_id, cycle_id) values (auth.uid(), cyc)
  on conflict (profile_id, cycle_id) do nothing;
  select id into aid from assessments where profile_id = auth.uid() and cycle_id = cyc;
  insert into assessment_scores (assessment_id, skill_id)
  select aid, s.id from skills s where s.active
  on conflict do nothing;
  return aid;
end $$;

create or replace function submit_assessment(a uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  min_ev  smallint;
  missing int;
  no_ev   int;
begin
  if assessment_owner(a) is distinct from auth.uid() or assessment_status_of(a) <> 'rascunho' then
    raise exception 'Só o colaborador envia a própria avaliação em rascunho';
  end if;
  select count(*) into missing from assessment_scores sc join skills s on s.id = sc.skill_id
  where sc.assessment_id = a and s.active and sc.self_score is null;
  if missing > 0 then raise exception 'Faltam % skills sem nota', missing; end if;

  select c.evidence_required_from into min_ev
  from assessments x join review_cycles c on c.id = x.cycle_id where x.id = a;
  select count(*) into no_ev from assessment_scores sc
  where sc.assessment_id = a and sc.self_score >= min_ev
    and not exists (select 1 from score_evidence e where e.assessment_id = a and e.skill_id = sc.skill_id);
  if no_ev > 0 then raise exception '% notas a partir de % estão sem evidência ligada', no_ev, min_ev; end if;

  update assessments set status = 'enviada', submitted_at = now(), return_note = null where id = a;
end $$;

create or replace function start_review(a uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_review_profile(assessment_owner(a)) or assessment_status_of(a) <> 'enviada' then
    raise exception 'Só o líder da prática inicia a revisão de uma avaliação enviada';
  end if;
  update assessments set status = 'em_revisao', review_started_at = now(), reviewer_id = auth.uid()
  where id = a;
end $$;

-- Líder devolve para a pessoa corrigir (ex.: evidência que não sustenta a nota)
create or replace function return_assessment(a uuid, note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_review_profile(assessment_owner(a)) or assessment_status_of(a) not in ('enviada', 'em_revisao') then
    raise exception 'Só o líder da prática devolve uma avaliação enviada ou em revisão';
  end if;
  update assessments set status = 'rascunho', return_note = note where id = a;
end $$;

create or replace function mark_one_on_one(a uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_review_profile(assessment_owner(a)) then
    raise exception 'Só o líder da prática registra a conversa 1:1';
  end if;
  update assessments set one_on_one_done = true where id = a;
end $$;

create or replace function validate_assessment(a uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  pending    int;
  needs_1on1 boolean;
begin
  if not can_review_profile(assessment_owner(a)) or assessment_status_of(a) <> 'em_revisao' then
    raise exception 'Só o líder da prática valida uma avaliação em revisão';
  end if;
  select count(*) into pending from assessment_scores where assessment_id = a and leader_score is null;
  if pending > 0 then raise exception 'Faltam % skills sem nota do líder', pending; end if;
  select coalesce(bool_or(abs(leader_score - self_score) >= 2 or leader_score = 5), false) into needs_1on1
  from assessment_scores where assessment_id = a;
  if needs_1on1 and not (select one_on_one_done from assessments where id = a) then
    raise exception 'Conversa 1:1 obrigatória (ajuste de 2+ pontos ou nota 5) antes de validar';
  end if;
  perform set_config('app.validating', 'on', true);
  perform set_config('app.reason', 'validação do líder', true);
  update assessment_scores set validated_score = leader_score where assessment_id = a;
  perform set_config('app.validating', 'off', true);
  update assessments set status = 'validada', validated_at = now() where id = a;
end $$;

create or replace function contest_assessment(a uuid, note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  win smallint;
  vat timestamptz;
begin
  select c.contest_window_days, x.validated_at into win, vat
  from assessments x join review_cycles c on c.id = x.cycle_id where x.id = a;
  if assessment_owner(a) is distinct from auth.uid() or assessment_status_of(a) <> 'validada'
     or now() > vat + make_interval(days => win) then
    raise exception 'Contestação só pelo colaborador, até % dias após a validação', win;
  end if;
  if coalesce(btrim(note), '') = '' then raise exception 'Descreva o motivo da contestação'; end if;
  update assessments set status = 'contestada', contest_note = note, contested_at = now() where id = a;
end $$;

-- Calibração: admin ajusta nota validada (com motivo) e fecha a contestação
create or replace function calibrate_score(a uuid, s uuid, new_score smallint, reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Só a calibração (admin) altera nota validada'; end if;
  if coalesce(btrim(reason), '') = '' then raise exception 'Calibração exige motivo'; end if;
  perform set_config('app.validating', 'on', true);
  perform set_config('app.reason', reason, true);
  update assessment_scores set validated_score = new_score where assessment_id = a and skill_id = s;
  perform set_config('app.validating', 'off', true);
end $$;

create or replace function close_contest(a uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() or assessment_status_of(a) <> 'contestada' then
    raise exception 'Só a calibração (admin) fecha uma contestação';
  end if;
  update assessments set status = 'validada' where id = a;
end $$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table allowed_email_domains enable row level security;
create policy domains_admin on allowed_email_domains for all to authenticated
  using (is_admin()) with check (is_admin());

do $$
declare t text;
begin
  foreach t in array array['practices', 'career_tracks', 'career_levels', 'scale_levels',
    'skill_categories', 'skills', 'skill_track_weights', 'skill_expectations', 'review_cycles',
    'profiles', 'role_history', 'profile_languages', 'projects', 'project_skills', 'courses',
    'assessments', 'assessment_scores', 'score_evidence', 'score_events', 'resume_imports'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
  -- Catálogo: todo usuário logado lê; só admin escreve
  foreach t in array array['practices', 'career_tracks', 'career_levels', 'scale_levels',
    'skill_categories', 'skills', 'skill_track_weights', 'skill_expectations', 'review_cycles'] loop
    execute format('create policy catalog_read on %I for select to authenticated using (true)', t);
    execute format('create policy catalog_admin on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
  -- Dados do próprio perfil: quem vê o perfil lê; o dono escreve
  foreach t in array array['role_history', 'profile_languages', 'projects', 'courses'] loop
    execute format('create policy own_read on %I for select to authenticated using (can_view_profile(profile_id))', t);
    execute format('create policy own_write on %I for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid())', t);
  end loop;
end $$;

create policy reviewer_write on role_history for all to authenticated
  using (can_review_profile(profile_id)) with check (can_review_profile(profile_id));

create policy profiles_read   on profiles for select to authenticated using (can_view_profile(id));
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid() or can_review_profile(id))
  with check (id = auth.uid() or can_review_profile(id));
create policy profiles_admin  on profiles for all to authenticated using (is_admin()) with check (is_admin());

create policy ps_read on project_skills for select to authenticated
  using (exists (select 1 from projects p where p.id = project_id and can_view_profile(p.profile_id)));
create policy ps_write on project_skills for all to authenticated
  using (exists (select 1 from projects p where p.id = project_id and p.profile_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_id and p.profile_id = auth.uid()));

-- Avaliações: leitura para quem vê o perfil; status só muda pelas funções acima
create policy assess_read on assessments for select to authenticated
  using (can_view_profile(profile_id));

create policy scores_read on assessment_scores for select to authenticated
  using (can_view_profile(assessment_owner(assessment_id)));
create policy scores_update on assessment_scores for update to authenticated
  using (assessment_owner(assessment_id) = auth.uid() or can_review_profile(assessment_owner(assessment_id)))
  with check (assessment_owner(assessment_id) = auth.uid() or can_review_profile(assessment_owner(assessment_id)));

create policy evidence_read on score_evidence for select to authenticated
  using (can_view_profile(assessment_owner(assessment_id)));
create policy evidence_write on score_evidence for all to authenticated
  using (assessment_owner(assessment_id) = auth.uid())
  with check (assessment_owner(assessment_id) = auth.uid());

create policy events_read on score_events for select to authenticated
  using (can_view_profile(assessment_owner(assessment_id)));

-- Currículo é sensível: só o dono e admin
create policy resume_read on resume_imports for select to authenticated
  using (profile_id = auth.uid() or is_admin());
create policy resume_write on resume_imports for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- =====================================================================
-- Views (security_invoker: respeitam o RLS de quem consulta)
-- =====================================================================

-- Perfil + tempo de casa/cargo + critério de "cadastro completo" do plano de adoção
create view profile_overview with (security_invoker = true) as
with a as (
  select x.profile_id, x.id as assessment_id, x.status,
         count(sc.skill_id) filter (where s.active)                              as skills_total,
         count(sc.skill_id) filter (where s.active and sc.self_score is not null) as skills_self_rated,
         count(sc.skill_id) filter (where sc.validated_score is not null)         as skills_validated
  from assessments x
  join review_cycles cy on cy.id = x.cycle_id and cy.is_current
  left join assessment_scores sc on sc.assessment_id = x.id
  left join skills s on s.id = sc.skill_id
  group by x.profile_id, x.id, x.status
),
b as (
  select p.id,
    (p.job_title is not null and p.job_summary is not null and p.hire_date is not null
     and p.level_since is not null and p.track_id is not null and p.level_id is not null) as has_basics,
    (exists (select 1 from resume_imports r where r.profile_id = p.id and r.status = 'aplicado')
     or exists (select 1 from projects pr where pr.profile_id = p.id)
     or exists (select 1 from courses c where c.profile_id = p.id)
     or exists (select 1 from profile_languages pl where pl.profile_id = p.id)) as has_extra
  from profiles p
)
select
  p.id, p.full_name, p.email, p.app_role, p.practice_id, p.manager_id,
  p.created_at as signed_up_at, p.first_login_at, p.signup_source,
  p.track_id, t.name as track_name, p.level_id, l.code as level_code, l.name as level_name,
  p.job_title, p.hire_date, p.level_since,
  (extract(year from age(current_date, p.hire_date)) * 12
   + extract(month from age(current_date, p.hire_date)))::int   as months_at_company,
  (extract(year from age(current_date, p.level_since)) * 12
   + extract(month from age(current_date, p.level_since)))::int as months_in_level,
  a.assessment_id, a.status as assessment_status,
  coalesce(a.skills_total, 0)      as skills_total,
  coalesce(a.skills_self_rated, 0) as skills_self_rated,
  coalesce(a.skills_validated, 0)  as skills_validated,
  b.has_basics, b.has_extra,
  (p.first_login_at is not null and b.has_basics and b.has_extra
   and coalesce(a.skills_total, 0) > 0 and a.skills_self_rated = a.skills_total) as is_complete
from profiles p
join b on b.id = p.id
left join career_tracks t on t.id = p.track_id
left join career_levels l on l.id = p.level_id
left join a on a.profile_id = p.id;

-- Nota x esperado (nível atual e próximo) por skill. Dashboards e prontidão usam só
-- validated_score; self_score fica para mostrar a diferença de percepção.
create view score_gaps with (security_invoker = true) as
select
  x.profile_id, x.cycle_id, x.status as assessment_status,
  sc.skill_id, s.slug as skill_slug, s.name as skill_name, c.name as category_name, c.kind,
  w.weight,
  sc.self_score, sc.target_score, sc.leader_score, sc.validated_score,
  e.expected_level  as expected_now,
  en.expected_level as expected_next,
  sc.validated_score - e.expected_level  as gap_now,
  sc.validated_score - en.expected_level as gap_next
from assessments x
join profiles p on p.id = x.profile_id
join assessment_scores sc on sc.assessment_id = x.id
join skills s on s.id = sc.skill_id
join skill_categories c on c.id = s.category_id
left join career_levels l on l.id = p.level_id
left join skill_track_weights w on w.track_id = p.track_id and w.skill_id = sc.skill_id
left join skill_expectations e
  on e.track_id = p.track_id and e.level_id = p.level_id and e.skill_id = sc.skill_id
left join lateral (
  -- próximo nível: menor rank acima do atual (N3 -> N4-E por padrão; a trilha de gestão usa N4-L)
  select ex.expected_level from skill_expectations ex join career_levels nl on nl.id = ex.level_id
  where ex.track_id = p.track_id and ex.skill_id = sc.skill_id and nl.rank = l.rank + 1
  order by nl.code limit 1
) en on true;

-- Adoção agregada, sem nomes: painel de especialistas, gestores, líder e admin
create or replace function adoption_summary()
returns table (signed_up bigint, started bigint, complete bigint, submitted bigint, validated bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce((select app_role from profiles where id = auth.uid()), 'colaborador') = 'colaborador' then
    raise exception 'Painel de adoção disponível para especialistas, gestores, líder e admin';
  end if;
  return query
  select count(*),                                              -- contas criadas pelo link
         count(*) filter (where o.has_basics or o.skills_self_rated > 0),  -- começaram o cadastro
         count(*) filter (where o.is_complete),
         count(*) filter (where o.assessment_status in ('enviada', 'em_revisao', 'validada', 'contestada')),
         count(*) filter (where o.assessment_status = 'validada')
  from profile_overview o;
end $$;

-- Adoção por canal de origem do link (sem nomes)
create or replace function adoption_by_source()
returns table (source text, signed_up bigint, complete bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce((select app_role from profiles where id = auth.uid()), 'colaborador') = 'colaborador' then
    raise exception 'Painel de adoção disponível para especialistas, gestores, líder e admin';
  end if;
  return query
  select o.signup_source, count(*), count(*) filter (where o.is_complete)
  from profile_overview o group by o.signup_source order by 2 desc;
end $$;

-- Cobertura por gestor: quantas pessoas apontaram cada gestor e quantas completaram (sem nomes do time)
create or replace function adoption_by_manager()
returns table (manager_id uuid, manager_name text, team_signed_up bigint, team_complete bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce((select app_role from profiles where id = auth.uid()), 'colaborador') = 'colaborador' then
    raise exception 'Painel de adoção disponível para especialistas, gestores, líder e admin';
  end if;
  return query
  select g.id, g.full_name, count(o.id), count(o.id) filter (where o.is_complete)
  from profiles g left join profile_overview o on o.manager_id = g.id
  where g.app_role in ('gestor', 'lider_pratica', 'admin')
  group by g.id, g.full_name order by g.full_name;
end $$;

-- =====================================================================
-- Storage: bucket privado para currículos
-- =====================================================================
insert into storage.buckets (id, name, public) values ('resumes', 'resumes', false)
on conflict (id) do nothing;

create policy resumes_owner_rw on storage.objects for all to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
