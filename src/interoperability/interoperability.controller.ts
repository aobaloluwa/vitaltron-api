import { Controller, Get, Post, Body, Query, Param, UseGuards, Request } from '@nestjs/common';
import { InteroperabilityService } from './interoperability.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';

@Controller('interoperability')
@UseGuards(JwtAuthGuard)
export class InteroperabilityController {
  constructor(private readonly interoperabilityService: InteroperabilityService) {}

  @Get('fhir/patient')
  async exportPatientFhirBundle(@Request() req: any, @Query('patientId') patientId?: string) {
    return this.interoperabilityService.exportPatientFhirBundle(req.user.id, patientId);
  }

  @Post('fhir/import')
  async importFhirBundle(@Request() req: any, @Body() body: { bundle: any; patientId?: string }) {
    return this.interoperabilityService.importFhirBundle(req.user.id, body.bundle, body.patientId);
  }
}
