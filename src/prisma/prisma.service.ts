import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    await this.ensureWomensHealthTablesExist();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private async ensureWomensHealthTablesExist() {
    try {
      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS public.womens_health_profiles (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" UUID UNIQUE NOT NULL,
          "activeMode" TEXT NOT NULL DEFAULT 'MENSTRUAL',
          "isOnboarded" BOOLEAN NOT NULL DEFAULT false,
          "declaredSex" VARCHAR(20),
          "averageCycleLength" INTEGER NOT NULL DEFAULT 28,
          "averagePeriodDuration" INTEGER NOT NULL DEFAULT 5,
          "lastPeriodStart" TIMESTAMP(3),
          "estimatedDueDate" TIMESTAMP(3),
          "isHighPrivacy" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS public.menstrual_cycles (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "patientId" UUID NOT NULL,
          "startDate" TIMESTAMP(3) NOT NULL,
          "endDate" TIMESTAMP(3),
          "cycleLength" INTEGER,
          "periodDuration" INTEGER,
          "isIrregular" BOOLEAN NOT NULL DEFAULT false,
          "notes" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS public.period_records (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "cycleId" UUID,
          "patientId" UUID NOT NULL,
          "date" TIMESTAMP(3) NOT NULL,
          "flow" TEXT NOT NULL DEFAULT 'MEDIUM',
          "isSpotting" BOOLEAN NOT NULL DEFAULT false,
          "notes" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS public.daily_cycle_logs (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "patientId" UUID NOT NULL,
          "date" TIMESTAMP(3) NOT NULL,
          "symptoms" JSONB,
          "mood" VARCHAR(100),
          "cervicalMucus" TEXT,
          "bbt" DOUBLE PRECISION,
          "sexualActivity" BOOLEAN DEFAULT false,
          "ovulationTestResult" VARCHAR(50),
          "pregnancyTestResult" VARCHAR(50),
          "notes" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS public.pregnancy_profiles (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "patientId" UUID UNIQUE NOT NULL,
          "lmpDate" TIMESTAMP(3),
          "confirmedDueDate" TIMESTAMP(3),
          "pregnancyType" TEXT NOT NULL DEFAULT 'SINGLETON',
          "healthcareProvider" VARCHAR(150),
          "notes" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS public.pregnancy_journals (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "patientId" UUID NOT NULL,
          "weekNumber" INTEGER,
          "title" VARCHAR(200) NOT NULL,
          "content" TEXT NOT NULL,
          "photoUrls" JSONB,
          "mood" VARCHAR(50),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS public.womens_health_reminders (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" UUID NOT NULL,
          "title" VARCHAR(150) NOT NULL,
          "category" TEXT NOT NULL DEFAULT 'MEDICATION',
          "reminderTime" VARCHAR(20) NOT NULL,
          "frequency" TEXT NOT NULL DEFAULT 'DAILY',
          "isEnabled" BOOLEAN NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS public.sexual_health_records (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "patientId" UUID NOT NULL,
          "testType" VARCHAR(100) NOT NULL,
          "testDate" TIMESTAMP(3) NOT NULL,
          "result" VARCHAR(100) NOT NULL,
          "notes" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (e) {
      console.warn('Womens health auto-migration check skipped:', e);
    }
  }
}
