# Deploy — Backend (EasyPanel/VPS) + Frontend (Vercel)

Arquitetura: API NestJS + Postgres no EasyPanel (VPS Hostinger); SPA React na Vercel.

## Backend — EasyPanel

### 1. Postgres

EasyPanel → **Create Service → Postgres**. Anote o nome do serviço (ex.: `ovgs-db`).
A connection string interna fica em **Credentials**, no formato:

```
postgres://<user>:<senha>@<nome-do-servico>:5432/<db>
```

Serviços no mesmo projeto se enxergam pelo nome — não exponha a porta 5432 pra internet.

### 2. App (API)

EasyPanel → **Create Service → App**.

- **Source**: GitHub, repo do projeto, branch `main`.
- **Build**: método **Dockerfile**.
  - Dockerfile path: `apps/api/Dockerfile`
  - Build context: `/` (raiz do monorepo — o Dockerfile depende do lockfile/workspace da raiz).
- **Environment**:
  ```
  DATABASE_URL=postgres://<user>:<senha>@ovgs-db:5432/<db>
  PORT=3000
  WEB_ORIGIN=https://<seu-dominio-vercel>
  ```
- **Ports/Proxy**: exponha a porta **3000**. EasyPanel emite HTTPS (Let's Encrypt) e te dá um domínio.
- **Health check** (opcional): path `/api/health`.

O container roda `prisma migrate deploy` na subida (aplica migrações) e depois `node dist/src/main`.

Verificar após o deploy:
- `https://<dominio-api>/api/health` → `{"status":"ok","database":"up"}`
- Swagger: `https://<dominio-api>/docs`

### 3. Seed (opcional, 1ª vez)

Pra popular dados de demonstração, rode o seed uma vez pelo terminal do container (EasyPanel → App → Console):

```
pnpm exec tsx prisma/seed.ts
```

## Frontend — Vercel

Vercel → **Add New → Project** → importe o repo.

- **Root Directory**: `apps/web` (marque "Include files outside root directory" se pedir — o install roda no workspace da raiz).
- **Framework Preset**: Vite (detectado).
- **Build Command**: `pnpm build` · **Output**: `dist` (padrão do preset).
- **Environment Variables**:
  ```
  VITE_API_URL=https://<dominio-api>/api
  ```
  (inclui o sufixo `/api` — é o global prefix da API.)

O `apps/web/vercel.json` já configura o rewrite de SPA (deep links tipo `/sales-orders/:id` caem no `index.html`).

## CORS e domínios de preview

`WEB_ORIGIN` é uma origem única = domínio de produção da Vercel. Deploys de **preview** da Vercel têm URL diferente por commit e seriam bloqueados pelo CORS. Opções:

1. Testar sempre no domínio de produção (mais simples).
2. Pedir pra eu tornar `WEB_ORIGIN` uma lista separada por vírgula (aceita prod + previews). Mudança pequena no `main.ts` + `env.ts`.

## Ordem recomendada

1. Sobe Postgres + API no EasyPanel → pega o domínio da API.
2. Sobe o front na Vercel com `VITE_API_URL` apontando pra ela → pega o domínio da Vercel.
3. Volta no EasyPanel e ajusta `WEB_ORIGIN` pro domínio final da Vercel → redeploy da API.
