# Tamaño de las imágenes: antes y después de la optimización

**Criterio 1.1 — parte de 12 pts**

El enunciado exige una tabla comparativa del tamaño de cada imagen antes y después de optimizarla con _multi-stage build_ y una base mínima.

---

## Cómo obtener los números

### 1. Construir las imágenes de la Práctica 4 (una sola etapa)

Si conservas la carpeta `P4`, esas imágenes son la línea base:

```bash
eval $(minikube docker-env)

docker build -t sa-p4/api-gateway:base       ../P4/api-gateway
docker build -t sa-p4/ms-auth:base           ../P4/ms-auth
docker build -t sa-p4/ms-lotes:base          ../P4/ms-lotes
docker build -t sa-p4/ms-aprobaciones:base   ../P4/ms-aprobaciones
docker build -t sa-p4/ms-notificaciones:base ../P4/ms-notificaciones
```

### 2. Construir las de la Práctica 5 (multi-stage)

```bash
docker build -t sa-p5/api-gateway:1.0.0       ./services/api-gateway
docker build -t sa-p5/ms-auth:1.0.0           ./services/ms-auth
docker build -t sa-p5/ms-lotes:1.0.0          ./services/ms-lotes
docker build -t sa-p5/ms-aprobaciones:1.0.0   ./services/ms-aprobaciones
docker build -t sa-p5/ms-notificaciones:1.0.0 ./services/ms-notificaciones
docker build -t sa-p5/cronjob-registro:1.0.0  ./scripts/cronjob-1
docker build -t sa-p5/cronjob-resumen:1.0.0   ./scripts/cronjob-2
```

### 3. Medir

```bash
docker images --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}" \
  | grep -E "sa-p4|sa-p5" | sort
```

---

## Tabla comparativa

Completar con los valores reales:

| Imagen              | P4 — una etapa | P5 — multi-stage | Reducción | %   |
| ------------------- | -------------- | ---------------- | --------- | --- |
| `api-gateway`       |                |                  |           |     |
| `ms-auth`           |                |                  |           |     |
| `ms-lotes`          |                |                  |           |     |
| `ms-aprobaciones`   |                |                  |           |     |
| `ms-notificaciones` |                |                  |           |     |
| `cronjob-registro`  | n/a            |                  | —         | —   |
| `cronjob-resumen`   | n/a            |                  | —         | —   |

---

## Qué cambió técnicamente

Para explicar la diferencia al defender el trabajo:

**Servicios en Node.js**

| Antes                                      | Después                                                    |
| ------------------------------------------ | ---------------------------------------------------------- |
| Una sola etapa `node:20-alpine`            | Etapa `deps` para instalar y etapa `runtime` para ejecutar |
| La imagen final conserva la caché de `npm` | Solo se copia `node_modules` ya resuelto                   |
| Se ejecuta como `root`                     | Usuario `node` (uid 1000), sin privilegios                 |

**Servicios en Python**

| Antes                                                                   | Después                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| Una sola etapa `python:3.12-slim`                                       | Etapa `builder` compila las ruedas, `runtime` solo las copia |
| La imagen final incluye la caché de `pip` y herramientas de compilación | Solo el árbol `/install` con las dependencias                |
| Se ejecuta como `root`                                                  | Usuario `app` (uid 1000), sin privilegios                    |

**Por qué importa además del tamaño**

Una imagen más pequeña no solo se descarga más rápido: también tiene **menos superficie de ataque**. Todo lo que no está en la imagen final —compiladores, gestores de paquetes, cachés— es algo que un atacante no puede aprovechar si compromete el contenedor. Esa es la razón de fondo por la que el enunciado exige base mínima y `readOnlyRootFilesystem`.

---

## Comando para verificar el usuario no-root

Evidencia adicional de que los contenedores no corren como root:

```bash
docker run --rm --entrypoint sh sa-p5/ms-lotes:1.0.0 -c "id"
docker run --rm --entrypoint sh sa-p5/ms-aprobaciones:1.0.0 -c "id"
```
