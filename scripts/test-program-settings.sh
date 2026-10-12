#!/usr/bin/env bash
# Runs db/tests/program_settings.test.sql against a throwaway Postgres in Docker.
set -euo pipefail
cd "$(dirname "$0")/.."
name=v12-settings-test
docker rm -f $name >/dev/null 2>&1 || true
docker run -d --name $name -e POSTGRES_PASSWORD=t -v "$PWD":/work:ro postgres:16 >/dev/null
trap 'docker rm -f $name >/dev/null 2>&1' EXIT
for i in $(seq 1 40); do docker exec $name pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 2
docker exec $name psql -U postgres -v ON_ERROR_STOP=1 -q -f /work/db/tests/program_settings.test.sql
