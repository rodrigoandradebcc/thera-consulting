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
- [ ] Task 5: Layout, rotas, componentes de estado
- [ ] Task 6: Lista de OVs com filtros na URL
- [ ] Task 7: Criar OV
- [ ] Task 8: Detalhe + stepper + transição de status
- [ ] Task 9: Agendamento
- [ ] Task 10: Auditoria
- [ ] Task 11: Cadastros
- [ ] Task 12: Dashboard
- [ ] Task 13: A11y, responsividade, README

## Findings Minor (para o review final triar)

- Task 2: `apps/web/tsconfig.node.json` não tem `"strict": true`, ao contrário de `tsconfig.app.json`. Hoje só cobre `vite.config.ts`. Se crescer (setup do MSW, plugins), type-check fica mais frouxo que o resto.
- Task 3: `isApiErrorBody` (`lib/errors.ts`) só checa `'statusCode' in data`. Um corpo `{statusCode: 500}` sem `error`/`message` satisfaz o type guard e produz `undefined` tipado como `string`. Contrato da API sempre manda os três, mas o guard mente.
- Task 3: commit `bf0eda6` usou `feat:` sem o escopo `(web)` que as outras tasks usam.
