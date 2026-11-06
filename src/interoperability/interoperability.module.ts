import { Module } from '@nestjs/common';
import { InteroperabilityService } from './interoperability.service';
import { InteroperabilityController } from './interoperability.controller';
import { FhirSerializerService } from './fhir-serializer.service';

@Module({
  controllers: [InteroperabilityController],
  providers: [InteroperabilityService, FhirSerializerService],
  exports: [InteroperabilityService, FhirSerializerService],
})
export class InteroperabilityModule {}
