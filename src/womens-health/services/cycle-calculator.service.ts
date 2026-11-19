import { Injectable } from '@nestjs/common';
import { CyclePhase } from '../../../generated/prisma/enums';

export interface CycleCalculationResult {
  currentCycleDay: number;
  currentPhase: CyclePhase;
  phaseDisplayName: string;
  phaseDescription: string;
  estimatedNextPeriod: string;
  estimatedOvulation: string;
  fertileWindowStart: string;
  fertileWindowEnd: string;
  averageCycleLength: number;
  averagePeriodDuration: number;
  cycleVariabilityDays: number;
  isDataSufficient: boolean;
  disclaimer: string;
}

@Injectable()
export class CycleCalculatorService {
  calculateCycleMetrics(
    lastPeriodStart?: Date | string | null,
    historicalCycles: { startDate: Date; endDate?: Date | null; cycleLength?: number | null; periodDuration?: number | null }[] = [],
    configuredCycleLength: number = 28,
    configuredPeriodDuration: number = 5,
  ): CycleCalculationResult {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate historical averages if cycles exist
    let avgCycle = configuredCycleLength;
    let avgPeriod = configuredPeriodDuration;
    let variability = 0;

    const validLengths = historicalCycles
      .map((c) => c.cycleLength)
      .filter((l): l is number => typeof l === 'number' && l >= 15 && l <= 50);

    if (validLengths.length > 0) {
      const sum = validLengths.reduce((acc, val) => acc + val, 0);
      avgCycle = Math.round(sum / validLengths.length);

      const minLength = Math.min(...validLengths);
      const maxLength = Math.max(...validLengths);
      variability = maxLength - minLength;
    }

    const validPeriodDurations = historicalCycles
      .map((c) => c.periodDuration)
      .filter((d): d is number => typeof d === 'number' && d >= 1 && d <= 12);

    if (validPeriodDurations.length > 0) {
      const sumP = validPeriodDurations.reduce((acc, val) => acc + val, 0);
      avgPeriod = Math.round(sumP / validPeriodDurations.length);
    }

    const refDate = lastPeriodStart ? new Date(lastPeriodStart) : new Date(today);
    refDate.setHours(0, 0, 0, 0);

    const diffTime = Math.abs(today.getTime() - refDate.getTime());
    const daysSinceLastStart = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const currentCycleDay = (daysSinceLastStart % avgCycle) + 1;

    // Estimate phases:
    // Ovulation is approximately (avgCycle - 14) days from cycle start
    const ovulationDayOffset = Math.max(10, avgCycle - 14);

    let currentPhase: CyclePhase = CyclePhase.FOLLICULAR;
    let phaseDisplayName = 'Follicular Phase';
    let phaseDescription = 'Estrogen levels rise as follicles develop in preparation for ovulation.';

    if (currentCycleDay <= avgPeriod) {
      currentPhase = CyclePhase.MENSTRUAL;
      phaseDisplayName = 'Menstrual Phase';
      phaseDescription = 'Uterine lining sheds. Rest, hydrate, and stay nourished.';
    } else if (currentCycleDay >= ovulationDayOffset - 2 && currentCycleDay <= ovulationDayOffset + 1) {
      currentPhase = CyclePhase.OVULATORY;
      phaseDisplayName = 'Ovulatory Phase';
      phaseDescription = 'Peak fertility window. Luteinizing hormone surge triggers egg release.';
    } else if (currentCycleDay > ovulationDayOffset + 1) {
      currentPhase = CyclePhase.LUTAL;
      phaseDisplayName = 'Luteal Phase';
      phaseDescription = 'Progesterone rises. Prepare for your upcoming cycle or monitor symptoms.';
    }

    // Next period estimate
    const daysUntilNextPeriod = avgCycle - (daysSinceLastStart % avgCycle);
    const nextPeriodDate = new Date(today);
    nextPeriodDate.setDate(today.getDate() + daysUntilNextPeriod);

    // Ovulation estimate
    const nextOvulationDate = new Date(refDate);
    const currentCycleCount = Math.floor(daysSinceLastStart / avgCycle);
    nextOvulationDate.setDate(refDate.getDate() + currentCycleCount * avgCycle + ovulationDayOffset);
    if (nextOvulationDate < today) {
      nextOvulationDate.setDate(nextOvulationDate.getDate() + avgCycle);
    }

    // Fertile window: 5 days before ovulation to 1 day after ovulation
    const fertileStart = new Date(nextOvulationDate);
    fertileStart.setDate(nextOvulationDate.getDate() - 5);

    const fertileEnd = new Date(nextOvulationDate);
    fertileEnd.setDate(nextOvulationDate.getDate() + 1);

    return {
      currentCycleDay,
      currentPhase,
      phaseDisplayName,
      phaseDescription,
      estimatedNextPeriod: nextPeriodDate.toISOString().split('T')[0],
      estimatedOvulation: nextOvulationDate.toISOString().split('T')[0],
      fertileWindowStart: fertileStart.toISOString().split('T')[0],
      fertileWindowEnd: fertileEnd.toISOString().split('T')[0],
      averageCycleLength: avgCycle,
      averagePeriodDuration: avgPeriod,
      cycleVariabilityDays: variability,
      isDataSufficient: validLengths.length >= 3,
      disclaimer:
        'Calculations are statistical estimates based on user logs and cannot guarantee contraception or exact ovulation timing.',
    };
  }
}
