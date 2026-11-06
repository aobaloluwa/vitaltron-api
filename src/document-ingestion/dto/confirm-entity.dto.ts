import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { RecordType, VerificationStatus } from '../../../generated/prisma/enums';

export class ConfirmEntityDto {
  @IsOptional()
  @IsEnum(RecordType)
  recordType?: RecordType;

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
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;
}
