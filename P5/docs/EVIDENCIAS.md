# Evidencias

---

## E1. Ciclo de vida con Helm: dos versiones, upgrade y rollback

**Criterio 2.1 — 12 pts**

### Versión inicial instalada

```bash
helm list -n sa-p5
```

```
PEGAR AQUÍ
```

### Tras publicar la versión 1.1.0 y hacer upgrade

```bash
helm upgrade sa-platform ./charts/sa-platform --namespace sa-p5 ... --wait
helm history sa-platform -n sa-p5
```

```
PEGAR AQUÍ
```

### Tras el rollback a la revisión anterior

```bash
helm rollback sa-platform 1 -n sa-p5
helm history sa-platform -n sa-p5
```

```
PEGAR AQUÍ
```

**Qué debe verse:** al menos tres revisiones, con la descripción `Rollback to 1` en la última.

---

## E2. Persistencia: los datos sobreviven al borrado del pod

**Criterio 2.2 — 10 pts**

### Dato creado antes de borrar el pod

```bash
curl -s http://sa-p5.local/api/lotes -H "Authorization: Bearer $TOKEN" | jq
```

```
PEGAR AQUÍ
```

### Borrado del pod de la base de datos

```bash
kubectl delete pod sa-platform-postgresql-0 -n sa-p5
kubectl get pods -n sa-p5 -w
```

```
PEGAR AQUÍ
```

### El mismo dato después de que el pod se recreó

```bash
curl -s http://sa-p5.local/api/lotes -H "Authorization: Bearer $TOKEN" | jq
```

```
PEGAR AQUÍ
```

**Qué debe verse:** el mismo registro, con el mismo `id`, tras haberse recreado el pod.

---

## E3. Flujo asíncrono con el consumidor caído

**Criterio 2.3 — 12 pts**

### Consumidor apagado

```bash
kubectl scale deploy/sa-platform-ms-notificaciones-worker --replicas=0 -n sa-p5
kubectl get pods -n sa-p5 | grep worker
```

```
PEGAR AQUÍ
```

### Mensajes acumulados en la cola durable

```bash
kubectl exec -n sa-p5 sa-platform-rabbitmq-0 -- \
  rabbitmqctl list_queues name messages durable
```

```
PEGAR AQUÍ
```

### Tras restaurar el consumidor

```bash
kubectl scale deploy/sa-platform-ms-notificaciones-worker --replicas=1 -n sa-p5
kubectl exec -n sa-p5 sa-platform-rabbitmq-0 -- rabbitmqctl list_queues name messages
kubectl logs -n sa-p5 -l app.kubernetes.io/name=ms-notificaciones-worker --tail=30
```

```
PEGAR AQUÍ
```

**Qué debe verse:** la cola con mensajes pendientes mientras el worker está en 0, y en 0 mensajes después de restaurarlo, con los registros ya procesados. **Sin pérdida.**

---

## E4. NetworkPolicy: bloqueo del tráfico lateral

**Criterio 2.4 — 10 pts**

### Un pod no autorizado intenta alcanzar un microservicio

```bash
kubectl run intruso --rm -it --restart=Never \
  --image=curlimages/curl -n sa-p5 -- \
  curl -m 8 -v http://sa-platform-ms-lotes:3002/health
```

```
PEGAR AQUÍ
```

### El API Gateway sí puede (contraste)

```bash
kubectl exec -n sa-p5 deploy/sa-platform-api-gateway -- \
  wget -qO- http://sa-platform-ms-lotes:3002/health
```

```
PEGAR AQUÍ
```

**Qué debe verse:** el pod intruso falla por timeout; el Gateway responde `{"servicio":"ms-lotes","estado":"ok"}`.

---

## E5. Escalado automático bajo carga

**Criterio 2.5 — 10 pts**

### Estado inicial del HPA

```bash
kubectl get hpa -n sa-p5
```

```
PEGAR AQUÍ
```

### Durante la prueba de carga

```bash
kubectl get hpa -n sa-p5 -w
```

```
PEGAR AQUÍ
```

### Réplicas creciendo

```bash
kubectl get pods -n sa-p5 -w
```

```
PEGAR AQUÍ
```

### Descenso de réplicas al cesar la carga

```
PEGAR AQUÍ
```

**Qué debe verse:** el `TARGETS` del HPA superando el 70 %, `REPLICAS` subiendo hasta el máximo, y bajando minutos después de terminar la carga.

---

## E6. Actualización sin caída de servicio

**Criterio 2.5 — 10 pts**

### Peticiones continuas durante el upgrade

```bash
while true; do
  curl -s -o /dev/null -w "%{http_code} " http://sa-p5.local/health
  sleep 0.3
done
```

```
PEGAR AQUÍ
```

### El upgrade ejecutándose en paralelo

```bash
helm upgrade sa-platform ./charts/sa-platform ... --set global.imageTag=1.1.0 --wait
kubectl rollout status deploy/sa-platform-api-gateway -n sa-p5
```

```
PEGAR AQUÍ
```

**Qué debe verse:** únicamente códigos `200`. Ningún `502` ni `503` durante todo el reemplazo de pods.

---

## E7. Cronjobs encadenados

**Criterio 2.6 — 6 pts**

### CronJobs programados

```bash
kubectl get cronjob -n sa-p5
```

```
PEGAR AQUÍ
```

### Cronjob 1: fecha GMT-6 y carné

```bash
kubectl logs -n sa-p5 -l app.kubernetes.io/name=cronjob-1 --tail=20
```

```
PEGAR AQUÍ
```

### Cronjob 2: resumen publicado al broker

```bash
kubectl logs -n sa-p5 -l app.kubernetes.io/name=cronjob-2 --tail=20
```

```
PEGAR AQUÍ
```

### El worker lo consumió y almacenó

```bash
curl -s http://sa-p5.local/api/notificaciones/resumenes \
  -H "Authorization: Bearer $TOKEN" | jq
```

```
PEGAR AQUÍ
```

**Qué debe verse:** la cadena completa — el cronjob 1 escribe con tu carné, el cronjob 2 agrega por hora y publica, y el resumen aparece almacenado en la base.

---

## E8. Resultados de la prueba de carga

**Criterio 2.5 — 10 pts**

```bash
k6 run scripts/carga/carga.js
```

```
PEGAR AQUÍ (salida completa de k6)
```

### Resumen

| Métrica                      | Valor |
| ---------------------------- | ----- |
| Peticiones totales           |       |
| Peticiones por segundo (RPS) |       |
| Latencia p95                 |       |
| Porcentaje de error          |       |

---

## Anexo: validación del chart

```bash
helm lint ./charts/sa-platform
```

```
PEGAR AQUÍ
```

**Qué debe verse:** `0 chart(s) failed`, sin advertencias.
