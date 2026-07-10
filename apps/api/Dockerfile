# Build context = raiz do monorepo. No EasyPanel: Build → Dockerfile,
# path "apps/api/Dockerfile", build context "/".
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app
# `prisma generate` (via postinstall) carrega prisma.config.ts, que exige
# DATABASE_URL para resolver. Não conecta ao banco — placeholder basta no build.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ovgs/api exec prisma generate
RUN pnpm --filter @ovgs/api build

FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
WORKDIR /app/apps/api
EXPOSE 3000
# Aplica migrações pendentes e sobe. migrate deploy lê DATABASE_URL via prisma.config.ts.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/src/main"]
