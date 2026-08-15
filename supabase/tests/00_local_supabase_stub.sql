-- Reproduit localement le minimum de l'environnement Supabase pour valider
-- 0001_init.sql et seed.sql hors ligne.

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb
);

-- auth.uid() lit le "sub" du JWT ; on le simule par un GUC de session.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

-- Supabase accorde les droits aux rôles applicatifs via ALTER DEFAULT
-- PRIVILEGES : les tables reçoivent donc leurs grants AU MOMENT du CREATE
-- TABLE. Reproduire cet ordre est essentiel, sinon les REVOKE de fin de
-- migration (protection de la colonne `points`) seraient testés à l'envers.
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- Supabase crée cette publication ; on la crée aussi pour exercer la
-- branche Realtime de la migration.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
