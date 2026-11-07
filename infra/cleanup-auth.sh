#!/usr/bin/env bash
set -euo pipefail
mapfile -t containers < <(docker ps --filter label=jdatna.role=application --format '{{.ID}}')
if [[ ${#containers[@]} != 1 ]]; then
  echo 'Authentication cleanup skipped: exactly one Jdatna application must be running.'
  exit 0
fi
docker exec "${containers[0]}" node /app/cleanup-auth.cjs 1000
