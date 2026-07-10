import { z } from 'zod';

const today = (): string => new Date().toISOString().slice(0, 10);

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
