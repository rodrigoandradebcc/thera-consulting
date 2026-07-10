FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app
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
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/src/main"]
