import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { truncateAll } from './utils/db';

const FUTURE_DATE = '2099-08-01';

describe('Scheduling (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let documentCounter = 0;

  async function createOrder(): Promise<string> {
    documentCounter += 1;
    const customer = await prisma.customer.create({
      data: { name: 'ACME', document: `1234567800${String(documentCounter).padStart(4, '0')}` },
    });
    const transport = await prisma.transportType.findFirstOrThrow();
    await prisma.customerTransportType.create({
      data: { customerId: customer.id, transportTypeId: transport.id },
    });
    const item = await prisma.item.findFirstOrThrow();
    const order = await prisma.salesOrder.create({
      data: {
        customerId: customer.id,
        transportTypeId: transport.id,
        total: '100.00',
        items: { create: [{ itemId: item.id, quantity: 1, unitPrice: '100.00' }] },
      },
    });
    return order.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    documentCounter = 0;
    await prisma.transportType.create({ data: { code: 'CAMINHAO', name: 'Caminhão' } });
    await prisma.item.create({ data: { sku: 'SKU-001', name: 'Palete', unitPrice: '100.00' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('cria agendamento com data e janela, status PENDENTE', async () => {
    const orderId = await createOrder();

    const response = await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
      .expect(201);

    expect(response.body).toMatchObject({
      scheduledDate: FUTURE_DATE,
      window: 'MANHA',
      status: 'PENDENTE',
      rescheduleCount: 0,
    });
  });

  it('rejeita segundo agendamento para a mesma OV com 409', async () => {
    const orderId = await createOrder();
    const body = { scheduledDate: FUTURE_DATE, window: 'MANHA' };

    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send(body)
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send(body)
      .expect(409);

    expect(second.body.error).toBe('ScheduleAlreadyExists');
  });

  it('rejeita data passada com 400', async () => {
    const orderId = await createOrder();

    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: '2020-01-01', window: 'TARDE' })
      .expect(400);
  });

  it('reagenda mantendo CONFIRMADO e incrementando rescheduleCount', async () => {
    const orderId = await createOrder();
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule/confirm`)
      .expect(200);

    const rescheduled = await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: '2099-08-05', window: 'TARDE' })
      .expect(200);

    expect(rescheduled.body).toMatchObject({
      scheduledDate: '2099-08-05',
      window: 'TARDE',
      status: 'CONFIRMADO',
      rescheduleCount: 1,
    });
  });

  it('rejeita confirmação dupla com 409', async () => {
    const orderId = await createOrder();
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule/confirm`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule/confirm`)
      .expect(409);

    expect(second.body.error).toBe('ScheduleAlreadyConfirmed');
  });

  it('rejeita a sexta confirmação no mesmo slot com 409', async () => {
    for (let index = 0; index < 5; index += 1) {
      const orderId = await createOrder();
      await request(app.getHttpServer())
        .post(`/api/sales-orders/${orderId}/schedule`)
        .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/sales-orders/${orderId}/schedule/confirm`)
        .expect(200);
    }

    const sixthOrderId = await createOrder();
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${sixthOrderId}/schedule`)
      .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post(`/api/sales-orders/${sixthOrderId}/schedule/confirm`)
      .expect(409);

    expect(response.body.error).toBe('SlotUnavailable');
  });

  it('grava um log SCHEDULE_CHANGED por operação de agendamento', async () => {
    const orderId = await createOrder();
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule/confirm`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/schedule`)
      .send({ window: 'TARDE' })
      .expect(200);

    const logs = await prisma.auditLog.findMany({
      where: { salesOrderId: orderId, action: 'SCHEDULE_CHANGED' },
    });
    expect(logs).toHaveLength(3);
    expect(logs.every((log) => log.entity === 'DELIVERY_SCHEDULE')).toBe(true);
  });
});
