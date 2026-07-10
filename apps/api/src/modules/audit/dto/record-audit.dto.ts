import { AuditAction, AuditEntity, Prisma } from '../../../../generated/prisma/client';

export interface RecordAuditInput {
  salesOrderId: string;
  entity: AuditEntity;
  entityId: string;
  action: AuditAction;
  before: Prisma.InputJsonValue | null;
  after: Prisma.InputJsonValue | null;
  actor: string | null;
}
