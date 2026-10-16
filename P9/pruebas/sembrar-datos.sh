#!/usr/bin/env bash
# Siembra datos VERIFICABLES en el servicio con estado (ms-auth / auth_db).
#
# - Registra N usuarios a traves de la API de ms-auth (no por SQL directo):
#   asi se demuestra que lo restaurado es contenido real y usable (login).
# - Crea la tabla dr_latido, que la prueba de restauracion usa para medir
#   el RPO real (ultimo latido que sobrevivio al desastre).
#
# Uso: P9/pruebas/sembrar-datos.sh [N]      (por defecto N=5)
# Variables: CTX (kind-sa-p9), NS (sa-p9-produccion), ETIQUETA (lote de usuarios)
set -euo pipefail

N="${1:-5}"
CTX="${CTX:-kind-sa-p9}"
NS="${NS:-sa-p9-produccion}"
ETIQUETA="${ETIQUETA:-$(date -u +%Y%m%d%H%M%S)}"
PUERTO_LOCAL=13001
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$RAIZ/evidencias/siembra-$(date -u +%Y%m%dT%H%M%SZ).log"
K="kubectl --context $CTX -n $NS"

ts() { date -u +%FT%TZ; }
log() { echo "$(ts) $*" | tee -a "$LOG"; }

psql_auth() {
  $K exec sa-platform-postgresql-0 -- sh -c \
    'PGPASSWORD="$(cat "$POSTGRES_POSTGRES_PASSWORD_FILE")" psql -U postgres -d auth_db -v ON_ERROR_STOP=1 -At -c "$0"' "$1"
}

log "inicio siembra: N=$N etiqueta=$ETIQUETA ns=$NS"

$K port-forward svc/sa-platform-ms-auth "$PUERTO_LOCAL:3001" >/dev/null 2>&1 &
PF=$!
trap 'kill $PF 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do curl -sf "localhost:$PUERTO_LOCAL/health" >/dev/null && break; sleep 1; done

for i in $(seq 1 "$N"); do
  correo="dr-${ETIQUETA}-${i}@usac.edu.gt"
  codigo=$(curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:$PUERTO_LOCAL/auth/registro" \
    -H 'Content-Type: application/json' \
    -d "{\"correo\":\"$correo\",\"nombre\":\"Usuario DR $i\",\"password\":\"Prueba.12345\"}")
  log "registro $correo -> HTTP $codigo"
done

psql_auth "CREATE TABLE IF NOT EXISTS dr_latido (id serial PRIMARY KEY, ts timestamptz NOT NULL DEFAULT now());"
psql_auth "INSERT INTO dr_latido DEFAULT VALUES;"

log "usuarios en auth_db: $(psql_auth 'SELECT count(*) FROM usuarios;')"
log "ultimo latido: $(psql_auth 'SELECT max(ts) FROM dr_latido;')"
log "fin siembra (log: $LOG)"
