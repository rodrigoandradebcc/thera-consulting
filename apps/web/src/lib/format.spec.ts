import { describe, expect, it } from 'vitest';
import { dateBR, money, orderNumber } from './format';

describe('money', () => {
  it('formata string decimal como moeda brasileira', () => {
    //   é o espaço não-quebrável que o Intl insere após "R$".
    expect(money('259.80')).toBe('R$ 259,80');
    expect(money('1259.80')).toBe('R$ 1.259,80');
  });

  it('formata zero', () => {
    expect(money('0.00')).toBe('R$ 0,00');
  });
});

describe('orderNumber', () => {
  it('preenche com zeros à esquerda', () => {
    expect(orderNumber(42)).toBe('OV-000042');
    expect(orderNumber(1)).toBe('OV-000001');
  });

  it('não trunca números grandes', () => {
    expect(orderNumber(1234567)).toBe('OV-1234567');
  });
});

describe('dateBR', () => {
  it('formata data ISO sem deslocar o dia por fuso', () => {
    expect(dateBR('2026-08-01')).toBe('01/08/2026');
  });
});
