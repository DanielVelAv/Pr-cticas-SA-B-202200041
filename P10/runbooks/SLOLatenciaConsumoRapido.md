# Runbook — SLOLatenciaConsumoRapido

**Qué significa:** en la última hora (y en los últimos 5 minutos) más del 14.4 % de las
peticiones de usuarios tardaron más de 1 segundo. El SLO promete que el 99 % responde en menos
de 1 s; a este ritmo el presupuesto de lentitud de la semana se agota en menos de 12 horas.

**Por qué amerita intervenir (severity=page):** el sistema "funciona" pero los usuarios esperan;
un pico aislado no la dispara (exige consumo sostenido en dos ventanas).

**Acción esperada:** ubicar el tramo lento y aliviarlo (escalar, revertir o corregir).

## Procedimiento

1. **Dónde está la demora (30 s).** Tablero *sa-platform — Operación* → fila *Latencia*:
   - "¿Cuánto espera el usuario?": p95 del gateway frente a la línea de 1 s.
   - "¿Qué servicio agrega la demora?": el servicio cuyo p95 subió junto con el del gateway.
2. **Saturación (30 s).** Fila *Saturación*: CPU o memoria cerca del 100 % del límite, o retraso
   del event loop alto = el servicio no da abasto.
3. **Traza lenta (1 min).** Explore → **Tempo**:
   ```
   { resource.service.name = "api-gateway" && duration > 1s }
   ```
   El span más largo dice si la demora está en el servicio o en la consulta a PostgreSQL (`pg.query`).
4. **Registros de esa petición.** Botón **Logs for this span** (Loki, mismo `trace_id`): el
   campo `duracion_ms` de cada servicio confirma dónde se fue el tiempo.
5. **Mitigar:**
   - Saturación de CPU: subir `resources.limits.cpu` o réplicas en `values-p9.yaml` (commit + push).
   - Cambio reciente: revertir el commit en el repo GitOps.
   - Base de datos lenta: revisar el pod `sa-platform-postgresql-0` (eventos, disco: en esta
     práctica un disco lleno del host degradó todo el clúster).
6. **Verificar:** el p95 vuelve bajo 1 s y la alerta se resuelve sola.
