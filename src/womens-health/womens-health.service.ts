import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CycleCalculatorService } from './services/cycle-calculator.service';
import { PregnancyCalculatorService } from './services/pregnancy-calculator.service';
import { WomensHealthAiService } from './services/womens-health-ai.service';
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
  GenerateReportDto,
} from './dto/womens-health.dto';
import { TrackingMode, ArticleCategory } from '../../generated/prisma/enums';

@Injectable()
export class WomensHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cycleCalculator: CycleCalculatorService,
    private readonly pregnancyCalculator: PregnancyCalculatorService,
    private readonly aiService: WomensHealthAiService,
  ) {}

  // ==========================================
  // PROFILE & DASHBOARD
  // ==========================================

  async getProfile(userId: string) {
    let profile = await this.prisma.womensHealthProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      profile = await this.prisma.womensHealthProfile.create({
        data: {
          userId,
          activeMode: TrackingMode.MENSTRUAL,
          averageCycleLength: 28,
          averagePeriodDuration: 5,
        },
      });
    }

    return profile;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const profile = await this.getProfile(userId);

    const updated = await this.prisma.womensHealthProfile.update({
      where: { id: profile.id },
      data: {
        ...(dto.activeMode && { activeMode: dto.activeMode }),
        ...(dto.averageCycleLength && { averageCycleLength: dto.averageCycleLength }),
        ...(dto.averagePeriodDuration && { averagePeriodDuration: dto.averagePeriodDuration }),
        ...(dto.lastPeriodStart && { lastPeriodStart: new Date(dto.lastPeriodStart) }),
        ...(dto.estimatedDueDate && { estimatedDueDate: new Date(dto.estimatedDueDate) }),
        ...(dto.isHighPrivacy !== undefined && { isHighPrivacy: dto.isHighPrivacy }),
      },
    });

    await this.auditService.log({
      action: 'UPDATE_WOMENS_HEALTH_PROFILE',
      actorUserId: userId,
      targetPatientId: userId,
      details: { activeMode: updated.activeMode },
    });

    return updated;
  }

  async getDashboard(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, email: true },
    });

    const profile = await this.getProfile(userId);

    // Historical cycles for calculations
    const historicalCycles = await this.prisma.menstrualCycle.findMany({
      where: { patientId: userId },
      orderBy: { startDate: 'desc' },
      take: 12,
    });

    const cycleMetrics = this.cycleCalculator.calculateCycleMetrics(
      profile.lastPeriodStart,
      historicalCycles,
      profile.averageCycleLength,
      profile.averagePeriodDuration,
    );

    // Pregnancy profile
    const pregProfile = await this.prisma.pregnancyProfile.findUnique({
      where: { patientId: userId },
    });

    const pregMetrics = pregProfile
      ? this.pregnancyCalculator.calculatePregnancyMetrics(pregProfile.lmpDate, pregProfile.confirmedDueDate)
      : null;

    // Menopause profile
    const menopauseProfile = await this.prisma.menopauseProfile.findUnique({
      where: { patientId: userId },
      include: {
        symptoms: {
          orderBy: { date: 'desc' },
          take: 5,
        },
      },
    });

    // Recent activity timeline
    const recentLogs = await this.prisma.dailyCycleLog.findMany({
      where: { patientId: userId },
      orderBy: { date: 'desc' },
      take: 5,
    });

    // Reminders
    const reminders = await this.prisma.womensHealthReminder.findMany({
      where: { userId, isEnabled: true },
      take: 5,
    });

    return {
      user: {
        name: user?.displayName || user?.email?.split('@')[0] || 'Friend',
      },
      activeMode: profile.activeMode,
      cycleMetrics,
      pregnancyMetrics: pregMetrics,
      menopauseSummary: menopauseProfile,
      recentLogs,
      upcomingReminders: reminders,
    };
  }

  // ==========================================
  // MENSTRUAL CYCLES & PERIODS
  // ==========================================

  async getCycles(userId: string) {
    return this.prisma.menstrualCycle.findMany({
      where: { patientId: userId },
      orderBy: { startDate: 'desc' },
      include: { periodRecords: true },
    });
  }

  async createPeriod(userId: string, dto: CreatePeriodDto) {
    const startDate = new Date(dto.startDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : null;

    let periodDuration = 5;
    if (endDate) {
      const diffMs = endDate.getTime() - startDate.getTime();
      periodDuration = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
    }

    // Create cycle record
    const cycle = await this.prisma.menstrualCycle.create({
      data: {
        patientId: userId,
        startDate,
        endDate,
        periodDuration,
        notes: dto.notes,
      },
    });

    // Create initial period record
    const periodRecord = await this.prisma.periodRecord.create({
      data: {
        cycleId: cycle.id,
        patientId: userId,
        date: startDate,
        flow: dto.flow || 'MEDIUM',
        isSpotting: dto.isSpotting || false,
        notes: dto.notes,
      },
    });

    // Update profile last period start date
    await this.updateProfile(userId, { lastPeriodStart: dto.startDate });

    return { cycle, periodRecord };
  }

  async getCalendar(userId: string, yearMonth?: string) {
    const logs = await this.prisma.dailyCycleLog.findMany({
      where: { patientId: userId },
      orderBy: { date: 'desc' },
    });

    const periodRecords = await this.prisma.periodRecord.findMany({
      where: { patientId: userId },
      orderBy: { date: 'desc' },
    });

    const profile = await this.getProfile(userId);
    const historicalCycles = await this.prisma.menstrualCycle.findMany({
      where: { patientId: userId },
      orderBy: { startDate: 'desc' },
    });

    const metrics = this.cycleCalculator.calculateCycleMetrics(
      profile.lastPeriodStart,
      historicalCycles,
      profile.averageCycleLength,
      profile.averagePeriodDuration,
    );

    return {
      dailyLogs: logs,
      periodRecords,
      predictions: metrics,
    };
  }

  // ==========================================
  // DAILY CYCLE LOGS & SYMPTOMS
  // ==========================================

  async logDailyCycle(userId: string, dto: LogDailyCycleDto) {
    const logDate = new Date(dto.date);
    logDate.setHours(0, 0, 0, 0);

    const log = await this.prisma.dailyCycleLog.upsert({
      where: {
        patientId_date: {
          patientId: userId,
          date: logDate,
        },
      },
      update: {
        ...(dto.symptoms && { symptoms: dto.symptoms }),
        ...(dto.mood && { mood: dto.mood }),
        ...(dto.cervicalMucus && { cervicalMucus: dto.cervicalMucus }),
        ...(dto.bbt !== undefined && { bbt: dto.bbt }),
        ...(dto.sexualActivity !== undefined && { sexualActivity: dto.sexualActivity }),
        ...(dto.ovulationTestResult && { ovulationTestResult: dto.ovulationTestResult }),
        ...(dto.pregnancyTestResult && { pregnancyTestResult: dto.pregnancyTestResult }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      create: {
        patientId: userId,
        date: logDate,
        symptoms: dto.symptoms || {},
        mood: dto.mood,
        cervicalMucus: dto.cervicalMucus,
        bbt: dto.bbt,
        sexualActivity: dto.sexualActivity || false,
        ovulationTestResult: dto.ovulationTestResult,
        pregnancyTestResult: dto.pregnancyTestResult,
        notes: dto.notes,
      },
    });

    return log;
  }

  async getDailyLogs(userId: string) {
    return this.prisma.dailyCycleLog.findMany({
      where: { patientId: userId },
      orderBy: { date: 'desc' },
      take: 60,
    });
  }

  // ==========================================
  // PREGNANCY MODULE
  // ==========================================

  async getPregnancyProfile(userId: string) {
    let profile = await this.prisma.pregnancyProfile.findUnique({
      where: { patientId: userId },
      include: {
        milestones: { orderBy: { milestoneDate: 'asc' } },
        weights: { orderBy: { date: 'desc' }, take: 10 },
        kickSessions: { orderBy: { startTime: 'desc' }, take: 5 },
        contractionSessions: { orderBy: { startTime: 'desc' }, take: 5 },
      },
    });

    if (!profile) {
      profile = await this.prisma.pregnancyProfile.create({
        data: {
          patientId: userId,
          lmpDate: new Date(),
        },
        include: {
          milestones: true,
          weights: true,
          kickSessions: true,
          contractionSessions: true,
        },
      });
    }

    const metrics = this.pregnancyCalculator.calculatePregnancyMetrics(profile.lmpDate, profile.confirmedDueDate);

    return {
      profile,
      metrics,
    };
  }

  async createPregnancyProfile(userId: string, dto: CreatePregnancyProfileDto) {
    const existing = await this.prisma.pregnancyProfile.findUnique({
      where: { patientId: userId },
    });

    const data: any = {
      ...(dto.lmpDate && { lmpDate: new Date(dto.lmpDate) }),
      ...(dto.confirmedDueDate && { confirmedDueDate: new Date(dto.confirmedDueDate) }),
      ...(dto.conceptionDate && { conceptionDate: new Date(dto.conceptionDate) }),
      ...(dto.pregnancyType && { pregnancyType: dto.pregnancyType }),
      ...(dto.babiesCount && { babiesCount: dto.babiesCount }),
      ...(dto.healthcareProvider && { healthcareProvider: dto.healthcareProvider }),
    };

    let profile;
    if (existing) {
      profile = await this.prisma.pregnancyProfile.update({
        where: { id: existing.id },
        data,
      });
    } else {
      profile = await this.prisma.pregnancyProfile.create({
        data: {
          patientId: userId,
          ...data,
        },
      });
    }

    // Update main tracking mode to PREGNANCY
    await this.updateProfile(userId, { activeMode: TrackingMode.PREGNANCY });

    return profile;
  }

  async logKickSession(userId: string, dto: LogKickSessionDto) {
    const pregProfile = await this.prisma.pregnancyProfile.findUnique({
      where: { patientId: userId },
    });

    if (!pregProfile) {
      throw new BadRequestException('Pregnancy profile must be initialized before logging kick sessions.');
    }

    return this.prisma.kickSession.create({
      data: {
        pregnancyId: pregProfile.id,
        startTime: new Date(dto.startTime),
        endTime: dto.endTime ? new Date(dto.endTime) : new Date(),
        kickCount: dto.kickCount,
        notes: dto.notes,
      },
    });
  }

  async logContractionSession(userId: string, dto: LogContractionSessionDto) {
    const pregProfile = await this.prisma.pregnancyProfile.findUnique({
      where: { patientId: userId },
    });

    if (!pregProfile) {
      throw new BadRequestException('Pregnancy profile must be initialized before logging contractions.');
    }

    return this.prisma.contractionSession.create({
      data: {
        pregnancyId: pregProfile.id,
        startTime: new Date(dto.startTime),
        endTime: dto.endTime ? new Date(dto.endTime) : new Date(),
        durationSeconds: dto.durationSeconds,
        intervalMinutes: dto.intervalMinutes,
        severity: dto.severity,
        notes: dto.notes,
      },
    });
  }

  async createPregnancyJournal(userId: string, dto: CreateJournalDto) {
    const pregProfile = await this.prisma.pregnancyProfile.findUnique({
      where: { patientId: userId },
    });

    if (!pregProfile) {
      throw new BadRequestException('Pregnancy profile required.');
    }

    return this.prisma.pregnancyJournal.create({
      data: {
        pregnancyId: pregProfile.id,
        title: dto.title,
        content: dto.content,
        weekNumber: dto.weekNumber,
        mood: dto.mood,
        photoUrl: dto.photoUrl,
        isMemory: dto.isMemory || false,
      },
    });
  }

  async getPregnancyJournals(userId: string) {
    const pregProfile = await this.prisma.pregnancyProfile.findUnique({
      where: { patientId: userId },
    });

    if (!pregProfile) return [];

    return this.prisma.pregnancyJournal.findMany({
      where: { pregnancyId: pregProfile.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==========================================
  // POSTPARTUM MODULE
  // ==========================================

  async getPostpartum(userId: string) {
    let profile = await this.prisma.postpartumProfile.findUnique({
      where: { patientId: userId },
      include: {
        breastfeedings: { orderBy: { startTime: 'desc' }, take: 15 },
      },
    });

    return profile;
  }

  async createPostpartum(userId: string, dto: CreatePostpartumDto) {
    const profile = await this.prisma.postpartumProfile.upsert({
      where: { patientId: userId },
      update: {
        deliveryDate: new Date(dto.deliveryDate),
        ...(dto.deliveryType && { deliveryType: dto.deliveryType }),
        ...(dto.recoveryNotes && { recoveryNotes: dto.recoveryNotes }),
        ...(dto.moodRating && { moodRating: dto.moodRating }),
        ...(dto.lochiaStatus && { lochiaStatus: dto.lochiaStatus }),
      },
      create: {
        patientId: userId,
        deliveryDate: new Date(dto.deliveryDate),
        deliveryType: dto.deliveryType || 'VAGINAL',
        recoveryNotes: dto.recoveryNotes,
        moodRating: dto.moodRating,
        lochiaStatus: dto.lochiaStatus,
      },
    });

    await this.updateProfile(userId, { activeMode: TrackingMode.POSTPARTUM });

    return profile;
  }

  async logBreastfeeding(userId: string, dto: LogBreastfeedingDto) {
    let profile = await this.prisma.postpartumProfile.findUnique({
      where: { patientId: userId },
    });

    if (!profile) {
      profile = await this.prisma.postpartumProfile.create({
        data: {
          patientId: userId,
          deliveryDate: new Date(),
        },
      });
    }

    return this.prisma.breastfeedingRecord.create({
      data: {
        postpartumId: profile.id,
        startTime: new Date(dto.startTime),
        breastSide: dto.breastSide,
        durationMinutes: dto.durationMinutes,
        expressedAmountMl: dto.expressedAmountMl,
        notes: dto.notes,
      },
    });
  }

  // ==========================================
  // MENOPAUSE MODULE
  // ==========================================

  async getMenopause(userId: string) {
    let profile = await this.prisma.menopauseProfile.findUnique({
      where: { patientId: userId },
      include: {
        symptoms: { orderBy: { date: 'desc' }, take: 30 },
      },
    });

    return profile;
  }

  async logMenopauseSymptom(userId: string, dto: LogMenopauseSymptomDto) {
    let profile = await this.prisma.menopauseProfile.findUnique({
      where: { patientId: userId },
    });

    if (!profile) {
      profile = await this.prisma.menopauseProfile.create({
        data: {
          patientId: userId,
          stage: 'PERIMENOPAUSE',
        },
      });
    }

    return this.prisma.menopauseSymptomLog.create({
      data: {
        menopauseId: profile.id,
        date: new Date(dto.date),
        hotFlashSeverity: dto.hotFlashSeverity,
        nightSweats: dto.nightSweats || false,
        sleepQuality: dto.sleepQuality,
        brainFogRating: dto.brainFogRating,
        moodChanges: dto.moodChanges,
        triggers: dto.triggers,
        notes: dto.notes,
      },
    });
  }

  // ==========================================
  // CONTRACEPTION MODULE
  // ==========================================

  async getContraception(userId: string) {
    return this.prisma.contraceptionProfile.findUnique({
      where: { patientId: userId },
    });
  }

  async updateContraception(userId: string, dto: CreateContraceptionDto) {
    return this.prisma.contraceptionProfile.upsert({
      where: { patientId: userId },
      update: {
        type: dto.type,
        brandName: dto.brandName,
        startDate: new Date(dto.startDate),
        ...(dto.replacementDate && { replacementDate: new Date(dto.replacementDate) }),
        ...(dto.reminderTime && { reminderTime: dto.reminderTime }),
        ...(dto.notes && { notes: dto.notes }),
      },
      create: {
        patientId: userId,
        type: dto.type,
        brandName: dto.brandName,
        startDate: new Date(dto.startDate),
        replacementDate: dto.replacementDate ? new Date(dto.replacementDate) : null,
        reminderTime: dto.reminderTime,
        notes: dto.notes,
      },
    });
  }

  // ==========================================
  // SEXUAL & REPRODUCTIVE HEALTH
  // ==========================================

  async getSexualHealthRecords(userId: string) {
    const logs = await this.prisma.sexualHealthRecord.findMany({
      where: { patientId: userId },
      orderBy: { date: 'desc' },
      take: 30,
    });

    const screenings = await this.prisma.stiScreeningRecord.findMany({
      where: { patientId: userId },
      orderBy: { testDate: 'desc' },
    });

    return { logs, screenings };
  }

  async logSexualHealth(userId: string, dto: LogSexualHealthDto) {
    return this.prisma.sexualHealthRecord.create({
      data: {
        patientId: userId,
        date: new Date(dto.date),
        activityType: dto.activityType,
        protectionUsed: dto.protectionUsed !== undefined ? dto.protectionUsed : true,
        notes: dto.notes,
      },
    });
  }

  async logStiScreening(userId: string, dto: LogStiScreeningDto) {
    return this.prisma.stiScreeningRecord.create({
      data: {
        patientId: userId,
        testDate: new Date(dto.testDate),
        testType: dto.testType,
        result: dto.result,
        provider: dto.provider,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
        notes: dto.notes,
      },
    });
  }

  // ==========================================
  // EDUCATION & ARTICLES
  // ==========================================

  async getArticles(category?: ArticleCategory, query?: string) {
    const where: any = { isPublished: true };
    if (category) where.category = category;
    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { summary: { contains: query, mode: 'insensitive' } },
      ];
    }

    const articles = await this.prisma.womensHealthArticle.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (articles.length === 0) {
      // Return default seed articles if DB is fresh
      return [
        {
          id: 'art-1',
          slug: 'understanding-your-menstrual-cycle-phases',
          title: 'Understanding Your Menstrual Cycle: The 4 Phases',
          summary: 'Learn how estrogen and progesterone fluctuations affect your energy, mood, and health throughout the month.',
          category: 'MENSTRUATION',
          readTimeMinutes: 5,
          authorName: 'Dr. Sarah Jenkins, MD',
          reviewerName: 'Dr. Elena Rostova',
          reviewerTitle: 'Board Certified OB/GYN',
          lastReviewedAt: new Date().toISOString(),
          isPublished: true,
          tags: ['Cycle', 'Hormones', 'Wellness'],
        },
        {
          id: 'art-2',
          slug: 'tracking-basal-body-temperature-fertility',
          title: 'Tracking Basal Body Temperature for Conception Planning',
          summary: 'How daily morning temperature readings help pinpoint ovulation and fertile windows accurately.',
          category: 'OVULATION_FERTILITY',
          readTimeMinutes: 6,
          authorName: 'Dr. Maya Lin, OB/GYN',
          reviewerName: 'Dr. Elena Rostova',
          reviewerTitle: 'Board Certified OB/GYN',
          lastReviewedAt: new Date().toISOString(),
          isPublished: true,
          tags: ['Fertility', 'Ovulation', 'BBT'],
        },
        {
          id: 'art-3',
          slug: 'second-trimester-nutrition-and-wellness',
          title: 'Essential Nutrition Guide for the Second Trimester',
          summary: 'Key vitamins, minerals, and hydration guidelines for growing babies and maternal strength.',
          category: 'PREGNANCY',
          readTimeMinutes: 7,
          authorName: 'Rachel Vance, RD',
          reviewerName: 'Dr. Elena Rostova',
          reviewerTitle: 'Board Certified OB/GYN',
          lastReviewedAt: new Date().toISOString(),
          isPublished: true,
          tags: ['Pregnancy', 'Nutrition', 'Trimester 2'],
        },
      ];
    }

    return articles;
  }

  // ==========================================
  // REMINDERS & NOTIFICATIONS
  // ==========================================

  async getReminders(userId: string) {
    return this.prisma.womensHealthReminder.findMany({
      where: { userId },
      orderBy: { reminderTime: 'asc' },
    });
  }

  async createReminder(userId: string, dto: CreateReminderDto) {
    return this.prisma.womensHealthReminder.create({
      data: {
        userId,
        title: dto.title,
        category: dto.category,
        reminderTime: dto.reminderTime,
        frequency: dto.frequency || 'DAILY',
        isEnabled: dto.isEnabled !== undefined ? dto.isEnabled : true,
        notes: dto.notes,
      },
    });
  }

  async deleteReminder(userId: string, id: string) {
    return this.prisma.womensHealthReminder.delete({
      where: { id },
    });
  }

  // ==========================================
  // AI ASSISTANT CONVERSATION
  // ==========================================

  async askAiAssistant(userId: string, question: string) {
    const profile = await this.getProfile(userId);
    const dashboard = await this.getDashboard(userId);

    const context = {
      trackingMode: profile.activeMode,
      cycleDay: dashboard.cycleMetrics.currentCycleDay,
      gestationalWeek: dashboard.pregnancyMetrics?.gestationalAgeWeeks,
    };

    return this.aiService.askQuestion(question, context);
  }
}
