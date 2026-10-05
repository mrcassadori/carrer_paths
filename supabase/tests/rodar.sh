#!/usr/bin/env bash
# Roda o schema, o seed e os testes de permissão num Postgres 15+ local (sem Supabase).
# 00-stub-supabase.sql simula auth.users, auth.uid() e storage; o usuário "logado"
# é trocado com: set request.jwt.sub = '<uuid>'.
# Uso: PSQL="sudo -u postgres psql" ./rodar.sh
set -euo pipefail
cd "$(dirname "$0")"
PSQL=${PSQL:-psql}
$PSQL -q -v ON_ERROR_STOP=1 < 00-stub-supabase.sql
$PSQL -q -v ON_ERROR_STOP=1 -d cp < ../migrations/0001_schema.sql
$PSQL -q -v ON_ERROR_STOP=1 -d cp < ../seed-catalogo.sql
$PSQL -q -d cp < 10-permissoes-e-fluxo.sql
