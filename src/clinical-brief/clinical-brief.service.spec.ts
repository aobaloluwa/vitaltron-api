import { Test, TestingModule } from '@nestjs/testing';
import { ClinicalBriefService } from './clinical-brief.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RecordType } from '../../generated/prisma/enums';

describe('ClinicalBriefService', () => {
  let service: ClinicalBriefService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    healthRecord: {
      findMany: jest.fn(),
    },
    clinicalBrief: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    familyRelationship: {
      findUnique: jest.fn(),
    },
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClinicalBriefService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<ClinicalBriefService>(ClinicalBriefService);
  });

  it('should generate a clinical brief', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'p-1',
      displayName: 'John Doe',
      patientProfile: { bloodType: 'O+' },
    });
    mockPrismaService.healthRecord.findMany.mockResolvedValue([
      { id: '1', type: RecordType.ALLERGY, title: 'Penicillin', severity: 'Severe' },
    ]);
    mockPrismaService.clinicalBrief.create.mockResolvedValue({
      id: 'cb-1',
      summaryText: 'Sample Brief Summary',
    });

    const res = await service.generateBrief('p-1', {});
    expect(res).toBeDefined();
    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GENERATE_CLINICAL_BRIEF' }),
    );
  });
});
