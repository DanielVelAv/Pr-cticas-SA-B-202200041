# Runbook — SLODisponibilidadConsumoRapido

**Qué significa:** en la última hora (y en los últimos 5 minutos) más del 7.2 % de las
peticiones de usuarios al gateway terminaron en error 5xx. Es una **tasa de quemado de 14.4×**:
a este ritmo el presupuesto de errores de la semana (0.5 % de las peticiones, SLO de 99.5 %)
se agota en menos de 12 horas.

**Por qué amerita intervenir (severity=page):** los usuarios ya están viendo errores y, si nadie
actúa, la promesa de la semana se incumple el mismo día. Una alerta por umbral instantáneo
saltaría con cualquier pico de segundos; esta exige que el consumo se sostenga en dos ventanas.

**Acción esperada:** encontrar el servicio y la causa del error, y revertir o corregir el último
cambio. Objetivo: llegar de la alerta al registro del error en menos de 3 minutos.

## Procedimiento

Acceso (una terminal por comando):
```bash
kubectl --context kind-sa-p9 -n observabilidad port-forward svc/monitoring-grafana 3000:80
kubectl --context kind-sa-p9 -n observabilidad port-forward svc/monitoring-alertmanager 9093:9093
```

1. **Confirmar el impacto (30 s).** Grafana → tablero *sa-platform — Operación* → fila *Errores*:
   - "% de peticiones con error 5xx por servicio": qué servicio supera la línea roja (7.2 %).
   - "¿Qué ruta falla?": ruta y código (p. ej. `ms-auth /auth/login 500`).
2. **Ir a la traza del error (1 min).** Grafana → *Explore* → datasource **Tempo** → TraceQL:
   ```
   { resource.service.name = "<servicio de la fila Errores>" && status = error }
   ```
   Abrir la traza más reciente: muestra el recorrido gateway → servicio → base de datos y
   **qué span falló** (p. ej. el span `pg.query` con el mensaje de PostgreSQL).
3. **Ir al registro del error (30 s).** En la traza, botón **Logs for this span** (abre Loki con
   el mismo `trace_id`). O en Explore → **Loki**:
   ```
   {namespace="sa-p9-produccion"} | json | trace_id="<trace_id>" | level="error"
   ```
   El campo `error` del JSON dice la causa (p. ej. `relation "usuarios_v2" does not exist`).
4. **Mitigar.** Si coincide con un despliegue reciente:
   ```bash
   kubectl --context kind-sa-p9 -n argocd get application sa-platform -o jsonpath='{.status.history[-1:]}'
   ```
   Revertir el commit en el repo GitOps (`git revert <commit>` + push) y forzar la lectura:
   `kubectl --context kind-sa-p9 -n argocd annotate application sa-p9-root argocd.argoproj.io/refresh=hard --overwrite`.
   Si el problema es de la base de datos (PostgreSQL caído): ver P9/RUNBOOK.md sección B.
5. **Verificar.** En el tablero la tasa de error vuelve a ~0 % y la alerta se resuelve sola en
   Alertmanager (`http://localhost:9093`) cuando la ventana de 5 min baja del umbral.
6. **Registrar** en el informe: hora de inicio, de la alerta, de la causa y de la recuperación.
