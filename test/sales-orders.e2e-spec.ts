import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { truncateAll } from './utils/db';

describe('SalesOrders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let customerId: string;
  let transportTypeId: string;
  let unauthorizedTransportTypeId: string;
  let itemId: string;

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
    await prisma.customerTransportType.create({
      data: { customerId: customer.id, transportTypeId: caminhao.id },
    });
    const item = await prisma.item.create({
      data: { sku: 'SKU-001', name: 'Palete', unitPrice: '129.90' },
    });

    customerId = customer.id;
    transportTypeId = caminhao.id;
    unauthorizedTransportTypeId = carreta.id;
    itemId = item.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('cria uma OV com status CRIADA, total calculado e log de auditoria', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/sales-orders')
      .set('X-Actor', 'rodrigo')
      .send({ customerId, transportTypeId, items: [{ itemId, quantity: 2 }] })
      .expect(201);

    expect(response.body).toMatchObject({ status: 'CRIADA', total: '259.80', number: 'OV-000001' });

    const logs = await prisma.auditLog.findMany({ where: { salesOrderId: response.body.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'ORDER_CREATED', actor: 'rodrigo', before: null });
  });

  it('rejeita OV sem itens com 400', async () => {
    await request(app.getHttpServer())
      .post('/api/sales-orders')
      .send({ customerId, transportTypeId, items: [] })
      .expect(400);
  });

  it('rejeita transporte não autorizado para o cliente com 409', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/sales-orders')
      .send({
        customerId,
        transportTypeId: unauthorizedTransportTypeId,
        items: [{ itemId, quantity: 1 }],
      })
      .expect(409);

    expect(response.body.error).toBe('TransportTypeNotAllowed');
  });

  it('não deixa OV órfã quando a criação falha', async () => {
    await request(app.getHttpServer())
      .post('/api/sales-orders')
      .send({
        customerId,
        transportTypeId: unauthorizedTransportTypeId,
        items: [{ itemId, quantity: 1 }],
      })
      .expect(409);

    expect(await prisma.salesOrder.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it('filtra a listagem por status, cliente e tipo de transporte', async () => {
    await request(app.getHttpServer())
      .post('/api/sales-orders')
      .send({ customerId, transportTypeId, items: [{ itemId, quantity: 1 }] })
      .expect(201);

    const byStatus = await request(app.getHttpServer())
      .get('/api/sales-orders?status=CRIADA')
      .expect(200);
    expect(byStatus.body).toHaveLength(1);

    const byOtherStatus = await request(app.getHttpServer())
      .get('/api/sales-orders?status=ENTREGUE')
      .expect(200);
    expect(byOtherStatus.body).toHaveLength(0);

    const byCustomer = await request(app.getHttpServer())
      .get(`/api/sales-orders?customerId=${customerId}`)
      .expect(200);
    expect(byCustomer.body).toHaveLength(1);

    const byTransport = await request(app.getHttpServer())
      .get(`/api/sales-orders?transportTypeId=${unauthorizedTransportTypeId}`)
      .expect(200);
    expect(byTransport.body).toHaveLength(0);
  });

  it('rejeita filtro desconhecido com 400', async () => {
    await request(app.getHttpServer()).get('/api/sales-orders?hacker=1').expect(400);
  });
});
