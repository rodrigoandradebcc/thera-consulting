# OVGS — Sistema de Gestão de Ordens de Venda — Backend Design

**Data:** 2026-07-09
**Status:** aguardando revisão
**Fonte:** `Desafio Técnico — Sistema de Gestão de Ordens de Venda (OVGS)`, perfil Back-end.

---

## 1. Objetivo

Backend NestJS + Prisma + PostgreSQL expondo API REST para gestão do ciclo de vida de Ordens de Venda (OV). O enunciado exige sete entregas: API REST, modelagem de domínio, persistência, regras de negócio, auditoria, testes automatizados e documentação técnica. Interface gráfica não é necessária.

O enunciado é explícito sobre o que está sendo avaliado: "mais do que a implementação funcional dos requisitos, buscamos compreender como o candidato estrutura soluções [...], realiza escolhas arquiteturais e equilibra requisitos de manutenibilidade, escalabilidade e evolução". Portanto **cada decisão não-óbvia deste documento carrega a sua justificativa**, e a §12 as consolida como trade-offs.

A regra central é um **fluxo de status estritamente linear** da OV, com auditoria de toda mutação relevante.

---

## 2. Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Runtime | Node 22 LTS | alvo do NestJS 11 |
| Framework | NestJS 11 | requisito |
| Linguagem | TypeScript (strict) | requisito |
| Banco | PostgreSQL 17 | requisito |
| ORM | Prisma 7 | o enunciado aceita Prisma, TypeORM ou Sequelize; Prisma dá tipagem derivada do schema e migrations versionadas sem decorator |
| Pacotes | pnpm | escolha do autor |
| Docs | `@nestjs/swagger`, servido em `/docs` | requisito |
| Validação | `class-validator` + `class-transformer` | padrão NestJS |
| Config | `@nestjs/config` + validação de env | falhar no boot, não em runtime |
| Testes | Jest (unit + e2e), padrão do NestJS | escolha do autor |

### 2.1 Prisma 7 — configuração do generator

Prisma 7 mudou o generator: `prisma-client-js` (que escrevia em `node_modules`) deu lugar a `prisma-client`, com `output` **obrigatório**. NestJS compila para CommonJS, então `moduleFormat = "cjs"` é necessário.

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../generated/prisma"
  moduleFormat = "cjs"
}
```

Import correspondente: `import { PrismaClient } from '../../generated/prisma/client'`.

`tsconfig.json` precisa de `"module": "CommonJS"` e `"moduleResolution": "node"`.

`generated/` entra no `.gitignore`; `pnpm prisma generate` roda no `postinstall`.

---

## 3. Arquitetura

```
src/
  main.ts                     # bootstrap, Swagger, ValidationPipe, filter global
  app.module.ts
  common/
    prisma/                   # PrismaModule (global) + PrismaService
    filters/                  # AllExceptionsFilter
    exceptions/               # exceções de domínio
  modules/
    customers/          # controller, service, repository, dto/
    transport-types/
    items/
    sales-orders/
      domain/status-machine.ts
    scheduling/
    audit/
```

Cada módulo de domínio segue `Controller → Service → Repository → PrismaService`.

`PrismaService extends PrismaClient` implementando `OnModuleInit` (`await this.$connect()`). `PrismaModule` é `@Global()`, então os repositórios o injetam sem reimportar.

**Regra de dependência:** `sales-orders` depende de `audit` e `scheduling`. `audit` não depende de ninguém — é folha. Isso evita ciclo de módulos.

### 3.1 Camada de repositório

O enunciado lista `Repositories` na estrutura esperada. Aqui ela paga o próprio custo por uma razão concreta: **toda mutação auditada roda dentro de `$transaction`**, e o service precisa passar o client transacional adiante. Os métodos de repositório recebem um `PrismaTransactionClient` opcional:

```ts
type Tx = Prisma.TransactionClient | PrismaService;

@Injectable()
export class SalesOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string, tx: Tx = this.prisma) {
    return tx.salesOrder.findUnique({ where: { id } });
  }
  // ...
}
```

Isso mantém o service livre de sintaxe de query, e concentra em um lugar as decisões de `include`/`select` — que é onde nasce o N+1.

O repositório é fino de propósito: mapeia intenção de domínio (`findWithItems`, `existsAuthorizedTransport`) para query. Não é um port genérico com interface abstrata e injeção por token — isso seria Clean Architecture completa, custo que este escopo não devolve.

### 3.2 Fronteiras

| Unidade | Faz | Não faz |
|---|---|---|
| `status-machine.ts` | valida transição de status. Função pura. | não toca banco, não audita |
| `*Repository` | traduz intenção de domínio em query Prisma; aceita `tx` | não valida regra, não audita |
| `AuditService` | grava `AuditLog` dentro de uma transação recebida | não abre transação própria |
| `SchedulingService` | CRUD de `DeliverySchedule`, confirmação, reagendamento | não altera status da OV |
| `SalesOrdersService` | orquestra: valida invariantes, abre transação, chama audit | não formata HTTP, não escreve SQL |

---

## 4. Modelo de dados

### 4.1 Relações (do enunciado)

- `Customer` 1:N `SalesOrder`
- `TransportType` 1:N `SalesOrder`
- `Customer` N:N `TransportType` — transportes **permitidos** para o cliente
- `SalesOrder` N:N `Item`
- `SalesOrder` 1:1 `DeliverySchedule`
- `SalesOrder` 1:N `AuditLog`

### 4.2 Schema

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
  MANHA      // 08:00–12:00
  TARDE      // 13:00–18:00
  INTEGRAL   // 08:00–18:00
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
  number          String            @unique
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

### 4.3 Decisões de modelagem

**`SalesOrderItem` é join explícito com payload.** Um N:N puro perderia `quantity`. Além disso, `unitPrice` é copiado do `Item` no momento da criação da OV: se o preço do catálogo mudar depois, o valor histórico da venda não pode mudar junto.

**`Decimal(12,2)` para dinheiro.** Nunca `Float` — erro de ponto flutuante em valor monetário é defeito, não arredondamento.

**`DeliverySchedule.salesOrderId` é `@unique`.** É isso que transforma o 1:N implícito do Prisma em 1:1 real.

**Data e janela são colunas separadas.** O enunciado pede "definição da data de entrega" *e* "definição de janela de atendimento" como coisas distintas. Um único `DateTime` colapsaria as duas: `2026-08-01T09:00` não distingue "entregar às 9h" de "entregar pela manhã". `scheduledDate @db.Date` + `window` enum modela o que o negócio realmente decide. O índice `[scheduledDate, window]` serve a checagem de capacidade (§5.5) e o filtro por data (§6.4).

**`rescheduleCount`** existe porque reagendamento é requisito, e a contagem é o dado que o negócio pede primeiro (quem remarca demais?). O histórico completo de cada remarcação já vive no `AuditLog`; a coluna é só um contador desnormalizado para consulta barata.

**Tipo de transporte é linha, nunca enum.** O enunciado exige que "a inclusão de novos tipos ocorra sem alteração das regras de negócio". Nenhum `switch` sobre `TransportType.code` pode existir no código: a autorização é resolvida por consulta a `CustomerTransportType`, não por lógica condicional.

**`AuditLog` tem `salesOrderId` *e* `entity`/`entityId`.** O enunciado exige registrar a "entidade afetada", e alteração de agendamento afeta `DeliverySchedule`, não `SalesOrder`. Mas o enunciado também define `SalesOrder 1:N AuditLog`. Os dois convivem: `salesOrderId` é a raiz do agregado (sempre preenchida, indexada, serve o `GET /sales-orders/:id/audit`); `entity`/`entityId` dizem qual linha concreta mudou.

**Nomes de enum em português** porque o enunciado especifica os valores literais (`CRIADA`, `PLANEJADA`, …). Renomear introduziria tradução na fronteira sem ganho.

---

## 5. Regras de negócio

### 5.1 Invariantes da OV

Uma OV válida tem exatamente um cliente, exatamente um tipo de transporte, ao menos um item, e status válido.

| Invariante | Onde é garantida |
|---|---|
| exatamente 1 cliente | FK `customerId` NOT NULL |
| exatamente 1 tipo de transporte | FK `transportTypeId` NOT NULL |
| **ao menos 1 item** | service, dentro de transação |
| status válido | enum Postgres + máquina de estados |

"Ao menos um item" é invariante de agregado, não de linha — nenhuma FK a expressa. Poderia virar constraint deferida ou trigger, mas isso enterra regra de negócio no banco por um ganho marginal neste escopo. **Decisão:** validar no service (`items` não-vazio no `CreateSalesOrderDto` via `@ArrayNotEmpty`, e a criação inteira dentro de `$transaction`), cobrir com teste. Como nenhum endpoint remove itens de uma OV existente (§6), a invariante não pode ser violada após a criação.

**Transporte tem que ser permitido:** `SalesOrder.transportTypeId` precisa existir em `CustomerTransportType` para aquele `customerId`. Vale na criação e no `PATCH /transport-type`. Violação → `409`.

**Itens são imutáveis após a criação.** Não há endpoint para adicionar, remover ou editar item de uma OV. Consequência: o snapshot de `unitPrice` é trivialmente consistente, e `total` é calculado uma vez (`Σ quantity × unitPrice`) e nunca recalculado.

### 5.2 Máquina de estados

```
CRIADA → PLANEJADA → AGENDADA → EM_TRANSPORTE → ENTREGUE
```

Estritamente linear. Só o sucessor imediato é válido. Pular etapa, retroceder, ou mutar uma OV `ENTREGUE` → erro.

Fonte de verdade única, em `modules/sales-orders/domain/status-machine.ts`:

```ts
export const NEXT_STATUS: Record<SalesOrderStatus, SalesOrderStatus | null> = {
  CRIADA:        SalesOrderStatus.PLANEJADA,
  PLANEJADA:     SalesOrderStatus.AGENDADA,
  AGENDADA:      SalesOrderStatus.EM_TRANSPORTE,
  EM_TRANSPORTE: SalesOrderStatus.ENTREGUE,
  ENTREGUE:      null,
};

export function assertTransition(from: SalesOrderStatus, to: SalesOrderStatus): void {
  if (NEXT_STATUS[from] !== to) throw new InvalidStatusTransitionException(from, to);
}
```

Função pura: sem banco, sem I/O, testável isoladamente. Nenhum `if` de status espalhado por services.

**Não existe cancelamento.** O enunciado não menciona `CANCELADA`. Aplicando YAGNI, fica de fora — introduzir cancelamento transformaria a máquina de linha em grafo.

### 5.3 Quem move para `AGENDADA` — decisão

Duas rotas poderiam alterar o status para `AGENDADA`: `PATCH /:id/status` e `POST /:id/schedule/confirm`. Duas portas para o mesmo campo é ambiguidade.

O enunciado, porém, lista "Atualizar status da Ordem de Venda" como funcionalidade da gestão de OV, e `AGENDADA` como estado ordinário do fluxo. Fechar essa porta faria a API divergir do requisito escrito.

**Decisão:** `PATCH /:id/status` é a **única** rota que escreve `SalesOrder.status`. `AGENDADA` é um alvo aceito como qualquer outro, sujeito a uma **pré-condição de agregado**:

> `PLANEJADA → AGENDADA` exige um `DeliverySchedule` existente com `status = CONFIRMADO`. Sem ele, `409 OrderNotSchedulableException`.

`POST /:id/schedule/confirm` apenas marca `DeliverySchedule.status = CONFIRMADO`. Não toca em `SalesOrder`.

O invariante — "nenhuma OV `AGENDADA` sem agendamento confirmado" — continua garantido, agora sem efeito colateral escondido: cada rota escreve uma entidade só, e a máquina de estados segue como única autoridade sobre `status`. A validação de transição fica em duas partes complementares e puras: `assertTransition` (a sequência é válida?) e `assertSchedulePrecondition` (o agregado permite?).

### 5.4 Troca de transporte — decisão

`PATCH /sales-orders/:id/transport-type` é permitido enquanto `status ∈ {CRIADA, PLANEJADA, AGENDADA}`. A partir de `EM_TRANSPORTE` a carga já saiu; trocar transportadora seria reescrever história. Violação → `409`.

O novo transporte também precisa estar autorizado para o cliente (§5.1) — mesma regra da criação, mesmo método de repositório.

### 5.5 Agendamento

O enunciado exige quatro capacidades: definir data de entrega, definir janela de atendimento, confirmar, e reagendar. As regras de disponibilidade "poderão ser simplificadas ou simuladas".

- `POST /:id/schedule` cria o `DeliverySchedule` com `scheduledDate` + `window`, status `PENDENTE`. `409` se já existir (é 1:1).
- `POST /:id/schedule/confirm` exige status `PENDENTE` → marca `CONFIRMADO`. Confirmar duas vezes → `409`.
- `PATCH /:id/schedule` é o **reagendamento**: altera `scheduledDate` e/ou `window`, incrementa `rescheduleCount`. Permitido enquanto a OV não estiver `EM_TRANSPORTE` ou `ENTREGUE`.

**Reagendar não rebaixa o status do agendamento.** Um `DeliverySchedule` `CONFIRMADO` que muda de data continua `CONFIRMADO`. A alternativa — voltar para `PENDENTE` — deixaria uma OV `AGENDADA` apoiada em agendamento não confirmado, quebrando o invariante da §5.3. Remarcar entrega já acordada é renegociação, não cancelamento.

**Disponibilidade (simulada):** no máximo `MAX_DELIVERIES_PER_SLOT = 5` agendamentos **confirmados** por `(scheduledDate, window)`. Confirmar além disso → `409 SlotUnavailableException`. É a regra mais simples que ainda exercita o índice `[scheduledDate, window]` e força a checagem a rodar **dentro da transação de confirmação**, não antes dela — caso contrário duas confirmações concorrentes passariam as duas.

**`scheduledDate` precisa ser futura**, na criação e no reagendamento. Sem feriado nem lead time: o enunciado não pede.

### 5.6 `actor` — decisão

O desafio não tem autenticação. `actor` é lido do header opcional `X-Actor`, com default `"system"`. Isso mantém a coluna preenchida e útil, sem inventar um sistema de auth fora de escopo. Trocar por um `sub` de JWT depois é uma mudança de uma linha.

---

## 6. API REST

Prefixo global: `/api`. Documentação Swagger em `/docs`.

### 6.1 Clientes

| Verbo | Rota | Sucesso | Erros |
|---|---|---|---|
| POST | `/customers` | 201 | 400 payload, 409 `document` duplicado |
| GET | `/customers` | 200 | — |
| GET | `/customers/:id` | 200 | 404 |
| PATCH | `/customers/:id` | 200 | 400, 404 |
| POST | `/customers/:id/transport-types` | 200 | 400, 404 cliente/transporte |

`POST /customers/:id/transport-types` recebe `{ "transportTypeIds": string[] }`. Semântica **aditiva e idempotente**: vincula os IDs informados, ignora os já vinculados (`skipDuplicates`), não remove nada. Reenviar o mesmo corpo não muda estado nem retorna erro.

### 6.2 Tipos de transporte

| Verbo | Rota | Sucesso | Erros |
|---|---|---|---|
| POST | `/transport-types` | 201 | 400, 409 `code` duplicado |
| GET | `/transport-types` | 200 | — |
| PATCH | `/transport-types/:id` | 200 | 400, 404 |

Não há `GET /transport-types/:id` — não está no enunciado e nenhum fluxo precisa dele.

### 6.3 Itens

| Verbo | Rota | Sucesso | Erros |
|---|---|---|---|
| POST | `/items` | 201 | 400, 409 `sku` duplicado |
| GET | `/items` | 200 | — |
| GET | `/items/:id` | 200 | 404 |

Não há `PATCH /items/:id`: o enunciado não o lista, e itens são imutáveis.

### 6.4 Ordens de venda

| Verbo | Rota | Regra | Sucesso | Erros |
|---|---|---|---|---|
| POST | `/sales-orders` | cliente ativo existe; transporte ∈ permitidos do cliente; ≥1 item; status inicial `CRIADA`; `total` calculado | 201 | 400, 404, 409 transporte não permitido |
| GET | `/sales-orders` | lista + filtros de monitoramento (§6.4.1) | 200 | 400 filtro inválido |
| GET | `/sales-orders/:id` | detalhe com itens, transporte, agendamento | 200 | 404 |
| PATCH | `/sales-orders/:id/status` | `{ "status": "<alvo>" }`; valida contra a máquina; alvo `AGENDADA` rejeitado | 200 | 400, 404, 409 transição inválida |
| PATCH | `/sales-orders/:id/transport-type` | `{ "transportTypeId": "..." }`; ∈ permitidos; status < `EM_TRANSPORTE` | 200 | 400, 404, 409 |

`PATCH /status` recebe o **alvo explícito**, não um "avançar". O cliente da API declara a intenção; o servidor valida. Um `POST /advance` sem corpo seria mais curto e menos seguro: um duplo clique avançaria dois estados sem erro.

O alvo `AGENDADA` é aceito, mas exige agendamento confirmado (§5.3).

#### 6.4.1 Monitoramento operacional

O enunciado pede consultas filtradas por status, cliente, tipo de transporte e data. `GET /sales-orders` aceita, todos opcionais e combináveis por `AND`:

| Query param | Tipo | Filtra |
|---|---|---|
| `status` | `SalesOrderStatus` | `salesOrder.status` |
| `customerId` | uuid | `salesOrder.customerId` |
| `transportTypeId` | uuid | `salesOrder.transportTypeId` |
| `scheduledFrom` / `scheduledTo` | `YYYY-MM-DD` | `schedule.scheduledDate`, intervalo inclusivo |
| `window` | `DeliveryWindow` | `schedule.window` |

"Data" no enunciado é ambíguo entre data de criação e data de entrega. **Decisão:** filtrar por **data de entrega agendada**, porque é a data que o monitoramento logístico observa — quem olha o painel quer saber o que entrega amanhã, não o que foi cadastrado ontem. `createdAt` não é filtrável; se fosse pedido, entraria como `createdFrom`/`createdTo`.

Filtro por `scheduledFrom`/`scheduledTo`/`window` implica `INNER JOIN` no agendamento: OVs sem `DeliverySchedule` somem do resultado. Isso é correto — uma OV sem agendamento não tem data de entrega para filtrar.

Um DTO `ListSalesOrdersQueryDto` valida os params (`@IsOptional`, `@IsEnum`, `@IsUUID`, `@IsDateString`); `forbidNonWhitelisted` rejeita param desconhecido com `400`, em vez de ignorá-lo em silêncio e devolver um resultado que o cliente vai interpretar errado.

### 6.5 Agendamento

Corpo de `POST` e `PATCH`: `{ "scheduledDate": "2026-08-01", "window": "MANHA" }`.

| Verbo | Rota | Regra | Sucesso | Erros |
|---|---|---|---|---|
| POST | `/sales-orders/:id/schedule` | data futura; janela obrigatória; não pode já existir | 201 | 400, 404, 409 já agendado |
| PATCH | `/sales-orders/:id/schedule` | reagenda; incrementa `rescheduleCount`; status < `EM_TRANSPORTE` | 200 | 400, 404, 409 |
| POST | `/sales-orders/:id/schedule/confirm` | schedule `PENDENTE` + slot com capacidade → `CONFIRMADO` | 200 | 404, 409 já confirmado, 409 slot cheio |

`confirm` **não** altera `SalesOrder.status` (§5.3).

### 6.6 Auditoria

| Verbo | Rota | Sucesso |
|---|---|---|
| GET | `/sales-orders/:id/audit` | 200 — timeline `createdAt desc` |

Somente leitura. Não há rota que crie, edite ou apague `AuditLog`.

### 6.7 Ausência de DELETE

Nenhum endpoint do enunciado é `DELETE`. Baixa é lógica, via `PATCH { "active": false }`. Consistente com o campo `active` e com auditoria: não se audita uma linha que foi apagada.

---

## 7. Auditoria

### 7.1 Eventos exigidos

| Evento | `action` | `entity` |
|---|---|---|
| Criação da OV | `ORDER_CREATED` | `SALES_ORDER` |
| Alteração de status | `STATUS_CHANGED` | `SALES_ORDER` |
| Alteração de agendamento | `SCHEDULE_CHANGED` | `DELIVERY_SCHEDULE` |
| Alteração de transporte | `TRANSPORT_CHANGED` | `SALES_ORDER` |

Cada registro salva data/hora (`createdAt`), tipo da ação (`action`), entidade afetada (`entity` + `entityId`), estado anterior (`before`) e posterior (`after`).

"Alteração de agendamento" cobre criação, reagendamento e confirmação — as três escrevem `SCHEDULE_CHANGED` sobre `DELIVERY_SCHEDULE`. O `before`/`after` distingue qual foi: criação tem `before = null`; confirmação move `status`; reagendamento move `scheduledDate`/`window`. Três `action` separadas seriam mais explícitas, mas o enunciado nomeia um evento só, e o diff já carrega a informação.

`ORDER_CREATED` tem `before = null` — o enunciado prevê isso ao dizer "quando aplicável". Os demais têm ambos preenchidos, contendo **apenas os campos afetados**, não o objeto inteiro. `STATUS_CHANGED` grava `{ "status": "CRIADA" } → { "status": "PLANEJADA" }`, e nada mais. Diff pequeno é diff legível.

### 7.2 Escrita explícita, dentro da transação

**Não** usar Prisma middleware / `$extends` para auditar. Três razões concretas:

1. O middleware não conhece o estado anterior sem disparar um `SELECT` extra.
2. Não conhece o `actor` (vem do header HTTP, fora do escopo do ORM).
3. Não distingue `STATUS_CHANGED` de `TRANSPORT_CHANGED` — para o Prisma, ambos são um `update` em `SalesOrder`.

Em vez disso, `AuditService.record(tx, dto)` recebe o **client transacional** e é chamado explicitamente pelo service que fez a mutação, dentro do mesmo `prisma.$transaction`. Se a mutação sofre rollback, o log some junto. O log e o fato nunca divergem.

```ts
await this.prisma.$transaction(async (tx) => {
  const before = await this.orders.findByIdOrThrow(id, tx);
  assertTransition(before.status, dto.status);
  await assertSchedulePrecondition(before, dto.status, tx);
  const after = await this.orders.updateStatus(id, dto.status, tx);
  await this.audit.record(tx, {
    salesOrderId: id,
    entity: AuditEntity.SALES_ORDER,
    entityId: id,
    action: AuditAction.STATUS_CHANGED,
    before: { status: before.status },
    after: { status: after.status },
    actor,
  });
  return after;
});
```

`AuditService` nunca abre transação própria — sempre recebe uma. Isso o torna componível e impossível de usar errado.

---

## 8. Erros

Exceções de domínio em `common/exceptions/`, todas estendendo uma base:

| Exceção | HTTP |
|---|---|
| `InvalidStatusTransitionException` | 409 |
| `TransportTypeNotAllowedException` | 409 |
| `ScheduleAlreadyExistsException` | 409 |
| `ScheduleAlreadyConfirmedException` | 409 |
| `SlotUnavailableException` | 409 |
| `OrderNotSchedulableException` | 409 |
| `EntityNotFoundException` | 404 |
| falha de `class-validator` | 400 |

**409, não 400, para violação de regra.** O payload é sintaticamente válido; é o *estado do recurso* que proíbe a operação. `400` diria ao cliente para corrigir o corpo, o que não ajudaria.

`AllExceptionsFilter` (global) normaliza toda resposta de erro:

```json
{
  "statusCode": 409,
  "error": "InvalidStatusTransition",
  "message": "Transição de CRIADA para AGENDADA não é permitida.",
  "path": "/api/sales-orders/abc/status",
  "timestamp": "2026-07-09T12:00:00.000Z"
}
```

Erros não previstos viram `500` com mensagem genérica; o stack vai para o log, nunca para o corpo da resposta.

`ValidationPipe` global com `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. Campo desconhecido no corpo → `400`, em vez de ser silenciosamente ignorado.

Responses são classes com `@ApiProperty`, montadas a partir do model. O model do Prisma nunca é serializado direto para a resposta — isso evita vazar coluna nova sem querer no dia em que o schema mudar.

---

## 9. Testes

O enunciado exige o mínimo de **2 testes unitários + 1 de integração**, e trata cobertura mais ampla como diferencial. O plano abaixo excede o mínimo de propósito: a regra central do desafio é uma máquina de estados, e máquina de estados se testa por exaustão.

**Unitários** (sem banco):
- `status-machine`: matriz completa 5×5 — as 25 combinações, 4 válidas e 21 rejeitadas. Tabela, não 25 `it()` copiados.
- `assertSchedulePrecondition`: `PLANEJADA → AGENDADA` sem schedule, com schedule `PENDENTE`, com schedule `CONFIRMADO`.
- Cálculo de `total` (`Σ quantity × unitPrice`), incluindo precisão `Decimal`.
- Autorização de transporte: cliente sem vínculo → exceção.

**Integração / E2E** (`supertest`, contra Postgres real via `docker compose`, banco truncado entre testes):
- Fluxo feliz completo: criar cliente → autorizar transporte → criar item → criar OV → `PLANEJADA` → agendar (data + janela) → confirmar → `AGENDADA` → `EM_TRANSPORTE` → `ENTREGUE`.
- Transição inválida (`CRIADA → ENTREGUE`) → 409.
- `PLANEJADA → AGENDADA` sem agendamento confirmado → 409.
- OV sem item → 400.
- OV com transporte não autorizado para o cliente → 409.
- `POST /schedule` duas vezes → 409.
- Reagendamento de schedule `CONFIRMADO` mantém `CONFIRMADO` e incrementa `rescheduleCount`.
- Sexta confirmação no mesmo `(scheduledDate, window)` → 409 slot cheio.
- Trocar transporte em OV `EM_TRANSPORTE` → 409.
- Filtros de `GET /sales-orders`: por status, cliente, transporte e intervalo de data.
- `GET /audit` após o fluxo feliz: ordem, `action`, `before`/`after` de cada evento.
- **Rollback:** forçar falha após o `update` e confirmar que nenhum `AuditLog` foi gravado.

O último caso é o que prova que a auditoria é transacional. Sem ele, o design da §7.2 é uma alegação, não uma garantia.

---

## 10. Infra

`docker-compose.yml` sobe **apenas** o Postgres (porta 5432, volume nomeado, healthcheck). A API roda local via `pnpm start:dev`, preservando hot reload e debug direto.

`.env` (com `.env.example` versionado):

```
DATABASE_URL=postgresql://thera:thera@localhost:5432/thera?schema=public
PORT=3000
```

`@nestjs/config` valida o env no boot. `DATABASE_URL` ausente → o processo não sobe.

Migrations via `prisma migrate dev`, com histórico versionado em `prisma/migrations/`. Prisma 7 usa `prisma.config.ts` na raiz para configuração de CLI e seed.

Seed (`prisma/seed.ts`): clientes, tipos de transporte (Caminhão, Carreta, Bi-truck — os exemplos do enunciado), itens e os vínculos N:N. O suficiente para exercitar a API sem `POST` manual.

Entregável é um repositório Git com código, `docker-compose.yml`, scripts de execução e README.

### 10.1 README — seções exigidas

O enunciado enumera o conteúdo do README. Cada item vira uma seção:

| Seção | Conteúdo |
|---|---|
| Instruções de execução | `docker compose up -d` → `pnpm prisma migrate dev` → `pnpm prisma db seed` → `pnpm start:dev` → `/docs` |
| Tecnologias utilizadas | §2 |
| Decisões arquiteturais | §3, com a justificativa da camada de repositório e a ausência de Clean Architecture completa |
| Estratégia de modelagem do domínio | §4.3 — agregado `SalesOrder`, join com payload, `Decimal` para dinheiro, transporte como linha e não enum |
| Estratégia de persistência | Prisma + migrations versionadas; transação por mutação auditada; snapshot de preço |
| Escalabilidade | `AuditLog` é append-only e cresce sem limite → candidato natural a particionamento por `createdAt` ou arquivamento; leituras de monitoramento são o hot path e escalam por réplica de leitura; a capacidade de slot (§5.5) é o ponto de contenção sob concorrência |
| Performance | índices `[status]`, `[customerId]`, `[scheduledDate, window]`, `[salesOrderId, createdAt]`; `include` explícito no repositório para evitar N+1; paginação é a primeira dívida a pagar |
| Trade-offs assumidos | §12 |

O enunciado avalia "capacidade de justificar trade-offs" — a seção de trade-offs do README não é um apêndice, é item avaliado.

---

## 11. Fora de escopo

Deliberadamente ausentes. Os quatro primeiros porque o enunciado não os pede; os demais são dívida consciente.

- Autenticação e autorização (só o header `X-Actor`). Listado como *diferencial*, não requisito.
- Cancelamento de OV — não há `CANCELADA` no fluxo.
- Mutação de itens após a criação da OV.
- Hard delete de qualquer entidade.
- Paginação nas listagens. **Dívida:** `GET /sales-orders` devolve tudo. Aceitável no volume do desafio, indefensável em produção; registrada no README.
- Regras reais de disponibilidade (feriado, lead time, capacidade por transportadora). O enunciado autoriza simular; a simulação é o teto de 5 por slot.
- Frontend.

**Diferenciais não perseguidos:** Event-Driven, cache, métricas, CI/CD. O enunciado diz que "a consistência técnica da solução será considerada mais relevante do que a quantidade de tecnologias utilizadas". Swagger e uma estratégia de teste ampla são os dois diferenciais que servem a esta solução; o resto seria vitrine.

---

## 12. Decisões e trade-offs

Tomadas na ausência de resposta explícita do enunciado. Cada uma é reversível, e cada uma vai para o README.

| # | Decisão | Alternativa rejeitada | Por quê |
|---|---|---|---|
| 1 | `PATCH /status` recebe alvo explícito (§6.4) | `POST /advance` sem corpo | duplo clique avançaria dois estados sem erro |
| 2 | `PATCH /status` é a única porta para `status`; `AGENDADA` exige schedule confirmado (§5.3) | `confirm` move o status como efeito colateral | o enunciado lista "atualizar status" como funcionalidade própria; efeito colateral escondido é pior que pré-condição explícita |
| 3 | Troca de transporte bloqueada a partir de `EM_TRANSPORTE` (§5.4) | livre até `ENTREGUE` | carga na estrada não troca de transportadora |
| 4 | `actor` vem do header `X-Actor`, default `"system"` (§5.6) | `null` sempre; ou implementar auth | mantém a coluna útil sem inventar auth fora de escopo |
| 5 | `POST /customers/:id/transport-types` é aditivo e idempotente (§6.1) | substituir a lista inteira | `POST` adiciona; substituição seria `PUT` |
| 6 | Sem `GET /transport-types/:id`, sem `PATCH /items/:id` (§6.2, §6.3) | criar por simetria | o enunciado lista Itens como "Criar; Consultar" apenas |
| 7 | "≥1 item" garantido no service dentro de transação, não por trigger (§5.1) | constraint deferida no Postgres | invariante de agregado pertence ao domínio, não ao DDL |
| 8 | Reagendar mantém `CONFIRMADO` (§5.5) | rebaixar para `PENDENTE` | rebaixar quebraria o invariante da §5.3 |
| 9 | Repositório fino, sem interface abstrata (§3.1) | Clean Architecture com ports/adapters | a indireção só paga quando há mais de um adapter; aqui haveria um |
| 10 | Filtro "data" = data de entrega agendada (§6.4.1) | data de criação | é a data que o monitoramento logístico observa |
| 11 | Sem paginação (§11) | `?page`/`?limit` desde o início | dívida consciente, documentada |
