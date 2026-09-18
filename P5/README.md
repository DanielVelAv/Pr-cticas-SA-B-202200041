# Práctica 5 — Orquestación de microservicios en Kubernetes con Helm

Software Avanzado · Universidad de San Carlos de Guatemala · Segundo Semestre 2026

Empaquetado, parametrización y ciclo de vida de la plataforma de microservicios construida en la Práctica 4, desplegada en Kubernetes mediante un único chart de Helm.

---

## Estructura del repositorio

```
P5/
├── README.md                    este archivo
├── .gitignore                   excluye credenciales y llaves
│
├── charts/
│   └── sa-platform/             CHART PADRE
│       ├── Chart.yaml           versión, appVersion y dependencias
│       ├── values.yaml          configuración base
│       ├── values-dev.yaml      ambiente de desarrollo
│       ├── values-prod.yaml     ambiente productivo
│       ├── values.example.yaml  plantilla de credenciales (ficticias)
│       ├── templates/
│       │   ├── _helpers.tpl     10 plantillas nombradas compartidas
│       │   ├── namespace.yaml
│       │   ├── configmap.yaml
│       │   ├── secret.yaml
│       │   ├── ingress.yaml
│       │   ├── networkpolicies.yaml
│       │   ├── resourcequota.yaml
│       │   ├── limitrange.yaml
│       │   ├── cronjobs.yaml
│       │   └── NOTES.txt
│       └── charts/              SUBCHARTS, uno por componente
│           ├── api-gateway/
│           ├── ms-auth/
│           ├── ms-lotes/
│           ├── ms-aprobaciones/
│           └── ms-notificaciones/
│
├── services/                    CÓDIGO FUENTE (heredado de la Práctica 4)
│   ├── api-gateway/             Node.js
│   ├── ms-auth/                 Node.js
│   ├── ms-lotes/                Node.js — REST + GraphQL
│   ├── ms-aprobaciones/         Python — REST + GraphQL + productor
│   └── ms-notificaciones/       Python — REST + worker consumidor
│
├── scripts/
│   ├── cronjob-1/               registra fecha GMT-6 y carné
│   ├── cronjob-2/               agrega y publica al broker
│   └── carga/carga.js           prueba de carga con k6
│
├── keys/                        llaves RSA (NO se versionan)
└── docs/
    ├── COMANDOS.md              comandos reproducibles y evidencias
    ├── EVIDENCIAS.md            capturas de las pruebas solicitadas
    ├── validar_chart.py         validación estática del chart
    ├── ARQUITECTURA.md          diagrama y descripción
    ├── IMAGENES.md              tabla de tamaños antes/después
    └── PREGUNTAS.md             respuestas teóricas
```

---

## Componentes desplegados

| Componente | Lenguaje | Tipo | Base de datos |
|---|---|---|---|
| `api-gateway` | Node.js | Deployment | — |
| `ms-auth` | Node.js | Deployment | `auth_db` |
| `ms-lotes` | Node.js | Deployment | `lotes_db` |
| `ms-aprobaciones` | Python | Deployment (productor) | `aprobaciones_db` |
| `ms-notificaciones` | Python | Deployment + worker | `notificaciones_db` |
| `cronjob-1` / `cronjob-2` | Python | CronJob | `cron_db` |
| PostgreSQL | — | StatefulSet + PVC | — |
| RabbitMQ | — | dependencia del chart | — |

---

## Puesta en marcha

Los comandos completos, del clúster vacío a la aplicación funcionando, están en **[docs/COMANDOS.md](docs/COMANDOS.md)**.

Resumen:

```bash
minikube start --memory=4096 --cpus=4
minikube addons enable ingress metrics-server

eval $(minikube docker-env)
# construir las 7 imágenes (ver COMANDOS.md)

npm run keys 2>/dev/null || {
  mkdir -p keys
  openssl genrsa -out keys/jwt_private.pem 2048
  openssl rsa -in keys/jwt_private.pem -pubout -out keys/jwt_public.pem
}

cp charts/sa-platform/values.example.yaml secretos.yaml   # y editarlo

helm dependency update ./charts/sa-platform
helm lint ./charts/sa-platform

helm install sa-platform ./charts/sa-platform \
  --namespace sa-p5 \
  -f charts/sa-platform/values-dev.yaml \
  -f secretos.yaml \
  --set-file secrets.jwtPrivateKey=keys/jwt_private.pem \
  --set-file secrets.jwtPublicKey=keys/jwt_public.pem \
  --wait
```

---

## Credenciales

**Ninguna credencial está versionada.** El chart usa `required` en todas: si no se proveen al instalar, el despliegue falla de inmediato con un mensaje claro en vez de arrancar con valores por defecto inseguros.

- `values.example.yaml` — plantilla con valores ficticios (sí se versiona)
- `secretos.yaml` — valores reales (excluido por `.gitignore`)
- `keys/*.pem` — par RSA (excluido por `.gitignore`)

---

## Validación antes de instalar

```bash
python3 docs/validar_chart.py charts/sa-platform
```

Revisa delimitadores desbalanceados, bloques sin `end`, `include` a plantillas inexistentes, subcharts que leen valores del padre fuera de `global`, desfases entre `values.yaml` y los de ambiente, y credenciales versionadas por descuido.

No sustituye a `helm lint` ni a `helm template`, que son los únicos que detectan errores de renderizado real.

---

## Documentación

| Documento | Contenido |
|---|---|
| [COMANDOS.md](docs/COMANDOS.md) | Comandos reproducibles y cómo generar cada evidencia |
| [ARQUITECTURA.md](docs/ARQUITECTURA.md) | Diagrama, flujos síncronos y asíncronos, límites de red |
| [EVIDENCIAS.md](docs/EVIDENCIAS.md) | Salidas de las ocho pruebas solicitadas |
| [IMAGENES.md](docs/IMAGENES.md) | Tamaño de las imágenes antes y después del multi-stage |
| [PREGUNTAS.md](docs/PREGUNTAS.md) | Respuestas a las preguntas teóricas |
