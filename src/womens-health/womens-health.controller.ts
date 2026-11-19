import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WomensHealthService } from './womens-health.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import {
  UpdateProfileDto,
  CreatePeriodDto,
  LogDailyCycleDto,
  CreatePregnancyProfileDto,
  LogKickSessionDto,
  LogContractionSessionDto,
  CreateJournalDto,
  CreatePostpartumDto,
  LogBreastfeedingDto,
  LogMenopauseSymptomDto,
  CreateContraceptionDto,
  LogSexualHealthDto,
  LogStiScreeningDto,
  CreateReminderDto,
} from './dto/womens-health.dto';
import { ArticleCategory } from '../../generated/prisma/enums';

@Controller('womens-health')
@UseGuards(JwtAuthGuard)
export class WomensHealthController {
  constructor(private readonly womensHealthService: WomensHealthService) {}

  @Get('profile')
  async getProfile(@Request() req: any) {
    return this.womensHealthService.getProfile(req.user.id);
  }

  @Patch('profile')
  async updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
    return this.womensHealthService.updateProfile(req.user.id, dto);
  }

  @Get('dashboard')
  async getDashboard(@Request() req: any) {
    return this.womensHealthService.getDashboard(req.user.id);
  }

  @Get('cycles')
  async getCycles(@Request() req: any) {
    return this.womensHealthService.getCycles(req.user.id);
  }

  @Post('periods')
  async createPeriod(@Request() req: any, @Body() dto: CreatePeriodDto) {
    return this.womensHealthService.createPeriod(req.user.id, dto);
  }

  @Get('calendar')
  async getCalendar(@Request() req: any, @Query('yearMonth') yearMonth?: string) {
    return this.womensHealthService.getCalendar(req.user.id, yearMonth);
  }

  @Post('daily-log')
  async logDailyCycle(@Request() req: any, @Body() dto: LogDailyCycleDto) {
    return this.womensHealthService.logDailyCycle(req.user.id, dto);
  }

  @Get('daily-logs')
  async getDailyLogs(@Request() req: any) {
    return this.womensHealthService.getDailyLogs(req.user.id);
  }

  @Get('pregnancy')
  async getPregnancyProfile(@Request() req: any) {
    return this.womensHealthService.getPregnancyProfile(req.user.id);
  }

  @Post('pregnancy')
  async createPregnancyProfile(@Request() req: any, @Body() dto: CreatePregnancyProfileDto) {
    return this.womensHealthService.createPregnancyProfile(req.user.id, dto);
  }

  @Post('pregnancy/kick-sessions')
  async logKickSession(@Request() req: any, @Body() dto: LogKickSessionDto) {
    return this.womensHealthService.logKickSession(req.user.id, dto);
  }

  @Post('pregnancy/contraction-sessions')
  async logContractionSession(@Request() req: any, @Body() dto: LogContractionSessionDto) {
    return this.womensHealthService.logContractionSession(req.user.id, dto);
  }

  @Post('pregnancy/journals')
  async createPregnancyJournal(@Request() req: any, @Body() dto: CreateJournalDto) {
    return this.womensHealthService.createPregnancyJournal(req.user.id, dto);
  }

  @Get('pregnancy/journals')
  async getPregnancyJournals(@Request() req: any) {
    return this.womensHealthService.getPregnancyJournals(req.user.id);
  }

  @Get('postpartum')
  async getPostpartum(@Request() req: any) {
    return this.womensHealthService.getPostpartum(req.user.id);
  }

  @Post('postpartum')
  async createPostpartum(@Request() req: any, @Body() dto: CreatePostpartumDto) {
    return this.womensHealthService.createPostpartum(req.user.id, dto);
  }

  @Post('postpartum/breastfeeding')
  async logBreastfeeding(@Request() req: any, @Body() dto: LogBreastfeedingDto) {
    return this.womensHealthService.logBreastfeeding(req.user.id, dto);
  }

  @Get('menopause')
  async getMenopause(@Request() req: any) {
    return this.womensHealthService.getMenopause(req.user.id);
  }

  @Post('menopause/symptoms')
  async logMenopauseSymptom(@Request() req: any, @Body() dto: LogMenopauseSymptomDto) {
    return this.womensHealthService.logMenopauseSymptom(req.user.id, dto);
  }

  @Get('contraception')
  async getContraception(@Request() req: any) {
    return this.womensHealthService.getContraception(req.user.id);
  }

  @Post('contraception')
  async updateContraception(@Request() req: any, @Body() dto: CreateContraceptionDto) {
    return this.womensHealthService.updateContraception(req.user.id, dto);
  }

  @Get('sexual-health')
  async getSexualHealthRecords(@Request() req: any) {
    return this.womensHealthService.getSexualHealthRecords(req.user.id);
  }

  @Post('sexual-health')
  async logSexualHealth(@Request() req: any, @Body() dto: LogSexualHealthDto) {
    return this.womensHealthService.logSexualHealth(req.user.id, dto);
  }

  @Post('sexual-health/screenings')
  async logStiScreening(@Request() req: any, @Body() dto: LogStiScreeningDto) {
    return this.womensHealthService.logStiScreening(req.user.id, dto);
  }

  @Get('education')
  async getArticles(@Query('category') category?: ArticleCategory, @Query('q') q?: string) {
    return this.womensHealthService.getArticles(category, q);
  }

  @Get('reminders')
  async getReminders(@Request() req: any) {
    return this.womensHealthService.getReminders(req.user.id);
  }

  @Post('reminders')
  async createReminder(@Request() req: any, @Body() dto: CreateReminderDto) {
    return this.womensHealthService.createReminder(req.user.id, dto);
  }

  @Delete('reminders/:id')
  async deleteReminder(@Request() req: any, @Param('id') id: string) {
    return this.womensHealthService.deleteReminder(req.user.id, id);
  }

  @Post('assistant/ask')
  async askAiAssistant(@Request() req: any, @Body('question') question: string) {
    return this.womensHealthService.askAiAssistant(req.user.id, question);
  }
}
