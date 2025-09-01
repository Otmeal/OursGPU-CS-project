# syntax=docker/dockerfile:1.7

############################
# Base w/ pnpm
############################
FROM node:22-slim AS base
ENV PNPM_HOME=/usr/local/share/pnpm
ENV NODE_ENV=production
RUN corepack enable

WORKDIR /app

############################
# Dependencies (full, for build)
############################
FROM base AS deps
COPY ../../ ./
RUN pnpm install --frozen-lockfile

############################
# Build the worker
############################
FROM deps AS build
RUN pnpm exec nest build worker

############################
# Production deps only
############################
FROM deps AS prod-deps
RUN pnpm prune --prod

############################
# Runner
############################
FROM node:22-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build     /app/dist         ./dist

USER node
# 若你沒有 HTTP 端點，可不 EXPOSE；若有健康檢查頁面，改成 EXPOSE 你使用的埠
# EXPOSE 3001

# 多數情境下，worker 會透過環境變數知道 controller 的 gRPC 位址
# 與程式一致使用 CONTROLLER_GRPC（見 WorkerModule）
ENV CONTROLLER_GRPC=controller:50051

# 心跳間隔（毫秒）
ENV HEARTBEAT_MS=2000

CMD ["node", "dist/apps/worker/main.js"]
