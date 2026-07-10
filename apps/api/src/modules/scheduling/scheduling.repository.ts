import { Injectable } from '@nestjs/common';
import {
  DeliverySchedule,
  DeliveryWindow,
  Prisma,
  ScheduleStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Tx } from '../../common/prisma/prisma.types';

@Injectable()
export class SchedulingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySalesOrderId(salesOrderId: string, tx: Tx = this.prisma): Promise<DeliverySchedule | null> {
    return tx.deliverySchedule.findUnique({ where: { salesOrderId } });
  }

  create(data: Prisma.DeliveryScheduleCreateInput, tx: Tx): Promise<DeliverySchedule> {
    return tx.deliverySchedule.create({ data });
  }

  update(id: string, data: Prisma.DeliveryScheduleUpdateInput, tx: Tx): Promise<DeliverySchedule> {
    return tx.deliverySchedule.update({ where: { id }, data });
  }

  countConfirmedInSlot(scheduledDate: Date, window: DeliveryWindow, tx: Tx): Promise<number> {
    return tx.deliverySchedule.count({
      where: { scheduledDate, window, status: ScheduleStatus.CONFIRMADO },
    });
  }
}
