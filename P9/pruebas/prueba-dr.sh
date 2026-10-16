#!/usr/bin/env bash
# Prueba de recuperacion cronometrada (RTO y RPO reales).
#
#   T_desastre : kind delete cluster sa-p9 (se pierde TODO el cluster:
#                nodos, etcd, volumenes, la llave de Sealed Secrets en memoria)
#   T_inicio   : ./P9/bootstrap.sh (unico punto de entrada, sin intervencion)
#   T_servicio : /health ok Y login real de un usuario previo al respaldo
#   RTO real = T_servicio - T_desastre
#   RPO real = T_desastre - ultimo latido presente tras la restauracion
#
# Uso: P9/pruebas/prueba-dr.sh <correo_usuario_previo>
set -euo pipefail

USUARIO_PREVIO="${1:?uso: $0 <correo de un usuario creado ANTES del ultimo respaldo>}"
CTX=kind-sa-p9
NS=sa-p9-produccion
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$RAIZ/evidencias/reconstruccion-$(date -u +%Y%m%dT%H%M%SZ).log"
K="kubectl --context $CTX"
exec > >(tee -a "$LOG") 2>&1

ts() { date -u +%FT%TZ; }
log() { echo "$(ts) $*"; }
seg() { date -d "$1" +%s; }
psql_auth() {
  $K -n "$NS" exec sa-platform-postgresql-0 -c postgresql -- sh -c \
    'PGPASSWORD="$(cat "$POSTGRES_POSTGRES_PASSWORD_FILE")" psql -U postgres -d auth_db -At -c "$0"' "$1"
}

log "== Prueba de recuperacion ante desastre (log: $LOG)"

# --- Pre-chequeo ----------------------------------------------------------
ultimo=$($K -n velero get backups -l velero.io/schedule-name=sa-p9-horario \
  -o jsonpath='{range .items[?(@.status.phase=="Completed")]}{.status.completionTimestamp}{" "}{.metadata.name}{"\n"}{end}' | sort | tail -1)
[ -n "$ultimo" ] || { log "ERROR: no hay respaldo programado Completed"; exit 1; }
log "ultimo respaldo programado: ${ultimo##* } (completado ${ultimo%% *})"
log "antes del desastre: usuarios=$(psql_auth 'SELECT count(*) FROM usuarios') latidos=$(psql_auth 'SELECT count(*) FROM dr_latido') ultimo_latido=$(psql_auth 'SELECT max(ts) FROM dr_latido')"
log "apps ArgoCD: $($K -n argocd get applications --no-headers | awk '{printf "%s=%s/%s ", $1, $2, $3}')"

# --- Desastre -------------------------------------------------------------
"$RAIZ/pruebas/latido.sh" stop >/dev/null || true
T_DESASTRE=$(ts)
log "T_desastre: kind delete cluster --name sa-p9"
kind delete cluster --name sa-p9 2>&1 | sed 's/^/   /'
log "clusters kind restantes: [$(kind get clusters 2>/dev/null | tr '\n' ' ')]"

# --- Reconstruccion -------------------------------------------------------
T_INICIO=$(ts)
log "T_inicio_reconstruccion: ./P9/bootstrap.sh"
"$RAIZ/bootstrap.sh" 2>&1 | sed 's/^/   | /'
T_BOOTSTRAP_FIN=$(ts)

# --- Servicio con datos restaurados --------------------------------------
$K -n "$NS" port-forward svc/sa-platform-api-gateway 18080:8080 >/dev/null 2>&1 &
PF=$!; trap 'kill $PF 2>/dev/null || true' EXIT; sleep 3
for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST localhost:18080/api/auth/login \
    -H 'Content-Type: application/json' -d "{\"correo\":\"$USUARIO_PREVIO\",\"password\":\"Prueba.12345\"}" || true)
  [ "$code" = 200 ] && break; sleep 5
done
T_SERVICIO=$(ts)
log "T_servicio: login de $USUARIO_PREVIO (usuario previo al respaldo) -> HTTP $code"

ULT=$(psql_auth 'SELECT max(ts) FROM dr_latido')
log "restaurado: usuarios=$(psql_auth 'SELECT count(*) FROM usuarios') latidos=$(psql_auth 'SELECT count(*) FROM dr_latido') ultimo_latido=$ULT"

# --- Flujo de P8 tras la reconstruccion ----------------------------------
log "== Verificaciones posteriores"
log "apps ArgoCD: $($K -n argocd get applications --no-headers | awk '{printf "%s=%s/%s ", $1, $2, $3}')"
log "llaves de Sealed Secrets en el cluster: $($K -n kube-system get secret -l sealedsecrets.bitnami.com/sealed-secrets-key --no-headers | awk '{print $1}' | tr '\n' ' ')"
log "SealedSecret: $($K -n "$NS" get sealedsecret sa-platform-secrets -o jsonpath='{.status.conditions[0].type}={.status.conditions[0].status}')"
log "Rollout api-gateway: $($K -n "$NS" get rollout sa-platform-api-gateway -o jsonpath='{.status.phase}') ($($K -n "$NS" get rollout sa-platform-api-gateway -o jsonpath='{.status.availableReplicas}') disponibles)"
log "Kyverno con nginx:latest: $($K -n "$NS" run prueba-latest --image=nginx:latest --restart=Never 2>&1 | grep -oE 'blocked due to the following policies|created' | head -1)"
log "Schedule: $(kubectl --context $CTX -n velero get schedules.velero.io sa-p9-horario -o jsonpath='{.metadata.name} {.status.phase} {.spec.schedule} ttl={.spec.template.ttl}')"
log "pods: $($K -n "$NS" get pods -o wide --no-headers | awk '{printf "%s(%s,%s) ", $1, $3, $7}')"

RTO=$(( $(seg "$T_SERVICIO") - $(seg "$T_DESASTRE") ))
RPO=$(( $(seg "$T_DESASTRE") - $(seg "$ULT") ))
log "== RESUMEN"
log "   T_desastre          : $T_DESASTRE"
log "   T_inicio            : $T_INICIO"
log "   T_bootstrap_fin     : $T_BOOTSTRAP_FIN"
log "   T_servicio          : $T_SERVICIO"
log "   RTO real            : ${RTO}s ($(( RTO / 60 )) min $(( RTO % 60 )) s)   objetivo <= 20 min"
log "   ultimo latido rest. : $ULT"
log "   RPO real            : ${RPO}s ($(( RPO / 60 )) min $(( RPO % 60 )) s)   objetivo <= 60 min"
