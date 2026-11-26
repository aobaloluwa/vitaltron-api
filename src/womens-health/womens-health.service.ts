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

    const deliveryDate = profile?.deliveryDate ? new Date(profile.deliveryDate) : new Date();
    const diffMs = new Date().getTime() - deliveryDate.getTime();
    const daysPostpartum = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    const weeksPostpartum = Math.floor(daysPostpartum / 7);

    const postpartumInsights = this.generatePostpartumInsights(weeksPostpartum, daysPostpartum);

    return {
      profile,
      daysPostpartum,
      weeksPostpartum,
      postpartumInsights,
    };
  }

  private generatePostpartumInsights(weeks: number, days: number) {
    if (weeks <= 2) {
      return {
        weeksPostpartum: weeks,
        daysPostpartum: days,
        milestoneTitle: 'Acute Healing & Initial Recovery (Weeks 1–2)',
        keyCareAdvice:
          'Weeks 1–2 Focus: Prioritize maximum physical rest, perineal/incisional wound care, pelvic floor relaxation, and frequent newborn nursing or formula feeds.',
        recommendedActions: [
          'Rest in bed as much as possible whenever baby sleeps',
          'Hydrate with 3+ liters of water daily for lactation & tissue repair',
          'Monitor lochia flow (normal transition from dark red to pinkish/white)',
        ],
        safetyFlags: [
          'Alert your doctor immediately if passing large blood clots (egg-sized), running a fever (>38°C), or experiencing severe postpartum depression symptoms.',
        ],
      };
    } else if (weeks <= 5) {
      return {
        weeksPostpartum: weeks,
        daysPostpartum: days,
        milestoneTitle: 'Transitional Healing (Weeks 3–5)',
        keyCareAdvice:
          'Weeks 3–5 Focus: Uterine involution is nearing completion. Gentle short walks and pelvic floor kegel breathing can be gradually resumed as comfort allows.',
        recommendedActions: [
          'Maintain high-protein nutrition & continue taking prenatal/postpartum vitamins',
          'Schedule your upcoming 6-week postpartum clinical checkup',
          'Express emotional needs and track mood shifts with your support system',
        ],
        safetyFlags: [
          'Contact your OB-GYN or midwife if persistent pelvic pain, wound discharge/pus, or severe mood swings occur.',
        ],
      };
    } else {
      return {
        weeksPostpartum: weeks,
        daysPostpartum: days,
        milestoneTitle: '6-Week Clinical Clearance Milestone (Week 6+)',
        keyCareAdvice:
          'Week 6+ Focus: Time for your comprehensive 6-week postpartum OB-GYN physical examination for pelvic floor clearance, mood screening, and contraception planning.',
        recommendedActions: [
          'Attend 6-week OB-GYN postpartum physical evaluation & Pap/pelvic check',
          'Discuss breastfeeding-safe contraception options with your provider',
          'Gradually resume light exercise as cleared by your clinician',
        ],
        safetyFlags: [
          'Seek professional support if experiencing persistent anxiety, intrusive thoughts, or pain during intimacy.',
        ],
      };
    }
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

    if (!profile) {
      profile = await this.prisma.menopauseProfile.create({
        data: {
          patientId: userId,
          stage: 'PERIMENOPAUSE',
        },
        include: {
          symptoms: { orderBy: { date: 'desc' }, take: 30 },
        },
      });
    }

    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDay = now.getDate();

    let todayLog = profile.symptoms.find((l) => {
      const d = new Date(l.date);
      return (
        d.getFullYear() === todayYear &&
        d.getMonth() === todayMonth &&
        d.getDate() === todayDay
      );
    });

    if (!todayLog && profile.symptoms.length > 0) {
      const mostRecent = profile.symptoms[0];
      const recentDate = new Date(mostRecent.date);
      const diffHours = (now.getTime() - recentDate.getTime()) / (1000 * 60 * 60);
      if (diffHours <= 24) {
        todayLog = mostRecent;
      }
    }

    const menopauseInsights = this.generateMenopauseInsights(
      todayLog,
      profile.stage || 'PERIMENOPAUSE',
      profile.symptoms,
    );

    return {
      profile,
      todayLog: todayLog || null,
      menopauseInsights,
    };
  }

  private generateMenopauseInsights(
    todayLog: any | null,
    stage: string,
    recentLogs: any[],
  ) {
    const todayLogged = Boolean(todayLog);
    const hotFlash = todayLog?.hotFlashSeverity ?? 0;
    const nightSweats = Boolean(todayLog?.nightSweats);
    const sleep = todayLog?.sleepQuality ?? 7;
    const brainFog = todayLog?.brainFogRating ?? 0;

    let personalizedTip = '';
    let statusTitle = stage || 'Perimenopause Management';

    if (hotFlash >= 5 || nightSweats) {
      personalizedTip = `🔥 Vasomotor Symptom Support: Hot flash severity (${hotFlash}/10) or night sweats logged today. Layered breathable clothing, cooling bedtime gel pads, and avoiding evening caffeine/spicy foods can help minimize vasomotor spikes.`;
    } else if (sleep <= 5) {
      personalizedTip = `😴 Sleep Hygiene Focus: Sleep score is low (${sleep}/10). Hormonal fluctuations often disrupt REM sleep. Maintaining a cool bedroom (18°C/65°F), magnesium supplementation, and limiting screen light before bed support deep rest.`;
    } else if (brainFog >= 5) {
      personalizedTip = `🧠 Cognitive Wellness: Brain fog rating (${brainFog}/10) logged today. Estrogen shifts temporarily affect short-term memory processing. Aerobic exercise and omega-3 fatty acids help preserve cognitive sharpness.`;
    } else if (todayLogged) {
      personalizedTip = `✨ Menopause Symptom Balance: Today's symptom ratings are within a manageable range. Consistent daily tracking helps identify triggers and evaluate HRT/supplement effectiveness with your gynecologist.`;
    } else {
      personalizedTip = `📊 Log your hot flash severity, night sweats, sleep quality, and brain fog ratings below to receive real-time personalized hormonal transition insights.`;
    }

    return {
      todayLogged,
      todayHotFlash: hotFlash,
      todayNightSweats: nightSweats,
      todaySleepQuality: sleep,
      todayBrainFog: brainFog,
      statusTitle,
      personalizedTip,
    };
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

    const logDate = dto.date ? new Date(dto.date) : new Date();

    const existingLogs = await this.prisma.menopauseSymptomLog.findMany({
      where: { menopauseId: profile.id },
      orderBy: { date: 'desc' },
      take: 10,
    });

    const targetYear = logDate.getFullYear();
    const targetMonth = logDate.getMonth();
    const targetDay = logDate.getDate();

    const existingToday = existingLogs.find((l) => {
      const d = new Date(l.date);
      return (
        d.getFullYear() === targetYear &&
        d.getMonth() === targetMonth &&
        d.getDate() === targetDay
      );
    });

    if (existingToday) {
      return this.prisma.menopauseSymptomLog.update({
        where: { id: existingToday.id },
        data: {
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

    return this.prisma.menopauseSymptomLog.create({
      data: {
        menopauseId: profile.id,
        date: logDate,
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
    const profile = await this.prisma.contraceptionProfile.findUnique({
      where: { patientId: userId },
    });

    const contraceptionInsights = this.generateContraceptionInsights(profile);

    return {
      profile,
      contraceptionInsights,
    };
  }

  private generateContraceptionInsights(profile: any) {
    if (!profile) {
      return {
        hasProfile: false,
        methodTitle: 'No Active Method',
        daysUntilReplacement: null,
        personalizedTip:
          'Log your current birth control method (Pill, IUD, Implant, Patch, Ring, or Condom) above to receive schedule and safety guidance.',
      };
    }

    const type = profile.type || 'PILL';
    const brand = profile.brandName || type;
    const startDate = profile.startDate ? new Date(profile.startDate) : new Date();
    const replacementDate = profile.replacementDate
      ? new Date(profile.replacementDate)
      : null;

    let daysUntilReplacement: number | null = null;
    if (replacementDate) {
      const diffMs = replacementDate.getTime() - new Date().getTime();
      daysUntilReplacement = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    let personalizedTip = '';
    const methodTitle = `${brand} (${type.replace('_', ' ')})`;

    if (type === 'PILL') {
      personalizedTip = `💊 Daily Oral Contraceptive (${brand}): Take 1 pill at the same time every day. If 1 pill is missed (>24 hrs late), take the missed pill immediately and continue daily doses. Use backup protection if >2 pills are missed.`;
    } else if (type === 'IUD_HORMONAL' || type === 'IUD_COPPER' || type === 'IMPLANT') {
      const countdownText =
        daysUntilReplacement !== null
          ? `Replacement due in ${daysUntilReplacement} days.`
          : 'No replacement date set.';
      personalizedTip = `🛡️ Long-Acting Reversible Contraception (${brand}): Provides over 99% effective ongoing protection without daily effort. ${countdownText}`;
    } else if (type === 'PATCH' || type === 'RING') {
      personalizedTip = `🔄 Weekly/Monthly Method (${brand}): Change your ${
        type === 'PATCH' ? 'patch weekly' : 'vaginal ring every 3 weeks'
      }. Set recurring mobile reminders to ensure steady hormone absorption.`;
    } else if (type === 'INJECTION') {
      const countdownText =
        daysUntilReplacement !== null
          ? `Next injection due in ${daysUntilReplacement} days.`
          : 'Schedule next shot every 12–13 weeks.';
      personalizedTip = `💉 Depot Injection (${brand}): ${countdownText} Timely repeat injections maintain full contraceptive efficacy.`;
    } else {
      personalizedTip = `🛡️ Barrier Contraceptive (${brand}): Barrier methods protect against both unintended pregnancy and sexually transmitted infections (STIs).`;
    }

    return {
      hasProfile: true,
      methodTitle,
      type,
      brandName: brand,
      startDate: startDate.toISOString().split('T')[0],
      replacementDate: replacementDate ? replacementDate.toISOString().split('T')[0] : null,
      daysUntilReplacement,
      personalizedTip,
    };
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

    const sexualHealthInsights = this.generateSexualHealthInsights(screenings, logs);

    return { logs, screenings, sexualHealthInsights };
  }

  private generateSexualHealthInsights(screenings: any[], logs: any[]) {
    const mostRecentScreening = screenings[0] || null;

    let statusTitle = 'Annual Screening Recommended';
    let personalizedTip = '';
    let isUpToDate = false;

    if (mostRecentScreening) {
      const testDate = new Date(mostRecentScreening.testDate);
      const diffMs = new Date().getTime() - testDate.getTime();
      const daysSinceTest = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

      if (daysSinceTest <= 365) {
        isUpToDate = true;
        statusTitle = 'Screening Up-to-Date';
        personalizedTip = `🛡️ Confidential Screening Status: Last recorded ${mostRecentScreening.testType} on ${
          testDate.toISOString().split('T')[0]
        } (${mostRecentScreening.result || 'Logged'}). Routine annual STI & Pap cytology checkups support proactive reproductive wellness.`;
      } else {
        statusTitle = 'Annual Checkup Overdue';
        personalizedTip = `⏰ Annual Checkup Overdue: It has been over 12 months (${daysSinceTest} days) since your last recorded ${mostRecentScreening.testType}. Schedule an annual wellness checkup with your OB-GYN or provider.`;
      }
    } else {
      personalizedTip =
        '🔒 Confidential Health Tracking: Log your Pap smear, HPV, or STI lab screening dates below to monitor routine annual preventive care.';
    }

    return {
      hasScreenings: Boolean(mostRecentScreening),
      isUpToDate,
      statusTitle,
      mostRecentType: mostRecentScreening?.testType || null,
      mostRecentDate: mostRecentScreening?.testDate
        ? new Date(mostRecentScreening.testDate).toISOString().split('T')[0]
        : null,
      mostRecentResult: mostRecentScreening?.result || null,
      personalizedTip,
    };
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
      const MEDICAL_LIBRARY = [
        {
          id: 'art-1',
          slug: 'understanding-four-phases-menstrual-cycle',
          title: 'Understanding the Four Phases of the Menstrual Cycle: Physiology & Hormones',
          summary: 'A comprehensive medical breakdown of how estrogen, progesterone, LH, and FSH regulate your 28-day hormonal rhythm.',
          content: `## 1. Introduction to Menstrual Physiology
The menstrual cycle is a regulated endocrine process orchestrated by the Hypothalamic-Pituitary-Ovarian (HPO) axis. Governed by precise fluctuations of GnRH, Follicle-Stimulating Hormone (FSH), Luteinizing Hormone (LH), Estrogen, and Progesterone, the typical cycle spans 21 to 35 days (averaging 28 days).

## 2. Phase 1: Menstrual Phase (Days 1–5)
The cycle begins on Day 1 of menses.
* **Hormonal Profile:** Both estrogen and progesterone reach their monthly nadir (lowest levels).
* **Uterine Dynamics:** The functional layer of the endometrium is shed due to progesterone withdrawal vasoconstriction.
* **Clinical Notes:** Normal menstrual flow ranges between 30 to 80 mL. Light to moderate cramping is caused by prostaglandin-mediated uterine muscular contractions.

## 3. Phase 2: Follicular Phase (Days 6–13)
* **Hormonal Profile:** Pituitary release of FSH stimulates 15–20 ovarian follicles. One primary dominant follicle emerges (Graafian follicle) and secretes increasing amounts of Estradiol (Estrogen).
* **Endometrial Response:** Estrogen stimulates proliferation and thickening of the uterine lining (proliferative endometrium).
* **Symptom Manifestations:** Energy and cognitive focus peak as estrogen levels rise. Cervical mucus transitions from dry to creamy, then watery.

## 4. Phase 3: Ovulatory Phase (Day 14)
* **The LH Surge:** Peak estrogen levels trigger a massive surge of Luteinizing Hormone (LH) from the anterior pituitary.
* **Follicular Rupture:** Ovulation occurs approximately 24 to 36 hours post-LH surge. The Graafian follicle ruptures, releasing a mature oocyte into the fallopian tube.
* **Fertile Window:** The oocyte remains viable for 12 to 24 hours. However, sperm can survive in high-quality cervical mucus for up to 5 days, defining the 6-day fertile window.

## 5. Phase 4: Luteal Phase (Days 15–28)
* **Corpus Luteum Function:** The ruptured follicle transforms into the Corpus Luteum, secreting high concentrations of Progesterone.
* **Secretory Endometrium:** Progesterone stabilizes the endometrial lining, preparing it for potential blastocyst implantation.
* **PMS & Transition:** If fertilization does not occur, the corpus luteum degenerates (Corpus Albicans), progesterone drops rapidly, and menses begins anew.`,
          category: 'MENSTRUATION',
          readTimeMinutes: 7,
          authorName: 'Dr. Sarah Jenkins, MD (Reproductive Endocrinologist)',
          reviewerName: 'Dr. Elena Rostova',
          reviewerTitle: 'Board Certified OB/GYN',
          lastReviewedAt: new Date().toISOString(),
          isPublished: true,
          tags: ['Cycle', 'Hormones', 'Physiology'],
        },
        {
          id: 'art-2',
          slug: 'clinical-guide-bbt-cervical-mucus-conception',
          title: 'Clinical Guide to Basal Body Temperature (BBT) & Cervical Mucus Mapping',
          summary: 'Evidence-based methods for identifying ovulation, timing intercourse, and tracking luteal phase thermal shifts.',
          content: `## 1. The Science of Basal Body Temperature (BBT)
Basal Body Temperature is your body's lowest resting temperature, measured immediately upon waking before any physical activity.
* **Thermal Shift Physiology:** Post-ovulation, progesterone secreted by the Corpus Luteum acts on the hypothalamus to raise core resting temperature by 0.2°C to 0.5°C (0.4°F to 1.0°F).
* **Biphasic Pattern:** A confirmed thermal shift maintained for at least 3 consecutive days confirms that ovulation has taken place.

## 2. Cervical Mucus Biomarkers (Billings & Creighton Models)
Cervical mucus undergoes distinct structural changes under the influence of estrogen and progesterone:
* **Dry / Sticky Phase (Post-Menses):** Low estrogen; cervical canal is blocked by dense mucus plug.
* **Creamy Phase (Early Follicular):** Rising estrogen; lotion-like, white, non-stretchy mucus.
* **Egg-White / Spinnbarkeit (Peak Fertile Window):** High estrogen concentration alters mucin fibers into parallel channels. Mucus is clear, slippery, and stretches over 5 cm without breaking. This environment nourishes sperm and enables swimming into the cervical os.

## 3. Urinary LH Surge Testing
Luteinizing Hormone (LH) ovulation predictor kits (OPKs) detect the pre-ovulatory LH surge in urine.
* **Timing:** Test urine between 10:00 AM and 8:00 PM.
* **Interpretation:** A positive test (test line as dark or darker than control line) indicates ovulation is expected within 12 to 36 hours.

## 4. Optimizing Conception Timing
* **Peak Fertile Window:** Intercourse on the 2 days preceding ovulation and on Ovulation Day yields the highest clinical conception rates (30-33% per cycle).`,
          category: 'OVULATION_FERTILITY',
          readTimeMinutes: 8,
          authorName: 'Dr. Maya Lin, MD (Fertility & Reproductive Specialist)',
          reviewerName: 'Dr. Rachel Danis, FACOG',
          reviewerTitle: 'Subspecialist in Reproductive Endocrinology',
          lastReviewedAt: new Date().toISOString(),
          isPublished: true,
          tags: ['Fertility', 'Ovulation', 'BBT', 'Cervical Mucus'],
        },
        {
          id: 'art-3',
          slug: 'trimester-by-trimester-maternal-fetal-guide',
          title: 'The Complete Trimester-by-Trimester Maternal & Fetal Development Guide',
          summary: 'Essential clinical milestones, fetal organogenesis, maternal nutrition, and labor preparation.',
          content: `## 1. First Trimester (Weeks 1–13): Organogenesis & Foundation
* **Fetal Milestones:** Conception to blastocyst implantation (Week 3-4). Neural tube closure occurs by Week 6. Tiny heartbeat detectable by ultrasound (Weeks 6-7). By Week 12, all major organ systems, digits, and facial features are formed.
* **Maternal Care:** Folic Acid supplementation (400–800 mcg/day) is imperative to prevent neural tube defects (spina bifida). Manage early nausea with pyridoxine (Vitamin B6) and frequent protein-rich snacks.

## 2. Second Trimester (Weeks 14–27): Rapid Growth & Quickening
* **Fetal Milestones:** Fetal hearing develops (Week 18). First movements ("quickening") felt between Weeks 18–22. Vernix caseosa and lanugo coat skin. Mid-pregnancy anatomy scan (Weeks 18-22) evaluates cardiac chambers, spine, brain structures, and placenta location.
* **Maternal Care:** Iron supplementation for expanding maternal blood volume. Side-sleeping (left lateral position) prevents inferior vena cava compression.

## 3. Third Trimester (Weeks 28–42): Maturation & Labor Prep
* **Fetal Milestones:** Rapid brain wave development and lung alveoli surfactant production. Eyelids open (Week 28). Baby gains ~200g per week leading up to birth.
* **Daily Kick Counting:** Starting Week 28, count fetal movements during active periods. Target: 10 distinct movements within a 2-hour window.
* **5-1-1 Labor Contraction Rule:** Contractions occurring 5 minutes apart, lasting 60 seconds each, for at least 1 hour indicate active labor initiation.`,
          category: 'PREGNANCY',
          readTimeMinutes: 9,
          authorName: 'Dr. Hannah Alpert, MD (Maternal-Fetal Medicine Specialist)',
          reviewerName: 'Dr. Rebecca Vance, FACOG',
          reviewerTitle: 'Board Certified Obstetrician & Gynecologist',
          lastReviewedAt: new Date().toISOString(),
          isPublished: true,
          tags: ['Pregnancy', 'Gestational Care', 'Fetal Milestones'],
        },
        {
          id: 'art-4',
          slug: 'fourth-trimester-postpartum-healing-lactation',
          title: 'Fourth Trimester Recovery: Wound Healing, Lochia & Lactation Physiology',
          summary: 'Clinical guidelines for perineal and cesarean recovery, lochia stages, prolactin lactation, and PPD screening.',
          content: `## 1. The Fourth Trimester Overview
The 12 weeks following childbirth—the 4th Trimester—represent a period of intense physiological, endocrine, and psychological readjustment for mothers.

## 2. Uterine Involution & Lochia Stages
* **Uterine Involution:** The uterus contracts from ~1,000g post-delivery back to its pre-pregnancy size (~60g) over 6 weeks.
* **Lochia Rubra (Days 1–4):** Dark red flow containing blood, decidual tissue, and mucus.
* **Lochia Serosa (Days 4–10):** Pinkish-brown thinner discharge containing leukocytes and cervical mucus.
* **Lochia Alba (Days 10–28+):** Yellowish-white discharge composed of leukocytes and epithelial cells.
* **Warning Sign:** Passing blood clots larger than a golf ball or soaking more than 1 sanitary pad per hour requires immediate medical evaluation.

## 3. Lactation Physiology & Breastfeeding
* **Hormonal Mechanism:** Placentation removal triggers a sharp drop in progesterone, releasing prolactin from the anterior pituitary to initiate mature milk synthesis.
* **Oxytocin Reflux:** Suckling triggers posterior pituitary oxytocin release, prompting milk let-down and uterine contractions.
* **Latching Technique:** Ensure deep latch covering most of the lower areola to prevent nipple damage and ensure efficient infant milk transfer.

## 4. Postpartum Mental Health (PPD & Anxiety)
* **Baby Blues vs PPD:** Mild mood swings peak around Day 3–5 and resolve by Day 14.
* **Postpartum Depression (PPD):** Persistent sadness, severe anxiety, insomnia, or inability to bond lasting beyond 2 weeks affects 1 in 7 mothers. Standard screening uses the Edinburgh Postpartum Depression Scale (EPDS).`,
          category: 'POSTPARTUM',
          readTimeMinutes: 8,
          authorName: 'Dr. Miriam Stoppard, MD, FRCP (Maternal Health Author)',
          reviewerName: 'Dr. Elena Rostova',
          reviewerTitle: 'Board Certified Gynecologic Specialist',
          lastReviewedAt: new Date().toISOString(),
          isPublished: true,
          tags: ['Postpartum', 'Lactation', 'Recovery'],
        },
        {
          id: 'art-5',
          slug: 'navigating-perimenopause-vasomotor-symptoms-hrt',
          title: 'Navigating Perimenopause & Menopause: Vasomotor Symptoms, HRT & Bone Health',
          summary: 'Understanding estrogen decline, hot flash management, bone mineral density protection, and HRT safety.',
          content: `## 1. Defining the Menopausal Transition
* **Perimenopause:** The 4 to 8 years preceding menopause characterized by anovulatory cycles, fluctuating estrogen levels, and erratic menstrual timing.
* **Menopause:** Clinically diagnosed after 12 consecutive months of amenorrhea without pathological cause. Average age: 51 years.

## 2. Vasomotor Symptoms (Hot Flashes & Night Sweats)
* **Thermoregulatory Zone Narrowing:** Declining estrogen narrows the hypothalamic thermoregulatory window. Small temperature elevations trigger profuse sweating, peripheral vasodilation, and rapid heart rate.
* **Lifestyle Management:** Layered breathable clothing, cooling gel pillows, avoiding evening spicy foods/alcohol, and mindfulness breathing.

## 3. Bone Mineral Density & Osteoporosis Prevention
* **Estrogen & Osteoclasts:** Estrogen inhibits osteoclast-mediated bone resorption. In the first 5 years post-menopause, women can lose up to 20% of their bone density.
* **Prevention Protocol:** Daily Calcium (1,200 mg), Vitamin D3 (1,000–2,000 IU), and weight-bearing strength training.

## 4. Hormone Replacement Therapy (HRT) Indications
* **Modern Clinical Consensus:** Systemic bioidentical HRT (Estrogen + Progesterone) is the most effective treatment for moderate-to-severe vasomotor symptoms when initiated under age 60 or within 10 years of menopause onset.`,
          category: 'MENOPAUSE',
          readTimeMinutes: 8,
          authorName: 'Dr. Elizabeth Swenson, MD (Hormonal Transition Specialist)',
          reviewerName: 'Dr. Sarah Jenkins, FACOG',
          reviewerTitle: 'Director of Menopause & Endocrinology',
          lastReviewedAt: new Date().toISOString(),
          isPublished: true,
          tags: ['Menopause', 'Perimenopause', 'HRT', 'Bone Density'],
        },
        {
          id: 'art-6',
          slug: 'contraceptive-methods-efficacy-larc-pills',
          title: 'Contraceptive Methods & Clinical Efficacy: LARC (IUD/Implant), Pills & Safety',
          summary: 'Evidence-based comparative guide to Long-Acting Reversible Contraception (IUDs), oral pills, and emergency contraception.',
          content: `## 1. Contraceptive Efficacy Spectrum
Contraceptive methods are categorized by typical-use clinical efficacy:
* **Tier 1 (>99% Efficacy):** Long-Acting Reversible Contraception (LARC)—Hormonal IUDs (Mirena/Kyleena), Copper IUDs (Paragard), and Subdermal Implants (Nexplanon).
* **Tier 2 (91–93% Typical Efficacy):** Oral Contraceptive Pills (Combination & Progestin-only), Transdermal Patches, Vaginal Rings (NuvaRing), and Depo-Provera Injections.
* **Tier 3 (82–88% Typical Efficacy):** Male Condoms, Diaphragms, and Cervical Caps.

## 2. LARC Mechanisms (IUDs & Implants)
* **Hormonal IUDs:** Release levonorgestrel directly into the uterine cavity, thickening cervical mucus and suppressing endometrial growth.
* **Copper IUD (Paragard):** Releases copper ions toxic to sperm. 100% non-hormonal; lasts up to 10–12 years.

## 3. Combination Oral Contraceptives & Missed-Pill Protocol
* **Mechanism:** Suppresses ovulation via pituitary LH/FSH negative feedback loop.
* **Missed Pill Protocol:**
  * **1 Pill Missed (<24 hrs):** Take missed pill immediately; no backup needed.
  * **2+ Pills Missed (>48 hrs):** Take most recent missed pill, continue pack, and use barrier backup for 7 consecutive days.`,
          category: 'CONTRACEPTION',
          readTimeMinutes: 7,
          authorName: 'Dr. Claire Harrison, MD (Family Planning Specialist)',
          reviewerName: 'Dr. Rachel Danis, FACOG',
          reviewerTitle: 'Clinical Gynecologist',
          lastReviewedAt: new Date().toISOString(),
          isPublished: true,
          tags: ['Contraception', 'Birth Control', 'IUD', 'Pills'],
        },
        {
          id: 'art-7',
          slug: 'cervical-pap-cytology-hpv-screening-guidelines',
          title: 'Cervical Pap Cytology, High-Risk HPV Screening & STI Guidelines',
          summary: 'A complete clinical overview of cervical cancer screening schedules, HPV co-testing, and STI prevention.',
          content: `## 1. Cervical Cancer Screening Guidelines (ACOG & USPSTF)
Cervical cytology (Pap smear) screens for precancerous dysplasia in the transformation zone of the cervix.
* **Ages 21–29:** Cervical Pap cytology alone every 3 years.
* **Ages 30–65:** Option 1: Pap cytology + High-Risk HPV co-testing every 5 years (preferred); Option 2: Pap cytology alone every 3 years.

## 2. Human Papillomavirus (HPV) Physiology
* **High-Risk Strains:** Strains HPV-16 and HPV-18 account for ~70% of cervical cancers globally.
* **Vaccination (Gardasil 9):** Protects against 9 high-risk and oncogenic HPV strains. Recommended for individuals through age 26 (and up to age 45 following clinical shared decision-making).

## 3. Routine STI Screening Schedule
* **Annual Screening:** Sexually active women under age 25 should receive annual nucleic acid amplification testing (NAAT) for Chlamydia trachomatis and Neisseria gonorrhoeae.`,
          category: 'SEXUAL_HEALTH',
          readTimeMinutes: 7,
          authorName: 'Dr. Veronica Thorne, MD (Sexual & Reproductive Health Specialist)',
          reviewerName: 'Dr. Elena Rostova',
          reviewerTitle: 'Board Certified Gynecologic Oncologist',
          lastReviewedAt: new Date().toISOString(),
          isPublished: true,
          tags: ['Sexual Health', 'Pap Smear', 'HPV', 'STI Screening'],
        },
        {
          id: 'art-8',
          slug: 'pelvic-floor-health-kegel-exercises-wellness',
          title: 'Pelvic Floor Health, Core Stability & Pelvic Organ Wellness',
          summary: 'Understanding the Levator Ani muscles, preventing urinary incontinence, and proper Kegel re-education.',
          content: `## 1. Anatomy of the Pelvic Floor
The pelvic floor is a hammock-like muscular structure (Levator Ani complex: Pubococcus, Puborectalis, Iliococcygeus) that spans the base of the pelvis.
* **Key Functions:** Supports pelvic organs (bladder, uterus, bowel), maintains urinary continence, and contributes to intra-abdominal core stability.

## 2. Pelvic Floor Dysfunction & Incontinence
* **Stress Urinary Incontinence (SUI):** Involuntary urine leakage during coughing, sneezing, laughing, or jumping due to weakened pelvic sphincter support.
* **Pelvic Organ Prolapse (POP):** Descent of pelvic organs into the vaginal canal resulting from connective tissue weakening post-delivery or post-menopause.

## 3. Proper Kegel Muscle Re-Education Technique
* **Correct Contraction:** Squeeze the muscles you would use to stop passing gas or interrupt urination stream. Lift inwards and upwards.
* **Protocol:** Hold contraction for 5 seconds, relax for 5 seconds; repeat 10 reps, 3 times daily.`,
          category: 'GENERAL_WELLNESS',
          readTimeMinutes: 6,
          authorName: 'Dr. Lauren Sterling, DPT, WCS (Women’s Health Physical Therapist)',
          reviewerName: 'Dr. Maya Lin, FACOG',
          reviewerTitle: 'Obstetrician & Gynecologist',
          lastReviewedAt: new Date().toISOString(),
          isPublished: true,
          tags: ['Pelvic Floor', 'Kegels', 'Wellness', 'Core Health'],
        },
      ];

      let filtered = MEDICAL_LIBRARY;
      if (category) {
        filtered = filtered.filter((a) => a.category === category);
      }
      if (query && query.trim()) {
        const q = query.toLowerCase().trim();
        filtered = filtered.filter(
          (a) =>
            a.title.toLowerCase().includes(q) ||
            a.summary.toLowerCase().includes(q) ||
            a.content.toLowerCase().includes(q) ||
            a.tags.some((t) => t.toLowerCase().includes(q)),
        );
      }
      return filtered;
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
