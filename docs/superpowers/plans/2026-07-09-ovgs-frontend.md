# OVGS Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a interface web do OVGS em `apps/web`, cobrindo gestão de Ordens de Venda, monitoramento operacional, central de agendamento, cadastros e auditoria, integrada à API real.

**Architecture:** SPA Vite + React. `features/` contém páginas e hooks de dados; `domain/` é código puro; `lib/api` isola o Axios. TanStack Query cuida de cache e invalidação. Filtros vivem na URL. O `409` do servidor é a autoridade sobre regras de negócio; a UI apenas antecipa.

**Tech Stack:** Vite, React 19, TypeScript strict, React Router v7, TanStack Query v5, Axios, React Hook Form + Zod, Tailwind v4, shadcn/ui, Lucide, Vitest + Testing Library + MSW.

**Spec:** `docs/superpowers/specs/2026-07-09-ovgs-frontend-design.md`

## Global Constraints

- Node `>=20.19.0`. Monorepo pnpm: o front é o pacote `@ovgs/web` em `apps/web`.
- **Tailwind v4**: não existe `tailwind.config.js`. O plugin é `@tailwindcss/vite` e o CSS começa com `@import "tailwindcss";`. Tokens são declarados com a diretiva `@theme`.
- **React Router v7 em modo library**: `createBrowserRouter` vem de `react-router`; `RouterProvider` vem de **`react-router/dom`**. Importar `RouterProvider` de `react-router` falha.
- Dinheiro chega da API como **string** (`"259.80"`). Exibir com `Intl.NumberFormat('pt-BR')`. **Nunca** `parseFloat` para aritmética. O front nunca envia `total`.
- Ícones: apenas `lucide-react`. Nenhum emoji como ícone.
- Nenhum hex em componente. Só tokens semânticos definidos em `@theme`.
- Status da OV sempre com **cor + rótulo textual + ícone**. Cor nunca sozinha.
- Toda mutação invalida as query keys afetadas, vindas de `lib/query-keys.ts`. Nunca string literal solta.
- Base da API: `import.meta.env.VITE_API_URL`, default `http://localhost:3000/api`.
- Commits em português, no formato `tipo: descrição`.
- Textos de interface em português.

---

## File Structure

```
apps/api/src/main.ts                       + enableCors
apps/api/src/common/config/env.ts          + WEB_ORIGIN
apps/api/src/modules/customers/            + GET :id/transport-types

apps/web/
  index.html  vite.config.ts  tsconfig.json  components.json  .env  .env.example
  src/
    main.tsx                 QueryClientProvider + RouterProvider
    routes.tsx               árvore de rotas
    index.css                @import "tailwindcss" + @theme (tokens)
    lib/
      utils.ts               cn() do shadcn
      format.ts              money, date, orderNumber
      errors.ts              ApiError, toApiError
      query-keys.ts          fábrica de chaves
      actor.ts               get/setActor (localStorage)
      api/
        client.ts            instance Axios + interceptors
        sales-orders.ts  customers.ts  transport-types.ts
        items.ts  scheduling.ts  audit.ts
    domain/
      status-machine.ts      NEXT_STATUS + rótulo da ação
      schedule.ts            canChangeSchedule, slot occupancy
    components/
      ui/                    shadcn
      AppLayout.tsx  ActorField.tsx  PageHeader.tsx
      StatusBadge.tsx  StatusStepper.tsx
      DataTable.tsx  EmptyState.tsx  ErrorState.tsx  TableSkeleton.tsx
    features/
      dashboard/  sales-orders/  scheduling/
      customers/  transport-types/  items/  audit/
    test/
      setup.ts  msw-server.ts  handlers.ts
```

Responsabilidade: `domain/` não importa React nem Axios. `components/` não importa Axios. `features/` não usa `fetch` direto — só as funções de `lib/api`.

---

## Task 1: Mudanças na API — CORS e leitura dos transportes autorizados

Sem esta task, o front não carrega e o formulário de criação de OV não sabe o que oferecer.

**Files:**
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/common/config/env.ts`
- Modify: `apps/api/src/modules/customers/customers.controller.ts`
- Modify: `apps/api/src/modules/customers/customers.service.ts`
- Modify: `apps/api/.env`, `apps/api/.env.example`
- Test: `apps/api/test/customers.e2e-spec.ts`

**Interfaces:**
- Consumes: `CustomersRepository.listTransportTypeIds(customerId)` (já existe).
- Produces:
  - `GET /api/customers/:id/transport-types` → `{ transportTypeIds: string[] }`, 404 se o cliente não existe.
  - `CustomersService.listTransportTypes(id: string): Promise<string[]>`
  - CORS habilitado com `X-Actor` em `allowedHeaders`.

- [ ] **Step 1: Escrever os testes e2e que faltam**

Anexar ao `describe` de `apps/api/test/customers.e2e-spec.ts`:

```ts
  it('lê os tipos de transporte autorizados de um cliente', async () => {
    const customer = await request(app.getHttpServer())
      .post('/api/customers')
      .send({ name: 'ACME', document: '12345678000199' })
      .expect(201);
    const transport = await prisma.transportType.create({
      data: { code: 'CAMINHAO', name: 'Caminhão' },
    });

    const vazio = await request(app.getHttpServer())
      .get(`/api/customers/${customer.body.id}/transport-types`)
      .expect(200);
    expect(vazio.body).toEqual({ transportTypeIds: [] });

    await request(app.getHttpServer())
      .post(`/api/customers/${customer.body.id}/transport-types`)
      .send({ transportTypeIds: [transport.id] })
      .expect(200);

    const cheio = await request(app.getHttpServer())
      .get(`/api/customers/${customer.body.id}/transport-types`)
      .expect(200);
    expect(cheio.body).toEqual({ transportTypeIds: [transport.id] });
  });

  it('retorna 404 ao ler transportes de cliente inexistente', async () => {
    await request(app.getHttpServer())
      .get('/api/customers/6f0f0b3e-0000-4000-8000-000000000000/transport-types')
      .expect(404);
  });
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm --filter @ovgs/api test:e2e -- customers`
Expected: FAIL — os dois casos novos recebem 404 e 404. O primeiro esperava 200.

- [ ] **Step 3: Adicionar o método ao service**

Em `apps/api/src/modules/customers/customers.service.ts`, dentro da classe:

```ts
  async listTransportTypes(id: string): Promise<string[]> {
    await this.findByIdOrThrow(id);
    return this.repository.listTransportTypeIds(id);
  }
```

`findByIdOrThrow` garante o 404 antes de devolver lista vazia — vazio e inexistente são coisas diferentes.

- [ ] **Step 4: Adicionar a rota ao controller**

Em `apps/api/src/modules/customers/customers.controller.ts`, dentro da classe:

```ts
  @Get(':id/transport-types')
  @ApiOperation({ summary: 'Lista os tipos de transporte autorizados para o cliente' })
  async listTransportTypes(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ transportTypeIds: string[] }> {
    const transportTypeIds = await this.service.listTransportTypes(id);
    return { transportTypeIds };
  }
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `pnpm --filter @ovgs/api test:e2e -- customers`
Expected: PASS, 7 testes.

- [ ] **Step 6: Adicionar `WEB_ORIGIN` ao schema de env**

Em `apps/api/src/common/config/env.ts`, substituir o `envSchema`:

```ts
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
});
```

Acrescentar a `apps/api/.env` e `apps/api/.env.example`:

```
WEB_ORIGIN=http://localhost:5173
```

- [ ] **Step 7: Habilitar CORS**

Em `apps/api/src/main.ts`, logo após `app.setGlobalPrefix('api')`:

```ts
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    // X-Actor é header customizado: sem declará-lo, o preflight reprova toda mutação.
    allowedHeaders: ['Content-Type', 'X-Actor'],
  });
```

- [ ] **Step 8: Verificar o preflight na prática**

```bash
pnpm --filter @ovgs/api build
(cd apps/api && node dist/src/main.js &) && sleep 8
curl -s -i -X OPTIONS http://localhost:3000/api/sales-orders \
  -H 'Origin: http://localhost:5173' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,x-actor' | head -8
pkill -f 'dist/src/main.js'
```

Expected: `HTTP/1.1 204`, com `Access-Control-Allow-Origin: http://localhost:5173` e `Access-Control-Allow-Headers` contendo `x-actor`. Se `x-actor` não aparecer, toda mutação do front vai falhar em produção de demo.

- [ ] **Step 9: Rodar a suíte completa da API**

Run: `pnpm test && pnpm test:e2e`
Expected: 47 unitários e 37 e2e passando.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(api): habilitar CORS e expor transportes autorizados do cliente"
```

---

## Task 2: Scaffold do `apps/web`

**Files:**
- Create: `apps/web/package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `components.json`, `.env`, `.env.example`
- Create: `apps/web/src/main.tsx`, `src/index.css`, `src/lib/utils.ts`
- Modify: `package.json` (raiz), `.gitignore`

**Interfaces:**
- Consumes: nada.
- Produces: pacote `@ovgs/web`; alias `@` → `src`; Tailwind v4 ativo; `cn()` disponível; `pnpm web:dev` sobe em `:5173`.

- [ ] **Step 1: Criar o projeto Vite**

```bash
pnpm create vite apps/web --template react-ts
```

- [ ] **Step 2: Instalar as dependências**

```bash
pnpm --filter @ovgs/web add react-router @tanstack/react-query axios \
  react-hook-form @hookform/resolvers zod lucide-react \
  class-variance-authority clsx tailwind-merge tw-animate-css
pnpm --filter @ovgs/web add -D tailwindcss @tailwindcss/vite @types/node \
  vitest @vitest/coverage-v8 jsdom @testing-library/react \
  @testing-library/user-event @testing-library/jest-dom msw
```

O `create vite` gera `"name": "web"`. Renomear para `@ovgs/web` no `apps/web/package.json`.

- [ ] **Step 3: Configurar o Vite**

`apps/web/vite.config.ts`:

```ts
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173 },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

Tailwind v4 **não usa `tailwind.config.js`**. O plugin do Vite basta.

Para o campo `test` tipar, a primeira linha do arquivo precisa de `/// <reference types="vitest" />`.

- [ ] **Step 4: Configurar os paths do TypeScript**

Em `apps/web/tsconfig.json`, dentro de `compilerOptions`:

```json
{
  "baseUrl": ".",
  "paths": { "@/*": ["./src/*"] }
}
```

Se o arquivo usar `references` para `tsconfig.app.json`, adicionar `baseUrl` e `paths` lá também — é ele que o editor lê.

- [ ] **Step 5: Escrever o CSS com os tokens do design system**

`apps/web/src/index.css`:

```css
@import 'tailwindcss';
@import 'tw-animate-css';

@theme {
  --font-sans: 'Fira Sans', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'Fira Code', ui-monospace, monospace;

  --color-primary: #1e40af;
  --color-on-primary: #ffffff;
  --color-secondary: #3b82f6;
  --color-accent: #d97706;
  --color-background: #f8fafc;
  --color-foreground: #1e3a8a;
  --color-muted: #e9eef6;
  --color-border: #dbeafe;
  --color-destructive: #dc2626;
  --color-ring: #1e40af;

  --color-status-criada: #64748b;
  --color-status-planejada: #3b82f6;
  --color-status-agendada: #d97706;
  --color-status-em-transporte: #0891b2;
  --color-status-entregue: #059669;
}

@layer base {
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
  }
  /* Dígitos de largura fixa: sem isso a coluna de dinheiro dança a cada re-render. */
  .tabular {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Adicionar ao `index.html`, dentro do `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Fira+Sans:wght@300;400;500;600;700&display=swap"
  rel="stylesheet"
/>
```

`display=swap` evita texto invisível durante o carregamento da fonte.

- [ ] **Step 6: Configurar o shadcn**

`apps/web/components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

`apps/web/src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

Instalar os componentes que o projeto usa:

```bash
cd apps/web && pnpm dlx shadcn@latest add button table dialog input label select \
  badge tabs card skeleton sonner tooltip alert checkbox
```

- [ ] **Step 7: Criar os arquivos de ambiente**

`apps/web/.env` e `apps/web/.env.example`, mesmo conteúdo:

```
VITE_API_URL=http://localhost:3000/api
```

- [ ] **Step 8: Adicionar os scripts na raiz**

Em `package.json` da raiz, dentro de `scripts`:

```json
"web:dev": "pnpm --filter @ovgs/web dev",
"web:build": "pnpm --filter @ovgs/web build",
"web:test": "pnpm --filter @ovgs/web test",
"dev": "pnpm run --parallel \"/^(api|web):dev$/\""
```

- [ ] **Step 9: Verificar que o front sobe e que o Tailwind está ativo**

Substituir `apps/web/src/App.tsx` por um smoke test visual:

```tsx
export default function App() {
  return (
    <main className="grid min-h-dvh place-items-center">
      <h1 className="text-2xl font-semibold text-primary">OVGS</h1>
    </main>
  );
}
```

```bash
pnpm web:build
```

Expected: build sem erro. Se `text-primary` não existir, o `@theme` não foi lido — confira se `index.css` está importado em `main.tsx`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(web): scaffold Vite com Tailwind v4, shadcn e tokens do design system"
```

---

## Task 3: Fundações — formatadores, erros, cliente HTTP, query keys, máquina de estados

Tudo o que as telas consomem, e nada que renderize. Testado sem DOM.

**Files:**
- Create: `apps/web/src/lib/format.ts`, `errors.ts`, `actor.ts`, `query-keys.ts`, `api/client.ts`
- Create: `apps/web/src/domain/status-machine.ts`
- Create: `apps/web/src/test/setup.ts`
- Test: `apps/web/src/lib/format.spec.ts`, `errors.spec.ts`, `src/domain/status-machine.spec.ts`

**Interfaces:**
- Produces:
  - `money(value: string): string` — `"259.80"` → `"R$ 259,80"`
  - `orderNumber(n: number): string` — `42` → `"OV-000042"`
  - `dateBR(iso: string): string` — `"2026-08-01"` → `"01/08/2026"`
  - `dateTimeBR(iso: string): string`
  - `class ApiError { statusCode: number; error: string; message: string }`
  - `toApiError(e: unknown): ApiError`
  - `isConflict(e: unknown): boolean`, `isNotFound(e: unknown)`, `isValidation(e: unknown)`
  - `getActor(): string`, `setActor(name: string): void`
  - `api` — instance Axios
  - `queryKeys` — fábrica de chaves
  - `SalesOrderStatus` (union), `NEXT_STATUS`, `nextStatusOf(s)`, `ACTION_LABEL`

- [ ] **Step 1: Escrever o setup dos testes**

`apps/web/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: Escrever o teste dos formatadores**

`apps/web/src/lib/format.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dateBR, money, orderNumber } from './format';

describe('money', () => {
  it('formata string decimal como moeda brasileira', () => {
    //   é o espaço não-quebrável que o Intl insere após "R$".
    expect(money('259.80')).toBe('R$ 259,80');
    expect(money('1259.80')).toBe('R$ 1.259,80');
  });

  it('formata zero', () => {
    expect(money('0.00')).toBe('R$ 0,00');
  });
});

describe('orderNumber', () => {
  it('preenche com zeros à esquerda', () => {
    expect(orderNumber(42)).toBe('OV-000042');
    expect(orderNumber(1)).toBe('OV-000001');
  });

  it('não trunca números grandes', () => {
    expect(orderNumber(1234567)).toBe('OV-1234567');
  });
});

describe('dateBR', () => {
  it('formata data ISO sem deslocar o dia por fuso', () => {
    expect(dateBR('2026-08-01')).toBe('01/08/2026');
  });
});
```

- [ ] **Step 3: Rodar e verificar que falha**

Run: `pnpm --filter @ovgs/web test -- format`
Expected: FAIL — `Cannot find module './format'`.

- [ ] **Step 4: Implementar os formatadores**

`apps/web/src/lib/format.ts`:

```ts
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

/** A API devolve Decimal como string. Number() aqui é só para exibir, nunca para calcular. */
export function money(value: string): string {
  return currency.format(Number(value));
}

export function orderNumber(value: number): string {
  return `OV-${String(value).padStart(6, '0')}`;
}

/**
 * `new Date('2026-08-01')` é interpretado como UTC meia-noite. Formatar em
 * America/Sao_Paulo mostraria 31/07. Por isso o formatador fixa timeZone UTC.
 */
export function dateBR(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`));
}

export function dateTimeBR(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `pnpm --filter @ovgs/web test -- format`
Expected: PASS, 5 testes.

- [ ] **Step 6: Escrever o teste dos erros**

`apps/web/src/lib/errors.spec.ts`:

```ts
import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { ApiError, isConflict, isNotFound, toApiError } from './errors';

function axiosErrorWithResponse(status: number, body: unknown): AxiosError {
  const error = new AxiosError('falhou');
  // @ts-expect-error resposta parcial é suficiente para o teste
  error.response = { status, data: body };
  return error;
}

describe('toApiError', () => {
  it('extrai statusCode, error e message do corpo normalizado da API', () => {
    const result = toApiError(
      axiosErrorWithResponse(409, {
        statusCode: 409,
        error: 'InvalidStatusTransition',
        message: 'Transição de CRIADA para ENTREGUE não é permitida.',
      }),
    );

    expect(result).toBeInstanceOf(ApiError);
    expect(result.statusCode).toBe(409);
    expect(result.error).toBe('InvalidStatusTransition');
    expect(result.message).toBe('Transição de CRIADA para ENTREGUE não é permitida.');
  });

  it('trata erro de rede sem resposta', () => {
    const result = toApiError(new AxiosError('Network Error'));

    expect(result.statusCode).toBe(0);
    expect(result.error).toBe('NetworkError');
    expect(result.message).toContain('conexão');
  });

  it('trata erro desconhecido sem vazar o objeto original', () => {
    const result = toApiError({ qualquer: 'coisa' });

    expect(result.statusCode).toBe(0);
    expect(result.error).toBe('UnknownError');
  });

  it('classifica por status', () => {
    expect(isConflict(toApiError(axiosErrorWithResponse(409, {})))).toBe(true);
    expect(isNotFound(toApiError(axiosErrorWithResponse(404, {})))).toBe(true);
    expect(isConflict(toApiError(axiosErrorWithResponse(400, {})))).toBe(false);
  });
});
```

- [ ] **Step 7: Rodar e verificar que falha**

Run: `pnpm --filter @ovgs/web test -- errors`
Expected: FAIL — `Cannot find module './errors'`.

- [ ] **Step 8: Implementar os erros**

`apps/web/src/lib/errors.ts`:

```ts
import { AxiosError } from 'axios';

/** Espelha o corpo do AllExceptionsFilter da API. */
interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
}

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly error: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isApiErrorBody(data: unknown): data is ApiErrorBody {
  return typeof data === 'object' && data !== null && 'statusCode' in data;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof AxiosError) {
    const { response } = error;

    if (response === undefined) {
      return new ApiError(0, 'NetworkError', 'Sem conexão com o servidor. Tente novamente.');
    }

    const data: unknown = response.data;
    if (isApiErrorBody(data)) {
      const message = Array.isArray(data.message) ? data.message.join('; ') : data.message;
      return new ApiError(response.status, data.error, message);
    }

    return new ApiError(response.status, 'UnexpectedResponse', 'Resposta inesperada do servidor.');
  }

  return new ApiError(0, 'UnknownError', 'Ocorreu um erro inesperado.');
}

export const isValidation = (e: unknown): boolean => e instanceof ApiError && e.statusCode === 400;
export const isNotFound = (e: unknown): boolean => e instanceof ApiError && e.statusCode === 404;
export const isConflict = (e: unknown): boolean => e instanceof ApiError && e.statusCode === 409;
```

- [ ] **Step 9: Rodar e verificar que passa**

Run: `pnpm --filter @ovgs/web test -- errors`
Expected: PASS, 4 testes.

- [ ] **Step 10: Escrever o teste da máquina de estados**

`apps/web/src/domain/status-machine.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ACTION_LABEL, NEXT_STATUS, SALES_ORDER_STATUSES, nextStatusOf } from './status-machine';

describe('status-machine (espelho do backend)', () => {
  it('cobre exatamente os cinco estados do fluxo', () => {
    expect(SALES_ORDER_STATUSES).toEqual([
      'CRIADA',
      'PLANEJADA',
      'AGENDADA',
      'EM_TRANSPORTE',
      'ENTREGUE',
    ]);
    expect(Object.keys(NEXT_STATUS)).toHaveLength(5);
  });

  it('encadeia o fluxo linear', () => {
    expect(nextStatusOf('CRIADA')).toBe('PLANEJADA');
    expect(nextStatusOf('PLANEJADA')).toBe('AGENDADA');
    expect(nextStatusOf('AGENDADA')).toBe('EM_TRANSPORTE');
    expect(nextStatusOf('EM_TRANSPORTE')).toBe('ENTREGUE');
  });

  it('ENTREGUE é terminal', () => {
    expect(nextStatusOf('ENTREGUE')).toBeNull();
  });

  it('tem rótulo de ação para cada transição possível', () => {
    for (const status of SALES_ORDER_STATUSES) {
      const next = nextStatusOf(status);
      if (next !== null) expect(ACTION_LABEL[next]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 11: Rodar e verificar que falha**

Run: `pnpm --filter @ovgs/web test -- status-machine`
Expected: FAIL — `Cannot find module './status-machine'`.

- [ ] **Step 12: Implementar a máquina de estados**

`apps/web/src/domain/status-machine.ts`:

```ts
/**
 * Espelho de apps/api/src/modules/sales-orders/domain/status-machine.ts.
 *
 * A duplicação é deliberada: o botão desabilitado é dica visual, não autoridade.
 * Se este mapa divergir do backend, o servidor rejeita com 409 e o usuário vê
 * a mensagem. O teste ao lado trava os cinco estados.
 */
export const SALES_ORDER_STATUSES = [
  'CRIADA',
  'PLANEJADA',
  'AGENDADA',
  'EM_TRANSPORTE',
  'ENTREGUE',
] as const;

export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export const NEXT_STATUS: Record<SalesOrderStatus, SalesOrderStatus | null> = {
  CRIADA: 'PLANEJADA',
  PLANEJADA: 'AGENDADA',
  AGENDADA: 'EM_TRANSPORTE',
  EM_TRANSPORTE: 'ENTREGUE',
  ENTREGUE: null,
};

export function nextStatusOf(status: SalesOrderStatus): SalesOrderStatus | null {
  return NEXT_STATUS[status];
}

/** Rótulo do botão que leva a cada estado. Verbo, não substantivo. */
export const ACTION_LABEL: Record<SalesOrderStatus, string> = {
  CRIADA: 'Criar OV',
  PLANEJADA: 'Planejar OV',
  AGENDADA: 'Agendar OV',
  EM_TRANSPORTE: 'Despachar',
  ENTREGUE: 'Marcar como entregue',
};
```

- [ ] **Step 13: Rodar e verificar que passa**

Run: `pnpm --filter @ovgs/web test -- status-machine`
Expected: PASS, 4 testes.

- [ ] **Step 14: Implementar o ator e o cliente HTTP**

`apps/web/src/lib/actor.ts`:

```ts
const KEY = 'ovgs.actor';

export function getActor(): string {
  return localStorage.getItem(KEY) ?? 'web';
}

export function setActor(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, trimmed);
}
```

`apps/web/src/lib/api/client.ts`:

```ts
import axios from 'axios';
import { getActor } from '@/lib/actor';
import { toApiError } from '@/lib/errors';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
});

api.interceptors.request.use((config) => {
  config.headers.set('X-Actor', getActor());
  return config;
});

// Toda a UI trabalha com ApiError. Nenhuma feature conhece AxiosError.
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toApiError(error)),
);
```

`query-keys.ts` **não** entra aqui: ele tipa as chaves com os filtros de listagem, que nascem junto da camada de API. Vem na Task 4.

- [ ] **Step 15: Rodar todos os testes do front**

Run: `pnpm --filter @ovgs/web test -- --run`
Expected: PASS, 13 testes em 3 arquivos.

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "feat(web): formatadores, normalização de erro, cliente HTTP e máquina de estados"
```

---

## Task 4: Camada de API tipada e query keys

Um módulo por recurso. Nenhuma feature chama `api.get` direto.

**Files:**
- Create: `apps/web/src/lib/api/sales-orders.ts`, `customers.ts`, `transport-types.ts`, `items.ts`, `scheduling.ts`, `audit.ts`
- Create: `apps/web/src/lib/query-keys.ts`

**Interfaces:**
- Consumes: `api` (Task 3), `SalesOrderStatus` (Task 3).
- Produces:
  - `type DeliveryWindow = 'MANHA' | 'TARDE' | 'INTEGRAL'`
  - `type ScheduleStatus = 'PENDENTE' | 'CONFIRMADO'`
  - `interface SalesOrder`, `SalesOrderItem`, `SalesOrderSchedule`
  - `interface ListSalesOrdersQuery`
  - `listSalesOrders(q)`, `getSalesOrder(id)`, `createSalesOrder(body)`, `updateSalesOrderStatus(id, status)`, `updateSalesOrderTransport(id, transportTypeId)`
  - `listCustomers()`, `getCustomer(id)`, `createCustomer(b)`, `updateCustomer(id, b)`, `listCustomerTransportTypes(id)`, `linkCustomerTransportTypes(id, ids)`
  - `listTransportTypes()`, `createTransportType(b)`, `updateTransportType(id, b)`
  - `listItems()`, `getItem(id)`, `createItem(b)`
  - `createSchedule(id, b)`, `rescheduleSchedule(id, b)`, `confirmSchedule(id)`
  - `listAudit(id)`
  - `queryKeys`

- [ ] **Step 1: Escrever os tipos e as funções de ordens de venda**

`apps/web/src/lib/api/sales-orders.ts`:

```ts
import { api } from './client';
import type { SalesOrderStatus } from '@/domain/status-machine';

export type DeliveryWindow = 'MANHA' | 'TARDE' | 'INTEGRAL';
export type ScheduleStatus = 'PENDENTE' | 'CONFIRMADO';

export interface SalesOrderItem {
  itemId: string;
  sku: string;
  name: string;
  quantity: number;
  /** Decimal serializado. Nunca usar em aritmética. */
  unitPrice: string;
}

export interface SalesOrderSchedule {
  scheduledDate: string;
  window: DeliveryWindow;
  status: ScheduleStatus;
  rescheduleCount: number;
}

export interface SalesOrder {
  id: string;
  number: string;
  customerId: string;
  transportTypeId: string;
  status: SalesOrderStatus;
  total: string;
  items: SalesOrderItem[];
  schedule: SalesOrderSchedule | null;
  createdAt: string;
}

export interface ListSalesOrdersQuery {
  status?: SalesOrderStatus;
  customerId?: string;
  transportTypeId?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  window?: DeliveryWindow;
}

export interface CreateSalesOrderBody {
  customerId: string;
  transportTypeId: string;
  items: Array<{ itemId: string; quantity: number }>;
}

export async function listSalesOrders(query: ListSalesOrdersQuery): Promise<SalesOrder[]> {
  const { data } = await api.get<SalesOrder[]>('/sales-orders', { params: query });
  return data;
}

export async function getSalesOrder(id: string): Promise<SalesOrder> {
  const { data } = await api.get<SalesOrder>(`/sales-orders/${id}`);
  return data;
}

export async function createSalesOrder(body: CreateSalesOrderBody): Promise<SalesOrder> {
  const { data } = await api.post<SalesOrder>('/sales-orders', body);
  return data;
}

export async function updateSalesOrderStatus(
  id: string,
  status: SalesOrderStatus,
): Promise<SalesOrder> {
  const { data } = await api.patch<SalesOrder>(`/sales-orders/${id}/status`, { status });
  return data;
}

export async function updateSalesOrderTransport(
  id: string,
  transportTypeId: string,
): Promise<SalesOrder> {
  const { data } = await api.patch<SalesOrder>(`/sales-orders/${id}/transport-type`, {
    transportTypeId,
  });
  return data;
}
```

Axios omite params `undefined`. Um filtro não preenchido simplesmente não vai na query string.

- [ ] **Step 2: Escrever os módulos de cadastro**

`apps/web/src/lib/api/customers.ts`:

```ts
import { api } from './client';

export interface Customer {
  id: string;
  name: string;
  document: string;
  email: string | null;
  active: boolean;
  createdAt: string;
}

export interface CreateCustomerBody {
  name: string;
  document: string;
  email?: string;
}

export type UpdateCustomerBody = Partial<{ name: string; email: string; active: boolean }>;

export async function listCustomers(): Promise<Customer[]> {
  const { data } = await api.get<Customer[]>('/customers');
  return data;
}

export async function getCustomer(id: string): Promise<Customer> {
  const { data } = await api.get<Customer>(`/customers/${id}`);
  return data;
}

export async function createCustomer(body: CreateCustomerBody): Promise<Customer> {
  const { data } = await api.post<Customer>('/customers', body);
  return data;
}

export async function updateCustomer(id: string, body: UpdateCustomerBody): Promise<Customer> {
  const { data } = await api.patch<Customer>(`/customers/${id}`, body);
  return data;
}

export async function listCustomerTransportTypes(id: string): Promise<string[]> {
  const { data } = await api.get<{ transportTypeIds: string[] }>(`/customers/${id}/transport-types`);
  return data.transportTypeIds;
}

/** Aditivo e idempotente: reenviar os mesmos ids não muda estado nem falha. */
export async function linkCustomerTransportTypes(
  id: string,
  transportTypeIds: string[],
): Promise<string[]> {
  const { data } = await api.post<{ transportTypeIds: string[] }>(
    `/customers/${id}/transport-types`,
    { transportTypeIds },
  );
  return data.transportTypeIds;
}
```

`apps/web/src/lib/api/transport-types.ts`:

```ts
import { api } from './client';

export interface TransportType {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export async function listTransportTypes(): Promise<TransportType[]> {
  const { data } = await api.get<TransportType[]>('/transport-types');
  return data;
}

export async function createTransportType(body: {
  code: string;
  name: string;
}): Promise<TransportType> {
  const { data } = await api.post<TransportType>('/transport-types', body);
  return data;
}

/** `code` é imutável na API: identificador estável já referenciado por OVs. */
export async function updateTransportType(
  id: string,
  body: Partial<{ name: string; active: boolean }>,
): Promise<TransportType> {
  const { data } = await api.patch<TransportType>(`/transport-types/${id}`, body);
  return data;
}
```

`apps/web/src/lib/api/items.ts`:

```ts
import { api } from './client';

export interface Item {
  id: string;
  sku: string;
  name: string;
  unitPrice: string;
  active: boolean;
}

export async function listItems(): Promise<Item[]> {
  const { data } = await api.get<Item[]>('/items');
  return data;
}

export async function getItem(id: string): Promise<Item> {
  const { data } = await api.get<Item>(`/items/${id}`);
  return data;
}

/** unitPrice viaja como string. Enviar number perderia precisão no caminho. */
export async function createItem(body: {
  sku: string;
  name: string;
  unitPrice: string;
}): Promise<Item> {
  const { data } = await api.post<Item>('/items', body);
  return data;
}
```

- [ ] **Step 3: Escrever os módulos de agendamento e auditoria**

`apps/web/src/lib/api/scheduling.ts`:

```ts
import { api } from './client';
import type { DeliveryWindow, ScheduleStatus } from './sales-orders';

export interface Schedule {
  id: string;
  salesOrderId: string;
  scheduledDate: string;
  window: DeliveryWindow;
  status: ScheduleStatus;
  rescheduleCount: number;
}

export interface CreateScheduleBody {
  scheduledDate: string;
  window: DeliveryWindow;
}

export async function createSchedule(
  salesOrderId: string,
  body: CreateScheduleBody,
): Promise<Schedule> {
  const { data } = await api.post<Schedule>(`/sales-orders/${salesOrderId}/schedule`, body);
  return data;
}

/** Reagendar não rebaixa CONFIRMADO para PENDENTE. */
export async function rescheduleSchedule(
  salesOrderId: string,
  body: Partial<CreateScheduleBody>,
): Promise<Schedule> {
  const { data } = await api.patch<Schedule>(`/sales-orders/${salesOrderId}/schedule`, body);
  return data;
}

export async function confirmSchedule(salesOrderId: string): Promise<Schedule> {
  const { data } = await api.post<Schedule>(`/sales-orders/${salesOrderId}/schedule/confirm`);
  return data;
}
```

`apps/web/src/lib/api/audit.ts`:

```ts
import { api } from './client';

export type AuditAction =
  | 'ORDER_CREATED'
  | 'STATUS_CHANGED'
  | 'SCHEDULE_CHANGED'
  | 'TRANSPORT_CHANGED';

export type AuditEntity = 'SALES_ORDER' | 'DELIVERY_SCHEDULE';

export interface AuditLog {
  id: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: string | null;
  createdAt: string;
}

/** Timeline já vem ordenada por createdAt desc. */
export async function listAudit(salesOrderId: string): Promise<AuditLog[]> {
  const { data } = await api.get<AuditLog[]>(`/sales-orders/${salesOrderId}/audit`);
  return data;
}
```

- [ ] **Step 4: Escrever as query keys**

`apps/web/src/lib/query-keys.ts`:

```ts
import type { ListSalesOrdersQuery } from '@/lib/api/sales-orders';

/**
 * Fonte única das chaves de cache. Invalidação por string literal espalhada
 * pelo código é como o cache de um app apodrece.
 */
export const queryKeys = {
  salesOrders: {
    all: ['sales-orders'] as const,
    list: (query: ListSalesOrdersQuery) => [...queryKeys.salesOrders.all, 'list', query] as const,
    detail: (id: string) => [...queryKeys.salesOrders.all, 'detail', id] as const,
    audit: (id: string) => [...queryKeys.salesOrders.all, 'audit', id] as const,
  },
  customers: {
    all: ['customers'] as const,
    list: () => [...queryKeys.customers.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.customers.all, 'detail', id] as const,
    transportTypes: (id: string) => [...queryKeys.customers.all, id, 'transport-types'] as const,
  },
  transportTypes: {
    all: ['transport-types'] as const,
    list: () => [...queryKeys.transportTypes.all, 'list'] as const,
  },
  items: {
    all: ['items'] as const,
    list: () => [...queryKeys.items.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.items.all, 'detail', id] as const,
  },
} as const;
```

- [ ] **Step 5: Verificar a tipagem**

Run: `pnpm --filter @ovgs/web exec tsc --noEmit`
Expected: zero erros.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): camada de API tipada e fábrica de query keys"
```

---

## Task 5: Layout, rotas e componentes de estado

**Files:**
- Create: `apps/web/src/components/AppLayout.tsx`, `ActorField.tsx`, `PageHeader.tsx`, `StatusBadge.tsx`, `EmptyState.tsx`, `ErrorState.tsx`, `TableSkeleton.tsx`
- Create: `apps/web/src/routes.tsx`
- Modify: `apps/web/src/main.tsx`
- Delete: `apps/web/src/App.tsx`, `App.css`
- Test: `apps/web/src/components/StatusBadge.spec.tsx`

**Interfaces:**
- Consumes: `SalesOrderStatus`, `getActor`/`setActor`, componentes shadcn.
- Produces:
  - `<AppLayout />` — sidebar com navegação, header com `ActorField`, `<Outlet />`
  - `<StatusBadge status={SalesOrderStatus} />` — cor + rótulo + ícone
  - `<ScheduleStatusBadge status={ScheduleStatus} />`
  - `<EmptyState title description action? />`, `<ErrorState error onRetry />`, `<TableSkeleton rows? />`
  - `<PageHeader title description? actions? />`
  - `router` — árvore de rotas

- [ ] **Step 1: Escrever o teste do StatusBadge**

O ponto a provar: a informação não depende da cor.

`apps/web/src/components/StatusBadge.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SALES_ORDER_STATUSES } from '@/domain/status-machine';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renderiza rótulo textual para todos os status, não só cor', () => {
    for (const status of SALES_ORDER_STATUSES) {
      const { unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByText(status.replace('_', ' '))).toBeInTheDocument();
      unmount();
    }
  });

  it('marca o ícone como decorativo para leitores de tela', () => {
    const { container } = render(<StatusBadge status="EM_TRANSPORTE" />);
    const icon = container.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm --filter @ovgs/web test -- StatusBadge`
Expected: FAIL — `Cannot find module './StatusBadge'`.

- [ ] **Step 3: Implementar o StatusBadge**

`apps/web/src/components/StatusBadge.tsx`:

```tsx
import {
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  PackageCheck,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type { ScheduleStatus } from '@/lib/api/sales-orders';
import type { SalesOrderStatus } from '@/domain/status-machine';
import { cn } from '@/lib/utils';

const ORDER: Record<SalesOrderStatus, { icon: LucideIcon; className: string }> = {
  CRIADA: { icon: FileText, className: 'bg-slate-100 text-slate-700 ring-slate-300' },
  PLANEJADA: { icon: ClipboardCheck, className: 'bg-blue-100 text-blue-800 ring-blue-300' },
  AGENDADA: { icon: CalendarCheck, className: 'bg-amber-100 text-amber-900 ring-amber-300' },
  EM_TRANSPORTE: { icon: Truck, className: 'bg-cyan-100 text-cyan-900 ring-cyan-300' },
  ENTREGUE: { icon: PackageCheck, className: 'bg-emerald-100 text-emerald-900 ring-emerald-300' },
};

const SCHEDULE: Record<ScheduleStatus, { icon: LucideIcon; className: string }> = {
  PENDENTE: { icon: Clock, className: 'bg-slate-100 text-slate-700 ring-slate-300' },
  CONFIRMADO: { icon: CheckCircle2, className: 'bg-emerald-100 text-emerald-900 ring-emerald-300' },
};

const base =
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset';

/** Cor + rótulo + ícone. Nunca cor sozinha: um print em preto e branco tem que informar. */
export function StatusBadge({ status }: { status: SalesOrderStatus }) {
  const { icon: Icon, className } = ORDER[status];
  return (
    <span className={cn(base, className)}>
      <Icon aria-hidden="true" className="size-3.5" />
      {status.replace('_', ' ')}
    </span>
  );
}

export function ScheduleStatusBadge({ status }: { status: ScheduleStatus }) {
  const { icon: Icon, className } = SCHEDULE[status];
  return (
    <span className={cn(base, className)}>
      <Icon aria-hidden="true" className="size-3.5" />
      {status}
    </span>
  );
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `pnpm --filter @ovgs/web test -- StatusBadge`
Expected: PASS, 2 testes.

- [ ] **Step 5: Implementar os componentes de estado**

`apps/web/src/components/EmptyState.tsx`:

```tsx
import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center gap-3 rounded-lg border border-dashed border-border p-12 text-center">
      <Inbox aria-hidden="true" className="size-8 text-slate-400" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
      {action}
    </div>
  );
}
```

`apps/web/src/components/ErrorState.tsx`:

```tsx
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toApiError } from '@/lib/errors';

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const apiError = toApiError(error);
  return (
    <div
      role="alert"
      className="grid place-items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-12 text-center"
    >
      <AlertTriangle aria-hidden="true" className="size-8 text-destructive" />
      <div>
        <p className="font-medium">Não foi possível carregar</p>
        <p className="text-sm text-slate-600">{apiError.message}</p>
      </div>
      <Button variant="outline" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}
```

`apps/web/src/components/TableSkeleton.tsx`:

```tsx
import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton, não spinner: o layout é previsível, então reservamos o espaço. */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}
```

`apps/web/src/components/PageHeader.tsx`:

```tsx
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description !== undefined && <p className="text-sm text-slate-600">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
```

- [ ] **Step 6: Implementar o campo de ator**

`apps/web/src/components/ActorField.tsx`:

```tsx
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getActor, setActor } from '@/lib/actor';

/**
 * Não há autenticação no escopo. O ator vai no header X-Actor de toda
 * requisição, o que torna a auditoria demonstrável: mude o nome, veja o log.
 */
export function ActorField() {
  const [value, setValue] = useState(getActor);

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="actor" className="whitespace-nowrap text-sm text-slate-600">
        Você é:
      </Label>
      <Input
        id="actor"
        value={value}
        className="h-9 w-40"
        onChange={(event) => {
          setValue(event.target.value);
          setActor(event.target.value);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 7: Implementar o layout**

`apps/web/src/components/AppLayout.tsx`:

```tsx
import {
  Boxes,
  CalendarClock,
  LayoutDashboard,
  Package,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { ActorField } from '@/components/ActorField';
import { cn } from '@/lib/utils';

const NAV: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/sales-orders', label: 'Ordens de Venda', icon: Package },
  { to: '/scheduling', label: 'Agendamento', icon: CalendarClock },
  { to: '/customers', label: 'Clientes', icon: Users },
  { to: '/transport-types', label: 'Transportes', icon: Truck },
  { to: '/items', label: 'Itens', icon: Boxes },
];

export function AppLayout() {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-primary focus:p-2 focus:text-on-primary"
      >
        Pular para o conteúdo
      </a>

      <aside className="border-b border-border bg-white md:border-b-0 md:border-r">
        <div className="p-4 text-lg font-semibold text-primary">OVGS</div>
        <nav aria-label="Navegação principal" className="flex gap-1 overflow-x-auto p-2 md:block">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  isActive ? 'bg-primary text-on-primary' : 'text-slate-700 hover:bg-muted',
                )
              }
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-col">
        <header className="flex justify-end border-b border-border bg-white px-6 py-3">
          <ActorField />
        </header>
        <main id="conteudo" className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

`NavLink` marca a rota ativa via `isActive` — regra `nav-state-active`. O link "Pular para o conteúdo" atende `skip-links`.

- [ ] **Step 8: Escrever as rotas e o bootstrap**

As páginas ainda não existem. Criar cada uma como um stub de uma linha em `src/features/<feature>/<Page>.tsx`, que as tasks seguintes substituem:

```tsx
export function SalesOrdersListPage() {
  return <p>Em construção</p>;
}
```

Stubs necessários: `dashboard/DashboardPage`, `sales-orders/SalesOrdersListPage`, `sales-orders/CreateSalesOrderPage`, `sales-orders/SalesOrderDetailPage`, `scheduling/SchedulingPage`, `customers/CustomersPage`, `transport-types/TransportTypesPage`, `items/ItemsPage`.

`apps/web/src/routes.tsx`:

```tsx
import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/components/AppLayout';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { CreateSalesOrderPage } from '@/features/sales-orders/CreateSalesOrderPage';
import { SalesOrderDetailPage } from '@/features/sales-orders/SalesOrderDetailPage';
import { SalesOrdersListPage } from '@/features/sales-orders/SalesOrdersListPage';
import { SchedulingPage } from '@/features/scheduling/SchedulingPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { TransportTypesPage } from '@/features/transport-types/TransportTypesPage';
import { ItemsPage } from '@/features/items/ItemsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppLayout,
    children: [
      { index: true, Component: DashboardPage },
      {
        path: 'sales-orders',
        children: [
          { index: true, Component: SalesOrdersListPage },
          { path: 'new', Component: CreateSalesOrderPage },
          { path: ':id', Component: SalesOrderDetailPage },
        ],
      },
      { path: 'scheduling', Component: SchedulingPage },
      { path: 'customers', Component: CustomersPage },
      { path: 'transport-types', Component: TransportTypesPage },
      { path: 'items', Component: ItemsPage },
    ],
  },
]);
```

`apps/web/src/main.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { Toaster } from '@/components/ui/sonner';
import { router } from '@/routes';
import './index.css';

// RouterProvider vem de 'react-router/dom', não de 'react-router'.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
);
```

Remover `src/App.tsx` e `src/App.css`.

- [ ] **Step 9: Verificar o build e a navegação**

```bash
pnpm --filter @ovgs/web exec tsc --noEmit
pnpm web:build
```

Expected: zero erros. Se `RouterProvider` não existir, o import veio de `react-router` em vez de `react-router/dom`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(web): layout, rotas e componentes de estado"
```

---

## Task 6: Lista de OVs com filtros na URL

**Files:**
- Create: `apps/web/src/features/sales-orders/useSalesOrderFilters.ts`
- Create: `apps/web/src/features/sales-orders/SalesOrderFilters.tsx`
- Create: `apps/web/src/features/sales-orders/queries.ts`
- Rewrite: `apps/web/src/features/sales-orders/SalesOrdersListPage.tsx`
- Test: `apps/web/src/features/sales-orders/useSalesOrderFilters.spec.ts`
- Create: `apps/web/src/test/msw-server.ts`, `apps/web/src/test/handlers.ts`
- Modify: `apps/web/src/test/setup.ts`

**Interfaces:**
- Consumes: `listSalesOrders`, `queryKeys`, `StatusBadge`, `money`, `dateBR`, `TableSkeleton`, `EmptyState`, `ErrorState`.
- Produces:
  - `useSalesOrderFilters(): { filters: ListSalesOrdersQuery; setFilter(k, v): void; clear(): void }`
  - `useSalesOrdersQuery(filters)`, `useSalesOrderQuery(id)`
  - `<SalesOrderFilters />`

- [ ] **Step 1: Configurar o MSW**

`apps/web/src/test/msw-server.ts`:

```ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

`apps/web/src/test/handlers.ts`:

```ts
import { http, HttpResponse } from 'msw';

const BASE = 'http://localhost:3000/api';

export const salesOrderFixture = {
  id: '11111111-1111-4111-8111-111111111111',
  number: 'OV-000001',
  customerId: '22222222-2222-4222-8222-222222222222',
  transportTypeId: '33333333-3333-4333-8333-333333333333',
  status: 'CRIADA' as const,
  total: '259.80',
  items: [
    { itemId: '44444444-4444-4444-8444-444444444444', sku: 'SKU-001', name: 'Palete', quantity: 2, unitPrice: '129.90' },
  ],
  schedule: null,
  createdAt: '2026-07-09T12:00:00.000Z',
};

export const handlers = [
  http.get(`${BASE}/sales-orders`, () => HttpResponse.json([salesOrderFixture])),
  http.get(`${BASE}/sales-orders/:id`, () => HttpResponse.json(salesOrderFixture)),
  http.get(`${BASE}/customers`, () => HttpResponse.json([])),
  http.get(`${BASE}/transport-types`, () => HttpResponse.json([])),
  http.get(`${BASE}/items`, () => HttpResponse.json([])),
];
```

`apps/web/src/test/setup.ts` passa a ser:

```ts
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw-server';

// MSW é ferramenta de teste, nunca de desenvolvimento: o app fala com a API real.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 2: Escrever o teste dos filtros na URL**

`apps/web/src/features/sales-orders/useSalesOrderFilters.spec.ts`:

```tsx
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useSalesOrderFilters } from './useSalesOrderFilters';

function wrapperFor(initialEntry: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const router = createMemoryRouter([{ path: '/', element: children }], {
      initialEntries: [initialEntry],
    });
    return <RouterProvider router={router} />;
  };
}

describe('useSalesOrderFilters', () => {
  it('lê os filtros da query string', () => {
    const { result } = renderHook(() => useSalesOrderFilters(), {
      wrapper: wrapperFor('/?status=CRIADA&window=MANHA'),
    });

    expect(result.current.filters).toEqual({ status: 'CRIADA', window: 'MANHA' });
  });

  it('ignora valor de enum inválido vindo da URL', () => {
    const { result } = renderHook(() => useSalesOrderFilters(), {
      wrapper: wrapperFor('/?status=CANCELADA'),
    });

    expect(result.current.filters.status).toBeUndefined();
  });

  it('escreve o filtro na URL, tornando-o compartilhável', () => {
    const { result } = renderHook(() => useSalesOrderFilters(), { wrapper: wrapperFor('/') });

    act(() => result.current.setFilter('status', 'PLANEJADA'));

    expect(result.current.filters.status).toBe('PLANEJADA');
  });

  it('remove o filtro quando o valor é limpo', () => {
    const { result } = renderHook(() => useSalesOrderFilters(), {
      wrapper: wrapperFor('/?status=CRIADA'),
    });

    act(() => result.current.setFilter('status', undefined));

    expect(result.current.filters.status).toBeUndefined();
  });
});
```

- [ ] **Step 3: Rodar e verificar que falha**

Run: `pnpm --filter @ovgs/web test -- useSalesOrderFilters`
Expected: FAIL — `Cannot find module './useSalesOrderFilters'`.

- [ ] **Step 4: Implementar o hook de filtros**

`apps/web/src/features/sales-orders/useSalesOrderFilters.ts`:

```ts
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { SALES_ORDER_STATUSES, type SalesOrderStatus } from '@/domain/status-machine';
import type { DeliveryWindow, ListSalesOrdersQuery } from '@/lib/api/sales-orders';

const WINDOWS: readonly DeliveryWindow[] = ['MANHA', 'TARDE', 'INTEGRAL'];

type FilterKey = keyof ListSalesOrdersQuery;

function asStatus(value: string | null): SalesOrderStatus | undefined {
  return SALES_ORDER_STATUSES.includes(value as SalesOrderStatus)
    ? (value as SalesOrderStatus)
    : undefined;
}

function asWindow(value: string | null): DeliveryWindow | undefined {
  return WINDOWS.includes(value as DeliveryWindow) ? (value as DeliveryWindow) : undefined;
}

function asText(value: string | null): string | undefined {
  return value !== null && value.length > 0 ? value : undefined;
}

/**
 * A URL é a fonte de verdade dos filtros. Um filtro em useState não sobrevive
 * a um refresh nem pode ser compartilhado por link.
 */
export function useSalesOrderFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<ListSalesOrdersQuery>(() => {
    const result: ListSalesOrdersQuery = {};
    const status = asStatus(params.get('status'));
    const window = asWindow(params.get('window'));
    const customerId = asText(params.get('customerId'));
    const transportTypeId = asText(params.get('transportTypeId'));
    const scheduledFrom = asText(params.get('scheduledFrom'));
    const scheduledTo = asText(params.get('scheduledTo'));

    if (status !== undefined) result.status = status;
    if (window !== undefined) result.window = window;
    if (customerId !== undefined) result.customerId = customerId;
    if (transportTypeId !== undefined) result.transportTypeId = transportTypeId;
    if (scheduledFrom !== undefined) result.scheduledFrom = scheduledFrom;
    if (scheduledTo !== undefined) result.scheduledTo = scheduledTo;
    return result;
  }, [params]);

  const setFilter = useCallback(
    (key: FilterKey, value: string | undefined) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (value === undefined || value.length === 0) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const clear = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  return { filters, setFilter, clear };
}
```

Valor de enum inválido na URL é **ignorado**, não repassado à API. Um `?status=CANCELADA` colado à mão devolveria `400` do servidor; ignorar é mais gentil e não esconde bug real.

- [ ] **Step 5: Rodar e verificar que passa**

Run: `pnpm --filter @ovgs/web test -- useSalesOrderFilters`
Expected: PASS, 4 testes.

- [ ] **Step 6: Escrever os hooks de query**

`apps/web/src/features/sales-orders/queries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSalesOrder,
  getSalesOrder,
  listSalesOrders,
  updateSalesOrderStatus,
  updateSalesOrderTransport,
  type CreateSalesOrderBody,
  type ListSalesOrdersQuery,
} from '@/lib/api/sales-orders';
import type { SalesOrderStatus } from '@/domain/status-machine';
import { queryKeys } from '@/lib/query-keys';

export function useSalesOrdersQuery(filters: ListSalesOrdersQuery) {
  return useQuery({
    queryKey: queryKeys.salesOrders.list(filters),
    queryFn: () => listSalesOrders(filters),
  });
}

export function useSalesOrderQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.salesOrders.detail(id),
    queryFn: () => getSalesOrder(id),
  });
}

export function useCreateSalesOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSalesOrderBody) => createSalesOrder(body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.salesOrders.all }),
  });
}

export function useUpdateStatus(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (status: SalesOrderStatus) => updateSalesOrderStatus(id, status),
    // A mutação também gerou um AuditLog: a timeline precisa recarregar.
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.salesOrders.all }),
  });
}

export function useUpdateTransport(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (transportTypeId: string) => updateSalesOrderTransport(id, transportTypeId),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.salesOrders.all }),
  });
}
```

Invalidar `salesOrders.all` derruba lista, detalhe, auditoria e dashboard de uma vez. Preciso o suficiente; invalidação cirúrgica aqui economizaria uma request e custaria um bug de cache velho.

- [ ] **Step 7: Escrever a barra de filtros**

`apps/web/src/features/sales-orders/SalesOrderFilters.tsx`:

```tsx
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SALES_ORDER_STATUSES } from '@/domain/status-machine';
import { useCustomersQuery } from '@/features/customers/queries';
import { useTransportTypesQuery } from '@/features/transport-types/queries';
import { useSalesOrderFilters } from './useSalesOrderFilters';

const ALL = '__all__';

export function SalesOrderFilters() {
  const { filters, setFilter, clear } = useSalesOrderFilters();
  const customers = useCustomersQuery();
  const transportTypes = useTransportTypesQuery();

  return (
    <section aria-label="Filtros" className="mb-4 grid gap-3 rounded-lg border border-border bg-white p-4 md:grid-cols-3 lg:grid-cols-6">
      <div>
        <Label htmlFor="f-status">Status</Label>
        <Select
          value={filters.status ?? ALL}
          onValueChange={(v) => setFilter('status', v === ALL ? undefined : v)}
        >
          <SelectTrigger id="f-status"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {SALES_ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="f-customer">Cliente</Label>
        <Select
          value={filters.customerId ?? ALL}
          onValueChange={(v) => setFilter('customerId', v === ALL ? undefined : v)}
        >
          <SelectTrigger id="f-customer"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {(customers.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="f-transport">Transporte</Label>
        <Select
          value={filters.transportTypeId ?? ALL}
          onValueChange={(v) => setFilter('transportTypeId', v === ALL ? undefined : v)}
        >
          <SelectTrigger id="f-transport"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {(transportTypes.data ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="f-from">Entrega de</Label>
        <Input
          id="f-from"
          type="date"
          value={filters.scheduledFrom ?? ''}
          onChange={(e) => setFilter('scheduledFrom', e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="f-to">Entrega até</Label>
        <Input
          id="f-to"
          type="date"
          value={filters.scheduledTo ?? ''}
          onChange={(e) => setFilter('scheduledTo', e.target.value)}
        />
      </div>

      <div className="flex items-end">
        <Button variant="ghost" onClick={clear} className="w-full">
          <X aria-hidden="true" className="size-4" /> Limpar
        </Button>
      </div>
    </section>
  );
}
```

Filtrar por data implica INNER JOIN no agendamento: OVs sem agendamento somem. Documentar isso com um `<p className="text-xs text-slate-500">` abaixo dos campos de data.

- [ ] **Step 8: Escrever a página de listagem**

`apps/web/src/features/sales-orders/SalesOrdersListPage.tsx`:

```tsx
import { Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { dateBR, money } from '@/lib/format';
import { SalesOrderFilters } from './SalesOrderFilters';
import { useSalesOrdersQuery } from './queries';
import { useSalesOrderFilters } from './useSalesOrderFilters';

export function SalesOrdersListPage() {
  const { filters } = useSalesOrderFilters();
  const query = useSalesOrdersQuery(filters);
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        title="Ordens de Venda"
        description="Monitoramento operacional"
        actions={
          <Button asChild>
            <Link to="/sales-orders/new">
              <Plus aria-hidden="true" className="size-4" /> Nova OV
            </Link>
          </Button>
        }
      />

      <SalesOrderFilters />

      {query.isPending && <TableSkeleton />}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}

      {query.isSuccess && query.data.length === 0 && (
        <EmptyState
          title="Nenhuma ordem de venda"
          description="Ajuste os filtros ou crie a primeira OV."
          action={
            <Button asChild>
              <Link to="/sales-orders/new">Criar OV</Link>
            </Button>
          }
        />
      )}

      {query.isSuccess && query.data.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead>Itens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((order) => (
                <TableRow
                  key={order.id}
                  tabIndex={0}
                  className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => void navigate(`/sales-orders/${order.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void navigate(`/sales-orders/${order.id}`);
                  }}
                >
                  <TableCell className="tabular">{order.number}</TableCell>
                  <TableCell><StatusBadge status={order.status} /></TableCell>
                  <TableCell className="tabular text-right">{money(order.total)}</TableCell>
                  <TableCell className="tabular">
                    {order.schedule === null ? '—' : dateBR(order.schedule.scheduledDate)}
                  </TableCell>
                  <TableCell>{order.items.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
```

A linha é clicável **e** focável com `Enter`: `cursor-pointer` sozinho não atende `keyboard-nav`.

- [ ] **Step 9: Criar os hooks de query de clientes e transportes**

Os filtros dependem deles. Criar agora, mesmo que as páginas de cadastro venham depois.

`apps/web/src/features/customers/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { listCustomers, listCustomerTransportTypes } from '@/lib/api/customers';
import { queryKeys } from '@/lib/query-keys';

export function useCustomersQuery() {
  return useQuery({ queryKey: queryKeys.customers.list(), queryFn: listCustomers });
}

export function useCustomerTransportTypesQuery(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.transportTypes(customerId ?? ''),
    queryFn: () => listCustomerTransportTypes(customerId as string),
    enabled: customerId !== undefined && customerId.length > 0,
  });
}
```

`apps/web/src/features/transport-types/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { listTransportTypes } from '@/lib/api/transport-types';
import { queryKeys } from '@/lib/query-keys';

export function useTransportTypesQuery() {
  return useQuery({ queryKey: queryKeys.transportTypes.list(), queryFn: listTransportTypes });
}
```

- [ ] **Step 10: Verificar tipagem e testes**

```bash
pnpm --filter @ovgs/web exec tsc --noEmit
pnpm --filter @ovgs/web test -- --run
```

Expected: zero erros de tipo; 19 testes passando.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(web): listagem de OVs com filtros de monitoramento na URL"
```

---

## Task 7: Criar Ordem de Venda

**Files:**
- Create: `apps/web/src/features/sales-orders/createSalesOrderSchema.ts`
- Create: `apps/web/src/features/items/queries.ts`
- Rewrite: `apps/web/src/features/sales-orders/CreateSalesOrderPage.tsx`
- Test: `apps/web/src/features/sales-orders/createSalesOrderSchema.spec.ts`
- Test: `apps/web/src/features/sales-orders/CreateSalesOrderPage.spec.tsx`

**Interfaces:**
- Consumes: `useCustomersQuery`, `useCustomerTransportTypesQuery`, `useTransportTypesQuery`, `useCreateSalesOrder`, `useItemsQuery`.
- Produces:
  - `createSalesOrderSchema` (Zod) e `CreateSalesOrderForm` (tipo inferido)
  - `estimateTotalCents(lines): number` — preview em centavos, aritmética inteira
  - `useItemsQuery()`

- [ ] **Step 1: Escrever o teste do schema e do preview de total**

`apps/web/src/features/sales-orders/createSalesOrderSchema.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createSalesOrderSchema, estimateTotalCents } from './createSalesOrderSchema';

const uuid = '11111111-1111-4111-8111-111111111111';
const outro = '22222222-2222-4222-8222-222222222222';

describe('createSalesOrderSchema', () => {
  it('exige ao menos um item', () => {
    const result = createSalesOrderSchema.safeParse({
      customerId: uuid,
      transportTypeId: outro,
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejeita quantidade menor que 1', () => {
    const result = createSalesOrderSchema.safeParse({
      customerId: uuid,
      transportTypeId: outro,
      items: [{ itemId: uuid, quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejeita item repetido', () => {
    const result = createSalesOrderSchema.safeParse({
      customerId: uuid,
      transportTypeId: outro,
      items: [
        { itemId: uuid, quantity: 1 },
        { itemId: uuid, quantity: 2 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('aceita OV válida', () => {
    const result = createSalesOrderSchema.safeParse({
      customerId: uuid,
      transportTypeId: outro,
      items: [{ itemId: uuid, quantity: 2 }],
    });
    expect(result.success).toBe(true);
  });
});

describe('estimateTotalCents', () => {
  it('soma em centavos, sem ponto flutuante', () => {
    const cents = estimateTotalCents([
      { quantity: 3, unitPrice: '0.10' },
      { quantity: 2, unitPrice: '129.90' },
    ]);
    // 30 + 25980 = 26010 centavos. Em float, 0.1*3 daria 0.30000000000000004.
    expect(cents).toBe(26_010);
  });

  it('retorna zero sem linhas', () => {
    expect(estimateTotalCents([])).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm --filter @ovgs/web test -- createSalesOrderSchema`
Expected: FAIL — `Cannot find module './createSalesOrderSchema'`.

- [ ] **Step 3: Implementar o schema e o preview**

`apps/web/src/features/sales-orders/createSalesOrderSchema.ts`:

```ts
import { z } from 'zod';

export const createSalesOrderSchema = z.object({
  customerId: z.string().uuid('Selecione um cliente.'),
  transportTypeId: z.string().uuid('Selecione um tipo de transporte.'),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid('Selecione um item.'),
        quantity: z.coerce.number().int().min(1, 'Quantidade mínima é 1.'),
      }),
    )
    .min(1, 'A ordem de venda precisa de ao menos um item.')
    .superRefine((items, ctx) => {
      const ids = items.map((line) => line.itemId);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: 'custom', message: 'A OV não pode repetir o mesmo item.' });
      }
    }),
});

export type CreateSalesOrderForm = z.infer<typeof createSalesOrderSchema>;

/**
 * Preview do total, em centavos. Aritmética inteira porque o valor é dinheiro.
 * O servidor é quem calcula o total real; isto é estimativa exibida ao usuário.
 */
export function estimateTotalCents(
  lines: ReadonlyArray<{ quantity: number; unitPrice: string }>,
): number {
  return lines.reduce((total, line) => {
    const [reais, centavos = '0'] = line.unitPrice.split('.');
    const priceCents = Number(reais) * 100 + Number(centavos.padEnd(2, '0'));
    return total + priceCents * line.quantity;
  }, 0);
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `pnpm --filter @ovgs/web test -- createSalesOrderSchema`
Expected: PASS, 6 testes.

- [ ] **Step 5: Escrever o hook de itens**

`apps/web/src/features/items/queries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createItem, listItems } from '@/lib/api/items';
import { queryKeys } from '@/lib/query-keys';

export function useItemsQuery() {
  return useQuery({ queryKey: queryKeys.items.list(), queryFn: listItems });
}

export function useCreateItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createItem,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.items.all }),
  });
}
```

- [ ] **Step 6: Escrever o teste de comportamento da página**

O que precisa ser provado: o transporte fica bloqueado até haver cliente, e o submit não envia `total`.

`apps/web/src/features/sales-orders/CreateSalesOrderPage.spec.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { server } from '@/test/msw-server';
import { CreateSalesOrderPage } from './CreateSalesOrderPage';

const CUSTOMER = '22222222-2222-4222-8222-222222222222';
const TRANSPORT = '33333333-3333-4333-8333-333333333333';
const ITEM = '44444444-4444-4444-8444-444444444444';
const BASE = 'http://localhost:3000/api';

function renderPage() {
  server.use(
    http.get(`${BASE}/customers`, () =>
      HttpResponse.json([
        { id: CUSTOMER, name: 'ACME', document: '1', email: null, active: true, createdAt: '' },
      ]),
    ),
    http.get(`${BASE}/transport-types`, () =>
      HttpResponse.json([{ id: TRANSPORT, code: 'CAMINHAO', name: 'Caminhão', active: true }]),
    ),
    http.get(`${BASE}/customers/${CUSTOMER}/transport-types`, () =>
      HttpResponse.json({ transportTypeIds: [TRANSPORT] }),
    ),
    http.get(`${BASE}/items`, () =>
      HttpResponse.json([
        { id: ITEM, sku: 'SKU-001', name: 'Palete', unitPrice: '129.90', active: true },
      ]),
    ),
  );

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/', element: <CreateSalesOrderPage /> }]);
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('CreateSalesOrderPage', () => {
  it('mantém o transporte desabilitado até um cliente ser escolhido, com explicação', async () => {
    renderPage();

    expect(await screen.findByLabelText('Tipo de transporte')).toBeDisabled();
    expect(screen.getByText(/selecione um cliente/i)).toBeInTheDocument();
  });

  it('envia a OV sem o campo total', async () => {
    const captured = vi.fn();
    server.use(
      http.post(`${BASE}/sales-orders`, async ({ request }) => {
        captured(await request.json());
        return HttpResponse.json({ id: 'novo' }, { status: 201 });
      }),
    );
    renderPage();
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText('Cliente'), CUSTOMER);
    await waitFor(() => expect(screen.getByLabelText('Tipo de transporte')).toBeEnabled());
    await user.selectOptions(screen.getByLabelText('Tipo de transporte'), TRANSPORT);
    await user.selectOptions(screen.getByLabelText('Item 1'), ITEM);
    await user.clear(screen.getByLabelText('Quantidade 1'));
    await user.type(screen.getByLabelText('Quantidade 1'), '2');
    await user.click(screen.getByRole('button', { name: /criar ordem de venda/i }));

    await waitFor(() => expect(captured).toHaveBeenCalled());
    const body = captured.mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty('total');
    expect(body.items).toEqual([{ itemId: ITEM, quantity: 2 }]);
  });
});
```

O teste usa `selectOptions`, o que exige `<select>` nativo. **Decisão:** este formulário usa `<select>` nativo com `<Label htmlFor>`, não o `Select` do Radix. Motivo real: teclado e leitor de tela funcionam sem trabalho extra, e a regra `system-controls` prefere controle nativo quando o branding não exige o contrário. O `Select` do shadcn fica para os filtros, onde não há submit.

- [ ] **Step 7: Rodar e verificar que falha**

Run: `pnpm --filter @ovgs/web test -- CreateSalesOrderPage`
Expected: FAIL — a página ainda é o stub "Em construção".

- [ ] **Step 8: Implementar a página**

`apps/web/src/features/sales-orders/CreateSalesOrderPage.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCustomersQuery, useCustomerTransportTypesQuery } from '@/features/customers/queries';
import { useItemsQuery } from '@/features/items/queries';
import { useTransportTypesQuery } from '@/features/transport-types/queries';
import { toApiError } from '@/lib/errors';
import { money } from '@/lib/format';
import {
  createSalesOrderSchema,
  estimateTotalCents,
  type CreateSalesOrderForm,
} from './createSalesOrderSchema';
import { useCreateSalesOrder } from './queries';

const selectClass =
  'h-10 w-full rounded-md border border-border bg-white px-3 text-sm disabled:opacity-50';

export function CreateSalesOrderPage() {
  const navigate = useNavigate();
  const customers = useCustomersQuery();
  const transportTypes = useTransportTypesQuery();
  const items = useItemsQuery();
  const createOrder = useCreateSalesOrder();

  const form = useForm<CreateSalesOrderForm>({
    resolver: zodResolver(createSalesOrderSchema),
    defaultValues: { customerId: '', transportTypeId: '', items: [{ itemId: '', quantity: 1 }] },
  });
  const lines = useFieldArray({ control: form.control, name: 'items' });

  const customerId = form.watch('customerId');
  const authorized = useCustomerTransportTypesQuery(customerId === '' ? undefined : customerId);

  const allowedTransports = (transportTypes.data ?? []).filter(
    (t) => t.active && (authorized.data ?? []).includes(t.id),
  );

  const watchedItems = form.watch('items');
  const priceById = new Map((items.data ?? []).map((i) => [i.id, i.unitPrice]));
  const totalCents = estimateTotalCents(
    watchedItems
      .filter((line) => priceById.has(line.itemId))
      .map((line) => ({ quantity: Number(line.quantity), unitPrice: priceById.get(line.itemId)! })),
  );

  async function onSubmit(values: CreateSalesOrderForm): Promise<void> {
    try {
      // `total` nunca é enviado: o servidor calcula.
      const created = await createOrder.mutateAsync(values);
      toast.success('Ordem de venda criada.');
      void navigate(`/sales-orders/${created.id}`);
    } catch (error) {
      const apiError = toApiError(error);
      // 400 é campo; 409 é estado. Mensagem da API já vem em português e específica.
      if (apiError.statusCode === 409) form.setError('transportTypeId', { message: apiError.message });
      else toast.error(apiError.message);
    }
  }

  return (
    <>
      <PageHeader title="Nova Ordem de Venda" />

      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="customerId">Cliente</Label>
            <select id="customerId" className={selectClass} {...form.register('customerId')}>
              <option value="">Selecione…</option>
              {(customers.data ?? []).filter((c) => c.active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {form.formState.errors.customerId && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {form.formState.errors.customerId.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="transportTypeId">Tipo de transporte</Label>
            <select
              id="transportTypeId"
              className={selectClass}
              disabled={customerId === '' || authorized.isPending}
              {...form.register('transportTypeId')}
            >
              <option value="">Selecione…</option>
              {allowedTransports.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-600">
              {customerId === ''
                ? 'Selecione um cliente para ver os transportes autorizados.'
                : allowedTransports.length === 0
                  ? 'Este cliente não tem transportes autorizados. Cadastre-os em Clientes.'
                  : 'Apenas transportes autorizados para este cliente.'}
            </p>
            {form.formState.errors.transportTypeId && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {form.formState.errors.transportTypeId.message}
              </p>
            )}
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Itens</legend>

          {lines.fields.map((field, index) => (
            <div key={field.id} className="flex items-end gap-3">
              <div className="flex-1">
                <Label htmlFor={`item-${index}`}>{`Item ${index + 1}`}</Label>
                <select
                  id={`item-${index}`}
                  className={selectClass}
                  {...form.register(`items.${index}.itemId`)}
                >
                  <option value="">Selecione…</option>
                  {(items.data ?? []).filter((i) => i.active).map((i) => (
                    <option key={i.id} value={i.id}>{`${i.sku} — ${i.name}`}</option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <Label htmlFor={`qty-${index}`}>{`Quantidade ${index + 1}`}</Label>
                <Input
                  id={`qty-${index}`}
                  type="number"
                  min={1}
                  {...form.register(`items.${index}.quantity`)}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remover item ${index + 1}`}
                disabled={lines.fields.length === 1}
                onClick={() => lines.remove(index)}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            </div>
          ))}

          <Button type="button" variant="outline" onClick={() => lines.append({ itemId: '', quantity: 1 })}>
            <Plus aria-hidden="true" className="size-4" /> Adicionar item
          </Button>

          {form.formState.errors.items?.message !== undefined && (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.items.message}
            </p>
          )}
        </fieldset>

        <div className="rounded-lg border border-border bg-muted p-4">
          <p className="text-sm text-slate-600">Total estimado</p>
          <p className="tabular text-2xl font-semibold">{money((totalCents / 100).toFixed(2))}</p>
          <p className="text-xs text-slate-500">
            O valor final é calculado pelo servidor no momento da criação.
          </p>
        </div>

        <Button type="submit" disabled={createOrder.isPending}>
          {createOrder.isPending ? 'Criando…' : 'Criar ordem de venda'}
        </Button>
      </form>
    </>
  );
}
```

- [ ] **Step 9: Rodar e verificar que passa**

Run: `pnpm --filter @ovgs/web test -- CreateSalesOrderPage`
Expected: PASS, 2 testes.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(web): criação de OV com transportes autorizados e preview de total"
```

---

## Task 8: Detalhe da OV — stepper, abas e transição de status

**Files:**
- Create: `apps/web/src/components/StatusStepper.tsx`
- Create: `apps/web/src/features/sales-orders/NextStatusButton.tsx`
- Create: `apps/web/src/features/sales-orders/SalesOrderItemsTab.tsx`
- Rewrite: `apps/web/src/features/sales-orders/SalesOrderDetailPage.tsx`
- Test: `apps/web/src/components/StatusStepper.spec.tsx`
- Test: `apps/web/src/features/sales-orders/NextStatusButton.spec.tsx`

**Interfaces:**
- Consumes: `useSalesOrderQuery`, `useUpdateStatus`, `nextStatusOf`, `ACTION_LABEL`, `StatusBadge`.
- Produces:
  - `<StatusStepper current={SalesOrderStatus} />`
  - `<NextStatusButton order={SalesOrder} />`
  - `<SalesOrderItemsTab items={SalesOrderItem[]} total={string} />`

- [ ] **Step 1: Escrever o teste do stepper**

`apps/web/src/components/StatusStepper.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusStepper } from './StatusStepper';

describe('StatusStepper', () => {
  it('marca o passo atual com aria-current', () => {
    render(<StatusStepper current="AGENDADA" />);
    expect(screen.getByText('AGENDADA').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('marca os passos anteriores como concluídos, e os futuros não', () => {
    render(<StatusStepper current="AGENDADA" />);
    expect(screen.getByText('CRIADA').closest('li')).toHaveAttribute('data-state', 'done');
    expect(screen.getByText('ENTREGUE').closest('li')).toHaveAttribute('data-state', 'todo');
  });

  it('lista os cinco estados', () => {
    render(<StatusStepper current="CRIADA" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm --filter @ovgs/web test -- StatusStepper`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar o stepper**

`apps/web/src/components/StatusStepper.tsx`:

```tsx
import { Check } from 'lucide-react';
import { SALES_ORDER_STATUSES, type SalesOrderStatus } from '@/domain/status-machine';
import { cn } from '@/lib/utils';

/** Torna o fluxo linear visível de relance. Estado não é só um badge: é uma posição. */
export function StatusStepper({ current }: { current: SalesOrderStatus }) {
  const currentIndex = SALES_ORDER_STATUSES.indexOf(current);

  return (
    <ol aria-label="Progresso da ordem de venda" className="flex flex-wrap gap-2">
      {SALES_ORDER_STATUSES.map((status, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
        return (
          <li
            key={status}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ring-1 ring-inset',
              state === 'done' && 'bg-emerald-50 text-emerald-800 ring-emerald-200',
              state === 'current' && 'bg-primary text-on-primary ring-primary',
              state === 'todo' && 'bg-white text-slate-500 ring-border',
            )}
          >
            {state === 'done' && <Check aria-hidden="true" className="size-3.5" />}
            {status.replace('_', ' ')}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `pnpm --filter @ovgs/web test -- StatusStepper`
Expected: PASS, 3 testes.

- [ ] **Step 5: Escrever o teste do botão de próxima ação**

O comportamento que importa: desabilitar **com explicação visível**, nunca em silêncio.

`apps/web/src/features/sales-orders/NextStatusButton.spec.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SalesOrder } from '@/lib/api/sales-orders';
import { salesOrderFixture } from '@/test/handlers';
import { NextStatusButton } from './NextStatusButton';

function renderButton(order: SalesOrder) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextStatusButton order={order} />
    </QueryClientProvider>,
  );
}

describe('NextStatusButton', () => {
  it('mostra apenas a próxima transição válida', () => {
    renderButton({ ...salesOrderFixture, status: 'CRIADA' });
    expect(screen.getByRole('button', { name: 'Planejar OV' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Despachar' })).not.toBeInTheDocument();
  });

  it('desabilita AGENDADA sem agendamento e explica por quê', () => {
    renderButton({ ...salesOrderFixture, status: 'PLANEJADA', schedule: null });
    expect(screen.getByRole('button', { name: 'Agendar OV' })).toBeDisabled();
    expect(screen.getByText(/confirme o agendamento/i)).toBeInTheDocument();
  });

  it('desabilita AGENDADA com agendamento apenas PENDENTE', () => {
    renderButton({
      ...salesOrderFixture,
      status: 'PLANEJADA',
      schedule: { scheduledDate: '2099-08-01', window: 'MANHA', status: 'PENDENTE', rescheduleCount: 0 },
    });
    expect(screen.getByRole('button', { name: 'Agendar OV' })).toBeDisabled();
  });

  it('habilita AGENDADA com agendamento CONFIRMADO', () => {
    renderButton({
      ...salesOrderFixture,
      status: 'PLANEJADA',
      schedule: { scheduledDate: '2099-08-01', window: 'MANHA', status: 'CONFIRMADO', rescheduleCount: 0 },
    });
    expect(screen.getByRole('button', { name: 'Agendar OV' })).toBeEnabled();
  });

  it('não renderiza botão quando ENTREGUE', () => {
    renderButton({ ...salesOrderFixture, status: 'ENTREGUE' });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/ciclo concluído/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Rodar e verificar que falha**

Run: `pnpm --filter @ovgs/web test -- NextStatusButton`
Expected: FAIL — módulo inexistente.

- [ ] **Step 7: Implementar o botão**

`apps/web/src/features/sales-orders/NextStatusButton.tsx`:

```tsx
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ACTION_LABEL, nextStatusOf } from '@/domain/status-machine';
import type { SalesOrder } from '@/lib/api/sales-orders';
import { toApiError } from '@/lib/errors';
import { useUpdateStatus } from './queries';

/**
 * A UI mostra só a transição válida. Um select com os cinco estados convidaria
 * ao erro de propósito. O 409 do servidor continua sendo a autoridade: este
 * botão apenas antecipa a regra.
 */
export function NextStatusButton({ order }: { order: SalesOrder }) {
  const next = nextStatusOf(order.status);
  const updateStatus = useUpdateStatus(order.id);

  if (next === null) {
    return <p className="text-sm text-slate-600">Ciclo concluído. A OV foi entregue.</p>;
  }

  const needsConfirmedSchedule = next === 'AGENDADA';
  const scheduleConfirmed = order.schedule?.status === 'CONFIRMADO';
  const blocked = needsConfirmedSchedule && !scheduleConfirmed;

  async function advance(): Promise<void> {
    try {
      await updateStatus.mutateAsync(next as NonNullable<typeof next>);
      toast.success(`Status atualizado para ${next}.`);
    } catch (error) {
      // Mensagem da API já vem em português e específica. Exibir literalmente.
      toast.error(toApiError(error).message);
    }
  }

  return (
    <div className="space-y-1">
      <Button disabled={blocked || updateStatus.isPending} onClick={() => void advance()}>
        {updateStatus.isPending ? 'Atualizando…' : ACTION_LABEL[next]}
      </Button>
      {blocked && (
        // Desabilitar sem dizer por quê é hostil.
        <p className="text-xs text-amber-800">
          Confirme o agendamento antes de agendar a OV.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Rodar e verificar que passa**

Run: `pnpm --filter @ovgs/web test -- NextStatusButton`
Expected: PASS, 5 testes.

- [ ] **Step 9: Implementar a aba de itens e a página de detalhe**

`apps/web/src/features/sales-orders/SalesOrderItemsTab.tsx`:

```tsx
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { SalesOrderItem } from '@/lib/api/sales-orders';
import { money } from '@/lib/format';
import { estimateTotalCents } from './createSalesOrderSchema';

/** Itens são imutáveis após a criação. A UI não oferece editar, nem finge que oferece. */
export function SalesOrderItemsTab({ items, total }: { items: SalesOrderItem[]; total: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SKU</TableHead>
          <TableHead>Item</TableHead>
          <TableHead className="text-right">Qtd.</TableHead>
          <TableHead className="text-right">Preço unitário</TableHead>
          <TableHead className="text-right">Subtotal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((line) => (
          <TableRow key={line.itemId}>
            <TableCell className="tabular">{line.sku}</TableCell>
            <TableCell>{line.name}</TableCell>
            <TableCell className="tabular text-right">{line.quantity}</TableCell>
            <TableCell className="tabular text-right">{money(line.unitPrice)}</TableCell>
            <TableCell className="tabular text-right">
              {/* Centavos inteiros: a Global Constraint proíbe float em aritmética de dinheiro. */}
              {money((estimateTotalCents([line]) / 100).toFixed(2))}
            </TableCell>
          </TableRow>
        ))}
        <TableRow>
          <TableCell colSpan={4} className="text-right font-medium">Total</TableCell>
          <TableCell className="tabular text-right font-semibold">{money(total)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
```

`apps/web/src/features/sales-orders/SalesOrderDetailPage.tsx`:

```tsx
import { useParams } from 'react-router';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusStepper } from '@/components/StatusStepper';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuditTimeline } from '@/features/audit/AuditTimeline';
import { ScheduleTab } from '@/features/scheduling/ScheduleTab';
import { money } from '@/lib/format';
import { NextStatusButton } from './NextStatusButton';
import { SalesOrderItemsTab } from './SalesOrderItemsTab';
import { useSalesOrderQuery } from './queries';

export function SalesOrderDetailPage() {
  const { id = '' } = useParams();
  const query = useSalesOrderQuery(id);

  if (query.isPending) return <TableSkeleton rows={6} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const order = query.data;
  const frozen = order.status === 'EM_TRANSPORTE' || order.status === 'ENTREGUE';

  return (
    <>
      <PageHeader
        title={order.number}
        description={`Total ${money(order.total)}`}
        actions={<NextStatusButton order={order} />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <StatusBadge status={order.status} />
        <StatusStepper current={order.status} />
      </div>

      <Tabs defaultValue="itens">
        <TabsList>
          <TabsTrigger value="itens">Itens</TabsTrigger>
          {!frozen && <TabsTrigger value="agendamento">Agendamento</TabsTrigger>}
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="itens" className="rounded-lg border border-border bg-white">
          <SalesOrderItemsTab items={order.items} total={order.total} />
        </TabsContent>

        {!frozen && (
          <TabsContent value="agendamento">
            <ScheduleTab order={order} />
          </TabsContent>
        )}

        <TabsContent value="auditoria">
          <AuditTimeline salesOrderId={order.id} />
        </TabsContent>
      </Tabs>
    </>
  );
}
```

`ScheduleTab` e `AuditTimeline` chegam nas Tasks 9 e 10. Criar stubs de uma linha agora para o build passar; eles são substituídos.

- [ ] **Step 10: Verificar tipagem e suíte**

```bash
pnpm --filter @ovgs/web exec tsc --noEmit
pnpm --filter @ovgs/web test -- --run
```

Expected: zero erros; 35 testes passando.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(web): detalhe da OV com stepper e transição de status guiada"
```

---

## Task 9: Agendamento — aba do detalhe e Central de Agendamento

**Files:**
- Create: `apps/web/src/domain/schedule.ts`
- Create: `apps/web/src/features/scheduling/queries.ts`
- Create: `apps/web/src/features/scheduling/scheduleSchema.ts`
- Rewrite: `apps/web/src/features/scheduling/ScheduleTab.tsx`
- Rewrite: `apps/web/src/features/scheduling/SchedulingPage.tsx`
- Test: `apps/web/src/domain/schedule.spec.ts`

**Interfaces:**
- Consumes: `createSchedule`, `rescheduleSchedule`, `confirmSchedule`, `listSalesOrders`.
- Produces:
  - `MAX_DELIVERIES_PER_SLOT = 5`
  - `slotKey(date, window): string`
  - `countConfirmedBySlot(orders): Map<string, number>`
  - `isSlotFull(orders, date, window): boolean`
  - `scheduleSchema`, `<ScheduleTab order />`, `<SchedulingPage />`

- [ ] **Step 1: Escrever o teste da ocupação de slot**

`apps/web/src/domain/schedule.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SalesOrder } from '@/lib/api/sales-orders';
import { countConfirmedBySlot, isSlotFull, MAX_DELIVERIES_PER_SLOT, slotKey } from './schedule';

function orderWith(status: 'PENDENTE' | 'CONFIRMADO', date = '2099-08-01'): SalesOrder {
  return {
    id: crypto.randomUUID(),
    number: 'OV-000001',
    customerId: 'c',
    transportTypeId: 't',
    status: 'PLANEJADA',
    total: '0.00',
    items: [],
    schedule: { scheduledDate: date, window: 'MANHA', status, rescheduleCount: 0 },
    createdAt: '',
  };
}

describe('countConfirmedBySlot', () => {
  it('conta apenas agendamentos CONFIRMADOS', () => {
    const counts = countConfirmedBySlot([
      orderWith('CONFIRMADO'),
      orderWith('CONFIRMADO'),
      orderWith('PENDENTE'),
    ]);
    expect(counts.get(slotKey('2099-08-01', 'MANHA'))).toBe(2);
  });

  it('separa por data e janela', () => {
    const counts = countConfirmedBySlot([orderWith('CONFIRMADO', '2099-08-01'), orderWith('CONFIRMADO', '2099-08-02')]);
    expect(counts.get(slotKey('2099-08-01', 'MANHA'))).toBe(1);
    expect(counts.get(slotKey('2099-08-02', 'MANHA'))).toBe(1);
  });

  it('ignora OVs sem agendamento', () => {
    const semAgenda = { ...orderWith('PENDENTE'), schedule: null };
    expect(countConfirmedBySlot([semAgenda]).size).toBe(0);
  });
});

describe('isSlotFull', () => {
  it('fica cheio no limite de capacidade', () => {
    const cheios = Array.from({ length: MAX_DELIVERIES_PER_SLOT }, () => orderWith('CONFIRMADO'));
    expect(isSlotFull(cheios, '2099-08-01', 'MANHA')).toBe(true);
  });

  it('não fica cheio abaixo do limite', () => {
    const quase = Array.from({ length: MAX_DELIVERIES_PER_SLOT - 1 }, () => orderWith('CONFIRMADO'));
    expect(isSlotFull(quase, '2099-08-01', 'MANHA')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm --filter @ovgs/web test -- schedule.spec`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar as regras de slot**

`apps/web/src/domain/schedule.ts`:

```ts
import type { DeliveryWindow, SalesOrder } from '@/lib/api/sales-orders';

/** Espelha MAX_DELIVERIES_PER_SLOT do backend. O 409 SlotUnavailable é a autoridade. */
export const MAX_DELIVERIES_PER_SLOT = 5;

export function slotKey(scheduledDate: string, window: DeliveryWindow): string {
  return `${scheduledDate}#${window}`;
}

/**
 * A API não expõe a contagem por slot. Calculamos a partir das OVs já carregadas,
 * o que antecipa o 409 sem inflar o contrato com um endpoint de capacidade.
 */
export function countConfirmedBySlot(orders: readonly SalesOrder[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const order of orders) {
    const { schedule } = order;
    if (schedule === null || schedule.status !== 'CONFIRMADO') continue;
    const key = slotKey(schedule.scheduledDate, schedule.window);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function isSlotFull(
  orders: readonly SalesOrder[],
  scheduledDate: string,
  window: DeliveryWindow,
): boolean {
  const count = countConfirmedBySlot(orders).get(slotKey(scheduledDate, window)) ?? 0;
  return count >= MAX_DELIVERIES_PER_SLOT;
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `pnpm --filter @ovgs/web test -- schedule.spec`
Expected: PASS, 5 testes.

- [ ] **Step 5: Escrever o schema e os hooks**

`apps/web/src/features/scheduling/scheduleSchema.ts`:

```ts
import { z } from 'zod';

const today = (): string => new Date().toISOString().slice(0, 10);

export const scheduleSchema = z.object({
  scheduledDate: z
    .string()
    .min(1, 'Informe a data de entrega.')
    .refine((value) => value >= today(), 'A data precisa ser hoje ou futura.'),
  window: z.enum(['MANHA', 'TARDE', 'INTEGRAL']),
});

export type ScheduleForm = z.infer<typeof scheduleSchema>;

export const WINDOW_LABEL: Record<ScheduleForm['window'], string> = {
  MANHA: 'Manhã (08:00–12:00)',
  TARDE: 'Tarde (13:00–18:00)',
  INTEGRAL: 'Integral (08:00–18:00)',
};
```

Comparação de datas em `YYYY-MM-DD` é lexicográfica e correta. Converter para `Date` traria fuso horário para uma decisão que não precisa dele.

`apps/web/src/features/scheduling/queries.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { confirmSchedule, createSchedule, rescheduleSchedule, type CreateScheduleBody } from '@/lib/api/scheduling';
import { queryKeys } from '@/lib/query-keys';

function useScheduleMutation<TVariables>(fn: (variables: TVariables) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // Agendar gera AuditLog e muda o detalhe, a lista e o dashboard.
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.salesOrders.all }),
  });
}

export const useCreateSchedule = (id: string) =>
  useScheduleMutation((body: CreateScheduleBody) => createSchedule(id, body));

export const useReschedule = (id: string) =>
  useScheduleMutation((body: Partial<CreateScheduleBody>) => rescheduleSchedule(id, body));

export const useConfirmSchedule = (id: string) =>
  useScheduleMutation(() => confirmSchedule(id));
```

- [ ] **Step 6: Implementar a aba de agendamento**

`apps/web/src/features/scheduling/ScheduleTab.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ScheduleStatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SalesOrder } from '@/lib/api/sales-orders';
import { toApiError } from '@/lib/errors';
import { dateBR } from '@/lib/format';
import { useConfirmSchedule, useCreateSchedule, useReschedule } from './queries';
import { scheduleSchema, WINDOW_LABEL, type ScheduleForm } from './scheduleSchema';

const selectClass = 'h-10 w-full rounded-md border border-border bg-white px-3 text-sm';

export function ScheduleTab({ order }: { order: SalesOrder }) {
  const existing = order.schedule;
  const create = useCreateSchedule(order.id);
  const reschedule = useReschedule(order.id);
  const confirm = useConfirmSchedule(order.id);

  const form = useForm<ScheduleForm>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      scheduledDate: existing?.scheduledDate ?? '',
      window: existing?.window ?? 'MANHA',
    },
  });

  async function onSubmit(values: ScheduleForm): Promise<void> {
    try {
      if (existing === null) {
        await create.mutateAsync(values);
        toast.success('Entrega agendada.');
      } else {
        await reschedule.mutateAsync(values);
        toast.success('Entrega reagendada.');
      }
    } catch (error) {
      toast.error(toApiError(error).message);
    }
  }

  async function onConfirm(): Promise<void> {
    try {
      await confirm.mutateAsync(undefined as never);
      toast.success('Agendamento confirmado.');
    } catch (error) {
      toast.error(toApiError(error).message);
    }
  }

  const pending = create.isPending || reschedule.isPending;

  return (
    <div className="max-w-xl space-y-6 rounded-lg border border-border bg-white p-6">
      {existing !== null && (
        <div className="flex items-center gap-3">
          <ScheduleStatusBadge status={existing.status} />
          <span className="tabular text-sm">{dateBR(existing.scheduledDate)}</span>
          <span className="text-sm text-slate-600">{WINDOW_LABEL[existing.window]}</span>
          {existing.rescheduleCount > 0 && (
            <span className="text-xs text-slate-500">
              {existing.rescheduleCount}× reagendado
            </span>
          )}
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="scheduledDate">Data de entrega</Label>
          <Input id="scheduledDate" type="date" {...form.register('scheduledDate')} />
          {form.formState.errors.scheduledDate && (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {form.formState.errors.scheduledDate.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="window">Janela de atendimento</Label>
          <select id="window" className={selectClass} {...form.register('window')}>
            {(Object.keys(WINDOW_LABEL) as Array<ScheduleForm['window']>).map((w) => (
              <option key={w} value={w}>{WINDOW_LABEL[w]}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={pending}>
            {existing === null ? 'Agendar entrega' : 'Reagendar'}
          </Button>

          {existing !== null && existing.status === 'PENDENTE' && (
            <Button type="button" variant="outline" disabled={confirm.isPending} onClick={() => void onConfirm()}>
              Confirmar agendamento
            </Button>
          )}
        </div>
      </form>

      {existing !== null && existing.status === 'CONFIRMADO' && (
        <p className="text-xs text-slate-600">
          Reagendar mantém o agendamento confirmado. A OV não retrocede de status.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Implementar a Central de Agendamento**

`apps/web/src/features/scheduling/SchedulingPage.tsx`:

```tsx
import { toast } from 'sonner';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { ScheduleStatusBadge } from '@/components/StatusBadge';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { countConfirmedBySlot, MAX_DELIVERIES_PER_SLOT, slotKey } from '@/domain/schedule';
import { useSalesOrdersQuery } from '@/features/sales-orders/queries';
import { toApiError } from '@/lib/errors';
import { dateBR } from '@/lib/format';
import { useConfirmSchedule } from './queries';
import { WINDOW_LABEL } from './scheduleSchema';

function ConfirmButton({ salesOrderId, full }: { salesOrderId: string; full: boolean }) {
  const confirm = useConfirmSchedule(salesOrderId);

  async function run(): Promise<void> {
    try {
      await confirm.mutateAsync(undefined as never);
      toast.success('Agendamento confirmado.');
    } catch (error) {
      toast.error(toApiError(error).message);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={full || confirm.isPending} onClick={() => void run()}>
        Confirmar
      </Button>
      {full && <span className="text-xs text-amber-800">Slot cheio</span>}
    </div>
  );
}

/** Visão, não CRUD novo: filtra as OVs agendadas e oferece confirmar/reagendar. */
export function SchedulingPage() {
  const query = useSalesOrdersQuery({});

  if (query.isPending) return <TableSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const scheduled = query.data
    .filter((order) => order.schedule !== null)
    .sort((a, b) => a.schedule!.scheduledDate.localeCompare(b.schedule!.scheduledDate));

  const counts = countConfirmedBySlot(query.data);

  if (scheduled.length === 0) {
    return (
      <>
        <PageHeader title="Central de Agendamento" />
        <EmptyState
          title="Nenhuma entrega agendada"
          description="Agende uma entrega a partir do detalhe de uma OV."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Central de Agendamento"
        description={`Capacidade de ${MAX_DELIVERIES_PER_SLOT} entregas confirmadas por data e janela`}
      />

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OV</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Janela</TableHead>
              <TableHead>Ocupação</TableHead>
              <TableHead>Agendamento</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scheduled.map((order) => {
              const schedule = order.schedule!;
              const key = slotKey(schedule.scheduledDate, schedule.window);
              const used = counts.get(key) ?? 0;
              const full = used >= MAX_DELIVERIES_PER_SLOT;

              return (
                <TableRow key={order.id}>
                  <TableCell className="tabular">{order.number}</TableCell>
                  <TableCell className="tabular">{dateBR(schedule.scheduledDate)}</TableCell>
                  <TableCell>{WINDOW_LABEL[schedule.window]}</TableCell>
                  <TableCell className="tabular">{`${used}/${MAX_DELIVERIES_PER_SLOT}`}</TableCell>
                  <TableCell><ScheduleStatusBadge status={schedule.status} /></TableCell>
                  <TableCell className="text-right">
                    {schedule.status === 'PENDENTE' ? (
                      <ConfirmButton salesOrderId={order.id} full={full} />
                    ) : (
                      <span className="text-sm text-slate-500">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
```

- [ ] **Step 8: Verificar tipagem e suíte**

```bash
pnpm --filter @ovgs/web exec tsc --noEmit
pnpm --filter @ovgs/web test -- --run
```

Expected: zero erros; 40 testes passando.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(web): agendamento com janela, reagendamento, confirmação e ocupação de slot"
```

---

## Task 10: Auditoria — timeline na aba do detalhe

**Files:**
- Create: `apps/web/src/features/audit/queries.ts`
- Create: `apps/web/src/features/audit/auditLabels.ts`
- Rewrite: `apps/web/src/features/audit/AuditTimeline.tsx`
- Test: `apps/web/src/features/audit/AuditTimeline.spec.tsx`

**Interfaces:**
- Consumes: `listAudit`, `queryKeys.salesOrders.audit`.
- Produces: `useAuditQuery(id)`, `ACTION_TEXT`, `FIELD_LABEL`, `<AuditTimeline salesOrderId />`

- [ ] **Step 1: Escrever o teste**

`apps/web/src/features/audit/AuditTimeline.spec.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/msw-server';
import { AuditTimeline } from './AuditTimeline';

const ID = '11111111-1111-4111-8111-111111111111';
const BASE = 'http://localhost:3000/api';

function renderTimeline() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuditTimeline salesOrderId={ID} />
    </QueryClientProvider>,
  );
}

describe('AuditTimeline', () => {
  it('mostra a criação sem tentar renderizar um before nulo', async () => {
    server.use(
      http.get(`${BASE}/sales-orders/${ID}/audit`, () =>
        HttpResponse.json([
          {
            id: 'a1',
            action: 'ORDER_CREATED',
            entity: 'SALES_ORDER',
            entityId: ID,
            before: null,
            after: { status: 'CRIADA' },
            actor: 'rodrigo',
            createdAt: '2026-07-09T12:00:00.000Z',
          },
        ]),
      ),
    );
    renderTimeline();

    expect(await screen.findByText('Ordem de venda criada')).toBeInTheDocument();
    expect(screen.getByText('rodrigo')).toBeInTheDocument();
    expect(screen.queryByText(/de\s+—\s+para/i)).not.toBeInTheDocument();
  });

  it('mostra o diff de uma mudança de status', async () => {
    server.use(
      http.get(`${BASE}/sales-orders/${ID}/audit`, () =>
        HttpResponse.json([
          {
            id: 'a2',
            action: 'STATUS_CHANGED',
            entity: 'SALES_ORDER',
            entityId: ID,
            before: { status: 'CRIADA' },
            after: { status: 'PLANEJADA' },
            actor: null,
            createdAt: '2026-07-09T12:05:00.000Z',
          },
        ]),
      ),
    );
    renderTimeline();

    expect(await screen.findByText('Status alterado')).toBeInTheDocument();
    expect(screen.getByText('CRIADA')).toBeInTheDocument();
    expect(screen.getByText('PLANEJADA')).toBeInTheDocument();
    expect(screen.getByText('sistema')).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há eventos', async () => {
    server.use(http.get(`${BASE}/sales-orders/${ID}/audit`, () => HttpResponse.json([])));
    renderTimeline();

    expect(await screen.findByText(/nenhum evento/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm --filter @ovgs/web test -- AuditTimeline`
Expected: FAIL — o stub não renderiza nada disso.

- [ ] **Step 3: Implementar rótulos e query**

`apps/web/src/features/audit/auditLabels.ts`:

```ts
import type { AuditAction } from '@/lib/api/audit';

export const ACTION_TEXT: Record<AuditAction, string> = {
  ORDER_CREATED: 'Ordem de venda criada',
  STATUS_CHANGED: 'Status alterado',
  SCHEDULE_CHANGED: 'Agendamento alterado',
  TRANSPORT_CHANGED: 'Tipo de transporte alterado',
};

export const FIELD_LABEL: Record<string, string> = {
  status: 'Status',
  customerId: 'Cliente',
  transportTypeId: 'Transporte',
  total: 'Total',
  scheduledDate: 'Data de entrega',
  window: 'Janela',
};

export function labelFor(field: string): string {
  return FIELD_LABEL[field] ?? field;
}
```

`apps/web/src/features/audit/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { listAudit } from '@/lib/api/audit';
import { queryKeys } from '@/lib/query-keys';

export function useAuditQuery(salesOrderId: string) {
  return useQuery({
    queryKey: queryKeys.salesOrders.audit(salesOrderId),
    queryFn: () => listAudit(salesOrderId),
  });
}
```

- [ ] **Step 4: Implementar a timeline**

`apps/web/src/features/audit/AuditTimeline.tsx`:

```tsx
import { ArrowRight } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { TableSkeleton } from '@/components/TableSkeleton';
import type { AuditLog } from '@/lib/api/audit';
import { dateTimeBR } from '@/lib/format';
import { ACTION_TEXT, labelFor } from './auditLabels';
import { useAuditQuery } from './queries';

function Diff({ log }: { log: AuditLog }) {
  // ORDER_CREATED tem before nulo. Dizer "de nada para CRIADA" não informa.
  if (log.before === null) {
    return (
      <dl className="mt-2 grid gap-1 text-sm">
        {Object.entries(log.after ?? {}).map(([field, value]) => (
          <div key={field} className="flex gap-2">
            <dt className="text-slate-600">{labelFor(field)}:</dt>
            <dd className="tabular">{String(value)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  const fields = new Set([...Object.keys(log.before), ...Object.keys(log.after ?? {})]);

  return (
    <dl className="mt-2 grid gap-1 text-sm">
      {[...fields].map((field) => (
        <div key={field} className="flex flex-wrap items-center gap-2">
          <dt className="text-slate-600">{labelFor(field)}:</dt>
          <dd className="flex items-center gap-2">
            <span className="tabular rounded bg-slate-100 px-1.5 py-0.5">
              {String(log.before?.[field] ?? '—')}
            </span>
            <ArrowRight aria-hidden="true" className="size-3.5 text-slate-400" />
            <span className="tabular rounded bg-emerald-50 px-1.5 py-0.5 font-medium">
              {String(log.after?.[field] ?? '—')}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AuditTimeline({ salesOrderId }: { salesOrderId: string }) {
  const query = useAuditQuery(salesOrderId);

  if (query.isPending) return <TableSkeleton rows={3} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data.length === 0) {
    return <EmptyState title="Nenhum evento" description="Nada foi auditado nesta OV ainda." />;
  }

  return (
    <ol className="space-y-3">
      {query.data.map((log) => (
        <li key={log.id} className="rounded-lg border border-border bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">{ACTION_TEXT[log.action]}</p>
            <time dateTime={log.createdAt} className="tabular text-xs text-slate-500">
              {dateTimeBR(log.createdAt)}
            </time>
          </div>
          <p className="text-xs text-slate-600">
            {log.entity === 'SALES_ORDER' ? 'Ordem de venda' : 'Agendamento'} • por{' '}
            <span className="font-medium">{log.actor ?? 'sistema'}</span>
          </p>
          <Diff log={log} />
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `pnpm --filter @ovgs/web test -- AuditTimeline`
Expected: PASS, 3 testes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): timeline de auditoria na aba do detalhe da OV"
```

---

## Task 11: Cadastros — clientes, transportes e itens

**Files:**
- Rewrite: `apps/web/src/features/customers/CustomersPage.tsx`
- Create: `apps/web/src/features/customers/CustomerDialog.tsx`, `CustomerTransportTypes.tsx`
- Modify: `apps/web/src/features/customers/queries.ts`
- Rewrite: `apps/web/src/features/transport-types/TransportTypesPage.tsx`
- Modify: `apps/web/src/features/transport-types/queries.ts`
- Rewrite: `apps/web/src/features/items/ItemsPage.tsx`
- Test: `apps/web/src/features/items/ItemsPage.spec.tsx`

**Interfaces:**
- Produces: `useCreateCustomer()`, `useUpdateCustomer()`, `useLinkTransportTypes(id)`, `useCreateTransportType()`, `useUpdateTransportType()`.

Nenhum `DELETE`: a API não expõe. Baixa é `PATCH { active: false }`, com confirmação.

- [ ] **Step 1: Completar os hooks de mutação**

Acrescentar a `apps/web/src/features/customers/queries.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createCustomer,
  linkCustomerTransportTypes,
  updateCustomer,
  type CreateCustomerBody,
  type UpdateCustomerBody,
} from '@/lib/api/customers';

export function useCreateCustomer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCustomerBody) => createCustomer(body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.customers.all }),
  });
}

export function useUpdateCustomer(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateCustomerBody) => updateCustomer(id, body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.customers.all }),
  });
}

export function useLinkTransportTypes(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (transportTypeIds: string[]) => linkCustomerTransportTypes(id, transportTypeIds),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.customers.transportTypes(id) }),
  });
}
```

Acrescentar a `apps/web/src/features/transport-types/queries.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTransportType, updateTransportType } from '@/lib/api/transport-types';

export function useCreateTransportType() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createTransportType,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.transportTypes.all }),
  });
}

export function useUpdateTransportType(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<{ name: string; active: boolean }>) => updateTransportType(id, body),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.transportTypes.all }),
  });
}
```

- [ ] **Step 2: Escrever o teste da página de itens**

O item exercita a regra do dinheiro: entra string, sai string.

`apps/web/src/features/items/ItemsPage.spec.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '@/test/msw-server';
import { ItemsPage } from './ItemsPage';

const BASE = 'http://localhost:3000/api';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ItemsPage />
    </QueryClientProvider>,
  );
}

describe('ItemsPage', () => {
  it('exibe o preço formatado em BRL', async () => {
    server.use(
      http.get(`${BASE}/items`, () =>
        HttpResponse.json([
          { id: 'i1', sku: 'SKU-001', name: 'Palete', unitPrice: '129.90', active: true },
        ]),
      ),
    );
    renderPage();

    expect(await screen.findByText('R$ 129,90')).toBeInTheDocument();
  });

  it('envia unitPrice como string, não como número', async () => {
    const captured = vi.fn();
    server.use(
      http.get(`${BASE}/items`, () => HttpResponse.json([])),
      http.post(`${BASE}/items`, async ({ request }) => {
        captured(await request.json());
        return HttpResponse.json({ id: 'i2' }, { status: 201 });
      }),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /novo item/i }));
    await user.type(screen.getByLabelText('SKU'), 'SKU-002');
    await user.type(screen.getByLabelText('Nome'), 'Caixa');
    await user.type(screen.getByLabelText('Preço unitário'), '89.50');
    await user.click(screen.getByRole('button', { name: /^criar$/i }));

    await waitFor(() => expect(captured).toHaveBeenCalled());
    expect(captured.mock.calls[0][0]).toEqual({ sku: 'SKU-002', name: 'Caixa', unitPrice: '89.50' });
  });
});
```

- [ ] **Step 3: Rodar e verificar que falha**

Run: `pnpm --filter @ovgs/web test -- ItemsPage`
Expected: FAIL — a página ainda é stub.

- [ ] **Step 4: Implementar a página de itens**

`apps/web/src/features/items/ItemsPage.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toApiError } from '@/lib/errors';
import { money } from '@/lib/format';
import { useCreateItem, useItemsQuery } from './queries';

const itemSchema = z.object({
  sku: z.string().min(1, 'Informe o SKU.'),
  name: z.string().min(1, 'Informe o nome.'),
  // String, não number: dinheiro não passa por float nem na fronteira.
  unitPrice: z.string().regex(/^\d+\.\d{2}$/, 'Use o formato 0.00'),
});
type ItemForm = z.infer<typeof itemSchema>;

function CreateItemDialog() {
  const [open, setOpen] = useState(false);
  const createItem = useCreateItem();
  const form = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    defaultValues: { sku: '', name: '', unitPrice: '' },
  });

  async function onSubmit(values: ItemForm): Promise<void> {
    try {
      await createItem.mutateAsync(values);
      toast.success('Item criado.');
      setOpen(false);
      form.reset();
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.statusCode === 409) form.setError('sku', { message: apiError.message });
      else toast.error(apiError.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus aria-hidden="true" className="size-4" /> Novo item</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo item</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {(['sku', 'name', 'unitPrice'] as const).map((field) => (
            <div key={field}>
              <Label htmlFor={field}>
                {field === 'sku' ? 'SKU' : field === 'name' ? 'Nome' : 'Preço unitário'}
              </Label>
              <Input id={field} inputMode={field === 'unitPrice' ? 'decimal' : 'text'} {...form.register(field)} />
              {form.formState.errors[field] && (
                <p role="alert" className="mt-1 text-sm text-destructive">
                  {form.formState.errors[field]?.message}
                </p>
              )}
            </div>
          ))}
          <DialogFooter>
            <Button type="submit" disabled={createItem.isPending}>Criar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ItemsPage() {
  const query = useItemsQuery();

  return (
    <>
      <PageHeader title="Itens" description="Catálogo. Itens são imutáveis após a criação." actions={<CreateItemDialog />} />

      {query.isPending && <TableSkeleton />}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.isSuccess && query.data.length === 0 && (
        <EmptyState title="Nenhum item" description="Cadastre o primeiro item do catálogo." />
      )}
      {query.isSuccess && query.data.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Preço unitário</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="tabular">{item.sku}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell className="tabular text-right">{money(item.unitPrice)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `pnpm --filter @ovgs/web test -- ItemsPage`
Expected: PASS, 2 testes.

- [ ] **Step 6: Implementar a página de tipos de transporte**

Mesma estrutura de `ItemsPage`. Diferenças: schema `{ code: /^[A-Z0-9_]+$/, name }`; a tabela tem coluna `Ativo` com um botão de baixa lógica que abre confirmação antes de `PATCH { active: false }`; `code` não é editável (a API não permite), então o dialog de edição só oferece `name` e `active`.

`apps/web/src/features/transport-types/TransportTypesPage.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toApiError } from '@/lib/errors';
import { useCreateTransportType, useTransportTypesQuery, useUpdateTransportType } from './queries';

const schema = z.object({
  code: z.string().regex(/^[A-Z0-9_]+$/, 'Use apenas A-Z, 0-9 e _'),
  name: z.string().min(1, 'Informe o nome.'),
});
type Form = z.infer<typeof schema>;

function CreateDialog() {
  const [open, setOpen] = useState(false);
  const create = useCreateTransportType();
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { code: '', name: '' } });

  async function onSubmit(values: Form): Promise<void> {
    try {
      await create.mutateAsync(values);
      toast.success('Tipo de transporte criado.');
      setOpen(false);
      form.reset();
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.statusCode === 409) form.setError('code', { message: apiError.message });
      else toast.error(apiError.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus aria-hidden="true" className="size-4" /> Novo tipo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo tipo de transporte</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="code">Código</Label>
            <Input id="code" {...form.register('code')} />
            <p className="mt-1 text-xs text-slate-600">Imutável após a criação.</p>
            {form.formState.errors.code && (
              <p role="alert" className="mt-1 text-sm text-destructive">{form.formState.errors.code.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" {...form.register('name')} />
          </div>
          <DialogFooter><Button type="submit" disabled={create.isPending}>Criar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleActive({ id, active }: { id: string; active: boolean }) {
  const update = useUpdateTransportType(id);
  const [confirming, setConfirming] = useState(false);

  async function run(): Promise<void> {
    try {
      await update.mutateAsync({ active: !active });
      toast.success(active ? 'Tipo desativado.' : 'Tipo reativado.');
      setConfirming(false);
    } catch (error) {
      toast.error(toApiError(error).message);
    }
  }

  if (!active) {
    return <Button size="sm" variant="outline" onClick={() => void run()}>Reativar</Button>;
  }

  return (
    <Dialog open={confirming} onOpenChange={setConfirming}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Desativar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Desativar tipo de transporte?</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">
          Baixa lógica: o registro é preservado, e as OVs existentes continuam válidas.
          Ele deixa de ser oferecido em novas OVs.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setConfirming(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={() => void run()}>Desativar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TransportTypesPage() {
  const query = useTransportTypesQuery();

  return (
    <>
      <PageHeader
        title="Tipos de Transporte"
        description="Novos tipos entram sem alterar regra de negócio."
        actions={<CreateDialog />}
      />

      {query.isPending && <TableSkeleton />}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.isSuccess && (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="tabular">{t.code}</TableCell>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.active ? 'Ativo' : 'Inativo'}</TableCell>
                  <TableCell className="text-right"><ToggleActive id={t.id} active={t.active} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 7: Implementar a página de clientes**

`CustomersPage` repete a estrutura acima com o schema `{ name, document (11–14 dígitos), email? }`, e acrescenta uma seção expansível por linha: **transportes autorizados**.

`apps/web/src/features/customers/CustomerTransportTypes.tsx`:

```tsx
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useTransportTypesQuery } from '@/features/transport-types/queries';
import { toApiError } from '@/lib/errors';
import { useCustomerTransportTypesQuery, useLinkTransportTypes } from './queries';
import { useState } from 'react';

/**
 * A semântica da API é aditiva: nada é removido. Por isso o botão diz
 * "Adicionar transportes", não "Salvar lista".
 */
export function CustomerTransportTypes({ customerId }: { customerId: string }) {
  const authorized = useCustomerTransportTypesQuery(customerId);
  const transportTypes = useTransportTypesQuery();
  const link = useLinkTransportTypes(customerId);
  const [selected, setSelected] = useState<string[]>([]);

  const current = authorized.data ?? [];
  const available = (transportTypes.data ?? []).filter((t) => t.active && !current.includes(t.id));

  async function add(): Promise<void> {
    try {
      await link.mutateAsync(selected);
      toast.success('Transportes autorizados.');
      setSelected([]);
    } catch (error) {
      toast.error(toApiError(error).message);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted p-4">
      <p className="text-sm font-medium">Transportes autorizados</p>

      {current.length === 0 ? (
        <p className="text-sm text-slate-600">
          Nenhum. Sem ao menos um, este cliente não pode ter ordens de venda.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {current.map((id) => {
            const t = (transportTypes.data ?? []).find((x) => x.id === id);
            return (
              <li key={id} className="rounded-full bg-white px-2.5 py-1 text-xs ring-1 ring-border">
                {t?.name ?? id}
              </li>
            );
          })}
        </ul>
      )}

      {available.length > 0 && (
        <>
          <fieldset className="space-y-2">
            <legend className="sr-only">Transportes disponíveis</legend>
            {available.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <Checkbox
                  id={`tt-${t.id}`}
                  checked={selected.includes(t.id)}
                  onCheckedChange={(checked) =>
                    setSelected((prev) => (checked === true ? [...prev, t.id] : prev.filter((x) => x !== t.id)))
                  }
                />
                <Label htmlFor={`tt-${t.id}`}>{t.name}</Label>
              </div>
            ))}
          </fieldset>

          <Button size="sm" disabled={selected.length === 0 || link.isPending} onClick={() => void add()}>
            Adicionar transportes
          </Button>
        </>
      )}
    </div>
  );
}
```

`apps/web/src/features/customers/CustomersPage.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Fragment, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toApiError } from '@/lib/errors';
import { CustomerTransportTypes } from './CustomerTransportTypes';
import { useCreateCustomer, useCustomersQuery, useUpdateCustomer } from './queries';

const customerSchema = z.object({
  name: z.string().min(1, 'Informe o nome.'),
  document: z.string().regex(/^\d{11,14}$/, 'CPF ou CNPJ: 11 a 14 dígitos.'),
  email: z.union([z.string().email('E-mail inválido.'), z.literal('')]),
});
type CustomerForm = z.infer<typeof customerSchema>;

function CreateCustomerDialog() {
  const [open, setOpen] = useState(false);
  const create = useCreateCustomer();
  const form = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', document: '', email: '' },
  });

  async function onSubmit(values: CustomerForm): Promise<void> {
    try {
      const { email, ...rest } = values;
      await create.mutateAsync(email === '' ? rest : { ...rest, email });
      toast.success('Cliente criado.');
      setOpen(false);
      form.reset();
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.statusCode === 409) form.setError('document', { message: apiError.message });
      else toast.error(apiError.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus aria-hidden="true" className="size-4" /> Novo cliente</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" {...form.register('name')} />
            {form.formState.errors.name && (
              <p role="alert" className="mt-1 text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="document">Documento</Label>
            <Input id="document" inputMode="numeric" {...form.register('document')} />
            {form.formState.errors.document && (
              <p role="alert" className="mt-1 text-sm text-destructive">{form.formState.errors.document.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="email">E-mail (opcional)</Label>
            <Input id="email" type="email" {...form.register('email')} />
            {form.formState.errors.email && (
              <p role="alert" className="mt-1 text-sm text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <DialogFooter><Button type="submit" disabled={create.isPending}>Criar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateCustomer({ id, active }: { id: string; active: boolean }) {
  const update = useUpdateCustomer(id);
  const [confirming, setConfirming] = useState(false);

  async function run(): Promise<void> {
    try {
      await update.mutateAsync({ active: !active });
      toast.success(active ? 'Cliente desativado.' : 'Cliente reativado.');
      setConfirming(false);
    } catch (error) {
      toast.error(toApiError(error).message);
    }
  }

  if (!active) {
    return <Button size="sm" variant="outline" onClick={() => void run()}>Reativar</Button>;
  }

  return (
    <Dialog open={confirming} onOpenChange={setConfirming}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Desativar</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Desativar cliente?</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">
          Baixa lógica: o registro é preservado e as OVs existentes continuam válidas.
          Ele deixa de ser oferecido em novas OVs.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setConfirming(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={() => void run()}>Desativar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CustomersPage() {
  const query = useCustomersQuery();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Cada cliente precisa de ao menos um transporte autorizado para ter OVs."
        actions={<CreateCustomerDialog />}
      />

      {query.isPending && <TableSkeleton />}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.isSuccess && query.data.length === 0 && (
        <EmptyState title="Nenhum cliente" description="Cadastre o primeiro cliente." />
      )}

      {query.isSuccess && query.data.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Nome</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((customer) => {
                const open = expanded === customer.id;
                return (
                  <Fragment key={customer.id}>
                    <TableRow>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-expanded={open}
                          aria-label={`${open ? 'Ocultar' : 'Mostrar'} transportes de ${customer.name}`}
                          onClick={() => setExpanded(open ? null : customer.id)}
                        >
                          {open ? (
                            <ChevronDown aria-hidden="true" className="size-4" />
                          ) : (
                            <ChevronRight aria-hidden="true" className="size-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>{customer.name}</TableCell>
                      <TableCell className="tabular">{customer.document}</TableCell>
                      <TableCell>{customer.active ? 'Ativo' : 'Inativo'}</TableCell>
                      <TableCell className="text-right">
                        <DeactivateCustomer id={customer.id} active={customer.active} />
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <CustomerTransportTypes customerId={customer.id} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
```

`email` opcional exige o `z.union` com `z.literal('')`: um `<input>` vazio devolve string vazia, não `undefined`, e `z.string().email().optional()` rejeitaria. O campo vazio é omitido do corpo antes do envio.

- [ ] **Step 8: Verificar tipagem e suíte**

```bash
pnpm --filter @ovgs/web exec tsc --noEmit
pnpm --filter @ovgs/web test -- --run
```

Expected: zero erros; 45 testes passando.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(web): cadastros de clientes, transportes e itens"
```

---

## Task 12: Dashboard

Vem por último de propósito: é composto das peças que as telas anteriores já construíram.

**Files:**
- Rewrite: `apps/web/src/features/dashboard/DashboardPage.tsx`
- Create: `apps/web/src/features/dashboard/StatusCounts.tsx`
- Test: `apps/web/src/features/dashboard/DashboardPage.spec.tsx`

**Interfaces:**
- Consumes: `useSalesOrdersQuery`, `StatusBadge`, `dateBR`, `WINDOW_LABEL`.
- Produces: `countByStatus(orders): Record<SalesOrderStatus, number>`

- [ ] **Step 1: Escrever o teste**

`apps/web/src/features/dashboard/DashboardPage.spec.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/msw-server';
import { salesOrderFixture } from '@/test/handlers';
import { DashboardPage } from './DashboardPage';

const BASE = 'http://localhost:3000/api';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/', element: <DashboardPage /> }]);
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  it('conta as OVs por status no cliente', async () => {
    server.use(
      http.get(`${BASE}/sales-orders`, () =>
        HttpResponse.json([
          { ...salesOrderFixture, id: '1', status: 'CRIADA' },
          { ...salesOrderFixture, id: '2', status: 'CRIADA' },
          { ...salesOrderFixture, id: '3', status: 'ENTREGUE' },
        ]),
      ),
    );
    renderPage();

    const criada = await screen.findByRole('link', { name: /CRIADA/ });
    expect(criada).toHaveTextContent('2');
    expect(criada).toHaveAttribute('href', '/sales-orders?status=CRIADA');
  });

  it('mostra estado vazio na tabela de entregas quando nada está agendado', async () => {
    server.use(http.get(`${BASE}/sales-orders`, () => HttpResponse.json([salesOrderFixture])));
    renderPage();

    expect(await screen.findByText(/nenhuma entrega agendada/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `pnpm --filter @ovgs/web test -- DashboardPage`
Expected: FAIL — stub.

- [ ] **Step 3: Implementar**

`apps/web/src/features/dashboard/StatusCounts.tsx`:

```tsx
import { Link } from 'react-router';
import { SALES_ORDER_STATUSES, type SalesOrderStatus } from '@/domain/status-machine';
import type { SalesOrder } from '@/lib/api/sales-orders';

export function countByStatus(orders: readonly SalesOrder[]): Record<SalesOrderStatus, number> {
  const counts = Object.fromEntries(SALES_ORDER_STATUSES.map((s) => [s, 0])) as Record<
    SalesOrderStatus,
    number
  >;
  for (const order of orders) counts[order.status] += 1;
  return counts;
}

/**
 * A API não tem endpoint de agregação. Sem paginação, um GET traz tudo e a
 * contagem sai no cliente. Quando a paginação entrar, isto precisa de
 * GET /sales-orders/stats. Dívida registrada, não escondida.
 */
export function StatusCounts({ orders }: { orders: readonly SalesOrder[] }) {
  const counts = countByStatus(orders);

  return (
    <div className="mb-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {SALES_ORDER_STATUSES.map((status) => (
        <Link
          key={status}
          to={`/sales-orders?status=${status}`}
          className="rounded-lg border border-border bg-white p-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <p className="text-xs font-medium text-slate-600">{status.replace('_', ' ')}</p>
          <p className="tabular text-3xl font-semibold">{counts[status]}</p>
        </Link>
      ))}
    </div>
  );
}
```

`apps/web/src/features/dashboard/DashboardPage.tsx`:

```tsx
import { Link } from 'react-router';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { ScheduleStatusBadge } from '@/components/StatusBadge';
import { TableSkeleton } from '@/components/TableSkeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useSalesOrdersQuery } from '@/features/sales-orders/queries';
import { WINDOW_LABEL } from '@/features/scheduling/scheduleSchema';
import { dateBR } from '@/lib/format';
import { StatusCounts } from './StatusCounts';

const DAYS_AHEAD = 7;

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function DashboardPage() {
  const all = useSalesOrdersQuery({});

  if (all.isPending) return <TableSkeleton rows={6} />;
  if (all.isError) return <ErrorState error={all.error} onRetry={() => void all.refetch()} />;

  const from = isoDate(0);
  const to = isoDate(DAYS_AHEAD);
  const upcoming = all.data
    .filter((o) => o.schedule !== null && o.schedule.scheduledDate >= from && o.schedule.scheduledDate <= to)
    .sort((a, b) => a.schedule!.scheduledDate.localeCompare(b.schedule!.scheduledDate));

  return (
    <>
      <PageHeader title="Monitoramento Operacional" />
      <StatusCounts orders={all.data} />

      <h2 className="mb-3 text-lg font-medium">Entregas agendadas — próximos {DAYS_AHEAD} dias</h2>

      {upcoming.length === 0 ? (
        <EmptyState
          title="Nenhuma entrega agendada"
          description={`Nada previsto para os próximos ${DAYS_AHEAD} dias.`}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OV</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Janela</TableHead>
                <TableHead>Agendamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {upcoming.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="tabular">
                    <Link to={`/sales-orders/${order.id}`} className="underline underline-offset-2">
                      {order.number}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular">{dateBR(order.schedule!.scheduledDate)}</TableCell>
                  <TableCell>{WINDOW_LABEL[order.schedule!.window]}</TableCell>
                  <TableCell><ScheduleStatusBadge status={order.schedule!.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `pnpm --filter @ovgs/web test -- DashboardPage`
Expected: PASS, 2 testes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): dashboard de monitoramento operacional"
```

---

## Task 13: Passe de acessibilidade, responsividade e README

**Files:**
- Modify: `apps/web/src/components/DataTable.tsx` (novo, extrai a tabela responsiva)
- Modify: as páginas com tabela
- Create: `apps/web/README.md`
- Modify: `README.md` (raiz)

- [ ] **Step 1: Tabelas viram cards abaixo de 768px**

Scroll horizontal em tabela quebra a regra `horizontal-scroll` e é a saída preguiçosa. Cada linha vira um card com rótulo por campo.

Em cada tabela, envolver com o padrão:

```tsx
{/* Tabela em telas médias e maiores */}
<div className="hidden md:block">…<Table>…</Table>…</div>

{/* Cards em telas pequenas */}
<ul className="grid gap-3 md:hidden">
  {rows.map((row) => (
    <li key={row.id} className="rounded-lg border border-border bg-white p-4">
      <div className="flex items-baseline justify-between">
        <span className="tabular font-medium">{row.number}</span>
        <StatusBadge status={row.status} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-1 text-sm">
        <dt className="text-slate-600">Total</dt>
        <dd className="tabular text-right">{money(row.total)}</dd>
        <dt className="text-slate-600">Entrega</dt>
        <dd className="tabular text-right">{row.schedule === null ? '—' : dateBR(row.schedule.scheduledDate)}</dd>
      </dl>
    </li>
  ))}
</ul>
```

- [ ] **Step 2: Rodar a checagem manual de acessibilidade**

Com a API e o front no ar (`pnpm dev`), percorrer:

- [ ] Navegar o app inteiro **só com teclado**. Tab segue a ordem visual; foco sempre visível.
- [ ] O link "Pular para o conteúdo" aparece no primeiro Tab.
- [ ] Nenhum botão só com ícone sem `aria-label`.
- [ ] Erros de formulário anunciados: cada `<p role="alert">` está junto do campo.
- [ ] Ativar "Reduzir movimento" no sistema e confirmar que transições somem.
- [ ] Em 375px: sem scroll horizontal; tabelas viraram cards.
- [ ] Em 375px: nenhum alvo de toque menor que 44×44px.
- [ ] Zoom de 200%: nada some nem se sobrepõe.
- [ ] Simular offline no DevTools: `ErrorState` "sem conexão" com retry, não tela branca.
- [ ] Contraste: rodar o Lighthouse; acessibilidade ≥ 95.

Registrar no commit o que foi verificado. Um checklist não executado é pior que nenhum, porque mente.

- [ ] **Step 3: Escrever o README do front**

`apps/web/README.md` cobre: como rodar, a arquitetura de pastas, por que a máquina de estados é duplicada, por que a auditoria é aba, por que os contadores do dashboard são calculados no cliente, e a lista de dívidas (paginação, endpoint de agregação).

- [ ] **Step 4: Atualizar o README da raiz**

Trocar `web/ frontend (em desenvolvimento)` pela descrição real. Acrescentar uma seção "Executando tudo":

```bash
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev          # API em :3000, front em :5173
```

E a seção de testes do monorepo, com a contagem real dos dois pacotes.

- [ ] **Step 5: Verificação final**

```bash
pnpm --filter @ovgs/web exec tsc --noEmit
pnpm --filter @ovgs/web exec eslint src --max-warnings 0
pnpm test && pnpm test:e2e && pnpm web:test -- --run
pnpm web:build && pnpm api:build
```

Expected: tudo verde, dois builds limpos.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): responsividade, passe de acessibilidade e documentação"
```

---

## Self-Review

**Cobertura do spec:**

| Seção do spec | Task |
|---|---|
| §3 CORS e `GET /customers/:id/transport-types` | 1 |
| §2 Stack, §4.1–4.4 tokens e tipografia | 2 |
| §5.1 cliente HTTP, §7.1 dinheiro, §7.2 erros | 3 |
| §5 camada de API | 4 |
| §4.5 StatusBadge, §5 layout, §7.3 estados | 5 |
| §6.2 lista e filtros na URL | 6 |
| §6.3 criar OV, transportes autorizados, preview | 7 |
| §5.2 máquina de estados, §6.4 detalhe e stepper | 8 |
| §6.5 central de agendamento, ocupação de slot | 9 |
| §6.4 auditoria como aba | 10 |
| §6.6 cadastros | 11 |
| §6.1 dashboard | 12 |
| §8 acessibilidade e responsividade, §9 testes | 13 |

**Consistência de tipos:** `SalesOrderStatus` nasce em `domain/status-machine.ts` (Task 3) e é usado por `lib/api/sales-orders.ts` (Task 4) — a dependência aponta de `api` para `domain`, nunca o contrário. `DeliveryWindow` e `ScheduleStatus` nascem em `lib/api/sales-orders.ts` e são reexportados por `scheduling.ts`. `queryKeys` só existe depois de `ListSalesOrdersQuery` (Task 4). `WINDOW_LABEL` nasce na Task 9 e o dashboard (Task 12) o consome.

**Riscos conhecidos:**

- *`RouterProvider` importado de `react-router`* — quebra em runtime, não em build. Registrado nas Global Constraints e verificado na Task 5, Step 9.
- *`SalesOrderDetailPage` (Task 8) importa `ScheduleTab` e `AuditTimeline`, que só existem nas Tasks 9 e 10.* Resolvido criando stubs de uma linha na Task 8, substituídos depois. O plano diz isso explicitamente.
- *`select` nativo vs `Select` do Radix.* O formulário usa nativo, porque `userEvent.selectOptions` exige, e porque teclado e leitor de tela funcionam sem trabalho. Os filtros usam Radix. A inconsistência é deliberada e está justificada na Task 7, Step 6.
- *Contadores do dashboard no cliente* — quebra silenciosamente quando a paginação entrar. Comentado no código e registrado no README.
