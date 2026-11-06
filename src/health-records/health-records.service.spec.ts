import { Test, TestingModule } from '@nestjs/testing';
import { HealthRecordsService } from './health-records.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RecordType, VerificationStatus } from '../../generated/prisma/enums';

describe('HealthRecordsService', () => {
  let service: HealthRecordsService;

  const mockPrismaService = {
    healthRecord: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    familyRelationship: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthRecordsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<HealthRecordsService>(HealthRecordsService);
  });

  it('should create a health record', async () => {
    const recordData = {
      id: 'hr-1',
      patientId: 'p-1',
      createdById: 'p-1',
      type: RecordType.MEDICATION,
      title: 'Aspirin 81mg',
    };
    mockPrismaService.healthRecord.create.mockResolvedValue(recordData);

    const result = await service.createRecord('p-1', {
      type: RecordType.MEDICATION,
      title: 'Aspirin 81mg',
    });

    expect(result).toEqual(recordData);
    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE_HEALTH_RECORD' }),
    );
  });
});
