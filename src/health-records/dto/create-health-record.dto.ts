import { IsNotEmpty, IsString, IsEnum, IsOptional, IsDateString, IsObject } from 'class-validator';
import { RecordType, VerificationStatus } from '../../../generated/prisma/enums';

export class CreateHealthRecordDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsNotEmpty()
  @IsEnum(RecordType)
  type: RecordType;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  facilityName?: string;

  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @IsOptional()
  @IsObject()
  fhirData?: Record<string, any>;

  @IsOptional()
  @IsString()
  documentId?: string;
}
