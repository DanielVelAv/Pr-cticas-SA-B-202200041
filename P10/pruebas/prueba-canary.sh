#!/usr/bin/env bash
# Canary gobernado por metricas: nueva version del gateway con TASA_FALLO
# (fraccion de peticiones /api que responden 500). El AnalysisTemplate
# consulta en Prometheus la tasa de error y el p95 SOLO del pod canary;
# al superar el umbral, Argo Rollouts aborta y vuelve a la version estable
# sin intervencion. Al final se restablece el estado del repositorio.
#
# Equivale a hacer commit de api-gateway.tasaFallo en values-p9.yaml; se
# aplica con ArgoCD pausado para no ensuciar el historial del repo GitOps.
# Uso: P10/pruebas/prueba-canary.sh [tasa]   (por defecto 0.3)
set -euo pipefail
TASA="${1:-0.3}"
CTX="${CTX:-kind-sa-p9}"; NS=sa-p9-produccion; RO=sa-platform-api-gateway
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$RAIZ/evidencias/canary-$(date -u +%Y%m%dT%H%M%SZ).log"
K="kubectl --context $CTX"
exec > >(tee -a "$LOG") 2>&1
ts() { date -u +%FT%TZ; }; log() { echo "$(ts) $*"; }

argocd() {
  local p='{"spec":{"syncPolicy":{"automated":null}}}'
  [ "$1" = on ] && p='{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}'
  $K -n argocd patch application sa-p9-root --type merge -p "$p" >/dev/null
  if [ "$1" = off ]; then $K -n argocd patch application sa-platform --type merge -p "$p" >/dev/null
  else $K -n argocd patch application sa-p9-root --type merge -p '{"operation":{"initiatedBy":{"username":"prueba-canary"},"sync":{"revision":"main"}}}' >/dev/null; fi
}
idx() { $K -n $NS get rollout $RO -o json | python3 -c 'import json,sys;e=json.load(sys.stdin)["spec"]["template"]["spec"]["containers"][0]["env"];print([i for i,x in enumerate(e) if x["name"]=="TASA_FALLO"][0])'; }

log "== Canary con fallo inducido: TASA_FALLO=$TASA (log: $LOG)"
log "estable: $($K -n $NS get rollout $RO -o jsonpath='{.status.stableRS}') imagen $($K -n $NS get rollout $RO -o jsonpath='{.spec.template.spec.containers[0].image}')"
argocd off
I=$(idx)
T0=$(ts)
$K -n $NS patch rollout $RO --type json -p "[{\"op\":\"replace\",\"path\":\"/spec/template/spec/containers/0/env/$I/value\",\"value\":\"$TASA\"}]" >/dev/null
log "T_cambio: nueva revision con TASA_FALLO=$TASA"
for _ in $(seq 1 40); do
  st=$($K -n $NS get rollout $RO -o jsonpath='{.status.phase}|paso={.status.currentStepIndex}|{.status.message}')
  log "rollout: $st"
  case "$st" in Degraded*) break ;; esac
  sleep 10
done
T_ABORTO=$(ts)
AR=$($K -n $NS get analysisruns --sort-by=.metadata.creationTimestamp -o name | tail -1)
log "AnalysisRun: ${AR#*/} fase=$($K -n $NS get $AR -o jsonpath='{.status.phase}')"
$K -n $NS get $AR -o jsonpath='{range .status.metricResults[*]}   metrica={.name} fase={.phase} exitosas={.successful} fallidas={.failed} valores={range .measurements[*]}{.value} {end}{"\n"}{end}'
log "consulta de la tasa de error:"; $K -n $NS get analysistemplate api-gateway-metricas-canary -o jsonpath='{.spec.metrics[0].provider.prometheus.query}' | sed 's/^/   /'
log "pods del gateway tras el aborto (la version estable sigue atendiendo):"
$K -n $NS get pods -l app.kubernetes.io/name=api-gateway --no-headers | awk '{print "   ", $1, $2, $3}'
$K -n $NS patch rollout $RO --type json -p "[{\"op\":\"replace\",\"path\":\"/spec/template/spec/containers/0/env/$I/value\",\"value\":\"0\"}]" >/dev/null
argocd on
for _ in $(seq 1 18); do [ "$($K -n $NS get rollout $RO -o jsonpath='{.status.phase}')" = Healthy ] && break; sleep 5; done
log "restablecido TASA_FALLO=0 y ArgoCD; rollout: $($K -n $NS get rollout $RO -o jsonpath='{.status.phase}')"
log "== RESUMEN: cambio $T0 -> aborto automatico $T_ABORTO ($(( $(date -d "$T_ABORTO" +%s) - $(date -d "$T0" +%s) ))s), Rollout $RO, ${AR#*/}"
