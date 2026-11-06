import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHealthRecordDto } from './dto/create-health-record.dto';
import { UpdateHealthRecordDto } from './dto/update-health-record.dto';
import { QueryTimelineDto } from './dto/query-timeline.dto';
import { AuditService } from '../audit/audit.service';
import { VerificationStatus, UserRole } from '../../generated/prisma/enums';

@Injectable()
export class HealthRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async checkPatientAccess(actorId: string, patientId: string) {
    if (actorId === patientId) return true;

    const familyRel = await this.prisma.familyRelationship.findUnique({
      where: {
        primaryUserId_dependentUserId: {
          primaryUserId: actorId,
          dependentUserId: patientId,
        },
      },
    });
    if (familyRel) return true;

    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (actor && (actor.role === UserRole.CLINICIAN || actor.role === UserRole.ADMIN)) {
      return true;
    }

    throw new ForbiddenException('Access to health records denied');
  }

  async createRecord(creatorId: string, dto: CreateHealthRecordDto) {
    const targetPatientId = dto.patientId || creatorId;
    await this.checkPatientAccess(creatorId, targetPatientId);

    const record = await this.prisma.healthRecord.create({
      data: {
        patientId: targetPatientId,
        createdById: creatorId,
        type: dto.type,
        title: dto.title,
        description: dto.description || null,
        eventDate: dto.eventDate ? new Date(dto.eventDate) : new Date(),
        severity: dto.severity || null,
        status: dto.status || 'ACTIVE',
        facilityName: dto.facilityName || null,
        verificationStatus: dto.verificationStatus || VerificationStatus.UNVERIFIED,
        fhirData: dto.fhirData ? (dto.fhirData as any) : undefined,
        documentId: dto.documentId || null,
      },
      include: {
        document: true,
      },
    });

    await this.auditService.log({
      action: 'CREATE_HEALTH_RECORD',
      actorUserId: creatorId,
      targetPatientId: targetPatientId,
      details: { recordId: record.id, recordType: dto.type, title: dto.title },
    });

    return record;
  }

  async getTimeline(actorId: string, query: QueryTimelineDto) {
    const targetPatientId = query.patientId || actorId;
    await this.checkPatientAccess(actorId, targetPatientId);

    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const whereClause: any = {
      patientId: targetPatientId,
    };

    if (query.type) {
      whereClause.type = query.type;
    }

    if (query.verificationStatus) {
      whereClause.verificationStatus = query.verificationStatus;
    }

    if (query.startDate || query.endDate) {
      whereClause.eventDate = {};
      if (query.startDate) whereClause.eventDate.gte = new Date(query.startDate);
      if (query.endDate) whereClause.eventDate.lte = new Date(query.endDate);
    }

    if (query.search) {
      whereClause.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { facilityName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [records, total] = await Promise.all([
      this.prisma.healthRecord.findMany({
        where: whereClause,
        orderBy: { eventDate: 'desc' },
        take: limit,
        skip,
        include: {
          document: {
            select: { id: true, fileName: true, fileUrl: true, fileType: true },
          },
          createdBy: {
            select: { id: true, displayName: true, role: true },
          },
        },
      }),
      this.prisma.healthRecord.count({ where: whereClause }),
    ]);

    await this.auditService.log({
      action: 'VIEW_HEALTH_TIMELINE',
      actorUserId: actorId,
      targetPatientId: targetPatientId,
      details: { resultCount: records.length, page },
    });

    return {
      records,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getRecordById(actorId: string, recordId: string) {
    const record = await this.prisma.healthRecord.findUnique({
      where: { id: recordId },
      include: {
        document: true,
        createdBy: { select: { id: true, displayName: true, role: true } },
      },
    });

    if (!record) {
      throw new NotFoundException('Health record not found');
    }

    await this.checkPatientAccess(actorId, record.patientId);

    await this.auditService.log({
      action: 'VIEW_HEALTH_RECORD_DETAILS',
      actorUserId: actorId,
      targetPatientId: record.patientId,
      details: { recordId },
    });

    return record;
  }

  async updateRecord(actorId: string, recordId: string, dto: UpdateHealthRecordDto) {
    const record = await this.getRecordById(actorId, recordId);

    const updated = await this.prisma.healthRecord.update({
      where: { id: recordId },
      data: {
        ...(dto.type && { type: dto.type }),
        ...(dto.title && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.eventDate && { eventDate: new Date(dto.eventDate) }),
        ...(dto.severity !== undefined && { severity: dto.severity }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.facilityName !== undefined && { facilityName: dto.facilityName }),
        ...(dto.verificationStatus && { verificationStatus: dto.verificationStatus }),
        ...(dto.fhirData && { fhirData: dto.fhirData as any }),
      },
    });

    await this.auditService.log({
      action: 'UPDATE_HEALTH_RECORD',
      actorUserId: actorId,
      targetPatientId: record.patientId,
      details: { recordId },
    });

    return updated;
  }

  async verifyRecord(actorId: string, recordId: string, status: VerificationStatus) {
    const record = await this.getRecordById(actorId, recordId);

    const verified = await this.prisma.healthRecord.update({
      where: { id: recordId },
      data: {
        verificationStatus: status,
      },
    });

    await this.auditService.log({
      action: 'VERIFY_HEALTH_RECORD',
      actorUserId: actorId,
      targetPatientId: record.patientId,
      details: { recordId, status },
    });

    return verified;
  }

  async deleteRecord(actorId: string, recordId: string) {
    const record = await this.getRecordById(actorId, recordId);

    await this.prisma.healthRecord.delete({
      where: { id: recordId },
    });

    await this.auditService.log({
      action: 'DELETE_HEALTH_RECORD',
      actorUserId: actorId,
      targetPatientId: record.patientId,
      details: { recordId },
    });

    return { success: true, id: recordId };
  }
}
