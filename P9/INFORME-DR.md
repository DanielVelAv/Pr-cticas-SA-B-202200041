# Informe de la prueba de recuperación ante desastres — P9

Sistema: sa-platform (api-gateway + ms-auth + PostgreSQL) en kind `sa-p9`, GitOps con ArgoCD.
Marcas de tiempo en UTC. Evidencias en `P9/evidencias/`.

## 1. Objetivos declarados

Declarados el 2026-10-16 en [`OBJETIVOS-DR.md`](OBJETIVOS-DR.md) (commit `2bc0e24`, previo a las pruebas).

- **RTO ≤ 20 min**: ensayos previos dieron ~6–7 min de infraestructura y ~5 min de GitOps; se deja ~50 % de margen para descargas de imágenes y reintentos.
- **RPO ≤ 60 min**: el Schedule `sa-p9-horario` respalda cada hora (`0 * * * *`, retención 168 h). En el peor caso se pierde lo escrito desde el último respaldo; es tolerable para el sistema y mantiene bajo el costo en R2.

## 2. Escenario ejecutado

1. **Pérdida de nodo** (`nodo-20261016T063958Z.log`): drenaje de `sa-p9-worker`, el que **no** aloja PostgreSQL, con una sonda in-cluster consultando cada segundo gateway, ms-auth y un login real.
2. **Pérdida de datos** (`restauracion-20261016T070246Z.log`): tras el respaldo programado de las 07:00 se escribieron datos nuevos (3 usuarios, latido cada 10 s). En T_desastre se pausó ArgoCD y se eliminaron el StatefulSet y el **PVC** de PostgreSQL. Después se restauró con Velero desde el respaldo programado.
3. **Pérdida total del clúster** (`reconstruccion-20261016T080658Z.log`, respaldo programado de las 08:00 y latido corriendo): `kind delete cluster --name sa-p9` (nodos, etcd, volúmenes y la llave de Sealed Secrets en memoria), seguido de `./P9/bootstrap.sh` sin intervención. Sobrevivieron solo Git, HCP Terraform, GHCR, R2 y las credenciales del operador.

## 3. Tiempos medidos (RTO real)

| Prueba | Inicio | Servicio verificado | Duración |
|---|---|---|---|
| Reconstrucción completa | T_desastre 08:06:59 | T_servicio 08:14:48 (login de un usuario previo al respaldo = 200) | **RTO = 7 min 49 s** |
| Reconstrucción (2.ª corrida, 17/10, `reconstruccion-20261017T033911Z.log`) | T_desastre 03:39:12 | T_servicio 03:49:36 | **RTO = 10 min 24 s** |
| Restauración de datos | T_desastre 07:05:51 | PostgreSQL disponible 07:07:09 | **78 s** |
| Pérdida de nodo | drain 06:40:19 | servicio continuo hasta uncordon 06:42:51 | **0 fallos en 137 muestras** |

Desglose de la reconstrucción (`bootstrap-20261016T080704Z.log`):

| Etapa | Desde → hasta | Duración |
|---|---|---|
| `kind delete` e inicio del bootstrap | 08:06:59 → 08:07:04 | 5 s |
| Prerrequisitos + `terraform init` (HCP) | 08:07:04 → 08:07:09 | 5 s |
| Fase 1: clúster kind (estado remoto → `state rm` → crear) | 08:07:09 → 08:08:05 | 56 s |
| Fase 2: ns/cuotas/llave, Velero (1 min 16 s) y ArgoCD (2 min 1 s) en paralelo, restore lanzado 08:10:38, app raíz | 08:08:05 → 08:11:00 | 2 min 55 s |
| GitOps: 8 apps Synced/Healthy (incluye que PostgreSQL termine de restaurar 119 MB) | 08:11:00 → 08:14:42 | 3 min 42 s |
| Verificación: `/health`, volumen restaurado, login real | 08:14:42 → 08:14:48 | 6 s |

La mayor parte del RTO es arranque de ArgoCD y de las aplicaciones (≈ 6 min); Terraform + kind ≈ 1 min.

## 4. Pérdida medida (RPO real)

| Prueba | Último latido restaurado | T_desastre | **RPO real** |
|---|---|---|---|
| Restauración de datos | 07:01:54 | 07:05:51 | **3 min 57 s** |
| Reconstrucción completa | 08:01:31 | 08:06:59 | **5 min 28 s** |
| Reconstrucción (2.ª corrida) | 03:03:23 | 03:39:12 | **35 min 49 s** |

**Datos no recuperados**: en la restauración de datos, los 3 usuarios creados después del respaldo (`dr-post-070250-{1,2,3}`, login 401 tras restaurar) y los latidos entre 07:01:54 y 07:05:50. En la reconstrucción, los latidos entre 08:01:31 y 08:06:59. Se pierden por diseño: solo existe lo copiado en el último respaldo.

El punto de recuperación es el momento en que Velero **copió el volumen** (07:01:54 y 08:01:31), no el inicio del respaldo (07:00:28 y 08:00:11).

## 5. Puntos únicos de fallo detectados

- **PostgreSQL con 1 réplica y volumen `local` atado a un nodo**: si cae su nodo, la base cae y no puede moverse. La prueba de nodo lo evitó a propósito.
- **Kyverno con 1 réplica y webhook `failurePolicy: Fail`**: mientras arrancaba rechazó los pods de Velero y la restauración de la reconstrucción **falló** en un ensayo. Corregido limitando el webhook a `sa-p9-*`; además, el bootstrap reintenta la restauración.
- **Orden circular de dependencias**: el restore esperaba al Secret, el Secret a ArgoCD y ArgoCD al restore. El bootstrap se colgó en un ensayo. Corregido: el restore se lanza antes de ArgoCD y se verifica al final.
- **Condición de carrera al restaurar**: si el pod viejo aún existe, Velero lo omite y la base queda vacía aunque el restore diga `Completed`. Detectado al seguir el runbook; se agregó la espera.
- **Bloqueo de estado huérfano**: un bootstrap interrumpido dejó el workspace de HCP bloqueado. Se resolvió con `force-unlock` (RUNBOOK E.1).
- **Respaldos que fallan en silencio**: en el spike un backup quedó `InProgress` indefinidamente. No hay alerta; el RPO real crecería sin que nadie lo note.
- **Humano/laptop**: credenciales de R2 y HCP, `terraform login` y la copia de la llave dependen del operador. La laptop es también el único host del clúster.

## 6. Brecha y plan

| Objetivo | Declarado | Medido | Brecha |
|---|---|---|---|
| RTO | ≤ 20 min | 7 min 49 s y 10 min 24 s | Se cumple en ambas corridas, con 10–12 min de margen. La variación de ~2,5 min entre corridas sale del arranque de ArgoCD y de las descargas de imágenes; el reintento automático de la restauración sumaría ~2 min más. |
| RPO | ≤ 60 min | 3 min 57 s (datos); 5 min 28 s y 35 min 49 s (clúster) | Se cumple. El RPO real depende de cuándo ocurre el desastre: 5 min en la 1.ª corrida (minutos después del respaldo) y 36 min en la 2.ª. El peor caso sigue siendo ~60 min + la duración del respaldo. |
| Pérdida de nodo | 0 fallos | 0 / 137 | Se cumple, pero solo con el nodo que no aloja PostgreSQL. |

Plan para cerrar las brechas y los puntos únicos de fallo:
1. **Alertar** si el último respaldo `Completed` tiene más de 70 min (métrica de Velero + alerta). Hoy un fallo silencioso no se detecta.
2. **RPO de segundos**: archivado continuo de WAL de PostgreSQL a R2 (WAL-G/pgBackRest) en lugar de solo copias horarias del volumen.
3. **Quitar el SPOF de la base**: PostgreSQL con réplica (CloudNativePG) o almacenamiento replicado; Kyverno con 2 réplicas.
4. **RTO**: precargar imágenes o usar un mirror de registro; la mayor parte del tiempo se va en descargas y arranque de ArgoCD.
5. **Ensayar periódicamente**: cada ensayo de esta práctica destapó un fallo que la documentación no mostraba (5 en total).
