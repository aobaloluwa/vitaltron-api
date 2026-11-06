import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { RecordType, VerificationStatus } from '../../../generated/prisma/enums';

export class QueryTimelineDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsEnum(RecordType)
  type?: RecordType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @IsOptional()
  page?: string;

  @IsOptional()
  limit?: string;
}
