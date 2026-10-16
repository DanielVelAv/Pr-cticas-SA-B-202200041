# Práctica 9 — Continuidad operativa y recuperación ante desastres

Daniel Eduardo Velásquez Ávila · 202200041 · Software Avanzado, USAC

El ecosistema de microservicios de la Práctica 8 se convierte en un sistema **recuperable**:
todo lo que define el sistema vive fuera del clúster (Git, HCP Terraform, GHCR, Cloudflare R2),
y un único comando lo reconstruye desde cero, restaurando los datos del último respaldo.

## Tabla de enlaces obligatoria (4.1)

| Ítem | Enlace o dato |
|---|---|
| Repositorio GitOps | https://github.com/DanielVelAv/sa-platform-gitops |
| Aplicación raíz en ArgoCD | `sa-p9-root`, namespace `argocd` (app-of-apps sobre la carpeta [`apps/`](https://github.com/DanielVelAv/sa-platform-gitops/tree/main/apps)) |
| Punto de entrada del bootstrap | [`P9/bootstrap.sh`](bootstrap.sh) (`./P9/bootstrap.sh` desde la raíz del repositorio) |
| Backend remoto de Terraform | HCP Terraform (bloque `cloud {}`), organización `Sa9`, workspace `sa-p9`, execution mode *Local*; bloqueo de estado nativo de HCP ([evidencia](evidencias/bloqueo-estado-20261015T074245Z.log)) |
| Schedule de Velero | `sa-p9-horario` (namespace `velero`, cada hora `0 * * * *`, retención 168 h) → Cloudflare R2, bucket `sa-p9-velero`, prefijo `sa-p9/` ([manifiesto](https://github.com/DanielVelAv/sa-platform-gitops/blob/main/velero/schedule.yaml)) |
| Reconstrucción cronometrada | [`P9/evidencias/reconstruccion-20261016T080658Z.log`](evidencias/reconstruccion-20261016T080658Z.log) (detalle del bootstrap: [`bootstrap-20261016T080704Z.log`](evidencias/bootstrap-20261016T080704Z.log)) |
| Restauración de datos | [`P9/evidencias/restauracion-20261016T070246Z.log`](evidencias/restauracion-20261016T070246Z.log) |
| Prueba de pérdida de nodo | [`P9/evidencias/nodo-20261016T063958Z.log`](evidencias/nodo-20261016T063958Z.log) |
| RTO y RPO declarados | Declarados ([`OBJETIVOS-DR.md`](OBJETIVOS-DR.md), commit previo a las pruebas): **RTO ≤ 20 min, RPO ≤ 60 min**. Medidos: **RTO = 7 min 49 s** (reconstrucción completa), **RPO = 5 min 28 s** (reconstrucción) / **3 min 57 s** (restauración de datos) |
| Video demostrativo | PENDIENTE — URL y minutaje abajo |

### Minutaje del video

| Minuto | Punto demostrado |
|---|---|
| PENDIENTE | Arquitectura y qué sobrevive al desastre |
| PENDIENTE | Bootstrap desde cero con `./P9/bootstrap.sh` |
| PENDIENTE | Estado remoto y bloqueo en HCP Terraform |
| PENDIENTE | Schedule de Velero y respaldo en R2 |
| PENDIENTE | Restauración de datos verificada (RPO) |
| PENDIENTE | Pérdida de nodo con el servicio respondiendo |
| PENDIENTE | Reconstrucción cronometrada (RTO) y secretos descifrables |
| PENDIENTE | Flujo de P8 tras la reconstrucción (canary, Kyverno) |

## Documentos

| Entregable | Archivo |
|---|---|
| Informe de la prueba de DR (6 campos) | [`INFORME-DR.md`](INFORME-DR.md) |
| Runbook de recuperación | [`RUNBOOK.md`](RUNBOOK.md) |
| Diagrama del bootstrap | [`DIAGRAMA-BOOTSTRAP.md`](DIAGRAMA-BOOTSTRAP.md) ([imagen](diagrama-bootstrap.png)) |
| Objetivos declarados antes de las pruebas | [`OBJETIVOS-DR.md`](OBJETIVOS-DR.md) |
| Prueba técnica de riesgos previa | [`spike/RESULTADOS.md`](spike/RESULTADOS.md) |

## Estructura

```
P9/
├── bootstrap.sh              # único punto de entrada
├── terraform/                # clúster kind, StorageClass, ns/cuotas/RBAC, llave Sealed Secrets,
│                             # Velero→R2, restauración, ArgoCD, app raíz (estado en HCP)
├── scripts/
│   ├── restaurar-datos.sh    # restore de PostgreSQL antes de ArgoCD (lo llama Terraform)
│   └── sellar-secretos.sh    # genera y sella las credenciales con el certificado público
├── pruebas/
│   ├── prueba-dr.sh          # destrucción + reconstrucción cronometrada (RTO/RPO)
│   ├── prueba-restauracion.sh# pérdida del volumen de PostgreSQL + restore (RPO)
│   ├── prueba-nodo.sh        # drenaje de un worker con sonda cada segundo
│   ├── sembrar-datos.sh      # usuarios vía API + tabla dr_latido
│   └── latido.sh             # escribe una fila cada 10 s para medir el RPO
├── evidencias/               # logs con marcas de tiempo UTC
└── sealed-secrets-pub.pem    # certificado PÚBLICO para kubeseal (la llave privada está en HCP)
```

## Cómo se cumple cada requisito

| Requisito | Implementación |
|---|---|
| Bootstrap de día cero | `bootstrap.sh` → Terraform crea el clúster e instala Velero y ArgoCD → `sa-p9-root` (app-of-apps) levanta sealed-secrets, argo-rollouts, kyverno, políticas, secretos, schedule y la aplicación con sync-waves. Sin pasos manuales. |
| Estado remoto con bloqueo | HCP Terraform; no hay `*.tfstate` en el repositorio (`.gitignore`); credenciales solo por `TF_VAR_*` desde `~/.config/sa-p9`. |
| Respaldos programados | Velero `Schedule` cada hora, `ttl: 168h`, File System Backup (kopia) de todos los volúmenes, destino R2 fuera del clúster, hook `CHECKPOINT` de PostgreSQL. |
| Servicio con estado | ms-auth + PostgreSQL (`auth_db`) con PVC en `local-velero`; datos verificables: usuarios creados por la API (login real) y tabla `dr_latido`. |
| Continuidad de los secretos | La llave de Sealed Secrets la genera Terraform (`tls_private_key`, `prevent_destroy`) y vive en el estado remoto; se inyecta antes del controlador, que la adopta. Copia fuera de línea documentada en el runbook. |
| Resiliencia ante pérdida de nodo | 2 réplicas de gateway y ms-auth, PDB `minAvailable: 1`, anti-afinidad (requerida en ms-auth, preferida en el Rollout), probes; 3 nodos (1 control-plane + 2 workers). |
| Conservación del flujo de P8 | GitOps (ArgoCD), entrega progresiva (Argo Rollouts canary + AnalysisTemplate) y políticas de admisión (Kyverno) se reinstalan desde el repositorio GitOps en cada reconstrucción. Tras la reconstrucción oficial: canary con fallo inducido → AnalysisRun `Failed` → `RolloutAborted` ([evidencia](evidencias/canary-post-reconstruccion-20261016T081602Z.log)); Kyverno rechaza `nginx:latest` (en el log de reconstrucción). |
