import { IsOptional, IsString, IsEnum, IsDateString, IsObject } from 'class-validator';
import { RecordType, VerificationStatus } from '../../../generated/prisma/enums';

export class UpdateHealthRecordDto {
  @IsOptional()
  @IsEnum(RecordType)
  type?: RecordType;

  @IsOptional()
  @IsString()
  title?: string;

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
}
