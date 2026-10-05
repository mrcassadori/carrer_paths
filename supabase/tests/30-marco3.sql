-- Marco 3: importação de currículo. Cada pessoa só vê e mexe nas próprias importações.
\set ON_ERROR_STOP 0
set role authenticated;
set request.jwt.sub='00000000-0000-0000-0000-000000000004';
\echo == M3a colaborador registra o envio e grava as sugestões
insert into resume_imports(profile_id, storage_path, file_name, mime_type)
  values (auth.uid(), auth.uid() || '/cv.pdf', 'cv.pdf', 'application/pdf') returning id as imp \gset
update resume_imports set status = 'pronto_para_revisao', extracted = '{"projects":[]}' where id = :'imp';
update resume_imports set status = 'aplicado', applied_at = now(), extracted = null where id = :'imp';
select status from resume_imports where id = :'imp';
\echo M3b colaborador registra envio no perfil de outra pessoa (erro)
insert into resume_imports(profile_id, storage_path, file_name, mime_type)
  values ('00000000-0000-0000-0000-000000000003', 'x/cv.pdf', 'cv.pdf', 'application/pdf');
set request.jwt.sub='00000000-0000-0000-0000-000000000003';
\echo == M3c outra pessoa não enxerga a importação (0 linhas)
select count(*) as visiveis from resume_imports where id = :'imp';
reset role;
