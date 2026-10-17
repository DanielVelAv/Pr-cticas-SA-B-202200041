#!/usr/bin/env bash
# =====================================================================
# P9 — PUNTO UNICO DE ENTRADA de la reconstruccion.
#
#   ./P9/bootstrap.sh
#
# Desde cero (sin cluster) deja el sistema completo funcionando:
#   terraform (estado en HCP) -> cluster kind -> StorageClass/ns/cuotas/RBAC
#   -> llave Sealed Secrets -> Velero -> [restore de PostgreSQL si hay
#   respaldo] -> ArgoCD -> app raiz sa-p9-root -> (GitOps levanta el resto)
#
# Prerrequisitos (una sola vez, ver RUNBOOK.md): docker, kind, terraform,
# kubectl, helm, velero; terraform login; ~/.config/sa-p9/{r2.env,
# credentials-velero}; limites de inotify.
# =====================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")" && pwd)"
TF="$RAIZ/terraform"
CONF="${SA_P9_CONF:-$HOME/.config/sa-p9}"
CTX="kind-sa-p9"
TIMEOUT_GITOPS="${TIMEOUT_GITOPS:-1200}"
mkdir -p "$RAIZ/evidencias"
LOG="$RAIZ/evidencias/bootstrap-$(date -u +%Y%m%dT%H%M%SZ).log"
exec > >(tee -a "$LOG") 2>&1

ts() { date -u +%FT%TZ; }
etapa() { echo; echo "$(ts) ===== $* ====="; }
falla() { echo "$(ts) ERROR: $*"; exit 1; }
# Muestra solo las lineas relevantes de terraform, pero SIN tragarse su
# codigo de salida (pipefail + grep que no falla si no hay coincidencias).
filtrar() { grep -E "$1" || true; }

T0=$(date +%s)
etapa "T_inicio bootstrap (log: $LOG)"

# ---------------------------------------------------------------------
etapa "1/6 prerrequisitos"
for c in docker kind terraform kubectl helm velero curl; do
  command -v "$c" >/dev/null || falla "falta el comando '$c'"
done
docker info >/dev/null 2>&1 || falla "docker no responde"
[ -f "$HOME/.terraform.d/credentials.tfrc.json" ] || falla "falta 'terraform login' (HCP Terraform)"
[ -f "$CONF/r2.env" ] || falla "falta $CONF/r2.env"
[ -f "$CONF/credentials-velero" ] || falla "falta $CONF/credentials-velero"
[ "$(sysctl -n fs.inotify.max_user_instances)" -ge 512 ] || falla "fs.inotify.max_user_instances < 512 (ver RUNBOOK)"
echo "ok"

# Variables para Terraform (nunca se escriben en el repositorio).
# shellcheck disable=SC1091
source "$CONF/r2.env"
export TF_VAR_r2_account_id="$R2_ACCOUNT_ID"
export TF_VAR_r2_bucket="${R2_BUCKET:-sa-p9-velero}"
export TF_VAR_r2_archivo_credenciales="$CONF/credentials-velero"

# ---------------------------------------------------------------------
etapa "2/6 terraform init (backend remoto HCP Terraform)"
terraform -chdir="$TF" init -input=false -no-color -reconfigure >/dev/null
echo "ok"

# ---------------------------------------------------------------------
etapa "3/6 terraform apply fase 1: cluster kind"
# Desastre: el estado remoto recuerda un cluster que ya no existe. El
# provider de kind falla al refrescarlo (no lo marca para recrear), asi
# que se retira esa entrada del estado; el resto de recursos de
# Kubernetes se detectan como ausentes en la fase 2 y se recrean.
if terraform -chdir="$TF" state list 2>/dev/null | grep -qx 'kind_cluster.sa_p9' \
   && ! kind get clusters 2>/dev/null | grep -qx 'sa-p9'; then
  echo "$(ts) DESASTRE DETECTADO: el estado remoto tiene kind_cluster.sa_p9 pero el cluster no existe -> state rm"
  terraform -chdir="$TF" state rm -no-color kind_cluster.sa_p9
fi
terraform -chdir="$TF" apply -input=false -no-color -auto-approve -target=kind_cluster.sa_p9 \
  | filtrar '^(kind_cluster.*(complete|Creating)|Apply complete|No changes|Error)'

kubectl --context "$CTX" get nodes --no-headers | awk '{print "  nodo", $1, $2}'

# ---------------------------------------------------------------------
etapa "4/6 terraform apply fase 2: plataforma (ns, llave, Velero, restore, ArgoCD, app raiz)"
terraform -chdir="$TF" apply -input=false -no-color -auto-approve \
  | filtrar 'Creation complete|Modifications complete|Destruction complete|restaurar-datos|Apply complete|No changes|Error'

terraform -chdir="$TF" output -raw sealed_secrets_cert > "$RAIZ/sealed-secrets-pub.pem"
echo "certificado publico de Sealed Secrets -> P9/sealed-secrets-pub.pem"

# ---------------------------------------------------------------------
etapa "5/6 esperando GitOps: sa-p9-root y aplicaciones hijas Synced + Healthy"
fin=$(( $(date +%s) + TIMEOUT_GITOPS ))
while :; do
  estado=$(kubectl --context "$CTX" -n argocd get applications \
    -o jsonpath='{range .items[*]}{.metadata.name}{"="}{.status.sync.status}{"/"}{.status.health.status}{" "}{end}' 2>/dev/null || true)
  pendientes=$(echo "$estado" | tr ' ' '\n' | grep -v '^$' | grep -vc '=Synced/Healthy$' || true)
  if [ -n "$estado" ] && [ "$pendientes" -eq 0 ]; then
    echo "$(ts) todas Synced/Healthy: $estado"
    break
  fi
  [ "$(date +%s)" -ge "$fin" ] && falla "timeout esperando GitOps: $estado"
  echo "$(ts) esperando: $estado"
  sleep 20
done

# ---------------------------------------------------------------------
etapa "6/6 verificacion del servicio"
NS=sa-p9-produccion
kubectl --context "$CTX" -n "$NS" port-forward svc/sa-platform-api-gateway 18080:8080 >/dev/null 2>&1 &
PF=$!
trap 'kill $PF 2>/dev/null || true' EXIT
ok=""
for _ in $(seq 1 30); do
  if salud=$(curl -sf localhost:18080/health); then ok=1; break; fi
  sleep 2
done
[ -n "$ok" ] || falla "/health del api-gateway no responde"
echo "$(ts) api-gateway /health: $salud"

# Si hubo restauracion, confirmar que el VOLUMEN se restauro (termina
# despues de que ArgoCD entrega el Secret de PostgreSQL). Si no, repetirla
# automaticamente (procedimiento B del RUNBOOK) sin intervencion del operador.
restore=$(kubectl --context "$CTX" -n velero get restores -o jsonpath='{range .items[*]}{.metadata.creationTimestamp}{" "}{.metadata.name}{"\n"}{end}' 2>/dev/null | grep ' dr-' | sort | tail -1 | awk '{print $2}')
if [ -n "$restore" ]; then
  for _ in $(seq 1 60); do
    fase=$(kubectl --context "$CTX" -n velero get restore "$restore" -o jsonpath='{.status.phase}')
    case "$fase" in Completed|PartiallyFailed|Failed) break ;; esac
    sleep 5
  done
  bytes=$(kubectl --context "$CTX" -n velero get podvolumerestores -l "velero.io/restore-name=$restore" \
    -o jsonpath='{range .items[?(@.status.phase=="Completed")]}{.status.progress.totalBytes}{"\n"}{end}' | sort -n | tail -1)
  echo "$(ts) restauracion $restore: fase=$fase volumen=${bytes:-0} bytes"
  if [ "${bytes:-0}" -lt 1000000 ]; then
    backup=$(kubectl --context "$CTX" -n velero get restore "$restore" -o jsonpath='{.spec.backupName}')
    echo "$(ts) el volumen de PostgreSQL NO se restauro -> reintento automatico"
    "$RAIZ/scripts/reintentar-restauracion.sh" "$backup" || falla "la restauracion de datos fallo dos veces (ver RUNBOOK B)"
  fi
fi

T1=$(date +%s)
etapa "T_fin bootstrap: duracion $(( (T1 - T0) / 60 )) min $(( (T1 - T0) % 60 )) s"
