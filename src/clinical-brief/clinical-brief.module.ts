import { Module } from '@nestjs/common';
import { ClinicalBriefService } from './clinical-brief.service';
import { ClinicalBriefController } from './clinical-brief.controller';

@Module({
  controllers: [ClinicalBriefController],
  providers: [ClinicalBriefService],
  exports: [ClinicalBriefService],
})
export class ClinicalBriefModule {}
