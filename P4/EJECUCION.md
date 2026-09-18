# Guía de ejecución

## Requisitos

- **Docker Desktop** instalado y corriendo (incluye Docker Compose)
- Puertos libres: `8080`, `3001`, `3002`, `3003`, `3004` y `5432`

No hace falta instalar Node.js ni Python: todo corre dentro de contenedores.

---

## Levantar el sistema

Desde la carpeta `P4`:

```bash
docker compose up --build
```

```bash
docker compose up --build -d
docker compose logs -f        # ver los logs
```

---

## Verificar que todo está arriba

```bash
curl http://localhost:8080/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health
```

responden `{"servicio":"...","estado":"ok"}`.

---

## Usuarios de demostración

Se crean solos al arrancar:

| Correo                | Contraseña      | Rol     |
| --------------------- | --------------- | ------- |
| `admin@usac.edu.gt`   | `Admin.12345`   | admin   |
| `cliente@usac.edu.gt` | `Cliente.12345` | cliente |

---

### 1. Login

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"correo":"admin@usac.edu.gt","password":"Admin.12345"}'
```

Devuelve el usuario y el `token`. Guárdalo:

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"correo":"admin@usac.edu.gt","password":"Admin.12345"}' | jq -r .token)
```

> sin `jq`, copia el token a mano de la respuesta anterior.

### 2. Sin token la ruta está protegida

```bash
curl -i http://localhost:8080/api/lotes
```

respuesta **401**.

### 3. REST — crear un lote (ms-lotes, Node.js)

```bash
curl -X POST http://localhost:8080/api/lotes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nombreArchivo":"planilla-agosto.csv","transacciones":[
    {"cuentaOrigen":"001-100","cuentaDestino":"002-200","monto":1500.50,
     "beneficiarioNombre":"Ana Lopez","beneficiarioEmail":"ana@usac.edu.gt"},
    {"cuentaOrigen":"001-100","cuentaDestino":"003-300","monto":2200,
     "beneficiarioNombre":"Luis Perez","beneficiarioEmail":"luis@usac.edu.gt"}]}'
```

Devuelve el lote con estado `VALIDADO`.

### 4. Las reglas de negocio rechazan un lote inválido (REGLA DE NEGOCIO)

```bash
curl -X POST http://localhost:8080/api/lotes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nombreArchivo":"malo.csv","transacciones":[
    {"cuentaOrigen":"001","cuentaDestino":"002","monto":99999,
     "beneficiarioNombre":"X","beneficiarioEmail":"x@y.gt"}]}'
```

El monto excede el límite, así que el lote sale `RECHAZADO`.

### 5. GraphQL en ms-lotes (Node.js)

```bash
curl -X POST http://localhost:8080/api/graphql/lotes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ lotes { id nombreArchivo estado montoTotal transacciones { beneficiarioNombre monto valida motivoRechazo } } }"}'
```

Una sola consulta trae el lote **y** sus transacciones anidadas.

### 6. GraphQL en ms-aprobaciones (Python/Strawberry)

```bash
curl -X POST http://localhost:8080/api/graphql/aprobaciones \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { crearSolicitud(loteId: 1, montoTotal: 3700.50) { id estado pasoActual } }"}'
```

### 7. Flujo de aprobación de 3 pasos

Registra tres usuarios distintos (la segregación de funciones exige personas diferentes):

```bash
for u in maker checker authorizer; do
  curl -s -X POST http://localhost:8080/api/auth/registro \
    -H "Content-Type: application/json" \
    -d "{\"correo\":\"$u@usac.edu.gt\",\"nombre\":\"Usuario $u\",\"password\":\"Clave.12345\"}"
done
```

Toma el token de cada uno y registra su paso:

```bash
TK=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"correo":"maker@usac.edu.gt","password":"Clave.12345"}' | jq -r .token)

curl -X POST http://localhost:8080/api/aprobaciones/1/pasos \
  -H "Authorization: Bearer $TK" -H "Content-Type: application/json" \
  -d '{"decision":"APROBADO"}'
```

Repetir con `checker` y `authorizer`. Al tercer paso la solicitud queda `APROBADA`.

**Para demostrar la segregación de funciones:** intenta registrar dos pasos con el mismo usuario. Responde **409** con el mensaje de segregación de funciones.

### 7.5 Segregación de Funciones

1. Crear una solicitud de aprobación nueva (usando el lote 1 ya existente)

```bash
curl -s -X POST http://localhost:8080/api/aprobaciones \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"lote_id":1,"monto_total":3700.50}'
```

2. El maker aprueba el paso 1 — debe funcionar

```bash
TK=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"correo":"maker@usac.edu.gt","password":"Clave.12345"}' | jq -r .token)

curl -s -X POST http://localhost:8080/api/aprobaciones/SOLICITUD_ID/pasos \
  -H "Authorization: Bearer $TK" -H "Content-Type: application/json" \
  -d '{"decision":"APROBADO"}'
```

3. Mismo maker intena el paso 2

```
curl -i -X POST http://localhost:8080/api/aprobaciones/SOLICITUD_ID/pasos \
 -H "Authorization: Bearer $TK" -H "Content-Type: application/json" \
 -d '{"decision":"APROBADO"}'
```

### 8. Control por rol en el Gateway

```bash
# admin -> 200
curl -i http://localhost:8080/api/notificaciones -H "Authorization: Bearer $TOKEN"

# cliente -> 403
curl -i http://localhost:8080/api/notificaciones -H "Authorization: Bearer $TK"
```

---

## Documentación interactiva

FastAPI genera OpenAPI automáticamente. Ábrelas en el navegador:

- `http://localhost:3003/docs` — ms-aprobaciones
- `http://localhost:3004/docs` — ms-notificaciones

Ahí puedes probar los endpoints desde la interfaz, sin `curl`.

---

## Apagar el sistema

```bash
docker compose down
```

Para borrar también las bases de datos y las llaves (arranque totalmente limpio):

```bash
docker compose down -v
```

---

## Solución de problemas

### "port is already allocated"

Algún puerto está ocupado. Averigua cuál y libéralo, o cambia el puerto publicado en `docker-compose.yml` (el número **de la izquierda** en `"8080:8080"`).

```bash
# Linux / Mac
lsof -i :8080
# Windows
netstat -ano | findstr :8080
```

### El Gateway responde `503 "El servicio de autenticación aún no está listo"`

El Gateway no encontró la llave pública. `ms-auth` la genera al arrancar y la deja en el volumen compartido. Espera unos segundos y reintenta. Si persiste:

```bash
docker compose logs ms-auth
```

Debe aparecer `[ms-auth] generando llaves RSA...`.

### Algún servicio reintenta conectarse a la base

Es normal en el primer arranque: los servicios esperan a que PostgreSQL termine de inicializar. Reintentan hasta 15 veces cada 2 segundos.

### Reconstruir desde cero

```bash
docker compose down -v
docker compose build --no-cache
docker compose up
```

### Ver los logs de un servicio

```bash
docker compose logs -f ms-lotes
docker compose logs -f api-gateway
```

---

## Mapa de puertos

| Componente        | Puerto | Lenguaje |
| ----------------- | ------ | -------- |
| API Gateway       | 8080   | Node.js  |
| ms-auth           | 3001   | Node.js  |
| ms-lotes          | 3002   | Node.js  |
| ms-aprobaciones   | 3003   | Python   |
| ms-notificaciones | 3004   | Python   |
| PostgreSQL        | 5432   | —        |

En la demostración basta usar el **8080**: todo pasa por el Gateway. Los puertos individuales están publicados solo para poder inspeccionar cada servicio por separado durante la calificación.
