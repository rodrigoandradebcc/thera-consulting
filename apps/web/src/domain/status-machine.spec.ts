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
