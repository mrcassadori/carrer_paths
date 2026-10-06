-- Marco 4: líder avalia ao lado da autoavaliação, sem mexer na nota nem no currículo da pessoa.
\set ON_ERROR_STOP 0
update review_cycles set evidence_required_from = 6;  -- volta à regra do MVP (o teste 10 usa a antiga)
set role authenticated;
set request.jwt.sub='00000000-0000-0000-0000-000000000007';
update profiles set full_name='Pessoa Teams', first_login_at=now(), job_title='UX Designer', job_summary='Squad X', hire_date='2023-01-01', level_since='2024-01-01',
  track_id=(select id from career_tracks where slug='product-design'), level_id=(select id from career_levels where code='N2') where id=auth.uid();
select start_my_assessment() as aid \gset
update assessment_scores set self_score=3 where assessment_id=:'aid';
insert into courses(profile_id, name) values (auth.uid(), 'Curso de UX') returning id as curso \gset
\echo == L1 envia sem evidência vinculada (ok no MVP)
select submit_assessment(:'aid');
select status from assessments where id=:'aid';
\echo L2 pessoa escreve a descrição do líder (erro)
select save_leader_note(:'aid', 'eu mesmo');
set request.jwt.sub='00000000-0000-0000-0000-000000000002';
\echo == L3 líder inicia, dá nota diferente com justificativa e descreve (ok)
select start_review(:'aid');
update assessment_scores set leader_score=2, justification='Testes conduzidos com apoio'
  where assessment_id=:'aid' and skill_id=(select id from skills where slug='pesquisa-qualitativa');
select save_leader_note(:'aid', '  Boa evolução em pesquisa.  ');
\echo == L4 líder concorda com o restante (retorna quantas skills preencheu, > 0)
select accept_remaining_scores(:'aid') > 0 as preencheu;
\echo == L5 líder não altera o currículo da pessoa (0 linhas alteradas) nem cria item nele (erro)
update courses set name='Outro' where id=:'curso' returning id;
insert into courses(profile_id, name) values ('00000000-0000-0000-0000-000000000007', 'X');
\echo == L6 líder valida; a nota da pessoa continua 3 e a do líder fica ao lado
select validate_assessment(:'aid');
select sc.self_score, sc.leader_score, sc.validated_score, sc.justification
  from assessment_scores sc join skills s on s.id=sc.skill_id where sc.assessment_id=:'aid' and s.slug='pesquisa-qualitativa';
select status, leader_note from assessments where id=:'aid';
\echo L7 líder muda a descrição depois de validada (erro)
select save_leader_note(:'aid', 'mudou');
set request.jwt.sub='00000000-0000-0000-0000-000000000005';
\echo L8 accept_remaining por quem não revisa não altera nada (0)
select accept_remaining_scores(:'aid');
reset role;
