import { IsOptional, IsString } from 'class-validator';

export class AccessGrantRequestDto {
  @IsOptional()
  @IsString()
  passcode?: string;
}
