# syntax=docker/dockerfile:1
# ---------- Etapa 1: dependencias ----------
FROM node:20-alpine AS deps
WORKDIR /build
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ---------- Etapa 2: runtime ----------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production

# openssl se usa una sola vez al arrancar, para generar el par de llaves
# RSA que firma los JWT (heredado de la Practica 2).
RUN apk add --no-cache openssl

WORKDIR /app
COPY --from=deps --chown=node:node /build/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node schema.sql ./
COPY --chown=node:node entrypoint.sh ./
RUN chmod +x entrypoint.sh

USER node
EXPOSE 3001
CMD ["./entrypoint.sh"]
