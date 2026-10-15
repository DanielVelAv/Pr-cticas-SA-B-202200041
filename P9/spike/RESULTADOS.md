# Prueba técnica de riesgos (Fase 1) — 2026-10-15

Clúster desechable `sa-spike` (kind v0.24.0, k8s v1.31.0, 1 control-plane + 1 worker).
Archivos usados: `kind-spike.yaml`, `storageclass.yaml`, `postgres.yaml`.

| # | Riesgo | Resultado |
|---|---|---|
| R1 | Velero FSB no soporta PV `hostPath` de local-path | **Resuelto.** StorageClass `local-velero` con anotación `defaultVolumeType: local` → el PV sale con `spec.local`. |
| R2 | Velero contra Cloudflare R2 | **OK.** Velero v1.18.4 + `velero-plugin-for-aws:v1.14.4` (≥ v1.14.3 evita el header `x-amz-tagging` vacío que R2 rechaza). BSL `Available`. Config: `region=auto,s3ForcePathStyle=true,s3Url=<endpoint>,checksumAlgorithm=""`. |
| R3 | Restaurar datos en un clúster **nuevo** | **OK.** Backup `spike-2` (40 MB, kopia) → `kind delete cluster` → clúster nuevo + Velero → `restore` `Completed` → las 3 filas de `prueba` volvieron intactas. |
| R4 | Sealed Secrets adopta una llave propia | **OK.** Secret TLS con etiqueta `sealedsecrets.bitnami.com/sealed-secrets-key=active` creado antes del controlador → log `registered private key secretname=sealed-secrets-key-propia`, no genera otra. |
| R5 | SealedSecret descifrable tras perder el clúster | **OK.** Mismo `.sealed.yaml` aplicado en un clúster nuevo con la misma llave → Secret descifrado. |

## Hallazgos que cambian la implementación

- **Límites de inotify:** con 2 clústeres kind el worker no se unía (`too many open files`).
  Prerrequisito del host: `fs.inotify.max_user_instances=512`, `max_user_watches=524288`
  (`/etc/sysctl.d/99-kind.conf`). Va al runbook.
- **Repo Helm de Sealed Secrets movido:** `https://bitnami.github.io/sealed-secrets`
  (el antiguo `bitnami-labs.github.io` da 404). Chart 2.20.0 / app 0.40.0.
- **PodVolumeBackup colgado:** el primer backup quedó `InProgress` indefinidamente
  (data path detenido en "Searching for parent snapshot", conexión a R2 abierta sin
  avance). Tras reiniciar `node-agent` y `velero`, el segundo backup completó en < 1 min.
  Implicación: un backup programado puede fallar en silencio → el script de
  restauración usa el último backup `Completed`, y el RPO real puede ser mayor que el
  intervalo del schedule. Va al informe (punto único de fallo / brecha).
