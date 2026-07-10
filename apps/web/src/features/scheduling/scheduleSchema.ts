import { z } from 'zod';

// `toISOString()` formata em UTC, não no fuso local. Em São Paulo (UTC-3),
// entre 21:00 e 23:59 já é o dia seguinte em UTC, então usar `toISOString()`
// rejeitaria uma data de hoje, ainda válida, como se fosse passada. Por isso
// montamos a string a partir dos getters locais (`getFullYear`/`getMonth`/`getDate`).
function today(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const scheduleSchema = z.object({
  scheduledDate: z
    .string()
    .min(1, 'Informe a data de entrega.')
    .refine((value) => value >= today(), 'A data precisa ser hoje ou futura.'),
  window: z.enum(['MANHA', 'TARDE', 'INTEGRAL']),
});

export type ScheduleForm = z.infer<typeof scheduleSchema>;

export const WINDOW_LABEL: Record<ScheduleForm['window'], string> = {
  MANHA: 'Manhã (08:00–12:00)',
  TARDE: 'Tarde (13:00–18:00)',
  INTEGRAL: 'Integral (08:00–18:00)',
};
