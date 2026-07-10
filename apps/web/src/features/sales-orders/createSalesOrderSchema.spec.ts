import { describe, expect, it } from 'vitest';
import { createSalesOrderSchema, estimateTotalCents } from './createSalesOrderSchema';

const uuid = '11111111-1111-4111-8111-111111111111';
const outro = '22222222-2222-4222-8222-222222222222';

describe('createSalesOrderSchema', () => {
  it('exige ao menos um item', () => {
    const result = createSalesOrderSchema.safeParse({
      customerId: uuid,
      transportTypeId: outro,
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejeita quantidade menor que 1', () => {
    const result = createSalesOrderSchema.safeParse({
      customerId: uuid,
      transportTypeId: outro,
      items: [{ itemId: uuid, quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejeita item repetido', () => {
    const result = createSalesOrderSchema.safeParse({
      customerId: uuid,
      transportTypeId: outro,
      items: [
        { itemId: uuid, quantity: 1 },
        { itemId: uuid, quantity: 2 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('aceita OV válida', () => {
    const result = createSalesOrderSchema.safeParse({
      customerId: uuid,
      transportTypeId: outro,
      items: [{ itemId: uuid, quantity: 2 }],
    });
    expect(result.success).toBe(true);
  });
});

describe('estimateTotalCents', () => {
  it('soma em centavos, sem ponto flutuante', () => {
    const cents = estimateTotalCents([
      { quantity: 3, unitPrice: '0.10' },
      { quantity: 2, unitPrice: '129.90' },
    ]);
    // 30 + 25980 = 26010 centavos. Em float, 0.1*3 daria 0.30000000000000004.
    expect(cents).toBe(26_010);
  });

  it('retorna zero sem linhas', () => {
    expect(estimateTotalCents([])).toBe(0);
  });

  it('lida com valor sem ponto decimal', () => {
    expect(estimateTotalCents([{ quantity: 1, unitPrice: '130' }])).toBe(13_000);
  });

  it('trunca casas decimais além da segunda em vez de corromper o total', () => {
    // A API só emite duas casas decimais, mas se um valor malformado com mais
    // casas aparecesse, truncamos os dígitos extras em vez de somá-los como
    // centavos adicionais (comportamento documentado escolhido em estimateTotalCents).
    expect(estimateTotalCents([{ quantity: 1, unitPrice: '129.999' }])).toBe(12_999);
  });
});
