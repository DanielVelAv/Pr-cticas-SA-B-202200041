#!/usr/bin/env bash
# Latido de datos para medir el RPO: inserta una fila en auth_db.dr_latido
# cada 10 s. Debe arrancarse ANTES del respaldo programado y seguir hasta el
# desastre; el ultimo latido que sobrevive a la restauracion da el RPO real.
#
# Uso: P9/pruebas/latido.sh start|stop|status
set -euo pipefail
CTX="${CTX:-kind-sa-p9}"
NS="${NS:-sa-p9-produccion}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PIDF="$RAIZ/evidencias/.latido.pid"

case "${1:-}" in
  start)
    if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then echo "latido ya corre (pid $(cat "$PIDF"))"; exit 0; fi
    nohup bash -c "while true; do
      kubectl --context $CTX -n $NS exec sa-platform-postgresql-0 -c postgresql -- sh -c \
        'PGPASSWORD=\"\$(cat \"\$POSTGRES_POSTGRES_PASSWORD_FILE\")\" psql -U postgres -d auth_db -qc \"INSERT INTO dr_latido DEFAULT VALUES\"' >/dev/null 2>&1 || true
      sleep 10
    done" >/dev/null 2>&1 &
    echo $! > "$PIDF"; echo "latido iniciado (pid $!)" ;;
  stop)
    [ -f "$PIDF" ] && kill "$(cat "$PIDF")" 2>/dev/null || true
    rm -f "$PIDF"; echo "latido detenido" ;;
  status)
    [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null && echo "corriendo (pid $(cat "$PIDF"))" || echo "detenido" ;;
  *) echo "uso: $0 start|stop|status"; exit 1 ;;
esac
