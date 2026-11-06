import { IsOptional, IsString } from 'class-validator';

export class GenerateBriefDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  briefPurpose?: string; // e.g. "EMERGENCY", "CLINICAL_CONSULTATION", "TRAVEL", "SPECIALIST_REFERRAL"
}
