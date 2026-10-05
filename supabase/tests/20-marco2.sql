-- Marco 2: projetos/cursos do próprio perfil, painel de adoção agregado e troca de papel pelo admin.
-- Roda depois de 10-permissoes-e-fluxo.sql (reaproveita os usuários de lá).
\set ON_ERROR_STOP 0
set role authenticated;
set request.jwt.sub='00000000-0000-0000-0000-000000000004';
\echo == M2a colaborador cria curso e projeto com skill
insert into courses(profile_id, kind, name, institution) values (auth.uid(), 'certificacao', 'CSPO', 'Scrum Alliance');
insert into projects(profile_id, title) values (auth.uid(), 'Portal') returning id as pj4 \gset
insert into project_skills(project_id, skill_id) select :'pj4', id from skills limit 2;
select count(*) as skills_no_projeto from project_skills where project_id = :'pj4';
\echo M2b colaborador grava curso no perfil de outra pessoa (erro)
insert into courses(profile_id, name) values ('00000000-0000-0000-0000-000000000003', 'Falso');
\echo M2c colaborador abre o painel de adoção (erro)
select * from adoption_summary();
\echo M2d colaborador muda o próprio papel (erro)
update profiles set app_role = 'admin' where id = auth.uid();
set request.jwt.sub='00000000-0000-0000-0000-000000000005';
\echo == M2e gestor vê o painel agregado
select signed_up > 0 as tem_contas from adoption_summary();
select count(*) > 0 as tem_origens from adoption_by_source();
set request.jwt.sub='00000000-0000-0000-0000-000000000001';
\echo == M2f admin torna alguém gestor e a pessoa entra na lista de gestores
update profiles set app_role = 'gestor' where email = 'esp@x';
select app_role from profiles where email = 'esp@x';
reset role;
