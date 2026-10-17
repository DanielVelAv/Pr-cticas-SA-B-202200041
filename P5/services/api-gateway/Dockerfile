# syntax=docker/dockerfile:1
# ---------- Etapa 1: dependencias ----------
# Se separa la instalacion para que la imagen final no cargue con npm,
# el cache de descarga ni las herramientas de compilacion.
FROM node:20-alpine AS deps
WORKDIR /build
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ---------- Etapa 2: runtime ----------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production

# node:20-alpine ya trae el usuario 'node' (uid 1000): no se crea root.
WORKDIR /app
COPY --from=deps --chown=node:node /build/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

USER node
EXPOSE 8080
CMD ["node", "--require", "./src/telemetria.js", "src/server.js"]
