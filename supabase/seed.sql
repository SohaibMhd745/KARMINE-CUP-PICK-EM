-- =====================================================================
--  KARMINE CUP PICK'EM — données initiales
-- =====================================================================
--  Toutes les données proviennent du prototype `legacy/index.html`.
--  Script IDEMPOTENT : rejouable autant de fois que nécessaire.
--
--  À exécuter APRÈS 0001_init.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ÉQUIPES
--    Les `seed` sont recalculés depuis les vainqueurs de poule du
--    prototype (`groups.winners`) :
--      SYLVARIS  KANCEL 3-0 · GOONING 2-1 · ZEUB 1-2 · FULL TRUST 0-3
--      KARMINEA  KDAVRE 3-0 · WALL BREAKERS 2-1 · DEST. CAPACITY 1-2 · FEET&FUN 0-3
-- ---------------------------------------------------------------------

insert into teams (name, short_code, group_name, seed) values
  ('KANCEL CORP',          'KAN', 'SYLVARIS', 1),
  ('GOONING CORP',         'GOO', 'SYLVARIS', 2),
  ('ZEUB',                 'ZEU', 'SYLVARIS', 3),
  ('FULL TRUST',           'FUL', 'SYLVARIS', 4),
  ('KDAVRE CORP',          'KDA', 'KARMINEA', 1),
  ('WALL BREAKERS',        'WAL', 'KARMINEA', 2),
  ('DESTRUCTIVE CAPACITY', 'DES', 'KARMINEA', 3),
  ('FEET AND FUN',         'FEE', 'KARMINEA', 4)
on conflict (name) do update
  set short_code = excluded.short_code,
      group_name = excluded.group_name,
      seed       = excluded.seed;

-- ---------------------------------------------------------------------
-- 2. ÉTAPES
--    Barème par défaut — ajustable dans l'admin sans redéploiement.
--    `is_open = false` partout : rien n'est pronosticable tant que
--    l'organisateur n'a pas ouvert le round explicitement.
-- ---------------------------------------------------------------------

insert into stages (code, label, bucket, order_index, points_per_correct, is_pickable, is_open) values
  ('group', 'Phase de groupe',    'group',    0, 0, false, false),
  ('cross', 'Cross Play Decider', 'playoffs', 1, 1, true,  false),
  ('r1',    'Quarts de finale',   'playoffs', 2, 2, true,  false),
  ('r2',    'Demi-finales',       'playoffs', 3, 3, true,  false),
  ('r3',    'Grande finale',      'final',    4, 5, true,  false)
on conflict (code) do update
  set label       = excluded.label,
      bucket      = excluded.bucket,
      order_index = excluded.order_index,
      is_pickable = excluded.is_pickable;
-- NB : `points_per_correct` et `is_open` ne sont volontairement PAS
-- réécrits ici, pour qu'un re-run du seed n'annule pas tes réglages.

-- ---------------------------------------------------------------------
-- 3. PHASE DE GROUPE — archive en lecture seule
-- ---------------------------------------------------------------------

insert into matches (stage_id, order_index, label, best_of, team_a_id, team_b_id, status, winner_team_id)
select s.id, v.idx, v.label, 1, ta.id, tb.id, 'done', tw.id
from (values
  ( 1, 'SYLVARIS — Match 1', 'KANCEL CORP',          'FULL TRUST',    'KANCEL CORP'),
  ( 2, 'SYLVARIS — Match 2', 'ZEUB',                 'GOONING CORP',  'GOONING CORP'),
  ( 3, 'SYLVARIS — Match 3', 'KANCEL CORP',          'ZEUB',          'KANCEL CORP'),
  ( 4, 'SYLVARIS — Match 4', 'FULL TRUST',           'GOONING CORP',  'GOONING CORP'),
  ( 5, 'SYLVARIS — Match 5', 'KANCEL CORP',          'GOONING CORP',  'KANCEL CORP'),
  ( 6, 'SYLVARIS — Match 6', 'FULL TRUST',           'ZEUB',          'ZEUB'),
  ( 7, 'KARMINEA — Match 1', 'DESTRUCTIVE CAPACITY', 'FEET AND FUN',  'DESTRUCTIVE CAPACITY'),
  ( 8, 'KARMINEA — Match 2', 'KDAVRE CORP',          'WALL BREAKERS', 'KDAVRE CORP'),
  ( 9, 'KARMINEA — Match 3', 'DESTRUCTIVE CAPACITY', 'KDAVRE CORP',   'KDAVRE CORP'),
  (10, 'KARMINEA — Match 4', 'FEET AND FUN',         'WALL BREAKERS', 'WALL BREAKERS'),
  (11, 'KARMINEA — Match 5', 'DESTRUCTIVE CAPACITY', 'WALL BREAKERS', 'WALL BREAKERS'),
  (12, 'KARMINEA — Match 6', 'FEET AND FUN',         'KDAVRE CORP',   'KDAVRE CORP')
) as v(idx, label, team_a, team_b, winner)
join stages s  on s.code   = 'group'
join teams  ta on ta.name  = v.team_a
join teams  tb on tb.name  = v.team_b
join teams  tw on tw.name  = v.winner
on conflict (stage_id, order_index) do nothing;

-- ---------------------------------------------------------------------
-- 4. PLAY-OFFS — 8 équipes en simple élimination
--
--    CROSS-PLAY (seeding)        R1 — QUARTS              R2 — DEMIES     R3
--    C1 ZEUB    vs FEET&FUN      M1 KANCEL vs WALLBREAK.  S1 v.M1 v.M3    F  v.S1
--    C2 DEST.CAP vs FULL TRUST   M2 KDAVRE vs GOONING     S2 v.M2 v.M4       v.S2
--                                M3 v.C1   vs v.C2
--                                M4 p.C1   vs p.C2
-- ---------------------------------------------------------------------

insert into matches (stage_id, order_index, label, best_of, team_a_id, team_b_id)
select s.id, v.idx, v.label, v.bo, ta.id, tb.id
from (values
  ('cross', 1, 'Cross Play Decider — Match 1', 3, 'ZEUB'::text,                 'FEET AND FUN'::text),
  ('cross', 2, 'Cross Play Decider — Match 2', 3, 'DESTRUCTIVE CAPACITY',       'FULL TRUST'),
  ('r1',    1, 'Quart de finale 1',            3, 'KANCEL CORP',                'WALL BREAKERS'),
  ('r1',    2, 'Quart de finale 2',            3, 'KDAVRE CORP',                'GOONING CORP'),
  ('r1',    3, 'Quart de finale 3',            3, null,                         null),
  ('r1',    4, 'Quart de finale 4',            3, null,                         null),
  ('r2',    1, 'Demi-finale 1',                3, null,                         null),
  ('r2',    2, 'Demi-finale 2',                3, null,                         null),
  ('r3',    1, 'Grande finale',                5, null,                         null)
) as v(stage_code, idx, label, bo, team_a, team_b)
join stages s on s.code = v.stage_code
left join teams ta on ta.name = v.team_a
left join teams tb on tb.name = v.team_b
on conflict (stage_id, order_index) do nothing;

-- Câblage du bracket : chaque slot vide pointe vers le vainqueur ou le
-- perdant d'un match amont. Le trigger `propagate_bracket()` fera le reste.
do $$
declare
  w record;
  v_target bigint;
  v_source bigint;
begin
  for w in
    select * from (values
      ('r1', 3, 'a', 'cross', 1, 'winner'),
      ('r1', 3, 'b', 'cross', 2, 'winner'),
      ('r1', 4, 'a', 'cross', 1, 'loser'),
      ('r1', 4, 'b', 'cross', 2, 'loser'),
      ('r2', 1, 'a', 'r1',    1, 'winner'),
      ('r2', 1, 'b', 'r1',    3, 'winner'),
      ('r2', 2, 'a', 'r1',    2, 'winner'),
      ('r2', 2, 'b', 'r1',    4, 'winner'),
      ('r3', 1, 'a', 'r2',    1, 'winner'),
      ('r3', 1, 'b', 'r2',    2, 'winner')
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

-- ---------------------------------------------------------------------
-- 5. ROSTER — les 40 joueurs du tournoi (8 équipes × 5)
--
--    ATTENTION : ne pas confondre avec les 58 PARTICIPANTS du pick'em
--    (table `legacy_scores`). Ce sont deux populations différentes, qui
--    se recoupent partiellement.
--
--    15 rattachements sont déduits des préfixes du classement Excel
--    (« [KDAVRE CORP] Denis », « [Feet&Fun] Xofyx », ...).
--    Les 25 autres joueurs sont sans équipe : à compléter dans l'admin.
--    Non bloquant — les questions KDA / morts / vision portent sur le
--    joueur, l'équipe n'est qu'un confort d'affichage.
-- ---------------------------------------------------------------------

insert into tournament_players (ign, team_id)
select v.ign, t.id
from (values
  -- rattachements déduits de l'Excel
  ('Florian',   'KANCEL CORP'::text),
  ('Z3RO',      'WALL BREAKERS'),
  ('Neptunew',  'DESTRUCTIVE CAPACITY'),
  ('Lowan',     'GOONING CORP'),
  ('Lornyk',    'GOONING CORP'),
  ('Denis',     'KDAVRE CORP'),
  ('Souheyl',   'KDAVRE CORP'),
  ('Deleo',     'KDAVRE CORP'),
  ('Sadaps_',   'ZEUB'),
  ('Gahann',    'ZEUB'),
  ('Lennarel',  'FEET AND FUN'),
  ('Xofyx',     'FEET AND FUN'),
  ('Blueiix',   'FEET AND FUN'),
  ('Pauシ',     'FEET AND FUN'),
  ('XaleCl',    'FULL TRUST'),
  -- équipe à renseigner dans l'admin
  ('Pablo',     null), ('KC Keria',  null), ('Hedro',     null),
  ('Shige',     null), ('Yngvar',    null), ('Aynashaa',  null),
  ('Hoshi',     null), ('Lefwan',    null), ('LowResse',  null),
  ('HappyDridri', null), ('Namas',   null), ('Zeclipses', null),
  ('Basil',     null), ('Dest3ye',   null), ('Alan',      null),
  ('Oscar',     null), ('Termidi',   null), ('Frix',      null),
  ('Hatim',     null), ('Hichem',    null), ('muzeyyi',   null),
  ('SSIAP',     null), ('Rayou',     null), ('Aekiro',    null),
  ('Ofzebendo', null)
) as v(ign, team_name)
left join teams t on t.name = v.team_name
on conflict (ign) do nothing;

-- ---------------------------------------------------------------------
-- 6. SCORES DE POULE IMPORTÉS DE L'EXCEL (58 participants)
--    Les alias SONT les pseudos Discord : `auto_link_alias()`
--    (migration 0002) rattache chaque ligne au compte correspondant dès
--    l'inscription. L'organisateur n'arbitre que les cas douteux —
--    préfixe d'équipe sans crochets, homonymes, alias en double
--    (« Lornyk » / « [GOONING] Lornyk »).
--    En attendant, ces lignes apparaissent quand même au classement
--    (vue `leaderboard`), marquées « non rattaché ».
-- ---------------------------------------------------------------------

insert into legacy_scores (alias, group_points) values
  ('Sohalia', 8), ('[Kancel Team] Florian', 8), ('[Wall Breakers] Z3RO', 8),
  ('Sluje', 7), ('Mahyster', 6), ('rwby', 6),
  ('Aynashaa', 5), ('HappyDridri', 5),
  ('Ashway', 4), ('Basil', 4), ('Shige', 4), ('Termidi', 4), ('solartum', 4),
  ('4Fingers', 3), ('Aekiro', 3), ('Mori', 3), ('Ofzebendo', 3), ('Pablo', 3),
  ('[Dest. Capacity] Neptunew', 3), ('[GOONING] Lowan', 3), ('[KDAVRE CORP] Denis', 3),
  ('Alan ☀', 2), ('Birouf', 2), ('Jpremy', 2), ('KC Keria', 2), ('LowResse', 2),
  ('Rayou', 2), ('ZEUB Camthalion', 2), ('Zackk', 2), ('[KDAVRE CORP] Souheyl', 2),
  ('[Kadavre Corp] Deleo', 2), ('[ZEUB] Sadaps_', 2),
  ('Dest3ye', 1), ('Hedro', 1), ('Izuna', 1), ('Lornyk', 1), ('Oscar', 1),
  ('Pauシ', 1), ('Yngvar', 1), ('Zeclipses', 1), ('[Feet&Fun] Lennarel', 1),
  ('[Feet&Fun] Xofyx', 1), ('[Full Trust] XaleCl', 1), ('[GOONING] Lornyk', 1),
  ('Eagle', 0), ('Frix', 0), ('Gahann', 0), ('Hatim', 0), ('Hichem', 0),
  ('Lefwan', 0), ('Pau2', 0), ('ROI DES GWERS', 0), ('Shinox', 0),
  ('[Feet&Fun] Blueiix', 0), ('[Feet&Fun]Pauシ', 0), ('[ZEUB] Gahann', 0),
  ('ju', 0), ('魔', 0)
on conflict (alias) do update set group_points = excluded.group_points;

-- ---------------------------------------------------------------------
-- 7. BOULE DE CRISTAL
--    Toutes fermées par défaut (`is_open = false`) : l'organisateur
--    ouvre celles qu'il veut, round par round.
--    `kind` détermine la source des options côté application :
--      team → table teams · player → tournament_players · champion → lib/champions.ts
-- ---------------------------------------------------------------------

insert into questions (stage_id, code, label, kind, points, order_index)
select s.id, v.code, v.label, v.kind, v.points, v.idx
from (values
  ('cross', 'cross_best_kda',    'Meilleur KDA du round',           'player',   2, 1),
  ('cross', 'cross_most_banned', 'Champion le plus banni',          'champion', 2, 2),
  ('cross', 'cross_first_ace',   'Première équipe à faire un ace',  'team',     2, 3),
  ('cross', 'cross_most_deaths', 'Joueur avec le plus de morts',    'player',   2, 4),
  ('cross', 'cross_best_vision', 'Meilleur score de vision',        'player',   2, 5),

  ('r1',    'r1_best_kda',       'Meilleur KDA du round',           'player',   2, 1),
  ('r1',    'r1_most_banned',    'Champion le plus banni',          'champion', 2, 2),
  ('r1',    'r1_first_ace',      'Première équipe à faire un ace',  'team',     2, 3),
  ('r1',    'r1_most_deaths',    'Joueur avec le plus de morts',    'player',   2, 4),
  ('r1',    'r1_best_vision',    'Meilleur score de vision',        'player',   2, 5),

  ('r2',    'r2_best_kda',       'Meilleur KDA du round',           'player',   2, 1),
  ('r2',    'r2_most_banned',    'Champion le plus banni',          'champion', 2, 2),
  ('r2',    'r2_first_ace',      'Première équipe à faire un ace',  'team',     2, 3),
  ('r2',    'r2_most_deaths',    'Joueur avec le plus de morts',    'player',   2, 4),
  ('r2',    'r2_best_vision',    'Meilleur score de vision',        'player',   2, 5),

  ('r3',    'r3_champion',       'Équipe championne',               'team',     5, 1),
  ('r3',    'r3_best_kda',       'Meilleur KDA de la finale',       'player',   2, 2),
  ('r3',    'r3_most_banned',    'Champion le plus banni',          'champion', 2, 3),
  ('r3',    'r3_first_ace',      'Première équipe à faire un ace',  'team',     2, 4),
  ('r3',    'r3_most_deaths',    'Joueur avec le plus de morts',    'player',   2, 5),
  ('r3',    'r3_best_vision',    'Meilleur score de vision',        'player',   2, 6),
  ('r3',    'r3_pentakill',      'Un pentakill sera réalisé',       'boolean',  3, 7),
  ('r3',    'r3_most_played',    'Champion le plus joué',           'champion', 2, 8)
) as v(stage_code, code, label, kind, points, idx)
join stages s on s.code = v.stage_code
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 8. STREAMS
-- ---------------------------------------------------------------------

insert into streams (display_name, url, order_index) values
  ('ROÏ DES GWERS', 'https://www.twitch.tv/hoshisbackk', 1),
  ('SHIGE',         'https://www.twitch.tv/shige_rl',     2),
  ('SOUHEYL',       'https://www.twitch.tv/souheylk',     3),
  ('DENIS',         'https://www.twitch.tv/petitdeniis',  4),
  ('ALAN ☀',        'https://www.twitch.tv/soleilalan',   5),
  ('LOWAN',         'https://www.twitch.tv/loacht',       6),
  ('NAMAS',         'https://www.twitch.tv/namas_',       7)
on conflict (url) do update
  set display_name = excluded.display_name,
      order_index  = excluded.order_index;

-- ---------------------------------------------------------------------
-- 9. RÉGLAGES ÉDITORIAUX (page Règlement)
-- ---------------------------------------------------------------------

insert into settings (key, value) values
  ('tournament_name', '"Karmine Cup"'::jsonb),
  ('tagline',         '"Pick''em communautaire"'::jsonb),
  ('prizes',          '"Des lots récompensent le haut du classement général à l''issue de la grande finale."'::jsonb),
  ('tiebreak',        '"En cas d''égalité au total : 1) le plus de points sur la finale, 2) le plus de points sur les play-offs, 3) le pronostic enregistré le plus tôt."'::jsonb)
on conflict (key) do nothing;

-- =====================================================================
--  CONTRÔLES — doivent tous renvoyer OK
-- =====================================================================
do $$
declare n int;
begin
  select count(*) into n from teams;
  assert n = 8, format('attendu 8 équipes, trouvé %s', n);

  select count(*) into n from matches m join stages s on s.id = m.stage_id where s.code = 'group';
  assert n = 12, format('attendu 12 matchs de poule, trouvé %s', n);

  select count(*) into n from matches m join stages s on s.id = m.stage_id where s.code <> 'group';
  assert n = 9, format('attendu 9 matchs de play-offs, trouvé %s', n);

  select count(*) into n from matches
   where team_a_src_match is not null or team_b_src_match is not null;
  assert n = 5, format('attendu 5 matchs câblés, trouvé %s', n);

  select count(*) into n from tournament_players;
  assert n = 40, format('attendu 40 joueurs, trouvé %s', n);

  select count(*) into n from legacy_scores;
  assert n = 58, format('attendu 58 participants Excel, trouvé %s', n);

  raise notice 'Seed OK : 8 équipes · 21 matchs · 40 joueurs · 58 participants · % questions',
    (select count(*) from questions);
end $$;
