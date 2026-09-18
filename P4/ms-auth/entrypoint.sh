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
until node -e "require('pg').Pool && process.exit(0)" 2>/dev/null; do sleep 1; done

echo "[ms-auth] aplicando esquema y semilla..."
node src/seed.js || echo "[ms-auth] seed omitido"

exec node src/server.js
