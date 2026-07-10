import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { truncateAll } from './utils/db';

const FUTURE_DATE = '2099-08-01';

describe('SalesOrders status e transporte (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orderId: string;
  let authorizedTransportId: string;
  let unauthorizedTransportId: string;

  async function advanceTo(target: string): Promise<void> {
    const path = `/api/sales-orders/${orderId}/status`;
    await request(app.getHttpServer()).patch(path).send({ status: 'PLANEJADA' }).expect(200);
    if (target === 'PLANEJADA') return;

    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule/confirm`)
      .expect(200);
    await request(app.getHttpServer()).patch(path).send({ status: 'AGENDADA' }).expect(200);
    if (target === 'AGENDADA') return;

    await request(app.getHttpServer()).patch(path).send({ status: 'EM_TRANSPORTE' }).expect(200);
    if (target === 'EM_TRANSPORTE') return;

    await request(app.getHttpServer()).patch(path).send({ status: 'ENTREGUE' }).expect(200);
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
    const customer = await prisma.customer.create({
      data: { name: 'ACME', document: '12345678000199' },
    });
    const caminhao = await prisma.transportType.create({
      data: { code: 'CAMINHAO', name: 'Caminhão' },
    });
    const carreta = await prisma.transportType.create({
      data: { code: 'CARRETA', name: 'Carreta' },
    });
    const bitruck = await prisma.transportType.create({
      data: { code: 'BITRUCK', name: 'Bi-truck' },
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
    const order = await prisma.salesOrder.create({
      data: {
        customerId: customer.id,
        transportTypeId: caminhao.id,
        total: '100.00',
        items: { create: [{ itemId: item.id, quantity: 1, unitPrice: '100.00' }] },
      },
    });

    orderId = order.id;
    authorizedTransportId = carreta.id;
    unauthorizedTransportId = bitruck.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('percorre o fluxo feliz completo até ENTREGUE', async () => {
    await advanceTo('ENTREGUE');

    const detail = await request(app.getHttpServer())
      .get(`/api/sales-orders/${orderId}`)
      .expect(200);
    expect(detail.body.status).toBe('ENTREGUE');
  });

  it('rejeita pular etapa (CRIADA para ENTREGUE) com 409', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/status`)
      .send({ status: 'ENTREGUE' })
      .expect(409);

    expect(response.body.error).toBe('InvalidStatusTransition');
  });

  it('rejeita retroceder de PLANEJADA para CRIADA com 409', async () => {
    await advanceTo('PLANEJADA');
    await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/status`)
      .send({ status: 'CRIADA' })
      .expect(409);
  });

  it('rejeita AGENDADA sem agendamento confirmado com 409', async () => {
    await advanceTo('PLANEJADA');

    const semAgendamento = await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/status`)
      .send({ status: 'AGENDADA' })
      .expect(409);
    expect(semAgendamento.body.error).toBe('OrderNotSchedulable');

    await request(app.getHttpServer())
      .post(`/api/sales-orders/${orderId}/schedule`)
      .send({ scheduledDate: FUTURE_DATE, window: 'MANHA' })
      .expect(201);

    const pendente = await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/status`)
      .send({ status: 'AGENDADA' })
      .expect(409);
    expect(pendente.body.error).toBe('OrderNotSchedulable');
  });

  it('rejeita status inexistente com 400', async () => {
    await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/status`)
      .send({ status: 'CANCELADA' })
      .expect(400);
  });

  it('troca o transporte por outro autorizado e audita', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/transport-type`)
      .set('X-Actor', 'rodrigo')
      .send({ transportTypeId: authorizedTransportId })
      .expect(200);

    expect(response.body.transportTypeId).toBe(authorizedTransportId);

    const logs = await prisma.auditLog.findMany({
      where: { salesOrderId: orderId, action: 'TRANSPORT_CHANGED' },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actor).toBe('rodrigo');
  });

  it('rejeita troca por transporte não autorizado com 409', async () => {
    await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/transport-type`)
      .send({ transportTypeId: unauthorizedTransportId })
      .expect(409);
  });

  it('rejeita troca de transporte a partir de EM_TRANSPORTE com 409', async () => {
    await advanceTo('EM_TRANSPORTE');

    const response = await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/transport-type`)
      .send({ transportTypeId: authorizedTransportId })
      .expect(409);

    expect(response.body.error).toBe('OrderNotSchedulable');
  });

  it('não grava log quando a transição é rejeitada', async () => {
    await request(app.getHttpServer())
      .patch(`/api/sales-orders/${orderId}/status`)
      .send({ status: 'ENTREGUE' })
      .expect(409);

    const logs = await prisma.auditLog.findMany({
      where: { salesOrderId: orderId, action: 'STATUS_CHANGED' },
    });
    expect(logs).toHaveLength(0);
  });
});
