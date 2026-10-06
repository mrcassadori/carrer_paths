-- Marco 4: avaliação do líder da prática, lado a lado com a autoavaliação.
-- A nota da pessoa (self_score) nunca é alterada pelo líder; o líder dá a própria nota (leader_score),
-- justifica quando for diferente e deixa uma descrição geral (leader_note).

alter table assessments add column if not exists leader_note text;

-- Descrição geral do líder: só quem revisa, com a avaliação enviada ou em revisão
create or replace function save_leader_note(a uuid, note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_review_profile(assessment_owner(a)) or assessment_status_of(a) not in ('enviada', 'em_revisao') then
    raise exception 'Só o líder da prática escreve a descrição, com a avaliação enviada ou em revisão';
  end if;
  update assessments set leader_note = nullif(btrim(note), '') where id = a;
end $$;

-- Atalho do líder: concorda com a nota da pessoa em todas as skills que ainda não avaliou
create or replace function accept_remaining_scores(a uuid) returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update assessment_scores set leader_score = self_score
  where assessment_id = a and leader_score is null and self_score is not null;
  get diagnostics n = row_count;
  return n;
end $$;

-- O MVP não pede evidência vinculada a cada nota: o líder vê currículo e projetos na tela de avaliação
alter table review_cycles alter column evidence_required_from set default 6;
update review_cycles set evidence_required_from = 6;
