# OVGS — Frontend Design

**Data:** 2026-07-09
**Status:** aguardando revisão
**Fonte:** `Desafio Técnico — Sistema de Gestão de Ordens de Venda (OVGS)`, perfil Full Stack.
**Depende de:** `2026-07-09-theraconsulting-backend-design.md` (API implementada e em `main`).

---

## 1. Objetivo

Interface web para o OVGS, cobrindo as sete capacidades que o enunciado exige do perfil Front-end: gestão de Ordens de Venda, monitoramento operacional, central de agendamento, cadastros básicos, integração com APIs, tratamento de estados e validações de entrada.

O enunciado permite APIs mockadas. **Não usamos mocks.** A API real existe, roda e tem 82 testes. Integração real é um diferencial gratuito, e mock esconderia justamente o que o desafio quer avaliar: tratamento de estados de rede, erro e concorrência.

---

## 2. Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Build | Vite + React 19 | painel interno atrás de API não precisa de SSR nem SEO |
| Linguagem | TypeScript strict | idem backend |
| Rotas | React Router v7 (data router) | pedido no enunciado; redundante sob Next |
| Estado servidor | TanStack Query | cache, invalidação, estados de loading/erro sem `useEffect` manual |
| HTTP | Axios | instance única com interceptors |
| Formulários | React Hook Form + Zod | validação declarativa espelhando os DTOs da API |
| UI | Tailwind + shadcn/ui | componentes copiados para o projeto, não importados |
| Ícones | Lucide | SVG, um só conjunto, stroke consistente |
| Testes | Vitest + Testing Library | mesma sintaxe do Jest, roda sob Vite |

Localização: `apps/web`. Consome `apps/api` em `http://localhost:3000/api`.

**Por que Vite, não Next.** O enunciado pede React Router, que o Next torna redundante. Este é um painel interno autenticado-por-header, sem SEO, sem conteúdo público. Adicionar um servidor Node a uma SPA que fala com outra API é complexidade sem contrapartida.

---

## 3. Mudanças exigidas na API

Duas, ambas na Task 1 do plano. Nenhuma outra.

1. **CORS** (abaixo). Sem isso, nada carrega.
2. **`GET /customers/:id/transport-types`** (§6.3). Sem isso, o formulário de criação de OV não sabe quais transportes oferecer.

### 3.1 CORS

`apps/api/src/main.ts` nunca chama `enableCors()`. Qualquer requisição de `localhost:5173` para `localhost:3000` é bloqueada pelo browser.

```ts
app.enableCors({
  origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  allowedHeaders: ['Content-Type', 'X-Actor'],
});
```

`X-Actor` **precisa** estar em `allowedHeaders`: headers customizados não são permitidos por padrão, e sem ele o preflight falha em toda mutação. `WEB_ORIGIN` entra no schema Zod de env (`apps/api/src/common/config/env.ts`) com default.

Isto é a Task 1 do plano. Nada mais funciona antes.

---

## 4. Design system

Gerado com o skill `ui-ux-pro-max` (`--design-system`), com duas divergências deliberadas.

### 4.1 Estilo

**Data-Dense Dashboard.** Tabelas, KPI cards, grid, padding contido, máxima densidade de informação legível. Light e dark, ambos completos.

### 4.2 Cores

| Papel | Hex | Token |
|---|---|---|
| Primary | `#1E40AF` | `--color-primary` |
| On primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#3B82F6` | `--color-secondary` |
| Accent | `#D97706` | `--color-accent` |
| Background | `#F8FAFC` | `--color-background` |
| Foreground | `#1E3A8A` | `--color-foreground` |
| Muted | `#E9EEF6` | `--color-muted` |
| Border | `#DBEAFE` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |

O âmbar `#D97706` já vem ajustado de `#F59E0B` para atingir 3:1. Nenhum hex aparece em componente: só tokens semânticos.

### 4.3 Tipografia — divergência 1

O skill recomendou **Fira Code para títulos**. Rejeitado: monospace em heading de 32px lê como terminal, não como sistema de logística, e prejudica a leitura.

- **Títulos e corpo:** Fira Sans (300/400/500/600/700)
- **Fira Code:** exclusivamente para números tabulares — `orderNumber` (`OV-000042`), valores monetários, datas em coluna, e IDs.

Isso atende a regra `number-tabular` do próprio skill: dígitos de largura variável fazem colunas de dinheiro dançarem a cada re-render. Aplicado via `font-variant-numeric: tabular-nums` nas células numéricas.

Escala: 12 / 14 / 16 / 18 / 24 / 32. Corpo mínimo 16px. `line-height` 1.5.

### 4.4 Pattern recomendado — divergência 2

O skill sugeriu o pattern **"Real-Time / Operations Landing"**: hero, trust signals, "Start trial". É estrutura de *landing page de marketing*. Não construímos landing; construímos painel interno.

Aproveitamos duas ideias dele: **cores de status** (verde/âmbar/vermelho semânticos) e **métrica antes de detalhe** na hierarquia do dashboard. O resto é descartado.

### 4.5 Status da OV — cor nunca sozinha

Cinco estados, cada um com **cor + rótulo textual + ícone Lucide**. A regra `color-not-only` não é preciosismo de acessibilidade: é o que salva um print em preto e branco anexado a um chamado.

| Status | Cor | Ícone |
|---|---|---|
| `CRIADA` | slate | `FileText` |
| `PLANEJADA` | blue | `ClipboardCheck` |
| `AGENDADA` | amber | `CalendarCheck` |
| `EM_TRANSPORTE` | cyan | `Truck` |
| `ENTREGUE` | emerald | `PackageCheck` |

Componente único `<StatusBadge status={...} />`. Um lugar para mudar.

`ScheduleStatus` (`PENDENTE` / `CONFIRMADO`) recebe tratamento análogo, com `Clock` e `CheckCircle2`.

---

## 5. Arquitetura do front

```
apps/web/src/
  main.tsx                 QueryClientProvider, RouterProvider
  routes.tsx               definição das rotas
  lib/
    api/
      client.ts            instance Axios: baseURL, interceptor X-Actor, normalização de erro
      sales-orders.ts      funções tipadas por recurso
      customers.ts  transport-types.ts  items.ts  scheduling.ts  audit.ts
    query-keys.ts          fábrica de chaves do TanStack Query
    format.ts              money(), date(), orderNumber()
    errors.ts              ApiError + type guards
  domain/
    status-machine.ts      NEXT_STATUS espelhado + rótulo da ação
    schedule.ts            regra de "pode reagendar"
  components/
    ui/                    shadcn (button, table, dialog, select, ...)
    StatusBadge.tsx  StatusStepper.tsx  DataTable.tsx  EmptyState.tsx
    ErrorState.tsx  PageHeader.tsx  ActorField.tsx
  features/
    dashboard/  sales-orders/  scheduling/  customers/
    transport-types/  items/  audit/
```

Cada feature contém suas páginas, seus hooks de query/mutation e seus formulários. **Componentes de UI não conhecem Axios**; features não conhecem `fetch`.

`domain/` é código puro, testável sem render.

### 5.1 Cliente HTTP

```ts
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL });

api.interceptors.request.use((config) => {
  config.headers['X-Actor'] = getActor(); // localStorage, default 'web'
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => Promise.reject(toApiError(error)), // {statusCode, error, message}
);
```

`toApiError` normaliza três casos que a UI trata de formas diferentes: resposta de erro da API, timeout/rede sem resposta, e erro inesperado.

### 5.2 Máquina de estados no cliente — decisão

A UI precisa saber que `CRIADA → PLANEJADA` para mostrar o botão certo. Isso **duplica** `NEXT_STATUS` do backend.

Três opções foram consideradas:

1. Duplicar o mapa de cinco linhas no front, com teste que trava os valores.
2. Backend passa a devolver `nextStatus` / `canAdvance` no detalhe da OV.
3. Gerar tipos a partir do OpenAPI do Swagger.

**Decisão: opção 1.** A opção 3 resolve *tipos*, não *regra*. A opção 2 adiciona campo derivado ao contrato para economizar cinco linhas.

O que torna a duplicação segura: **o botão desabilitado é dica visual, não autoridade.** A autoridade continua sendo o `409` do servidor, que o backend já cobre com a matriz 5×5 e testes e2e. Se front e back divergirem, o servidor ganha e o usuário vê o erro. Um teste unitário no front assegura que o mapa cobre os cinco estados e que `ENTREGUE` é terminal.

---

## 6. Telas

### 6.1 Dashboard — `/`

Cards de contagem por status, seguidos da tabela de entregas agendadas para os próximos sete dias.

```
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│ CRIADA  │PLANEJADA│AGENDADA │EM TRANSP│ENTREGUE │
│    2    │    1    │    1    │    1    │    1    │
└─────────┴─────────┴─────────┴─────────┴─────────┘

Entregas agendadas — próximos 7 dias
OV        Cliente    Data     Janela    Agendamento
OV-000007 ACME       08/01    MANHÃ     CONFIRMADO
OV-000009 Gama       09/01    TARDE     PENDENTE
```

**A API não tem endpoint de agregação.** Os contadores saem de um único `GET /sales-orders`, contados no cliente. Isso é honesto enquanto não houver paginação — e a ausência de paginação já está registrada como dívida no README do backend. Quando a paginação entrar, este dashboard precisa de `GET /sales-orders/stats`. Registrado como dívida, não escondido.

As entregas dos próximos sete dias vêm de `GET /sales-orders?scheduledFrom=hoje&scheduledTo=hoje+7`, que o backend já suporta.

Cada card é um link para `/sales-orders?status=X`.

### 6.2 Lista de OVs — `/sales-orders`

Tabela com filtros de monitoramento operacional: `status`, `customerId`, `transportTypeId`, `scheduledFrom`, `scheduledTo`, `window`.

**Filtros vivem na URL**, não em `useState`. Um filtro aplicado precisa sobreviver a um refresh e ser compartilhável por link — regra `deep-linking`. `useSearchParams` é a fonte de verdade; a query key do TanStack deriva dela.

Colunas: número (tabular), cliente, transporte, status (badge), total (tabular, alinhado à direita), data de entrega, ação. Linha inteira clicável para o detalhe.

Estados: loading (skeleton, não spinner), vazio (`EmptyState` com CTA "Criar OV"), erro (`ErrorState` com retry).

### 6.3 Criar OV — `/sales-orders/new`

Formulário RHF + Zod. Campos: cliente (select), tipo de transporte (select), itens (linhas dinâmicas de item + quantidade).

**O select de transporte só oferece os transportes autorizados para o cliente escolhido.** Sem cliente selecionado, fica desabilitado com helper text explicando por quê. Isso torna o `409 TransportTypeNotAllowed` quase inalcançável pela UI — que é o objetivo. A API continua sendo a autoridade.

**Isto exige uma adição à API.** Hoje não há como *ler* os transportes autorizados de um cliente: `POST /customers/:id/transport-types` retorna a lista, mas mutar para ler é absurdo, e `CustomerResponse` não a expõe.

**Decisão: adicionar `GET /customers/:id/transport-types`**, simétrico ao `POST` existente, devolvendo `{ transportTypeIds: string[] }`. O `CustomersService.listTransportTypeIds` já existe — falta só a rota e um teste e2e.

A alternativa seria embutir `transportTypeIds` no `GET /customers/:id`. Rejeitada: infla o payload da listagem de clientes com dados que só uma tela usa, e a relação N:N tem vida própria.

Esta é a **única** mudança que o front impõe à API, e ela entra na Task 1 do plano, junto do CORS.

Total calculado e exibido em tempo real como *preview*, com aviso de que o servidor recalcula. **O front nunca envia `total`.**

Validações: ao menos um item (`ArrayNotEmpty` espelhado), quantidade ≥ 1, sem item repetido.

### 6.4 Detalhe da OV — `/sales-orders/:id`

Cabeçalho: número, cliente, transporte, total, `StatusBadge`.

**`StatusStepper`**: os cinco estados em linha, o atual destacado, os anteriores marcados. Torna o fluxo linear visível de relance.

**Botão único da próxima ação.** A UI mostra apenas a transição válida: "Planejar OV", "Agendar OV", "Despachar", "Marcar como entregue". Não existe select com os cinco estados — ele convidaria ao erro de propósito.

Quando o próximo passo é `AGENDADA` e não há agendamento confirmado, o botão fica **desabilitado com explicação visível**: "Confirme o agendamento antes de agendar a OV." Desabilitar sem dizer por quê é hostil.

Três abas:

- **Itens** — tabela somente leitura. Itens são imutáveis após a criação; a UI não oferece editar, e não finge que oferece.
- **Agendamento** — cria, reagenda, confirma. Some quando a OV está `EM_TRANSPORTE` ou `ENTREGUE`.
- **Auditoria** — timeline de `GET /sales-orders/:id/audit`.

**A auditoria é uma aba, não uma rota.** O enunciado lista "Auditoria da Ordem" entre as telas, mas o dado pertence ao agregado da OV. Uma rota própria levaria o usuário a uma timeline sem o contexto do que está sendo auditado.

Cada evento da timeline mostra data/hora, ação, entidade, ator, e o diff `before` → `after` renderizado como pares de campo. `ORDER_CREATED` mostra só o `after`, porque `before` é `null` — e a UI diz "Ordem criada", não "de nada para ...".

### 6.5 Central de Agendamento — `/scheduling`

**Não é um CRUD novo; é uma visão.** Lista as OVs com agendamento, filtradas por intervalo de data e janela, agrupadas por dia.

Para cada linha: confirmar (se `PENDENTE`) ou reagendar. As duas ações usam os endpoints existentes.

Mostra a ocupação do slot: `3/5 confirmados` para cada `(data, janela)`. **Calculado no cliente**, a partir das OVs retornadas — a API não expõe a contagem. Quando o slot está cheio, o botão de confirmar fica desabilitado com a explicação, antecipando o `409 SlotUnavailable`.

### 6.6 Cadastros — `/customers`, `/transport-types`, `/items`

Tabela + dialog de criação/edição. Nada de `DELETE`: a API não tem, e a UI oferece o toggle `active` — com confirmação, porque é ação de baixa.

`/customers/:id` tem a seção de **transportes autorizados**: multi-select que chama `POST /customers/:id/transport-types`. A semântica é aditiva; a UI diz "Adicionar transportes", não "Salvar lista", porque nada é removido.

`/items`: apenas criar e listar. Sem editar — o enunciado lista Itens como "Criar; Consultar", e a API não expõe `PATCH`. `unitPrice` é entrada de texto com máscara, enviada como string.

---

## 7. Dados, erros e estados

### 7.1 Dinheiro

A API devolve `Decimal` serializado como **string** (`"259.80"`). O front:

- **exibe** com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`;
- **envia** como string;
- **nunca** faz aritmética com `parseFloat`.

O total é calculado pelo servidor. O preview no formulário de criação usa aritmética inteira em centavos, e é rotulado como estimativa.

### 7.2 Mapeamento de erro

O backend normaliza toda resposta de erro como `{ statusCode, error, message, path, timestamp }`. O front trata cada classe de forma distinta:

| Status | Significado | Tratamento na UI |
|---|---|---|
| `400` | payload inválido | `setError` do RHF no campo culpado; foco no primeiro inválido |
| `404` | recurso inexistente | `EmptyState` na página, não toast |
| `409` | regra de negócio | toast **e** mensagem inline junto da ação bloqueada |
| `500` | erro do servidor | `ErrorState` com retry; mensagem genérica |
| rede | sem resposta | `ErrorState` "sem conexão" com retry |

`409` não é toast e pronto. O toast some; o usuário precisa entender por que aquele botão não funcionou. A mensagem da API (`"Transição de CRIADA para AGENDADA não é permitida."`) é exibida literalmente — ela já está em português e é específica.

### 7.3 Estados de carregamento

- **Skeleton**, não spinner, para conteúdo com layout previsível (tabelas, cards). Regra `progressive-loading`.
- Botões de mutação **desabilitam e mostram spinner** enquanto pendentes. Regra `loading-buttons`.
- Espaço reservado para conteúdo assíncrono, para não causar layout shift (`content-jumping`).

### 7.4 Invalidação de cache

Toda mutação invalida as queries afetadas. Mudar o status de uma OV invalida: o detalhe dela, a lista, e o dashboard. A auditoria também — porque a mutação gerou um log novo.

Chaves centralizadas em `lib/query-keys.ts`. Invalidação espalhada por string literal é como o cache de um app apodrece.

### 7.5 `X-Actor`

Campo "Você é:" no header do app, persistido em `localStorage`, default `"web"`. O interceptor do Axios injeta em toda requisição.

Isso torna a auditoria **demonstrável**: mude o nome, execute uma ação, veja o log mudar de ator. É o mais próximo de autenticação que o escopo permite, sem fingir que é autenticação.

---

## 8. Acessibilidade e responsividade

Alvos, verificados antes de entregar:

- Contraste ≥ 4.5:1 para texto normal, ≥ 3:1 para elementos gráficos.
- Foco visível em todo elemento interativo. Nunca `outline: none` sem substituto.
- Ordem de tabulação segue a ordem visual.
- Botão só com ícone recebe `aria-label`.
- Cor nunca é o único portador de informação (§4.5).
- Erros de formulário em `role="alert"`, próximos ao campo.
- `prefers-reduced-motion` respeitado; transições de 150–300ms.
- Sem scroll horizontal em 375px. Tabelas viram cards empilhados abaixo de 768px.
- Breakpoints: 375 / 768 / 1024 / 1440.
- Dark mode desenhado junto, não invertido. Contraste testado nos dois temas.

Tabela larga em tela estreita é o problema clássico deste tipo de painel. **Decisão:** abaixo de 768px, cada linha vira um card com rótulo por campo. Scroll horizontal em tabela é a saída preguiçosa e quebra a regra `horizontal-scroll`.

---

## 9. Testes

O enunciado não fixa mínimo para o front. O que merece teste aqui é o que quebra em silêncio:

**Unitários (Vitest):**
- `domain/status-machine.ts`: cobre os cinco estados, `ENTREGUE` terminal, e que o mapa do front bate com o do backend.
- `lib/format.ts`: moeda pt-BR, data, `orderNumber` com zero à esquerda.
- `lib/errors.ts`: `toApiError` para resposta da API, erro de rede, e erro desconhecido.

**Componente (Testing Library):**
- `StatusStepper`: destaca o estado atual, marca os anteriores.
- Botão de próxima ação: desabilitado quando `AGENDADA` sem agendamento confirmado, com a explicação visível.
- `StatusBadge`: renderiza rótulo textual, não só cor.

**Integração (Testing Library + MSW):**
- Criar OV: transporte desabilitado sem cliente; total de preview correto; submit envia sem `total`.
- Lista: filtro de status escreve na URL e refaz a query.
- Erro `409` na transição: mostra a mensagem da API inline.

MSW aqui, não no app: mock é ferramenta de teste, não de desenvolvimento.

---

## 10. Fora de escopo

- Autenticação real. Só `X-Actor`.
- Paginação (a API não tem).
- Endpoint de agregação para o dashboard (dívida registrada).
- Cancelamento de OV, edição de itens, hard delete — a API não os expõe.
- Internacionalização. Interface em português, como o domínio.
- PWA, offline, notificações.

---

## 11. Trade-offs

| # | Decisão | Alternativa rejeitada | Por quê |
|---|---|---|---|
| 1 | Vite + React Router | Next.js | painel interno sem SEO/SSR; React Router é redundante no Next |
| 2 | API real, sem mocks | mocks (permitidos pelo enunciado) | mock esconderia o tratamento de estado de rede e erro, que é o que se avalia |
| 3 | Máquina de estados duplicada no front | campo `nextStatus` na API | botão é dica; o `409` do servidor é a autoridade |
| 4 | Auditoria como aba do detalhe | rota própria (pedida no enunciado) | timeline sem o contexto da OV não informa |
| 5 | Contadores do dashboard no cliente | endpoint de agregação | sem paginação, é uma request só; com paginação, vira dívida explícita |
| 6 | Botão único da próxima ação | select com os cinco status | select convida ao erro de propósito |
| 7 | Fira Sans nos títulos | Fira Code, como o skill sugeriu | monospace em heading lê como terminal e prejudica a leitura |
| 8 | Filtros na URL | `useState` | filtro precisa sobreviver a refresh e ser compartilhável |
| 9 | Cards empilhados em mobile | scroll horizontal na tabela | scroll horizontal é a saída preguiçosa |
| 10 | Ocupação do slot calculada no cliente | endpoint de capacidade | antecipa o `409` sem mudar o contrato |
| 11 | `GET /customers/:id/transport-types` novo | embutir `transportTypeIds` no `GET /customers/:id` | não inflar o payload de cliente com dado que só uma tela usa |

---

## 12. Ordem de implementação

Segue o fluxo recomendado no enunciado, com a Task 1 imposta pelo CORS:

1. CORS na API + scaffold do `apps/web` + cliente HTTP + layout e rotas.
2. Lista de OVs com filtros na URL.
3. Criar OV.
4. Detalhe da OV.
5. Troca de status (stepper + botão único).
6. Central de agendamento (criar, reagendar, confirmar).
7. Cadastros básicos.
8. Auditoria na aba do detalhe.
9. Dashboard (depende dos formatadores e do `StatusBadge` já prontos).
10. Passe de acessibilidade e responsividade; README do front.

O dashboard vem tarde de propósito: ele é composto de peças que as telas anteriores já constroem. Fazê-lo primeiro significaria construir `StatusBadge`, formatadores e tabela duas vezes.
