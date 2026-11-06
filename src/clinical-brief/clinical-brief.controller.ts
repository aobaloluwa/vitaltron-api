import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ClinicalBriefService } from './clinical-brief.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { GenerateBriefDto } from './dto/generate-brief.dto';

@Controller('clinical-briefs')
@UseGuards(JwtAuthGuard)
export class ClinicalBriefController {
  constructor(private readonly clinicalBriefService: ClinicalBriefService) {}

  @Post('generate')
  async generateBrief(@Request() req: any, @Body() dto: GenerateBriefDto) {
    return this.clinicalBriefService.generateBrief(req.user.id, dto);
  }

  @Get('patient/:patientId')
  async getPatientBriefs(@Request() req: any, @Param('patientId') patientId: string) {
    return this.clinicalBriefService.getPatientBriefs(req.user.id, patientId);
  }

  @Get(':id')
  async getBriefById(@Request() req: any, @Param('id') id: string) {
    return this.clinicalBriefService.getBriefById(req.user.id, id);
  }
}
