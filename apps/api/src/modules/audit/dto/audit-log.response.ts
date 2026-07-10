import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditLog, Prisma } from '../../../../generated/prisma/client';

export class AuditLogResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'STATUS_CHANGED' }) action!: string;
  @ApiProperty({ example: 'SALES_ORDER' }) entity!: string;
  @ApiProperty() entityId!: string;
  @ApiPropertyOptional({ type: Object, nullable: true })
  before!: Prisma.JsonValue | null;
  @ApiPropertyOptional({ type: Object, nullable: true })
  after!: Prisma.JsonValue | null;
  @ApiPropertyOptional({ nullable: true }) actor!: string | null;
  @ApiProperty({ description: 'Data e hora do evento.' }) createdAt!: Date;

  static from(log: AuditLog): AuditLogResponse {
    return {
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      before: log.before,
      after: log.after,
      actor: log.actor,
      createdAt: log.createdAt,
    };
  }
}
