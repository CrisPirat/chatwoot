#!/usr/bin/env bash

# Deploy the reports branch without recreating PostgreSQL, Redis, or storage.
# Run from a clone of https://github.com/CrisPirat/chatwoot on the VPS.
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_ROOT/deployment/docker-compose.vps.yml}"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/.env}"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-reports}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"

log() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

trap 'fail "Deployment stopped at line $LINENO."' ERR

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_env_value() {
  grep -Eq "^${1}=.+$" "$ENV_FILE" || fail "Set ${1} in ${ENV_FILE}."
}

compose() {
  docker compose \
    --project-name "$COMPOSE_PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" \
    "$@"
}

ensure_container_running() {
  local container_name="$1"
  local service_name="$2"

  if ! docker inspect "$container_name" >/dev/null 2>&1; then
    log "Creating ${service_name}"
    compose up -d "$service_name"
    return
  fi

  if [[ "$(docker inspect -f '{{.State.Running}}' "$container_name")" != "true" ]]; then
    log "Starting ${container_name}"
    docker start "$container_name" >/dev/null
  fi
}

wait_for_postgres() {
  local attempt

  for attempt in $(seq 1 60); do
    if docker exec chatwoot_postgres sh -c \
      'PGPASSWORD="$POSTGRES_PASSWORD" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
      >/dev/null 2>&1; then
      return
    fi

    sleep 2
  done

  fail 'PostgreSQL did not become ready within two minutes.'
}

backup_database() {
  local backup_file
  local timestamp

  mkdir -p "$BACKUP_DIR"
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_file="$BACKUP_DIR/chatwoot_production-${timestamp}.dump"

  log "Backing up PostgreSQL to ${backup_file}"
  docker exec chatwoot_postgres sh -c \
    'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
    > "$backup_file"
  [[ -s "$backup_file" ]] || fail 'PostgreSQL backup is empty.'
}

update_source() {
  if [[ "${SKIP_GIT_PULL:-0}" == "1" ]]; then
    return
  fi

  if [[ -n "$(git -C "$PROJECT_ROOT" status --porcelain --untracked-files=no)" ]]; then
    fail 'The deployment checkout has tracked local changes. Commit or discard them before deploying.'
  fi

  log "Updating ${REMOTE}/${BRANCH}"
  git -C "$PROJECT_ROOT" fetch --prune "$REMOTE" "$BRANCH"

  if git -C "$PROJECT_ROOT" show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    git -C "$PROJECT_ROOT" switch "$BRANCH"
  else
    git -C "$PROJECT_ROOT" switch --track -c "$BRANCH" "${REMOTE}/${BRANCH}"
  fi

  git -C "$PROJECT_ROOT" pull --ff-only "$REMOTE" "$BRANCH"
}

wait_for_health() {
  local attempt

  for attempt in $(seq 1 30); do
    if docker exec chatwoot ruby -rnet/http -ruri -e \
      'response = Net::HTTP.get_response(URI("http://127.0.0.1:3000/health")); exit(response.is_a?(Net::HTTPSuccess) ? 0 : 1)' \
      >/dev/null 2>&1; then
      return
    fi

    sleep 2
  done

  compose logs --tail=100 chatwoot chatwoot_sidekiq >&2
  fail 'Chatwoot did not pass its health check within one minute.'
}

require_command docker
require_command git
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 is required.'
[[ -d "$PROJECT_ROOT/.git" ]] || fail "${PROJECT_ROOT} is not a Git checkout."
[[ -f "$COMPOSE_FILE" ]] || fail "Compose file not found: ${COMPOSE_FILE}"
[[ -f "$ENV_FILE" ]] || fail "Environment file not found: ${ENV_FILE}"

require_env_value POSTGRES_PASSWORD
require_env_value SECRET_KEY_BASE
require_env_value OMNICEM_URL
require_env_value URL_REPORT

update_source

existing_project="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' chatwoot 2>/dev/null || true)"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$existing_project}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-omnicem_chatwoot}"
export COMPOSE_PROJECT_NAME

commit_sha="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD)"
export CHATWOOT_IMAGE="${CHATWOOT_IMAGE:-omnicem/chatwoot:reports-${commit_sha}}"

docker network inspect proxy_network >/dev/null 2>&1 || fail 'The external Docker network proxy_network does not exist.'
compose config --quiet

ensure_container_running chatwoot_postgres chatwoot_postgres
ensure_container_running chatwoot_redis chatwoot_redis
wait_for_postgres
backup_database

log "Building ${CHATWOOT_IMAGE}"
compose build --pull chatwoot

log 'Preparing the database with the new image'
compose run --rm --no-deps chatwoot bundle exec rails db:chatwoot_prepare

log 'Recreating Rails and Sidekiq only'
compose up -d --no-deps --force-recreate chatwoot chatwoot_sidekiq
wait_for_health

if [[ "$(docker inspect -f '{{.State.Running}}' chatwoot_sidekiq)" != "true" ]]; then
  compose logs --tail=100 chatwoot_sidekiq >&2
  fail 'Sidekiq is not running after deployment.'
fi

compose ps
log "Deployment complete: ${CHATWOOT_IMAGE}"
