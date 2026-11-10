import { IsOptional, IsString } from 'class-validator';

export class AccessGrantRequestDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  passcode?: string;
}
