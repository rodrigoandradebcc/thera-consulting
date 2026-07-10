import { Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditEntity,
  DeliverySchedule,
  Prisma,
  ScheduleStatus,
} from '../../../generated/prisma/client';
import {
  EntityNotFoundException,
  ScheduleAlreadyConfirmedException,
  ScheduleAlreadyExistsException,
  SlotUnavailableException,
} from '../../common/exceptions';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Tx } from '../../common/prisma/prisma.types';
import { AuditService } from '../audit/audit.service';
import { SalesOrdersRepository } from '../sales-orders/sales-orders.repository';
import {
  assertFutureDate,
  assertOrderAcceptsScheduleChange,
  MAX_DELIVERIES_PER_SLOT,
} from './domain/schedule-rules';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { SchedulingRepository } from './scheduling.repository';

function toDateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function snapshot(schedule: DeliverySchedule): Prisma.InputJsonValue {
  return {
    scheduledDate: schedule.scheduledDate.toISOString().slice(0, 10),
    window: schedule.window,
    status: schedule.status,
  };
}

@Injectable()
export class SchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: SchedulingRepository,
    private readonly orders: SalesOrdersRepository,
    private readonly audit: AuditService,
  ) {}

  async create(
    salesOrderId: string,
    dto: CreateScheduleDto,
    actor: string,
  ): Promise<DeliverySchedule> {
    const scheduledDate = toDateOnly(dto.scheduledDate);
    assertFutureDate(scheduledDate, new Date());

    return this.prisma.$transaction(async (tx) => {
      const order = await this.orders.findByIdOrThrow(salesOrderId, tx);
      assertOrderAcceptsScheduleChange(order.status);

      const existing = await this.repository.findBySalesOrderId(salesOrderId, tx);
      if (existing !== null) {
        throw new ScheduleAlreadyExistsException(salesOrderId);
      }

      const schedule = await this.repository.create(
        {
          salesOrder: { connect: { id: salesOrderId } },
          scheduledDate,
          window: dto.window,
        },
        tx,
      );

      await this.recordAudit(tx, salesOrderId, schedule, null, actor);
      return schedule;
    });
  }

  async reschedule(
    salesOrderId: string,
    dto: UpdateScheduleDto,
    actor: string,
  ): Promise<DeliverySchedule> {
    const scheduledDate =
      dto.scheduledDate === undefined ? undefined : toDateOnly(dto.scheduledDate);
    if (scheduledDate !== undefined) {
      assertFutureDate(scheduledDate, new Date());
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.orders.findByIdOrThrow(salesOrderId, tx);
      assertOrderAcceptsScheduleChange(order.status);

      const before = await this.repository.findBySalesOrderId(salesOrderId, tx);
      if (before === null) {
        throw new EntityNotFoundException('Agendamento', salesOrderId);
      }

      // Reagendar NÃO rebaixa CONFIRMADO para PENDENTE: isso deixaria uma OV
      // AGENDADA apoiada em agendamento não confirmado.
      const after = await this.repository.update(
        before.id,
        {
          ...(scheduledDate !== undefined && { scheduledDate }),
          ...(dto.window !== undefined && { window: dto.window }),
          rescheduleCount: { increment: 1 },
        },
        tx,
      );

      await this.recordAudit(tx, salesOrderId, after, before, actor);
      return after;
    });
  }

  async confirm(salesOrderId: string, actor: string): Promise<DeliverySchedule> {
    return this.prisma.$transaction(
      async (tx) => {
        const before = await this.repository.findBySalesOrderId(salesOrderId, tx);
        if (before === null) {
          throw new EntityNotFoundException('Agendamento', salesOrderId);
        }
        if (before.status === ScheduleStatus.CONFIRMADO) {
          throw new ScheduleAlreadyConfirmedException(salesOrderId);
        }

        const confirmed = await this.repository.countConfirmedInSlot(
          before.scheduledDate,
          before.window,
          tx,
        );
        if (confirmed >= MAX_DELIVERIES_PER_SLOT) {
          throw new SlotUnavailableException(
            before.scheduledDate.toISOString().slice(0, 10),
            before.window,
          );
        }

        const after = await this.repository.update(
          before.id,
          { status: ScheduleStatus.CONFIRMADO },
          tx,
        );

        await this.recordAudit(tx, salesOrderId, after, before, actor);
        return after;
      },
      // A contagem de capacidade e a escrita precisam ver um snapshot consistente,
      // ou duas confirmações concorrentes estouram o limite do slot.
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  findBySalesOrderId(salesOrderId: string): Promise<DeliverySchedule | null> {
    return this.repository.findBySalesOrderId(salesOrderId);
  }

  private recordAudit(
    tx: Tx,
    salesOrderId: string,
    after: DeliverySchedule,
    before: DeliverySchedule | null,
    actor: string,
  ): Promise<void> {
    return this.audit.record(tx, {
      salesOrderId,
      entity: AuditEntity.DELIVERY_SCHEDULE,
      entityId: after.id,
      action: AuditAction.SCHEDULE_CHANGED,
      before: before === null ? null : snapshot(before),
      after: snapshot(after),
      actor,
    });
  }
}
