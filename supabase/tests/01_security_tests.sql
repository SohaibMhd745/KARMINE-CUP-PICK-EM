-- =====================================================================
--  Tests de comportement : verrouillage, RLS, propagation, scoring.
--  Chaque test affiche OK ou fait échouer le script.
-- =====================================================================

-- Les grants par défaut sont posés dans 00_stub.sql, AVANT la migration,
-- comme le fait Supabase. Ne rien re-grant ici : cela masquerait les
-- REVOKE de protection de la colonne `points`.

-- Trois comptes : un organisateur, deux participants.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'admin@test.fr',
   '{"provider_id":"100000000000000001","full_name":"Orga"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'joueur@test.fr',
   '{"provider_id":"100000000000000002","full_name":"Joueur"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'tiers@test.fr',
   '{"provider_id":"100000000000000003","full_name":"Tiers"}'::jsonb)
on conflict do nothing;

do $$
declare n int;
begin
  select count(*) into n from profiles;
  assert n = 3, format('trigger handle_new_user : attendu 3 profils, trouvé %s', n);
  raise notice 'OK  1. handle_new_user() crée bien le profil à l''inscription';
end $$;

update profiles set is_admin = true where id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------
-- 2. Un participant ne peut PAS se déclarer admin
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
begin
  update profiles set is_admin = true
   where id = '22222222-2222-2222-2222-222222222222';
  raise exception 'ÉCHEC : l''escalade de privilèges a été acceptée';
exception
  when others then
    if sqlerrm like '%FORBIDDEN_ADMIN_CHANGE%' then
      raise notice 'OK  2. prevent_privilege_escalation() bloque l''auto-promotion';
    else
      raise;
    end if;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- 3. Round fermé → pronostic refusé
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare v_match bigint; v_team bigint;
begin
  select m.id, m.team_a_id into v_match, v_team
    from matches m join stages s on s.id = m.stage_id
   where s.code = 'cross' and m.order_index = 1;

  insert into picks (user_id, match_id, team_id)
  values ('22222222-2222-2222-2222-222222222222', v_match, v_team);

  raise exception 'ÉCHEC : pronostic accepté sur un round fermé';
exception
  when others then
    if sqlerrm like '%ROUND_CLOSED%' then
      raise notice 'OK  3. enforce_pick_window() refuse un round fermé';
    else raise; end if;
end $$;
rollback;

-- L'organisateur ouvre le cross-play, avec une date limite dans le futur.
update stages
   set is_open = true, locks_at = now() + interval '2 hours'
 where code = 'cross';

-- ---------------------------------------------------------------------
-- 4. Round ouvert → pronostic accepté, puis modifiable
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare v_match bigint; v_a bigint; v_b bigint; n int;
begin
  select m.id, m.team_a_id, m.team_b_id into v_match, v_a, v_b
    from matches m join stages s on s.id = m.stage_id
   where s.code = 'cross' and m.order_index = 1;

  insert into picks (user_id, match_id, team_id)
  values ('22222222-2222-2222-2222-222222222222', v_match, v_a);

  -- modification (upsert) vers l'autre équipe
  insert into picks (user_id, match_id, team_id)
  values ('22222222-2222-2222-2222-222222222222', v_match, v_b)
  on conflict (user_id, match_id) do update set team_id = excluded.team_id;

  select count(*) into n from picks
   where user_id = '22222222-2222-2222-2222-222222222222';
  assert n = 1, format('attendu 1 pronostic après upsert, trouvé %s', n);

  -- on fige le choix sur ZEUB (slot A), qui gagnera au test 11
  insert into picks (user_id, match_id, team_id)
  values ('22222222-2222-2222-2222-222222222222', v_match, v_a)
  on conflict (user_id, match_id) do update set team_id = excluded.team_id;

  raise notice 'OK  4. pronostic enregistré puis modifiable (upsert)';
end $$;
commit;

-- ---------------------------------------------------------------------
-- 5. Équipe hors du match → refusé
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare v_match bigint; v_other bigint;
begin
  select m.id into v_match from matches m join stages s on s.id = m.stage_id
   where s.code = 'cross' and m.order_index = 1;
  select id into v_other from teams where name = 'KANCEL CORP';

  insert into picks (user_id, match_id, team_id)
  values ('22222222-2222-2222-2222-222222222222', v_match, v_other)
  on conflict (user_id, match_id) do update set team_id = excluded.team_id;

  raise exception 'ÉCHEC : équipe étrangère au match acceptée';
exception
  when others then
    if sqlerrm like '%INVALID_TEAM%' then
      raise notice 'OK  5. enforce_pick_window() refuse une équipe hors du match';
    else raise; end if;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- 6. Pronostic au nom d'un tiers → refusé par la RLS
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare v_match bigint; v_team bigint;
begin
  select m.id, m.team_a_id into v_match, v_team
    from matches m join stages s on s.id = m.stage_id
   where s.code = 'cross' and m.order_index = 2;

  insert into picks (user_id, match_id, team_id)
  values ('33333333-3333-3333-3333-333333333333', v_match, v_team);

  raise exception 'ÉCHEC : pronostic au nom d''un tiers accepté';
exception
  when insufficient_privilege then
    raise notice 'OK  6. RLS refuse un pronostic au nom d''un tiers';
  when others then
    if sqlerrm like '%row-level security%' then
      raise notice 'OK  6. RLS refuse un pronostic au nom d''un tiers';
    else raise; end if;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- 7. Les pronostics d'autrui sont invisibles
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

do $$
declare n int;
begin
  select count(*) into n from picks;
  assert n = 0, format('fuite : un tiers voit %s pronostic(s)', n);
  raise notice 'OK  7. RLS : les pronostics d''autrui sont invisibles';
end $$;
rollback;

-- ---------------------------------------------------------------------
-- 8. Slots inconnus → pronostic refusé
-- ---------------------------------------------------------------------
update stages set is_open = true, locks_at = now() + interval '5 hours' where code = 'r1';

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare v_match bigint;
begin
  select m.id into v_match from matches m join stages s on s.id = m.stage_id
   where s.code = 'r1' and m.order_index = 3;

  insert into picks (user_id, match_id, team_id)
  values ('22222222-2222-2222-2222-222222222222', v_match, 1);

  raise exception 'ÉCHEC : pronostic accepté sur un match sans équipes';
exception
  when others then
    if sqlerrm like '%MATCH_NOT_READY%' then
      raise notice 'OK  8. enforce_pick_window() refuse un match aux slots vides';
    else raise; end if;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- 9. Date limite dépassée → refusé (le cœur de l'intégrité du jeu)
-- ---------------------------------------------------------------------
update stages set locks_at = now() - interval '1 minute' where code = 'cross';

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare v_match bigint; v_a bigint;
begin
  select m.id, m.team_a_id into v_match, v_a
    from matches m join stages s on s.id = m.stage_id
   where s.code = 'cross' and m.order_index = 1;

  insert into picks (user_id, match_id, team_id)
  values ('22222222-2222-2222-2222-222222222222', v_match, v_a)
  on conflict (user_id, match_id) do update set team_id = excluded.team_id;

  raise exception 'ÉCHEC : pronostic accepté après la date limite';
exception
  when others then
    if sqlerrm like '%PICKS_LOCKED%' then
      raise notice 'OK  9. enforce_pick_window() refuse un pronostic hors délai';
    else raise; end if;
end $$;
rollback;

update stages set locks_at = now() + interval '2 hours' where code = 'cross';

-- Un second participant pronostique le match C2, et se trompera.
-- (placé ici, après le test d'invisibilité qui exige qu'il n'ait rien joué)
begin;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

do $$
declare v_match bigint; v_a bigint;
begin
  select m.id, m.team_a_id into v_match, v_a
    from matches m join stages s on s.id = m.stage_id
   where s.code = 'cross' and m.order_index = 2;

  -- DESTRUCTIVE CAPACITY (slot A) ; c'est FULL TRUST qui gagnera
  insert into picks (user_id, match_id, team_id)
  values ('33333333-3333-3333-3333-333333333333', v_match, v_a);
end $$;
commit;

-- ---------------------------------------------------------------------
-- 10. Un non-admin ne peut pas publier de résultat
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare v_match bigint; n int;
begin
  select m.id into v_match from matches m join stages s on s.id = m.stage_id
   where s.code = 'cross' and m.order_index = 1;

  update matches set status = 'done' where id = v_match;
  get diagnostics n = row_count;

  assert n = 0, 'ÉCHEC : un participant a pu modifier un match';
  raise notice 'OK 10. RLS : un participant ne peut pas publier de résultat';
end $$;
rollback;

-- ---------------------------------------------------------------------
-- 11. L'admin publie → propagation du bracket + attribution des points
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare
  v_c1 bigint; v_c2 bigint; v_zeub bigint; v_feet bigint;
  v_dest bigint; v_full bigint;
  v_r1m3 bigint; v_r1m4 bigint;
  a bigint; b bigint;
begin
  select id into v_zeub from teams where name = 'ZEUB';
  select id into v_feet from teams where name = 'FEET AND FUN';
  select id into v_dest from teams where name = 'DESTRUCTIVE CAPACITY';
  select id into v_full from teams where name = 'FULL TRUST';

  select m.id into v_c1 from matches m join stages s on s.id = m.stage_id
   where s.code = 'cross' and m.order_index = 1;
  select m.id into v_c2 from matches m join stages s on s.id = m.stage_id
   where s.code = 'cross' and m.order_index = 2;
  select m.id into v_r1m3 from matches m join stages s on s.id = m.stage_id
   where s.code = 'r1' and m.order_index = 3;
  select m.id into v_r1m4 from matches m join stages s on s.id = m.stage_id
   where s.code = 'r1' and m.order_index = 4;

  update matches set winner_team_id = v_zeub, score_a = 2, score_b = 0, status = 'done'
   where id = v_c1;
  update matches set winner_team_id = v_full, score_a = 1, score_b = 2, status = 'done'
   where id = v_c2;

  -- R1 M3 = vainqueur C1 vs vainqueur C2
  select team_a_id, team_b_id into a, b from matches where id = v_r1m3;
  assert a = v_zeub, format('R1#3 slot A : attendu ZEUB, trouvé %s', a);
  assert b = v_full, format('R1#3 slot B : attendu FULL TRUST, trouvé %s', b);

  -- R1 M4 = perdant C1 vs perdant C2
  select team_a_id, team_b_id into a, b from matches where id = v_r1m4;
  assert a = v_feet, format('R1#4 slot A : attendu FEET AND FUN, trouvé %s', a);
  assert b = v_dest, format('R1#4 slot B : attendu DEST. CAPACITY, trouvé %s', b);

  raise notice 'OK 11. propagate_bracket() remplit les slots (vainqueurs ET perdants)';
end $$;
commit;

-- ---------------------------------------------------------------------
-- 12. Scoring automatique
-- ---------------------------------------------------------------------
do $$
declare v_good int; v_bad int; v_bareme int;
begin
  select points_per_correct into v_bareme from stages where code = 'cross';

  -- user2 avait choisi ZEUB, qui a gagné C1
  select points into v_good from picks
   where user_id = '22222222-2222-2222-2222-222222222222';

  -- user3 avait choisi DESTRUCTIVE CAPACITY, c'est FULL TRUST qui a gagné C2
  select points into v_bad from picks
   where user_id = '33333333-3333-3333-3333-333333333333';

  assert v_good = v_bareme,
    format('bon pronostic : attendu %s pt, trouvé %s', v_bareme, v_good);
  assert v_bad = 0,
    format('mauvais pronostic : attendu 0 pt, trouvé %s', v_bad);

  raise notice 'OK 12. bon pronostic → % pt · mauvais pronostic → 0 pt', v_bareme;
  raise notice 'OK 13. scoring déclenché automatiquement à la publication';
end $$;

-- ---------------------------------------------------------------------
-- 14. Changer le barème rescore l'historique
-- ---------------------------------------------------------------------
update stages set points_per_correct = 7 where code = 'cross';

do $$
declare v_points int;
begin
  select points into v_points from picks
   where user_id = '22222222-2222-2222-2222-222222222222';
  assert v_points = 7, format('rescoring : attendu 7 pts, trouvé %s', v_points);
  raise notice 'OK 14. modifier le barème rescore immédiatement le round';
end $$;

update stages set points_per_correct = 1 where code = 'cross';

-- ---------------------------------------------------------------------
-- 15. Classement : comptes Discord + alias Excel non rattachés
-- ---------------------------------------------------------------------
do $$
declare n_total int; n_ghost int; v_pos int; v_total int;
begin
  select count(*) into n_total from leaderboard;
  select count(*) into n_ghost from leaderboard where is_ghost;

  -- 3 comptes + 58 alias non rattachés
  assert n_total = 61, format('leaderboard : attendu 61 lignes, trouvé %s', n_total);
  assert n_ghost = 58, format('leaderboard : attendu 58 alias fantômes, trouvé %s', n_ghost);

  select position, total_points into v_pos, v_total
    from leaderboard where user_id = '22222222-2222-2222-2222-222222222222';
  assert v_total = 1, format('total du participant : attendu 1, trouvé %s', v_total);

  raise notice 'OK 15. leaderboard : % lignes dont % alias non rattachés', n_total, n_ghost;
end $$;

-- ---------------------------------------------------------------------
-- 16. Rattachement d'un alias Excel → le score de poule est repris
-- ---------------------------------------------------------------------
update legacy_scores
   set claimed_by = '22222222-2222-2222-2222-222222222222'
 where alias = 'Sohalia';   -- 8 points de poule

do $$
declare v_group int; v_total int; n_total int;
begin
  select group_points, total_points into v_group, v_total
    from leaderboard where user_id = '22222222-2222-2222-2222-222222222222';

  assert v_group = 8, format('score de poule repris : attendu 8, trouvé %s', v_group);
  assert v_total = 9, format('total : attendu 9 (8 poule + 1 play-off), trouvé %s', v_total);

  select count(*) into n_total from leaderboard;
  assert n_total = 60, format('après rattachement : attendu 60 lignes, trouvé %s', n_total);

  raise notice 'OK 16. rattachement d''alias : 8 pts de poule + 1 pt play-off = 9';
end $$;

-- ---------------------------------------------------------------------
-- 17. Départage à égalité de total
-- ---------------------------------------------------------------------
do $$
declare v_ok boolean;
begin
  select bool_and(ord_ok) into v_ok from (
    select total_points <= lag(total_points) over (order by position) as ord_ok
    from leaderboard
  ) t where ord_ok is not null;

  assert v_ok, 'le classement n''est pas trié par total décroissant';
  raise notice 'OK 17. classement ordonné, positions déterministes';
end $$;

-- ---------------------------------------------------------------------
-- 18. Statistiques de pronostics masquées avant verrouillage
-- ---------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from match_pick_stats ms
    join matches m on m.id = ms.match_id
    join stages s on s.id = m.stage_id
   where m.status = 'pending'
     and coalesce(m.locks_at, s.locks_at) > now();

  assert n = 0, format('fuite : %s stat(s) exposée(s) sur un match encore ouvert', n);
  raise notice 'OK 18. match_pick_stats ne révèle rien avant verrouillage';
end $$;

-- ---------------------------------------------------------------------
-- 19. Boule de cristal : verrou et scoring
-- ---------------------------------------------------------------------
update questions set is_open = true where code = 'cross_most_banned';

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare v_q bigint;
begin
  select id into v_q from questions where code = 'cross_most_banned';
  insert into answers (user_id, question_id, value)
  values ('22222222-2222-2222-2222-222222222222', v_q, 'Yone');
  raise notice 'OK 19. réponse boule de cristal enregistrée';
end $$;
commit;

update questions set correct_value = 'Yone' where code = 'cross_most_banned';

do $$
declare v_points int; v_q bigint;
begin
  select id into v_q from questions where code = 'cross_most_banned';
  select points into v_points from answers where question_id = v_q;
  assert v_points = 2, format('attendu 2 pts sur la bonne réponse, trouvé %s', v_points);
  raise notice 'OK 20. publier la bonne réponse attribue les points';
end $$;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

do $$
declare v_q bigint;
begin
  select id into v_q from questions where code = 'cross_most_banned';
  insert into answers (user_id, question_id, value)
  values ('33333333-3333-3333-3333-333333333333', v_q, 'Yone');
  raise exception 'ÉCHEC : réponse acceptée après publication du résultat';
exception
  when others then
    if sqlerrm like '%QUESTION_RESOLVED%' then
      raise notice 'OK 21. impossible de répondre après publication de la réponse';
    else raise; end if;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- 22. Journal d'audit réservé aux admins
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare n int;
begin
  select count(*) into n from audit_log;
  assert n = 0, format('fuite : un participant lit %s ligne(s) d''audit', n);

  begin
    insert into audit_log (actor_id, action) values
      ('22222222-2222-2222-2222-222222222222', 'faux');
    raise exception 'ÉCHEC : un participant a pu écrire dans le journal d''audit';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm not like '%row-level security%' then raise; end if;
  end;

  raise notice 'OK 22. audit_log : lecture et écriture réservées aux admins';
end $$;
rollback;

-- ---------------------------------------------------------------------
-- 23. Un participant ne peut pas s'attribuer des points directement
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
begin
  begin
    update picks set points = 9999
     where user_id = '22222222-2222-2222-2222-222222222222';
    raise exception 'ÉCHEC : un participant a pu s''attribuer des points';
  exception
    when insufficient_privilege then
      raise notice 'OK 23. écriture directe sur picks.points refusée (grant colonne)';
    when others then
      if sqlerrm like '%permission denied%' then
        raise notice 'OK 23. écriture directe sur picks.points refusée (grant colonne)';
      else raise; end if;
  end;
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
begin
  begin
    update answers set points = 9999
     where user_id = '22222222-2222-2222-2222-222222222222';
    raise exception 'ÉCHEC : un participant a pu s''attribuer des points bonus';
  exception
    when insufficient_privilege then
      raise notice 'OK 24. écriture directe sur answers.points refusée';
    when others then
      if sqlerrm like '%permission denied%' then
        raise notice 'OK 24. écriture directe sur answers.points refusée';
      else raise; end if;
  end;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- 25. Effacer sa réponse tant que la question est ouverte
-- ---------------------------------------------------------------------
update questions set is_open = true, correct_value = null where code = 'cross_first_ace';

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare v_q bigint; n int;
begin
  select id into v_q from questions where code = 'cross_first_ace';

  insert into answers (user_id, question_id, value)
  values ('22222222-2222-2222-2222-222222222222', v_q, 'ZEUB');

  delete from answers
   where user_id = '22222222-2222-2222-2222-222222222222' and question_id = v_q;

  select count(*) into n from answers
   where user_id = '22222222-2222-2222-2222-222222222222' and question_id = v_q;
  assert n = 0, 'la réponse n''a pas pu être effacée';

  raise notice 'OK 25. un participant peut effacer sa réponse (question ouverte)';
end $$;
rollback;

do $$ begin raise notice '';
  raise notice '=== TOUS LES TESTS SONT PASSÉS ==='; end $$;
