#!/usr/bin/env bash
# Recorrido del sintoma a la causa, cronometrado.
#  1. Fallo inducido: ms-auth con FALLO_BD=true (el login consulta una tabla
#     inexistente, como una version con una migracion incompleta).
#  2. Primera senal: el indicador de 5 min del SLO de disponibilidad sube.
#  3. Alerta: SLODisponibilidadConsumoRapido (consumo del presupuesto) en firing.
#  4. Recorrido: alerta -> traza con error de ms-auth en Tempo -> registro
#     del error en Loki con el mismo trace_id (causa).
#  5. Recuperacion: se quita el fallo y se mide el retorno al estado estable.
# Equivale a un commit de ms-auth.falloBD; se aplica con ArgoCD pausado.
set -euo pipefail
CTX="${CTX:-kind-sa-p9}"; NS=sa-p9-produccion
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$RAIZ/evidencias/sintoma-causa-$(date -u +%Y%m%dT%H%M%SZ).log"
K="kubectl --context $CTX"
exec > >(tee -a "$LOG") 2>&1
ts() { date -u +%FT%TZ; }; log() { echo "$(ts) $*"; }; seg() { date -d "$1" +%s; }

$K -n observabilidad port-forward svc/monitoring-prometheus 19090:9090 >/dev/null 2>&1 & P1=$!
$K -n observabilidad port-forward svc/tempo 13200:3200 >/dev/null 2>&1 & P2=$!
$K -n observabilidad port-forward svc/loki 13100:3100 >/dev/null 2>&1 & P3=$!
trap 'kill $P1 $P2 $P3 2>/dev/null || true' EXIT; sleep 3
prom() { curl -s --get localhost:19090/api/v1/query --data-urlencode "query=$1" | python3 -c 'import json,sys;r=json.load(sys.stdin)["data"]["result"];print(r[0]["value"][1] if r else "")'; }
argocd() {
  local p='{"spec":{"syncPolicy":{"automated":null}}}'
  [ "$1" = on ] && p='{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}'
  $K -n argocd patch application sa-p9-root --type merge -p "$p" >/dev/null
  if [ "$1" = off ]; then $K -n argocd patch application sa-platform --type merge -p "$p" >/dev/null
  else $K -n argocd patch application sa-p9-root --type merge -p '{"operation":{"initiatedBy":{"username":"prueba"},"sync":{"revision":"main"}}}' >/dev/null; fi
}
fallo() { # true|false
  local i; i=$($K -n $NS get deploy sa-platform-ms-auth -o json | python3 -c 'import json,sys;e=json.load(sys.stdin)["spec"]["template"]["spec"]["containers"][0]["env"];print([i for i,x in enumerate(e) if x["name"]=="FALLO_BD"][0])')
  $K -n $NS patch deploy sa-platform-ms-auth --type json -p "[{\"op\":\"replace\",\"path\":\"/spec/template/spec/containers/0/env/$i/value\",\"value\":\"$1\"}]" >/dev/null
}

log "== Recorrido sintoma -> causa (log: $LOG)"
log "linea base: error 5m=$(prom 'slo:sli_error:ratio_rate5m{slo="disponibilidad"}') error 1h=$(prom 'slo:sli_error:ratio_rate1h{slo="disponibilidad"}')"
argocd off
T_FALLO=$(ts); fallo true
log "T_fallo: ms-auth con FALLO_BD=true"
$K -n $NS rollout status deploy/sa-platform-ms-auth --timeout=180s >/dev/null && log "ms-auth desplegado con el fallo"

T_SENAL=""; T_ALERTA=""
for _ in $(seq 1 180); do
  e5=$(prom 'slo:sli_error:ratio_rate5m{slo="disponibilidad"}'); e1=$(prom 'slo:sli_error:ratio_rate1h{slo="disponibilidad"}')
  if [ -z "$T_SENAL" ] && python3 -c "import sys;sys.exit(0 if float('${e5:-0}' or 0)>0.01 else 1)"; then T_SENAL=$(ts); log "T_primera_senal: error 5m=$e5 (indicador del SLO por encima de 1 %)"; fi
  est=$(prom 'max(ALERTS{alertname="SLODisponibilidadConsumoRapido",alertstate="firing"})')
  log "   error 5m=${e5:0:6} 1h=${e1:0:6} alerta=${est:-no}"
  [ "$est" = "1" ] && { T_ALERTA=$(ts); break; }
  sleep 15
done
[ -n "$T_ALERTA" ] || { log "ERROR: la alerta no se disparo"; fallo false; argocd on; exit 1; }
log "T_alerta: SLODisponibilidadConsumoRapido en firing (severity=page)"
curl -s localhost:19090/api/v1/alerts | python3 -c 'import json,sys
for a in json.load(sys.stdin)["data"]["alerts"]:
  if a["labels"]["alertname"]=="SLODisponibilidadConsumoRapido": print("   resumen:",a["annotations"]["summary"]); print("   runbook:",a["annotations"]["runbook_url"])'

# --- Recorrido: alerta -> traza -> registro ---
T_R0=$(ts)
TID=$(curl -s --get localhost:13200/api/search --data-urlencode 'q={ resource.service.name = "ms-auth" && status = error }' --data-urlencode 'limit=1' --data-urlencode "start=$(( $(date +%s) - 600 ))" --data-urlencode "end=$(date +%s)" | python3 -c 'import json,sys;t=json.load(sys.stdin).get("traces",[]);print(t[0]["traceID"].zfill(32) if t else "")')
# (la API de busqueda de Tempo omite los ceros iniciales del trace_id; los
#  registros JSON lo traen completo con 32 caracteres hexadecimales)
T_TRAZA=$(ts); log "T_traza: traza con error en ms-auth (Tempo, TraceQL status=error): $TID"
curl -s localhost:13200/api/traces/$TID | python3 -c 'import json,sys
d=json.load(sys.stdin)
for b in d.get("batches",[]):
  svc=[a["value"].get("stringValue") for a in b["resource"]["attributes"] if a["key"]=="service.name"][0]
  for ss in b.get("scopeSpans",[]):
    for sp in ss["spans"]:
      if sp.get("status",{}).get("code") in ("STATUS_CODE_ERROR",2):
        print("    span con error:",svc,"|",sp["name"],"|",sp.get("status",{}).get("message","")[:90])'
LINEAS=$(curl -s --get localhost:13100/loki/api/v1/query_range --data-urlencode "query={namespace=\"$NS\"} | json | trace_id=\"$TID\" | level=\"error\"" --data-urlencode 'limit=10' --data-urlencode "start=$(( $(date +%s) - 900 ))000000000" | python3 -c 'import json,sys;r=json.load(sys.stdin)["data"]["result"];[print("    "+v[1]) for s in r for v in s["values"]]')
T_REGISTRO=$(ts); log "T_registro: registros de error en Loki con el mismo trace_id (consulta: {namespace=\"$NS\"} | json | trace_id=\"$TID\" | level=\"error\"):"; echo "$LINEAS"
log "recorrido alerta -> traza -> registro: $(( $(seg "$T_REGISTRO") - $(seg "$T_R0") ))s"

# --- Recuperacion ---
T_ARREGLO=$(ts); fallo false; argocd on
log "T_correccion: FALLO_BD=false (se revierte el cambio)"
$K -n $NS rollout status deploy/sa-platform-ms-auth --timeout=180s >/dev/null
for _ in $(seq 1 60); do
  e5=$(prom 'slo:sli_error:ratio_rate5m{slo="disponibilidad"}')
  python3 -c "import sys;sys.exit(0 if float('${e5:-1}' or 1)<0.01 else 1)" && break; sleep 15
done
T_ESTABLE=$(ts); log "T_estable: error 5m=$e5 (< 1 %)"
log "== RESUMEN"
log "   T_fallo=$T_FALLO  T_primera_senal=$T_SENAL  T_alerta=$T_ALERTA"
log "   deteccion: primera senal $(( $(seg "$T_SENAL") - $(seg "$T_FALLO") ))s, alerta $(( $(seg "$T_ALERTA") - $(seg "$T_FALLO") ))s"
log "   recorrido alerta->traza->registro: $(( $(seg "$T_REGISTRO") - $(seg "$T_R0") ))s"
log "   recuperacion (correccion -> estable): $(( $(seg "$T_ESTABLE") - $(seg "$T_ARREGLO") ))s; total con fallo: $(( $(seg "$T_ESTABLE") - $(seg "$T_FALLO") ))s"
