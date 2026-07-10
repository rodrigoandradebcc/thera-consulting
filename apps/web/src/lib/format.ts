const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

/** A API devolve Decimal como string. Number() aqui é só para exibir, nunca para calcular. */
export function money(value: string): string {
  return currency.format(Number(value));
}

export function orderNumber(value: number): string {
  return `OV-${String(value).padStart(6, '0')}`;
}

/**
 * `new Date('2026-08-01')` é interpretado como UTC meia-noite. Formatar em
 * America/Sao_Paulo mostraria 31/07. Por isso o formatador fixa timeZone UTC.
 */
export function dateBR(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`));
}

export function dateTimeBR(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}
