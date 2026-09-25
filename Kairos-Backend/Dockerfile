# syntax=docker/dockerfile:1

# ---- deps: install production node_modules and generate the Prisma client ----
FROM node:22-slim AS deps

# Prisma's query engine is dynamically linked against OpenSSL.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# schema must be present before `prisma generate`
COPY prisma ./prisma
RUN npx prisma generate


# ---- runtime ----
FROM node:22-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=4100 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY package.json package-lock.json ./
COPY server.js db.js copilotEngine.js intentClassifier.js firebase-token-verifier.js google-auth-handler.js ./
COPY src ./src
COPY scripts ./scripts

# src/config/env.js creates this at startup; pre-create it so the non-root
# user owns it. NOTE: Fargate task storage is ephemeral -- uploads written
# here do not survive a task restart. Move to S3 before relying on them.
RUN mkdir -p /app/uploads /app/data && chown -R node:node /app

USER node

EXPOSE 4100

CMD ["node", "server.js"]
