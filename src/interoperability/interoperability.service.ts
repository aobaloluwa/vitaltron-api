import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FhirSerializerService } from './fhir-serializer.service';
import { AuditService } from '../audit/audit.service';
import { RecordType, VerificationStatus, UserRole } from '../../generated/prisma/enums';

@Injectable()
export class InteroperabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fhirSerializer: FhirSerializerService,
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

    throw new ForbiddenException('Access denied');
  }

  async exportPatientFhirBundle(actorId: string, targetPatientId?: string) {
    const patientId = targetPatientId || actorId;
    await this.checkPatientAccess(actorId, patientId);

    const patient = await this.prisma.user.findUnique({
      where: { id: patientId },
      include: { patientProfile: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const records = await this.prisma.healthRecord.findMany({
      where: { patientId },
      orderBy: { eventDate: 'desc' },
    });

    const bundle = this.fhirSerializer.serializePatientBundle(patient, records);

    await this.auditService.log({
      action: 'EXPORT_FHIR_BUNDLE',
      actorUserId: actorId,
      targetPatientId: patientId,
      details: { recordCount: records.length },
    });

    return bundle;
  }

  async importFhirBundle(actorId: string, bundle: any, targetPatientId?: string) {
    const patientId = targetPatientId || actorId;
    await this.checkPatientAccess(actorId, patientId);

    if (!bundle || bundle.resourceType !== 'Bundle' || !Array.isArray(bundle.entry)) {
      throw new BadRequestException('Invalid HL7 FHIR Bundle payload');
    }

    const importedRecords: any[] = [];

    for (const entry of bundle.entry) {
      const resource = entry.resource;
      if (!resource) continue;

      let recordType: RecordType | null = null;
      let title = '';
      let description = '';

      if (resource.resourceType === 'Condition') {
        recordType = RecordType.DIAGNOSIS;
        title = resource.code?.text || 'Imported Condition';
        description = resource.note?.[0]?.text || '';
      } else if (resource.resourceType === 'MedicationStatement' || resource.resourceType === 'MedicationRequest') {
        recordType = RecordType.MEDICATION;
        title = resource.medicationCodeableConcept?.text || 'Imported Medication';
        description = resource.note?.[0]?.text || '';
      } else if (resource.resourceType === 'AllergyIntolerance') {
        recordType = RecordType.ALLERGY;
        title = resource.code?.text || 'Imported Allergy';
        description = resource.note?.[0]?.text || '';
      } else if (resource.resourceType === 'Observation') {
        recordType = RecordType.LAB_TEST;
        title = resource.code?.text || 'Imported Observation';
        description = resource.valueString || resource.note?.[0]?.text || '';
      } else if (resource.resourceType === 'Procedure') {
        recordType = RecordType.PROCEDURE;
        title = resource.code?.text || 'Imported Procedure';
        description = resource.note?.[0]?.text || '';
      }

      if (recordType) {
        const record = await this.prisma.healthRecord.create({
          data: {
            patientId,
            createdById: actorId,
            type: recordType,
            title,
            description,
            verificationStatus: VerificationStatus.PATIENT_CONFIRMED,
            fhirData: resource,
          },
        });
        importedRecords.push(record);
      }
    }

    await this.auditService.log({
      action: 'IMPORT_FHIR_BUNDLE',
      actorUserId: actorId,
      targetPatientId: patientId,
      details: { importedCount: importedRecords.length },
    });

    return {
      message: `Successfully imported ${importedRecords.length} records from FHIR bundle into Universal Health Timeline`,
      importedRecordsCount: importedRecords.length,
      importedRecords,
    };
  }
}
