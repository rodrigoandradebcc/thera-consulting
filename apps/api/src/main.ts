import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { Env } from './common/config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService<Env, true>);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: configService.get('WEB_ORIGIN', { infer: true }),
    // X-Actor é header customizado: sem declará-lo, o preflight reprova toda mutação.
    allowedHeaders: ['Content-Type', 'X-Actor'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = new DocumentBuilder()
    .setTitle('OVGS — Sistema de Gestão de Ordens de Venda')
    .setDescription('API REST para gestão do ciclo de vida de Ordens de Venda.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(configService.get('PORT', { infer: true }));
}
void bootstrap();
