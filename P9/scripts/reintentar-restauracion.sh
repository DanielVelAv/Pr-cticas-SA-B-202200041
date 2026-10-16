#!/usr/bin/env bash
# Red de seguridad del bootstrap: si la restauracion lanzada antes de ArgoCD
# no llego a restaurar el VOLUMEN de PostgreSQL (p. ej. un webhook de admision
# rechazo los pods de Velero mientras arrancaba), repite la restauracion con
# el procedimiento B del RUNBOOK, ya con el Secret disponible:
#   pausar ArgoCD -> retirar sts/PVC -> esperar que el pod desaparezca ->
#   velero restore --wait -> verificar PodVolumeRestore -> reactivar ArgoCD.
#
# Uso: P9/scripts/reintentar-restauracion.sh <backup>
set -euo pipefail
BACKUP="${1:?uso: $0 <backup>}"
CTX="${CTX:-kind-sa-p9}"
NS="${NS:-sa-p9-produccion}"
K="kubectl --context $CTX"
ts() { date -u +%FT%TZ; }
log() { echo "$(ts) [reintentar-restauracion] $*"; }
auto() {
  local p='{"spec":{"syncPolicy":{"automated":null}}}'
  [ "$1" = on ] && p='{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}'
  $K -n argocd patch application sa-p9-root --type merge -p "$p" >/dev/null
  if [ "$1" = off ]; then
    $K -n argocd patch application sa-platform --type merge -p "$p" >/dev/null
  else
    $K -n argocd patch application sa-p9-root --type merge \
      -p '{"operation":{"initiatedBy":{"username":"bootstrap"},"sync":{"revision":"main"}}}' >/dev/null
  fi
}

log "repitiendo restauracion desde $BACKUP"
auto off
$K -n "$NS" delete statefulset sa-platform-postgresql --ignore-not-found --wait=true >/dev/null
$K -n "$NS" delete pvc data-sa-platform-postgresql-0 --ignore-not-found --wait=true >/dev/null
$K -n "$NS" wait --for=delete pod/sa-platform-postgresql-0 --timeout=180s >/dev/null 2>&1 || true
R="dr-reintento-$(date -u +%H%M%S)"
velero --kubecontext "$CTX" restore create "$R" --from-backup "$BACKUP" \
  --include-namespaces "$NS" --selector app.kubernetes.io/name=postgresql --wait >/dev/null
bytes=$($K -n velero get podvolumerestores -l "velero.io/restore-name=$R" \
  -o jsonpath='{range .items[?(@.status.phase=="Completed")]}{.status.progress.totalBytes}{"\n"}{end}' | sort -n | tail -1)
$K -n "$NS" wait --for=condition=Ready pod/sa-platform-postgresql-0 --timeout=300s >/dev/null
auto on
$K -n "$NS" rollout restart deploy/sa-platform-ms-auth >/dev/null
log "restore $R fase=$($K -n velero get restore "$R" -o jsonpath='{.status.phase}') volumen=${bytes:-0} bytes"
[ "${bytes:-0}" -gt 0 ]
