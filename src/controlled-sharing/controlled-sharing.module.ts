import { Module } from '@nestjs/common';
import { ControlledSharingService } from './controlled-sharing.service';
import { ControlledSharingController } from './controlled-sharing.controller';
import { ClinicalBriefModule } from '../clinical-brief/clinical-brief.module';

@Module({
  imports: [ClinicalBriefModule],
  controllers: [ControlledSharingController],
  providers: [ControlledSharingService],
  exports: [ControlledSharingService],
})
export class ControlledSharingModule {}
