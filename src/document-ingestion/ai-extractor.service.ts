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

    // 1. Perform OCR on snapped image (prioritize base64 dataUri for maximum reliability)
    if (!ocrText && (input.dataUri || input.fileUrl)) {
      try {
        ocrText = await this.performOcr(input.dataUri, input.fileUrl);
        if (ocrText) {
          this.logger.log(`OCR extraction succeeded. Extracted ${ocrText.length} characters from scan.`);
        } else {
          this.logger.warn(`OCR returned empty text for document: ${input.fileName}`);
        }
      } catch (ocrErr) {
        this.logger.warn(`OCR extraction error: ${ocrErr}`);
      }
    }

    const textToAnalyze = ocrText.trim();

    // 2. Parse actual extracted OCR text (NO mock data or fake defaults)
    const items = this.parseMedicalEntities(textToAnalyze, input.fileName);

    return {
      text: textToAnalyze || `Ingested Medical Document: ${input.fileName}`,
      items,
    };
  }

  private async performOcr(dataUri?: string, fileUrl?: string): Promise<string> {
    const bodyParams = new URLSearchParams();
    bodyParams.append('apikey', process.env.OCR_SPACE_API_KEY || 'helloworld');
    bodyParams.append('scale', 'true');
    bodyParams.append('isTable', 'true');
    bodyParams.append('OCREngine', '2');

    // Prioritize base64 dataUri (strip data prefix if present for OCR Space compatibility)
    if (dataUri && dataUri.length > 50) {
      const base64Data = dataUri.includes('base64,') ? dataUri.split('base64,')[1] : dataUri;
      bodyParams.append('base64Image', base64Data);
    } else if (fileUrl && fileUrl.startsWith('http') && !fileUrl.includes('vitaltron_documents')) {
      bodyParams.append('url', fileUrl);
    } else {
      return '';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) return '';

      const data = await response.json();
      if (data?.ParsedResults && data.ParsedResults.length > 0) {
        const text = data.ParsedResults.map((r: any) => r.ParsedText || '').join('\n');
        return text;
      }
    } catch (e) {
      clearTimeout(timeoutId);
      this.logger.warn(`OCR request failed: ${e}`);
    }

    return '';
  }

  private parseMedicalEntities(ocrText: string, fileName: string): ExtractedItem[] {
    const lines = ocrText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    let hospitalName: string | null = null;
    let patientName: string | null = null;
    let doctorName: string | null = null;
    let reportDate: string | null = null;

    const findings: string[] = [];
    let primaryRecordType: RecordType = RecordType.CLINICAL_NOTE;

    // Parse actual OCR text lines only (Strictly NO mock data)
    for (const line of lines) {
      if (line.length < 2) continue;
      if (/^(page|time|id|mrn|dob)[:\s]/i.test(line)) continue;

      const hospMatch = line.match(/(?:hospital|clinic|center|medical center|lab|laboratory|facility)\s*[:=\-]?\s*([a-z0-9\s]{3,})/i);
      if (hospMatch && !hospitalName) {
        hospitalName = hospMatch[1].trim();
        continue;
      }

      const patMatch = line.match(/(?:patient|name)\s*[:=\-]?\s*([a-z\s]{3,})/i);
      if (patMatch && !patientName && !patMatch[1].toLowerCase().includes('report')) {
        patientName = patMatch[1].trim();
        continue;
      }

      const docMatch = line.match(/(?:doctor|physician|dr\.?)\s*[:=\-]?\s*([a-z\s]{3,})/i);
      if (docMatch && !doctorName) {
        doctorName = `Dr. ${docMatch[1].trim().replace(/^dr\.?\s*/i, '')}`;
        continue;
      }

      const dateMatch = line.match(/date\s*[:=\-]?\s*([0-9a-zA-Z\/\-\,\s]{4,})/i);
      if (dateMatch && !reportDate) {
        reportDate = dateMatch[1].trim();
        continue;
      }

      // Determine record category from actual OCR line content
      if (/\b(?:bp|blood pressure|heart rate|pulse|temp|spo2)\b/i.test(line)) {
        if (primaryRecordType === RecordType.CLINICAL_NOTE) primaryRecordType = RecordType.VITAL_SIGN;
      } else if (/\b(?:mg|mcg|ml|g|tablet|capsule|syrup|prescription)\b/i.test(line)) {
        if (primaryRecordType === RecordType.CLINICAL_NOTE) primaryRecordType = RecordType.MEDICATION;
      } else if (/\b(?:mg\/dl|g\/dl|mmol\/l|u\/l|result|value|cbc|hemoglobin|cholesterol|glucose|lab)\b/i.test(line)) {
        if (primaryRecordType === RecordType.CLINICAL_NOTE) primaryRecordType = RecordType.LAB_TEST;
      } else if (/\b(?:diagnosis|impression|assessment)\b/i.test(line)) {
        if (primaryRecordType === RecordType.CLINICAL_NOTE) primaryRecordType = RecordType.DIAGNOSIS;
      }

      findings.push(line);
    }

    const cleanTitle = this.formatCleanName(fileName);
    const descParts: string[] = [];

    if (hospitalName) descParts.push(`Hospital/Facility: ${hospitalName}`);
    if (doctorName) descParts.push(`Doctor: ${doctorName}`);
    if (patientName) descParts.push(`Patient: ${patientName}`);
    if (reportDate) descParts.push(`Date: ${reportDate}`);

    if (findings.length > 0) {
      descParts.push(`Extracted Findings:\n• ` + findings.join('\n• '));
    } else {
      descParts.push(`Scanned Document: ${fileName} (No readable text extracted from OCR)`);
    }

    return [
      {
        recordType: primaryRecordType,
        title: cleanTitle,
        description: descParts.join(' | '),
        confidenceScore: findings.length > 0 ? 0.95 : 0.70,
      },
    ];
  }

  private formatCleanName(fileName: string): string {
    let name = fileName.replace(/\.[^/.]+$/, '');
    name = name.replace(/[-_]/g, ' ');
    name = name.replace(/\b(scan|file|doc|img|image|photo|\d+)\b/gi, '');
    name = name.replace(/\s+/g, ' ').trim();
    if (!name) return 'Scanned Medical Record';

    return this.capitalizeWords(name);
  }

  private capitalizeWords(str: string): string {
    return str
      .split(' ')
      .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
      .join(' ');
  }
}
