# OVGS Frontend — Progress Ledger

Plano: `docs/superpowers/plans/2026-07-09-ovgs-frontend.md`
Branch: `feat/ovgs-frontend`
Merge base: `b4b8fc7`

## Pré-flight (resolvido antes do dispatch)

- Subtotal de `SalesOrderItemsTab` usava float. Corrigido no plano: reusa `estimateTotalCents`.
- `CustomersPage` estava em prosa. Código escrito no plano.
- Duplicação da máquina de estados no front: decisão registrada (spec, trade-off #3). Informar revisores.

## Tasks

- [x] Task 1: complete (commits 5304797..34578ce, review clean). Fix aplicado: ConfigService no lugar de process.env, após achado Important do revisor. API: 47 unit + 37 e2e.
- [x] Task 2: complete (commit 2df32b2, review clean). 5 desvios adjudicados como justificados: vitest/config, baseUrl removido (TS 6.0.3 deprecia), paths no tsconfig raiz (shadcn CLI), strict explícito, scripts de teste.
- [x] Task 3: complete (commits bf0eda6..e1897d6, review clean). 20 testes. Fix: cobertura do interceptor X-Actor + TZ fixado em America/Sao_Paulo (provado: sem `timeZone: 'UTC'`, dateBR volta 31/07). Desvio: `erasableSyntaxOnly` proíbe parameter properties; ApiError reescrito com campos explícitos.
- [x] Task 4: complete (commit eac99f2, review clean). 7 arquivos, tsc limpo, 20 testes intactos. Sem type assertions.
- [x] Task 5: complete (commit d5afc1c, review clean). 22 testes. RouterProvider verificado em Chrome real. Desvios justificados: oxlint (não eslint) é o linter do pacote; App.css nunca existiu.
- [x] Task 6: complete (commits 4e526a0..c33e494, review clean). 29 testes. Dois fixes: (a) hooks de mutação de sales-orders tinham sido descartados por erro de instrução minha; (b) testes de filtro não observavam a URL — agora leem `router.state.location.search`, provado com experimento de no-op.
- [x] Task 7: complete (commits d54d89d..0496760, review clean). 41 testes. Fix de 4 achados: erros por linha de item agora renderizam; transportTypeId reseta ao trocar cliente; gate de loading revertido (a corrida era do teste); estimateTotalCents trunca >2 decimais.
- [x] Task 8: complete (commit aec1b1c, review clean, zero achados). 49 testes. `as NonNullable` do plano substituído por re-narrowing real (`const nextStatus = next` antes da closure).
- [x] Task 9: complete (commits 913db9b..a054d29, review clean). 58 testes. Bug real corrigido: `today()` usava UTC e rejeitava agendar pra hoje entre 21h e 23h59 BRT. Teste de slot agora varia a janela. `isCountFull` centraliza o limite. 3 type assertions do plano eliminadas.
- [x] Task 10: complete (commits cc96a1f..4224634, review clean). 65 testes. Componente estava certo; os testes do plano é que não provavam nada — assertiva vazia (`de — para` nunca é renderizado), não-reordenação e união de chaves sem cobertura. Corrigido com 3 experimentos de regressão.
- [x] Task 11: complete (commits 9de1870..5b12b1c, review clean). 78 testes. Bug real: `CustomerTransportTypes` mostrava "nenhum transporte autorizado" durante loading e permanentemente em erro 500 — usuário não distinguia "não tem" de "quebrou". +11 testes cobrindo idempotência do vínculo, dialog de baixa, imutabilidade do `code`, omissão de email vazio.
- [x] Task 12: complete (commits 117dd73..97c19a3, review clean). 82 testes. Plano tinha 3 armadilhas: `schedule!`, `isoDate` em UTC (mesmo bug de fuso da task 9), e `countByStatus as Record`. Todas corrigidas. Teste de zero-count adicionado com regressão provada.
- [x] Task 13: complete (commit 763c4e4). 82 testes. Tabelas viram cards em mobile (lista de OVs + dashboard). READMEs do front e da raiz. Verificação estática de a11y (aria-hidden, role=alert, skip-link, reduced-motion, zero emoji/parseFloat/assertion) passou. PENDENTE MANUAL: audit em navegador vivo (teclado, reduced-motion visual, Lighthouse) — extensão do Chrome não conectada, não executado.

## Review final de branch — resolvido

- Verdict: ready to merge, zero defeitos de correção nas costuras.
- Fixes aplicados (commit 492d8cf): `todayLocalIso` extraído (dedup do helper de fuso), 404→EmptyState no detalhe, guard `isApiErrorBody` endurecido.
- Dark mode implementado (commit 6362465): spec prometia, código não tinha. Sistema de tokens semânticos `:root`/`.dark`, provider + toggle, varredura da paleta. 98 testes.
- Débitos aceitos (não bloqueiam merge): `tsconfig.node.json` sem strict; `main.tsx` `getElementById('root')!` do scaffold; `toScheduledOrders` duplicado; `isValidation` exportado mas não usado.

## Findings Minor (histórico)

- Task 2: `apps/web/tsconfig.node.json` não tem `"strict": true`, ao contrário de `tsconfig.app.json`. Hoje só cobre `vite.config.ts`. Se crescer (setup do MSW, plugins), type-check fica mais frouxo que o resto.
- Task 3: `isApiErrorBody` (`lib/errors.ts`) só checa `'statusCode' in data`. Um corpo `{statusCode: 500}` sem `error`/`message` satisfaz o type guard e produz `undefined` tipado como `string`. Contrato da API sempre manda os três, mas o guard mente.
- Task 3: commit `bf0eda6` usou `feat:` sem o escopo `(web)` que as outras tasks usam.
- Task 5 (defeito do plano, não do implementador): os tokens `--color-status-*` declarados em `index.css` estão mortos. `StatusBadge` usa classes Tailwind cruas (`bg-amber-100`). Mudar o token não muda o badge. Ou usar os tokens, ou apagá-los.
- Task 5: `main.tsx` usa `document.getElementById('root')!`. Vem do scaffold do Vite, não é regressão, mas atrita com a constraint "sem type assertions".
- Task 12: `ScheduledOrder`/`toScheduledOrders` duplicado byte-a-byte entre `DashboardPage.tsx` e `SchedulingPage.tsx`. Extrair para `src/domain/scheduled-orders.ts` removeria a duplicação e manteria as duas telas em sincronia.
