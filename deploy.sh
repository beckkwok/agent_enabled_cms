#!/usr/bin/env bash
# Deploy the AACMS stack on the NAS (Synology Container Manager / SSH).
# Run from the directory that contains this repo's files, e.g.:
#   cd /volume1/docker/aacms && ./deploy.sh
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"

# Auto-detect the compose command.
# Docker 20.10.x uses the standalone `docker-compose` (v1);
# newer Docker ships the `docker compose` (v2) plugin.
if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
elif docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  echo "ERROR: neither 'docker-compose' nor 'docker compose' is available."
  exit 1
fi
echo "Using compose command: ${COMPOSE}"

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found. Create it from .env.prod.example:"
  echo "  cp .env.prod.example .env   # then edit PAYLOAD_SECRET etc."
  exit 1
fi

echo "==> Pulling source (if git) ..."
if git rev-parse --git-dir >/dev/null 2>&1; then
  git pull --ff-only || echo "WARN: git pull failed, continuing with local files."
fi

echo "==> Building and starting the production stack ..."
${COMPOSE} -f "${COMPOSE_FILE}" up -d --build

echo "==> Waiting for payload to come up ..."
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000 >/dev/null 2>&1; then
    echo "OK: http://<nas-ip>:3000 is up (after ${i}s)."
    exit 0
  fi
  sleep 1
done

echo "WARN: payload did not respond yet. Check logs with:"
echo "  ${COMPOSE} -f ${COMPOSE_FILE} logs -f payload"
exit 1
