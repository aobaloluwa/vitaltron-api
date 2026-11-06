import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiExtractorService } from './ai-extractor.service';
import { AuditService } from '../audit/audit.service';
import { ConfirmEntityDto } from './dto/confirm-entity.dto';
import { IngestionStatus, VerificationStatus } from '../../generated/prisma/enums';

@Injectable()
export class DocumentIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiExtractor: AiExtractorService,
    private readonly auditService: AuditService,
  ) {}

  async createDocument(userId: string, fileData: { fileName: string; fileUrl: string; fileType: string; fileSize: number; rawText?: string }) {
    const doc = await this.prisma.medicalDocument.create({
      data: {
        userId,
        fileName: fileData.fileName,
        fileUrl: fileData.fileUrl,
        fileType: fileData.fileType,
        fileSize: fileData.fileSize,
        ingestionStatus: IngestionStatus.PROCESSING,
        uploadSource: 'USER_UPLOAD',
      },
    });

    try {
      const { text, items } = await this.aiExtractor.extractEntitiesFromText(fileData.fileName, fileData.rawText);

      await this.prisma.medicalDocument.update({
        where: { id: doc.id },
        data: {
          extractedText: text,
          ingestionStatus: IngestionStatus.PROCESSED,
          extractedEntities: {
            create: items.map((item) => ({
              recordType: item.recordType,
              title: item.title,
              description: item.description,
              confidenceScore: item.confidenceScore,
              isConfirmed: false,
            })),
          },
        },
      });

      await this.auditService.log({
        action: 'DOCUMENT_INGESTION_COMPLETED',
        actorUserId: userId,
        targetPatientId: userId,
        details: { documentId: doc.id, extractedItemsCount: items.length },
      });
    } catch (err) {
      await this.prisma.medicalDocument.update({
        where: { id: doc.id },
        data: { ingestionStatus: IngestionStatus.FAILED },
      });
    }

    return this.getDocumentById(userId, doc.id);
  }

  async getUserDocuments(userId: string) {
    return this.prisma.medicalDocument.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        extractedEntities: true,
      },
    });
  }

  async getDocumentById(userId: string, documentId: string) {
    const doc = await this.prisma.medicalDocument.findUnique({
      where: { id: documentId },
      include: {
        extractedEntities: true,
      },
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    if (doc.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return doc;
  }

  async confirmExtractedEntity(userId: string, entityId: string, dto: ConfirmEntityDto) {
    const entity = await this.prisma.extractedEntity.findUnique({
      where: { id: entityId },
      include: { document: true },
    });

    if (!entity) {
      throw new NotFoundException('Extracted entity not found');
    }

    if (entity.document.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (entity.isConfirmed) {
      throw new BadRequestException('Entity has already been confirmed and added to timeline');
    }

    const healthRecord = await this.prisma.healthRecord.create({
      data: {
        patientId: userId,
        createdById: userId,
        type: dto.recordType || entity.recordType,
        title: dto.title || entity.title,
        description: dto.description || entity.description,
        eventDate: dto.eventDate ? new Date(dto.eventDate) : new Date(),
        verificationStatus: dto.verificationStatus || VerificationStatus.PATIENT_CONFIRMED,
        documentId: entity.documentId,
      },
    });

    await this.prisma.extractedEntity.update({
      where: { id: entityId },
      data: {
        isConfirmed: true,
        confirmedRecordId: healthRecord.id,
      },
    });

    await this.auditService.log({
      action: 'CONFIRM_EXTRACTED_ENTITY',
      actorUserId: userId,
      targetPatientId: userId,
      details: { entityId, healthRecordId: healthRecord.id, title: healthRecord.title },
    });

    return {
      message: 'Entity confirmed and added to Universal Health Timeline',
      healthRecord,
    };
  }
}
