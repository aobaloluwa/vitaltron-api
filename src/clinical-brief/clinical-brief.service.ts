import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateBriefDto } from './dto/generate-brief.dto';
import { AuditService } from '../audit/audit.service';
import { RecordType, UserRole } from '../../generated/prisma/enums';

@Injectable()
export class ClinicalBriefService {
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

    throw new ForbiddenException('Access to patient brief denied');
  }

  async generateBrief(actorId: string, dto: GenerateBriefDto) {
    const patientId = dto.patientId || actorId;
    await this.checkPatientAccess(actorId, patientId);

    const patient = await this.prisma.user.findUnique({
      where: { id: patientId },
      include: { patientProfile: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const healthRecords = await this.prisma.healthRecord.findMany({
      where: { patientId },
      orderBy: { eventDate: 'desc' },
    });

    const activeMedications = healthRecords
      .filter((r) => r.type === RecordType.MEDICATION && r.status !== 'INACTIVE')
      .map((m) => ({ title: m.title, description: m.description, severity: m.severity }));

    const severeAllergies = healthRecords
      .filter((r) => r.type === RecordType.ALLERGY)
      .map((a) => ({ title: a.title, description: a.description, severity: a.severity }));

    const activeDiagnoses = healthRecords
      .filter((r) => r.type === RecordType.DIAGNOSIS && r.status !== 'RESOLVED')
      .map((d) => ({ title: d.title, description: d.description, eventDate: d.eventDate }));

    const recentLabs = healthRecords
      .filter((r) => r.type === RecordType.LAB_TEST)
      .slice(0, 5)
      .map((l) => ({ title: l.title, description: l.description, eventDate: l.eventDate }));

    const riskFlags: string[] = [];
    if (severeAllergies.length > 0) {
      riskFlags.push(`Patient has ${severeAllergies.length} documented allergy/allergies: ${severeAllergies.map((a) => a.title).join(', ')}`);
    }
    if (activeMedications.length >= 3) {
      riskFlags.push(`Polypharmacy Alert: Patient is currently taking ${activeMedications.length} active medications.`);
    }
    if (patient.patientProfile?.bloodType) {
      riskFlags.push(`Recorded Blood Type: ${patient.patientProfile.bloodType}`);
    }

    const patientName = patient.displayName || 'Patient';
    const purpose = dto.briefPurpose || 'CLINICAL_CONSULTATION';
    const summaryText = `[INSTANT CLINICAL BRIEF - ${purpose}]
Patient: ${patientName}
DOB: ${patient.patientProfile?.dateOfBirth ? new Date(patient.patientProfile.dateOfBirth).toISOString().split('T')[0] : 'N/A'}
Blood Type: ${patient.patientProfile?.bloodType || 'Not specified'}

ACTIVE DIAGNOSES:
${activeDiagnoses.length > 0 ? activeDiagnoses.map((d) => `- ${d.title} (${d.description || 'No notes'})`).join('\n') : 'No active diagnoses recorded.'}

CURRENT MEDICATIONS:
${activeMedications.length > 0 ? activeMedications.map((m) => `- ${m.title}`).join('\n') : 'No current active medications.'}

ALLERGIES & WARNINGS:
${severeAllergies.length > 0 ? severeAllergies.map((a) => `- ALERT: ${a.title}`).join('\n') : 'No known drug allergies recorded.'}

RECENT LAB RESULTS & PROCEDURES:
${recentLabs.length > 0 ? recentLabs.map((l) => `- ${l.title}: ${l.description || 'See report'}`).join('\n') : 'No recent lab results recorded.'}
`;

    const brief = await this.prisma.clinicalBrief.create({
      data: {
        patientId,
        generatedById: actorId,
        summaryText,
        activeMedications,
        severeAllergies,
        recentLabs,
        riskFlags,
        briefPurpose: purpose,
      },
      include: {
        patient: { select: { id: true, displayName: true, email: true } },
        generatedBy: { select: { id: true, displayName: true, role: true } },
      },
    });

    await this.auditService.log({
      action: 'GENERATE_CLINICAL_BRIEF',
      actorUserId: actorId,
      targetPatientId: patientId,
      details: { briefId: brief.id, briefPurpose: purpose },
    });

    return brief;
  }

  async getPatientBriefs(actorId: string, patientId: string) {
    await this.checkPatientAccess(actorId, patientId);

    return this.prisma.clinicalBrief.findMany({
      where: { patientId },
      orderBy: { generatedAt: 'desc' },
      include: {
        generatedBy: { select: { id: true, displayName: true, role: true } },
      },
    });
  }

  async getBriefById(actorId: string, briefId: string) {
    const brief = await this.prisma.clinicalBrief.findUnique({
      where: { id: briefId },
      include: {
        patient: { select: { id: true, displayName: true, email: true }, include: { patientProfile: true } },
        generatedBy: { select: { id: true, displayName: true, role: true } },
      },
    });

    if (!brief) {
      throw new NotFoundException('Clinical brief not found');
    }

    await this.checkPatientAccess(actorId, brief.patientId);

    return brief;
  }
}
