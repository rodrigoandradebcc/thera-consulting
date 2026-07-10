import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { truncateAll } from './utils/db';

const FUTURE_DATE = '2099-08-01';

describe('Audit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('devolve a timeline completa do fluxo feliz, mais recente primeiro', async () => {
    const customer = await prisma.customer.create({
      data: { name: 'ACME', document: '12345678000199' },
    });
    const caminhao = await prisma.transportType.create({
      data: { code: 'CAMINHAO', name: 'Caminhão' },
    });
    const carreta = await prisma.transportType.create({
      data: { code: 'CARRETA', name: 'Carreta' },
    });
    await prisma.customerTransportType.createMany({
      data: [
        { customerId: customer.id, transportTypeId: caminhao.id },
        { customerId: customer.id, transportTypeId: carreta.id },
      ],
    });
    const item = await prisma.item.create({
      data: { sku: 'SKU-001', name: 'Palete', unitPrice: '100.00' },
    });

    const created = await request(app.getHttpServer())
      .post('/api/sales-orders')
      .set('X-Actor', 'rodrigo')
      .send({
        customerId: customer.id,
        transportTypeId: caminhao.id,
        items: [{ itemId: item.id, quantity: 1 }],
      })
      .expect(201);
    const orderId = created.body.id as string;

    await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/transport-type`)
      .send({ transportTypeId: carreta.id })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/status`)
      .send({ status: 'PLANEJADA' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule/confirm`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/status`)
      .send({ status: 'AGENDADA' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/api/sales-orders/${orderId}/audit`)
      .expect(200);

    const actions = (response.body as Array<{ action: string }>).map((log) => log.action);
    // createdAt desc: o mais recente primeiro.
    expect(actions).toEqual([
      'STATUS_CHANGED',
      'SCHEDULE_CHANGED',
      'SCHEDULE_CHANGED',
      'STATUS_CHANGED',
      'TRANSPORT_CHANGED',
      'ORDER_CREATED',
    ]);

    const creation = response.body[response.body.length - 1];
    expect(creation).toMatchObject({ entity: 'SALES_ORDER', actor: 'rodrigo', before: null });

    const transportChange = response.body[4];
    expect(transportChange.before).toEqual({ transportTypeId: caminhao.id });
    expect(transportChange.after).toEqual({ transportTypeId: carreta.id });

    const scheduleConfirm = response.body.find(
      (log: { action: string; after: { status?: string } }) =>
        log.action === 'SCHEDULE_CHANGED' && log.after.status === 'CONFIRMADO',
    );
    expect(scheduleConfirm.entity).toBe('DELIVERY_SCHEDULE');
    expect(scheduleConfirm.before).toMatchObject({ status: 'PENDENTE' });
  });

  it('retorna 404 para OV inexistente', async () => {
    await request(app.getHttpServer())
      .get('/api/sales-orders/6f0f0b3e-0000-4000-8000-000000000000/audit')
      .expect(404);
  });
});
