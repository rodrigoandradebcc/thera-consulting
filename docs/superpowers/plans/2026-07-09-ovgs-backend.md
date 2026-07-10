# OVGS Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a API REST do Sistema de Gestão de Ordens de Venda (OVGS): cadastros, ciclo de vida da OV com máquina de estados linear, agendamento de entrega com janela e confirmação, e auditoria transacional.

**Architecture:** NestJS modular. Cada módulo de domínio é `Controller → Service → Repository → PrismaService`. A máquina de estados é uma função pura, isolada de I/O. Toda mutação auditada roda dentro de uma `$transaction` e grava o `AuditLog` no mesmo client transacional, de forma que log e fato nunca divergem.

**Tech Stack:** Node 20 LTS, TypeScript strict, NestJS 11, Prisma 7 (`prisma-client` generator, CommonJS), PostgreSQL 17 via Docker Compose, Swagger, class-validator, Zod (validação de env), Jest + Supertest.

**Spec:** `docs/superpowers/specs/2026-07-09-theraconsulting-backend-design.md`

## Global Constraints

- Node.js `>=20.19.0`. O ambiente local tem `v20.19.6`. Não usar sintaxe ou API de Node 22.
- Prisma 7: o generator é `prisma-client` (não `prisma-client-js`), `output` é **obrigatório**, e `moduleFormat = "cjs"` é necessário porque NestJS compila para CommonJS.
- Import do client gerado: sempre `from '../../generated/prisma/client'` (ajustar profundidade relativa por arquivo). Nunca `from '@prisma/client'`.
- `tsconfig.json` precisa de `"module": "CommonJS"` e `"moduleResolution": "node"`.
- Dinheiro é sempre `Decimal(12,2)` no schema e `Prisma.Decimal` no código. `Float` e `number` para valor monetário são proibidos.
- Enums de domínio usam os valores literais do enunciado, em português: `CRIADA`, `PLANEJADA`, `AGENDADA`, `EM_TRANSPORTE`, `ENTREGUE`.
- Nenhum `switch`/`if` sobre `TransportType.code`. Autorização de transporte é resolvida por consulta a `CustomerTransportType`.
- Toda mutação auditada abre `prisma.$transaction` e passa o `tx` para o repositório e para `AuditService.record`.
- Violação de regra de negócio → HTTP `409`. Payload malformado → `400`. Recurso inexistente → `404`.
- `MAX_DELIVERIES_PER_SLOT = 5`.
- Prefixo global da API: `/api`. Swagger: `/docs`.
- Commits em português, no formato `tipo: descrição`.

---

## File Structure

```
prisma/
  schema.prisma            # models, enums, generator, datasource
  seed.ts                  # dados de exemplo idempotentes (upsert)
prisma.config.ts           # schema path, migrations path, seed command, datasource
docker-compose.yml         # apenas Postgres 17 + volume + healthcheck
.env / .env.example / .env.test
src/
  main.ts                  # bootstrap: prefixo /api, ValidationPipe, filter, Swagger
  app.module.ts            # importa ConfigModule, PrismaModule e módulos de domínio
  health.controller.ts     # GET /health
  common/
    config/env.ts          # schema Zod do env + validate()
    prisma/
      prisma.service.ts    # PrismaClient + OnModuleInit
      prisma.module.ts     # @Global()
      prisma.types.ts      # type Tx = Prisma.TransactionClient | PrismaService
    exceptions/
      domain.exception.ts  # base abstrata
      index.ts             # exceções concretas + barrel
    filters/
      all-exceptions.filter.ts
  modules/
    customers/             # controller, service, repository, dto/
    transport-types/
    items/
    sales-orders/
      domain/status-machine.ts       # função pura + spec
      domain/schedule-precondition.ts
    scheduling/
    audit/
test/
  utils/db.ts              # truncate entre testes
  *.e2e-spec.ts
```

Responsabilidade por arquivo: `status-machine.ts` sabe apenas a sequência de status. `schedule-precondition.ts` sabe apenas que `AGENDADA` exige agendamento confirmado. `AuditService` sabe apenas gravar log em um `tx` recebido — nunca abre transação. Repositórios traduzem intenção de domínio em query e não conhecem regra. Services orquestram e não escrevem SQL. Controllers só formatam HTTP.

---

## Task 1: Scaffold, Docker, Prisma e boot da aplicação

**Files:**
- Create: `package.json`, `tsconfig.json`, `nest-cli.json`, `.gitignore`, `.env`, `.env.example`, `docker-compose.yml`, `prisma.config.ts`, `prisma/schema.prisma`
- Create: `src/main.ts`, `src/app.module.ts`, `src/health.controller.ts`
- Create: `src/common/config/env.ts`, `src/common/prisma/prisma.service.ts`, `src/common/prisma/prisma.module.ts`, `src/common/prisma/prisma.types.ts`
- Test: `test/health.e2e-spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `PrismaService` (injetável, `extends PrismaClient`), `PrismaModule` (`@Global()`), `type Tx = Prisma.TransactionClient | PrismaService`, `validateEnv(config: Record<string, unknown>): Env`.

- [ ] **Step 1: Criar o projeto NestJS**

```bash
pnpm dlx @nestjs/cli@11 new . --skip-git --package-manager pnpm
```

Quando perguntar sobre sobrescrever, aceite. O diretório já contém `docs/` e `.git/`, que devem ser preservados.

- [ ] **Step 2: Instalar dependências**

```bash
pnpm add @nestjs/config @nestjs/swagger class-validator class-transformer zod @prisma/client@7
pnpm add -D prisma@7 tsx supertest @types/supertest
```

- [ ] **Step 3: Escrever o `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    container_name: ovgs-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: thera
      POSTGRES_PASSWORD: thera
      POSTGRES_DB: thera
    ports:
      - '5432:5432'
    volumes:
      - ovgs-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U thera -d thera']
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  ovgs-pgdata:
```

- [ ] **Step 4: Criar `.env` e `.env.example`**

Mesmo conteúdo nos dois arquivos:

```
DATABASE_URL=postgresql://thera:thera@localhost:5432/thera?schema=public
PORT=3000
```

Criar também `.env.test`:

```
DATABASE_URL=postgresql://thera:thera@localhost:5432/thera?schema=test
PORT=3001
```

- [ ] **Step 5: Adicionar entradas ao `.gitignore`**

Anexar ao final do `.gitignore` existente:

```
generated/
.env
.env.test
```

`.env.example` fica versionado.

- [ ] **Step 6: Escrever `prisma/schema.prisma` com generator, datasource e um model mínimo**

O model completo entra na Task 2. Aqui só precisamos que `prisma generate` produza um client.

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- [ ] **Step 7: Escrever `prisma.config.ts` na raiz**

```ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
```

- [ ] **Step 8: Subir o banco e gerar o client**

```bash
docker compose up -d
pnpm prisma generate
```

Expected: `docker compose ps` mostra `ovgs-postgres` como `healthy`. `pnpm prisma generate` cria `generated/prisma/`.

- [ ] **Step 9: Escrever a validação de env**

`src/common/config/env.ts`:

```ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Configuração de ambiente inválida: ${result.error.message}`);
  }
  return result.data;
}
```

- [ ] **Step 10: Escrever o `PrismaService`, o `PrismaModule` e o tipo `Tx`**

`src/common/prisma/prisma.service.ts`:

```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
}
```

`src/common/prisma/prisma.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

`src/common/prisma/prisma.types.ts`:

```ts
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from './prisma.service';

export type Tx = Prisma.TransactionClient | PrismaService;
```

- [ ] **Step 11: Escrever o health controller**

`src/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from './common/prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: string; database: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'up' };
  }
}
```

- [ ] **Step 12: Escrever o `app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/config/env';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

Remover `app.controller.ts`, `app.service.ts` e `app.controller.spec.ts` gerados pelo scaffold.

- [ ] **Step 13: Escrever o `main.ts`**

O `AllExceptionsFilter` só existe na Task 3; aqui o bootstrap ainda não o registra.

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('OVGS — Sistema de Gestão de Ordens de Venda')
    .setDescription('API REST para gestão do ciclo de vida de Ordens de Venda.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
```

- [ ] **Step 14: Ajustar o `tsconfig.json`**

Garantir que `compilerOptions` contenha:

```json
{
  "module": "CommonJS",
  "moduleResolution": "node",
  "strict": true,
  "strictNullChecks": true,
  "noImplicitAny": true
}
```

- [ ] **Step 15: Adicionar o script `postinstall` ao `package.json`**

Em `"scripts"`:

```json
"postinstall": "prisma generate"
```

- [ ] **Step 16: Escrever o teste e2e de health**

`test/health.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health retorna ok e banco acessível', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(response.body).toEqual({ status: 'ok', database: 'up' });
  });
});
```

- [ ] **Step 17: Rodar o teste e verificar que passa**

Run: `pnpm test:e2e`
Expected: PASS. Se falhar com erro de conexão, o Postgres não está `healthy` — confira `docker compose ps`.

- [ ] **Step 18: Commit**

```bash
git add -A
git commit -m "feat: scaffold NestJS com Prisma, Postgres, Swagger e health check"
```

---

## Task 2: Schema de domínio, migration e seed

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `prisma/migrations/*` (gerado pelo Prisma)

**Interfaces:**
- Consumes: generator e datasource da Task 1.
- Produces: models `Customer`, `TransportType`, `CustomerTransportType`, `Item`, `SalesOrder`, `SalesOrderItem`, `DeliverySchedule`, `AuditLog`; enums `SalesOrderStatus`, `ScheduleStatus`, `DeliveryWindow`, `AuditEntity`, `AuditAction`. Todos importáveis de `generated/prisma/client`.

- [ ] **Step 1: Escrever o schema completo**

Substituir o conteúdo de `prisma/schema.prisma`, preservando os blocos `generator` e `datasource` da Task 1 e acrescentando:

```prisma
enum SalesOrderStatus {
  CRIADA
  PLANEJADA
  AGENDADA
  EM_TRANSPORTE
  ENTREGUE
}

enum ScheduleStatus {
  PENDENTE
  CONFIRMADO
}

enum DeliveryWindow {
  MANHA
  TARDE
  INTEGRAL
}

enum AuditEntity {
  SALES_ORDER
  DELIVERY_SCHEDULE
}

enum AuditAction {
  ORDER_CREATED
  STATUS_CHANGED
  SCHEDULE_CHANGED
  TRANSPORT_CHANGED
}

model Customer {
  id             String                  @id @default(uuid())
  name           String
  document       String                  @unique
  email          String?
  active         Boolean                 @default(true)
  createdAt      DateTime                @default(now())
  updatedAt      DateTime                @updatedAt
  salesOrders    SalesOrder[]
  transportTypes CustomerTransportType[]
}

model TransportType {
  id          String                  @id @default(uuid())
  code        String                  @unique
  name        String
  active      Boolean                 @default(true)
  createdAt   DateTime                @default(now())
  updatedAt   DateTime                @updatedAt
  salesOrders SalesOrder[]
  customers   CustomerTransportType[]
}

model CustomerTransportType {
  customerId      String
  transportTypeId String
  createdAt       DateTime      @default(now())
  customer        Customer      @relation(fields: [customerId], references: [id])
  transportType   TransportType @relation(fields: [transportTypeId], references: [id])

  @@id([customerId, transportTypeId])
}

model Item {
  id        String           @id @default(uuid())
  sku       String           @unique
  name      String
  unitPrice Decimal          @db.Decimal(12, 2)
  active    Boolean          @default(true)
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt
  orders    SalesOrderItem[]
}

model SalesOrder {
  id              String            @id @default(uuid())
  orderNumber     Int               @unique @default(autoincrement())
  customerId      String
  transportTypeId String
  status          SalesOrderStatus  @default(CRIADA)
  total           Decimal           @db.Decimal(12, 2)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  customer        Customer          @relation(fields: [customerId], references: [id])
  transportType   TransportType     @relation(fields: [transportTypeId], references: [id])
  items           SalesOrderItem[]
  schedule        DeliverySchedule?
  auditLogs       AuditLog[]

  @@index([customerId])
  @@index([transportTypeId])
  @@index([status])
}

model SalesOrderItem {
  salesOrderId String
  itemId       String
  quantity     Int
  unitPrice    Decimal    @db.Decimal(12, 2)
  salesOrder   SalesOrder @relation(fields: [salesOrderId], references: [id])
  item         Item       @relation(fields: [itemId], references: [id])

  @@id([salesOrderId, itemId])
}

model DeliverySchedule {
  id              String         @id @default(uuid())
  salesOrderId    String         @unique
  scheduledDate   DateTime       @db.Date
  window          DeliveryWindow
  status          ScheduleStatus @default(PENDENTE)
  rescheduleCount Int            @default(0)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  salesOrder      SalesOrder     @relation(fields: [salesOrderId], references: [id])

  @@index([scheduledDate, window])
}

model AuditLog {
  id           String      @id @default(uuid())
  salesOrderId String
  entity       AuditEntity
  entityId     String
  action       AuditAction
  before       Json?
  after        Json?
  actor        String?
  createdAt    DateTime    @default(now())
  salesOrder   SalesOrder  @relation(fields: [salesOrderId], references: [id])

  @@index([salesOrderId, createdAt])
}
```

- [ ] **Step 2: Criar a migration inicial**

```bash
pnpm prisma migrate dev --name init
```

Expected: cria `prisma/migrations/<timestamp>_init/migration.sql` e regenera o client.

- [ ] **Step 3: Escrever o seed**

`prisma/seed.ts`. Usa `upsert` para ser idempotente — rodar duas vezes não duplica nem falha.

```ts
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const caminhao = await prisma.transportType.upsert({
    where: { code: 'CAMINHAO' },
    update: {},
    create: { code: 'CAMINHAO', name: 'Caminhão' },
  });
  const carreta = await prisma.transportType.upsert({
    where: { code: 'CARRETA' },
    update: {},
    create: { code: 'CARRETA', name: 'Carreta' },
  });
  await prisma.transportType.upsert({
    where: { code: 'BITRUCK' },
    update: {},
    create: { code: 'BITRUCK', name: 'Bi-truck' },
  });

  const acme = await prisma.customer.upsert({
    where: { document: '12345678000199' },
    update: {},
    create: { name: 'ACME Distribuidora', document: '12345678000199', email: 'contato@acme.com' },
  });

  await prisma.customerTransportType.upsert({
    where: {
      customerId_transportTypeId: { customerId: acme.id, transportTypeId: caminhao.id },
    },
    update: {},
    create: { customerId: acme.id, transportTypeId: caminhao.id },
  });
  await prisma.customerTransportType.upsert({
    where: {
      customerId_transportTypeId: { customerId: acme.id, transportTypeId: carreta.id },
    },
    update: {},
    create: { customerId: acme.id, transportTypeId: carreta.id },
  });

  await prisma.item.upsert({
    where: { sku: 'SKU-001' },
    update: {},
    create: { sku: 'SKU-001', name: 'Palete de água 500ml', unitPrice: '129.90' },
  });
  await prisma.item.upsert({
    where: { sku: 'SKU-002' },
    update: {},
    create: { sku: 'SKU-002', name: 'Caixa de refrigerante 2L', unitPrice: '89.50' },
  });

  console.log('Seed concluído.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

Note que `unitPrice` recebe **string**, não `number`. Passar `129.90` como literal numérico introduz o erro de ponto flutuante que o `Decimal` existe para evitar.

- [ ] **Step 4: Rodar o seed e verificar**

```bash
pnpm prisma db seed
pnpm prisma db seed
```

Expected: as duas execuções imprimem `Seed concluído.` sem erro de constraint única. Essa é a prova de idempotência.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: modelar schema de domínio, migration inicial e seed idempotente"
```

---

## Task 3: Exceções de domínio e filtro global

**Files:**
- Create: `src/common/exceptions/domain.exception.ts`, `src/common/exceptions/index.ts`
- Create: `src/common/filters/all-exceptions.filter.ts`
- Modify: `src/main.ts`
- Test: `src/common/filters/all-exceptions.filter.spec.ts`

**Interfaces:**
- Consumes: enums de `generated/prisma/client` (Task 2).
- Produces:
  - `abstract class DomainException extends Error { readonly status: number; readonly error: string }`
  - `class EntityNotFoundException extends DomainException` — `constructor(entity: string, id: string)`, status 404
  - `class InvalidStatusTransitionException` — `constructor(from: SalesOrderStatus, to: SalesOrderStatus)`, status 409
  - `class TransportTypeNotAllowedException` — `constructor(customerId: string, transportTypeId: string)`, status 409
  - `class ScheduleAlreadyExistsException` — `constructor(salesOrderId: string)`, status 409
  - `class ScheduleAlreadyConfirmedException` — `constructor(salesOrderId: string)`, status 409
  - `class SlotUnavailableException` — `constructor(date: string, window: string)`, status 409
  - `class OrderNotSchedulableException` — `constructor(message: string)`, status 409
  - `class AllExceptionsFilter implements ExceptionFilter`

- [ ] **Step 1: Escrever o teste do filtro**

`src/common/filters/all-exceptions.filter.spec.ts`:

```ts
import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { InvalidStatusTransitionException } from '../exceptions';
import { SalesOrderStatus } from '../../../generated/prisma/client';

function makeHost(): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/api/sales-orders/abc/status' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('mapeia exceção de domínio para o status e o código dela', () => {
    const { host, json, status } = makeHost();

    filter.catch(
      new InvalidStatusTransitionException(SalesOrderStatus.CRIADA, SalesOrderStatus.ENTREGUE),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        error: 'InvalidStatusTransition',
        message: 'Transição de CRIADA para ENTREGUE não é permitida.',
        path: '/api/sales-orders/abc/status',
      }),
    );
  });

  it('mapeia HttpException do Nest preservando o status', () => {
    const { host, json, status } = makeHost();

    filter.catch(new NotFoundException('não achei'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('mapeia erro desconhecido para 500 sem vazar a mensagem interna', () => {
    const { host, json, status } = makeHost();

    filter.catch(new Error('senha do banco vazou aqui'), host);

    expect(status).toHaveBeenCalledWith(500);
    const payload = json.mock.calls[0][0] as { message: string };
    expect(payload.message).toBe('Erro interno do servidor.');
    expect(payload.message).not.toContain('senha');
  });
});
```

- [ ] **Step 2: Rodar o teste e verificar que falha**

Run: `pnpm test -- all-exceptions.filter.spec`
Expected: FAIL — `Cannot find module './all-exceptions.filter'`.

- [ ] **Step 3: Escrever a base das exceções**

`src/common/exceptions/domain.exception.ts`:

```ts
export abstract class DomainException extends Error {
  abstract readonly status: number;
  abstract readonly error: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
```

- [ ] **Step 4: Escrever as exceções concretas**

`src/common/exceptions/index.ts`:

```ts
import { SalesOrderStatus } from '../../../generated/prisma/client';
import { DomainException } from './domain.exception';

export { DomainException };

export class EntityNotFoundException extends DomainException {
  readonly status = 404;
  readonly error = 'EntityNotFound';

  constructor(entity: string, id: string) {
    super(`${entity} com id ${id} não foi encontrado.`);
  }
}

export class InvalidStatusTransitionException extends DomainException {
  readonly status = 409;
  readonly error = 'InvalidStatusTransition';

  constructor(from: SalesOrderStatus, to: SalesOrderStatus) {
    super(`Transição de ${from} para ${to} não é permitida.`);
  }
}

export class TransportTypeNotAllowedException extends DomainException {
  readonly status = 409;
  readonly error = 'TransportTypeNotAllowed';

  constructor(customerId: string, transportTypeId: string) {
    super(`Tipo de transporte ${transportTypeId} não está autorizado para o cliente ${customerId}.`);
  }
}

export class ScheduleAlreadyExistsException extends DomainException {
  readonly status = 409;
  readonly error = 'ScheduleAlreadyExists';

  constructor(salesOrderId: string) {
    super(`A ordem de venda ${salesOrderId} já possui agendamento.`);
  }
}

export class ScheduleAlreadyConfirmedException extends DomainException {
  readonly status = 409;
  readonly error = 'ScheduleAlreadyConfirmed';

  constructor(salesOrderId: string) {
    super(`O agendamento da ordem de venda ${salesOrderId} já está confirmado.`);
  }
}

export class SlotUnavailableException extends DomainException {
  readonly status = 409;
  readonly error = 'SlotUnavailable';

  constructor(date: string, window: string) {
    super(`Não há capacidade disponível em ${date} na janela ${window}.`);
  }
}

export class OrderNotSchedulableException extends DomainException {
  readonly status = 409;
  readonly error = 'OrderNotSchedulable';

  constructor(message: string) {
    super(message);
  }
}
```

- [ ] **Step 5: Escrever o filtro**

`src/common/filters/all-exceptions.filter.ts`:

```ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainException } from '../exceptions/domain.exception';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  path: string;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const body = this.toBody(exception, request.url);
    if (body.statusCode >= 500) {
      this.logger.error(exception);
    }
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, path: string): ErrorBody {
    const timestamp = new Date().toISOString();

    if (exception instanceof DomainException) {
      return {
        statusCode: exception.status,
        error: exception.error,
        message: exception.message,
        path,
        timestamp,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      return {
        statusCode: status,
        error: exception.name.replace(/Exception$/, ''),
        message: Array.isArray(message) ? message.join('; ') : message,
        path,
        timestamp,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: 'Erro interno do servidor.',
      path,
      timestamp,
    };
  }
}
```

- [ ] **Step 6: Rodar o teste e verificar que passa**

Run: `pnpm test -- all-exceptions.filter.spec`
Expected: PASS, 3 testes.

- [ ] **Step 7: Registrar o filtro no `main.ts`**

Adicionar em `bootstrap()`, logo após `useGlobalPipes`:

```ts
app.useGlobalFilters(new AllExceptionsFilter());
```

E o import correspondente:

```ts
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: exceções de domínio e filtro global de erros"
```

---

## Task 4: Máquina de estados e pré-condição de agendamento

**Files:**
- Create: `src/modules/sales-orders/domain/status-machine.ts`
- Create: `src/modules/sales-orders/domain/schedule-precondition.ts`
- Test: `src/modules/sales-orders/domain/status-machine.spec.ts`
- Test: `src/modules/sales-orders/domain/schedule-precondition.spec.ts`

**Interfaces:**
- Consumes: `SalesOrderStatus`, `ScheduleStatus` de `generated/prisma/client`; `InvalidStatusTransitionException`, `OrderNotSchedulableException` da Task 3.
- Produces:
  - `NEXT_STATUS: Record<SalesOrderStatus, SalesOrderStatus | null>`
  - `assertTransition(from: SalesOrderStatus, to: SalesOrderStatus): void`
  - `assertSchedulePrecondition(to: SalesOrderStatus, schedule: { status: ScheduleStatus } | null): void`

- [ ] **Step 1: Escrever o teste da máquina de estados**

A regra central do desafio. Testada por exaustão: as 25 combinações, via tabela.

`src/modules/sales-orders/domain/status-machine.spec.ts`:

```ts
import { SalesOrderStatus } from '../../../../generated/prisma/client';
import { InvalidStatusTransitionException } from '../../../common/exceptions';
import { assertTransition, NEXT_STATUS } from './status-machine';

const ALL = Object.values(SalesOrderStatus);

const VALID: ReadonlyArray<[SalesOrderStatus, SalesOrderStatus]> = [
  [SalesOrderStatus.CRIADA, SalesOrderStatus.PLANEJADA],
  [SalesOrderStatus.PLANEJADA, SalesOrderStatus.AGENDADA],
  [SalesOrderStatus.AGENDADA, SalesOrderStatus.EM_TRANSPORTE],
  [SalesOrderStatus.EM_TRANSPORTE, SalesOrderStatus.ENTREGUE],
];

function isValid(from: SalesOrderStatus, to: SalesOrderStatus): boolean {
  return VALID.some(([f, t]) => f === from && t === to);
}

describe('status-machine', () => {
  it('cobre os cinco estados do fluxo', () => {
    expect(ALL).toHaveLength(5);
    expect(Object.keys(NEXT_STATUS)).toHaveLength(5);
  });

  it('ENTREGUE é terminal', () => {
    expect(NEXT_STATUS[SalesOrderStatus.ENTREGUE]).toBeNull();
  });

  describe.each(ALL)('a partir de %s', (from) => {
    it.each(ALL)(`para %s`, (to) => {
      if (isValid(from, to)) {
        expect(() => assertTransition(from, to)).not.toThrow();
      } else {
        expect(() => assertTransition(from, to)).toThrow(InvalidStatusTransitionException);
      }
    });
  });

  it('rejeita as 21 transições inválidas', () => {
    const invalid = ALL.flatMap((from) => ALL.filter((to) => !isValid(from, to)));
    expect(invalid).toHaveLength(21);
  });
});
```

- [ ] **Step 2: Rodar o teste e verificar que falha**

Run: `pnpm test -- status-machine.spec`
Expected: FAIL — `Cannot find module './status-machine'`.

- [ ] **Step 3: Implementar a máquina de estados**

`src/modules/sales-orders/domain/status-machine.ts`:

```ts
import { SalesOrderStatus } from '../../../../generated/prisma/client';
import { InvalidStatusTransitionException } from '../../../common/exceptions';

export const NEXT_STATUS: Record<SalesOrderStatus, SalesOrderStatus | null> = {
  [SalesOrderStatus.CRIADA]: SalesOrderStatus.PLANEJADA,
  [SalesOrderStatus.PLANEJADA]: SalesOrderStatus.AGENDADA,
  [SalesOrderStatus.AGENDADA]: SalesOrderStatus.EM_TRANSPORTE,
  [SalesOrderStatus.EM_TRANSPORTE]: SalesOrderStatus.ENTREGUE,
  [SalesOrderStatus.ENTREGUE]: null,
};

export function assertTransition(from: SalesOrderStatus, to: SalesOrderStatus): void {
  if (NEXT_STATUS[from] !== to) {
    throw new InvalidStatusTransitionException(from, to);
  }
}
```

- [ ] **Step 4: Rodar o teste e verificar que passa**

Run: `pnpm test -- status-machine.spec`
Expected: PASS, 28 testes (25 da matriz + 3 estruturais).

- [ ] **Step 5: Escrever o teste da pré-condição**

`src/modules/sales-orders/domain/schedule-precondition.spec.ts`:

```ts
import { SalesOrderStatus, ScheduleStatus } from '../../../../generated/prisma/client';
import { OrderNotSchedulableException } from '../../../common/exceptions';
import { assertSchedulePrecondition } from './schedule-precondition';

describe('assertSchedulePrecondition', () => {
  it('rejeita AGENDADA sem agendamento', () => {
    expect(() => assertSchedulePrecondition(SalesOrderStatus.AGENDADA, null)).toThrow(
      OrderNotSchedulableException,
    );
  });

  it('rejeita AGENDADA com agendamento apenas PENDENTE', () => {
    expect(() =>
      assertSchedulePrecondition(SalesOrderStatus.AGENDADA, { status: ScheduleStatus.PENDENTE }),
    ).toThrow(OrderNotSchedulableException);
  });

  it('aceita AGENDADA com agendamento CONFIRMADO', () => {
    expect(() =>
      assertSchedulePrecondition(SalesOrderStatus.AGENDADA, { status: ScheduleStatus.CONFIRMADO }),
    ).not.toThrow();
  });

  it('ignora a pré-condição para alvos diferentes de AGENDADA', () => {
    expect(() => assertSchedulePrecondition(SalesOrderStatus.PLANEJADA, null)).not.toThrow();
    expect(() => assertSchedulePrecondition(SalesOrderStatus.ENTREGUE, null)).not.toThrow();
  });
});
```

- [ ] **Step 6: Rodar o teste e verificar que falha**

Run: `pnpm test -- schedule-precondition.spec`
Expected: FAIL — `Cannot find module './schedule-precondition'`.

- [ ] **Step 7: Implementar a pré-condição**

`src/modules/sales-orders/domain/schedule-precondition.ts`:

```ts
import { SalesOrderStatus, ScheduleStatus } from '../../../../generated/prisma/client';
import { OrderNotSchedulableException } from '../../../common/exceptions';

export function assertSchedulePrecondition(
  to: SalesOrderStatus,
  schedule: { status: ScheduleStatus } | null,
): void {
  if (to !== SalesOrderStatus.AGENDADA) {
    return;
  }
  if (schedule === null) {
    throw new OrderNotSchedulableException(
      'A ordem de venda não pode ser AGENDADA sem um agendamento de entrega.',
    );
  }
  if (schedule.status !== ScheduleStatus.CONFIRMADO) {
    throw new OrderNotSchedulableException(
      'A ordem de venda não pode ser AGENDADA porque o agendamento ainda não foi confirmado.',
    );
  }
}
```

- [ ] **Step 8: Rodar o teste e verificar que passa**

Run: `pnpm test -- schedule-precondition.spec`
Expected: PASS, 4 testes.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: máquina de estados linear da OV e pré-condição de agendamento"
```

---

## Task 5: Módulo de auditoria (serviço)

**Files:**
- Create: `src/modules/audit/audit.service.ts`, `src/modules/audit/audit.module.ts`
- Create: `src/modules/audit/audit.repository.ts`
- Create: `src/modules/audit/dto/record-audit.dto.ts`
- Modify: `src/app.module.ts`
- Test: `src/modules/audit/audit.service.spec.ts`

**Interfaces:**
- Consumes: `Tx` (Task 1); `AuditEntity`, `AuditAction`, `Prisma` (Task 2).
- Produces:
  - `interface RecordAuditInput { salesOrderId: string; entity: AuditEntity; entityId: string; action: AuditAction; before: Prisma.InputJsonValue | null; after: Prisma.InputJsonValue | null; actor: string | null }`
  - `AuditService.record(tx: Tx, input: RecordAuditInput): Promise<void>`
  - `AuditService.listBySalesOrder(salesOrderId: string): Promise<AuditLog[]>`
  - `AuditModule` exportando `AuditService`

- [ ] **Step 1: Escrever o teste do serviço**

O ponto que precisa ser provado: `record` escreve no `tx` recebido, nunca no `PrismaService` global. É isso que torna a auditoria transacional.

`src/modules/audit/audit.service.spec.ts`:

```ts
import { AuditAction, AuditEntity } from '../../../generated/prisma/client';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';
import { Tx } from '../../common/prisma/prisma.types';

describe('AuditService', () => {
  it('grava o log usando o client transacional recebido', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const repository = { create, listBySalesOrder: jest.fn() } as unknown as AuditRepository;
    const service = new AuditService(repository);
    const tx = { marker: 'transactional-client' } as unknown as Tx;

    await service.record(tx, {
      salesOrderId: 'order-1',
      entity: AuditEntity.SALES_ORDER,
      entityId: 'order-1',
      action: AuditAction.STATUS_CHANGED,
      before: { status: 'CRIADA' },
      after: { status: 'PLANEJADA' },
      actor: 'system',
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: AuditAction.STATUS_CHANGED, actor: 'system' }),
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e verificar que falha**

Run: `pnpm test -- audit.service.spec`
Expected: FAIL — `Cannot find module './audit.repository'`.

- [ ] **Step 3: Escrever o DTO de entrada**

`src/modules/audit/dto/record-audit.dto.ts`:

```ts
import { AuditAction, AuditEntity, Prisma } from '../../../../generated/prisma/client';

export interface RecordAuditInput {
  salesOrderId: string;
  entity: AuditEntity;
  entityId: string;
  action: AuditAction;
  before: Prisma.InputJsonValue | null;
  after: Prisma.InputJsonValue | null;
  actor: string | null;
}
```

- [ ] **Step 4: Escrever o repositório**

`src/modules/audit/audit.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Tx } from '../../common/prisma/prisma.types';
import { RecordAuditInput } from './dto/record-audit.dto';

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: Tx, input: RecordAuditInput): Promise<void> {
    await tx.auditLog.create({
      data: {
        salesOrderId: input.salesOrderId,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        before: input.before ?? Prisma.DbNull,
        after: input.after ?? Prisma.DbNull,
        actor: input.actor,
      },
    });
  }

  listBySalesOrder(salesOrderId: string): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      where: { salesOrderId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
```

- [ ] **Step 5: Escrever o serviço**

`src/modules/audit/audit.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { AuditLog } from '../../../generated/prisma/client';
import { Tx } from '../../common/prisma/prisma.types';
import { AuditRepository } from './audit.repository';
import { RecordAuditInput } from './dto/record-audit.dto';

@Injectable()
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  /**
   * Recebe o client transacional do chamador. Nunca abre transação própria:
   * o log precisa sofrer rollback junto com a mutação que o originou.
   */
  record(tx: Tx, input: RecordAuditInput): Promise<void> {
    return this.repository.create(tx, input);
  }

  listBySalesOrder(salesOrderId: string): Promise<AuditLog[]> {
    return this.repository.listBySalesOrder(salesOrderId);
  }
}
```

- [ ] **Step 6: Escrever o módulo**

`src/modules/audit/audit.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

@Module({
  providers: [AuditService, AuditRepository],
  exports: [AuditService],
})
export class AuditModule {}
```

- [ ] **Step 7: Rodar o teste e verificar que passa**

Run: `pnpm test -- audit.service.spec`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: serviço de auditoria transacional"
```

---

## Task 6: Módulo de clientes

**Files:**
- Create: `src/modules/customers/customers.controller.ts`, `customers.service.ts`, `customers.repository.ts`, `customers.module.ts`
- Create: `src/modules/customers/dto/create-customer.dto.ts`, `update-customer.dto.ts`, `link-transport-types.dto.ts`, `customer.response.ts`
- Modify: `src/app.module.ts`
- Test: `test/customers.e2e-spec.ts`, `test/utils/db.ts`

**Interfaces:**
- Consumes: `PrismaService`, `Tx`, `EntityNotFoundException`.
- Produces:
  - `CustomersRepository.findById(id: string, tx?: Tx): Promise<Customer | null>`
  - `CustomersRepository.isTransportAuthorized(customerId: string, transportTypeId: string, tx?: Tx): Promise<boolean>` — usada pelo módulo de sales-orders
  - `CustomersService.findByIdOrThrow(id: string): Promise<Customer>`
  - `CustomersModule` exportando `CustomersRepository`

- [ ] **Step 1: Escrever o utilitário de limpeza de banco para e2e**

`test/utils/db.ts`:

```ts
import { PrismaClient } from '../../generated/prisma/client';

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog",
      "DeliverySchedule",
      "SalesOrderItem",
      "SalesOrder",
      "CustomerTransportType",
      "Item",
      "Customer",
      "TransportType"
    RESTART IDENTITY CASCADE
  `);
}
```

`RESTART IDENTITY` zera a sequence de `orderNumber`, deixando cada teste com numeração previsível.

- [ ] **Step 2: Escrever o teste e2e de clientes**

`test/customers.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { truncateAll } from './utils/db';

describe('Customers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('cria, consulta, lista e atualiza um cliente', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/customers')
      .send({ name: 'ACME', document: '12345678000199', email: 'a@acme.com' })
      .expect(201);

    expect(created.body).toMatchObject({ name: 'ACME', active: true });

    const id = created.body.id as string;

    await request(app.getHttpServer()).get(`/api/customers/${id}`).expect(200);
    const list = await request(app.getHttpServer()).get('/api/customers').expect(200);
    expect(list.body).toHaveLength(1);

    const updated = await request(app.getHttpServer())
      .patch(`/api/customers/${id}`)
      .send({ active: false })
      .expect(200);
    expect(updated.body.active).toBe(false);
  });

  it('rejeita documento duplicado com 409', async () => {
    const payload = { name: 'ACME', document: '12345678000199' };
    await request(app.getHttpServer()).post('/api/customers').send(payload).expect(201);
    await request(app.getHttpServer()).post('/api/customers').send(payload).expect(409);
  });

  it('rejeita campo desconhecido com 400', async () => {
    await request(app.getHttpServer())
      .post('/api/customers')
      .send({ name: 'ACME', document: '123', hacker: true })
      .expect(400);
  });

  it('retorna 404 para cliente inexistente', async () => {
    await request(app.getHttpServer())
      .get('/api/customers/6f0f0b3e-0000-4000-8000-000000000000')
      .expect(404);
  });

  it('vincula tipos de transporte de forma aditiva e idempotente', async () => {
    const customer = await request(app.getHttpServer())
      .post('/api/customers')
      .send({ name: 'ACME', document: '12345678000199' })
      .expect(201);
    const transport = await prisma.transportType.create({
      data: { code: 'CAMINHAO', name: 'Caminhão' },
    });

    const body = { transportTypeIds: [transport.id] };
    await request(app.getHttpServer())
      .post(`/api/customers/${customer.body.id}/transport-types`)
      .send(body)
      .expect(200);

    // reenviar o mesmo corpo não muda estado nem falha
    const second = await request(app.getHttpServer())
      .post(`/api/customers/${customer.body.id}/transport-types`)
      .send(body)
      .expect(200);

    expect(second.body.transportTypeIds).toEqual([transport.id]);
  });
});
```

- [ ] **Step 3: Rodar o teste e verificar que falha**

Run: `pnpm test:e2e -- customers`
Expected: FAIL — todas as rotas retornam 404, porque o módulo não existe.

- [ ] **Step 4: Escrever os DTOs**

`src/modules/customers/dto/create-customer.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'ACME Distribuidora' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '12345678000199' })
  @IsString()
  @Length(11, 14)
  document!: string;

  @ApiPropertyOptional({ example: 'contato@acme.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
```

`src/modules/customers/dto/update-customer.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Baixa lógica. Não existe DELETE nesta API.' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
```

`src/modules/customers/dto/link-transport-types.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class LinkTransportTypesDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  transportTypeIds!: string[];
}
```

`src/modules/customers/dto/customer.response.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Customer } from '../../../../generated/prisma/client';

export class CustomerResponse {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() document!: string;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiProperty() active!: boolean;
  @ApiProperty() createdAt!: Date;

  static from(customer: Customer): CustomerResponse {
    return {
      id: customer.id,
      name: customer.name,
      document: customer.document,
      email: customer.email,
      active: customer.active,
      createdAt: customer.createdAt,
    };
  }
}
```

O model do Prisma nunca é serializado direto. Uma coluna nova no schema não vaza para a resposta sem alguém decidir.

- [ ] **Step 5: Escrever o repositório**

`src/modules/customers/customers.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Customer, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Tx } from '../../common/prisma/prisma.types';

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.CustomerCreateInput): Promise<Customer> {
    return this.prisma.customer.create({ data });
  }

  findAll(): Promise<Customer[]> {
    return this.prisma.customer.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findById(id: string, tx: Tx = this.prisma): Promise<Customer | null> {
    return tx.customer.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.CustomerUpdateInput): Promise<Customer> {
    return this.prisma.customer.update({ where: { id }, data });
  }

  async isTransportAuthorized(
    customerId: string,
    transportTypeId: string,
    tx: Tx = this.prisma,
  ): Promise<boolean> {
    const link = await tx.customerTransportType.findUnique({
      where: { customerId_transportTypeId: { customerId, transportTypeId } },
    });
    return link !== null;
  }

  async linkTransportTypes(customerId: string, transportTypeIds: string[]): Promise<void> {
    await this.prisma.customerTransportType.createMany({
      data: transportTypeIds.map((transportTypeId) => ({ customerId, transportTypeId })),
      skipDuplicates: true,
    });
  }

  async listTransportTypeIds(customerId: string): Promise<string[]> {
    const links = await this.prisma.customerTransportType.findMany({
      where: { customerId },
      select: { transportTypeId: true },
    });
    return links.map((link) => link.transportTypeId);
  }
}
```

`skipDuplicates: true` é o que torna o vínculo idempotente: reenviar o mesmo corpo não gera erro de chave duplicada.

- [ ] **Step 6: Escrever o serviço**

`src/modules/customers/customers.service.ts`:

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { Customer, Prisma } from '../../../generated/prisma/client';
import { EntityNotFoundException } from '../../common/exceptions';
import { CustomersRepository } from './customers.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly repository: CustomersRepository) {}

  async create(dto: CreateCustomerDto): Promise<Customer> {
    try {
      return await this.repository.create(dto);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Já existe um cliente com o documento ${dto.document}.`);
      }
      throw error;
    }
  }

  findAll(): Promise<Customer[]> {
    return this.repository.findAll();
  }

  async findByIdOrThrow(id: string): Promise<Customer> {
    const customer = await this.repository.findById(id);
    if (customer === null) {
      throw new EntityNotFoundException('Cliente', id);
    }
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    await this.findByIdOrThrow(id);
    return this.repository.update(id, dto);
  }

  async linkTransportTypes(id: string, transportTypeIds: string[]): Promise<string[]> {
    await this.findByIdOrThrow(id);
    try {
      await this.repository.linkTransportTypes(id, transportTypeIds);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new EntityNotFoundException('TipoTransporte', transportTypeIds.join(', '));
      }
      throw error;
    }
    return this.repository.listTransportTypeIds(id);
  }
}
```

`P2002` é violação de unique; `P2003`, de foreign key. Traduzir o código do Prisma na fronteira do service evita que o resto do sistema conheça o vocabulário do ORM.

- [ ] **Step 7: Escrever o controller**

`src/modules/customers/customers.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerResponse } from './dto/customer.response';
import { LinkTransportTypesDto } from './dto/link-transport-types.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um cliente' })
  async create(@Body() dto: CreateCustomerDto): Promise<CustomerResponse> {
    return CustomerResponse.from(await this.service.create(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lista os clientes' })
  async findAll(): Promise<CustomerResponse[]> {
    const customers = await this.service.findAll();
    return customers.map(CustomerResponse.from);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta um cliente' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerResponse> {
    return CustomerResponse.from(await this.service.findByIdOrThrow(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza um cliente. Baixa lógica via active: false.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerResponse> {
    return CustomerResponse.from(await this.service.update(id, dto));
  }

  @Post(':id/transport-types')
  @ApiOperation({ summary: 'Autoriza tipos de transporte. Aditivo e idempotente.' })
  async linkTransportTypes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkTransportTypesDto,
  ): Promise<{ transportTypeIds: string[] }> {
    const transportTypeIds = await this.service.linkTransportTypes(id, dto.transportTypeIds);
    return { transportTypeIds };
  }
}
```

`@Post(':id/transport-types')` devolve 201 por padrão no Nest. O teste espera 200. Adicione `@HttpCode(200)` do `@nestjs/common` ao método, e o import correspondente.

- [ ] **Step 8: Escrever o módulo e registrar no `app.module.ts`**

`src/modules/customers/customers.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CustomersRepository],
  exports: [CustomersRepository],
})
export class CustomersModule {}
```

Em `src/app.module.ts`, adicionar `CustomersModule` e `AuditModule` ao array `imports`.

- [ ] **Step 9: Rodar o teste e verificar que passa**

Run: `pnpm test:e2e -- customers`
Expected: PASS, 5 testes.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: módulo de clientes com autorização de tipos de transporte"
```

---

## Task 7: Módulos de tipos de transporte e itens

Dois cadastros simples, sem regra de negócio própria. Ficam na mesma task porque nenhum revisor aprovaria um e rejeitaria o outro.

**Files:**
- Create: `src/modules/transport-types/transport-types.controller.ts`, `transport-types.service.ts`, `transport-types.repository.ts`, `transport-types.module.ts`, `dto/create-transport-type.dto.ts`, `dto/update-transport-type.dto.ts`, `dto/transport-type.response.ts`
- Create: `src/modules/items/items.controller.ts`, `items.service.ts`, `items.repository.ts`, `items.module.ts`, `dto/create-item.dto.ts`, `dto/item.response.ts`
- Modify: `src/app.module.ts`
- Test: `test/catalog.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `Tx`, `EntityNotFoundException`.
- Produces:
  - `TransportTypesRepository.findById(id: string, tx?: Tx): Promise<TransportType | null>`
  - `ItemsRepository.findManyByIds(ids: string[], tx?: Tx): Promise<Item[]>` — usada por sales-orders
  - `TransportTypesModule` exportando `TransportTypesRepository`; `ItemsModule` exportando `ItemsRepository`

Não existe `GET /transport-types/:id` nem `PATCH /items/:id`: o enunciado lista Itens como "Criar; Consultar" apenas, e não pede consulta unitária de transporte.

- [ ] **Step 1: Escrever o teste e2e do catálogo**

`test/catalog.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { truncateAll } from './utils/db';

describe('Catálogo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('cria, lista e edita um tipo de transporte', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/transport-types')
      .send({ code: 'BITRUCK', name: 'Bi-truck' })
      .expect(201);

    await request(app.getHttpServer()).get('/api/transport-types').expect(200);

    const updated = await request(app.getHttpServer())
      .patch(`/api/transport-types/${created.body.id}`)
      .send({ name: 'Bi-truck 14t' })
      .expect(200);
    expect(updated.body.name).toBe('Bi-truck 14t');
  });

  it('rejeita code duplicado de transporte com 409', async () => {
    const payload = { code: 'CARRETA', name: 'Carreta' };
    await request(app.getHttpServer()).post('/api/transport-types').send(payload).expect(201);
    await request(app.getHttpServer()).post('/api/transport-types').send(payload).expect(409);
  });

  it('cria, lista e consulta um item preservando a precisão decimal', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/items')
      .send({ sku: 'SKU-001', name: 'Palete', unitPrice: '129.90' })
      .expect(201);

    expect(created.body.unitPrice).toBe('129.90');

    await request(app.getHttpServer()).get('/api/items').expect(200);
    const one = await request(app.getHttpServer())
      .get(`/api/items/${created.body.id}`)
      .expect(200);
    expect(one.body.unitPrice).toBe('129.90');
  });

  it('rejeita sku duplicado com 409', async () => {
    const payload = { sku: 'SKU-001', name: 'Palete', unitPrice: '10.00' };
    await request(app.getHttpServer()).post('/api/items').send(payload).expect(201);
    await request(app.getHttpServer()).post('/api/items').send(payload).expect(409);
  });

  it('retorna 404 para item inexistente', async () => {
    await request(app.getHttpServer())
      .get('/api/items/6f0f0b3e-0000-4000-8000-000000000000')
      .expect(404);
  });
});
```

`unitPrice` entra e sai como **string**. Serializar `Decimal` como `number` reintroduz o erro de ponto flutuante na fronteira HTTP.

- [ ] **Step 2: Rodar o teste e verificar que falha**

Run: `pnpm test:e2e -- catalog`
Expected: FAIL — rotas retornam 404.

- [ ] **Step 3: Escrever os DTOs de tipo de transporte**

`src/modules/transport-types/dto/create-transport-type.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateTransportTypeDto {
  @ApiProperty({ example: 'BITRUCK', description: 'Identificador estável, em maiúsculas.' })
  @IsString()
  @Matches(/^[A-Z0-9_]+$/, { message: 'code deve conter apenas A-Z, 0-9 e _' })
  code!: string;

  @ApiProperty({ example: 'Bi-truck' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
```

`src/modules/transport-types/dto/update-transport-type.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateTransportTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ description: 'Baixa lógica.' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
```

`code` não é editável: ele é o identificador estável do tipo de transporte, e outras entidades já o referenciam.

`src/modules/transport-types/dto/transport-type.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { TransportType } from '../../../../generated/prisma/client';

export class TransportTypeResponse {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() active!: boolean;

  static from(transportType: TransportType): TransportTypeResponse {
    return {
      id: transportType.id,
      code: transportType.code,
      name: transportType.name,
      active: transportType.active,
    };
  }
}
```

- [ ] **Step 4: Escrever o repositório, o serviço, o controller e o módulo de tipos de transporte**

`src/modules/transport-types/transport-types.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma, TransportType } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Tx } from '../../common/prisma/prisma.types';

@Injectable()
export class TransportTypesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.TransportTypeCreateInput): Promise<TransportType> {
    return this.prisma.transportType.create({ data });
  }

  findAll(): Promise<TransportType[]> {
    return this.prisma.transportType.findMany({ orderBy: { code: 'asc' } });
  }

  findById(id: string, tx: Tx = this.prisma): Promise<TransportType | null> {
    return tx.transportType.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.TransportTypeUpdateInput): Promise<TransportType> {
    return this.prisma.transportType.update({ where: { id }, data });
  }
}
```

`src/modules/transport-types/transport-types.service.ts`:

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, TransportType } from '../../../generated/prisma/client';
import { EntityNotFoundException } from '../../common/exceptions';
import { CreateTransportTypeDto } from './dto/create-transport-type.dto';
import { UpdateTransportTypeDto } from './dto/update-transport-type.dto';
import { TransportTypesRepository } from './transport-types.repository';

@Injectable()
export class TransportTypesService {
  constructor(private readonly repository: TransportTypesRepository) {}

  async create(dto: CreateTransportTypeDto): Promise<TransportType> {
    try {
      return await this.repository.create(dto);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Já existe um tipo de transporte com o código ${dto.code}.`);
      }
      throw error;
    }
  }

  findAll(): Promise<TransportType[]> {
    return this.repository.findAll();
  }

  async findByIdOrThrow(id: string): Promise<TransportType> {
    const transportType = await this.repository.findById(id);
    if (transportType === null) {
      throw new EntityNotFoundException('TipoTransporte', id);
    }
    return transportType;
  }

  async update(id: string, dto: UpdateTransportTypeDto): Promise<TransportType> {
    await this.findByIdOrThrow(id);
    return this.repository.update(id, dto);
  }
}
```

`src/modules/transport-types/transport-types.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateTransportTypeDto } from './dto/create-transport-type.dto';
import { TransportTypeResponse } from './dto/transport-type.response';
import { UpdateTransportTypeDto } from './dto/update-transport-type.dto';
import { TransportTypesService } from './transport-types.service';

@ApiTags('transport-types')
@Controller('transport-types')
export class TransportTypesController {
  constructor(private readonly service: TransportTypesService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um tipo de transporte' })
  async create(@Body() dto: CreateTransportTypeDto): Promise<TransportTypeResponse> {
    return TransportTypeResponse.from(await this.service.create(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lista os tipos de transporte' })
  async findAll(): Promise<TransportTypeResponse[]> {
    const transportTypes = await this.service.findAll();
    return transportTypes.map(TransportTypeResponse.from);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza um tipo de transporte. O code é imutável.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransportTypeDto,
  ): Promise<TransportTypeResponse> {
    return TransportTypeResponse.from(await this.service.update(id, dto));
  }
}
```

`src/modules/transport-types/transport-types.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TransportTypesController } from './transport-types.controller';
import { TransportTypesRepository } from './transport-types.repository';
import { TransportTypesService } from './transport-types.service';

@Module({
  controllers: [TransportTypesController],
  providers: [TransportTypesService, TransportTypesRepository],
  exports: [TransportTypesRepository],
})
export class TransportTypesModule {}
```

- [ ] **Step 5: Escrever os DTOs de item**

`src/modules/items/dto/create-item.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsNotEmpty, IsString } from 'class-validator';

export class CreateItemDto {
  @ApiProperty({ example: 'SKU-001' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ example: 'Palete de água 500ml' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: '129.90',
    description: 'Valor monetário como string, com duas casas. Nunca number.',
  })
  @IsDecimal({ decimal_digits: '1,2' })
  unitPrice!: string;
}
```

`src/modules/items/dto/item.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Item } from '../../../../generated/prisma/client';

export class ItemResponse {
  @ApiProperty() id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, example: '129.90' }) unitPrice!: string;
  @ApiProperty() active!: boolean;

  static from(item: Item): ItemResponse {
    return {
      id: item.id,
      sku: item.sku,
      name: item.name,
      unitPrice: item.unitPrice.toFixed(2),
      active: item.active,
    };
  }
}
```

- [ ] **Step 6: Escrever o repositório, o serviço, o controller e o módulo de itens**

`src/modules/items/items.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Item, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Tx } from '../../common/prisma/prisma.types';

@Injectable()
export class ItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ItemCreateInput): Promise<Item> {
    return this.prisma.item.create({ data });
  }

  findAll(): Promise<Item[]> {
    return this.prisma.item.findMany({ orderBy: { sku: 'asc' } });
  }

  findById(id: string): Promise<Item | null> {
    return this.prisma.item.findUnique({ where: { id } });
  }

  findManyByIds(ids: string[], tx: Tx = this.prisma): Promise<Item[]> {
    return tx.item.findMany({ where: { id: { in: ids } } });
  }
}
```

`findManyByIds` faz uma query só para N itens. É o que impede o N+1 na criação da OV.

`src/modules/items/items.service.ts`:

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { Item, Prisma } from '../../../generated/prisma/client';
import { EntityNotFoundException } from '../../common/exceptions';
import { CreateItemDto } from './dto/create-item.dto';
import { ItemsRepository } from './items.repository';

@Injectable()
export class ItemsService {
  constructor(private readonly repository: ItemsRepository) {}

  async create(dto: CreateItemDto): Promise<Item> {
    try {
      return await this.repository.create(dto);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Já existe um item com o SKU ${dto.sku}.`);
      }
      throw error;
    }
  }

  findAll(): Promise<Item[]> {
    return this.repository.findAll();
  }

  async findByIdOrThrow(id: string): Promise<Item> {
    const item = await this.repository.findById(id);
    if (item === null) {
      throw new EntityNotFoundException('Item', id);
    }
    return item;
  }
}
```

`src/modules/items/items.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateItemDto } from './dto/create-item.dto';
import { ItemResponse } from './dto/item.response';
import { ItemsService } from './items.service';

@ApiTags('items')
@Controller('items')
export class ItemsController {
  constructor(private readonly service: ItemsService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um item de catálogo' })
  async create(@Body() dto: CreateItemDto): Promise<ItemResponse> {
    return ItemResponse.from(await this.service.create(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lista os itens' })
  async findAll(): Promise<ItemResponse[]> {
    const items = await this.service.findAll();
    return items.map(ItemResponse.from);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta um item' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ItemResponse> {
    return ItemResponse.from(await this.service.findByIdOrThrow(id));
  }
}
```

`src/modules/items/items.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ItemsController } from './items.controller';
import { ItemsRepository } from './items.repository';
import { ItemsService } from './items.service';

@Module({
  controllers: [ItemsController],
  providers: [ItemsService, ItemsRepository],
  exports: [ItemsRepository],
})
export class ItemsModule {}
```

- [ ] **Step 7: Registrar os módulos no `app.module.ts`**

Adicionar `TransportTypesModule` e `ItemsModule` ao array `imports`.

- [ ] **Step 8: Rodar os testes e verificar que passam**

Run: `pnpm test:e2e -- catalog`
Expected: PASS, 5 testes.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: cadastros de tipos de transporte e itens"
```

---

## Task 8: Criação, listagem com filtros e detalhe da OV

**Files:**
- Create: `src/modules/sales-orders/sales-orders.controller.ts`, `sales-orders.service.ts`, `sales-orders.repository.ts`, `sales-orders.module.ts`
- Create: `src/modules/sales-orders/dto/create-sales-order.dto.ts`, `list-sales-orders-query.dto.ts`, `sales-order.response.ts`
- Create: `src/common/decorators/actor.decorator.ts`
- Modify: `src/app.module.ts`
- Test: `src/modules/sales-orders/sales-orders.service.spec.ts`, `test/sales-orders.e2e-spec.ts`

**Interfaces:**
- Consumes: `CustomersRepository.isTransportAuthorized`, `ItemsRepository.findManyByIds`, `TransportTypesRepository.findById`, `AuditService.record`, `PrismaService`, `Tx`.
- Produces:
  - `calculateTotal(lines: ReadonlyArray<{ quantity: number; unitPrice: Prisma.Decimal }>): Prisma.Decimal`
  - `SalesOrdersRepository.findByIdOrThrow(id: string, tx?: Tx): Promise<SalesOrderWithRelations>`
  - `SalesOrdersRepository.updateStatus(id: string, status: SalesOrderStatus, tx: Tx): Promise<SalesOrder>`
  - `SalesOrdersRepository.updateTransportType(id: string, transportTypeId: string, tx: Tx): Promise<SalesOrder>`
  - `type SalesOrderWithRelations` — inclui `items` (com `item`), `schedule`, `customer`, `transportType`
  - `@Actor()` — decorator de parâmetro que lê o header `X-Actor`, default `'system'`
  - `SalesOrdersModule` exportando `SalesOrdersRepository`

- [ ] **Step 1: Escrever o teste unitário do cálculo de total**

`src/modules/sales-orders/sales-orders.service.spec.ts`:

```ts
import { Prisma } from '../../../generated/prisma/client';
import { calculateTotal } from './sales-orders.service';

describe('calculateTotal', () => {
  it('soma quantidade × preço unitário', () => {
    const total = calculateTotal([
      { quantity: 2, unitPrice: new Prisma.Decimal('129.90') },
      { quantity: 3, unitPrice: new Prisma.Decimal('89.50') },
    ]);

    expect(total.toFixed(2)).toBe('528.30');
  });

  it('não introduz erro de ponto flutuante', () => {
    const total = calculateTotal([
      { quantity: 3, unitPrice: new Prisma.Decimal('0.10') },
    ]);

    // 0.1 * 3 === 0.30000000000000004 em float. Aqui, não.
    expect(total.toFixed(2)).toBe('0.30');
    expect(total.equals(new Prisma.Decimal('0.3'))).toBe(true);
  });

  it('retorna zero para lista vazia', () => {
    expect(calculateTotal([]).toFixed(2)).toBe('0.00');
  });
});
```

- [ ] **Step 2: Rodar o teste e verificar que falha**

Run: `pnpm test -- sales-orders.service.spec`
Expected: FAIL — `Cannot find module './sales-orders.service'`.

- [ ] **Step 3: Escrever o decorator de actor**

`src/common/decorators/actor.decorator.ts`:

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Não há autenticação neste desafio. O ator vem do header X-Actor.
 * Trocar por um `sub` de JWT depois é uma mudança de uma linha.
 */
export const Actor = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const header = request.header('X-Actor');
  return header && header.trim().length > 0 ? header.trim() : 'system';
});
```

- [ ] **Step 4: Escrever os DTOs**

`src/modules/sales-orders/dto/create-sales-order.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class SalesOrderItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  itemId!: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateSalesOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  customerId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  transportTypeId!: string;

  @ApiProperty({ type: [SalesOrderItemDto], description: 'Ao menos um item.' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemDto)
  items!: SalesOrderItemDto[];
}
```

`@ArrayNotEmpty()` é a primeira linha de defesa da invariante "ao menos um item". A segunda é a transação do service.

`src/modules/sales-orders/dto/list-sales-orders-query.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { DeliveryWindow, SalesOrderStatus } from '../../../../generated/prisma/client';

export class ListSalesOrdersQueryDto {
  @ApiPropertyOptional({ enum: SalesOrderStatus })
  @IsOptional()
  @IsEnum(SalesOrderStatus)
  status?: SalesOrderStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  transportTypeId?: string;

  @ApiPropertyOptional({ example: '2026-08-01', description: 'Data de entrega agendada, inclusiva.' })
  @IsOptional()
  @IsDateString()
  scheduledFrom?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'Data de entrega agendada, inclusiva.' })
  @IsOptional()
  @IsDateString()
  scheduledTo?: string;

  @ApiPropertyOptional({ enum: DeliveryWindow })
  @IsOptional()
  @IsEnum(DeliveryWindow)
  window?: DeliveryWindow;
}
```

`src/modules/sales-orders/dto/sales-order.response.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SalesOrderWithRelations } from '../sales-orders.repository';

export class SalesOrderItemResponse {
  @ApiProperty() itemId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty({ type: String, example: '129.90' }) unitPrice!: string;
}

export class SalesOrderScheduleResponse {
  @ApiProperty({ example: '2026-08-01' }) scheduledDate!: string;
  @ApiProperty() window!: string;
  @ApiProperty() status!: string;
  @ApiProperty() rescheduleCount!: number;
}

export class SalesOrderResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'OV-000042' }) number!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty() transportTypeId!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, example: '528.30' }) total!: string;
  @ApiProperty({ type: [SalesOrderItemResponse] }) items!: SalesOrderItemResponse[];
  @ApiPropertyOptional({ type: SalesOrderScheduleResponse, nullable: true })
  schedule!: SalesOrderScheduleResponse | null;
  @ApiProperty() createdAt!: Date;

  static from(order: SalesOrderWithRelations): SalesOrderResponse {
    return {
      id: order.id,
      number: `OV-${String(order.orderNumber).padStart(6, '0')}`,
      customerId: order.customerId,
      transportTypeId: order.transportTypeId,
      status: order.status,
      total: order.total.toFixed(2),
      items: order.items.map((line) => ({
        itemId: line.itemId,
        sku: line.item.sku,
        name: line.item.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice.toFixed(2),
      })),
      schedule:
        order.schedule === null
          ? null
          : {
              scheduledDate: order.schedule.scheduledDate.toISOString().slice(0, 10),
              window: order.schedule.window,
              status: order.schedule.status,
              rescheduleCount: order.schedule.rescheduleCount,
            },
      createdAt: order.createdAt,
    };
  }
}
```

`OV-000042` é formatação de apresentação sobre a sequence do Postgres. O banco guarda o inteiro; ninguém depende do zero à esquerda.

- [ ] **Step 5: Escrever o repositório**

`src/modules/sales-orders/sales-orders.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma, SalesOrder, SalesOrderStatus } from '../../../generated/prisma/client';
import { EntityNotFoundException } from '../../common/exceptions';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Tx } from '../../common/prisma/prisma.types';
import { ListSalesOrdersQueryDto } from './dto/list-sales-orders-query.dto';

const WITH_RELATIONS = {
  customer: true,
  transportType: true,
  schedule: true,
  items: { include: { item: true } },
} satisfies Prisma.SalesOrderInclude;

export type SalesOrderWithRelations = Prisma.SalesOrderGetPayload<{
  include: typeof WITH_RELATIONS;
}>;

@Injectable()
export class SalesOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.SalesOrderCreateInput, tx: Tx): Promise<SalesOrderWithRelations> {
    return tx.salesOrder.create({ data, include: WITH_RELATIONS });
  }

  findMany(query: ListSalesOrdersQueryDto): Promise<SalesOrderWithRelations[]> {
    return this.prisma.salesOrder.findMany({
      where: this.toWhere(query),
      include: WITH_RELATIONS,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string, tx: Tx = this.prisma): Promise<SalesOrderWithRelations | null> {
    return tx.salesOrder.findUnique({ where: { id }, include: WITH_RELATIONS });
  }

  async findByIdOrThrow(id: string, tx: Tx = this.prisma): Promise<SalesOrderWithRelations> {
    const order = await this.findById(id, tx);
    if (order === null) {
      throw new EntityNotFoundException('OrdemVenda', id);
    }
    return order;
  }

  updateStatus(id: string, status: SalesOrderStatus, tx: Tx): Promise<SalesOrder> {
    return tx.salesOrder.update({ where: { id }, data: { status } });
  }

  updateTransportType(id: string, transportTypeId: string, tx: Tx): Promise<SalesOrder> {
    return tx.salesOrder.update({ where: { id }, data: { transportTypeId } });
  }

  private toWhere(query: ListSalesOrdersQueryDto): Prisma.SalesOrderWhereInput {
    const where: Prisma.SalesOrderWhereInput = {};

    if (query.status !== undefined) where.status = query.status;
    if (query.customerId !== undefined) where.customerId = query.customerId;
    if (query.transportTypeId !== undefined) where.transportTypeId = query.transportTypeId;

    const scheduleFilter: Prisma.DeliveryScheduleWhereInput = {};
    if (query.scheduledFrom !== undefined || query.scheduledTo !== undefined) {
      scheduleFilter.scheduledDate = {
        ...(query.scheduledFrom !== undefined && { gte: new Date(query.scheduledFrom) }),
        ...(query.scheduledTo !== undefined && { lte: new Date(query.scheduledTo) }),
      };
    }
    if (query.window !== undefined) scheduleFilter.window = query.window;

    // Filtro por agendamento implica INNER JOIN: OVs sem agendamento não têm
    // data de entrega para filtrar, e por isso somem do resultado.
    if (Object.keys(scheduleFilter).length > 0) {
      where.schedule = { is: scheduleFilter };
    }

    return where;
  }
}
```

- [ ] **Step 6: Escrever o serviço**

`src/modules/sales-orders/sales-orders.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditEntity,
  Prisma,
  SalesOrderStatus,
} from '../../../generated/prisma/client';
import { EntityNotFoundException, TransportTypeNotAllowedException } from '../../common/exceptions';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CustomersRepository } from '../customers/customers.repository';
import { ItemsRepository } from '../items/items.repository';
import { TransportTypesRepository } from '../transport-types/transport-types.repository';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { ListSalesOrdersQueryDto } from './dto/list-sales-orders-query.dto';
import { SalesOrdersRepository, SalesOrderWithRelations } from './sales-orders.repository';

export function calculateTotal(
  lines: ReadonlyArray<{ quantity: number; unitPrice: Prisma.Decimal }>,
): Prisma.Decimal {
  return lines.reduce(
    (total, line) => total.plus(line.unitPrice.times(line.quantity)),
    new Prisma.Decimal(0),
  );
}

@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: SalesOrdersRepository,
    private readonly customers: CustomersRepository,
    private readonly transportTypes: TransportTypesRepository,
    private readonly items: ItemsRepository,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateSalesOrderDto, actor: string): Promise<SalesOrderWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const customer = await this.customers.findById(dto.customerId, tx);
      if (customer === null) {
        throw new EntityNotFoundException('Cliente', dto.customerId);
      }

      const transportType = await this.transportTypes.findById(dto.transportTypeId, tx);
      if (transportType === null) {
        throw new EntityNotFoundException('TipoTransporte', dto.transportTypeId);
      }

      const authorized = await this.customers.isTransportAuthorized(
        dto.customerId,
        dto.transportTypeId,
        tx,
      );
      if (!authorized) {
        throw new TransportTypeNotAllowedException(dto.customerId, dto.transportTypeId);
      }

      const itemIds = dto.items.map((line) => line.itemId);
      if (new Set(itemIds).size !== itemIds.length) {
        throw new BadRequestException('A ordem de venda não pode repetir o mesmo item.');
      }

      const catalog = await this.items.findManyByIds(itemIds, tx);
      if (catalog.length !== itemIds.length) {
        const found = new Set(catalog.map((item) => item.id));
        const missing = itemIds.filter((id) => !found.has(id));
        throw new EntityNotFoundException('Item', missing.join(', '));
      }

      const priceById = new Map(catalog.map((item) => [item.id, item.unitPrice]));
      const lines = dto.items.map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        // Snapshot do preço: mudança futura no catálogo não reescreve a venda.
        unitPrice: priceById.get(line.itemId) as Prisma.Decimal,
      }));

      const order = await this.orders.create(
        {
          customer: { connect: { id: dto.customerId } },
          transportType: { connect: { id: dto.transportTypeId } },
          status: SalesOrderStatus.CRIADA,
          total: calculateTotal(lines),
          items: { create: lines },
        },
        tx,
      );

      await this.audit.record(tx, {
        salesOrderId: order.id,
        entity: AuditEntity.SALES_ORDER,
        entityId: order.id,
        action: AuditAction.ORDER_CREATED,
        before: null,
        after: {
          status: order.status,
          customerId: order.customerId,
          transportTypeId: order.transportTypeId,
          total: order.total.toFixed(2),
        },
        actor,
      });

      return order;
    });
  }

  findAll(query: ListSalesOrdersQueryDto): Promise<SalesOrderWithRelations[]> {
    return this.orders.findMany(query);
  }

  findByIdOrThrow(id: string): Promise<SalesOrderWithRelations> {
    return this.orders.findByIdOrThrow(id);
  }
}
```

Toda a criação está em uma transação: validação, escrita da OV, escrita dos itens e escrita do log. Se qualquer passo falhar, nada sobra.

- [ ] **Step 7: Rodar o teste unitário e verificar que passa**

Run: `pnpm test -- sales-orders.service.spec`
Expected: PASS, 3 testes.

- [ ] **Step 8: Escrever o controller e o módulo**

`src/modules/sales-orders/sales-orders.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Actor } from '../../common/decorators/actor.decorator';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { ListSalesOrdersQueryDto } from './dto/list-sales-orders-query.dto';
import { SalesOrderResponse } from './dto/sales-order.response';
import { SalesOrdersService } from './sales-orders.service';

@ApiTags('sales-orders')
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly service: SalesOrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Cria uma ordem de venda com status CRIADA' })
  async create(
    @Body() dto: CreateSalesOrderDto,
    @Actor() actor: string,
  ): Promise<SalesOrderResponse> {
    return SalesOrderResponse.from(await this.service.create(dto, actor));
  }

  @Get()
  @ApiOperation({ summary: 'Monitoramento operacional: filtra por status, cliente, transporte e data' })
  async findAll(@Query() query: ListSalesOrdersQueryDto): Promise<SalesOrderResponse[]> {
    const orders = await this.service.findAll(query);
    return orders.map(SalesOrderResponse.from);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da ordem de venda' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SalesOrderResponse> {
    return SalesOrderResponse.from(await this.service.findByIdOrThrow(id));
  }
}
```

`src/modules/sales-orders/sales-orders.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CustomersModule } from '../customers/customers.module';
import { ItemsModule } from '../items/items.module';
import { TransportTypesModule } from '../transport-types/transport-types.module';
import { SalesOrdersController } from './sales-orders.controller';
import { SalesOrdersRepository } from './sales-orders.repository';
import { SalesOrdersService } from './sales-orders.service';

@Module({
  imports: [CustomersModule, TransportTypesModule, ItemsModule, AuditModule],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService, SalesOrdersRepository],
  exports: [SalesOrdersRepository],
})
export class SalesOrdersModule {}
```

Registrar `SalesOrdersModule` no `app.module.ts`.

- [ ] **Step 9: Escrever o teste e2e de criação e listagem**

`test/sales-orders.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { truncateAll } from './utils/db';

describe('SalesOrders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let customerId: string;
  let transportTypeId: string;
  let unauthorizedTransportTypeId: string;
  let itemId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);

    const customer = await prisma.customer.create({
      data: { name: 'ACME', document: '12345678000199' },
    });
    const caminhao = await prisma.transportType.create({
      data: { code: 'CAMINHAO', name: 'Caminhão' },
    });
    const carreta = await prisma.transportType.create({
      data: { code: 'CARRETA', name: 'Carreta' },
    });
    await prisma.customerTransportType.create({
      data: { customerId: customer.id, transportTypeId: caminhao.id },
    });
    const item = await prisma.item.create({
      data: { sku: 'SKU-001', name: 'Palete', unitPrice: '129.90' },
    });

    customerId = customer.id;
    transportTypeId = caminhao.id;
    unauthorizedTransportTypeId = carreta.id;
    itemId = item.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('cria uma OV com status CRIADA, total calculado e log de auditoria', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/sales-orders')
      .set('X-Actor', 'rodrigo')
      .send({ customerId, transportTypeId, items: [{ itemId, quantity: 2 }] })
      .expect(201);

    expect(response.body).toMatchObject({ status: 'CRIADA', total: '259.80', number: 'OV-000001' });

    const logs = await prisma.auditLog.findMany({ where: { salesOrderId: response.body.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'ORDER_CREATED', actor: 'rodrigo', before: null });
  });

  it('rejeita OV sem itens com 400', async () => {
    await request(app.getHttpServer())
      .post('/api/sales-orders')
      .send({ customerId, transportTypeId, items: [] })
      .expect(400);
  });

  it('rejeita transporte não autorizado para o cliente com 409', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/sales-orders')
      .send({
        customerId,
        transportTypeId: unauthorizedTransportTypeId,
        items: [{ itemId, quantity: 1 }],
      })
      .expect(409);

    expect(response.body.error).toBe('TransportTypeNotAllowed');
  });

  it('não deixa OV órfã quando a criação falha', async () => {
    await request(app.getHttpServer())
      .post('/api/sales-orders')
      .send({
        customerId,
        transportTypeId: unauthorizedTransportTypeId,
        items: [{ itemId, quantity: 1 }],
      })
      .expect(409);

    expect(await prisma.salesOrder.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it('filtra a listagem por status, cliente e tipo de transporte', async () => {
    await request(app.getHttpServer())
      .post('/api/sales-orders')
      .send({ customerId, transportTypeId, items: [{ itemId, quantity: 1 }] })
      .expect(201);

    const byStatus = await request(app.getHttpServer())
      .get('/api/sales-orders?status=CRIADA')
      .expect(200);
    expect(byStatus.body).toHaveLength(1);

    const byOtherStatus = await request(app.getHttpServer())
      .get('/api/sales-orders?status=ENTREGUE')
      .expect(200);
    expect(byOtherStatus.body).toHaveLength(0);

    const byCustomer = await request(app.getHttpServer())
      .get(`/api/sales-orders?customerId=${customerId}`)
      .expect(200);
    expect(byCustomer.body).toHaveLength(1);

    const byTransport = await request(app.getHttpServer())
      .get(`/api/sales-orders?transportTypeId=${unauthorizedTransportTypeId}`)
      .expect(200);
    expect(byTransport.body).toHaveLength(0);
  });

  it('rejeita filtro desconhecido com 400', async () => {
    await request(app.getHttpServer()).get('/api/sales-orders?hacker=1').expect(400);
  });
});
```

- [ ] **Step 10: Rodar o teste e verificar que passa**

Run: `pnpm test:e2e -- sales-orders`
Expected: PASS, 6 testes.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: criação, listagem filtrada e detalhe de ordens de venda"
```

---

## Task 9: Agendamento — criar, reagendar e confirmar

**Files:**
- Create: `src/modules/scheduling/scheduling.controller.ts`, `scheduling.service.ts`, `scheduling.repository.ts`, `scheduling.module.ts`
- Create: `src/modules/scheduling/dto/create-schedule.dto.ts`, `update-schedule.dto.ts`, `schedule.response.ts`
- Create: `src/modules/scheduling/domain/schedule-rules.ts`
- Modify: `src/app.module.ts`
- Test: `src/modules/scheduling/domain/schedule-rules.spec.ts`, `test/scheduling.e2e-spec.ts`

**Interfaces:**
- Consumes: `SalesOrdersRepository.findByIdOrThrow`, `AuditService.record`, `PrismaService`, `Tx`.
- Produces:
  - `MAX_DELIVERIES_PER_SLOT = 5`
  - `assertOrderAcceptsScheduleChange(status: SalesOrderStatus): void` — lança `OrderNotSchedulableException` para `EM_TRANSPORTE` e `ENTREGUE`
  - `assertFutureDate(date: Date, now: Date): void` — lança `BadRequestException`
  - `SchedulingRepository.countConfirmedInSlot(scheduledDate: Date, window: DeliveryWindow, tx: Tx): Promise<number>`
  - `SchedulingModule`

- [ ] **Step 1: Escrever o teste das regras de agendamento**

`src/modules/scheduling/domain/schedule-rules.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { SalesOrderStatus } from '../../../../generated/prisma/client';
import { OrderNotSchedulableException } from '../../../common/exceptions';
import { assertFutureDate, assertOrderAcceptsScheduleChange } from './schedule-rules';

describe('assertOrderAcceptsScheduleChange', () => {
  it.each([SalesOrderStatus.CRIADA, SalesOrderStatus.PLANEJADA, SalesOrderStatus.AGENDADA])(
    'permite alterar agendamento em %s',
    (status) => {
      expect(() => assertOrderAcceptsScheduleChange(status)).not.toThrow();
    },
  );

  it.each([SalesOrderStatus.EM_TRANSPORTE, SalesOrderStatus.ENTREGUE])(
    'bloqueia alteração de agendamento em %s',
    (status) => {
      expect(() => assertOrderAcceptsScheduleChange(status)).toThrow(OrderNotSchedulableException);
    },
  );
});

describe('assertFutureDate', () => {
  const now = new Date('2026-07-09T12:00:00.000Z');

  it('aceita data futura', () => {
    expect(() => assertFutureDate(new Date('2026-07-10'), now)).not.toThrow();
  });

  it('rejeita data passada', () => {
    expect(() => assertFutureDate(new Date('2026-07-08'), now)).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Rodar o teste e verificar que falha**

Run: `pnpm test -- schedule-rules.spec`
Expected: FAIL — `Cannot find module './schedule-rules'`.

- [ ] **Step 3: Implementar as regras**

`src/modules/scheduling/domain/schedule-rules.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { SalesOrderStatus } from '../../../../generated/prisma/client';
import { OrderNotSchedulableException } from '../../../common/exceptions';

export const MAX_DELIVERIES_PER_SLOT = 5;

const FROZEN_STATUSES: ReadonlySet<SalesOrderStatus> = new Set([
  SalesOrderStatus.EM_TRANSPORTE,
  SalesOrderStatus.ENTREGUE,
]);

export function assertOrderAcceptsScheduleChange(status: SalesOrderStatus): void {
  if (FROZEN_STATUSES.has(status)) {
    throw new OrderNotSchedulableException(
      `Não é possível alterar o agendamento de uma ordem de venda em ${status}.`,
    );
  }
}

export function assertFutureDate(date: Date, now: Date): void {
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  if (date < startOfToday) {
    throw new BadRequestException('A data de entrega precisa ser hoje ou uma data futura.');
  }
}
```

- [ ] **Step 4: Rodar o teste e verificar que passa**

Run: `pnpm test -- schedule-rules.spec`
Expected: PASS, 7 testes.

- [ ] **Step 5: Escrever os DTOs**

`src/modules/scheduling/dto/create-schedule.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum } from 'class-validator';
import { DeliveryWindow } from '../../../../generated/prisma/client';

export class CreateScheduleDto {
  @ApiProperty({ example: '2026-08-01', description: 'Data de entrega (sem hora).' })
  @IsDateString()
  scheduledDate!: string;

  @ApiProperty({ enum: DeliveryWindow, description: 'Janela de atendimento.' })
  @IsEnum(DeliveryWindow)
  window!: DeliveryWindow;
}
```

`src/modules/scheduling/dto/update-schedule.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { DeliveryWindow } from '../../../../generated/prisma/client';

export class UpdateScheduleDto {
  @ApiPropertyOptional({ example: '2026-08-05' })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiPropertyOptional({ enum: DeliveryWindow })
  @IsOptional()
  @IsEnum(DeliveryWindow)
  window?: DeliveryWindow;
}
```

`src/modules/scheduling/dto/schedule.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { DeliverySchedule } from '../../../../generated/prisma/client';

export class ScheduleResponse {
  @ApiProperty() id!: string;
  @ApiProperty() salesOrderId!: string;
  @ApiProperty({ example: '2026-08-01' }) scheduledDate!: string;
  @ApiProperty() window!: string;
  @ApiProperty() status!: string;
  @ApiProperty() rescheduleCount!: number;

  static from(schedule: DeliverySchedule): ScheduleResponse {
    return {
      id: schedule.id,
      salesOrderId: schedule.salesOrderId,
      scheduledDate: schedule.scheduledDate.toISOString().slice(0, 10),
      window: schedule.window,
      status: schedule.status,
      rescheduleCount: schedule.rescheduleCount,
    };
  }
}
```

- [ ] **Step 6: Escrever o repositório**

`src/modules/scheduling/scheduling.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import {
  DeliverySchedule,
  DeliveryWindow,
  Prisma,
  ScheduleStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Tx } from '../../common/prisma/prisma.types';

@Injectable()
export class SchedulingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySalesOrderId(salesOrderId: string, tx: Tx = this.prisma): Promise<DeliverySchedule | null> {
    return tx.deliverySchedule.findUnique({ where: { salesOrderId } });
  }

  create(data: Prisma.DeliveryScheduleCreateInput, tx: Tx): Promise<DeliverySchedule> {
    return tx.deliverySchedule.create({ data });
  }

  update(
    id: string,
    data: Prisma.DeliveryScheduleUpdateInput,
    tx: Tx,
  ): Promise<DeliverySchedule> {
    return tx.deliverySchedule.update({ where: { id }, data });
  }

  countConfirmedInSlot(
    scheduledDate: Date,
    window: DeliveryWindow,
    tx: Tx,
  ): Promise<number> {
    return tx.deliverySchedule.count({
      where: { scheduledDate, window, status: ScheduleStatus.CONFIRMADO },
    });
  }
}
```

- [ ] **Step 7: Escrever o serviço**

`src/modules/scheduling/scheduling.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditEntity,
  DeliverySchedule,
  Prisma,
  ScheduleStatus,
} from '../../../generated/prisma/client';
import {
  EntityNotFoundException,
  ScheduleAlreadyConfirmedException,
  ScheduleAlreadyExistsException,
  SlotUnavailableException,
} from '../../common/exceptions';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Tx } from '../../common/prisma/prisma.types';
import { AuditService } from '../audit/audit.service';
import { SalesOrdersRepository } from '../sales-orders/sales-orders.repository';
import {
  assertFutureDate,
  assertOrderAcceptsScheduleChange,
  MAX_DELIVERIES_PER_SLOT,
} from './domain/schedule-rules';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

function toDateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function snapshot(schedule: DeliverySchedule): Prisma.InputJsonValue {
  return {
    scheduledDate: schedule.scheduledDate.toISOString().slice(0, 10),
    window: schedule.window,
    status: schedule.status,
  };
}

@Injectable()
export class SchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: SchedulingRepository,
    private readonly orders: SalesOrdersRepository,
    private readonly audit: AuditService,
  ) {}

  async create(
    salesOrderId: string,
    dto: CreateScheduleDto,
    actor: string,
  ): Promise<DeliverySchedule> {
    const scheduledDate = toDateOnly(dto.scheduledDate);
    assertFutureDate(scheduledDate, new Date());

    return this.prisma.$transaction(async (tx) => {
      const order = await this.orders.findByIdOrThrow(salesOrderId, tx);
      assertOrderAcceptsScheduleChange(order.status);

      const existing = await this.repository.findBySalesOrderId(salesOrderId, tx);
      if (existing !== null) {
        throw new ScheduleAlreadyExistsException(salesOrderId);
      }

      const schedule = await this.repository.create(
        {
          salesOrder: { connect: { id: salesOrderId } },
          scheduledDate,
          window: dto.window,
        },
        tx,
      );

      await this.recordAudit(tx, salesOrderId, schedule, null, actor);
      return schedule;
    });
  }

  async reschedule(
    salesOrderId: string,
    dto: UpdateScheduleDto,
    actor: string,
  ): Promise<DeliverySchedule> {
    const scheduledDate =
      dto.scheduledDate === undefined ? undefined : toDateOnly(dto.scheduledDate);
    if (scheduledDate !== undefined) {
      assertFutureDate(scheduledDate, new Date());
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.orders.findByIdOrThrow(salesOrderId, tx);
      assertOrderAcceptsScheduleChange(order.status);

      const before = await this.repository.findBySalesOrderId(salesOrderId, tx);
      if (before === null) {
        throw new EntityNotFoundException('Agendamento', salesOrderId);
      }

      // Reagendar NÃO rebaixa CONFIRMADO para PENDENTE: isso deixaria uma OV
      // AGENDADA apoiada em agendamento não confirmado.
      const after = await this.repository.update(
        before.id,
        {
          ...(scheduledDate !== undefined && { scheduledDate }),
          ...(dto.window !== undefined && { window: dto.window }),
          rescheduleCount: { increment: 1 },
        },
        tx,
      );

      await this.recordAudit(tx, salesOrderId, after, before, actor);
      return after;
    });
  }

  async confirm(salesOrderId: string, actor: string): Promise<DeliverySchedule> {
    return this.prisma.$transaction(
      async (tx) => {
        const before = await this.repository.findBySalesOrderId(salesOrderId, tx);
        if (before === null) {
          throw new EntityNotFoundException('Agendamento', salesOrderId);
        }
        if (before.status === ScheduleStatus.CONFIRMADO) {
          throw new ScheduleAlreadyConfirmedException(salesOrderId);
        }

        const confirmed = await this.repository.countConfirmedInSlot(
          before.scheduledDate,
          before.window,
          tx,
        );
        if (confirmed >= MAX_DELIVERIES_PER_SLOT) {
          throw new SlotUnavailableException(
            before.scheduledDate.toISOString().slice(0, 10),
            before.window,
          );
        }

        const after = await this.repository.update(
          before.id,
          { status: ScheduleStatus.CONFIRMADO },
          tx,
        );

        await this.recordAudit(tx, salesOrderId, after, before, actor);
        return after;
      },
      // A contagem de capacidade e a escrita precisam ver um snapshot consistente,
      // ou duas confirmações concorrentes estouram o limite do slot.
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  findBySalesOrderId(salesOrderId: string): Promise<DeliverySchedule | null> {
    return this.repository.findBySalesOrderId(salesOrderId);
  }

  private recordAudit(
    tx: Tx,
    salesOrderId: string,
    after: DeliverySchedule,
    before: DeliverySchedule | null,
    actor: string,
  ): Promise<void> {
    return this.audit.record(tx, {
      salesOrderId,
      entity: AuditEntity.DELIVERY_SCHEDULE,
      entityId: after.id,
      action: AuditAction.SCHEDULE_CHANGED,
      before: before === null ? null : snapshot(before),
      after: snapshot(after),
      actor,
    });
  }
}
```

- [ ] **Step 8: Escrever o controller e o módulo**

`src/modules/scheduling/scheduling.controller.ts`:

```ts
import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Actor } from '../../common/decorators/actor.decorator';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { ScheduleResponse } from './dto/schedule.response';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { SchedulingService } from './scheduling.service';

@ApiTags('scheduling')
@Controller('sales-orders/:id/schedule')
export class SchedulingController {
  constructor(private readonly service: SchedulingService) {}

  @Post()
  @ApiOperation({ summary: 'Define data de entrega e janela de atendimento' })
  async create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateScheduleDto,
    @Actor() actor: string,
  ): Promise<ScheduleResponse> {
    return ScheduleResponse.from(await this.service.create(id, dto, actor));
  }

  @Patch()
  @ApiOperation({ summary: 'Reagenda a entrega. Mantém o status do agendamento.' })
  async reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduleDto,
    @Actor() actor: string,
  ): Promise<ScheduleResponse> {
    return ScheduleResponse.from(await this.service.reschedule(id, dto, actor));
  }

  @Post('confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirma o agendamento. Não altera o status da OV.' })
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: string,
  ): Promise<ScheduleResponse> {
    return ScheduleResponse.from(await this.service.confirm(id, actor));
  }
}
```

`src/modules/scheduling/scheduling.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SalesOrdersModule } from '../sales-orders/sales-orders.module';
import { SchedulingController } from './scheduling.controller';
import { SchedulingRepository } from './scheduling.repository';
import { SchedulingService } from './scheduling.service';

@Module({
  imports: [SalesOrdersModule, AuditModule],
  controllers: [SchedulingController],
  providers: [SchedulingService, SchedulingRepository],
  exports: [SchedulingService],
})
export class SchedulingModule {}
```

Registrar `SchedulingModule` no `app.module.ts`, **depois** de `SalesOrdersModule`.

- [ ] **Step 9: Escrever o teste e2e de agendamento**

`test/scheduling.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { truncateAll } from './utils/db';

const FUTURE_DATE = '2099-08-01';

describe('Scheduling (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  async function createOrder(): Promise<string> {
    const customer = await prisma.customer.create({
      data: { name: 'ACME', document: `${Math.floor(Math.random() * 1e14)}` },
    });
    const transport = await prisma.transportType.findFirstOrThrow();
    await prisma.customerTransportType.create({
      data: { customerId: customer.id, transportTypeId: transport.id },
    });
    const item = await prisma.item.findFirstOrThrow();
    const order = await prisma.salesOrder.create({
      data: {
        customerId: customer.id,
        transportTypeId: transport.id,
        total: '100.00',
        items: { create: [{ itemId: item.id, quantity: 1, unitPrice: '100.00' }] },
      },
    });
    return order.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await prisma.transportType.create({ data: { code: 'CAMINHAO', name: 'Caminhão' } });
    await prisma.item.create({ data: { sku: 'SKU-001', name: 'Palete', unitPrice: '100.00' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('cria agendamento com data e janela, status PENDENTE', async () => {
    const orderId = await createOrder();

    const response = await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
      .expect(201);

    expect(response.body).toMatchObject({
      scheduledDate: FUTURE_DATE,
      window: 'MANHA',
      status: 'PENDENTE',
      rescheduleCount: 0,
    });
  });

  it('rejeita segundo agendamento para a mesma OV com 409', async () => {
    const orderId = await createOrder();
    const body = { scheduledDate: FUTURE_DATE, window: 'MANHA' };

    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send(body)
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send(body)
      .expect(409);

    expect(second.body.error).toBe('ScheduleAlreadyExists');
  });

  it('rejeita data passada com 400', async () => {
    const orderId = await createOrder();

    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: '2020-01-01', window: 'TARDE' })
      .expect(400);
  });

  it('reagenda mantendo CONFIRMADO e incrementando rescheduleCount', async () => {
    const orderId = await createOrder();
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule/confirm`)
      .expect(200);

    const rescheduled = await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: '2099-08-05', window: 'TARDE' })
      .expect(200);

    expect(rescheduled.body).toMatchObject({
      scheduledDate: '2099-08-05',
      window: 'TARDE',
      status: 'CONFIRMADO',
      rescheduleCount: 1,
    });
  });

  it('rejeita confirmação dupla com 409', async () => {
    const orderId = await createOrder();
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule/confirm`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule/confirm`)
      .expect(409);

    expect(second.body.error).toBe('ScheduleAlreadyConfirmed');
  });

  it('rejeita a sexta confirmação no mesmo slot com 409', async () => {
    for (let index = 0; index < 5; index += 1) {
      const orderId = await createOrder();
      await request(app.getHttpServer())
        .post(`/api/sales-orders/${orderId}/schedule`)
        .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/sales-orders/${orderId}/schedule/confirm`)
        .expect(200);
    }

    const sixthOrderId = await createOrder();
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${sixthOrderId}/schedule`)
      .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post(`/api/sales-orders/${sixthOrderId}/schedule/confirm`)
      .expect(409);

    expect(response.body.error).toBe('SlotUnavailable');
  });

  it('grava um log SCHEDULE_CHANGED por operação de agendamento', async () => {
    const orderId = await createOrder();
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule/confirm`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/schedule`)
      .send({ window: 'TARDE' })
      .expect(200);

    const logs = await prisma.auditLog.findMany({
      where: { salesOrderId: orderId, action: 'SCHEDULE_CHANGED' },
    });
    expect(logs).toHaveLength(3);
    expect(logs.every((log) => log.entity === 'DELIVERY_SCHEDULE')).toBe(true);
  });
});
```

- [ ] **Step 10: Rodar o teste e verificar que passa**

Run: `pnpm test:e2e -- scheduling`
Expected: PASS, 7 testes.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: agendamento de entrega com janela, reagendamento e confirmação"
```

---

## Task 10: Transição de status e troca de transporte da OV

**Files:**
- Create: `src/modules/sales-orders/dto/update-status.dto.ts`, `update-transport-type.dto.ts`
- Modify: `src/modules/sales-orders/sales-orders.service.ts`, `sales-orders.controller.ts`, `sales-orders.module.ts`
- Test: `test/sales-orders-status.e2e-spec.ts`

**Interfaces:**
- Consumes: `assertTransition` (Task 4), `assertSchedulePrecondition` (Task 4), `SalesOrdersRepository.updateStatus`, `SalesOrdersRepository.updateTransportType`, `CustomersRepository.isTransportAuthorized`, `AuditService.record`.
- Produces:
  - `SalesOrdersService.updateStatus(id: string, status: SalesOrderStatus, actor: string): Promise<SalesOrderWithRelations>`
  - `SalesOrdersService.updateTransportType(id: string, transportTypeId: string, actor: string): Promise<SalesOrderWithRelations>`

- [ ] **Step 1: Escrever os DTOs**

`src/modules/sales-orders/dto/update-status.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SalesOrderStatus } from '../../../../generated/prisma/client';

export class UpdateStatusDto {
  @ApiProperty({
    enum: SalesOrderStatus,
    description: 'Status alvo. Só o sucessor imediato é aceito. AGENDADA exige agendamento confirmado.',
  })
  @IsEnum(SalesOrderStatus)
  status!: SalesOrderStatus;
}
```

`src/modules/sales-orders/dto/update-transport-type.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UpdateTransportTypeOnOrderDto {
  @ApiProperty({ format: 'uuid', description: 'Precisa estar autorizado para o cliente da OV.' })
  @IsUUID('4')
  transportTypeId!: string;
}
```

- [ ] **Step 2: Escrever o teste e2e**

`test/sales-orders-status.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { truncateAll } from './utils/db';

const FUTURE_DATE = '2099-08-01';

describe('SalesOrders status e transporte (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orderId: string;
  let authorizedTransportId: string;
  let unauthorizedTransportId: string;

  async function advanceTo(target: string): Promise<void> {
    const path = `/api/sales-orders/${orderId}/status`;
    await request(app.getHttpServer()).patch(path).send({ status: 'PLANEJADA' }).expect(200);
    if (target === 'PLANEJADA') return;

    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule/confirm`)
      .expect(200);
    await request(app.getHttpServer()).patch(path).send({ status: 'AGENDADA' }).expect(200);
    if (target === 'AGENDADA') return;

    await request(app.getHttpServer()).patch(path).send({ status: 'EM_TRANSPORTE' }).expect(200);
    if (target === 'EM_TRANSPORTE') return;

    await request(app.getHttpServer()).patch(path).send({ status: 'ENTREGUE' }).expect(200);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const customer = await prisma.customer.create({
      data: { name: 'ACME', document: '12345678000199' },
    });
    const caminhao = await prisma.transportType.create({
      data: { code: 'CAMINHAO', name: 'Caminhão' },
    });
    const carreta = await prisma.transportType.create({
      data: { code: 'CARRETA', name: 'Carreta' },
    });
    const bitruck = await prisma.transportType.create({
      data: { code: 'BITRUCK', name: 'Bi-truck' },
    });
    await prisma.customerTransportType.createMany({
      data: [
        { customerId: customer.id, transportTypeId: caminhao.id },
        { customerId: customer.id, transportTypeId: carreta.id },
      ],
    });
    const item = await prisma.item.create({
      data: { sku: 'SKU-001', name: 'Palete', unitPrice: '100.00' },
    });
    const order = await prisma.salesOrder.create({
      data: {
        customerId: customer.id,
        transportTypeId: caminhao.id,
        total: '100.00',
        items: { create: [{ itemId: item.id, quantity: 1, unitPrice: '100.00' }] },
      },
    });

    orderId = order.id;
    authorizedTransportId = carreta.id;
    unauthorizedTransportId = bitruck.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('percorre o fluxo feliz completo até ENTREGUE', async () => {
    await advanceTo('ENTREGUE');

    const detail = await request(app.getHttpServer())
      .get(`/api/sales-orders/${orderId}`)
      .expect(200);
    expect(detail.body.status).toBe('ENTREGUE');
  });

  it('rejeita pular etapa (CRIADA para ENTREGUE) com 409', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/status`)
      .send({ status: 'ENTREGUE' })
      .expect(409);

    expect(response.body.error).toBe('InvalidStatusTransition');
  });

  it('rejeita retroceder de PLANEJADA para CRIADA com 409', async () => {
    await advanceTo('PLANEJADA');
    await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/status`)
      .send({ status: 'CRIADA' })
      .expect(409);
  });

  it('rejeita AGENDADA sem agendamento confirmado com 409', async () => {
    await advanceTo('PLANEJADA');

    const semAgendamento = await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/status`)
      .send({ status: 'AGENDADA' })
      .expect(409);
    expect(semAgendamento.body.error).toBe('OrderNotSchedulable');

    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
      .expect(201);

    const pendente = await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/status`)
      .send({ status: 'AGENDADA' })
      .expect(409);
    expect(pendente.body.error).toBe('OrderNotSchedulable');
  });

  it('rejeita status inexistente com 400', async () => {
    await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/status`)
      .send({ status: 'CANCELADA' })
      .expect(400);
  });

  it('troca o transporte por outro autorizado e audita', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/transport-type`)
      .set('X-Actor', 'rodrigo')
      .send({ transportTypeId: authorizedTransportId })
      .expect(200);

    expect(response.body.transportTypeId).toBe(authorizedTransportId);

    const logs = await prisma.auditLog.findMany({
      where: { salesOrderId: orderId, action: 'TRANSPORT_CHANGED' },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actor).toBe('rodrigo');
  });

  it('rejeita troca por transporte não autorizado com 409', async () => {
    await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/transport-type`)
      .send({ transportTypeId: unauthorizedTransportId })
      .expect(409);
  });

  it('rejeita troca de transporte a partir de EM_TRANSPORTE com 409', async () => {
    await advanceTo('EM_TRANSPORTE');

    const response = await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/transport-type`)
      .send({ transportTypeId: authorizedTransportId })
      .expect(409);

    expect(response.body.error).toBe('OrderNotSchedulable');
  });

  it('não grava log quando a transição é rejeitada', async () => {
    await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/status`)
      .send({ status: 'ENTREGUE' })
      .expect(409);

    const logs = await prisma.auditLog.findMany({
      where: { salesOrderId: orderId, action: 'STATUS_CHANGED' },
    });
    expect(logs).toHaveLength(0);
  });
});
```

O último teste é o que prova que a auditoria é transacional: a exceção sobe de dentro da `$transaction`, e o log some com ela.

- [ ] **Step 3: Rodar o teste e verificar que falha**

Run: `pnpm test:e2e -- sales-orders-status`
Expected: FAIL — `PATCH /api/sales-orders/:id/status` retorna 404.

- [ ] **Step 4: Adicionar os métodos ao serviço**

Em `src/modules/sales-orders/sales-orders.service.ts`, acrescentar os imports:

```ts
import { assertSchedulePrecondition } from './domain/schedule-precondition';
import { assertTransition } from './domain/status-machine';
import { assertOrderAcceptsScheduleChange } from '../scheduling/domain/schedule-rules';
```

E os métodos, dentro da classe `SalesOrdersService`:

```ts
  async updateStatus(
    id: string,
    status: SalesOrderStatus,
    actor: string,
  ): Promise<SalesOrderWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.orders.findByIdOrThrow(id, tx);

      assertTransition(before.status, status);
      assertSchedulePrecondition(status, before.schedule);

      await this.orders.updateStatus(id, status, tx);

      await this.audit.record(tx, {
        salesOrderId: id,
        entity: AuditEntity.SALES_ORDER,
        entityId: id,
        action: AuditAction.STATUS_CHANGED,
        before: { status: before.status },
        after: { status },
        actor,
      });

      return this.orders.findByIdOrThrow(id, tx);
    });
  }

  async updateTransportType(
    id: string,
    transportTypeId: string,
    actor: string,
  ): Promise<SalesOrderWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.orders.findByIdOrThrow(id, tx);

      // A carga já saiu: trocar transportadora seria reescrever história.
      assertOrderAcceptsScheduleChange(before.status);

      const transportType = await this.transportTypes.findById(transportTypeId, tx);
      if (transportType === null) {
        throw new EntityNotFoundException('TipoTransporte', transportTypeId);
      }

      const authorized = await this.customers.isTransportAuthorized(
        before.customerId,
        transportTypeId,
        tx,
      );
      if (!authorized) {
        throw new TransportTypeNotAllowedException(before.customerId, transportTypeId);
      }

      await this.orders.updateTransportType(id, transportTypeId, tx);

      await this.audit.record(tx, {
        salesOrderId: id,
        entity: AuditEntity.SALES_ORDER,
        entityId: id,
        action: AuditAction.TRANSPORT_CHANGED,
        before: { transportTypeId: before.transportTypeId },
        after: { transportTypeId },
        actor,
      });

      return this.orders.findByIdOrThrow(id, tx);
    });
  }
```

`assertOrderAcceptsScheduleChange` é reusada aqui de propósito: "a OV congelou" é a mesma regra para agendamento e para transporte, e duplicá-la criaria duas fontes de verdade que divergem na primeira mudança.

- [ ] **Step 5: Adicionar as rotas ao controller**

Em `src/modules/sales-orders/sales-orders.controller.ts`, acrescentar os imports de `Patch`, `UpdateStatusDto` e `UpdateTransportTypeOnOrderDto`, e os métodos:

```ts
  @Patch(':id/status')
  @ApiOperation({ summary: 'Atualiza o status. Só o sucessor imediato do fluxo é aceito.' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
    @Actor() actor: string,
  ): Promise<SalesOrderResponse> {
    return SalesOrderResponse.from(await this.service.updateStatus(id, dto.status, actor));
  }

  @Patch(':id/transport-type')
  @ApiOperation({ summary: 'Troca o tipo de transporte. Precisa estar autorizado para o cliente.' })
  async updateTransportType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransportTypeOnOrderDto,
    @Actor() actor: string,
  ): Promise<SalesOrderResponse> {
    return SalesOrderResponse.from(
      await this.service.updateTransportType(id, dto.transportTypeId, actor),
    );
  }
```

- [ ] **Step 6: Resolver a dependência circular entre módulos**

`SalesOrdersService` passou a importar `assertOrderAcceptsScheduleChange` de `scheduling/domain/schedule-rules.ts`, enquanto `SchedulingModule` importa `SalesOrdersModule`. Isso **não** cria ciclo de módulos Nest: `schedule-rules.ts` é uma função pura, sem `@Injectable`, e não participa da injeção de dependências.

Verificação: `pnpm start:dev` sobe sem o aviso `A circular dependency has been detected`.

- [ ] **Step 7: Rodar o teste e verificar que passa**

Run: `pnpm test:e2e -- sales-orders-status`
Expected: PASS, 9 testes.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: transição de status com pré-condição e troca de transporte autorizada"
```

---

## Task 11: Endpoint de auditoria

**Files:**
- Create: `src/modules/audit/audit.controller.ts`, `src/modules/audit/dto/audit-log.response.ts`
- Modify: `src/modules/audit/audit.module.ts`
- Test: `test/audit.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuditService.listBySalesOrder`, `SalesOrdersRepository.findByIdOrThrow`.
- Produces: `GET /api/sales-orders/:id/audit` → `AuditLogResponse[]`, ordenado por `createdAt desc`.

- [ ] **Step 1: Escrever o teste e2e**

`test/audit.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { truncateAll } from './utils/db';

const FUTURE_DATE = '2099-08-01';

describe('Audit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('devolve a timeline completa do fluxo feliz, mais recente primeiro', async () => {
    const customer = await prisma.customer.create({
      data: { name: 'ACME', document: '12345678000199' },
    });
    const caminhao = await prisma.transportType.create({
      data: { code: 'CAMINHAO', name: 'Caminhão' },
    });
    const carreta = await prisma.transportType.create({
      data: { code: 'CARRETA', name: 'Carreta' },
    });
    await prisma.customerTransportType.createMany({
      data: [
        { customerId: customer.id, transportTypeId: caminhao.id },
        { customerId: customer.id, transportTypeId: carreta.id },
      ],
    });
    const item = await prisma.item.create({
      data: { sku: 'SKU-001', name: 'Palete', unitPrice: '100.00' },
    });

    const created = await request(app.getHttpServer())
      .post('/api/sales-orders')
      .set('X-Actor', 'rodrigo')
      .send({
        customerId: customer.id,
        transportTypeId: caminhao.id,
        items: [{ itemId: item.id, quantity: 1 }],
      })
      .expect(201);
    const orderId = created.body.id as string;

    await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/transport-type`)
      .send({ transportTypeId: carreta.id })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/status`)
      .send({ status: 'PLANEJADA' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule/confirm`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/status`)
      .send({ status: 'AGENDADA' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/api/sales-orders/${orderId}/audit`)
      .expect(200);

    const actions = (response.body as Array<{ action: string }>).map((log) => log.action);
    // createdAt desc: o mais recente primeiro.
    expect(actions).toEqual([
      'STATUS_CHANGED',
      'SCHEDULE_CHANGED',
      'SCHEDULE_CHANGED',
      'STATUS_CHANGED',
      'TRANSPORT_CHANGED',
      'ORDER_CREATED',
    ]);

    const creation = response.body[response.body.length - 1];
    expect(creation).toMatchObject({
      entity: 'SALES_ORDER',
      actor: 'rodrigo',
      before: null,
    });

    const transportChange = response.body[4];
    expect(transportChange.before).toEqual({ transportTypeId: caminhao.id });
    expect(transportChange.after).toEqual({ transportTypeId: carreta.id });

    const scheduleConfirm = response.body.find(
      (log: { action: string; after: { status?: string } }) =>
        log.action === 'SCHEDULE_CHANGED' && log.after.status === 'CONFIRMADO',
    );
    expect(scheduleConfirm.entity).toBe('DELIVERY_SCHEDULE');
    expect(scheduleConfirm.before).toMatchObject({ status: 'PENDENTE' });
  });

  it('retorna 404 para OV inexistente', async () => {
    await request(app.getHttpServer())
      .get('/api/sales-orders/6f0f0b3e-0000-4000-8000-000000000000/audit')
      .expect(404);
  });
});
```

- [ ] **Step 2: Rodar o teste e verificar que falha**

Run: `pnpm test:e2e -- audit`
Expected: FAIL — `GET /api/sales-orders/:id/audit` retorna 404.

- [ ] **Step 3: Escrever o response DTO**

`src/modules/audit/dto/audit-log.response.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditLog, Prisma } from '../../../../generated/prisma/client';

export class AuditLogResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'STATUS_CHANGED' }) action!: string;
  @ApiProperty({ example: 'SALES_ORDER' }) entity!: string;
  @ApiProperty() entityId!: string;
  @ApiPropertyOptional({ type: Object, nullable: true }) before!: Prisma.JsonValue | null;
  @ApiPropertyOptional({ type: Object, nullable: true }) after!: Prisma.JsonValue | null;
  @ApiPropertyOptional({ nullable: true }) actor!: string | null;
  @ApiProperty({ description: 'Data e hora do evento.' }) createdAt!: Date;

  static from(log: AuditLog): AuditLogResponse {
    return {
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      before: log.before,
      after: log.after,
      actor: log.actor,
      createdAt: log.createdAt,
    };
  }
}
```

- [ ] **Step 4: Escrever o controller**

`src/modules/audit/audit.controller.ts`:

```ts
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SalesOrdersRepository } from '../sales-orders/sales-orders.repository';
import { AuditService } from './audit.service';
import { AuditLogResponse } from './dto/audit-log.response';

@ApiTags('audit')
@Controller('sales-orders/:id/audit')
export class AuditController {
  constructor(
    private readonly service: AuditService,
    private readonly orders: SalesOrdersRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Timeline de auditoria da OV, mais recente primeiro. Somente leitura.' })
  async findBySalesOrder(@Param('id', ParseUUIDPipe) id: string): Promise<AuditLogResponse[]> {
    // Garante 404 para OV inexistente, em vez de devolver lista vazia.
    await this.orders.findByIdOrThrow(id);
    const logs = await this.service.listBySalesOrder(id);
    return logs.map(AuditLogResponse.from);
  }
}
```

- [ ] **Step 5: Registrar o controller no módulo**

Substituir `src/modules/audit/audit.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SalesOrdersModule } from '../sales-orders/sales-orders.module';
import { AuditController } from './audit.controller';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

@Module({
  imports: [SalesOrdersModule],
  controllers: [AuditController],
  providers: [AuditService, AuditRepository],
  exports: [AuditService],
})
export class AuditModule {}
```

Isso cria um ciclo real de módulos: `SalesOrdersModule` importa `AuditModule` (precisa de `AuditService`) e `AuditModule` importa `SalesOrdersModule` (precisa de `SalesOrdersRepository`). Resolva com `forwardRef` nos dois lados.

Em `audit.module.ts`:

```ts
import { forwardRef, Module } from '@nestjs/common';
// ...
  imports: [forwardRef(() => SalesOrdersModule)],
```

Em `sales-orders.module.ts`:

```ts
import { forwardRef, Module } from '@nestjs/common';
// ...
  imports: [CustomersModule, TransportTypesModule, ItemsModule, forwardRef(() => AuditModule)],
```

E, em `AuditController`, injetar `SalesOrdersRepository` com `@Inject(forwardRef(() => SalesOrdersRepository))`:

```ts
import { Controller, Get, Inject, Param, ParseUUIDPipe, forwardRef } from '@nestjs/common';
// ...
  constructor(
    private readonly service: AuditService,
    @Inject(forwardRef(() => SalesOrdersRepository))
    private readonly orders: SalesOrdersRepository,
  ) {}
```

- [ ] **Step 6: Rodar o teste e verificar que passa**

Run: `pnpm test:e2e -- audit`
Expected: PASS, 2 testes.

- [ ] **Step 7: Rodar a suíte inteira**

Run: `pnpm test && pnpm test:e2e`
Expected: PASS em tudo. Se `sales-orders-status` quebrar aqui e passar isolado, o culpado é vazamento de estado entre suítes — confira se `truncateAll` roda no `beforeEach` de todas.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: endpoint de consulta da timeline de auditoria"
```

---

## Task 12: README e documentação técnica

**Files:**
- Create: `README.md`
- Modify: `package.json` (scripts de conveniência)

**Interfaces:**
- Consumes: tudo que as tasks anteriores produziram.
- Produces: documentação exigida pelo enunciado.

O enunciado enumera as seções do README e avalia "capacidade de justificar trade-offs". A seção de trade-offs não é apêndice.

- [ ] **Step 1: Adicionar scripts de conveniência ao `package.json`**

Em `"scripts"`:

```json
"db:up": "docker compose up -d",
"db:down": "docker compose down",
"db:migrate": "prisma migrate dev",
"db:seed": "prisma db seed",
"db:reset": "prisma migrate reset --force"
```

- [ ] **Step 2: Escrever o README**

`README.md` precisa conter, nesta ordem, as oito seções exigidas pelo enunciado. Conteúdo de cada uma:

1. **Instruções de execução.**

````markdown
## Executando

Pré-requisitos: Node >= 20.19, pnpm, Docker.

```bash
pnpm install
pnpm db:up          # sobe o Postgres
pnpm db:migrate     # aplica as migrations
pnpm db:seed        # popula dados de exemplo
pnpm start:dev      # API em http://localhost:3000/api
```

Swagger: http://localhost:3000/docs

Testes:

```bash
pnpm test           # unitários
pnpm test:e2e       # integração (exige o Postgres no ar)
```
````

2. **Tecnologias utilizadas.** Tabela da §2 do spec, com a justificativa de Prisma sobre TypeORM/Sequelize.

3. **Decisões arquiteturais.** Módulos por domínio; `Controller → Service → Repository → PrismaService`; por que existe camada de repositório (passar o `tx` adiante); por que **não** há Clean Architecture completa com ports e adapters (haveria um único adapter — a indireção não se paga).

4. **Estratégia de modelagem do domínio.** Agregado `SalesOrder`; `SalesOrderItem` como join com payload (`quantity` + snapshot de `unitPrice`); `Decimal(12,2)` para dinheiro; `TransportType` como linha e nunca enum, para satisfazer "novos tipos sem alteração das regras"; `AuditLog` com `salesOrderId` (raiz do agregado) mais `entity`/`entityId` (linha afetada).

5. **Estratégia de persistência.** Prisma 7 com `prisma-client` generator e migrations versionadas; toda mutação auditada dentro de `$transaction`; confirmação de agendamento em isolamento `Serializable` por causa da checagem de capacidade; snapshot de preço no momento da venda.

6. **Considerações sobre escalabilidade.** `AuditLog` é append-only e cresce sem limite — candidato a particionamento por `createdAt` ou arquivamento frio. Leituras de monitoramento são o hot path e escalam por réplica de leitura. O ponto de contenção sob concorrência é a capacidade de slot, hoje serializada.

7. **Considerações sobre performance.** Índices em `SalesOrder.status`, `SalesOrder.customerId`, `SalesOrder.transportTypeId`, `DeliverySchedule.[scheduledDate, window]` e `AuditLog.[salesOrderId, createdAt]`. `include` explícito e centralizado no repositório evita N+1. `ItemsRepository.findManyByIds` resolve N itens em uma query. Paginação é a primeira dívida a pagar.

8. **Trade-offs assumidos.** Copiar a tabela de 11 linhas da §12 do spec.

Incluir também uma seção **Fluxo de status** com o diagrama e a regra da pré-condição de `AGENDADA`, e uma seção **Escopo** listando o que ficou de fora e por quê (sem auth, sem cancelamento, sem paginação, sem hard delete).

- [ ] **Step 3: Verificar as instruções em ambiente limpo**

```bash
pnpm db:reset
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm start:dev
```

Expected: a API sobe, `GET http://localhost:3000/api/health` responde `{"status":"ok","database":"up"}`, e `http://localhost:3000/docs` lista todos os endpoints das tasks 6 a 11.

Um README cujo passo a passo você não executou é um README errado.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: README com decisões arquiteturais, modelagem e trade-offs"
```

---

## Self-Review

**Cobertura do spec:**

| Seção do spec | Task |
|---|---|
| §2 Stack, §2.1 Prisma 7 | 1 |
| §3 Arquitetura, §3.1 Repositório | 1, 6–11 |
| §4 Modelo de dados | 2 |
| §5.1 Invariantes da OV | 8 (`@ArrayNotEmpty` + transação), 10 |
| §5.2 Máquina de estados | 4, 10 |
| §5.3 Pré-condição de `AGENDADA` | 4, 10 |
| §5.4 Troca de transporte | 10 |
| §5.5 Agendamento, janela, reagendamento, capacidade | 9 |
| §5.6 `actor` via `X-Actor` | 8 (decorator) |
| §6.1 Clientes | 6 |
| §6.2 Tipos de transporte, §6.3 Itens | 7 |
| §6.4 OV, §6.4.1 Filtros de monitoramento | 8 |
| §6.5 Agendamento | 9 |
| §6.6 Auditoria (leitura) | 11 |
| §7 Auditoria transacional | 5, e testes de rollback em 8 e 10 |
| §8 Erros | 3 |
| §9 Testes | distribuídos; suíte completa na Task 11, Step 7 |
| §10 Infra, §10.1 README | 1, 2, 12 |
| §12 Trade-offs | 12 |

**Consistência de tipos:** `Tx` é definido na Task 1 e usado em 5–11. `SalesOrderWithRelations` é exportado pelo repositório na Task 8 e consumido em 9, 10 e nos responses. `assertOrderAcceptsScheduleChange` nasce na Task 9 e é reusada na 10. `AuditService.record(tx, input)` tem a mesma assinatura em 5, 8, 9 e 10. `MAX_DELIVERIES_PER_SLOT` é definido uma vez, em `schedule-rules.ts`.

**Riscos conhecidos, com mitigação no plano:**

- *Ciclo de módulos entre `AuditModule` e `SalesOrdersModule`* — aparece só na Task 11, quando o `AuditController` precisa do `SalesOrdersRepository`. Resolvido com `forwardRef` nos dois lados; o Step 5 mostra o código exato.
- *`schedule-rules.ts` importado por `sales-orders.service.ts`* — não gera ciclo de DI porque é função pura. Verificação explícita na Task 10, Step 6.
- *Testes e2e compartilhando banco* — `truncateAll` com `RESTART IDENTITY CASCADE` no `beforeEach` de cada suíte. `.env.test` aponta para o schema `test`.
