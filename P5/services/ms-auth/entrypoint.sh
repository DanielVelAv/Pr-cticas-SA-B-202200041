#!/bin/sh
set -e

# Genera el par de llaves RSA solo la primera vez. El volumen compartido
# permite que el API Gateway lea la llave publica para verificar tokens.
if [ ! -f /keys/jwt_private.pem ]; then
  echo "[ms-auth] generando llaves RSA..."
  openssl genrsa -out /keys/jwt_private.pem 2048 2>/dev/null
  openssl rsa -in /keys/jwt_private.pem -pubout -out /keys/jwt_public.pem 2>/dev/null
  chmod 644 /keys/jwt_public.pem
fi

echo "[ms-auth] esperando a PostgreSQL..."
# El chequeo anterior solo verificaba que el paquete "pg" se pudiera
# importar (siempre cierto), no que Postgres aceptara conexiones. En
# minikube nunca se notó porque el pod de Postgres ya llevaba rato
# arriba de sesiones previas; en un cluster que arranca todo en frio
# (DOKS) la carrera es real y este contenedor podia ganarle a Postgres.
INTENTOS=0
MAX_INTENTOS=60
until node -e "
  const pool = require('./src/config/database');
  pool.query('SELECT 1').then(() => process.exit(0)).catch(() => process.exit(1));
" 2>/dev/null; do
  INTENTOS=$((INTENTOS + 1))
  if [ "$INTENTOS" -ge "$MAX_INTENTOS" ]; then
    echo "[ms-auth] Postgres no respondio tras ${MAX_INTENTOS} intentos, abortando."
    exit 1
  fi
  sleep 2
done

echo "[ms-auth] aplicando esquema y semilla..."
# Sin "|| echo": si el seed falla de verdad (no solo por timing, ya
# resuelto arriba), el contenedor debe morir y que Kubernetes lo
# reinicie, en vez de arrancar el servidor sobre una base de datos sin
# tablas ni usuarios -- que es exactamente lo que paso antes: el
# servidor quedaba "sano" pero cualquier login fallaba con
# 'relation "usuarios" does not exist'.
node src/seed.js

exec node --require ./src/telemetria.js src/server.js
