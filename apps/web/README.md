# OVGS — Frontend (`@ovgs/web`)

SPA em React para o monitoramento operacional de Ordens de Venda: listagem com filtros, criação de OV, detalhe com stepper de status, central de agendamento e auditoria.

---

## Executando

Pré-requisitos: **Node >= 20.19**, **pnpm**. A API precisa estar no ar em `http://localhost:3000/api` (ver `README.md` da raiz).

Na raiz do repositório:

```bash
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev          # API em :3000, front em :5173
```

Só o front, a partir da raiz ou de `apps/web`:

```bash
pnpm --filter @ovgs/web dev
```

A URL da API vem de `VITE_API_URL` (ver `apps/web/.env`, já configurado para `http://localhost:3000/api`). Sem a API no ar, toda tela cai no `ErrorState` de erro de rede — não em tela branca.

### Scripts

| Script | O que faz |
|---|---|
| `pnpm --filter @ovgs/web dev` | servidor de desenvolvimento (Vite), porta 5173 |
| `pnpm --filter @ovgs/web build` | `tsc -b` + build de produção |
| `pnpm --filter @ovgs/web test` | Vitest + Testing Library |
| `pnpm --filter @ovgs/web lint` | oxlint |

---

## Arquitetura de pastas

```
apps/web/src/
  lib/
    api/          cliente Axios + uma função por recurso (sales-orders, customers, ...)
    format.ts      money(), dateBR(), dateTimeBR() — únicos pontos que tocam Intl
    query-keys.ts  chaves do TanStack Query, centralizadas
  domain/
    status-machine.ts   espelho do backend (ver "Máquina de estados" abaixo)
    schedule.ts          regras de agendamento usadas só no cliente (validação de formulário)
  components/
    ui/            primitivas Radix/shadcn (Button, Table, Tabs, ...)
    StatusBadge, ErrorState, EmptyState, PageHeader, TableSkeleton, ...
  features/
    sales-orders/   listagem, criação, detalhe
    scheduling/     central de agendamento
    audit/          timeline de auditoria (consumida como aba, não como rota)
    customers/ items/ transport-types/   cadastros
    dashboard/      monitoramento operacional
```

A regra de dependência é **`api` → `domain`, nunca o contrário**: `lib/api/sales-orders.ts` importa `SalesOrderStatus` de `domain/status-machine.ts`, mas o domínio não sabe que HTTP existe. Cada `features/<recurso>` tem seu próprio `queries.ts` com os hooks do TanStack Query — a página nunca chama `fetch`/`axios` diretamente.

---

## Decisões

**A máquina de estados é duplicada, de propósito.** `domain/status-machine.ts` espelha `apps/api/src/modules/sales-orders/domain/status-machine.ts`: mesma lista de status, mesmo `NEXT_STATUS`. A duplicação existe só para desenhar a UI (desabilitar o botão errado, mostrar o próximo passo no stepper) sem esperar uma resposta de rede. **O servidor é a única autoridade**: se os dois mapas divergirem, o `PATCH /status` responde `409` e o usuário vê a mensagem de erro — nada trava silenciosamente no cliente. O botão é uma dica de UX, não uma trava de segurança.

**A auditoria é uma aba do detalhe da OV, não uma rota própria.** `AuditTimeline` vive dentro de `SalesOrderDetailPage`, ao lado das abas "Itens" e "Agendamento". A auditoria de uma OV só faz sentido no contexto dela — não existe, no enunciado, um caso de uso de "ver toda a auditoria do sistema" — e uma rota `/sales-orders/:id/audit` separada obrigaria a recarregar o cabeçalho da OV (status, cliente, transporte) que a aba já herda do componente pai.

**Os contadores do dashboard são calculados no cliente.** `DashboardPage` busca `GET /sales-orders` sem filtro e agrupa por status e por janela de entrega em memória (`StatusCounts`, `toScheduledOrders`). A API não expõe um endpoint de agregação — isso é uma dívida, não uma escolha definitiva (ver abaixo).

**Filtros vivem na URL.** `useSalesOrderFilters` lê e escreve em `useSearchParams`, nunca em `useState`. Um filtro em estado local não sobrevive a um refresh nem pode ser compartilhado por link; a URL é a fonte de verdade, o mesmo papel que ela já cumpre para os query params no backend.

**Tabelas viram cards abaixo de 768px.** `SalesOrdersListPage` e o painel de entregas do `DashboardPage` renderizam a mesma lista duas vezes: uma `<Table>` visível em `md:` para cima (`hidden md:block`), e uma `<ul>` de cards visível só abaixo disso (`md:hidden`). Scroll horizontal em tabela foi descartado por quebrar a regra de responsividade do projeto — é a saída preguiçosa. Card e linha de tabela navegam da mesma forma: onde a linha inteira é clicável (lista de OVs), o card inteiro é um `<Link>`; onde só o número da OV é link (painel de entregas do dashboard), só o número do card é.

---

## Dívidas conhecidas

- **Sem paginação.** `GET /sales-orders` devolve tudo, e o front busca a lista inteira sempre que precisa contar por status. Aceitável no volume atual, indefensável em produção — o mesmo ponto já registrado no README da API.
- **Agregação do dashboard no cliente.** Quando a paginação entrar na API, contar por status/janela em memória deixa de fazer sentido (a página deixa de ter todos os registros de uma vez). A correção é expor um `GET /sales-orders/stats` (ou parâmetro de agregação) no backend e trocar `StatusCounts`/`toScheduledOrders` por uma leitura direta desse endpoint.
