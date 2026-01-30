FROM oven/bun:1-alpine AS base

# 安装依赖
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN bun install --frozen-lockfile

# 构建
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# 运行
FROM base AS runner
WORKDIR /app

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 sisyphus

# 复制构建产物和依赖
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# 复制环境变量模板（不包含敏感值）
COPY --from=builder /app/.env.example ./.env.example

# 切换用户
USER sisyphus

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# 启动命令
CMD ["bun", "start"]
