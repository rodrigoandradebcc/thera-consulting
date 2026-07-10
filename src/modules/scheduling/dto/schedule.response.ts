import { ApiProperty } from '@nestjs/swagger';
import { DeliverySchedule } from '../../../../generated/prisma/client';

export class ScheduleResponse {
  @ApiProperty() id!: string;
  @ApiProperty() salesOrderId!: string;
  @ApiProperty({ example: '2026-08-01' }) scheduledDate!: string;
  @ApiProperty() window!: string;
  @ApiProperty() status!: string;
  @ApiProperty() rescheduleCount!: number;

  static from(schedule: DeliverySchedule): ScheduleResponse {
    return {
      id: schedule.id,
      salesOrderId: schedule.salesOrderId,
      scheduledDate: schedule.scheduledDate.toISOString().slice(0, 10),
      window: schedule.window,
      status: schedule.status,
      rescheduleCount: schedule.rescheduleCount,
    };
  }
}
