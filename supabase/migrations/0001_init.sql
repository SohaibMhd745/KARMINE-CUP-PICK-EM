-- =====================================================================
--  KARMINE CUP PICK'EM — schéma initial
-- =====================================================================
--  Principe directeur : l'application cliente n'est JAMAIS l'autorité.
--  Les deadlines, les droits admin et le calcul des points sont imposés
--  par Postgres (RLS + triggers). Un participant qui tape l'API Supabase
--  directement, sans passer par l'interface, ne peut rien contourner.
--
--  À appliquer dans l'éditeur SQL Supabase, ou via `supabase db push`.
-- =====================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------
-- 1. RÉFÉRENTIEL DU TOURNOI
-- ---------------------------------------------------------------------

create table if not exists teams (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  short_code  text not null,
  group_name  text,                       -- 'SYLVARIS' | 'KARMINEA'
  seed        int,                        -- rang final dans la poule (1..4)
  logo_url    text,
  created_at  timestamptz not null default now()
);

create table if not exists tournament_players (
  id       bigint generated always as identity primary key,
  team_id  bigint references teams (id) on delete set null,
  ign      text not null unique           -- pseudo en jeu
);

-- Un « stage » = une étape du tournoi (poule, cross-play, quarts, ...).
-- `bucket` pilote les colonnes du classement : Groupe / Play-offs / Finale.
create table if not exists stages (
  id                 bigint generated always as identity primary key,
  code               text not null unique,
  label              text not null,
  bucket             text not null default 'playoffs'
                     check (bucket in ('group', 'playoffs', 'final')),
  order_index        int  not null,
  points_per_correct int  not null default 1,
  is_pickable        boolean not null default true,  -- la poule est une archive
  is_open            boolean not null default false, -- interrupteur admin du round
  opens_at           timestamptz,
  locks_at           timestamptz,                    -- défaut si le match n'en a pas
  created_at         timestamptz not null default now()
);

-- Le câblage du bracket vit en DONNÉES, pas dans le code applicatif :
-- chaque slot peut pointer vers le vainqueur ou le perdant d'un autre match.
create table if not exists matches (
  id                bigint generated always as identity primary key,
  stage_id          bigint not null references stages (id) on delete cascade,
  order_index       int not null,
  label             text,
  best_of           int not null default 3,

  team_a_id         bigint references teams (id),
  team_b_id         bigint references teams (id),

  team_a_src_match  bigint references matches (id),
  team_a_src_type   text check (team_a_src_type in ('winner', 'loser')),
  team_b_src_match  bigint references matches (id),
  team_b_src_type   text check (team_b_src_type in ('winner', 'loser')),

  scheduled_at      timestamptz,
  locks_at          timestamptz,
  status            text not null default 'pending'
                    check (status in ('pending', 'live', 'done')),
  winner_team_id    bigint references teams (id),
  score_a           int,
  score_b           int,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (stage_id, order_index),
  -- un vainqueur doit être un des deux participants
  constraint winner_is_participant check (
    winner_team_id is null
    or winner_team_id = team_a_id
    or winner_team_id = team_b_id
  )
);

create index if not exists matches_stage_idx on matches (stage_id, order_index);
create index if not exists matches_src_a_idx on matches (team_a_src_match);
create index if not exists matches_src_b_idx on matches (team_b_src_match);

-- ---------------------------------------------------------------------
-- 2. COMPTES
-- ---------------------------------------------------------------------

create table if not exists profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  discord_id   text unique,
  display_name text not null,
  avatar_url   text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Scores de la phase de poule importés de l'Excel de Lisa.
-- `claimed_by` rattache un alias Excel à un compte Discord (mapping admin).
create table if not exists legacy_scores (
  alias        text primary key,
  group_points int not null default 0,
  claimed_by   uuid unique references profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. PRONOSTICS
-- ---------------------------------------------------------------------

create table if not exists picks (
  id         bigint generated always as identity primary key,
  user_id    uuid   not null references profiles (id) on delete cascade,
  match_id   bigint not null references matches (id) on delete cascade,
  team_id    bigint not null references teams (id),
  points     int    not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create index if not exists picks_match_idx on picks (match_id);
create index if not exists picks_user_idx  on picks (user_id);

-- « Boule de cristal » : questions bonus, entièrement pilotées par la base.
create table if not exists questions (
  id            bigint generated always as identity primary key,
  stage_id      bigint references stages (id) on delete cascade,
  code          text not null unique,
  label         text not null,
  kind          text not null check (kind in ('team', 'player', 'champion', 'boolean', 'number')),
  points        int  not null default 2,
  order_index   int  not null default 0,
  is_open       boolean not null default false,
  locks_at      timestamptz,
  correct_value text,                     -- rempli par l'admin après coup
  created_at    timestamptz not null default now()
);

create table if not exists answers (
  id          bigint generated always as identity primary key,
  user_id     uuid   not null references profiles (id) on delete cascade,
  question_id bigint not null references questions (id) on delete cascade,
  value       text   not null,
  points      int    not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, question_id)
);

create index if not exists answers_question_idx on answers (question_id);

-- ---------------------------------------------------------------------
-- 4. DIVERS
-- ---------------------------------------------------------------------

create table if not exists streams (
  id           bigint generated always as identity primary key,
  display_name text not null,
  url          text not null unique,   -- clé naturelle : rend le seed rejouable
  order_index  int  not null default 0,
  is_active    boolean not null default true
);

create table if not exists settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references profiles (id) on delete set null,
  action     text not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx on audit_log (created_at desc);

-- =====================================================================
--  FONCTIONS
-- =====================================================================

-- Droits admin. SECURITY DEFINER pour éviter une récursion RLS sur profiles.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false);
$$;

-- Création automatique du profil à la première connexion Discord.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, discord_id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'provider_id',
      new.raw_user_meta_data ->> 'sub'
    ),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'custom_claims', '')::jsonb ->> 'global_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'user_name',
      split_part(coalesce(new.email, 'joueur@inconnu'), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Anti-escalade de privilèges.
-- C'est précisément la faille du prototype : le client s'auto-déclarait admin.
-- Ici, seul un admin déjà en place (ou le service_role) peut promouvoir.
-- ---------------------------------------------------------------------
create or replace function public.prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'FORBIDDEN_ADMIN_CHANGE'
        using hint = 'Seul un administrateur peut modifier les droits admin.';
    end if;
  end if;

  -- l'identité Discord n'est pas modifiable par l'utilisateur
  if new.discord_id is distinct from old.discord_id
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'FORBIDDEN_IDENTITY_CHANGE';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard
  before update on profiles
  for each row execute function public.prevent_privilege_escalation();

-- ---------------------------------------------------------------------
-- Fenêtre de pronostic : la deadline est imposée ici, pas dans l'UI.
-- ---------------------------------------------------------------------
create or replace function public.enforce_pick_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m matches%rowtype;
  s stages%rowtype;
  effective_lock timestamptz;
begin
  select * into m from matches where id = new.match_id;
  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  select * into s from stages where id = m.stage_id;

  if not s.is_pickable then
    raise exception 'STAGE_NOT_PICKABLE'
      using hint = 'Cette étape est une archive, elle ne se pronostique pas.';
  end if;

  if not s.is_open then
    raise exception 'ROUND_CLOSED'
      using hint = 'Ce round n''est pas ouvert aux pronostics.';
  end if;

  if m.status <> 'pending' then
    raise exception 'MATCH_STARTED'
      using hint = 'Le match a commencé, les pronostics sont figés.';
  end if;

  if m.team_a_id is null or m.team_b_id is null then
    raise exception 'MATCH_NOT_READY'
      using hint = 'Les deux équipes ne sont pas encore connues.';
  end if;

  if new.team_id <> m.team_a_id and new.team_id <> m.team_b_id then
    raise exception 'INVALID_TEAM'
      using hint = 'Cette équipe ne participe pas à ce match.';
  end if;

  effective_lock := coalesce(m.locks_at, s.locks_at);
  if effective_lock is not null and now() >= effective_lock then
    raise exception 'PICKS_LOCKED'
      using hint = 'La date limite de ce match est dépassée.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- `UPDATE OF team_id` est essentiel : le moteur de scoring écrit dans
-- `picks.points`, et si ce trigger se déclenchait aussi sur cette colonne,
-- publier un résultat échouerait avec MATCH_STARTED — le match venant
-- justement de passer à 'done'. Le garde ne surveille donc que les colonnes
-- que l'utilisateur a le droit de toucher.
drop trigger if exists picks_window_guard on picks;
create trigger picks_window_guard
  before insert or update of user_id, match_id, team_id on picks
  for each row execute function public.enforce_pick_window();

-- Même verrou pour les réponses de la boule de cristal.
create or replace function public.enforce_answer_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  qq questions%rowtype;
  s  stages%rowtype;
  effective_lock timestamptz;
begin
  select * into qq from questions where id = new.question_id;
  if not found then
    raise exception 'QUESTION_NOT_FOUND';
  end if;

  if not qq.is_open then
    raise exception 'QUESTION_CLOSED';
  end if;

  if qq.correct_value is not null then
    raise exception 'QUESTION_RESOLVED'
      using hint = 'La réponse a déjà été publiée.';
  end if;

  effective_lock := qq.locks_at;
  if effective_lock is null and qq.stage_id is not null then
    select * into s from stages where id = qq.stage_id;
    effective_lock := s.locks_at;
  end if;

  if effective_lock is not null and now() >= effective_lock then
    raise exception 'ANSWERS_LOCKED';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Même raison que pour `picks` : `score_question_answers()` écrit dans
-- `answers.points` juste après la publication de la bonne réponse, ce qui
-- déclencherait QUESTION_RESOLVED sur sa propre mise à jour.
drop trigger if exists answers_window_guard on answers;
create trigger answers_window_guard
  before insert or update of user_id, question_id, value on answers
  for each row execute function public.enforce_answer_window();

-- Effacer sa réponse est permis tant que la question est ouverte.
create or replace function public.enforce_answer_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare qq questions%rowtype;
begin
  select * into qq from questions where id = old.question_id;
  if found and qq.correct_value is not null then
    raise exception 'QUESTION_RESOLVED';
  end if;
  return old;
end;
$$;

drop trigger if exists answers_delete_guard on answers;
create trigger answers_delete_guard
  before delete on answers
  for each row execute function public.enforce_answer_delete();

-- ---------------------------------------------------------------------
-- Propagation du bracket : « À DÉTERMINER » se résout tout seul.
-- ---------------------------------------------------------------------
create or replace function public.propagate_bracket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loser_id bigint;
begin
  if new.winner_team_id is null then
    -- résultat annulé : on vide les slots enfants pour rester cohérent
    update matches set team_a_id = null
      where team_a_src_match = new.id and status = 'pending';
    update matches set team_b_id = null
      where team_b_src_match = new.id and status = 'pending';
    return new;
  end if;

  loser_id := case
                when new.winner_team_id = new.team_a_id then new.team_b_id
                else new.team_a_id
              end;

  -- `status = 'pending'` : on ne réécrit jamais un match déjà joué. Si
  -- l'organisateur corrige un résultat amont après coup, il devra reprendre
  -- les matchs aval explicitement — plutôt que de les voir muter en silence.
  update matches
     set team_a_id = case when team_a_src_type = 'winner'
                          then new.winner_team_id else loser_id end,
         updated_at = now()
   where team_a_src_match = new.id and status = 'pending';

  update matches
     set team_b_id = case when team_b_src_type = 'winner'
                          then new.winner_team_id else loser_id end,
         updated_at = now()
   where team_b_src_match = new.id and status = 'pending';

  return new;
end;
$$;

drop trigger if exists matches_propagate on matches;
create trigger matches_propagate
  after update of winner_team_id on matches
  for each row
  when (new.winner_team_id is distinct from old.winner_team_id)
  execute function public.propagate_bracket();

-- ---------------------------------------------------------------------
-- Scoring. Recalculé par trigger : l'application n'a rien à orchestrer.
-- Idempotent — un barème modifié après coup se répercute sur l'historique.
-- ---------------------------------------------------------------------
create or replace function public.score_match_picks(p_match_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update picks p
     set points = case
                    when m.winner_team_id is not null and m.winner_team_id = p.team_id
                    then s.points_per_correct
                    else 0
                  end
    from matches m
    join stages s on s.id = m.stage_id
   where p.match_id = m.id
     and m.id = p_match_id;
$$;

create or replace function public.score_question_answers(p_question_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update answers a
     set points = case
                    when q.correct_value is not null
                     and lower(btrim(a.value)) = lower(btrim(q.correct_value))
                    then q.points
                    else 0
                  end
    from questions q
   where a.question_id = q.id
     and q.id = p_question_id;
$$;

create or replace function public.trg_score_match()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.score_match_picks(new.id);
  return new;
end $$;

drop trigger if exists matches_rescore on matches;
create trigger matches_rescore
  after update of winner_team_id on matches
  for each row execute function public.trg_score_match();

create or replace function public.trg_score_question()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.score_question_answers(new.id);
  return new;
end $$;

drop trigger if exists questions_rescore on questions;
create trigger questions_rescore
  after update of correct_value, points on questions
  for each row execute function public.trg_score_question();

-- Rescoring global : à appeler après une modification de barème.
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

  update picks p
     set points = case
                    when m.winner_team_id is not null and m.winner_team_id = p.team_id
                    then s.points_per_correct
                    else 0
                  end
    from matches m
    join stages s on s.id = m.stage_id
   where p.match_id = m.id;

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

-- Un changement de barème de round rescore ce round immédiatement.
create or replace function public.trg_stage_rescore()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update picks p
     set points = case
                    when m.winner_team_id is not null and m.winner_team_id = p.team_id
                    then new.points_per_correct
                    else 0
                  end
    from matches m
   where p.match_id = m.id and m.stage_id = new.id;
  return new;
end $$;

drop trigger if exists stages_rescore on stages;
create trigger stages_rescore
  after update of points_per_correct on stages
  for each row
  when (new.points_per_correct is distinct from old.points_per_correct)
  execute function public.trg_stage_rescore();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists matches_touch on matches;
create trigger matches_touch before update on matches
  for each row execute function public.touch_updated_at();

-- =====================================================================
--  VUES
-- =====================================================================

-- Points gagnés par utilisateur et par « bucket » (playoffs / final).
create or replace view public.user_stage_points as
  select
    p.user_id,
    s.bucket,
    sum(p.points)::int as points
  from picks p
  join matches m on m.id = p.match_id
  join stages  s on s.id = m.stage_id
  group by p.user_id, s.bucket
  union all
  select
    a.user_id,
    coalesce(s.bucket, 'playoffs') as bucket,
    sum(a.points)::int as points
  from answers a
  join questions q on q.id = a.question_id
  left join stages s on s.id = q.stage_id
  group by a.user_id, coalesce(s.bucket, 'playoffs');

-- CLASSEMENT GÉNÉRAL
-- Base = tous les comptes Discord UNION tous les alias Excel non réclamés,
-- pour que le tableau soit complet dès la minute zéro, avant tout mapping.
--
-- Départage (des lots sont en jeu, la règle doit être publique) :
--   total ↓, points finale ↓, points play-offs ↓, premier pick le plus tôt ↑
create or replace view public.leaderboard as
with entrants as (
  select
    pr.id                                   as user_id,
    pr.display_name                         as name,
    pr.avatar_url                           as avatar_url,
    coalesce(ls.group_points, 0)            as group_points,
    ls.alias                                as legacy_alias,
    false                                   as is_ghost
  from profiles pr
  left join legacy_scores ls on ls.claimed_by = pr.id
  union all
  select
    null::uuid,
    ls.alias,
    null,
    ls.group_points,
    ls.alias,
    true
  from legacy_scores ls
  where ls.claimed_by is null
),
pts as (
  select
    user_id,
    sum(points) filter (where bucket = 'playoffs')::int as playoff_points,
    sum(points) filter (where bucket = 'final')::int    as final_points
  from user_stage_points
  group by user_id
),
first_pick as (
  select user_id, min(created_at) as first_pick_at
  from picks group by user_id
)
select
  e.user_id,
  e.name,
  e.avatar_url,
  e.legacy_alias,
  e.is_ghost,
  e.group_points,
  coalesce(pt.playoff_points, 0) as playoff_points,
  coalesce(pt.final_points, 0)   as final_points,
  e.group_points
    + coalesce(pt.playoff_points, 0)
    + coalesce(pt.final_points, 0) as total_points,
  fp.first_pick_at,
  rank() over (
    order by
      e.group_points + coalesce(pt.playoff_points, 0) + coalesce(pt.final_points, 0) desc,
      coalesce(pt.final_points, 0)   desc,
      coalesce(pt.playoff_points, 0) desc,
      fp.first_pick_at asc nulls last,
      e.name asc
  ) as position
from entrants e
left join pts        pt on pt.user_id = e.user_id
left join first_pick fp on fp.user_id = e.user_id;

-- Répartition des pronostics, révélée UNIQUEMENT après verrouillage.
create or replace view public.match_pick_stats as
  select
    p.match_id,
    p.team_id,
    count(*)::int as pick_count
  from picks p
  join matches m on m.id = p.match_id
  join stages  s on s.id = m.stage_id
  where m.status <> 'pending'
     or (coalesce(m.locks_at, s.locks_at) is not null
         and now() >= coalesce(m.locks_at, s.locks_at))
  group by p.match_id, p.team_id;

-- =====================================================================
--  RLS
-- =====================================================================

alter table teams              enable row level security;
alter table tournament_players enable row level security;
alter table stages             enable row level security;
alter table matches            enable row level security;
alter table profiles           enable row level security;
alter table legacy_scores      enable row level security;
alter table picks              enable row level security;
alter table questions          enable row level security;
alter table answers            enable row level security;
alter table streams            enable row level security;
alter table settings           enable row level security;
alter table audit_log          enable row level security;

-- Référentiel : lecture publique, écriture admin.
do $$
declare t text;
begin
  foreach t in array array['teams', 'tournament_players', 'stages', 'matches',
                           'questions', 'streams', 'settings', 'legacy_scores']
  loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('create policy %I_read on %I for select using (true)', t, t);

    execute format('drop policy if exists %I_admin_write on %I', t, t);
    execute format($f$create policy %I_admin_write on %I
                      for all using (public.is_admin())
                      with check (public.is_admin())$f$, t, t);
  end loop;
end $$;

-- Profils : lecture publique (pseudo + avatar servent au classement),
-- chacun ne modifie que le sien, et le trigger bloque l'escalade.
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select using (true);

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profiles_admin_write on profiles;
create policy profiles_admin_write on profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Pronostics : strictement privés jusqu'au verrouillage.
drop policy if exists picks_own_read on picks;
create policy picks_own_read on picks
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists picks_own_insert on picks;
create policy picks_own_insert on picks
  for insert with check (auth.uid() = user_id);

drop policy if exists picks_own_update on picks;
create policy picks_own_update on picks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists answers_own_read on answers;
create policy answers_own_read on answers
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists answers_own_insert on answers;
create policy answers_own_insert on answers
  for insert with check (auth.uid() = user_id);

drop policy if exists answers_own_update on answers;
create policy answers_own_update on answers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists answers_own_delete on answers;
create policy answers_own_delete on answers
  for delete using (auth.uid() = user_id);

-- Journal d'audit : lecture admin, écriture par les admins uniquement.
drop policy if exists audit_read on audit_log;
create policy audit_read on audit_log
  for select using (public.is_admin());

drop policy if exists audit_write on audit_log;
create policy audit_write on audit_log
  for insert with check (public.is_admin() and actor_id = auth.uid());

-- ---------------------------------------------------------------------
-- Privilèges au niveau COLONNE — le dernier verrou sur les points.
--
-- La RLS dit QUELLES LIGNES un participant peut écrire, jamais QUELLES
-- COLONNES. Sans ceci, n'importe qui pourrait faire, via l'API REST :
--     update picks set points = 9999 where user_id = <soi-même>
-- et truster le classement en une requête. On retire donc l'écriture
-- globale pour ne rendre que les colonnes réellement saisies par le joueur.
-- `points` n'est plus modifiable que par les fonctions de scoring, qui
-- sont SECURITY DEFINER et tournent donc avec les droits du propriétaire.
-- ---------------------------------------------------------------------

revoke insert, update on picks   from anon, authenticated;
revoke insert, update on answers from anon, authenticated;

grant insert (user_id, match_id, team_id) on picks to authenticated;
grant update (user_id, match_id, team_id) on picks to authenticated;

grant insert (user_id, question_id, value) on answers to authenticated;
grant update (user_id, question_id, value) on answers to authenticated;
grant delete on answers to authenticated;

-- Les vues d'agrégat tournent avec les droits du propriétaire (postgres)
-- afin de calculer les totaux de tout le monde ; elles n'exposent que des
-- données agrégées, jamais le détail des pronostics d'autrui.
grant select on public.leaderboard      to anon, authenticated;
grant select on public.match_pick_stats to anon, authenticated;
revoke select on public.user_stage_points from anon, authenticated;

-- Realtime : bracket et classement se mettent à jour en direct.
-- Chaque table est traitée isolément : une table déjà publiée ne doit pas
-- annuler l'ajout des suivantes (un handler d'exception PL/pgSQL annule
-- tout le bloc dans lequel il se trouve).
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach t in array array['matches', 'stages', 'picks', 'questions']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception
      when duplicate_object then null;
    end;
  end loop;
end $$;
