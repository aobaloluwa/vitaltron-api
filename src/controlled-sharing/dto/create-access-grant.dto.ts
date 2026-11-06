import { IsOptional, IsString, IsInt, Min, IsArray, IsEnum } from 'class-validator';
import { RecordType } from '../../../generated/prisma/enums';

export class CreateAccessGrantDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  passcode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAccessCount?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(RecordType, { each: true })
  allowedRecordTypes?: RecordType[];

  @IsOptional()
  @IsString()
  recipientName?: string;
}
