import { Injectable } from '@nestjs/common';

export interface AiCompanionResponse {
  answer: string;
  suggestedQuestions: string[];
  safetyNotice: string;
  emergencyWarning?: string;
}

@Injectable()
export class WomensHealthAiService {
  async askQuestion(
    userQuestion: string,
    userContext?: {
      trackingMode?: string;
      cycleDay?: number;
      gestationalWeek?: number;
      recentSymptoms?: string[];
    },
  ): Promise<AiCompanionResponse> {
    const query = userQuestion.toLowerCase();

    let emergencyWarning: string | undefined;

    // Safety Triage Check for Red Flag Symptoms
    if (
      query.includes('heavy bleeding') ||
      query.includes('severe pain') ||
      query.includes('fainting') ||
      query.includes('reduced movement') ||
      query.includes('chest pain') ||
      query.includes('high fever')
    ) {
      emergencyWarning =
        'URGENT MEDICAL WARNING: If you are experiencing severe pain, heavy unmanageable bleeding, difficulty breathing, high fever, or sudden changes in fetal movement, please contact emergency medical services or your healthcare provider immediately.';
    }

    let answer = '';
    let suggestedQuestions: string[] = [];

    if (query.includes('cramps') || query.includes('period pain')) {
      answer =
        'Menstrual cramps (dysmenorrhea) occur as uterine muscles contract to shed the endometrial lining. Gentle warmth (heating pad), light hydration, magnesium-rich foods, and mild stretching can help reduce discomfort.';
      suggestedQuestions = [
        'What foods help alleviate menstrual bloating?',
        'When should I consult a gynecologist for cramp severity?',
        'How does stress affect cycle duration?',
      ];
    } else if (query.includes('ovulation') || query.includes('fertile')) {
      answer =
        'Your fertile window typically spans the 5 days leading up to ovulation and ovulation day itself. Key physiological indicators include clear, stretchy egg-white cervical mucus, mild rise in basal body temperature (BBT), and positive LH surge tests.';
      suggestedQuestions = [
        'How do I track Basal Body Temperature correctly?',
        'What is the difference between LH surge and ovulation?',
        'How long does an egg survive after ovulation?',
      ];
    } else if (query.includes('kick') || query.includes('movement')) {
      answer =
        'Fetal movement (quickening) is usually felt between weeks 18–22. Healthcare providers recommend establishing a daily routine for kick counting starting around week 28. Aim to feel 10 movements within a 2-hour window during your baby’s active period.';
      suggestedQuestions = [
        'What should I do if my baby feels less active?',
        'What position is best when doing kick counting?',
        'How does baby movement change in the third trimester?',
      ];
    } else if (query.includes('menopause') || query.includes('hot flash')) {
      answer =
        'Hot flashes during perimenopause and menopause result from fluctuating estrogen levels altering the body’s thermal regulation center. Layering clothing, avoiding hot triggers (caffeine, spicy food), and practicing paced breathing can offer relief.';
      suggestedQuestions = [
        'What lifestyle habits help improve sleep during menopause?',
        'What are the early signs of perimenopause?',
        'How can I maintain bone health during menopause?',
      ];
    } else {
      answer = `Based on your ${userContext?.trackingMode || 'health'} records, tracking your daily vitals, symptoms, and cycle milestones helps build a clear picture for your next clinical consultation. Make sure to discuss any persistent changes with your doctor.`;
      suggestedQuestions = [
        'How can I prepare a symptom report for my next doctor visit?',
        'What daily habits promote reproductive wellness?',
        'How do hormonal shifts affect sleep and mood?',
      ];
    }

    return {
      answer,
      suggestedQuestions,
      safetyNotice:
        'This AI Companion provides general educational information and is not a substitute for professional medical advice, diagnosis, or treatment.',
      emergencyWarning,
    };
  }
}
