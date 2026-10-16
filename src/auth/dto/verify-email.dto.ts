
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

export class VerifyEmailDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'Verification code must be exactly 6 digits.',
  })
  code!: string;
}
