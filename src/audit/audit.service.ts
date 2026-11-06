import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAuditLogDto {
  action: string;
  actorUserId?: string;
  targetPatientId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(dto: CreateAuditLogDto) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          action: dto.action,
          actorUserId: dto.actorUserId || null,
          targetPatientId: dto.targetPatientId || null,
          ipAddress: dto.ipAddress || null,
          userAgent: dto.userAgent || null,
          details: dto.details ? (dto.details as any) : undefined,
        },
      });
    } catch (error) {
      // Audit logging should not crash the primary flow if error occurs, but output log
      console.error('Failed to create audit log:', error);
      return null;
    }
  }

  async getLogsForUser(userId: string, limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          OR: [{ actorUserId: userId }, { targetPatientId: userId }],
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.auditLog.count({
        where: {
          OR: [{ actorUserId: userId }, { targetPatientId: userId }],
        },
      }),
    ]);

    return { logs, total, page, limit };
  }
}
