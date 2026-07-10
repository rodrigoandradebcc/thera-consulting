import { z } from 'zod';

export const createSalesOrderSchema = z.object({
  customerId: z.string().uuid('Selecione um cliente.'),
  transportTypeId: z.string().uuid('Selecione um tipo de transporte.'),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid('Selecione um item.'),
        quantity: z.coerce.number().int().min(1, 'Quantidade mínima é 1.'),
      }),
    )
    .min(1, 'A ordem de venda precisa de ao menos um item.')
    .superRefine((items, ctx) => {
      const ids = items.map((line) => line.itemId);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: 'custom', message: 'A OV não pode repetir o mesmo item.' });
      }
    }),
});

export type CreateSalesOrderForm = z.infer<typeof createSalesOrderSchema>;
/** Forma dos valores do formulário antes da coerção (quantity ainda não é number). */
export type CreateSalesOrderFormInput = z.input<typeof createSalesOrderSchema>;

/**
 * Preview do total, em centavos. Aritmética inteira porque o valor é dinheiro.
 * O servidor é quem calcula o total real; isto é estimativa exibida ao usuário.
 */
export function estimateTotalCents(
  lines: ReadonlyArray<{ quantity: number; unitPrice: string }>,
): number {
  return lines.reduce((total, line) => {
    const [reais, centavosRaw = '0'] = line.unitPrice.split('.');
    // A API só emite duas casas decimais, mas normalizamos defensivamente: usamos
    // apenas os dois primeiros dígitos fracionários (truncando quaisquer dígitos
    // extras) em vez de tratá-los como centavos adicionais. Um valor mal formado
    // como "129.999" vira 129,99 em vez de somar 999 centavos silenciosamente.
    const centavos = centavosRaw.slice(0, 2).padEnd(2, '0');
    const priceCents = Number(reais) * 100 + Number(centavos);
    return total + priceCents * line.quantity;
  }, 0);
}
