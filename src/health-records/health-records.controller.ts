import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { HealthRecordsService } from './health-records.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { CreateHealthRecordDto } from './dto/create-health-record.dto';
import { UpdateHealthRecordDto } from './dto/update-health-record.dto';
import { QueryTimelineDto } from './dto/query-timeline.dto';
import { VerificationStatus } from '../../generated/prisma/enums';

@Controller('health-records')
@UseGuards(JwtAuthGuard)
export class HealthRecordsController {
  constructor(private readonly healthRecordsService: HealthRecordsService) {}

  @Post()
  async createRecord(@Request() req: any, @Body() dto: CreateHealthRecordDto) {
    return this.healthRecordsService.createRecord(req.user.id, dto);
  }

  @Get('timeline')
  async getTimeline(@Request() req: any, @Query() query: QueryTimelineDto) {
    return this.healthRecordsService.getTimeline(req.user.id, query);
  }

  @Get(':id')
  async getRecordById(@Request() req: any, @Param('id') id: string) {
    return this.healthRecordsService.getRecordById(req.user.id, id);
  }

  @Patch(':id')
  async updateRecord(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateHealthRecordDto) {
    return this.healthRecordsService.updateRecord(req.user.id, id, dto);
  }

  @Post(':id/verify')
  async verifyRecord(
    @Request() req: any,
    @Param('id') id: string,
    @Body('status') status: VerificationStatus,
  ) {
    return this.healthRecordsService.verifyRecord(req.user.id, id, status);
  }

  @Delete(':id')
  async deleteRecord(@Request() req: any, @Param('id') id: string) {
    return this.healthRecordsService.deleteRecord(req.user.id, id);
  }
}
