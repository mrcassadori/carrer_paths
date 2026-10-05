-- Testes de permissão e do fluxo de validação. Cada "erro" esperado aparece como ERROR logo abaixo do T correspondente.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into practices(name) values ('Dados');
select id as pa from practices where name='Design & Produto' \gset
select id as pb from practices where name='Dados' \gset
select id as sk from skills where slug='estrategia-produto' \gset
select id as sk2 from skills where slug='pesquisa-qualitativa' \gset
insert into allowed_email_domains(domain, practice_id) values ('x', :'pa');
\echo T0 cadastro pelo link: dominio fora da lista (erro) e hook devolve 403
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000099','alguem@gmail.com');
select hook_before_user_created('{"user":{"email":"alguem@gmail.com"}}') ->> 'error' is not null as bloqueado,
       hook_before_user_created('{"user":{"email":"Pessoa@X"}}') = '{}'::jsonb as liberado;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000001','admin@x'),('00000000-0000-0000-0000-000000000002','lider@x'),
 ('00000000-0000-0000-0000-000000000003','colab@x'),('00000000-0000-0000-0000-000000000004','outro@x'),
 ('00000000-0000-0000-0000-000000000005','gestor@x'),('00000000-0000-0000-0000-000000000006','esp@x');
insert into auth.users(id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-000000000007','viateams@x','{"origem":" Teams "}');
select count(*) as perfis_na_pratica_do_dominio from profiles where practice_id = :'pa';
update profiles set app_role='admin', practice_id=:'pa' where email='admin@x';
update profiles set app_role='lider_pratica', practice_id=:'pa' where email='lider@x';
update profiles set practice_id=:'pb' where email='outro@x';
update profiles set app_role='gestor', practice_id=:'pa' where email='gestor@x';
update profiles set app_role='especialista', practice_id=:'pa' where email='esp@x';

\set ON_ERROR_STOP 0
set role authenticated;
set request.jwt.sub='00000000-0000-0000-0000-000000000003';
\echo == COLAB onboarding: escolhe gestor da lista
select full_name is not null as ok from list_managers() limit 1;
\echo T0b gestor de si mesmo (erro)
update profiles set manager_id='00000000-0000-0000-0000-000000000003' where id=auth.uid();
update profiles set manager_id='00000000-0000-0000-0000-000000000005', first_login_at=now(), job_title='Product Designer', job_summary='Squad pagamentos', hire_date='2022-03-01', level_since='2024-01-15',
  track_id=(select id from career_tracks where slug='product-design'), level_id=(select id from career_levels where code='N2') where id=auth.uid();
select start_my_assessment() as aid \gset
update assessment_scores set self_score=2, target_score=3 where assessment_id=:'aid';
update assessment_scores set self_score=4 where assessment_id=:'aid' and skill_id=:'sk';
\echo T1 envia sem evidencia (erro: notas >=3 sem evidencia)
select submit_assessment(:'aid');
insert into projects(profile_id,title,role_in_project) values (auth.uid(),'App X','Lead designer') returning id as pj \gset
insert into score_evidence(assessment_id,skill_id,project_id) values (:'aid',:'sk',:'pj');
\echo T2 cadastro completo com projeto como item extra (is_complete = t)
select is_complete, skills_self_rated, skills_total, months_in_level from profile_overview where id=auth.uid();
\echo T3 colab muda nivel ou gestor depois do onboarding (erro, erro)
update profiles set level_id=(select id from career_levels where code='N3') where id=auth.uid();
update profiles set manager_id='00000000-0000-0000-0000-000000000002' where id=auth.uid();
\echo T4 colab envia (ok) e tenta editar depois (erro)
select submit_assessment(:'aid');
update assessment_scores set self_score=5 where assessment_id=:'aid' and skill_id=:'sk';
\echo T5 colab escreve nota do lider (erro)
update assessment_scores set leader_score=1, justification='x' where assessment_id=:'aid' and skill_id=:'sk';
\echo T6 colab tenta validar direto (erro)
update assessment_scores set validated_score=5 where assessment_id=:'aid';
set request.jwt.sub='00000000-0000-0000-0000-000000000004';
\echo T7 outra pratica: ve 0 perfis/notas, nao consegue revisar
select count(*) from assessment_scores where assessment_id=:'aid';
select start_review(:'aid');
set request.jwt.sub='00000000-0000-0000-0000-000000000006';
\echo T8 especialista: nao ve individual, ve agregado
select count(*) from profiles where email='colab@x';
select * from adoption_summary();
select * from adoption_by_source();
select manager_name is not null as tem_nome, team_signed_up, team_complete from adoption_by_manager() where team_signed_up > 0;
set request.jwt.sub='00000000-0000-0000-0000-000000000005';
\echo T9 gestor direto ve o perfil, nao revisa
select full_name is not null as ve, assessment_status from profile_overview where email='colab@x';
select start_review(:'aid');
set request.jwt.sub='00000000-0000-0000-0000-000000000002';
\echo T10 lider: revisa; ajuste sem justificativa (erro); com justificativa (ok)
select start_review(:'aid');
update assessment_scores set leader_score=self_score where assessment_id=:'aid';
update assessment_scores set leader_score=2 where assessment_id=:'aid' and skill_id=:'sk';
update assessment_scores set leader_score=2, justification='Case sem papel de liderança' where assessment_id=:'aid' and skill_id=:'sk';
\echo T11 valida sem 1:1 (erro, ajuste de 2 pontos), registra 1:1 e valida (ok)
select validate_assessment(:'aid');
select mark_one_on_one(:'aid');
select validate_assessment(:'aid');
\echo T12 lider muda nota validada direto (erro)
update assessment_scores set validated_score=4 where assessment_id=:'aid' and skill_id=:'sk';
set request.jwt.sub='00000000-0000-0000-0000-000000000003';
\echo T13 colab contesta (ok)
select contest_assessment(:'aid','Tenho evidência de liderança no case');
set request.jwt.sub='00000000-0000-0000-0000-000000000001';
\echo T14 admin calibra e fecha
select calibrate_score(:'aid', :'sk', 3::smallint, 'Calibração: liderou parte do case');
select close_contest(:'aid');
reset role;
\echo T15 estado e historico
select status, one_on_one_done from assessments;
select s.slug, sc.self_score, sc.leader_score, sc.validated_score from assessment_scores sc join skills s on s.id=sc.skill_id where s.slug in ('estrategia-produto','pesquisa-qualitativa');
select field, old_value, new_value, reason from score_events e join skills s on s.id=e.skill_id where s.slug='estrategia-produto' order by e.id;
select skill_slug, weight, validated_score, expected_now, expected_next, gap_now, gap_next from score_gaps where skill_slug in ('estrategia-produto','pesquisa-qualitativa');
