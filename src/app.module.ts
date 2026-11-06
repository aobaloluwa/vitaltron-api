import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { UsersModule } from './users/users.module';
import { HealthRecordsModule } from './health-records/health-records.module';
import { DocumentIngestionModule } from './document-ingestion/document-ingestion.module';
import { ClinicalBriefModule } from './clinical-brief/clinical-brief.module';
import { ControlledSharingModule } from './controlled-sharing/controlled-sharing.module';
import { InteroperabilityModule } from './interoperability/interoperability.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),

        PORT: Joi.number()
          .integer()
          .min(1)
          .max(65535)
          .default(3000),

        CORS_ORIGINS: Joi.string().default('http://localhost:8081'),
      }),
    }),

    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    HealthRecordsModule,
    DocumentIngestionModule,
    ClinicalBriefModule,
    ControlledSharingModule,
    InteroperabilityModule,
  ],

  controllers: [AppController, HealthController],

  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
