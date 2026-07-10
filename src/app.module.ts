import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/config/env';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), PrismaModule],
  controllers: [HealthController],
})
export class AppModule {}
