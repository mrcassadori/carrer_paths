-- Contador de gasto da IA: a pessoa registra o próprio uso; só o agregado aparece, e só para quem vê Adoção.
\set ON_ERROR_STOP 0
set role authenticated;
set request.jwt.sub='00000000-0000-0000-0000-000000000003';
\echo == U1 colaborador registra o próprio uso (ok)
insert into ai_usage(feature, model, input_tokens, output_tokens, cost_usd) values ('ler-curriculo', 'claude-opus-5-5', 12000, 3000, 0.108);
\echo U2 colaborador registra uso em nome de outra pessoa (erro)
insert into ai_usage(profile_id, feature, model) values ('00000000-0000-0000-0000-000000000004', 'ler-curriculo', 'x');
\echo == U3 colaborador não lê a tabela (0) e não vê o resumo (erro)
select count(*) from ai_usage;
select * from ai_usage_summary();
set request.jwt.sub='00000000-0000-0000-0000-000000000006';
\echo == U4 especialista vê o total agregado (1 linha, 15000 tokens)
select feature, calls, input_tokens + output_tokens as tokens, cost_usd from ai_usage_summary();
reset role;
