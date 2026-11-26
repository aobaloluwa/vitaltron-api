import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(WomensHealthService.name);

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
          isOnboarded: false,
          declaredSex: null,
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
        ...(dto.isOnboarded !== undefined && { isOnboarded: dto.isOnboarded }),
        ...(dto.declaredSex !== undefined && { declaredSex: dto.declaredSex }),
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
      details: { activeMode: updated.activeMode, declaredSex: updated.declaredSex },
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

    // Recent activity timeline & symptom logs from past 14 days
    const recentLogs = await this.prisma.dailyCycleLog.findMany({
      where: { patientId: userId },
      orderBy: { date: 'desc' },
      take: 14,
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const todayLog =
      recentLogs.find((l) => {
        const dStr = new Date(l.date).toISOString().split('T')[0];
        return dStr === todayStr;
      }) || null;

    const symptomInsights = this.generateSymptomInsights(
      todayLog,
      recentLogs,
      cycleMetrics?.phaseDisplayName || 'Menstrual Cycle',
      profile.activeMode,
    );

    const fertilityInsights = this.generateFertilityInsights(
      todayLog,
      cycleMetrics,
    );

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
      isOnboarded: profile.isOnboarded,
      declaredSex: profile.declaredSex,
      cycleMetrics,
      pregnancyMetrics: pregMetrics,
      menopauseSummary: menopauseProfile,
      todayLog,
      symptomInsights,
      fertilityInsights,
      recentLogs,
      upcomingReminders: reminders,
    };
  }

  private generateFertilityInsights(todayLog: any | null, cycleMetrics: any) {
    const todayLogged = Boolean(
      todayLog &&
        (todayLog.bbt || todayLog.cervicalMucus || todayLog.ovulationTestResult),
    );
    const todayBbt = todayLog?.bbt || null;
    const todayMucus = todayLog?.cervicalMucus || null;
    const todayLhTest = todayLog?.ovulationTestResult || null;

    let fertilityStatus: 'PEAK' | 'HIGH' | 'MODERATE' | 'LOW' | 'POST_OVULATION' =
      'MODERATE';
    let statusDisplayName = 'Moderate Fertility';
    let personalizedTip = '';

    const phase = cycleMetrics?.currentPhase || 'FOLLICULAR';

    if (
      todayLhTest === 'POSITIVE' ||
      todayLhTest === 'PEAK' ||
      todayMucus === 'EGG_WHITE'
    ) {
      fertilityStatus = 'PEAK';
      statusDisplayName = 'Peak Fertility Window';
      personalizedTip =
        '🔥 Peak Fertility Detected! Your Egg-White cervical mucus or Positive LH Surge indicates ovulation is expected within 12–36 hours. Conception probability is at its highest.';
    } else if (todayMucus === 'WATERY' || phase === 'OVULATORY') {
      fertilityStatus = 'HIGH';
      statusDisplayName = 'High Fertility';
      personalizedTip =
        '⚡ High Fertility Window! Watery cervical mucus during your ovulatory phase supports sperm motility. Conception odds are high.';
    } else if (todayBbt && todayBbt >= 36.7 && phase === 'LUTAL') {
      fertilityStatus = 'POST_OVULATION';
      statusDisplayName = 'Post-Ovulation (Progesterone Phase)';
      personalizedTip = `🌡️ Thermal Shift Observed (${todayBbt}°C)! Elevated BBT during your Luteal phase suggests ovulation has occurred and progesterone is active.`;
    } else if (phase === 'MENSTRUAL') {
      fertilityStatus = 'LOW';
      statusDisplayName = 'Low Fertility (Menstrual Phase)';
      personalizedTip =
        '🩸 Menstrual Phase: Conception probability is low. Continue tracking morning BBT before rising for baseline accuracy.';
    } else {
      fertilityStatus = 'MODERATE';
      statusDisplayName = 'Approaching Fertile Window';
      personalizedTip = todayLogged
        ? `Observations logged today: ${todayBbt ? `BBT ${todayBbt}°C` : ''} ${todayMucus ? `Mucus: ${todayMucus}` : ''}. Keep tracking daily to confirm your LH surge.`
        : '📊 Log your morning Basal Body Temperature (°C) and cervical mucus above to unlock your personalized real-time fertility analysis.';
    }

    return {
      todayLogged,
      todayBbt,
      todayMucus,
      todayLhTest,
      fertilityStatus,
      statusDisplayName,
      personalizedTip,
    };
  }

  private generateSymptomInsights(
    todayLog: any | null,
    recentLogs: any[],
    phaseName: string,
    activeMode: string,
  ) {
    const todayLogged = Boolean(todayLog);
    const todayMood = todayLog?.mood || null;

    let todaySymptoms: string[] = [];
    if (todayLog?.symptoms && typeof todayLog.symptoms === 'object') {
      todaySymptoms = Object.keys(todayLog.symptoms);
    }

    const symptomCounts: Record<string, number> = {};
    for (const log of recentLogs) {
      if (log.symptoms && typeof log.symptoms === 'object') {
        for (const symKey of Object.keys(log.symptoms)) {
          symptomCounts[symKey] = (symptomCounts[symKey] || 0) + 1;
        }
      }
    }

    const topRecentSymptoms = Object.entries(symptomCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    let personalizedTip = '';

    if (todaySymptoms.length > 0) {
      const symList = todaySymptoms.join(', ');
      if (todaySymptoms.includes('Cramps') || todaySymptoms.includes('Pelvic Pain')) {
        personalizedTip = `You've logged ${symList} during your ${phaseName}. Applying a warm heat pad, staying hydrated, and gentle pelvic stretches can help relieve uterine contractions.`;
      } else if (todaySymptoms.includes('Headache') || todaySymptoms.includes('Bloating')) {
        personalizedTip = `You logged ${symList} today. Hydrating with electrolytes and reducing sodium intake can help alleviate fluid retention and tension.`;
      } else if (todaySymptoms.includes('Fatigue') || todaySymptoms.includes('Back Pain')) {
        personalizedTip = `Logging ${symList} today indicates higher physiological strain during your ${phaseName}. Prioritize 7-8 hours of sleep and gentle relaxation.`;
      } else {
        personalizedTip = `Logged symptoms today: ${symList}. Tracked consistently, these entries help your clinician tailor personalized care for your ${phaseName}.`;
      }
    } else if (todayMood) {
      personalizedTip = `Today's Mood: ${todayMood}. Mood fluctuations naturally correlate with shifting estrogen and progesterone levels across your ${phaseName}.`;
    } else {
      personalizedTip = `No symptoms logged today. Logging daily symptoms and mood helps predict cycle patterns, PMS trends, and ovulation signals.`;
    }

    return {
      todayLogged,
      todayMood,
      todaySymptoms,
      todayNotes: todayLog?.notes || null,
      topRecentSymptoms,
      personalizedTip,
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
    try {
      const startDate = new Date(dto.startDate);
      if (isNaN(startDate.getTime())) {
        throw new BadRequestException('Invalid start date string format');
      }

      const endDate = dto.endDate && dto.endDate.trim() ? new Date(dto.endDate) : null;
      if (endDate && isNaN(endDate.getTime())) {
        throw new BadRequestException('Invalid end date string format');
      }

      let periodDuration = 5;
      if (endDate) {
        const diffMs = endDate.getTime() - startDate.getTime();
        periodDuration = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
      }

      // Ensure user profile exists before attaching cycle
      await this.getProfile(userId);

      // Create cycle record
      const cycle = await this.prisma.menstrualCycle.create({
        data: {
          patientId: userId,
          startDate,
          endDate,
          periodDuration,
          notes: dto.notes || null,
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
          notes: dto.notes || null,
        },
      });

      // Update profile last period start date
      try {
        await this.updateProfile(userId, { lastPeriodStart: dto.startDate });
      } catch (err) {
        this.logger.warn(`Could not update lastPeriodStart for user ${userId}`, err);
      }

      return { cycle, periodRecord };
    } catch (error: any) {
      this.logger.error(`Failed to create period entry for user ${userId}:`, error);
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error?.message || 'Failed to save period record');
    }
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
    const pregnancyInsights = this.generatePregnancyInsights(metrics.gestationalAgeWeeks, metrics.currentTrimester);

    return {
      profile,
      metrics,
      pregnancyInsights,
    };
  }

  private generatePregnancyInsights(weeks: number, trimester: number) {
    if (trimester === 1) {
      return {
        gestationalWeek: weeks,
        currentTrimester: 1,
        trimesterName: 'First Trimester',
        keyCareAdvice:
          'First Trimester Focus: Folic acid supplementation (400–800 mcg/day) is vital for early neural tube formation. Eat small, frequent meals to soothe morning nausea and stay well hydrated.',
        recommendedActions: [
          'Schedule initial prenatal consultation & dating ultrasound',
          'Take daily prenatal vitamins with Folic Acid & Iron',
          'Avoid raw seafood, unpasteurized dairy, and alcohol',
        ],
        safetyFlags: [
          'Contact your OB-GYN immediately if you experience heavy vaginal bleeding or severe one-sided abdominal pain.',
        ],
      };
    } else if (trimester === 2) {
      return {
        gestationalWeek: weeks,
        currentTrimester: 2,
        trimesterName: 'Second Trimester',
        keyCareAdvice:
          'Second Trimester Focus: Energy levels typically rebound! Start noting baby flutters (quickening) between weeks 18–22 and prepare for your mid-pregnancy anatomy scan.',
        recommendedActions: [
          'Schedule Mid-Pregnancy Anatomy Scan (Weeks 18–22)',
          'Practice gentle pelvic floor (Kegel) and prenatal stretching',
          'Sleep on your side with a pillow between your knees for joint support',
        ],
        safetyFlags: [
          'Report severe persistent headaches, blurred vision, or sudden hand/facial swelling to your healthcare provider.',
        ],
      };
    } else {
      return {
        gestationalWeek: weeks,
        currentTrimester: 3,
        trimesterName: 'Third Trimester',
        keyCareAdvice:
          "Third Trimester Focus: Rapid fetal growth & lung maturation! Perform daily Kick Counts during baby's active window (aim for 10 movements in 2 hours) and track Braxton Hicks vs real labor contractions.",
        recommendedActions: [
          'Perform daily fetal kick counts during peak activity times',
          'Pack hospital bag, prepare car seat & outline birth preferences',
          'Practice 5-1-1 contraction timing rule (5 mins apart, 1 min long, for 1 hour)',
        ],
        safetyFlags: [
          'Alert your labor ward immediately if you notice significantly reduced fetal movement, fluid leakage, or regular painful contractions.',
        ],
      };
    }
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
    let pregProfile = await this.prisma.pregnancyProfile.findUnique({
      where: { patientId: userId },
    });

    if (!pregProfile) {
      pregProfile = await this.prisma.pregnancyProfile.create({
        data: {
          patientId: userId,
          lmpDate: new Date(),
        },
      });
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
    let pregProfile = await this.prisma.pregnancyProfile.findUnique({
      where: { patientId: userId },
    });

    if (!pregProfile) {
      pregProfile = await this.prisma.pregnancyProfile.create({
        data: {
          patientId: userId,
          lmpDate: new Date(),
        },
      });
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
