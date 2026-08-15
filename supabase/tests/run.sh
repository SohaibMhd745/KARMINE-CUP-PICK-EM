#!/usr/bin/env bash
#
# Rejoue schéma + seed + tests de sécurité sur un Postgres jetable.
# Aucun projet Supabase requis : les objets propres à Supabase
# (schéma auth, auth.uid(), rôles anon/authenticated, publication
# realtime, grants par défaut) sont reproduits par 00_local_supabase_stub.sql.
#
# Usage :  bash supabase/tests/run.sh
# Requiert Docker.

set -euo pipefail

export MSYS_NO_PATHCONV=1   # Git Bash sous Windows : ne pas convertir /tmp

# On se place à la racine et on n'utilise que des chemins RELATIFS : sous
# Git Bash, MSYS_NO_PATHCONV empêche la conversion de la destination
# `conteneur:/tmp/...` mais casserait aussi une source absolue `/c/Users/...`.
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
CONTAINER=kc_pg_test

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

cleanup
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres postgres:16 >/dev/null

for _ in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

docker exec "$CONTAINER" psql -U postgres -q \
  -c 'drop database if exists kc;' -c 'create database kc;' >/dev/null

run() {
  docker cp "$2" "$CONTAINER:/tmp/$1.sql" >/dev/null
  docker exec "$CONTAINER" psql -U postgres -d kc -v ON_ERROR_STOP=1 -q -f "/tmp/$1.sql"
}

echo "▸ stub Supabase"
run stub  supabase/tests/00_local_supabase_stub.sql 2>&1 | grep -iv "wal_level\|^HINT" || true

echo "▸ migrations"
for f in supabase/migrations/*.sql; do
  run "$(basename "$f" .sql)" "$f" 2>&1 | grep -i error || true
done

echo "▸ seed (deux fois, pour vérifier l'idempotence)"
run seed  supabase/seed.sql 2>&1 | grep -i "notice\|error" || true
run seed2 supabase/seed.sql 2>&1 | grep -i "notice\|error" || true

echo "▸ tests de sécurité"
run tests supabase/tests/01_security_tests.sql 2>&1 \
  | sed 's/^psql:[^ ]* NOTICE:  //' \
  | grep -i "OK \|ERROR\|ÉCHEC\|TOUS LES"
