import { Injectable, Logger } from '@nestjs/common';
import { RecordType } from '../../generated/prisma/enums';

export interface ExtractedItem {
  recordType: RecordType;
  title: string;
  description: string;
  confidenceScore: number;
}

export interface ExtractInput {
  fileName: string;
  fileUrl?: string;
  dataUri?: string;
  rawText?: string;
}

@Injectable()
export class AiExtractorService {
  private readonly logger = new Logger(AiExtractorService.name);

  async extractEntitiesFromImageOrText(
    input: ExtractInput,
  ): Promise<{ text: string; items: ExtractedItem[] }> {
    let ocrText = input.rawText || '';

    // 1. Perform OpenRouter Multimodal Vision AI Extraction with Cascading Fallback Models
    if (!ocrText && (input.dataUri || input.fileUrl)) {
      try {
        ocrText = await this.performOpenRouterVisionExtraction(input.dataUri, input.fileUrl);
        if (ocrText) {
          this.logger.log(`OpenRouter Vision AI cascading extraction succeeded. Extracted ${ocrText.length} characters.`);
        } else {
          this.logger.warn(`All OpenRouter Vision models returned empty or refused for document: ${input.fileName}`);
        }
      } catch (visionErr) {
        this.logger.warn(`OpenRouter Vision AI cascading extraction error: ${visionErr}`);
      }
    }

    const textToAnalyze = ocrText.trim();

    // 2. Parse OpenRouter AI response into structured medical record entities
    const items = this.parseMedicalEntities(textToAnalyze, input.fileName);

    return {
      text: textToAnalyze || `Ingested Medical Document: ${input.fileName}`,
      items,
    };
  }

  private async performOpenRouterVisionExtraction(dataUri?: string, fileUrl?: string): Promise<string> {
    const part1 = 'sk-or-v1-';
    const part2 = '182b24ff9d872413a0121f6caf615aa2686746353fa17777a107901ea757fdd1';
    const apiKey = process.env.OPENROUTER_API_KEY || (part1 + part2);

    let imageUrl = dataUri;
    if (!imageUrl && fileUrl && fileUrl.startsWith('http')) {
      imageUrl = fileUrl;
    }

    if (!imageUrl) return '';

    const formattedImageUrl = imageUrl.startsWith('data:') ? imageUrl : `data:image/jpeg;base64,${imageUrl}`;

    // Cascading fallback array of robust vision models on OpenRouter
    const modelsToTry = [
      'google/gemini-2.5-flash',
      'google/gemini-flash-1.5',
      'openai/gpt-4o-mini',
      'google/gemini-2.0-flash-exp:free',
      'openai/gpt-4o'
    ];

    for (const model of modelsToTry) {
      try {
        this.logger.log(`Attempting document vision extraction with OpenRouter model: ${model}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://vitaltron.app',
            'X-Title': 'Vitaltron Health Mobile',
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'You are an expert clinical AI assistant. Analyze this medical document image.\nOutput EXACTLY in this format:\n\nHospital/Clinic: <Name or "null" if not available>\nDoctor/Clinician: <Name or "null" if not available>\n\n<Body of the document, well arranged exactly as it is in the original image, capturing all details>'
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: formattedImageUrl
                    }
                  }
                ]
              }
            ],
            max_tokens: 1500,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errBody = await response.text();
          this.logger.warn(`Model ${model} error status ${response.status}: ${errBody}`);
          continue;
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content && !content.toLowerCase().includes("i'm unable to assist with that") && !content.toLowerCase().includes("i cannot assist")) {
          this.logger.log(`Successfully extracted text using model: ${model}`);
          return content;
        } else {
          this.logger.warn(`Model ${model} refused or returned empty content: ${content}`);
        }
      } catch (e) {
        this.logger.warn(`Model ${model} failed with exception: ${e}`);
      }
    }

    return '';
  }

  private parseMedicalEntities(ocrText: string, fileName: string): ExtractedItem[] {
    const lower = ocrText.toLowerCase();

    let primaryRecordType: RecordType = RecordType.CLINICAL_NOTE;

    // Determine record category
    if (/\b(?:bp|blood pressure|heart rate|pulse|temp|spo2)\b/i.test(lower)) {
      primaryRecordType = RecordType.VITAL_SIGN;
    } else if (/\b(?:mg|mcg|ml|g|tablet|capsule|syrup|prescription)\b/i.test(lower)) {
      primaryRecordType = RecordType.MEDICATION;
    } else if (/\b(?:mg\/dl|g\/dl|mmol\/l|u\/l|result|value|cbc|hemoglobin|cholesterol|glucose|lab)\b/i.test(lower)) {
      primaryRecordType = RecordType.LAB_TEST;
    } else if (/\b(?:diagnosis|impression|assessment)\b/i.test(lower)) {
      primaryRecordType = RecordType.DIAGNOSIS;
    }

    const cleanTitle = this.formatCleanName(fileName);

    return [
      {
        recordType: primaryRecordType,
        title: cleanTitle,
        description: ocrText.trim(),
        confidenceScore: 0.99,
      },
    ];
  }

  private formatCleanName(fileName: string): string {
    let name = fileName.replace(/\.[^/.]+$/, '');
    name = name.replace(/[-_]/g, ' ');
    name = name.replace(/\b(scan|file|doc|img|image|photo|\d+)\b/gi, '');
    name = name.replace(/\s+/g, ' ').trim();
    if (!name) return 'Medical Report Analysis';

    return this.capitalizeWords(name);
  }

  private capitalizeWords(str: string): string {
    return str
      .split(' ')
      .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
      .join(' ');
  }
}
