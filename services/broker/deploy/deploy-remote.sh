#!/usr/bin/env bash
# Runs on the LensMate VPS over SSH, streamed by .github/workflows/deploy-broker.yml. It deploys only the LensMate
# broker. It never touches other Compose projects, containers, networks or volumes on the server.
#
# Usage: bash -s -- <branch>   (the branch name is validated before anything else runs)
set -euo pipefail

BRANCH="${1:-}"
if [[ ! "$BRANCH" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$ ]] || [[ "$BRANCH" == *..* ]]; then
  echo "refusing branch name: '$BRANCH'" >&2
  exit 1
fi

REPO_DIR=/opt/lensmate/src
DEPLOY_DIR="$REPO_DIR/services/broker/deploy"
ENV_FILE="$REPO_DIR/.env.production"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE (the owner keeps it on the server, git-ignored)" >&2
  exit 1
fi
if [[ ! -d "$DEPLOY_DIR/secrets" ]]; then
  echo "missing $DEPLOY_DIR/secrets" >&2
  exit 1
fi

cd "$REPO_DIR"
git fetch --quiet origin "$BRANCH"
git checkout --quiet --detach FETCH_HEAD
COMMIT="$(git rev-parse --short HEAD)"
echo "deploying origin/$BRANCH at $COMMIT"

cd "$DEPLOY_DIR"
docker compose -p lensmate-broker --env-file "$ENV_FILE" -f docker-compose.yml up -d --build broker

# Wait for the health check. Fail the deploy if it never passes.
for _ in $(seq 1 30); do
  if [[ "$(curl -s -m 3 http://127.0.0.1:8080/healthz)" == '{"status":"ok"}' ]]; then
    echo "healthy at $COMMIT (origin/$BRANCH)"
    exit 0
  fi
  sleep 3
done
echo "broker did not report healthy after deploy of $COMMIT" >&2
docker logs --tail 20 lensmate-broker-broker-1 >&2 || true
exit 1
