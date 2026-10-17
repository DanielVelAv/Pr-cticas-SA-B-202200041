# Runbook de recuperación — sa-platform (P9)

Procedimiento para que **una persona que no conoce el sistema** lo recupere sin
ayuda del autor. Cada paso tiene: comando, resultado esperado y qué hacer si falla.
Todos los comandos se ejecutan desde la raíz del repositorio de código.

| Escenario | Síntoma | Sección |
|---|---|---|
| A. Pérdida total del clúster | `kubectl --context kind-sa-p9 get nodes` falla o no hay clúster | [A](#a-pérdida-total-del-clúster) |
| B. Pérdida o corrupción de datos | usuarios desaparecidos, login falla, PVC de PostgreSQL borrado | [B](#b-pérdida-o-corrupción-de-los-datos-de-postgresql) |
| C. Mantenimiento o caída de un nodo | hay que drenar un worker | [C](#c-drenar-un-nodo-mantenimiento) |
| D. Pérdida del estado de Terraform o de la llave | workspace de HCP borrado, SealedSecret sin descifrar | [D](#d-pérdida-del-estado-remoto-o-de-la-llave-de-sealed-secrets) |
| E. Problemas conocidos | bloqueo de Terraform, backup colgado, OutOfSync | [E](#e-problemas-conocidos) |

---

## 0. Qué sobrevive a un desastre y dónde está

| Pieza | Ubicación | Quién la necesita |
|---|---|---|
| Código e infraestructura (Terraform) | este repositorio, carpeta `P9/` | bootstrap |
| Manifiestos (app-of-apps) | https://github.com/DanielVelAv/sa-platform-gitops (público) | ArgoCD |
| Estado de Terraform y llave de Sealed Secrets | HCP Terraform, organización `Sa9`, workspace `sa-p9` | bootstrap |
| Imágenes | `ghcr.io/danielvelav/sa-p9/{api-gateway,ms-auth}:v1.0.0` (públicas) | Kubernetes |
| Respaldos de datos | Cloudflare R2, bucket `sa-p9-velero`, carpeta `sa-p9/` | Velero |
| Credenciales del operador | gestor de contraseñas del equipo → se copian a `~/.config/sa-p9/` | bootstrap |
| Llave de Sealed Secrets (3 copias) | 1) estado remoto HCP · 2) respaldo diario de Velero en R2 (`sa-p9-llave-sealed-secrets`) · 3) copia fuera de línea en el gestor de contraseñas | bootstrap / sección D |

Lo que **no** sobrevive (aceptado): eventos, logs, historial de AnalysisRuns y
los datos escritos después del último respaldo horario.

---

## 1. Prerrequisitos (una sola vez por máquina)

| # | Paso | Comando / acción | Verificación |
|---|---|---|---|
| 1.1 | Herramientas | docker, kind ≥ 0.24, terraform 1.9.x, kubectl, helm 3, velero 1.18, curl | `for c in docker kind terraform kubectl helm velero; do $c version >/dev/null 2>&1 && echo "$c ok"; done` (velero: `velero version --client-only`) |
| 1.2 | Límites de inotify (kind con 3 nodos falla sin esto: `too many open files`) | `echo -e "fs.inotify.max_user_watches=524288\nfs.inotify.max_user_instances=512" \| sudo tee /etc/sysctl.d/99-kind.conf && sudo sysctl --system` | `sysctl fs.inotify.max_user_instances` → `512` |
| 1.3 | Acceso a HCP Terraform | `terraform login` (si no abre el navegador: crear token en https://app.terraform.io/app/settings/tokens y pegarlo) | existe `~/.terraform.d/credentials.tfrc.json` |
| 1.4 | Credenciales de R2 | crear `~/.config/sa-p9/credentials-velero` y `~/.config/sa-p9/r2.env` (formato abajo), `chmod 600` | `ls -l ~/.config/sa-p9` muestra ambos archivos |
| 1.5 | RAM libre | al menos ~5 GiB libres; borrar otros clústeres kind | `free -h` |

`~/.config/sa-p9/credentials-velero` es un archivo de credenciales con formato de AWS: una
línea `[default]` y debajo las claves `aws_access_key_id` y `aws_secret_access_key`, cada una
seguida de `=` y del valor del token de R2 (Access Key ID y Secret Access Key).
```bash
# ~/.config/sa-p9/r2.env
R2_ACCOUNT_ID=<Account ID de Cloudflare>
R2_BUCKET=sa-p9-velero
R2_ENDPOINT=https://<Account ID>.r2.cloudflarestorage.com
```

Comprobación de acceso a R2 (opcional, requiere `aws` CLI):
```bash
source ~/.config/sa-p9/r2.env
AWS_SHARED_CREDENTIALS_FILE=~/.config/sa-p9/credentials-velero \
  aws s3 ls s3://$R2_BUCKET/sa-p9/backups/ --endpoint-url $R2_ENDPOINT --region auto
```
Esperado: una carpeta por respaldo (`sa-p9-horario-AAAAMMDDhhmmss/`).

---

## A. Pérdida total del clúster

**Tiempo esperado: ~10–15 min. Objetivo declarado (RTO): ≤ 20 min.**

### A.1 Confirmar el desastre
```bash
kind get clusters
kubectl --context kind-sa-p9 get nodes
```
- Esperado en un desastre: `sa-p9` no aparece, o los nodos no responden.
- Si el clúster existe pero está dañado: `kind delete cluster --name sa-p9` y seguir.

### A.2 Ejecutar el punto único de entrada
```bash
./P9/bootstrap.sh
```
No requiere ninguna intervención. Escribe todo en `P9/evidencias/bootstrap-<fecha>.log`.
Etapas que debe mostrar, en orden:

| Etapa | Qué hace | Señal de éxito |
|---|---|---|
| 1/6 prerrequisitos | revisa herramientas, `terraform login`, credenciales, inotify | `ok` |
| 2/6 terraform init | conecta con el estado remoto en HCP | `ok` |
| 3/6 fase 1 | si el estado recuerda un clúster que ya no existe: `DESASTRE DETECTADO ... state rm`; crea el clúster kind (1 control-plane + 2 workers) | `Apply complete!` y 3 nodos listados |
| 4/6 fase 2 | StorageClass, namespaces, cuotas, RBAC, llave de Sealed Secrets, Velero, **restauración de PostgreSQL**, ArgoCD, app raíz | líneas `[restaurar-datos] respaldo elegido: ...` y `StatefulSet y PVC de PostgreSQL restaurados`; `Apply complete!` |
| 5/6 GitOps | espera a que todas las Applications estén Synced/Healthy | `todas Synced/Healthy` |
| 6/6 servicio | `/health` del api-gateway y fin de la restauración del volumen | `"estado":"ok"` y `restauracion dr-... fase=Completed` |

Si falla:
- **Etapa 1**: el mensaje dice qué falta → volver a la sección 1.
- **Etapa 2/3/4 con `Error acquiring the state lock`**: ver [E.1](#e1-terraform-bloqueado).
- **Etapa 4, `[restaurar-datos] ERROR: BSL no disponible`**: revisar credenciales de R2 (1.4) y
  `kubectl --context kind-sa-p9 -n velero logs deploy/velero | grep -i error`. Volver a ejecutar `./P9/bootstrap.sh` (es idempotente).
- **Etapa 5, timeout**: ver qué app no está lista:
  `kubectl --context kind-sa-p9 -n argocd get applications` y
  `kubectl --context kind-sa-p9 -n argocd describe application <app> | tail -20`.
  Si solo `kyverno` está OutOfSync, ver [E.3](#e3-aplicación-outofsync-sin-cambios-reales).

### A.3 Verificar que los datos volvieron
```bash
kubectl --context kind-sa-p9 -n sa-p9-produccion port-forward svc/sa-platform-api-gateway 18080:8080 &
curl -s -X POST localhost:18080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"correo":"admin@usac.edu.gt","password":"Admin.12345"}' -o /dev/null -w '%{http_code}\n'
```
- Esperado: `200`. Repetir con un usuario real creado antes del último respaldo.
- Conteo directo:
  ```bash
  kubectl --context kind-sa-p9 -n sa-p9-produccion exec sa-platform-postgresql-0 -c postgresql -- sh -c \
    'PGPASSWORD="$(cat "$POSTGRES_POSTGRES_PASSWORD_FILE")" psql -U postgres -d auth_db -c "SELECT count(*) FROM usuarios"'
  ```
- Si el login da `401` para todos o el conteo es 2 (solo la semilla): no se restauró. Revisar
  `velero --kubecontext kind-sa-p9 restore get` y aplicar la sección B.

### A.4 Verificar el resto del sistema
| Comprobación | Comando | Esperado |
|---|---|---|
| GitOps | `kubectl --context kind-sa-p9 -n argocd get applications` | 8 apps `Synced Healthy` |
| Secretos descifrados | `kubectl --context kind-sa-p9 -n sa-p9-produccion get sealedsecret` | `Synced True` |
| Entrega progresiva | `kubectl --context kind-sa-p9 -n sa-p9-produccion get rollout` | `sa-platform-api-gateway` 2/2 disponibles |
| Políticas de admisión | `kubectl --context kind-sa-p9 -n sa-p9-produccion run x --image=nginx:latest` | rechazado por `prohibir-tag-latest` |
| Respaldos | `velero --kubecontext kind-sa-p9 schedule get` | `sa-p9-horario Enabled` |

---

## B. Pérdida o corrupción de los datos de PostgreSQL

Con el clúster funcionando. Restaura **solo** PostgreSQL desde un respaldo; el resto no se toca.
(Automatizado en `P9/pruebas/prueba-restauracion.sh`.)

1. **Elegir el respaldo**:
   ```bash
   velero --kubecontext kind-sa-p9 backup get
   ```
   Tomar el más reciente con `STATUS=Completed` **anterior** al daño. Anotar su nombre (`BACKUP`).
2. **Pausar ArgoCD** (si no, recrea una base vacía mientras se restaura):
   ```bash
   kubectl --context kind-sa-p9 -n argocd patch application sa-p9-root  --type merge -p '{"spec":{"syncPolicy":{"automated":null}}}'
   kubectl --context kind-sa-p9 -n argocd patch application sa-platform --type merge -p '{"spec":{"syncPolicy":{"automated":null}}}'
   ```
   Verificar: `kubectl --context kind-sa-p9 -n argocd get application sa-platform -o jsonpath='{.spec.syncPolicy}'` → sin `automated`.
3. **Retirar la base dañada**:
   ```bash
   kubectl --context kind-sa-p9 -n sa-p9-produccion delete statefulset sa-platform-postgresql
   kubectl --context kind-sa-p9 -n sa-p9-produccion delete pvc data-sa-platform-postgresql-0
   kubectl --context kind-sa-p9 -n sa-p9-produccion wait --for=delete pod/sa-platform-postgresql-0 --timeout=180s
   ```
   **No saltar el `wait`**: si el pod viejo aún existe cuando se restaura, Velero lo omite
   ("ya existe"), no restaura el volumen y la base arranca **vacía** aunque el restore diga
   `Completed`. Verificar en el paso 4 que aparezca un `PodVolumeRestore` con bytes.
4. **Restaurar**:
   ```bash
   velero --kubecontext kind-sa-p9 restore create --from-backup "$BACKUP" \
     --include-namespaces sa-p9-produccion --selector app.kubernetes.io/name=postgresql --wait
   velero --kubecontext kind-sa-p9 restore get
   ```
   Esperado: `Completed` **y** al menos un PodVolumeRestore `Completed` con ~100 MB:
   `kubectl --context kind-sa-p9 -n velero get podvolumerestores -l velero.io/restore-name=<nombre>`.
   Si no hay ninguno, el volumen no se restauró: repetir desde el paso 3.
   Si sale `PartiallyFailed`: `velero --kubecontext kind-sa-p9 restore describe <nombre> --details`.
5. **Esperar a la base**: `kubectl --context kind-sa-p9 -n sa-p9-produccion wait --for=condition=Ready pod/sa-platform-postgresql-0 --timeout=300s`
6. **Verificar el contenido**: igual que A.3 (conteo y login).
7. **Reactivar ArgoCD** (la raíz devuelve también la política de `sa-platform`):
   ```bash
   kubectl --context kind-sa-p9 -n argocd patch application sa-p9-root --type merge \
     -p '{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}'
   ```
   Reactivar `automated` no basta: ArgoCD no vuelve a sincronizar solo una revisión que ya aplicó.
   Forzar un sync de la raíz (devuelve el auto-sync a `sa-platform`):
   ```bash
   kubectl --context kind-sa-p9 -n argocd patch application sa-p9-root --type merge \
     -p '{"operation":{"initiatedBy":{"username":"operador"},"sync":{"revision":"main"}}}'
   ```
   Verificar a los ~30 s: `kubectl --context kind-sa-p9 -n argocd get applications` → todo `Synced`, y
   `kubectl --context kind-sa-p9 -n argocd get application sa-platform -o jsonpath='{.spec.syncPolicy.automated}'` → `{"prune":true,"selfHeal":true}`.

---

## C. Drenar un nodo (mantenimiento)

1. Ver dónde está PostgreSQL (1 réplica, **punto único de fallo**):
   `kubectl --context kind-sa-p9 -n sa-p9-produccion get pod sa-platform-postgresql-0 -o wide`
2. Drenar preferentemente el worker que **no** lo aloja:
   ```bash
   kubectl --context kind-sa-p9 drain <nodo> --ignore-daemonsets --delete-emptydir-data --timeout=180s
   ```
   - Esperado: gateway y ms-auth siguen respondiendo (2 réplicas, PDB, anti-afinidad).
     La réplica desalojada de ms-auth queda `Pending` hasta devolver el nodo: es normal.
   - Si se drena el nodo de PostgreSQL: el login falla hasta que la base arranca en el otro worker;
     como su volumen es local al nodo, **no puede moverse**: devolver el nodo (paso 3).
3. Devolver el nodo: `kubectl --context kind-sa-p9 uncordon <nodo>`
4. Prueba automatizada con evidencia: `P9/pruebas/prueba-nodo.sh`.

---

## D. Pérdida del estado remoto o de la llave de Sealed Secrets

**D.1 El workspace de HCP se perdió** (el estado contenía la llave):
1. Crear de nuevo organización `Sa9` y workspace `sa-p9` (CLI-driven, *Execution Mode: Local*), `terraform login`.
2. Ejecutar `./P9/bootstrap.sh`. Terraform genera una llave **nueva** que no abre los SealedSecret del repo.
3. Cargar la llave anterior **con otro nombre**, también marcada como activa (el controlador
   prueba todas las llaves activas al descifrar). Hay dos fuentes:

   **Opción A, respaldo de Velero en R2** (Schedule `sa-p9-llave-sealed-secrets`, diario, 7 días):
   ```bash
   velero --kubecontext kind-sa-p9 backup get | grep sa-p9-llave-sealed-secrets   # elegir el más reciente Completed
   velero --kubecontext kind-sa-p9 backup download <backup> -o llave.tar.gz && tar xzf llave.tar.gz
   jq '.metadata={name:"sealed-secrets-key-recuperada",namespace:"kube-system",labels:{"sealedsecrets.bitnami.com/sealed-secrets-key":"active"}}' \
     resources/secrets/namespaces/kube-system/sealed-secrets-key-sa-p9.json | kubectl --context kind-sa-p9 apply -f -
   rm -rf llave.tar.gz resources metadata
   kubectl --context kind-sa-p9 -n kube-system rollout restart deploy/sealed-secrets-controller
   ```
   No usar `velero restore` para esto: chocaría con el Secret del mismo nombre que crea Terraform.

   **Opción B, copia fuera de línea** (gestor de contraseñas):
   ```bash
   kubectl --context kind-sa-p9 -n kube-system create secret tls sealed-secrets-key-recuperada \
     --cert=<copia>/sealed-secrets-cert.backup.pem --key=<copia>/sealed-secrets-key.backup.pem
   kubectl --context kind-sa-p9 -n kube-system label secret sealed-secrets-key-recuperada \
     sealedsecrets.bitnami.com/sealed-secrets-key=active
   kubectl --context kind-sa-p9 -n kube-system rollout restart deploy/sealed-secrets-controller
   ```
4. Verificar: `kubectl --context kind-sa-p9 -n sa-p9-produccion get sealedsecret` → `Synced True`.

**D.2 No hay copia de la llave**: los secretos del repo son irrecuperables. Hay que generar
credenciales nuevas (`FORZAR=1 P9/scripts/sellar-secretos.sh <repo-gitops>`, commit y push).
Consecuencia: la base restaurada conserva la contraseña y las llaves AES antiguas → los datos
cifrados de los usuarios quedan **ilegibles**. Por eso la copia fuera de línea es obligatoria.

---

## E. Problemas conocidos

### E.1 Terraform bloqueado
Síntoma: `Error acquiring the state lock` (otra persona aplica, o un `apply` anterior se interrumpió).
1. Confirmar en https://app.terraform.io → `Sa9/sa-p9` que **nadie** está aplicando.
2. `terraform -chdir=P9/terraform force-unlock -force "Sa9/sa-p9"`
   (con HCP Terraform el ID que acepta es el **nombre del workspace**, que aparece como
   `lock ID: "Sa9/sa-p9"` en el error; el UUID de la línea `ID:` es rechazado).
3. Volver a ejecutar `./P9/bootstrap.sh`: retoma desde lo que quedó a medias.
   Ocurrió en las pruebas cuando un bootstrap se interrumpió en la fase 2.

### E.2 Un respaldo se queda `InProgress`
Síntoma: `velero backup get` muestra `InProgress` por más de 10 min (visto en las pruebas).
```bash
kubectl --context kind-sa-p9 -n velero rollout restart ds/node-agent deploy/velero
velero --kubecontext kind-sa-p9 backup create manual-$(date +%s) --from-schedule sa-p9-horario --wait
```
Mientras tanto el RPO real crece: el último respaldo bueno es más antiguo.

### E.3 Aplicación OutOfSync sin cambios reales
`kyverno` OutOfSync por sus CRDs: ya se ignoran esas diferencias en `apps/kyverno.yaml`.
Si aparece tras un cambio en git: forzar lectura del repositorio
`kubectl --context kind-sa-p9 -n argocd annotate application sa-p9-root argocd.argoproj.io/refresh=hard --overwrite`.

### E.4 Pods `ImagePullBackOff`
Las imágenes deben ser públicas en GHCR. Probar: `docker pull ghcr.io/danielvelav/sa-p9/ms-auth:v1.0.0` sin sesión.
