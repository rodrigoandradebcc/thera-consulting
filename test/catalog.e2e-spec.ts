import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { truncateAll } from './utils/db';

describe('Catálogo (e2e)', () => {
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

  it('cria, lista e edita um tipo de transporte', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/transport-types')
      .send({ code: 'BITRUCK', name: 'Bi-truck' })
      .expect(201);

    await request(app.getHttpServer()).get('/api/transport-types').expect(200);

    const updated = await request(app.getHttpServer())
      .patch(`/api/transport-types/${created.body.id}`)
      .send({ name: 'Bi-truck 14t' })
      .expect(200);
    expect(updated.body.name).toBe('Bi-truck 14t');
  });

  it('rejeita code duplicado de transporte com 409', async () => {
    const payload = { code: 'CARRETA', name: 'Carreta' };
    await request(app.getHttpServer()).post('/api/transport-types').send(payload).expect(201);
    await request(app.getHttpServer()).post('/api/transport-types').send(payload).expect(409);
  });

  it('cria, lista e consulta um item preservando a precisão decimal', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/items')
      .send({ sku: 'SKU-001', name: 'Palete', unitPrice: '129.90' })
      .expect(201);

    expect(created.body.unitPrice).toBe('129.90');

    await request(app.getHttpServer()).get('/api/items').expect(200);
    const one = await request(app.getHttpServer()).get(`/api/items/${created.body.id}`).expect(200);
    expect(one.body.unitPrice).toBe('129.90');
  });

  it('rejeita sku duplicado com 409', async () => {
    const payload = { sku: 'SKU-001', name: 'Palete', unitPrice: '10.00' };
    await request(app.getHttpServer()).post('/api/items').send(payload).expect(201);
    await request(app.getHttpServer()).post('/api/items').send(payload).expect(409);
  });

  it('retorna 404 para item inexistente', async () => {
    await request(app.getHttpServer())
      .get('/api/items/6f0f0b3e-0000-4000-8000-000000000000')
      .expect(404);
  });
});
