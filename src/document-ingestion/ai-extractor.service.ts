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

    // 1. Perform OCR on snapped image URL or Base64 payload if text not provided
    if (!ocrText && (input.fileUrl || input.dataUri)) {
      try {
        ocrText = await this.performOcr(input.fileUrl, input.dataUri);
        if (ocrText) {
          this.logger.log(`OCR extraction succeeded. Extracted ${ocrText.length} characters from scan.`);
        }
      } catch (ocrErr) {
        this.logger.warn(`OCR extraction failed or timed out: ${ocrErr}`);
      }
    }

    const textToAnalyze = ocrText.trim();

    // 2. Extract structured medical findings, lab tests, prescriptions, vitals
    const items = this.parseMedicalEntities(textToAnalyze, input.fileName);

    return {
      text: textToAnalyze || `Ingested document: ${input.fileName}`,
      items,
    };
  }

  private async performOcr(fileUrl?: string, dataUri?: string): Promise<string> {
    const bodyParams = new URLSearchParams();
    bodyParams.append('apikey', process.env.OCR_SPACE_API_KEY || 'helloworld');
    bodyParams.append('scale', 'true');
    bodyParams.append('isTable', 'true');
    bodyParams.append('OCREngine', '2');

    if (fileUrl && fileUrl.startsWith('http')) {
      bodyParams.append('url', fileUrl);
    } else if (dataUri) {
      bodyParams.append('base64Image', dataUri);
    } else {
      return '';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

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
    } catch {
      clearTimeout(timeoutId);
    }

    return '';
  }

  private parseMedicalEntities(ocrText: string, fileName: string): ExtractedItem[] {
    const items: ExtractedItem[] = [];
    const lines = ocrText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const lowerFull = (ocrText + ' ' + fileName).toLowerCase();

    // Regex patterns for medical findings
    const labTestRegex = /\b(glucose|hemoglobin|hb|wbc|rbc|platelets|cholesterol|hdl|ldl|triglycerides|creatinine|urea|sodium|potassium|alt|ast|bilirubin|tsh|hba1c|uric acid|protein|albumin)\b\s*[:=\-]?\s*([\d\.]+\s*(?:mg\/dl|g\/dl|mmol\/l|u\/l|iu\/l|%|x10\^3\/ul|mEq\/l|ug\/dl|ng\/ml)?)/i;
    const vitalBpRegex = /\b(?:bp|blood pressure)\s*[:=\-]?\s*(\d{2,3}\/\d{2,3})\s*(?:mmhg)?/i;
    const vitalPulseRegex = /\b(?:pulse|heart rate|hr)\s*[:=\-]?\s*(\d{2,3})\s*(?:bpm)?/i;
    const medRegex = /\b(amoxicillin|metformin|lisinopril|atorvastatin|paracetamol|ibuprofen|omeprazole|amlodipine|ciprofloxacin|augmentin|azithromycin|losartan|levothyroxine|metoprolol|aspirin|prednisone|gabapentin)\b\s*(\d+\s*(?:mg|mcg|ml|g))?/i;
    const allergyRegex = /\b(?:allergic to|allergy|allergies)\s*[:=\-]?\s*([a-z0-9\s,\-]+)/i;
    const diagRegex = /\b(?:diagnosis|impression|condition|assessment)\s*[:=\-]?\s*([a-z0-9\s,\-]+)/i;

    for (const line of lines) {
      const labMatch = line.match(labTestRegex);
      if (labMatch) {
        const testName = this.capitalizeWords(labMatch[1]);
        const testVal = labMatch[2] || line;
        items.push({
          recordType: RecordType.LAB_TEST,
          title: `Lab Test: ${testName}`,
          description: `Extracted Reading: ${testVal}. Document line: "${line}"`,
          confidenceScore: 0.95,
        });
        continue;
      }

      const medMatch = line.match(medRegex);
      if (medMatch) {
        const medName = this.capitalizeWords(medMatch[1]);
        const dosage = medMatch[2] ? medMatch[2] : '';
        items.push({
          recordType: RecordType.MEDICATION,
          title: `Prescription: ${medName} ${dosage}`.trim(),
          description: `Dosage & Directions: "${line}"`,
          confidenceScore: 0.93,
        });
        continue;
      }

      const bpMatch = line.match(vitalBpRegex);
      if (bpMatch) {
        items.push({
          recordType: RecordType.VITAL_SIGN,
          title: `Blood Pressure: ${bpMatch[1]} mmHg`,
          description: `Extracted Vitals: Blood Pressure ${bpMatch[1]} mmHg from scanned report.`,
          confidenceScore: 0.96,
        });
        continue;
      }

      const pulseMatch = line.match(vitalPulseRegex);
      if (pulseMatch) {
        items.push({
          recordType: RecordType.VITAL_SIGN,
          title: `Heart Rate: ${pulseMatch[1]} BPM`,
          description: `Extracted Vitals: Pulse ${pulseMatch[1]} BPM.`,
          confidenceScore: 0.94,
        });
        continue;
      }

      const allergyMatch = line.match(allergyRegex);
      if (allergyMatch) {
        items.push({
          recordType: RecordType.ALLERGY,
          title: `Allergy: ${this.capitalizeWords(allergyMatch[1])}`,
          description: `Extracted Allergy Note: "${line}"`,
          confidenceScore: 0.91,
        });
        continue;
      }

      const diagMatch = line.match(diagRegex);
      if (diagMatch && diagMatch[1].trim().length > 3) {
        items.push({
          recordType: RecordType.DIAGNOSIS,
          title: `Diagnosis: ${this.capitalizeWords(diagMatch[1].trim())}`,
          description: `Clinical Impression: "${line}"`,
          confidenceScore: 0.92,
        });
        continue;
      }
    }

    if (items.length === 0) {
      const docCleanName = this.formatCleanName(fileName);
      let detectedType: RecordType = RecordType.CLINICAL_NOTE;
      let summaryTitle = docCleanName || 'Medical Report Summary';

      if (lowerFull.includes('lab') || lowerFull.includes('blood') || lowerFull.includes('test') || lowerFull.includes('result')) {
        detectedType = RecordType.LAB_TEST;
        summaryTitle = `Lab Report: ${docCleanName}`;
      } else if (lowerFull.includes('rx') || lowerFull.includes('prescription') || lowerFull.includes('pharmacy') || lowerFull.includes('tablet')) {
        detectedType = RecordType.MEDICATION;
        summaryTitle = `Prescription: ${docCleanName}`;
      } else if (lowerFull.includes('xray') || lowerFull.includes('x-ray') || lowerFull.includes('mri') || lowerFull.includes('scan') || lowerFull.includes('ultrasound')) {
        detectedType = RecordType.PROCEDURE;
        summaryTitle = `Procedure: ${docCleanName}`;
      } else if (lowerFull.includes('bp') || lowerFull.includes('vitals') || lowerFull.includes('pulse') || lowerFull.includes('temp')) {
        detectedType = RecordType.VITAL_SIGN;
        summaryTitle = `Vitals Readout: ${docCleanName}`;
      } else if (lowerFull.includes('diagnosis') || lowerFull.includes('discharge') || lowerFull.includes('summary')) {
        detectedType = RecordType.DIAGNOSIS;
        summaryTitle = `Diagnosis: ${docCleanName}`;
      }

      const ocrSnippet = ocrText.length > 0 ? ocrText.slice(0, 300) : 'Document captured into health profile.';
      const descText = ocrText.length > 0
        ? `OCR Extracted Text:\n"${ocrSnippet}..."\n\n(Review and edit findings above before saving)`
        : `Ingested document: ${docCleanName}. Review and edit details below.`;

      items.push({
        recordType: detectedType,
        title: summaryTitle,
        description: descText,
        confidenceScore: ocrText.length > 0 ? 0.92 : 0.85,
      });
    }

    return items;
  }

  private formatCleanName(fileName: string): string {
    let name = fileName.replace(/\.[^/.]+$/, '');
    name = name.replace(/[-_]/g, ' ');
    name = name.replace(/\b(scan|file|doc|img|image|photo|\d+)\b/gi, '');
    name = name.replace(/\s+/g, ' ').trim();
    if (!name) return 'Scanned Hospital Report';

    return this.capitalizeWords(name);
  }

  private capitalizeWords(str: string): string {
    return str
      .split(' ')
      .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
      .join(' ');
  }
}
