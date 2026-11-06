import { Test, TestingModule } from '@nestjs/testing';
import { ControlledSharingService } from './controlled-sharing.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ClinicalBriefService } from '../clinical-brief/clinical-brief.service';
import { GrantStatus } from '../../generated/prisma/enums';

describe('ControlledSharingService', () => {
  let service: ControlledSharingService;

  const mockPrismaService = {
    accessGrant: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    grantAccessLog: {
      create: jest.fn(),
    },
    healthRecord: {
      findMany: jest.fn(),
    },
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  const mockClinicalBriefService = {
    generateBrief: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ControlledSharingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: ClinicalBriefService, useValue: mockClinicalBriefService },
      ],
    }).compile();

    service = module.get<ControlledSharingService>(ControlledSharingService);
  });

  it('should create an access grant', async () => {
    mockPrismaService.accessGrant.create.mockResolvedValue({
      id: 'g-1',
      expiresAt: new Date(),
      maxAccessCount: 5,
      recipientName: 'Dr. House',
    });

    const res = await service.createAccessGrant('u-1', { recipientName: 'Dr. House' });
    expect(res).toBeDefined();
    expect(res.shareableToken).toBeDefined();
    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE_SHARE_ACCESS_GRANT' }),
    );
  });
});
