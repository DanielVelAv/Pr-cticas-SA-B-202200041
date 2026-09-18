# Arquitectura

---

## Lista de verificación del diagrama

Marca cada elemento cuando esté representado:

### Elementos externos al clúster

- [ ] Usuario / cliente HTTP
- [ ] Ingress Controller (NGINX)

### Frontera del clúster

- [ ] Namespace `sa-p5` dibujado como límite explícito
- [ ] Ingress como **única** puerta de entrada

### Componentes propios

- [ ] `api-gateway` (Node.js)
- [ ] `ms-auth` (Node.js)
- [ ] `ms-lotes` (Node.js)
- [ ] `ms-aprobaciones` (Python) — marcado como **productor**
- [ ] `ms-notificaciones` (Python) — API
- [ ] `ms-notificaciones-worker` — marcado como **consumidor**
- [ ] `cronjob-1` y `cronjob-2`

### Infraestructura

- [ ] PostgreSQL como **StatefulSet + PVC**
- [ ] Las cinco bases independientes (`auth_db`, `lotes_db`, `aprobaciones_db`, `notificaciones_db`, `cron_db`)
- [ ] RabbitMQ con las dos colas (`lotes.aprobados`, `cron.resumen`)
- [ ] ConfigMap y Secret

### Flujos — deben distinguirse visualmente

- [ ] **Síncronos** (línea sólida): usuario → Ingress → Gateway → microservicios → base de datos
- [ ] **Asíncronos** (línea punteada): `ms-aprobaciones` → cola → worker; `cronjob-2` → cola → worker
- [ ] `cronjob-1` → `cron_db` → `cronjob-2` (encadenamiento)

### Límites impuestos por las NetworkPolicies

- [ ] Solo el Ingress Controller alcanza al `api-gateway`
- [ ] Solo el `api-gateway` alcanza a los microservicios
- [ ] Solo los componentes autorizados alcanzan la base de datos
- [ ] Solo `ms-aprobaciones`, `ms-notificaciones` y `cronjob-2` alcanzan el broker
- [ ] Se indica que `ms-auth` y `ms-lotes` **no** tienen acceso al broker

---

## Diagrama

---

## Descripción de la solución

```

```

---

## Decisiones de diseño y su justificación

Puntos que conviene que cubras, con tus propias palabras:

| Decisión                                                    | Dónde verla en el proyecto                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| Una base de datos por componente                            | `values.yaml`, bloque `postgresql.primary.initdb`           |
| Chart padre con subcharts en vez de un chart plano          | `charts/sa-platform/charts/`                                |
| Qué va en ConfigMap y qué en Secret                         | `templates/configmap.yaml` y `templates/secret.yaml`        |
| Worker separado del API en `ms-notificaciones`              | `charts/ms-notificaciones/templates/worker-deployment.yaml` |
| Por qué el evento es autocontenido                          | Comentario en `services/ms-aprobaciones/app/broker.py`      |
| `maxUnavailable: 0` en la estrategia de actualización       | `charts/*/templates/deployment.yaml`                        |
| RS256: quién tiene la llave privada y quién solo la pública | `values.yaml`, `extraVolumes` de `ms-auth` y `api-gateway`  |

**Tu redacción:**

```

```

---

## Limitaciones conocidas

Reconocerlas antes de que las señalen demuestra criterio. Algunas que aplican a este diseño:

- Si el broker está caído al aprobar un lote, el evento se pierde: la aprobación ya está confirmada en la base y no se revierte. El arreglo correcto es el patrón _Transactional Outbox_ (está anotado en `main.py`).
- El API Gateway es un punto único de fallo.
- No hay observabilidad centralizada (queda fuera de alcance según el enunciado).

**Tu redacción:**

```

```
