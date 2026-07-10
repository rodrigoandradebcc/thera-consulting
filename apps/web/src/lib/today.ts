/**
 * Data local no formato YYYY-MM-DD, com deslocamento opcional em dias.
 * NÃO usar toISOString(): ele devolve UTC, que em São Paulo (UTC-3) já virou
 * "amanhã" entre 21:00 e 23:59, deslocando o dia por três horas toda noite.
 */
export function todayLocalIso(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
