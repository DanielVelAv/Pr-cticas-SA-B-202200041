#!/usr/bin/env bash
# Genera credenciales NUEVAS para sa-platform y las sella con el
# certificado publico de Sealed Secrets (P9/sealed-secrets-pub.pem, que
# sale del estado remoto de Terraform). El resultado SI se versiona en el
# repo GitOps: solo la llave privada (estado remoto HCP + copia fuera de
# linea) puede descifrarlo.
#
# ATENCION: ejecutar SOLO al crear el entorno por primera vez. La
# contrasena de PostgreSQL y AES_KEY/BLIND_INDEX_KEY quedan grabadas en
# los datos (pg_authid y columnas cifradas). Re-sellar con valores nuevos
# sobre una base restaurada la deja inaccesible/ilegible.
#
# Uso: P9/scripts/sellar-secretos.sh <ruta-repo-gitops>
set -euo pipefail

GITOPS="${1:?uso: $0 <ruta-repo-gitops>}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
CERT="$RAIZ/sealed-secrets-pub.pem"
NS=sa-p9-produccion
NOMBRE=sa-platform-secrets
SALIDA="$GITOPS/secretos/$NOMBRE.sealed.yaml"
HOST=sa-platform-postgresql
USUARIO=sa

[ -f "$CERT" ] || { echo "falta $CERT (correr bootstrap.sh)"; exit 1; }
[ -f "$SALIDA" ] && [ "${FORZAR:-}" != "1" ] && { echo "$SALIDA ya existe; FORZAR=1 para regenerar (ver ATENCION)"; exit 1; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
openssl genrsa -out "$TMP/jwt_private.pem" 2048 2>/dev/null
openssl rsa -in "$TMP/jwt_private.pem" -pubout -out "$TMP/jwt_public.pem" 2>/dev/null

PG=$(openssl rand -hex 24)
RMQ=$(openssl rand -hex 24)
url() { echo "postgresql://$USUARIO:$PG@$HOST:5432/$1"; }

mkdir -p "$(dirname "$SALIDA")"
kubectl create secret generic "$NOMBRE" -n "$NS" --dry-run=client -o yaml \
  --from-literal=postgres-password="$PG" \
  --from-literal=rabbitmq-password="$RMQ" \
  --from-literal=AES_KEY="$(openssl rand -base64 32)" \
  --from-literal=BLIND_INDEX_KEY="$(openssl rand -base64 32)" \
  --from-file=jwt-private-key="$TMP/jwt_private.pem" \
  --from-file=jwt-public-key="$TMP/jwt_public.pem" \
  --from-literal=database-url-ms-auth="$(url auth_db)" \
  --from-literal=database-url-ms-lotes="$(url lotes_db)" \
  --from-literal=database-url-ms-aprobaciones="$(url aprobaciones_db)" \
  --from-literal=database-url-ms-notificaciones="$(url notificaciones_db)" \
  --from-literal=database-url-cronjobs="$(url cron_db)" \
  --from-literal=RABBITMQ_URL="amqp://sa:$RMQ@sa-platform-rabbitmq:5672/" \
  | kubeseal --cert "$CERT" --scope strict -o yaml > "$SALIDA"

echo "sellado -> $SALIDA ($(grep -c 'encryptedData' "$SALIDA") bloque encryptedData, $(grep -cE '^    [A-Za-z_-]+: Ag' "$SALIDA") claves)"
