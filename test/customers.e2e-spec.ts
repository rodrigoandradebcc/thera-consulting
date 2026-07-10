import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { truncateAll } from './utils/db';

describe('Customers (e2e)', () => {
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

  it('cria, consulta, lista e atualiza um cliente', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/customers')
      .send({ name: 'ACME', document: '12345678000199', email: 'a@acme.com' })
      .expect(201);

    expect(created.body).toMatchObject({ name: 'ACME', active: true });

    const id = created.body.id as string;

    await request(app.getHttpServer()).get(`/api/customers/${id}`).expect(200);
    const list = await request(app.getHttpServer()).get('/api/customers').expect(200);
    expect(list.body).toHaveLength(1);

    const updated = await request(app.getHttpServer())
      .patch(`/api/customers/${id}`)
      .send({ active: false })
      .expect(200);
    expect(updated.body.active).toBe(false);
  });

  it('rejeita documento duplicado com 409', async () => {
    const payload = { name: 'ACME', document: '12345678000199' };
    await request(app.getHttpServer()).post('/api/customers').send(payload).expect(201);
    await request(app.getHttpServer()).post('/api/customers').send(payload).expect(409);
  });

  it('rejeita campo desconhecido com 400', async () => {
    await request(app.getHttpServer())
      .post('/api/customers')
      .send({ name: 'ACME', document: '12345678000199', hacker: true })
      .expect(400);
  });

  it('retorna 404 para cliente inexistente', async () => {
    await request(app.getHttpServer())
      .get('/api/customers/6f0f0b3e-0000-4000-8000-000000000000')
      .expect(404);
  });

  it('vincula tipos de transporte de forma aditiva e idempotente', async () => {
    const customer = await request(app.getHttpServer())
      .post('/api/customers')
      .send({ name: 'ACME', document: '12345678000199' })
      .expect(201);
    const transport = await prisma.transportType.create({
      data: { code: 'CAMINHAO', name: 'Caminhão' },
    });

    const body = { transportTypeIds: [transport.id] };
    await request(app.getHttpServer())
      .post(`/api/customers/${customer.body.id}/transport-types`)
      .send(body)
      .expect(200);

    // Reenviar o mesmo corpo não muda estado nem falha.
    const second = await request(app.getHttpServer())
      .post(`/api/customers/${customer.body.id}/transport-types`)
      .send(body)
      .expect(200);

    expect(second.body.transportTypeIds).toEqual([transport.id]);
  });
});
