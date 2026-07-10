import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SalesOrdersModule } from '../sales-orders/sales-orders.module';
import { SchedulingController } from './scheduling.controller';
import { SchedulingRepository } from './scheduling.repository';
import { SchedulingService } from './scheduling.service';

@Module({
  imports: [SalesOrdersModule, AuditModule],
  controllers: [SchedulingController],
  providers: [SchedulingService, SchedulingRepository],
  exports: [SchedulingService],
})
export class SchedulingModule {}
