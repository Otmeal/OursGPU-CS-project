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
# 盡量利用快取：先放 lockfile 與 workspace 定義
COPY ../../pnpm-lock.yaml* ../../pnpm-workspace.yaml* ../../package.json* ../../nest-cli.json* ../../tsconfig.json* ../../tsconfig.build.json* ./
COPY ../../apps/controller/package.json ./apps/controller/package.json
COPY ../../apps/worker/package.json ./apps/worker/package.json
COPY ../../apps/frontend/package.json ./apps/frontend/package.json
COPY ../../libs/shared/package.json ./libs/shared/package.json
COPY ../../prisma ./prisma
# 安裝 controller 及其依賴（含 dev，用於 build）；Prisma 生成以顯式指令執行
RUN pnpm install --filter @ours-gpu/controller... --frozen-lockfile \
  && pnpm --filter @ours-gpu/controller prisma generate

############################
# Build the controller
############################
FROM deps AS build
# 帶入原始碼後再執行編譯
COPY ../../ ./
# 用 Nest CLI 編譯特定專案（要求 repo 有 @nestjs/cli 作為 devDependency）
RUN pnpm exec nest build controller

############################
# Production deps only
############################
FROM deps AS prod-deps
RUN pnpm prune --prod --filter @ours-gpu/controller...

############################
# Runner
############################
FROM node:22-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# 僅帶 production 依賴與已編譯的 dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build     /app/dist         ./dist

# 以非 root 執行
USER node

EXPOSE 3000 50051
# 若你在 main.ts 用 connectMicroservice + app.listen(3000)，入口點就是下列：
CMD ["node", "dist/apps/controller/main.js"]
