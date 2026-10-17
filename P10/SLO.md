# Objetivos de nivel de servicio (SLO) — sa-platform

Ambos se miden **en el gateway**, sobre las peticiones reales de usuarios a `/api`. Es el punto
donde el usuario experimenta el sistema; un servicio interno sano no sirve de nada si el usuario
recibe un error. Las probes (`/health`) y el scraping (`/metrics`) no cuentan.

| | SLO 1: Disponibilidad | SLO 2: Latencia |
|---|---|---|
| **Promesa al usuario** | "Cuando usas la plataforma, tu petición se atiende sin error del sistema." | "La plataforma te responde en menos de un segundo." |
| **Indicador (SLI)** | fracción de peticiones `/api` **sin** respuesta 5xx | fracción de peticiones `/api` respondidas en **< 1 s** |
| **Objetivo** | **99.5 %** | **99 %** |
| **Ventana** | **7 días** móviles | **7 días** móviles |
| **Presupuesto de error** | 0.5 % de las peticiones (~50 errores por cada 10 000) | 1 % de las peticiones lentas |
| **Alerta** | `SLODisponibilidadConsumoRapido` | `SLOLatenciaConsumoRapido` |

## Por qué estos números y no otros

**Línea base medida antes de fijarlos** (Prometheus, tráfico del generador, 17/10/2026):

| Ruta | p50 | p95 | Tasa de error |
|---|---|---|---|
| `/api/auth` (login con bcrypt) | 210 ms | 473 ms | 0 % |
| `/api/lotes` | 17 ms | 32 ms | 0 % |
| Global `/api` | — | p99 = 492 ms | 0 % |

- **99.5 % de disponibilidad y no 99.9 %.** El sistema corre en un clúster kind de una sola
  laptop, con PostgreSQL en una réplica (punto único de fallo, ver P9). Prometer 99.9 % (~10 min
  de caída por semana) sería prometer lo que la infraestructura no puede cumplir. 99.5 % deja
  ~50 min por semana: alcanza para un despliegue con canary o una restauración de datos (78 s
  medidos en la P9) sin agotar el presupuesto.
- **Latencia: < 1 s y no < 500 ms.** El login usa bcrypt, que es lento **a propósito** (protege
  las contraseñas): su p95 normal es ~470 ms. Un umbral de 500 ms se incumpliría con tráfico
  normal y la alerta sería ruido. Un segundo es el límite en que una persona percibe la respuesta
  como inmediata; el p99 actual (~490 ms) deja margen para detectar una degradación real.
- **99 % en latencia (menos exigente que la disponibilidad).** Una respuesta lenta molesta, pero
  una respuesta con error impide la tarea; por eso se tolera más lentitud que errores.
- **Ventana de 7 días.** Alinea el presupuesto con el ciclo semanal de entregas de la práctica, y
  Prometheus guarda la historia necesaria en un clúster de laptop (con 30 días el cálculo de la
  ventana no tendría datos suficientes).

## Reglas de registro (PrometheusRule `slo-sa-platform`)

Manifiesto: [`observabilidad/slo-reglas.yaml`](https://github.com/DanielVelAv/sa-platform-gitops/blob/main/observabilidad/slo-reglas.yaml) del repo GitOps.

| Regla | Qué calcula |
|---|---|
| `slo:sli_error:ratio_rate5m`, `…rate1h`, `…rate7d` (etiqueta `slo`) | fracción "mala" (errores o lentas) en cada ventana |
| `slo:objetivo:ratio` | 0.995 y 0.99 |
| `slo:presupuesto_consumido:ratio` | fracción mala de 7 d ÷ presupuesto (1 = agotado) |
| `slo:presupuesto_restante:ratio` | 1 − consumido (se muestra en el tablero) |

## Alertas por consumo del presupuesto

Patrón multi-ventana del libro *SRE Workbook*: se dispara si la tasa de quemado supera **14.4×**
en **1 h y en 5 min** a la vez. A 14.4× el presupuesto de 7 días se agota en 168 h / 14.4 ≈ **11.7 h**
(se consume ~8.6 % por hora): si nadie actúa, la promesa de la semana se incumple el mismo día.
- La ventana de 1 h evita alertar por picos de segundos (no es un umbral instantáneo).
- La ventana de 5 min hace que la alerta se apague apenas el problema se corrige.

**Alertas eliminadas a propósito:** todas las reglas por defecto de kube-prometheus-stack
(`defaultRules.create: false`) y una alerta de "consumo lento" (6× en 6 h). En un sistema de una
persona nadie atendería un aviso que no exige actuar hoy; una alerta que nadie atiende es peor
que ninguna. Las dos que quedan tienen runbook y acción concreta.
