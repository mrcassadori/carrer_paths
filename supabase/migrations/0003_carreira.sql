-- Carreira: empresas por onde a pessoa passou (vem do currículo ou é digitada no perfil).
-- Diferente de role_history, que guarda trilha e nível dentro da empresa.
create table if not exists career_entries (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles(id) on delete cascade,
  company      text not null,
  job_title    text,
  started_on   date,
  ended_on     date,
  description  text,
  created_at   timestamptz not null default now()
);
create index if not exists career_entries_profile_id_idx on career_entries (profile_id);

alter table career_entries enable row level security;
drop policy if exists own_read on career_entries;
create policy own_read on career_entries for select to authenticated using (can_view_profile(profile_id));
drop policy if exists own_write on career_entries;
create policy own_write on career_entries for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Cadastro completo passa a contar também a carreira
create or replace view profile_overview with (security_invoker = true) as
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
     or exists (select 1 from profile_languages pl where pl.profile_id = p.id)
     or exists (select 1 from career_entries ce where ce.profile_id = p.id)) as has_extra
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
