# ST-Zero Dockerfile
# 多阶段构建：依赖 → 编译 → 运行

# ---------- 阶段 1：依赖 ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# ---------- 阶段 2：编译 ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx tsc

# ---------- 阶段 3：运行 ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8000
ENV DATA_DIR=/app/data

# 仅复制生产依赖
COPY --from=deps /app/node_modules ./node_modules
# 编译产物
COPY --from=build /app/dist ./dist
# 前端静态文件（极简版新前端）
COPY public-new ./public-new
# package.json（用于启动脚本）
COPY package.json ./

# 数据目录（数据卷挂载点）
RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 8000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 8000) + '/health').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "dist/server/start.js"]
