import { Injectable, NotFoundException, ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccessGrantDto } from './dto/create-access-grant.dto';
import { AccessGrantRequestDto } from './dto/access-grant-request.dto';
import { AuditService } from '../audit/audit.service';
import { ClinicalBriefService } from '../clinical-brief/clinical-brief.service';
import { GrantStatus } from '../../generated/prisma/enums';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';

@Injectable()
export class ControlledSharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly clinicalBriefService: ClinicalBriefService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async createAccessGrant(creatorId: string, dto: CreateAccessGrantDto) {
    const targetPatientId = dto.patientId || creatorId;

    const tokenRaw = 'vtl_share_' + crypto.randomBytes(24).toString('hex');
    const tokenHash = this.hashToken(tokenRaw);

    let passcodeHash: string | null = null;
    if (dto.passcode) {
      passcodeHash = await argon2.hash(dto.passcode);
    }

    const expiresInHours = dto.expiresInHours || 24;
    const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000);
    const maxAccessCount = dto.maxAccessCount || 5;

    const grant = await this.prisma.accessGrant.create({
      data: {
        patientId: targetPatientId,
        createdById: creatorId,
        tokenHash,
        passcodeHash,
        expiresAt,
        maxAccessCount,
        allowedRecordTypes: dto.allowedRecordTypes ? (dto.allowedRecordTypes as any) : [],
        recipientName: dto.recipientName || null,
        status: GrantStatus.ACTIVE,
      },
      include: {
        patient: { select: { id: true, displayName: true } },
      },
    });

    await this.auditService.log({
      action: 'CREATE_SHARE_ACCESS_GRANT',
      actorUserId: creatorId,
      targetPatientId: targetPatientId,
      details: { grantId: grant.id, expiresAt, maxAccessCount, recipientName: dto.recipientName },
    });

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:8081';
    const shareableUrl = `${baseUrl}/share?token=${tokenRaw}`;
    const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(shareableUrl)}`;

    return {
      grantId: grant.id,
      shareableToken: tokenRaw,
      shareableUrl,
      qrCodeImageUrl,
      qrCodePayload: shareableUrl,
      expiresAt: grant.expiresAt,
      maxAccessCount: grant.maxAccessCount,
      requiresPasscode: !!dto.passcode,
      recipientName: grant.recipientName,
      allowedRecordTypes: grant.allowedRecordTypes,
    };
  }

  async getUserGrants(userId: string) {
    const grants = await this.prisma.accessGrant.findMany({
      where: {
        OR: [{ createdById: userId }, { patientId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        accessLogs: {
          orderBy: { accessedAt: 'desc' },
          take: 5,
        },
      },
    });

    const now = new Date();
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:8081';

    return grants.map((g) => {
      let isExpired = g.expiresAt < now || g.accessCount >= g.maxAccessCount;
      let effectiveStatus = g.status;
      if (g.status === GrantStatus.ACTIVE && isExpired) {
        effectiveStatus = GrantStatus.EXPIRED;
      }

      const shareableUrl = `${baseUrl}/share?token=${g.id}`;
      const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(shareableUrl)}`;

      return {
        ...g,
        status: effectiveStatus,
        shareableUrl,
        qrCodeImageUrl,
        tokenHash: undefined,
        passcodeHash: undefined,
      };
    });
  }

  async revokeGrant(userId: string, grantId: string) {
    const grant = await this.prisma.accessGrant.findUnique({
      where: { id: grantId },
    });

    if (!grant) {
      throw new NotFoundException('Access grant not found');
    }

    if (grant.createdById !== userId && grant.patientId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const updated = await this.prisma.accessGrant.update({
      where: { id: grantId },
      data: {
        status: GrantStatus.REVOKED,
        revokedAt: new Date(),
      },
    });

    await this.auditService.log({
      action: 'REVOKE_SHARE_ACCESS_GRANT',
      actorUserId: userId,
      targetPatientId: grant.patientId,
      details: { grantId },
    });

    return { success: true, message: 'Access grant revoked successfully' };
  }

  async accessGrantByToken(tokenRaw: string, dto: AccessGrantRequestDto, ipAddress?: string, userAgent?: string) {
    const tokenHash = this.hashToken(tokenRaw);

    // Support finding by tokenHash or direct grant id
    let grant = await this.prisma.accessGrant.findUnique({
      where: { tokenHash },
      include: {
        patient: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });

    if (!grant) {
      grant = await this.prisma.accessGrant.findUnique({
        where: { id: tokenRaw },
        include: {
          patient: {
            select: { id: true, displayName: true, email: true },
          },
        },
      });
    }

    if (!grant) {
      throw new NotFoundException('Invalid or expired clinical share link');
    }

    const now = new Date();

    if (grant.status === GrantStatus.REVOKED) {
      await this.logGrantAccess(grant.id, ipAddress, userAgent, false);
      throw new ForbiddenException('This access grant has been revoked by the patient');
    }

    if (grant.expiresAt < now) {
      await this.prisma.accessGrant.update({
        where: { id: grant.id },
        data: { status: GrantStatus.EXPIRED },
      });
      await this.logGrantAccess(grant.id, ipAddress, userAgent, false);
      throw new ForbiddenException('This access link has expired');
    }

    if (grant.accessCount >= grant.maxAccessCount) {
      await this.logGrantAccess(grant.id, ipAddress, userAgent, false);
      throw new ForbiddenException('Maximum allowed access count for this link has been reached');
    }

    if (grant.passcodeHash) {
      if (!dto.passcode) {
        throw new UnauthorizedException('A passcode/PIN is required to access these medical records');
      }
      const isValidPasscode = await argon2.verify(grant.passcodeHash, dto.passcode);
      if (!isValidPasscode) {
        await this.logGrantAccess(grant.id, ipAddress, userAgent, false);
        throw new UnauthorizedException('Incorrect passcode');
      }
    }

    await this.prisma.accessGrant.update({
      where: { id: grant.id },
      data: { accessCount: grant.accessCount + 1 },
    });

    await this.logGrantAccess(grant.id, ipAddress, userAgent, true);

    const brief = await this.clinicalBriefService.generateBrief(grant.createdById, {
      patientId: grant.patientId,
      briefPurpose: `SHARED_POINT_OF_CARE_ACCESS (${grant.recipientName || 'Clinician Portal'})`,
    });

    const whereRecords: any = { patientId: grant.patientId };
    if (grant.allowedRecordTypes && grant.allowedRecordTypes.length > 0) {
      whereRecords.type = { in: grant.allowedRecordTypes };
    }

    const records = await this.prisma.healthRecord.findMany({
      where: whereRecords,
      orderBy: { eventDate: 'desc' },
      take: 20,
    });

    await this.auditService.log({
      action: 'CLINICAL_ACCESS_GRANTED_VIA_SHARE_LINK',
      targetPatientId: grant.patientId,
      ipAddress,
      userAgent,
      details: { grantId: grant.id, recipientName: grant.recipientName, remainingAccesses: grant.maxAccessCount - (grant.accessCount + 1) },
    });

    return {
      patientName: grant.patient.displayName,
      accessGrantId: grant.id,
      recipientName: grant.recipientName,
      expiresAt: grant.expiresAt,
      remainingAccesses: grant.maxAccessCount - (grant.accessCount + 1),
      clinicalBrief: brief,
      timelineRecords: records,
    };
  }

  private async logGrantAccess(accessGrantId: string, ipAddress?: string, userAgent?: string, success = true) {
    try {
      await this.prisma.grantAccessLog.create({
        data: {
          accessGrantId,
          accessorIp: ipAddress || null,
          userAgent: userAgent || null,
          success,
        },
      });
    } catch (e) {
      console.error('Failed to write grant access log:', e);
    }
  }
}
