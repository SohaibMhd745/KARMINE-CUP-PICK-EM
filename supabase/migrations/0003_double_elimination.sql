-- =====================================================================
--  0003 — Format Play-offs Double Élimination
-- =====================================================================

-- 1. Mise à jour des étapes
insert into stages (code, label, bucket, order_index, points_per_correct, is_pickable, is_open) values
  ('group', 'Phase de groupe',    'group',    0, 0, false, false),
  ('cross', 'Cross Play Decider', 'playoffs', 1, 1, true,  false),
  ('r1',    'Round 1',            'playoffs', 2, 2, true,  false),
  ('r2',    'Round 2',            'playoffs', 3, 3, true,  false),
  ('r3',    'Round 3',            'playoffs', 4, 4, true,  false),
  ('r4',    'Grande finale',      'final',    5, 5, true,  false)
on conflict (code) do update
  set label       = excluded.label,
      bucket      = excluded.bucket,
      order_index = excluded.order_index,
      is_pickable = excluded.is_pickable;

-- 2. Mise à jour / insertion des matchs
insert into matches (stage_id, order_index, label, best_of, team_a_id, team_b_id)
select s.id, v.idx, v.label, v.bo, ta.id, tb.id
from (values
  ('cross', 1, 'Cross Play Decider — Match 1', 3, 'ZEUB'::text,                 'FEET AND FUN'::text),
  ('cross', 2, 'Cross Play Decider — Match 2', 3, 'DESTRUCTIVE CAPACITY',       'FULL TRUST'),
  ('r1',    1, 'Round 1 — Winner Bracket 1',   3, 'KANCEL CORP',                'WALL BREAKERS'),
  ('r1',    2, 'Round 1 — Winner Bracket 2',   3, 'KDAVRE CORP',                'GOONING CORP'),
  ('r1',    3, 'Round 1 — Lower Bracket 1',    3, null,                         null),
  ('r1',    4, 'Round 1 — Lower Bracket 2',    3, null,                         null),
  ('r2',    1, 'Round 2 — Winner Bracket',     3, null,                         null),
  ('r2',    2, 'Round 2 — Lower Bracket',      3, null,                         null),
  ('r3',    1, 'Round 3 — Lower Bracket',      3, null,                         null),
  ('r4',    1, 'Grande finale',                5, null,                         null)
) as v(stage_code, idx, label, bo, team_a, team_b)
join stages s on s.code = v.stage_code
left join teams ta on ta.name = v.team_a
left join teams tb on tb.name = v.team_b
on conflict (stage_id, order_index) do update
  set label   = excluded.label,
      best_of = excluded.best_of;

-- 3. Câblage du bracket (Winner/Loser propagation)
do $$
declare
  w record;
  v_target bigint;
  v_source bigint;
begin
  for w in
    select * from (values
      ('r1', 3, 'a', 'cross', 1, 'winner'),
      ('r1', 3, 'b', 'r1',    1, 'loser'),
      ('r1', 4, 'a', 'cross', 2, 'winner'),
      ('r1', 4, 'b', 'r1',    2, 'loser'),
      ('r2', 1, 'a', 'r1',    1, 'winner'),
      ('r2', 1, 'b', 'r1',    2, 'winner'),
      ('r2', 2, 'a', 'r1',    3, 'winner'),
      ('r2', 2, 'b', 'r1',    4, 'winner'),
      ('r3', 1, 'a', 'r2',    1, 'loser'),
      ('r3', 1, 'b', 'r2',    2, 'winner'),
      ('r4', 1, 'a', 'r2',    1, 'winner'),
      ('r4', 1, 'b', 'r3',    1, 'winner')
    ) as t(stage_code, order_index, slot, src_stage, src_order, src_type)
  loop
    select m.id into v_target
      from matches m join stages s on s.id = m.stage_id
     where s.code = w.stage_code and m.order_index = w.order_index;

    select m.id into v_source
      from matches m join stages s on s.id = m.stage_id
     where s.code = w.src_stage and m.order_index = w.src_order;

    if v_target is null or v_source is null then
      raise exception 'Câblage impossible : % #% ou % #% introuvable',
        w.stage_code, w.order_index, w.src_stage, w.src_order;
    end if;

    if w.slot = 'a' then
      update matches
         set team_a_src_match = v_source, team_a_src_type = w.src_type
       where id = v_target;
    else
      update matches
         set team_b_src_match = v_source, team_b_src_type = w.src_type
       where id = v_target;
    end if;
  end loop;
end $$;

-- 4. Questions Boule de Cristal pour la Grande Finale (r4)
insert into questions (stage_id, code, label, kind, points, order_index)
select s.id, v.code, v.label, v.kind, v.points, v.idx
from (values
  ('r4',    'r4_champion',       'Équipe championne',               'team',     5, 1),
  ('r4',    'r4_best_kda',       'Meilleur KDA de la finale',       'player',   2, 2),
  ('r4',    'r4_most_banned',    'Champion le plus banni',          'champion', 2, 3),
  ('r4',    'r4_first_ace',      'Première équipe à faire un ace',  'team',     2, 4),
  ('r4',    'r4_most_deaths',    'Joueur avec le plus de morts',    'player',   2, 5),
  ('r4',    'r4_best_vision',    'Meilleur score de vision',        'player',   2, 6),
  ('r4',    'r4_pentakill',      'Un pentakill sera réalisé',       'boolean',  3, 7),
  ('r4',    'r4_most_played',    'Champion le plus joué',           'champion', 2, 8)
) as v(stage_code, code, label, kind, points, idx)
join stages s on s.code = v.stage_code
on conflict (code) do nothing;
