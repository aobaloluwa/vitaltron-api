import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RelationshipType, UserRole } from '../../generated/prisma/enums';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    patientProfile: {
      upsert: jest.fn(),
    },
    clinicianProfile: {
      upsert: jest.fn(),
    },
    familyRelationship: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should update patient profile', async () => {
    mockPrismaService.patientProfile.upsert.mockResolvedValue({ id: 'p-1', bloodType: 'O+' });
    mockPrismaService.user.update.mockResolvedValue({ id: 'u-1', isProfileComplete: true });

    const res = await service.updatePatientProfile('u-1', { bloodType: 'O+' });
    expect(res).toEqual({ id: 'p-1', bloodType: 'O+' });
    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE_PATIENT_PROFILE' }),
    );
  });
});
