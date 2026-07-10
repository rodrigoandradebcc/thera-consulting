import { PrismaClient } from '../../generated/prisma/client';

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog",
      "DeliverySchedule",
      "SalesOrderItem",
      "SalesOrder",
      "CustomerTransportType",
      "Item",
      "Customer",
      "TransportType"
    RESTART IDENTITY CASCADE
  `);
}
