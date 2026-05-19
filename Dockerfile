FROM node:22-alpine

RUN apk add --update --no-cache python3 py3-pip gcc python3-dev linux-headers musl-dev && \
    pip3 install --no-cache-dir --break-system-packages pymupdf && \
    rm -rf /var/cache/apk/*

WORKDIR /app

ENV HOST=0.0.0.0
ENV PORT=80
ENV OLLAMA_ONLY_MODE=1
ENV ENABLE_OPENCLAW_GATEWAY=0
ENV FAST_OLLAMA_ENABLED=0
ENV MODEL_BACKEND=cloudbase
ENV CB_ENV_ID=yczyxxgcxy-cloudplatform-d57ca4d
ENV CB_AI_PROVIDER=hunyuan-exp
ENV CB_AI_MODEL=hunyuan-turbos-latest
ENV CB_AI_TIMEOUT_MS=60000

COPY package.json package-lock.json ./
RUN npm install --production

COPY . .

EXPOSE 80

CMD ["node", "server.js"]
