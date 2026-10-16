#!/usr/bin/env bash
# Restaura PostgreSQL desde el ULTIMO respaldo Completed del Schedule,
# si existe. Lo invoca Terraform (null_resource.restaurar_datos) antes de
# crear la aplicacion raiz de ArgoCD, para que ArgoCD encuentre el
# StatefulSet y su volumen ya restaurados y los adopte, en vez de crear
# una base vacia.
#
# Primer despliegue (bucket sin respaldos) -> no hace nada y sale con 0.
# Variables: CTX (kind-sa-p9), NS (sa-p9-produccion), SCHEDULE (sa-p9-horario)
set -euo pipefail

CTX="${CTX:-kind-sa-p9}"
NS="${NS:-sa-p9-produccion}"
SCHEDULE="${SCHEDULE:-sa-p9-horario}"
SELECTOR="app.kubernetes.io/name=postgresql"
K="kubectl --context $CTX -n velero"

ts() { date -u +%FT%TZ; }
log() { echo "$(ts) [restaurar-datos] $*"; }

log "inicio (ns=$NS schedule=$SCHEDULE)"

# 1. El BackupStorageLocation debe estar Available Y haber sincronizado
#    al menos una vez: solo entonces la lista de respaldos refleja el bucket.
for i in $(seq 1 60); do
  fase=$($K get backupstoragelocation default -o jsonpath='{.status.phase}' 2>/dev/null || true)
  sync=$($K get backupstoragelocation default -o jsonpath='{.status.lastSyncedTime}' 2>/dev/null || true)
  [ "$fase" = "Available" ] && [ -n "$sync" ] && break
  [ "$i" -eq 60 ] && { log "ERROR: BSL no disponible/sincronizado (fase='$fase')"; exit 1; }
  sleep 5
done
log "BSL Available, ultima sincronizacion $sync"

# 2. Ultimo respaldo Completed del Schedule.
ultimo=$($K get backups -l "velero.io/schedule-name=$SCHEDULE" \
  -o jsonpath='{range .items[?(@.status.phase=="Completed")]}{.status.completionTimestamp}{" "}{.metadata.name}{"\n"}{end}' \
  | sort | tail -1)

if [ -z "$ultimo" ]; then
  log "no hay respaldos Completed de $SCHEDULE: primer despliegue, nada que restaurar"
  exit 0
fi

backup_ts="${ultimo%% *}"
backup="${ultimo##* }"
log "respaldo elegido: $backup (completado $backup_ts)"

# 3. Restauracion selectiva: solo PostgreSQL (StatefulSet, PVC, pod...).
#    El resto lo recrea ArgoCD desde git.
#
#    NO se espera a que termine (--wait): el pod de PostgreSQL monta su
#    contrasena desde el Secret sa-platform-secrets, que solo existe cuando
#    ArgoCD instala Sealed Secrets y aplica el SealedSecret. Hasta entonces
#    el pod no arranca, ni siquiera el init container restore-wait que recibe
#    los datos. Esperar aqui seria un deadlock (restore -> Secret -> ArgoCD
#    -> restore). Basta con que el StatefulSet y el PVC ya existan cuando
#    ArgoCD sincronice: los adopta en vez de crear una base vacia. El volumen
#    termina de restaurarse solo; bootstrap.sh verifica el resultado al final.
restore="dr-$(date -u +%Y%m%d%H%M%S)"
log "T_restore_inicio $(ts) -> $restore"
velero --kubecontext "$CTX" restore create "$restore" \
  --from-backup "$backup" \
  --include-namespaces "$NS" \
  --selector "$SELECTOR" >/dev/null

for i in $(seq 1 60); do
  kubectl --context "$CTX" -n "$NS" get statefulset sa-platform-postgresql >/dev/null 2>&1 \
    && kubectl --context "$CTX" -n "$NS" get pvc data-sa-platform-postgresql-0 >/dev/null 2>&1 && break
  [ "$i" -eq 60 ] && { log "ERROR: el restore $restore no creo el StatefulSet/PVC"; exit 1; }
  sleep 5
done
log "StatefulSet y PVC de PostgreSQL restaurados (el volumen se completa cuando exista el Secret)"
exit 0
