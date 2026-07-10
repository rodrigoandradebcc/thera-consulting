import { Prisma } from '../../../generated/prisma/client';
import { calculateTotal } from './sales-orders.service';

describe('calculateTotal', () => {
  it('soma quantidade × preço unitário', () => {
    const total = calculateTotal([
      { quantity: 2, unitPrice: new Prisma.Decimal('129.90') },
      { quantity: 3, unitPrice: new Prisma.Decimal('89.50') },
    ]);

    expect(total.toFixed(2)).toBe('528.30');
  });

  it('não introduz erro de ponto flutuante', () => {
    const total = calculateTotal([{ quantity: 3, unitPrice: new Prisma.Decimal('0.10') }]);

    // 0.1 * 3 === 0.30000000000000004 em float. Aqui, não.
    expect(total.toFixed(2)).toBe('0.30');
    expect(total.equals(new Prisma.Decimal('0.3'))).toBe(true);
  });

  it('retorna zero para lista vazia', () => {
    expect(calculateTotal([]).toFixed(2)).toBe('0.00');
  });
});
