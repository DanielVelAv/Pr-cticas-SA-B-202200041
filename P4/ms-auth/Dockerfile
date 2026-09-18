FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# openssl se usa en el entrypoint para generar el par de llaves RSA
RUN apk add --no-cache openssl

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
COPY schema.sql ./
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 3001
CMD ["./entrypoint.sh"]
