import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';

export class UpdatePatientProfileDto {
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  bloodType?: string;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  allergiesSummary?: string;

  @IsOptional()
  @IsString()
  chronicConditionsSummary?: string;

  @IsOptional()
  @IsString()
  primaryLanguage?: string;
}
