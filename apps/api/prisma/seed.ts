import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
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
  await prisma.transportType.upsert({
    where: { code: 'BITRUCK' },
    update: {},
    create: { code: 'BITRUCK', name: 'Bi-truck' },
  });

  const acme = await prisma.customer.upsert({
    where: { document: '12345678000199' },
    update: {},
    create: { name: 'ACME Distribuidora', document: '12345678000199', email: 'contato@acme.com' },
  });

  await prisma.customerTransportType.upsert({
    where: { customerId_transportTypeId: { customerId: acme.id, transportTypeId: caminhao.id } },
    update: {},
    create: { customerId: acme.id, transportTypeId: caminhao.id },
  });
  await prisma.customerTransportType.upsert({
    where: { customerId_transportTypeId: { customerId: acme.id, transportTypeId: carreta.id } },
    update: {},
    create: { customerId: acme.id, transportTypeId: carreta.id },
  });

  await prisma.item.upsert({
    where: { sku: 'SKU-001' },
    update: {},
    create: { sku: 'SKU-001', name: 'Palete de água 500ml', unitPrice: '129.90' },
  });
  await prisma.item.upsert({
    where: { sku: 'SKU-002' },
    update: {},
    create: { sku: 'SKU-002', name: 'Caixa de refrigerante 2L', unitPrice: '89.50' },
  });

  console.log('Seed concluído.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
