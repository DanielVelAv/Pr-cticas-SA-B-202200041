# Comandos reproducibles

---

## 0. Requisitos

| Herramienta      | Verificar con              |
| ---------------- | -------------------------- |
| Docker           | `docker --version`         |
| Kubernetes local | `minikube version`         |
| Helm 3           | `helm version`             |
| kubectl          | `kubectl version --client` |
| k6               | `k6 version`               |

---

## 1. Levantar el clúster

```bash
minikube start --memory=4096 --cpus=4 --driver=docker

# Ingress Controller: unica puerta de entrada al cluster
minikube addons enable ingress

# metrics-server: sin el, el HPA no puede leer el uso de CPU
minikube addons enable metrics-server

kubectl get nodes
```

Esperar a que el Ingress Controller quede listo:

```bash
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s
```

---

## 2. Construir las imágenes dentro del clúster

`minikube docker-env` apunta el Docker local al demonio **del clúster**, así las imágenes quedan disponibles sin registro externo ni `docker push`.

```bash
eval $(minikube docker-env)

docker build -t sa-p5/api-gateway:1.0.0       ./services/api-gateway
docker build -t sa-p5/ms-auth:1.0.0           ./services/ms-auth
docker build -t sa-p5/ms-lotes:1.0.0          ./services/ms-lotes
docker build -t sa-p5/ms-aprobaciones:1.0.0   ./services/ms-aprobaciones
docker build -t sa-p5/ms-notificaciones:1.0.0 ./services/ms-notificaciones
docker build -t sa-p5/cronjob-registro:1.0.0  ./scripts/cronjob-1
docker build -t sa-p5/cronjob-resumen:1.0.0   ./scripts/cronjob-2

docker images | grep sa-p5
```

> Si abre una terminal nueva, vuelva a ejecutar `eval $(minikube docker-env)`.

---

## 3. Generar credenciales y llaves

Nada de esto se versiona: `.gitignore` excluye `keys/` y `secretos.yaml`.

```bash
mkdir -p keys
openssl genrsa -out keys/jwt_private.pem 2048
openssl rsa -in keys/jwt_private.pem -pubout -out keys/jwt_public.pem

cp charts/sa-platform/values.example.yaml secretos.yaml
```

Editar `secretos.yaml` y sustituir los valores. Las dos llaves de cifrado deben ser **distintas entre sí**:

```bash
openssl rand -base64 32   # -> secrets.aesKey
openssl rand -base64 32   # -> secrets.blindIndexKey
```

---

## 4. Resolver dependencias y validar el chart

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

helm dependency update ./charts/sa-platform

# Debe pasar sin errores NI advertencias
helm lint ./charts/sa-platform

# Renderiza el YAML final sin instalar nada: aqui se detectan
# problemas de indentacion antes de tocar el cluster
helm template sa-platform ./charts/sa-platform \
  -f charts/sa-platform/values-dev.yaml \
  -f secretos.yaml \
  --set-file secrets.jwtPrivateKey=keys/jwt_private.pem \
  --set-file secrets.jwtPublicKey=keys/jwt_public.pem \
  > /tmp/render.yaml

grep -c "^kind:" /tmp/render.yaml    # cuantos objetos se van a crear
```

---

## 5. Instalar la plataforma

El namespace lo crea el propio chart, por eso **no** se usa `--create-namespace`.

```bash
helm install sa-platform ./charts/sa-platform \
  --namespace sa-p5 \
  -f charts/sa-platform/values-dev.yaml \
  -f secretos.yaml \
  --set-file secrets.jwtPrivateKey=keys/jwt_private.pem \
  --set-file secrets.jwtPublicKey=keys/jwt_public.pem \
  --wait --timeout 10m
```

Verificar:

```bash
kubectl get pods,svc,ingress,hpa,pdb,cronjob -n sa-p5
kubectl get statefulset,pvc -n sa-p5
helm status sa-platform -n sa-p5
```

---

## 6. Acceder por el Ingress

```bash
echo "$(minikube ip)  sa-p5.local" | sudo tee -a /etc/hosts

curl http://sa-p5.local/health

TOKEN=$(curl -s -X POST http://sa-p5.local/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"correo":"admin@usac.edu.gt","password":"Admin.12345"}' | jq -r .token)

curl http://sa-p5.local/api/lotes -H "Authorization: Bearer $TOKEN"
```

---

# Evidencias solicitadas

Cada bloque produce una de las evidencias que pide el enunciado. Capture la salida completa.

## E1. Ciclo de vida con Helm: upgrade y rollback

Publicar una **segunda versión** del chart:

```bash
# Subir version y appVersion en charts/sa-platform/Chart.yaml
#   version: 1.0.0  -> 1.1.0
#   appVersion: "1.0.0" -> "1.1.0"

helm upgrade sa-platform ./charts/sa-platform \
  --namespace sa-p5 \
  -f charts/sa-platform/values-dev.yaml \
  -f secretos.yaml \
  --set-file secrets.jwtPrivateKey=keys/jwt_private.pem \
  --set-file secrets.jwtPublicKey=keys/jwt_public.pem \
  --wait

helm history sa-platform -n sa-p5        # <-- EVIDENCIA
```

Volver a la revisión anterior:

```bash
helm rollback sa-platform 1 -n sa-p5
helm history sa-platform -n sa-p5        # <-- EVIDENCIA: aparece "Rollback to 1"
```

## E2. Persistencia: los datos sobreviven al borrado del pod

```bash
# 1. Escribir un dato
curl -s -X POST http://sa-p5.local/api/lotes \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"nombreArchivo":"antes-de-borrar.csv","transacciones":[
      {"cuentaOrigen":"001","cuentaDestino":"002","monto":100,
       "beneficiarioNombre":"Prueba","beneficiarioEmail":"p@usac.edu.gt"}]}'

# 2. Borrar el pod de la base de datos
kubectl delete pod sa-platform-postgresql-0 -n sa-p5
kubectl wait --for=condition=ready pod/sa-platform-postgresql-0 -n sa-p5 --timeout=180s

# 3. El dato sigue ahi                     <-- EVIDENCIA
curl -s http://sa-p5.local/api/lotes -H "Authorization: Bearer $TOKEN" | jq
```

## E3. Flujo asíncrono con el consumidor caído

```bash
# 1. Apagar el consumidor
kubectl scale deploy/sa-platform-ms-notificaciones-worker --replicas=0 -n sa-p5

# 2. Aprobar lotes: se publican eventos que nadie consume
#    (crear lote -> crear solicitud -> 3 pasos con usuarios distintos)

# 3. Los mensajes se ACUMULAN en la cola      <-- EVIDENCIA
kubectl exec -n sa-p5 sa-platform-rabbitmq-0 -- \
  rabbitmqctl list_queues name messages durable

# 4. Restaurar el consumidor
kubectl scale deploy/sa-platform-ms-notificaciones-worker --replicas=1 -n sa-p5

# 5. La cola se vacia y los datos aparecen    <-- EVIDENCIA
kubectl exec -n sa-p5 sa-platform-rabbitmq-0 -- rabbitmqctl list_queues name messages
kubectl logs -n sa-p5 -l app.kubernetes.io/name=ms-notificaciones-worker --tail=30
```

## E4. NetworkPolicy: bloqueo del tráfico lateral

```bash
# Un pod cualquiera intenta llamar a un microservicio directamente.
# Debe fallar por timeout: solo el API Gateway tiene permitido llegar.
kubectl run intruso --rm -it --restart=Never \
  --image=curlimages/curl -n sa-p5 -- \
  curl -m 8 -v http://sa-platform-ms-lotes:3002/health    # <-- EVIDENCIA
```

Contraste: desde el Gateway sí funciona.

```bash
kubectl exec -n sa-p5 deploy/sa-platform-api-gateway -- \
  wget -qO- http://sa-platform-ms-lotes:3002/health
```

## E5. Escalado automático bajo carga

En tres terminales simultáneas:

```bash
# Terminal 1
kubectl get hpa -n sa-p5 -w        # <-- EVIDENCIA

# Terminal 2
kubectl get pods -n sa-p5 -w       # <-- EVIDENCIA

# Terminal 3
k6 run scripts/carga/carga.js      # <-- EVIDENCIA: RPS, p95 y % de error
```

Al terminar, la carga baja y las réplicas descienden solas (tarda unos minutos por la ventana de estabilización).

## E6. Actualización sin caída de servicio

```bash
# Terminal 1: peticiones continuas durante todo el upgrade
while true; do
  curl -s -o /dev/null -w "%{http_code} " http://sa-p5.local/health
  sleep 0.3
done

# Terminal 2: forzar un despliegue nuevo
helm upgrade sa-platform ./charts/sa-platform \
  --namespace sa-p5 \
  -f charts/sa-platform/values-dev.yaml -f secretos.yaml \
  --set-file secrets.jwtPrivateKey=keys/jwt_private.pem \
  --set-file secrets.jwtPublicKey=keys/jwt_public.pem \
  --set global.imageTag=1.1.0 --wait
```

En la terminal 1 solo deben verse `200`. Ningún `502` ni `503`. <-- EVIDENCIA

## E7. Cronjobs encadenados

```bash
kubectl get cronjob -n sa-p5
kubectl get jobs -n sa-p5

# Cronjob 1: fecha GMT-6 y carne          <-- EVIDENCIA
kubectl logs -n sa-p5 -l app.kubernetes.io/name=cronjob-1 --tail=20

# Cronjob 2: publica el resumen al broker <-- EVIDENCIA
kubectl logs -n sa-p5 -l app.kubernetes.io/name=cronjob-2 --tail=20

# El worker lo consumio y almaceno        <-- EVIDENCIA
curl -s http://sa-p5.local/api/notificaciones/resumenes \
  -H "Authorization: Bearer $TOKEN" | jq
```

Para no esperar los intervalos, se puede disparar a mano:

```bash
kubectl create job --from=cronjob/sa-platform-cronjob-1 prueba-1 -n sa-p5
kubectl create job --from=cronjob/sa-platform-cronjob-2 prueba-2 -n sa-p5
```

## E8. Tabla de tamaños de imagen

Comparar la imagen de la Práctica 4 (una sola etapa) contra la de la Práctica 5 (multi-stage):

```bash
docker images --format "{{.Repository}}:{{.Tag}}  {{.Size}}" | grep -E "sa-p5|sa-p4"
```

Llenar con los valores reales:

| Imagen            | P4 (una etapa) | P5 (multi-stage) | Reducción |
| ----------------- | -------------- | ---------------- | --------- |
| api-gateway       |                |                  |           |
| ms-auth           |                |                  |           |
| ms-lotes          |                |                  |           |
| ms-aprobaciones   |                |                  |           |
| ms-notificaciones |                |                  |           |

---

## Diagnóstico

```bash
kubectl describe pod <pod> -n sa-p5
kubectl logs <pod> -n sa-p5 --previous     # log del contenedor anterior
kubectl get events -n sa-p5 --sort-by=.lastTimestamp

# ConfigMap y Secret realmente montados
kubectl get configmap sa-platform-config -n sa-p5 -o yaml
kubectl get secret sa-platform-secrets -n sa-p5 -o jsonpath='{.data}' | jq 'keys'
```

Errores frecuentes:

| Síntoma                              | Causa probable                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| `CrashLoopBackOff` en todos los pods | Falta una variable en el ConfigMap, o `readOnlyRootFilesystem` sin volumen `/tmp` |
| HPA muestra `<unknown>` en CPU       | `metrics-server` no está habilitado                                               |
| Ingress devuelve 404                 | Falta la entrada en `/etc/hosts`, o el Ingress Controller no está listo           |
| Pods sin poder resolver nombres      | La NetworkPolicy de DNS no se aplicó                                              |
| `ErrImagePull`                       | Se olvidó `eval $(minikube docker-env)` antes de construir                        |

---

## Desinstalar

```bash
helm uninstall sa-platform -n sa-p5
kubectl delete namespace sa-p5

# Los PVC no se borran solos: protegen los datos ante un uninstall accidental
kubectl delete pvc --all -n sa-p5
```
