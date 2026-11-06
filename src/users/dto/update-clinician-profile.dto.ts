import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class UpdateClinicianProfileDto {
  @IsNotEmpty()
  @IsString()
  licenseNumber: string;

  @IsNotEmpty()
  @IsString()
  specialization: string;

  @IsNotEmpty()
  @IsString()
  facilityName: string;
}
