#!/usr/bin/env bash
# Prueba de restauracion de datos con medicion del RPO real.
#
#  1. Toma el ULTIMO respaldo PROGRAMADO Completed (no uno manual hecho en el
#     momento: eso falsearia el RPO).
#  2. Escribe datos DESPUES de ese respaldo: un latido cada 10 s en dr_latido
#     y usuarios nuevos via API. Son la perdida esperada.
#  3. T_desastre: pausa ArgoCD (raiz + sa-platform) y elimina el StatefulSet
#     y el PVC de PostgreSQL -> los datos del volumen se pierden.
#  4. Restaura PostgreSQL desde el respaldo programado con Velero.
#  5. Verifica contenido real: conteos, login de un usuario previo al
#     respaldo, usuarios posteriores que NO volvieron.
#  6. Reactiva ArgoCD. RPO real = T_desastre - ultimo latido restaurado.
#
# Uso: P9/pruebas/prueba-restauracion.sh <correo_usuario_previo> [segundos_escritura]
set -euo pipefail

USUARIO_PREVIO="${1:?uso: $0 <correo de un usuario creado ANTES del ultimo respaldo> [segundos]}"
ESCRITURA="${2:-180}"
CTX="${CTX:-kind-sa-p9}"
NS="${NS:-sa-p9-produccion}"
SCHEDULE="${SCHEDULE:-sa-p9-horario}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$RAIZ/evidencias/restauracion-$(date -u +%Y%m%dT%H%M%SZ).log"
K="kubectl --context $CTX"
exec > >(tee -a "$LOG") 2>&1

ts() { date -u +%FT%TZ; }
log() { echo "$(ts) $*"; }
psql_auth() {
  $K -n "$NS" exec sa-platform-postgresql-0 -c postgresql -- sh -c \
    'PGPASSWORD="$(cat "$POSTGRES_POSTGRES_PASSWORD_FILE")" psql -U postgres -d auth_db -At -c "$0"' "$1"
}
login() {  # $1 correo -> codigo HTTP del login via gateway
  curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:18080/api/auth/login" \
    -H 'Content-Type: application/json' -d "{\"correo\":\"$1\",\"password\":\"${2:-Prueba.12345}\"}"
}
pf_gateway() {
  $K -n "$NS" port-forward svc/sa-platform-api-gateway 18080:8080 >/dev/null 2>&1 &
  PF=$!; sleep 3
}
argocd_auto() {  # on|off para la app raiz y sa-platform
  local p='{"spec":{"syncPolicy":{"automated":null}}}'
  [ "$1" = on ] && p='{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}'
  $K -n argocd patch application sa-p9-root --type merge -p "$p" >/dev/null
  [ "$1" = off ] && $K -n argocd patch application sa-platform --type merge -p "$p" >/dev/null
  # Reactivar automated no basta: ArgoCD no re-sincroniza solo una revision
  # que ya habia sincronizado. Se fuerza un sync de la raiz, que devuelve
  # la politica automated a sa-platform.
  [ "$1" = on ] && $K -n argocd patch application sa-p9-root --type merge \
    -p '{"operation":{"initiatedBy":{"username":"prueba-restauracion"},"sync":{"revision":"main"}}}' >/dev/null
  return 0
}

log "== Prueba de restauracion de datos (log: $LOG)"

# 1. Ultimo respaldo programado Completed
ultimo=$($K -n velero get backups -l "velero.io/schedule-name=$SCHEDULE" \
  -o jsonpath='{range .items[?(@.status.phase=="Completed")]}{.status.completionTimestamp}{" "}{.status.startTimestamp}{" "}{.metadata.name}{"\n"}{end}' | sort | tail -1)
[ -n "$ultimo" ] || { log "ERROR: no hay respaldos Completed de $SCHEDULE"; exit 1; }
read -r B_FIN B_INICIO BACKUP <<<"$ultimo"
log "respaldo programado: $BACKUP (inicio $B_INICIO, completado $B_FIN)"
log "antes de escribir: usuarios=$(psql_auth 'SELECT count(*) FROM usuarios') latidos=$(psql_auth 'SELECT count(*) FROM dr_latido') ultimo_latido=$(psql_auth 'SELECT max(ts) FROM dr_latido')"

# 2. Escrituras posteriores al respaldo
pf_gateway
trap 'kill ${PF:-} 2>/dev/null || true' EXIT
ETIQ="post-$(date -u +%H%M%S)"
for i in 1 2 3; do
  c="dr-$ETIQ-$i@usac.edu.gt"
  curl -s -o /dev/null -X POST localhost:18080/api/auth/registro -H 'Content-Type: application/json' \
    -d "{\"correo\":\"$c\",\"nombre\":\"Posterior $i\",\"password\":\"Prueba.12345\"}"
  log "usuario POSTERIOR al respaldo creado: $c (se espera que se pierda)"
done
# El latido debe venir corriendo desde ANTES del respaldo (latido.sh start).
"$RAIZ/pruebas/latido.sh" start >/dev/null
log "latido ($("$RAIZ/pruebas/latido.sh" status)); escrituras durante ${ESCRITURA}s mas"
sleep "$ESCRITURA"
"$RAIZ/pruebas/latido.sh" stop >/dev/null
ULTIMO_LATIDO_PRE=$(psql_auth 'SELECT max(ts) FROM dr_latido')
USUARIOS_PRE=$(psql_auth 'SELECT count(*) FROM usuarios')
log "justo antes del desastre: usuarios=$USUARIOS_PRE latidos=$(psql_auth 'SELECT count(*) FROM dr_latido') ultimo_latido=$ULTIMO_LATIDO_PRE"

# 3. Desastre: perdida del volumen de PostgreSQL
log "pausando auto-sync de ArgoCD (sa-p9-root y sa-platform)"
argocd_auto off
T_DESASTRE=$(ts)
log "T_desastre: eliminando StatefulSet y PVC de PostgreSQL"
$K -n "$NS" delete statefulset sa-platform-postgresql --wait=true
$K -n "$NS" delete pvc data-sa-platform-postgresql-0 --wait=true
# Si el pod viejo sigue existiendo, Velero lo omite y no restaura el volumen.
$K -n "$NS" wait --for=delete pod/sa-platform-postgresql-0 --timeout=180s 2>/dev/null || true
log "login de $USUARIO_PREVIO sin base de datos: HTTP $(login "$USUARIO_PREVIO")"

# 4. Restauracion desde el respaldo programado
RESTORE="prueba-$(date -u +%Y%m%d%H%M%S)"
log "T_restore_inicio: velero restore $RESTORE desde $BACKUP"
velero --kubecontext "$CTX" restore create "$RESTORE" --from-backup "$BACKUP" \
  --include-namespaces "$NS" --selector app.kubernetes.io/name=postgresql --wait >/dev/null
log "T_restore_fin: fase=$($K -n velero get restore "$RESTORE" -o jsonpath='{.status.phase}')"
$K -n velero get podvolumerestores -l "velero.io/restore-name=$RESTORE" --no-headers \
  | awk '{print "   PodVolumeRestore", $1, $2, $4" bytes"}'
$K -n "$NS" wait --for=condition=Ready pod/sa-platform-postgresql-0 --timeout=300s >/dev/null
T_DISPONIBLE=$(ts)
log "T_postgres_disponible"

# 5. Verificacion del contenido
ULTIMO_LATIDO_POST=$(psql_auth 'SELECT max(ts) FROM dr_latido')
log "restaurado: usuarios=$(psql_auth 'SELECT count(*) FROM usuarios') (antes del desastre: $USUARIOS_PRE) latidos=$(psql_auth 'SELECT count(*) FROM dr_latido') ultimo_latido=$ULTIMO_LATIDO_POST"
sleep 5
log "login usuario PREVIO al respaldo ($USUARIO_PREVIO): HTTP $(login "$USUARIO_PREVIO")"
log "login admin semilla: HTTP $(login admin@usac.edu.gt Admin.12345)"
for i in 1 2 3; do
  c="dr-$ETIQ-$i@usac.edu.gt"; log "login usuario POSTERIOR ($c): HTTP $(login "$c") (401 = perdido, esperado)"
done

# 6. ArgoCD de vuelta y RPO
argocd_auto on
log "auto-sync de ArgoCD reactivado"
RPO=$(( $(date -d "$T_DESASTRE" +%s) - $(date -d "$ULTIMO_LATIDO_POST" +%s) ))
log "== RESUMEN"
log "   respaldo usado      : $BACKUP (inicio $B_INICIO)"
log "   T_desastre          : $T_DESASTRE"
log "   ultimo latido previo: $ULTIMO_LATIDO_PRE"
log "   ultimo latido rest. : $ULTIMO_LATIDO_POST"
log "   RPO real            : ${RPO}s ($(( RPO / 60 )) min $(( RPO % 60 )) s)"
log "   tiempo de restauracion (T_desastre -> postgres disponible): $(( $(date -d "$T_DISPONIBLE" +%s) - $(date -d "$T_DESASTRE" +%s) ))s"
