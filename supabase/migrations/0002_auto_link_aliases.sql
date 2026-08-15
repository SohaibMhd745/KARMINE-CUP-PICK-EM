-- =====================================================================
--  0002 — Rattachement AUTOMATIQUE des scores de poule
--
--  Les alias du classement Excel sont les noms d'affichage Discord des
--  participants. On s'en sert pour rattacher chaque alias au compte qui
--  s'inscrit, sans intervention : l'organisateur n'a plus à traiter que
--  les cas où la machine n'a PAS de certitude.
--
--  Règle cardinale : on ne rattache automatiquement que sur une
--  correspondance DÉTERMINISTE et UNIQUE. Aucun rapprochement approximatif
--  n'est appliqué tout seul — il y a des lots, et une erreur donnerait les
--  points d'un participant à un autre. Le flou reste une SUGGESTION
--  affichée à l'organisateur (calculée dans lib/alias.ts, hors base).
--
--  Se rejoue sans dommage. Ne remplace pas 0001_init.sql : à appliquer
--  après lui.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Traçabilité du rattachement
--    `claim_method` distingue ce que la machine a fait de ce que
--    l'organisateur a décidé — indispensable pour auditer un litige.
-- ---------------------------------------------------------------------

alter table legacy_scores
  add column if not exists claim_method text
    check (claim_method in ('auto', 'admin'));

alter table legacy_scores
  add column if not exists claimed_at timestamptz;

comment on column legacy_scores.claim_method is
  'auto = rattaché par normalize_alias() ; admin = arbitré par un organisateur';

-- ---------------------------------------------------------------------
-- 2. Normalisation d'un pseudo
--
--    Absorbe les écarts d'écriture observés dans l'Excel sans jamais
--    deviner :
--      « [KDAVRE CORP] Denis » → denis     (préfixe d'équipe)
--      « [Feet&Fun]Pauシ »     → pauシ      (préfixe collé)
--      « ROÏ DES GWERS »       → roidesgwers (accents, espaces)
--      « Alan ☀ »              → alan       (décorations)
--      « pseudo#1234 »         → pseudo     (ancien discriminateur Discord)
--
--    IMMUTABLE et pure : aucune lecture de table, donc aucune surprise
--    si les données bougent. 58 lignes à comparer, on scanne — pas
--    d'index d'expression, qui deviendrait silencieusement faux le jour
--    où cette fonction serait modifiée.
-- ---------------------------------------------------------------------

create or replace function public.normalize_alias(raw text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select nullif(
    regexp_replace(
      lower(
        translate(
          regexp_replace(
            -- préfixe d'équipe entre crochets/parenthèses, collé ou espacé
            regexp_replace(raw, '^[[:space:]]*[[({<][^]})>]*[]})>][[:space:]]*', ''),
            -- discriminateur Discord hérité
            '#[0-9]{4}$', ''
          ),
          'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿÑñÇçŠšŽž',
          'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuYyyNnCcSsZz'
        )
      ),
      -- espaces, ponctuation, emoji et symboles décoratifs
      '[^[:alnum:]]+', '', 'g'
    ),
    ''
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Journal des tentatives
--    Écrit hors RLS (SECURITY DEFINER) avec actor_id = NULL : l'action
--    n'est le fait de personne, elle apparaît « automatique » dans le
--    journal de l'administration.
-- ---------------------------------------------------------------------

create or replace function public.log_auto_link(
  p_user    uuid,
  p_name    text,
  p_alias   text,
  p_outcome text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into audit_log (actor_id, action, payload)
  values (
    null,
    'auto_link_alias',
    jsonb_build_object(
      'user_id',      p_user,
      'display_name', p_name,
      'alias',        p_alias,
      'outcome',      p_outcome
    )
  );
$$;

-- ---------------------------------------------------------------------
-- 4. Rattachement d'un compte
--
--    Retourne le motif, jamais une exception : le résultat sert au
--    rapport de l'organisateur, pas à interrompre une inscription.
--
--      linked            → alias rattaché
--      already_linked    → ce compte a déjà un alias, on n'y touche pas
--      no_match          → aucun alias de ce nom (cas normal d'un nouveau)
--      ambiguous_alias   → plusieurs alias se normalisent pareil
--      ambiguous_profile → deux comptes Discord portent le même nom
--      alias_taken       → l'alias appartient déjà à un autre compte
-- ---------------------------------------------------------------------

create or replace function public.auto_link_alias(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_norm  text;
  v_alias text;
  v_owner uuid;
  n       int;
begin
  select display_name into v_name from profiles where id = p_user;
  if v_name is null then
    return 'no_profile';
  end if;

  -- Un rattachement existant n'est JAMAIS écrasé, qu'il vienne de la
  -- machine ou d'un arbitrage humain.
  if exists (select 1 from legacy_scores where claimed_by = p_user) then
    return 'already_linked';
  end if;

  v_norm := public.normalize_alias(v_name);
  if v_norm is null then
    return 'no_match';
  end if;

  -- Homonymes : deux comptes Discord au même nom d'affichage. Trancher
  -- reviendrait à donner les points de poule au mauvais participant.
  select count(*) into n
    from profiles p
   where p.id <> p_user
     and public.normalize_alias(p.display_name) = v_norm;

  if n > 0 then
    perform public.log_auto_link(p_user, v_name, null, 'ambiguous_profile');
    return 'ambiguous_profile';
  end if;

  -- (a) correspondance EXACTE : le cas nominal, l'alias Excel est le nom
  --     d'affichage Discord au caractère près.
  select alias into v_alias
    from legacy_scores
   where alias = v_name
   limit 1;

  -- (b) à défaut, correspondance normalisée — à condition qu'elle soit
  --     UNIQUE. « Lornyk » et « [GOONING] Lornyk » se normalisent
  --     pareil et ne valent pas le même nombre de points : on ne devine
  --     pas, on passe la main.
  if v_alias is null then
    select count(*) into n
      from legacy_scores
     where public.normalize_alias(alias) = v_norm;

    if n = 0 then
      return 'no_match';
    elsif n > 1 then
      perform public.log_auto_link(p_user, v_name, null, 'ambiguous_alias');
      return 'ambiguous_alias';
    end if;

    select alias into v_alias
      from legacy_scores
     where public.normalize_alias(alias) = v_norm;
  end if;

  select claimed_by into v_owner from legacy_scores where alias = v_alias;
  if v_owner is not null then
    perform public.log_auto_link(p_user, v_name, v_alias, 'alias_taken');
    return 'alias_taken';
  end if;

  update legacy_scores
     set claimed_by   = p_user,
         claim_method = 'auto',
         claimed_at   = now()
   where alias = v_alias;

  perform public.log_auto_link(p_user, v_name, v_alias, 'linked');
  return 'linked';

exception
  -- `claimed_by` est UNIQUE : deux inscriptions simultanées visant le
  -- même alias se départagent ici, sans casser l'inscription perdante.
  when unique_violation then
    perform public.log_auto_link(p_user, v_name, v_alias, 'alias_taken');
    return 'alias_taken';
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Déclencheurs
--
--    À l'inscription, et à chaque changement de nom d'affichage : un
--    participant non reconnu n'a qu'à reprendre son pseudo Discord de
--    l'Excel et se reconnecter, sans solliciter l'organisateur.
--
--    Le corps est protégé : une anomalie ici ne doit JAMAIS empêcher une
--    inscription le jour du tournoi. L'échec part au journal d'audit.
-- ---------------------------------------------------------------------

create or replace function public.trg_profile_auto_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.auto_link_alias(new.id);
  return null;
exception
  when others then
    perform public.log_auto_link(new.id, new.display_name, null,
                                 'error: ' || sqlerrm);
    return null;
end;
$$;

drop trigger if exists profiles_auto_link on profiles;
create trigger profiles_auto_link
  after insert on profiles
  for each row execute function public.trg_profile_auto_link();

drop trigger if exists profiles_auto_link_rename on profiles;
create trigger profiles_auto_link_rename
  after update of display_name on profiles
  for each row
  when (new.display_name is distinct from old.display_name)
  execute function public.trg_profile_auto_link();

-- ---------------------------------------------------------------------
-- 6. Synchronisation du pseudo à chaque connexion
--
--    `handle_new_user()` ne s'exécute qu'à la création du compte. Sans
--    ceci, un participant qui corrige son pseudo Discord resterait
--    invisible au rattachement automatique jusqu'à la fin du tournoi.
--
--    On ne touche pas à `discord_id` : le garde-fou
--    `prevent_privilege_escalation()` refuse toute modification
--    d'identité, et il a raison.
-- ---------------------------------------------------------------------

create or replace function public.sync_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name   text;
  v_avatar text;
begin
  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'custom_claims', '')::jsonb ->> 'global_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'user_name'
  );
  v_avatar := new.raw_user_meta_data ->> 'avatar_url';

  if v_name is null or v_name = '' then
    return new;
  end if;

  update profiles p
     set display_name = v_name,
         avatar_url   = coalesce(v_avatar, p.avatar_url)
   where p.id = new.id
     and (p.display_name is distinct from v_name
          or p.avatar_url is distinct from coalesce(v_avatar, p.avatar_url));

  return new;
exception
  -- une connexion ne doit jamais échouer à cause de la synchro
  when others then
    return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of raw_user_meta_data on auth.users
  for each row
  when (new.raw_user_meta_data is distinct from old.raw_user_meta_data)
  execute function public.sync_user_profile();

-- ---------------------------------------------------------------------
-- 7. Reprise en masse
--    Pour les comptes créés avant cette migration, et pour repasser une
--    fois les pseudos corrigés. Bouton dédié dans /admin.
-- ---------------------------------------------------------------------

create or replace function public.auto_link_all_aliases()
returns table (outcome text, total int)
language plpgsql
security definer
set search_path = public
as $$
declare
  r     record;
  v     text;
  tally jsonb := '{}'::jsonb;
begin
  -- SECURITY DEFINER + EXECUTE : sans ce garde, n'importe quel compte
  -- connecté pourrait déclencher la reprise.
  if not public.is_admin() then
    raise exception 'FORBIDDEN'
      using hint = 'Action réservée aux administrateurs.';
  end if;

  for r in
    select p.id
      from profiles p
     where not exists (select 1 from legacy_scores ls where ls.claimed_by = p.id)
     order by p.created_at
  loop
    v := public.auto_link_alias(r.id);
    tally := jsonb_set(tally, array[v], to_jsonb(coalesce((tally ->> v)::int, 0) + 1));
  end loop;

  return query
    select k, val::int from jsonb_each_text(tally) as t(k, val);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Droits d'exécution
--    En Postgres, EXECUTE est accordé à PUBLIC par défaut : une fonction
--    SECURITY DEFINER non révoquée est une porte ouverte.
-- ---------------------------------------------------------------------

revoke execute on function public.auto_link_alias(uuid)                from public;
revoke execute on function public.log_auto_link(uuid, text, text, text) from public;
revoke execute on function public.auto_link_all_aliases()              from public;
revoke execute on function public.sync_user_profile()                  from public;
revoke execute on function public.trg_profile_auto_link()              from public;

-- Seule fonction exposée : pure, sans effet de bord, pratique pour
-- diagnostiquer un rattachement depuis le SQL Editor.
grant execute on function public.normalize_alias(text) to anon, authenticated;

-- La reprise en masse est appelée par l'organisateur depuis /admin, donc
-- avec le rôle `authenticated` : le garde `is_admin()` ci-dessus fait foi.
grant execute on function public.auto_link_all_aliases() to authenticated;

-- ---------------------------------------------------------------------
-- 9. Reprise immédiate des comptes déjà inscrits
--    (aucun effet sur une base neuve)
-- ---------------------------------------------------------------------

do $$
declare r record;
begin
  for r in
    select p.id
      from profiles p
     where not exists (select 1 from legacy_scores ls where ls.claimed_by = p.id)
  loop
    perform public.auto_link_alias(r.id);
  end loop;
end $$;
