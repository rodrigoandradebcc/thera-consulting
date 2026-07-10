# OVGS Frontend — Progress Ledger

Plano: `docs/superpowers/plans/2026-07-09-ovgs-frontend.md`
Branch: `feat/ovgs-frontend`
Merge base: `b4b8fc7`

## Pré-flight (resolvido antes do dispatch)

- Subtotal de `SalesOrderItemsTab` usava float. Corrigido no plano: reusa `estimateTotalCents`.
- `CustomersPage` estava em prosa. Código escrito no plano.
- Duplicação da máquina de estados no front: decisão registrada (spec, trade-off #3). Informar revisores.

## Tasks

- [ ] Task 1: CORS + GET /customers/:id/transport-types
- [ ] Task 2: Scaffold apps/web
- [ ] Task 3: Fundações (format, errors, client, status-machine)
- [ ] Task 4: Camada de API + query keys
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

(nenhum ainda)
