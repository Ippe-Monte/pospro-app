#!/bin/bash
# usage: PGHOST=/tmp/pgtest PGPORT=54329 bash tests/run_sql_tests.sh  (needs a throwaway local PostgreSQL 15+)
set -o pipefail
D=$(cd "$(dirname "$0")/.." && pwd)
psql -U postgres -qc "drop database if exists pospro_test" -c "create database pospro_test" >/dev/null || exit 1
psql -U postgres -d pospro_test -q -v ON_ERROR_STOP=1 -f "$D/tests/sql_stub_supabase.sql" -f "$D/sql/001_pospro_v2_schema.sql" -f "$D/tests/sql_rls_test.sql" 2>&1 | grep -v -i "wal_level\|HINT:"
