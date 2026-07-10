import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/msw-server';
import type { AuditLog } from '@/lib/api/audit';
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

/**
 * Estreita `element` para não-nulo sem `!` nem `as`: lança um erro descritivo
 * se a estrutura de DOM esperada não estiver presente, o que também deixa a
 * falha do teste legível em vez de um `TypeError: Cannot read properties of null`.
 */
function requireElement<T extends Element>(element: T | null, message: string): T {
  if (element === null) throw new Error(message);
  return element;
}

describe('AuditTimeline', () => {
  it('mostra a criação sem tentar renderizar um before nulo', async () => {
    const after = { status: 'CRIADA' };
    server.use(
      http.get(`${BASE}/sales-orders/${ID}/audit`, () =>
        HttpResponse.json([
          {
            id: 'a1',
            action: 'ORDER_CREATED',
            entity: 'SALES_ORDER',
            entityId: ID,
            before: null,
            after,
            actor: 'rodrigo',
            createdAt: '2026-07-09T12:00:00.000Z',
          },
        ]),
      ),
    );
    renderTimeline();

    expect(await screen.findByText('Ordem de venda criada')).toBeInTheDocument();
    expect(screen.getByText('rodrigo')).toBeInTheDocument();

    // ORDER_CREATED não tem "antes": não deve haver placeholder de campo
    // ausente ("—") nem pares antes/depois — só uma linha por campo de
    // `after`. A asserção antiga (`/de\s+—\s+para/i` ausente) nunca falharia:
    // o componente nunca escreve as palavras "de"/"para", o antes/depois é
    // um ícone `aria-hidden`. Isto prova o defeito real que importa.
    const [item] = screen.getAllByRole('listitem');
    expect(within(item).queryByText('—')).not.toBeInTheDocument();
    const dl = requireElement(item.querySelector('dl'), 'esperava um <dl> de diff no log');
    expect(dl.querySelectorAll('dt')).toHaveLength(Object.keys(after).length);
    expect(within(item).getByText('CRIADA')).toBeInTheDocument();
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

  it('preserva a ordem createdAt desc devolvida pela API, sem reordenar no cliente', async () => {
    const logs: AuditLog[] = [
      {
        id: 'o1',
        action: 'SCHEDULE_CHANGED',
        entity: 'DELIVERY_SCHEDULE',
        entityId: ID,
        before: { window: 'MANHA' },
        after: { window: 'TARDE' },
        actor: 'rodrigo',
        createdAt: '2026-07-09T12:10:00.000Z',
      },
      {
        id: 'o2',
        action: 'STATUS_CHANGED',
        entity: 'SALES_ORDER',
        entityId: ID,
        before: { status: 'CRIADA' },
        after: { status: 'PLANEJADA' },
        actor: null,
        createdAt: '2026-07-09T12:05:00.000Z',
      },
      {
        id: 'o3',
        action: 'ORDER_CREATED',
        entity: 'SALES_ORDER',
        entityId: ID,
        before: null,
        after: { status: 'CRIADA' },
        actor: 'rodrigo',
        createdAt: '2026-07-09T12:00:00.000Z',
      },
    ];
    server.use(http.get(`${BASE}/sales-orders/${ID}/audit`, () => HttpResponse.json(logs)));
    renderTimeline();

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(3);
    const renderedOrder = items.map((item) => {
      const time = requireElement(item.querySelector('time'), 'esperava <time> no log');
      return time.getAttribute('datetime');
    });
    expect(renderedOrder).toEqual(logs.map((log) => log.createdAt));
  });

  it('renderiza campos presentes em só um lado do diff, rótulo não mapeado e entidade de agendamento', async () => {
    const before: Record<string, unknown> = {
      scheduledDate: '2026-07-01',
      window: 'MANHA',
      observacao: 'Cliente ausente',
    };
    // "status" só existe em `after`: prova a união de chaves. "observacao"
    // não está em FIELD_LABEL: prova o fallback de `labelFor`.
    const after: Record<string, unknown> = {
      scheduledDate: '2026-07-10',
      window: 'TARDE',
      status: 'REAGENDADA',
      observacao: 'Cliente avisado',
    };
    const log: AuditLog = {
      id: 's1',
      action: 'SCHEDULE_CHANGED',
      entity: 'DELIVERY_SCHEDULE',
      entityId: ID,
      before,
      after,
      actor: 'rodrigo',
      createdAt: '2026-07-09T12:00:00.000Z',
    };
    server.use(http.get(`${BASE}/sales-orders/${ID}/audit`, () => HttpResponse.json([log])));
    renderTimeline();

    expect(await screen.findByText('Agendamento alterado')).toBeInTheDocument();
    const item = requireElement(
      screen.getByText('Agendamento alterado').closest('li'),
      'esperava o <li> do log',
    );
    const scope = within(item);

    // Minor: entity: 'DELIVERY_SCHEDULE' deve ler "Agendamento", não "Ordem de venda".
    const paragraphs = item.querySelectorAll('p');
    const entityParagraph = requireElement(paragraphs.item(1), 'esperava o parágrafo de entidade');
    expect(entityParagraph).toHaveTextContent(/^Agendamento\s*•/);
    expect(entityParagraph.textContent).not.toContain('Ordem de venda');

    const dl = requireElement(item.querySelector('dl'), 'esperava um <dl> de diff no log');
    const labels = [...dl.querySelectorAll('dt')].map((dt) => dt.textContent);
    // Ordem = união das chaves de before seguidas pelas exclusivas de after.
    expect(labels).toEqual(['Data de entrega:', 'Janela:', 'observacao:', 'Status:']);

    expect(scope.getByText('01/07/2026')).toBeInTheDocument();
    expect(scope.getByText('10/07/2026')).toBeInTheDocument();
    expect(scope.getByText('Manhã (08:00–12:00)')).toBeInTheDocument();
    expect(scope.getByText('Tarde (13:00–18:00)')).toBeInTheDocument();
    expect(scope.getByText('Cliente ausente')).toBeInTheDocument();
    expect(scope.getByText('Cliente avisado')).toBeInTheDocument();

    // "status" só existe em `after`: o lado `before` deve cair no placeholder "—".
    const rows = [...dl.querySelectorAll(':scope > div')];
    const statusRow = requireElement(
      rows.find((row) => row.querySelector('dt')?.textContent === 'Status:') ?? null,
      'esperava a linha de "Status" no diff',
    );
    expect(statusRow.textContent).toContain('—');
    expect(statusRow.textContent).toContain('REAGENDADA');
  });

  it('mostra o skeleton de carregamento enquanto a auditoria não chega', async () => {
    server.use(
      http.get(`${BASE}/sales-orders/${ID}/audit`, async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
    );
    renderTimeline();

    const loadingText = screen.getByText('Carregando');
    expect(loadingText.closest('[aria-busy="true"]')).not.toBeNull();
  });

  it('mostra estado de erro com retry, e renderiza a timeline após o retry ter sucesso', async () => {
    server.use(
      http.get(`${BASE}/sales-orders/${ID}/audit`, () =>
        HttpResponse.json(
          { statusCode: 500, error: 'InternalServerError', message: 'Erro interno do servidor.' },
          { status: 500 },
        ),
      ),
    );
    renderTimeline();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Erro interno do servidor.');
    const retryButton = within(alert).getByRole('button', { name: 'Tentar novamente' });

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
    const user = userEvent.setup();
    await user.click(retryButton);

    expect(await screen.findByText('Ordem de venda criada')).toBeInTheDocument();
  });
});
