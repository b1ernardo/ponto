# Relógio de Ponto - imagem de produção
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

# Dependências (cache de camada)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Código
COPY . .

# Baixa os modelos faciais para dentro da imagem (funciona offline)
RUN node scripts/download-models.mjs

# Dados persistentes (banco SQLite + uploads) via volume
ENV DATA_DIR=/data \
    UPLOAD_DIR=/data/uploads \
    PORT=3000 \
    HOST=0.0.0.0
RUN mkdir -p /data && chown -R node:node /app /data
VOLUME ["/data"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
