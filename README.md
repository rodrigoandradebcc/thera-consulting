# OVGS — Sistema de Gestão de Ordens de Venda

API REST para gestão do ciclo de vida de Ordens de Venda (OV): cadastros, fluxo de status, agendamento de entregas e auditoria.

A regra central do sistema é um **fluxo de status estritamente linear**, e toda mutação relevante é auditada dentro da mesma transação que a produziu.

---

## Executando

Pré-requisitos: **Node >= 20.19**, **pnpm**, **Docker**.

```bash
pnpm install         # instala e roda `prisma generate` no postinstall
pnpm db:up           # sobe o Postgres 17 (docker compose)
pnpm db:migrate      # aplica as migrations
pnpm db:seed         # popula dados de exemplo (idempotente)
pnpm start:dev       # API em http://localhost:3000/api
```

Swagger: **http://localhost:3000/docs**
Health check: `GET http://localhost:3000/api/health`

### Testes

```bash
pnpm test            # 47 unitários
pnpm test:e2e        # 35 de integração (exige o Postgres no ar)
```

Os testes e2e rodam contra um Postgres real, no schema `test` (`.env.test`), isolado do banco de desenvolvimento. O comando `test:e2e` aplica as migrations nesse schema antes de rodar. Cada caso começa com as tabelas truncadas.

### Scripts

| Script | O que faz |
|---|---|
| `pnpm db:up` / `db:down` | sobe/derruba o Postgres |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:seed` | popula dados de exemplo |
| `pnpm db:reset` | recria o banco do zero |
| `pnpm build` | compila para `dist/` |
| `pnpm start:prod` | roda o build |

---

## Tecnologias utilizadas

| Camada | Escolha |
|---|---|
| Runtime | Node 20 LTS |
| Framework | NestJS 11 |
| Linguagem | TypeScript (strict) |
| Banco | PostgreSQL 17 (Docker Compose) |
| ORM | Prisma 7 |
| Documentação | Swagger / OpenAPI em `/docs` |
| Validação | class-validator + Zod (env) |
| Testes | Jest + Supertest |

**Por que Prisma, entre Prisma / TypeORM / Sequelize.** O schema é a fonte única de verdade, e os tipos do client são derivados dele — um campo renomeado quebra a compilação, não o runtime. As migrations são versionadas e revisáveis como SQL. Não há decorators de entidade competindo com os decorators do Nest.

**Nota sobre Prisma 7.** A versão 7 removeu `datasource.url` do `schema.prisma`: a conexão agora passa por um *driver adapter* (`@prisma/adapter-pg`) no construtor do `PrismaClient`. O client é gerado em `generated/prisma` com `moduleFormat = "cjs"`, porque o NestJS compila para CommonJS.

---

## Decisões arquiteturais

Módulos organizados **por domínio**, não por camada técnica:

```
src/
  common/          prisma, exceções, filtros, decorators, config
  modules/
    customers/     transport-types/     items/
    sales-orders/  domain/status-machine.ts, domain/schedule-precondition.ts
    scheduling/    domain/schedule-rules.ts
    audit/
```

Cada módulo segue `Controller → Service → Repository → PrismaService`.

**Por que existe camada de repositório.** Não é cerimônia: toda mutação auditada roda dentro de `prisma.$transaction`, e o service precisa passar o client transacional adiante. Os métodos do repositório aceitam um `tx` opcional:

```ts
findById(id: string, tx: Tx = this.prisma): Promise<Customer | null> {
  return tx.customer.findUnique({ where: { id } });
}
```

Isso mantém o service livre de sintaxe de query e concentra em um lugar as decisões de `include`/`select` — que é onde nasce o N+1.

**Por que não Clean Architecture completa.** Ports e adapters com interfaces abstratas e injeção por token só se pagam quando existe mais de um adapter. Aqui haveria exatamente um. A indireção custaria legibilidade sem comprar nada.

**Regras de negócio como funções puras.** `assertTransition`, `assertSchedulePrecondition`, `assertOrderAcceptsScheduleChange` e `calculateTotal` não tocam banco nem I/O. São testáveis isoladamente e não têm um `if` de status espalhado por service nenhum.

**Sem dependência circular.** O módulo de auditoria é folha: não importa `SalesOrdersModule`. Quando o `AuditController` precisou verificar se uma OV existe, a checagem foi para o `AuditRepository`, que já injeta o `PrismaService` global. `forwardRef` resolveria o ciclo, mas não o eliminaria.

---

## Estratégia de modelagem do domínio

**`SalesOrder` é a raiz do agregado.** Itens, agendamento e logs de auditoria só existem em função dela.

**`SalesOrderItem` é uma tabela de junção com payload.** Um N:N puro perderia `quantity`. Além disso, `unitPrice` é copiado do catálogo no momento da criação: se o preço do `Item` mudar depois, o valor histórico da venda não muda junto.

**Dinheiro é `Decimal(12,2)`, nunca `Float`.** Na fronteira HTTP, valores monetários trafegam como **string** (`"129.90"`), porque serializar como `number` reintroduziria o erro de ponto flutuante que o `Decimal` existe para evitar.

**`TransportType` é uma linha, nunca um enum.** O enunciado exige que novos tipos de transporte entrem "sem alteração das regras de negócio". Não existe `switch` sobre `TransportType.code` no código: a autorização é resolvida por consulta à tabela `CustomerTransportType`.

**`DeliverySchedule.salesOrderId` é `@unique`.** É isso que transforma o 1:N implícito do Prisma em um 1:1 real.

**Data e janela são colunas separadas.** `scheduledDate @db.Date` + `window` (`MANHA` / `TARDE` / `INTEGRAL`). Um único `DateTime` colapsaria as duas coisas: `2026-08-01T09:00` não distingue "entregar às 9h" de "entregar pela manhã".

**`AuditLog` tem `salesOrderId` *e* `entity`/`entityId`.** O primeiro é a raiz do agregado — sempre preenchido, indexado, serve o `GET /sales-orders/:id/audit`. Os outros dois dizem qual linha concreta mudou, já que uma alteração de agendamento afeta `DeliverySchedule`, não `SalesOrder`.

**`orderNumber` é `Int @default(autoincrement())`.** Gerar `"OV-" + (count + 1)` no service produziria número duplicado sob duas criações concorrentes: ambas leriam o mesmo `count`. A sequence do Postgres é atômica por construção. A formatação `OV-000042` é apresentação, e vive no response DTO.

---

## Fluxo de status

```
CRIADA → PLANEJADA → AGENDADA → EM_TRANSPORTE → ENTREGUE
```

Estritamente linear: só o sucessor imediato é válido. Pular etapa, retroceder, ou mutar uma OV `ENTREGUE` retorna **409**. Não existe cancelamento — o enunciado não prevê `CANCELADA`, e introduzi-lo transformaria a máquina de linha em grafo.

Fonte de verdade única, em `sales-orders/domain/status-machine.ts`:

```ts
export const NEXT_STATUS: Record<SalesOrderStatus, SalesOrderStatus | null> = {
  CRIADA: PLANEJADA, PLANEJADA: AGENDADA, AGENDADA: EM_TRANSPORTE,
  EM_TRANSPORTE: ENTREGUE, ENTREGUE: null,
};
```

**`PATCH /status` é a única rota que escreve `status`.** O alvo `AGENDADA` é aceito como qualquer outro, sujeito a uma pré-condição de agregado: exige um `DeliverySchedule` com status `CONFIRMADO`. `POST /schedule/confirm` apenas confirma o agendamento; não toca em `SalesOrder`.

O invariante — *nenhuma OV `AGENDADA` sem agendamento confirmado* — fica garantido sem efeito colateral escondido. Cada rota escreve uma entidade só.

### Invariantes da OV

| Invariante | Onde é garantida |
|---|---|
| exatamente 1 cliente | FK `customerId` NOT NULL |
| exatamente 1 tipo de transporte | FK `transportTypeId` NOT NULL |
| ao menos 1 item | `@ArrayNotEmpty` no DTO + transação no service |
| status válido | enum no Postgres + máquina de estados |

"Ao menos um item" é invariante de agregado, não de linha — nenhuma FK a expressa. Poderia virar trigger, mas isso enterraria regra de negócio no DDL. Como nenhum endpoint remove itens de uma OV existente, a invariante não pode ser violada depois da criação.

---

## Auditoria

Quatro eventos, conforme o enunciado:

| Evento | `action` | `entity` |
|---|---|---|
| Criação da OV | `ORDER_CREATED` | `SALES_ORDER` |
| Alteração de status | `STATUS_CHANGED` | `SALES_ORDER` |
| Alteração de agendamento | `SCHEDULE_CHANGED` | `DELIVERY_SCHEDULE` |
| Alteração de transporte | `TRANSPORT_CHANGED` | `SALES_ORDER` |

Cada registro grava data/hora, tipo da ação, entidade afetada, estado anterior e posterior. `ORDER_CREATED` tem `before = null` — o enunciado prevê isso ao dizer "quando aplicável".

`before`/`after` contêm **apenas os campos afetados**, não o objeto inteiro. `STATUS_CHANGED` grava `{"status":"CRIADA"} → {"status":"PLANEJADA"}`. Diff pequeno é diff legível.

### Por que a escrita é explícita, e não via middleware do Prisma

Um `$extends` / middleware **não serviria** aqui, por três razões concretas:

1. Não conhece o estado anterior sem disparar um `SELECT` extra.
2. Não conhece o `actor` — ele vem de um header HTTP, fora do escopo do ORM.
3. Não distingue `STATUS_CHANGED` de `TRANSPORT_CHANGED`: para o Prisma, ambos são um `update` em `SalesOrder`.

Em vez disso, `AuditService.record(tx, input)` recebe o **client transacional** e é chamado explicitamente pelo service que fez a mutação, dentro do mesmo `$transaction`. `AuditService` nunca abre transação própria. Se a mutação sofre rollback, o log some junto — o log e o fato nunca divergem.

Dois testes provam isso, em vez de apenas alegá-lo: criar uma OV com transporte não autorizado deixa zero OV **e zero log**; uma transição de status rejeitada não grava `STATUS_CHANGED`.

---

## Estratégia de persistência

- **Migrations versionadas** (`prisma/migrations/`), aplicadas com `prisma migrate dev` em desenvolvimento e `migrate deploy` nos testes.
- **Uma transação por mutação auditada.** Validação, escrita e log no mesmo `$transaction`.
- **Confirmação de agendamento em isolamento `Serializable`.** A checagem de capacidade do slot conta os agendamentos confirmados e então escreve. Fora de um snapshot consistente, duas confirmações concorrentes leriam `4` e ambas passariam, estourando o teto.
- **Snapshot de preço** no `SalesOrderItem`, no momento da venda.
- **Sem hard delete.** Nenhum endpoint é `DELETE`; a baixa é lógica, via `PATCH { "active": false }`. Não se audita uma linha que foi apagada.

### Regras de disponibilidade (simuladas)

O enunciado permite simplificar. Adotamos `MAX_DELIVERIES_PER_SLOT = 5` agendamentos **confirmados** por `(scheduledDate, window)`. É a regra mais simples que ainda exercita o índice `[scheduledDate, window]` e força o tratamento de concorrência descrito acima.

Reagendar **não** rebaixa um agendamento `CONFIRMADO` para `PENDENTE`. Rebaixar deixaria uma OV `AGENDADA` apoiada em agendamento não confirmado, quebrando o invariante. Remarcar uma entrega já acordada é uma renegociação, não um cancelamento.

---

## Tratamento de erros

`AllExceptionsFilter` global normaliza toda resposta de erro:

```json
{
  "statusCode": 409,
  "error": "InvalidStatusTransition",
  "message": "Transição de CRIADA para AGENDADA não é permitida.",
  "path": "/api/sales-orders/abc/status",
  "timestamp": "2026-07-09T12:00:00.000Z"
}
```

| Situação | HTTP |
|---|---|
| Violação de regra de negócio | **409** |
| Payload inválido ou campo desconhecido | 400 |
| Recurso inexistente | 404 |
| Erro não previsto | 500, mensagem genérica; stack só no log |

**409, não 400, para violação de regra.** O payload é sintaticamente válido; é o *estado do recurso* que proíbe a operação. Um `400` diria ao cliente para corrigir o corpo, o que não ajudaria.

`ValidationPipe` global com `whitelist`, `forbidNonWhitelisted` e `transform`: campo desconhecido no corpo ou na query vira `400`, em vez de ser ignorado em silêncio.

Respostas são classes com `@ApiProperty`, montadas a partir do model. **O model do Prisma nunca é serializado direto** — uma coluna nova no schema não vaza para a resposta sem alguém decidir.

---

## API

Prefixo global `/api`. Contrato completo no Swagger.

### Cadastros

| Verbo | Rota |
|---|---|
| `POST` `GET` | `/customers` |
| `GET` `PATCH` | `/customers/:id` |
| `POST` | `/customers/:id/transport-types` |
| `POST` `GET` | `/transport-types` |
| `PATCH` | `/transport-types/:id` |
| `POST` `GET` | `/items` |
| `GET` | `/items/:id` |

`POST /customers/:id/transport-types` recebe `{ "transportTypeIds": [...] }` e é **aditivo e idempotente**: vincula os IDs informados, ignora os já vinculados, não remove nada. Reenviar o mesmo corpo não muda estado nem retorna erro.

### Ordens de venda

| Verbo | Rota | Regra |
|---|---|---|
| `POST` | `/sales-orders` | transporte autorizado, ≥1 item, status `CRIADA` |
| `GET` | `/sales-orders` | monitoramento operacional (filtros abaixo) |
| `GET` | `/sales-orders/:id` | detalhe |
| `PATCH` | `/sales-orders/:id/status` | máquina de estados + pré-condição |
| `PATCH` | `/sales-orders/:id/transport-type` | autorizado; bloqueado a partir de `EM_TRANSPORTE` |

### Monitoramento operacional

`GET /sales-orders` aceita, todos opcionais e combináveis: `status`, `customerId`, `transportTypeId`, `scheduledFrom`, `scheduledTo`, `window`.

"Data", no enunciado, é ambíguo entre data de criação e data de entrega. Filtramos por **data de entrega agendada**: é a data que o monitoramento logístico observa — quem olha o painel quer saber o que entrega amanhã, não o que foi cadastrado ontem. Filtrar por agendamento implica INNER JOIN, então OVs sem agendamento somem do resultado; isso é correto, elas não têm data de entrega.

### Central de agendamento

| Verbo | Rota |
|---|---|
| `POST` | `/sales-orders/:id/schedule` — define data e janela |
| `PATCH` | `/sales-orders/:id/schedule` — reagenda |
| `POST` | `/sales-orders/:id/schedule/confirm` — confirma |

### Auditoria

| Verbo | Rota |
|---|---|
| `GET` | `/sales-orders/:id/audit` — timeline, mais recente primeiro |

Somente leitura. Não há rota que crie, edite ou apague um `AuditLog`.

### Autoria das ações

Não há autenticação no escopo do desafio. O `actor` é lido do header opcional **`X-Actor`** (default `"system"`), o que mantém a coluna útil sem inventar um sistema de auth. Trocar por um `sub` de JWT é uma mudança de uma linha.

---

## Testes

O enunciado exige no mínimo 2 unitários e 1 de integração. A suíte tem **47 unitários e 35 de integração**, porque a regra central do desafio é uma máquina de estados — e máquina de estados se testa por exaustão.

**Unitários** (sem banco): matriz completa 5×5 da máquina de estados (as 25 combinações: 4 válidas, 21 rejeitadas), pré-condição de `AGENDADA`, regras de agendamento, cálculo de total com `Decimal`, e o filtro global de exceções.

**Integração** (Supertest contra Postgres real): fluxo feliz completo até `ENTREGUE`; transição inválida → 409; `AGENDADA` sem confirmação → 409; OV sem item → 400; transporte não autorizado → 409; agendamento duplicado → 409; sexta confirmação no mesmo slot → 409; reagendamento preserva `CONFIRMADO`; troca de transporte em `EM_TRANSPORTE` → 409; filtros de listagem; timeline de auditoria completa; e os dois testes de rollback transacional.

---

## Considerações sobre escalabilidade

**`AuditLog` é append-only e cresce sem limite.** É o primeiro candidato a particionamento por `createdAt` ou a arquivamento frio. O índice `[salesOrderId, createdAt]` mantém a consulta de timeline barata independentemente do volume total.

**Leituras de monitoramento são o hot path.** `GET /sales-orders` com filtros escala horizontalmente por réplica de leitura — nenhuma dessas consultas precisa do primário.

**O ponto de contenção é a capacidade de slot.** A confirmação de agendamento serializa transações que disputam o mesmo `(data, janela)`. Sob carga real, a alternativa seria um advisory lock por slot, ou uma contagem materializada com `UPDATE ... RETURNING` atômico.

**O estado é todo do banco.** A aplicação é stateless e escala por réplica.

---

## Considerações sobre performance

**Índices:** `SalesOrder.status`, `SalesOrder.customerId`, `SalesOrder.transportTypeId`, `DeliverySchedule.[scheduledDate, window]`, `AuditLog.[salesOrderId, createdAt]`.

**N+1 evitado por construção.** O `include` das relações da OV está declarado uma única vez, no repositório (`WITH_RELATIONS`). `ItemsRepository.findManyByIds` resolve N itens em uma query, em vez de N queries no laço de criação.

**Paginação é a primeira dívida a pagar.** Hoje `GET /sales-orders` devolve tudo. Aceitável no volume do desafio, indefensável em produção.

---

## Escopo e trade-offs

### Fora de escopo, por decisão

Autenticação e autorização (listadas como *diferencial*, não requisito), cancelamento de OV (não há `CANCELADA` no fluxo), mutação de itens após a criação, hard delete, paginação, regras reais de disponibilidade (feriado, lead time), e frontend.

Diferenciais não perseguidos: Event-Driven, cache, métricas, CI/CD. O enunciado afirma que "a consistência técnica da solução será considerada mais relevante do que a quantidade de tecnologias utilizadas". Swagger e uma estratégia de teste ampla são os dois diferenciais que servem a esta solução; o resto seria vitrine.

### Trade-offs assumidos

| # | Decisão | Alternativa rejeitada | Por quê |
|---|---|---|---|
| 1 | `PATCH /status` recebe alvo explícito | `POST /advance` sem corpo | duplo clique avançaria dois estados sem erro |
| 2 | `PATCH /status` é a única porta para `status`; `AGENDADA` exige agendamento confirmado | `confirm` move o status como efeito colateral | efeito colateral escondido é pior que pré-condição explícita |
| 3 | Troca de transporte bloqueada a partir de `EM_TRANSPORTE` | livre até `ENTREGUE` | carga na estrada não troca de transportadora |
| 4 | `actor` vem do header `X-Actor` | `null` sempre; ou implementar auth | mantém a coluna útil sem inventar auth fora de escopo |
| 5 | `POST /customers/:id/transport-types` é aditivo e idempotente | substituir a lista inteira | `POST` adiciona; substituição seria `PUT` |
| 6 | Sem `GET /transport-types/:id`, sem `PATCH /items/:id` | criar por simetria | o enunciado lista Itens como "Criar; Consultar" apenas |
| 7 | "≥1 item" garantido no service dentro de transação | constraint deferida ou trigger | invariante de agregado pertence ao domínio, não ao DDL |
| 8 | Reagendar mantém `CONFIRMADO` | rebaixar para `PENDENTE` | rebaixar quebraria o invariante de `AGENDADA` |
| 9 | Repositório fino, sem interface abstrata | Clean Architecture com ports/adapters | a indireção só se paga com mais de um adapter; aqui haveria um |
| 10 | Filtro "data" = data de entrega agendada | data de criação | é a data que o monitoramento logístico observa |
| 11 | Sem paginação | `?page`/`?limit` desde o início | dívida consciente, documentada |
| 12 | Auditoria explícita no service | middleware / `$extends` do Prisma | middleware não conhece estado anterior, actor, nem intenção |

---

## Documentação complementar

- Especificação de design: `docs/superpowers/specs/2026-07-09-theraconsulting-backend-design.md`
- Plano de implementação: `docs/superpowers/plans/2026-07-09-ovgs-backend.md`
