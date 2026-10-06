-- Carreira (empresas anteriores): o dono escreve; quem vê o perfil lê; outros times não.
\set ON_ERROR_STOP 0
set role authenticated;
set request.jwt.sub='00000000-0000-0000-0000-000000000003';
\echo == C1 colaborador adiciona empresa e passa a ter has_extra
insert into career_entries(profile_id, company, job_title, started_on, ended_on)
  values (auth.uid(), 'Agência X', 'Designer', '2019-01-01', '2021-06-01');
select has_extra from profile_overview where id = auth.uid();
\echo C2 colaborador grava carreira no perfil de outra pessoa (erro)
insert into career_entries(profile_id, company) values ('00000000-0000-0000-0000-000000000004', 'Y');
set request.jwt.sub='00000000-0000-0000-0000-000000000005';
\echo == C3 gestor direto lê (1 linha) e não consegue editar (0 linhas alteradas)
select count(*) as gestor_ve from career_entries where profile_id = '00000000-0000-0000-0000-000000000003';
update career_entries set company = 'Z' where profile_id = '00000000-0000-0000-0000-000000000003';
set request.jwt.sub='00000000-0000-0000-0000-000000000004';
\echo == C4 pessoa de outro time não enxerga (0 linhas)
select count(*) as outro_ve from career_entries where profile_id = '00000000-0000-0000-0000-000000000003';
reset role;
