#!/usr/bin/env bash
set -euo pipefail

FRONTEND_URL="${SIGCR_FRONTEND_URL:-https://sigcr.com.br/}"
API_URL="${SIGCR_API_URL:-https://api.sigcr.com.br/api/}"
OIDC_URL="${SIGCR_OIDC_URL:-https://auth.sigcr.com.br/realms/sigcr/.well-known/openid-configuration}"

check_http() {
  local name="$1" url="$2" expected="$3" status
  status="$(curl --silent --show-error --location --output /dev/null --write-out '%{http_code}' --max-time 20 "$url")"
  if [[ "$status" != "$expected" ]]; then
    echo "FAIL $name status=$status expected=$expected"
    return 1
  fi
  echo "OK $name status=$status"
}

check_http frontend "$FRONTEND_URL" 200
check_http api "$API_URL" 200
check_http oidc "$OIDC_URL" 200

if command -v docker >/dev/null 2>&1; then
  for container in sigcr-backend sigcr-keycloak sigcr-mongodb sigcr-clamav; do
    running="$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null || true)"
    [[ "$running" == "true" ]] || { echo "FAIL container=$container running=$running"; exit 1; }
    echo "OK container=$container"
  done
  clamav_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}unconfigured{{end}}' sigcr-clamav)"
  [[ "$clamav_health" == "healthy" ]] || { echo "FAIL clamav_health=$clamav_health"; exit 1; }
  echo "OK clamav_health=$clamav_health"
fi

echo "SIGCR health check completed"
