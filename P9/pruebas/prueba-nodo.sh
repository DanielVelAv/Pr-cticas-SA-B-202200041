#!/usr/bin/env bash
# Prueba de resiliencia ante perdida de nodo.
#
# 1. Lanza un pod "sonda" en el control-plane (fuera de los workers que se
#    drenan) que cada segundo consulta, por los Services del cluster:
#      - api-gateway /health
#      - ms-auth /health
#      - login real via gateway (/api/auth/login -> ms-auth -> PostgreSQL)
#    No se usa port-forward: se ataria a UN pod y falsearia la prueba.
# 2. Drena el worker que NO aloja PostgreSQL (1 replica = SPOF declarado).
# 3. Espera, devuelve el nodo (uncordon) y resume peticiones OK / fallidas.
#
# Uso: P9/pruebas/prueba-nodo.sh [segundos_drenado]   (por defecto 150)
set -euo pipefail

ESPERA="${1:-150}"
CTX="${CTX:-kind-sa-p9}"
NS="${NS:-sa-p9-produccion}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$RAIZ/evidencias/nodo-$(date -u +%Y%m%dT%H%M%SZ).log"
K="kubectl --context $CTX"
exec > >(tee -a "$LOG") 2>&1

ts() { date -u +%FT%TZ; }
log() { echo "$(ts) $*"; }

log "== Prueba de perdida de nodo (log: $LOG)"
log "estado inicial:"
$K -n "$NS" get pods -o wide --no-headers | awk '{printf "   %-45s %-8s %s\n", $1, $3, $7}'
$K -n "$NS" get pdb --no-headers | awk '{printf "   PDB %-30s allowed-disruptions=%s\n", $1, $4}'

NODO_PG=$($K -n "$NS" get pod sa-platform-postgresql-0 -o jsonpath='{.spec.nodeName}')
VICTIMA=$($K get nodes --no-headers -l '!node-role.kubernetes.io/control-plane' \
  | awk '{print $1}' | grep -vx "$NODO_PG" | head -1)
log "PostgreSQL en $NODO_PG -> se drena $VICTIMA"

$K -n "$NS" delete pod sonda --ignore-not-found --wait=true >/dev/null
$K -n "$NS" apply -f - >/dev/null <<YAML
apiVersion: v1
kind: Pod
metadata:
  name: sonda
  labels:
    app.kubernetes.io/name: sonda
spec:
  restartPolicy: Never
  nodeSelector:
    node-role.kubernetes.io/control-plane: ""
  tolerations:
    - key: node-role.kubernetes.io/control-plane
      effect: NoSchedule
  containers:
    - name: sonda
      image: curlimages/curl:8.10.1
      resources:
        requests: { cpu: 20m, memory: 32Mi }
        limits: { cpu: 200m, memory: 64Mi }
      command: ["/bin/sh", "-c"]
      args:
        - |
          while true; do
            g=\$(curl -s -o /dev/null -m 2 -w '%{http_code}' http://sa-platform-api-gateway:8080/health)
            a=\$(curl -s -o /dev/null -m 2 -w '%{http_code}' http://sa-platform-ms-auth:3001/health)
            l=\$(curl -s -o /dev/null -m 3 -w '%{http_code}' -X POST http://sa-platform-api-gateway:8080/api/auth/login \
                 -H 'Content-Type: application/json' -d '{"correo":"cliente@usac.edu.gt","password":"Cliente.12345"}')
            echo "\$(date -u +%H:%M:%S) gateway=\$g ms-auth=\$a login=\$l"
            sleep 1
          done
YAML
$K -n "$NS" wait --for=condition=Ready pod/sonda --timeout=120s >/dev/null
log "sonda corriendo en el control-plane; linea base 15 s"
sleep 15

T_DRAIN=$(ts)
log "T_drain_inicio: kubectl drain $VICTIMA"
$K drain "$VICTIMA" --ignore-daemonsets --delete-emptydir-data --timeout=180s 2>&1 \
  | grep -E 'evicting|evicted|drained|error|cannot' | sed 's/^/   /' || true
log "T_drain_fin: nodo drenado; servicio sostenido durante ${ESPERA}s"
$K -n "$NS" get pods -o wide --no-headers | awk '{printf "   %-45s %-8s %s\n", $1, $3, $7}'
sleep "$ESPERA"

log "T_uncordon: devolviendo $VICTIMA"
$K uncordon "$VICTIMA" >/dev/null
sleep 10

log "== Registro de la sonda (1 linea por segundo)"
$K -n "$NS" logs sonda > "$LOG.sonda"
total=$(wc -l < "$LOG.sonda")
fallos=$(grep -cvE 'gateway=200 ms-auth=200 login=200' "$LOG.sonda" || true)
sed 's/^/   /' "$LOG.sonda"
rm -f "$LOG.sonda"
$K -n "$NS" delete pod sonda --wait=false >/dev/null

log "== RESUMEN: nodo drenado=$VICTIMA desde $T_DRAIN; muestras=$total; muestras con algun fallo=$fallos"
log "estado final:"
$K -n "$NS" get pods -o wide --no-headers | awk '{printf "   %-45s %-8s %s\n", $1, $3, $7}'
