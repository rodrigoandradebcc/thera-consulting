import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  type DeliveryWindow,
  PrismaClient,
  type SalesOrderStatus,
  type ScheduleStatus,
} from '../generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const STATUS_FLOW: SalesOrderStatus[] = [
  'CRIADA',
  'PLANEJADA',
  'AGENDADA',
  'EM_TRANSPORTE',
  'ENTREGUE',
];

function dateOffset(days: number): { date: Date; iso: string } {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + days);
  const iso = base.toISOString().slice(0, 10);
  return { date: new Date(`${iso}T00:00:00.000Z`), iso };
}

function computeTotal(lines: { unitPrice: string; quantity: number }[]): string {
  const cents = lines.reduce(
    (sum, line) => sum + Math.round(Number(line.unitPrice) * 100) * line.quantity,
    0,
  );
  return (cents / 100).toFixed(2);
}

interface OrderSeed {
  customerId: string;
  transportTypeId: string;
  status: SalesOrderStatus;
  actor: string;
  lines: { itemId: string; unitPrice: string; quantity: number }[];
  schedule?: {
    offsetDays: number;
    window: DeliveryWindow;
    status: ScheduleStatus;
    rescheduleCount?: number;
  };
  createdOffsetHours: number;
}

async function createOrder(seed: OrderSeed): Promise<void> {
  const total = computeTotal(seed.lines);
  const baseTime = new Date();
  baseTime.setUTCHours(baseTime.getUTCHours() - seed.createdOffsetHours);
  let tick = 0;
  const at = (): Date => {
    tick += 1;
    return new Date(baseTime.getTime() + tick * 1000);
  };

  const order = await prisma.salesOrder.create({
    data: {
      customerId: seed.customerId,
      transportTypeId: seed.transportTypeId,
      status: 'CRIADA',
      total,
      createdAt: baseTime,
      items: {
        create: seed.lines.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      salesOrderId: order.id,
      entity: 'SALES_ORDER',
      entityId: order.id,
      action: 'ORDER_CREATED',
      before: undefined,
      after: {
        status: 'CRIADA',
        customerId: seed.customerId,
        transportTypeId: seed.transportTypeId,
        total,
      },
      actor: seed.actor,
      createdAt: at(),
    },
  });

  const targetIndex = STATUS_FLOW.indexOf(seed.status);
  for (let index = 1; index <= targetIndex; index += 1) {
    await prisma.auditLog.create({
      data: {
        salesOrderId: order.id,
        entity: 'SALES_ORDER',
        entityId: order.id,
        action: 'STATUS_CHANGED',
        before: { status: STATUS_FLOW[index - 1] },
        after: { status: STATUS_FLOW[index] },
        actor: seed.actor,
        createdAt: at(),
      },
    });
  }

  if (targetIndex > 0) {
    await prisma.salesOrder.update({
      where: { id: order.id },
      data: { status: seed.status },
    });
  }

  if (seed.schedule !== undefined) {
    const { date, iso } = dateOffset(seed.schedule.offsetDays);
    await prisma.deliverySchedule.create({
      data: {
        salesOrderId: order.id,
        scheduledDate: date,
        window: seed.schedule.window,
        status: seed.schedule.status,
        rescheduleCount: seed.schedule.rescheduleCount ?? 0,
      },
    });
    await prisma.auditLog.create({
      data: {
        salesOrderId: order.id,
        entity: 'DELIVERY_SCHEDULE',
        entityId: order.id,
        action: 'SCHEDULE_CHANGED',
        before: undefined,
        after: { scheduledDate: iso, window: seed.schedule.window, status: seed.schedule.status },
        actor: seed.actor,
        createdAt: at(),
      },
    });
  }
}

async function main(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.deliverySchedule.deleteMany();
  await prisma.salesOrderItem.deleteMany();
  await prisma.salesOrder.deleteMany();

  const caminhao = await prisma.transportType.upsert({
    where: { code: 'CAMINHAO' },
    update: {},
    create: { code: 'CAMINHAO', name: 'Caminhão' },
  });
  const carreta = await prisma.transportType.upsert({
    where: { code: 'CARRETA' },
    update: {},
    create: { code: 'CARRETA', name: 'Carreta' },
  });
  const bitruck = await prisma.transportType.upsert({
    where: { code: 'BITRUCK' },
    update: {},
    create: { code: 'BITRUCK', name: 'Bi-truck' },
  });

  const acme = await prisma.customer.upsert({
    where: { document: '11222333000181' },
    update: {},
    create: { name: 'ACME Distribuidora', document: '11222333000181', email: 'contato@acme.com' },
  });
  const bebidasSul = await prisma.customer.upsert({
    where: { document: '92542201000139' },
    update: {},
    create: { name: 'Bebidas Sul Ltda', document: '92542201000139', email: 'compras@bebidassul.com' },
  });
  const rodrigo = await prisma.customer.upsert({
    where: { document: '64877801030' },
    update: {},
    create: { name: 'Rodrigo Andrade', document: '64877801030', email: 'rodrigo@example.com' },
  });
  const mercado = await prisma.customer.upsert({
    where: { document: '11144477735' },
    update: {},
    create: { name: 'Mercado Central', document: '11144477735' },
  });
  await prisma.customer.upsert({
    where: { document: '23194123017' },
    update: { active: false },
    create: { name: 'Distribuidora Antiga', document: '23194123017', active: false },
  });

  const authorizations: { customerId: string; transportTypeId: string }[] = [
    { customerId: acme.id, transportTypeId: caminhao.id },
    { customerId: acme.id, transportTypeId: carreta.id },
    { customerId: bebidasSul.id, transportTypeId: carreta.id },
    { customerId: bebidasSul.id, transportTypeId: bitruck.id },
    { customerId: rodrigo.id, transportTypeId: caminhao.id },
    { customerId: mercado.id, transportTypeId: bitruck.id },
  ];
  for (const link of authorizations) {
    await prisma.customerTransportType.upsert({
      where: {
        customerId_transportTypeId: {
          customerId: link.customerId,
          transportTypeId: link.transportTypeId,
        },
      },
      update: {},
      create: link,
    });
  }

  const catalog: { sku: string; name: string; unitPrice: string }[] = [
    { sku: 'SKU-001', name: 'Palete de água 500ml', unitPrice: '129.90' },
    { sku: 'SKU-002', name: 'Caixa de refrigerante 2L', unitPrice: '89.50' },
    { sku: 'SKU-003', name: 'Fardo de cerveja 350ml', unitPrice: '74.90' },
    { sku: 'SKU-004', name: 'Palete de suco 1L', unitPrice: '210.00' },
    { sku: 'SKU-005', name: 'Caixa de energético', unitPrice: '45.75' },
    { sku: 'SKU-006', name: 'Galão de água 20L', unitPrice: '18.00' },
  ];
  const items = new Map<string, { id: string; unitPrice: string }>();
  for (const entry of catalog) {
    const item = await prisma.item.upsert({
      where: { sku: entry.sku },
      update: {},
      create: { sku: entry.sku, name: entry.name, unitPrice: entry.unitPrice },
    });
    items.set(entry.sku, { id: item.id, unitPrice: entry.unitPrice });
  }
  const line = (sku: string, quantity: number): { itemId: string; unitPrice: string; quantity: number } => {
    const item = items.get(sku);
    if (item === undefined) throw new Error(`Item ${sku} não encontrado no catálogo do seed.`);
    return { itemId: item.id, unitPrice: item.unitPrice, quantity };
  };

  const orders: OrderSeed[] = [
    {
      customerId: acme.id,
      transportTypeId: caminhao.id,
      status: 'CRIADA',
      actor: 'ana',
      lines: [line('SKU-001', 2), line('SKU-002', 1)],
      createdOffsetHours: 72,
    },
    {
      customerId: acme.id,
      transportTypeId: carreta.id,
      status: 'PLANEJADA',
      actor: 'ana',
      lines: [line('SKU-003', 10)],
      createdOffsetHours: 60,
    },
    {
      customerId: bebidasSul.id,
      transportTypeId: carreta.id,
      status: 'AGENDADA',
      actor: 'bruno',
      lines: [line('SKU-004', 3), line('SKU-005', 5)],
      schedule: { offsetDays: 2, window: 'MANHA', status: 'PENDENTE' },
      createdOffsetHours: 48,
    },
    {
      customerId: bebidasSul.id,
      transportTypeId: bitruck.id,
      status: 'EM_TRANSPORTE',
      actor: 'bruno',
      lines: [line('SKU-006', 20)],
      schedule: { offsetDays: 1, window: 'TARDE', status: 'CONFIRMADO' },
      createdOffsetHours: 36,
    },
    {
      customerId: rodrigo.id,
      transportTypeId: caminhao.id,
      status: 'ENTREGUE',
      actor: 'ana',
      lines: [line('SKU-001', 1), line('SKU-003', 4)],
      schedule: { offsetDays: -1, window: 'INTEGRAL', status: 'CONFIRMADO' },
      createdOffsetHours: 24,
    },
    {
      customerId: mercado.id,
      transportTypeId: bitruck.id,
      status: 'AGENDADA',
      actor: 'carla',
      lines: [line('SKU-005', 8)],
      schedule: { offsetDays: 3, window: 'INTEGRAL', status: 'PENDENTE', rescheduleCount: 1 },
      createdOffsetHours: 6,
    },
  ];
  for (const seed of orders) {
    await createOrder(seed);
  }

  console.log(`Seed concluído: ${orders.length} ordens de venda, ${catalog.length} itens, 5 clientes.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
