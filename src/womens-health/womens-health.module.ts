import { Module } from '@nestjs/common';
import { WomensHealthController } from './womens-health.controller';
import { WomensHealthService } from './womens-health.service';
import { CycleCalculatorService } from './services/cycle-calculator.service';
import { PregnancyCalculatorService } from './services/pregnancy-calculator.service';
import { WomensHealthAiService } from './services/womens-health-ai.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [WomensHealthController],
  providers: [
    WomensHealthService,
    CycleCalculatorService,
    PregnancyCalculatorService,
    WomensHealthAiService,
  ],
  exports: [WomensHealthService],
})
export class WomensHealthModule {}
