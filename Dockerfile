# Stage 1: Build
FROM node:20-alpine AS builder
RUN npm install -g pnpm@9

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/

RUN pnpm install --frozen-lockfile

COPY packages/ packages/

RUN pnpm --filter=shared build
RUN pnpm --filter=frontend build
RUN pnpm --filter=backend build

# Stage 2: Production
FROM node:20-alpine
RUN npm install -g pnpm@9

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/backend/dist packages/backend/dist/
COPY --from=builder /app/packages/frontend/dist packages/frontend/dist/

# Create data directory; use existing 'node' user (uid 1000) from base image
RUN mkdir -p /app/data && chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/mnt/nas
ENV APP_DATA=/app/data

EXPOSE 3000

CMD ["node", "packages/backend/dist/index.js"]
