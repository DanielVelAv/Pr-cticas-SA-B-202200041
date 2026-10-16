# Objetivos de recuperación declarados — P9

Declarados el **2026-10-16**, antes de ejecutar las pruebas cronometradas de la
Iteración 6. Este archivo no se modifica después de las pruebas: los valores
medidos se contrastan contra estos en `INFORME-DR.md`, aunque no se cumplan.

| Objetivo | Valor | Justificación |
|---|---|---|
| **RTO** (tiempo de recuperación) | **≤ 20 min** | Desde la pérdida total del clúster hasta que `/health` responde y un usuario previo al desastre inicia sesión. Ensayos previos: infraestructura (kind + Terraform + Velero + ArgoCD) ≈ 6–7 min; sincronización GitOps y arranque de pods ≈ 5 min; restauración de PostgreSQL desde R2 ≈ 1–2 min. Se deja ~50 % de margen para descargas de imágenes y reintentos de ArgoCD. |
| **RPO** (pérdida de datos) | **≤ 60 min** | El Schedule `sa-p9-horario` respalda cada hora en punto (`0 * * * *`). En el peor caso se pierde lo escrito desde el último respaldo completado. Para un sistema académico con escrituras poco frecuentes, una hora de pérdida es tolerable y mantiene bajo el número de operaciones contra R2. |
| **Retención** | 7 días (`ttl: 168h`) | Permite volver a cualquier hora de la última semana (p. ej. si la corrupción se detecta tarde). |
| **Pérdida de nodo** | 0 peticiones fallidas al gateway | 2 réplicas + anti-afinidad + PDB: drenar un worker no debe interrumpir el servicio. Excepción declarada: PostgreSQL tiene 1 réplica (punto único de fallo); la prueba drena el worker que **no** lo aloja. |

## Supuestos

- El desastre es la pérdida total del clúster (todos los nodos y volúmenes).
  Sobreviven: repositorio de código, repositorio GitOps (GitHub), estado de
  Terraform (HCP), imágenes (GHCR), respaldos (Cloudflare R2) y las credenciales
  del operador (`~/.config/sa-p9`, `terraform login`).
- El RPO se mide con la tabla `dr_latido` (una fila cada 10 s): RPO real =
  instante del desastre − último latido presente tras restaurar.
- El RTO se mide con marcas de tiempo UTC del propio log del bootstrap.
