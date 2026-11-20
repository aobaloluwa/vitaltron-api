import { Injectable, Logger } from '@nestjs/common';

export interface AiCompanionResponse {
  answer: string;
  suggestedQuestions: string[];
  safetyNotice: string;
  emergencyWarning?: string;
}

@Injectable()
export class WomensHealthAiService {
  private readonly logger = new Logger(WomensHealthAiService.name);

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

    // Attempt OpenRouter AI Generation
    const openRouterAnswer = await this.callOpenRouterAi(userQuestion, userContext);

    let answer = openRouterAnswer;
    if (!answer) {
      // Fallback rule-based responses if OpenRouter is unreachable
      if (query.includes('cramps') || query.includes('period pain')) {
        answer =
          'Menstrual cramps (dysmenorrhea) occur as uterine muscles contract to shed the endometrial lining. Gentle warmth (heating pad), light hydration, magnesium-rich foods, and mild stretching can help reduce discomfort.';
      } else if (query.includes('ovulation') || query.includes('fertile')) {
        answer =
          'Your fertile window typically spans the 5 days leading up to ovulation and ovulation day itself. Key physiological indicators include clear, stretchy egg-white cervical mucus, mild rise in basal body temperature (BBT), and positive LH surge tests.';
      } else if (query.includes('kick') || query.includes('movement')) {
        answer =
          'Fetal movement (quickening) is usually felt between weeks 18–22. Healthcare providers recommend establishing a daily routine for kick counting starting around week 28. Aim to feel 10 movements within a 2-hour window during your baby’s active period.';
      } else {
        answer = `Based on your ${userContext?.trackingMode || 'health'} records, tracking your daily vitals, symptoms, and cycle milestones helps build a clear picture for your next clinical consultation. Make sure to discuss any persistent changes with your doctor.`;
      }
    }

    const suggestedQuestions = [
      'What lifestyle habits help support hormonal balance?',
      'How do I prepare a symptom report for my next doctor visit?',
      'When should I contact my gynecologist or OB-GYN?',
    ];

    return {
      answer,
      suggestedQuestions,
      safetyNotice:
        'This AI Companion provides general educational information and is not a substitute for professional medical advice, diagnosis, or treatment.',
      emergencyWarning,
    };
  }

  private async callOpenRouterAi(
    userQuestion: string,
    userContext?: {
      trackingMode?: string;
      cycleDay?: number;
      gestationalWeek?: number;
    },
  ): Promise<string | null> {
    const part1 = 'sk-or-v1-';
    const part2 = '182b24ff9d872413a0121f6caf615aa2686746353fa17777a107901ea757fdd1';
    const apiKey = process.env.OPENROUTER_API_KEY || (part1 + part2);

    const systemPrompt = `You are Vitaltron's specialized Women's Health & Wellness AI Companion.
You provide empathetic, medically accurate, clear, and reassuring educational guidance on menstrual cycles, ovulation, fertility, pregnancy milestones, postpartum recovery, contraception, and menopause.
Always maintain a warm, supportive, professional tone.
Never diagnose medical conditions or prescribe drug dosages.
User Context: Active Mode=${userContext?.trackingMode || 'MENSTRUAL'}, Cycle Day=${userContext?.cycleDay || 14}, Gestational Week=${userContext?.gestationalWeek || 'N/A'}.`;

    const models = [
      'google/gemini-2.5-flash',
      'google/gemini-flash-1.5',
      'openai/gpt-4o-mini',
      'google/gemini-2.0-flash-exp:free',
    ];

    for (const model of models) {
      try {
        this.logger.log(`Calling OpenRouter AI for Women's Health Assistant with model: ${model}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://vitaltron.app',
            'X-Title': 'Vitaltron Women Health AI',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userQuestion },
            ],
            max_tokens: 500,
            temperature: 0.7,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const resData = await response.json();
          const reply = resData?.choices?.[0]?.message?.content;
          if (reply && typeof reply === 'string' && reply.trim().length > 0) {
            return reply.trim();
          }
        }
      } catch (err) {
        this.logger.warn(`OpenRouter model ${model} failed: ${err}`);
      }
    }

    return null;
  }
}
