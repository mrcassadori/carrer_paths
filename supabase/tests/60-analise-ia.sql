-- Análise por IA: a pessoa grava a própria; quem vê o perfil lê; ninguém grava no perfil de outro.
\set ON_ERROR_STOP 0
set role authenticated;
set request.jwt.sub='00000000-0000-0000-0000-000000000003';
\echo == A1 colaborador grava a própria análise (ok)
insert into profile_analyses(profile_id, content) values (auth.uid(), '{"resumo":"x"}');
\echo A2 colaborador grava análise no perfil de outra pessoa (erro)
insert into profile_analyses(profile_id, content) values ('00000000-0000-0000-0000-000000000004', '{}');
set request.jwt.sub='00000000-0000-0000-0000-000000000002';
\echo == A3 líder da prática lê (1) e não apaga (0 linhas)
select count(*) as lider_ve from profile_analyses where profile_id='00000000-0000-0000-0000-000000000003';
delete from profile_analyses where profile_id='00000000-0000-0000-0000-000000000003' returning id;
set request.jwt.sub='00000000-0000-0000-0000-000000000004';
\echo == A4 pessoa de outro time não lê (0)
select count(*) as outro_ve from profile_analyses where profile_id='00000000-0000-0000-0000-000000000003';
reset role;
