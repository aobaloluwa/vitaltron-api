import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { UpdateClinicianProfileDto } from './dto/update-clinician-profile.dto';
import { AddDependentDto } from './dto/add-dependent.dto';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../../generated/prisma/enums';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        patientProfile: true,
        clinicianProfile: true,
        familyPrimary: {
          include: {
            dependentUser: {
              include: { patientProfile: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    const { passwordHash, ...result } = user;

    // Extract avatarUrl if stored in allergiesSummary
    let avatarUrl: string | null = null;
    const rawAllergies = user.patientProfile?.allergiesSummary || '';
    const avatarMatch = rawAllergies.match(/AVATAR_URL:([^\s;]+)/i);
    if (avatarMatch) {
      avatarUrl = avatarMatch[1];
    }

    return {
      ...result,
      avatarUrl,
      preferredLanguage: user.patientProfile?.primaryLanguage || 'en',
    };
  }

  async updateUserInfo(userId: string, body: { displayName?: string; avatarUrl?: string; preferredLanguage?: string }) {
    if (body.displayName) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { displayName: body.displayName },
      });
    }

    if (body.preferredLanguage || body.avatarUrl) {
      const existing = await this.prisma.patientProfile.findUnique({ where: { userId } });
      const currentAllergies = existing?.allergiesSummary || '';
      let updatedAllergies = currentAllergies;

      if (body.avatarUrl) {
        const cleaned = currentAllergies.replace(/AVATAR_URL:[^\s;]+/gi, '').trim();
        updatedAllergies = `AVATAR_URL:${body.avatarUrl}; ${cleaned}`;
      }

      await this.prisma.patientProfile.upsert({
        where: { userId },
        create: {
          userId,
          primaryLanguage: body.preferredLanguage || 'en',
          allergiesSummary: body.avatarUrl ? `AVATAR_URL:${body.avatarUrl}` : undefined,
        },
        update: {
          ...(body.preferredLanguage && { primaryLanguage: body.preferredLanguage }),
          ...(body.avatarUrl && { allergiesSummary: updatedAllergies }),
        },
      });
    }

    return this.getUserProfile(userId);
  }

  async updatePatientProfile(userId: string, dto: UpdatePatientProfileDto) {
    const dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined;

    const profile = await this.prisma.patientProfile.upsert({
      where: { userId },
      create: {
        userId,
        dateOfBirth,
        gender: dto.gender,
        bloodType: dto.bloodType,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
        allergiesSummary: dto.allergiesSummary,
        chronicConditionsSummary: dto.chronicConditionsSummary,
        primaryLanguage: dto.primaryLanguage,
      },
      update: {
        ...(dateOfBirth && { dateOfBirth }),
        ...(dto.gender && { gender: dto.gender }),
        ...(dto.bloodType && { bloodType: dto.bloodType }),
        ...(dto.emergencyContactName && { emergencyContactName: dto.emergencyContactName }),
        ...(dto.emergencyContactPhone && { emergencyContactPhone: dto.emergencyContactPhone }),
        ...(dto.allergiesSummary && { allergiesSummary: dto.allergiesSummary }),
        ...(dto.chronicConditionsSummary && { chronicConditionsSummary: dto.chronicConditionsSummary }),
        ...(dto.primaryLanguage && { primaryLanguage: dto.primaryLanguage }),
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { isProfileComplete: true },
    });

    await this.auditService.log({
      action: 'UPDATE_PATIENT_PROFILE',
      actorUserId: userId,
      targetPatientId: userId,
    });

    return profile;
  }

  async updateClinicianProfile(userId: string, dto: UpdateClinicianProfileDto) {
    const profile = await this.prisma.clinicianProfile.upsert({
      where: { userId },
      create: {
        userId,
        licenseNumber: dto.licenseNumber,
        specialization: dto.specialization,
        facilityName: dto.facilityName,
      },
      update: {
        licenseNumber: dto.licenseNumber,
        specialization: dto.specialization,
        facilityName: dto.facilityName,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { role: UserRole.CLINICIAN, isProfileComplete: true },
    });

    await this.auditService.log({
      action: 'UPDATE_CLINICIAN_PROFILE',
      actorUserId: userId,
    });

    return profile;
  }

  async addDependent(primaryUserId: string, dto: AddDependentDto) {
    const dependentUser = await this.prisma.user.create({
      data: {
        displayName: dto.displayName,
        email: dto.email || null,
        role: UserRole.PATIENT,
        isProfileComplete: true,
        patientProfile: {
          create: {
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          },
        },
      },
    });

    const relationship = await this.prisma.familyRelationship.create({
      data: {
        primaryUserId,
        dependentUserId: dependentUser.id,
        relationshipType: dto.relationshipType,
      },
      include: {
        dependentUser: {
          include: { patientProfile: true },
        },
      },
    });

    await this.auditService.log({
      action: 'ADD_DEPENDENT',
      actorUserId: primaryUserId,
      targetPatientId: dependentUser.id,
      details: { relationshipType: dto.relationshipType },
    });

    return relationship;
  }

  async getDependents(primaryUserId: string) {
    return this.prisma.familyRelationship.findMany({
      where: { primaryUserId },
      include: {
        dependentUser: {
          include: { patientProfile: true },
        },
      },
    });
  }
}
