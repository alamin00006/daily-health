# API image for the VPS (deploy/docker-compose.prod.yml).
#   target "tools":   full dependencies + sources; runs `prisma migrate deploy` (and the
#                     demo seed on staging) as the one-shot `migrate` service.
#   target "runtime": production dependencies + the compiled app only.

FROM node:26-bookworm-slim AS tools
WORKDIR /app
ENV CI=true
# OpenSSL for Prisma; certificates for outgoing HTTPS (R2, Gmail, BulkSMSBD, shurjoPay).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# The schema is needed by `prisma generate` in postinstall.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build

FROM tools AS prod-deps
RUN npm prune --omit=dev --ignore-scripts

FROM node:26-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=tools /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
