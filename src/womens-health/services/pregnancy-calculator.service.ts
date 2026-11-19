import { Injectable } from '@nestjs/common';

export interface PregnancyCalculationResult {
  gestationalAgeWeeks: number;
  gestationalAgeDays: number;
  currentTrimester: number;
  trimesterName: string;
  dueDate: string;
  daysRemaining: number;
  weeksRemaining: number;
  progressPercent: number;
  babySizeFruit: string;
  babyLengthCm: number;
  babyWeightGrams: number;
  weeklyMilestoneTitle: string;
  weeklySummary: string;
  disclaimer: string;
}

@Injectable()
export class PregnancyCalculatorService {
  private readonly babySizes: Record<number, { fruit: string; lengthCm: number; weightGrams: number; title: string; summary: string }> = {
    4: { fruit: 'Poppy Seed', lengthCm: 0.1, weightGrams: 0.1, title: 'Implantation & Early Cell Growth', summary: 'The blastocyst lodges firmly into the uterine lining.' },
    8: { fruit: 'Raspberry', lengthCm: 1.6, weightGrams: 1.0, title: 'Webbed Fingers & Heartbeat', summary: 'Neural tube closes, limbs form, and tiny heartbeat is detectable on ultrasound.' },
    12: { fruit: 'Plum', lengthCm: 5.4, weightGrams: 14, title: 'First Trimester Milestone', summary: 'Vital organs are fully formed; baby begins moving arms and fingers.' },
    16: { fruit: 'Avocado', lengthCm: 11.6, weightGrams: 100, title: 'Facial Expressions & Hearing', summary: 'Baby can hear voice vibrations; tiny fingernails are growing.' },
    20: { fruit: 'Banana', lengthCm: 25.6, weightGrams: 300, title: 'Halfway Mark & First Kicks', summary: 'Vernix protects skin. Flutters and quickening movements can be felt!' },
    24: { fruit: 'Cantaloupe', lengthCm: 30.0, weightGrams: 600, title: 'Viability & Ear Formation', summary: 'Inner ear structures are complete; baby responds to external sounds.' },
    28: { fruit: 'Eggplant', lengthCm: 37.6, weightGrams: 1000, title: 'Third Trimester Begins', summary: 'Eyelids open, eyes can focus, and brain wave activity shows REM sleep.' },
    32: { fruit: 'Squash', lengthCm: 42.4, weightGrams: 1700, title: 'Bone Hardening & Rapid Weight', summary: 'Bones harden (except skull); practicing breathing movements in amniotic fluid.' },
    36: { fruit: 'Honeydew Melon', lengthCm: 47.4, weightGrams: 2600, title: 'Full Term Approaches', summary: 'Lungs mature, digestive system is ready, baby descends into pelvic cavity.' },
    40: { fruit: 'Watermelon', lengthCm: 51.2, weightGrams: 3400, title: 'Arrival Ready', summary: 'Full term pregnancy! Ready for delivery and greeting parents.' },
  };

  calculatePregnancyMetrics(
    lmpDate?: Date | string | null,
    confirmedDueDate?: Date | string | null,
  ): PregnancyCalculationResult {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let calculatedDueDate: Date;

    if (confirmedDueDate) {
      calculatedDueDate = new Date(confirmedDueDate);
    } else if (lmpDate) {
      const lmp = new Date(lmpDate);
      calculatedDueDate = new Date(lmp);
      calculatedDueDate.setDate(lmp.getDate() + 280); // Standard 40 weeks (280 days)
    } else {
      calculatedDueDate = new Date(today);
      calculatedDueDate.setDate(today.getDate() + 280 - 28); // Default fallback
    }

    calculatedDueDate.setHours(0, 0, 0, 0);

    // Gestational start = due date minus 280 days
    const gestationalStart = new Date(calculatedDueDate);
    gestationalStart.setDate(calculatedDueDate.getDate() - 280);

    const diffFromStartMs = today.getTime() - gestationalStart.getTime();
    const totalDaysElapsed = Math.max(0, Math.floor(diffFromStartMs / (1000 * 60 * 60 * 24)));

    const gestationalAgeWeeks = Math.min(42, Math.floor(totalDaysElapsed / 7));
    const gestationalAgeDays = totalDaysElapsed % 7;

    const diffToDueMs = calculatedDueDate.getTime() - today.getTime();
    const daysRemaining = Math.max(0, Math.floor(diffToDueMs / (1000 * 60 * 60 * 24)));
    const weeksRemaining = Math.max(0, Math.ceil(daysRemaining / 7));

    const progressPercent = Math.min(100, Math.max(0, Math.round((totalDaysElapsed / 280) * 100)));

    let currentTrimester = 1;
    let trimesterName = 'First Trimester (Weeks 1-13)';

    if (gestationalAgeWeeks >= 14 && gestationalAgeWeeks <= 27) {
      currentTrimester = 2;
      trimesterName = 'Second Trimester (Weeks 14-27)';
    } else if (gestationalAgeWeeks >= 28) {
      currentTrimester = 3;
      trimesterName = 'Third Trimester (Weeks 28-42)';
    }

    // Determine nearest size bracket
    const weekBrackets = Object.keys(this.babySizes)
      .map(Number)
      .sort((a, b) => a - b);
    let matchedWeek = weekBrackets[0];
    for (const w of weekBrackets) {
      if (gestationalAgeWeeks >= w) matchedWeek = w;
    }
    const sizeData = this.babySizes[matchedWeek] || this.babySizes[4];

    return {
      gestationalAgeWeeks,
      gestationalAgeDays,
      currentTrimester,
      trimesterName,
      dueDate: calculatedDueDate.toISOString().split('T')[0],
      daysRemaining,
      weeksRemaining,
      progressPercent,
      babySizeFruit: sizeData.fruit,
      babyLengthCm: sizeData.lengthCm,
      babyWeightGrams: sizeData.weightGrams,
      weeklyMilestoneTitle: sizeData.title,
      weeklySummary: sizeData.summary,
      disclaimer:
        'Pregnancy gestational age calculations are for general informational purposes. Always consult your obstetrician or midwife for clinical dating.',
    };
  }
}
