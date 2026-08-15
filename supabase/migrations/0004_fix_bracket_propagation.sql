-- =====================================================================
--  0004 — Correction de la propagation du bracket et synchronisation
-- =====================================================================

-- 1. S'assurer que les équipes initiales des premiers rounds sont bien définies
update matches m
set team_a_id = ta.id,
    team_b_id = tb.id
from stages s
cross join (select id from teams where name = 'ZEUB') ta
cross join (select id from teams where name = 'FEET AND FUN') tb
where m.stage_id = s.id and s.code = 'cross' and m.order_index = 1 and (m.team_a_id is null or m.team_b_id is null);

update matches m
set team_a_id = ta.id,
    team_b_id = tb.id
from stages s
cross join (select id from teams where name = 'DESTRUCTIVE CAPACITY') ta
cross join (select id from teams where name = 'FULL TRUST') tb
where m.stage_id = s.id and s.code = 'cross' and m.order_index = 2 and (m.team_a_id is null or m.team_b_id is null);

update matches m
set team_a_id = ta.id,
    team_b_id = tb.id
from stages s
cross join (select id from teams where name = 'KANCEL CORP') ta
cross join (select id from teams where name = 'WALL BREAKERS') tb
where m.stage_id = s.id and s.code = 'r1' and m.order_index = 1 and (m.team_a_id is null or m.team_b_id is null);

update matches m
set team_a_id = ta.id,
    team_b_id = tb.id
from stages s
cross join (select id from teams where name = 'KDAVRE CORP') ta
cross join (select id from teams where name = 'GOONING CORP') tb
where m.stage_id = s.id and s.code = 'r1' and m.order_index = 2 and (m.team_a_id is null or m.team_b_id is null);

-- 2. Fonction de propagation pour un match donné
create or replace function public.propagate_match_bracket(p_match_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  v_winner bigint;
  v_loser bigint;
begin
  select * into m from matches where id = p_match_id;
  if not found then
    return;
  end if;

  if m.winner_team_id is null then
    -- Si le résultat est retiré, on vide les slots enfants pour les matchs non joués
    update matches set team_a_id = null
      where team_a_src_match = m.id and status = 'pending';
    update matches set team_b_id = null
      where team_b_src_match = m.id and status = 'pending';
    return;
  end if;

  v_winner := m.winner_team_id;
  v_loser := case
               when m.winner_team_id = m.team_a_id then m.team_b_id
               when m.winner_team_id = m.team_b_id then m.team_a_id
               else null
             end;

  update matches
     set team_a_id = case when team_a_src_type = 'winner' then v_winner else v_loser end,
         updated_at = now()
   where team_a_src_match = m.id and status = 'pending';

  update matches
     set team_b_id = case when team_b_src_type = 'winner' then v_winner else v_loser end,
         updated_at = now()
   where team_b_src_match = m.id and status = 'pending';
end;
$$;

-- 3. Fonction globale de propagation de l'ensemble du bracket
create or replace function public.propagate_all_brackets()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
begin
  -- Parcourt dans l'ordre chronologique des étapes et des matchs
  for m in
    select m.id
      from matches m
      join stages s on s.id = m.stage_id
     order by s.order_index asc, m.order_index asc
  loop
    perform public.propagate_match_bracket(m.id);
  end loop;
end;
$$;

-- 4. Trigger de propagation automatique
create or replace function public.propagate_bracket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.propagate_match_bracket(new.id);
  return new;
end;
$$;

drop trigger if exists matches_propagate on matches;
create trigger matches_propagate
  after update of winner_team_id, team_a_id, team_b_id on matches
  for each row
  execute function public.propagate_bracket();

-- 5. Inclure la propagation dans le rescoring global
create or replace function public.recompute_all_scores()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  -- 1. Propager d'abord tous les brackets pour que les matchs aval soient complets
  perform public.propagate_all_brackets();

  -- 2. Recalculer les points de tous les pronostics matchs
  update picks p
     set points = case
                    when m.winner_team_id is not null and m.winner_team_id = p.team_id
                    then s.points_per_correct
                    else 0
                  end
    from matches m
    join stages s on s.id = m.stage_id
   where p.match_id = m.id;

  -- 3. Recalculer les points des questions
  update answers a
     set points = case
                    when q.correct_value is not null
                     and lower(btrim(a.value)) = lower(btrim(q.correct_value))
                    then q.points
                    else 0
                  end
    from questions q
   where a.question_id = q.id;
end;
$$;

-- 6. Exécution immédiate pour corriger le bracket existant
select public.propagate_all_brackets();
