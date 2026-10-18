
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleSignInDto {
  @ApiProperty({
    description: 'Google ID token obtained by the mobile app',
    example: 'eyJhbGciOiJSUzI1NiIs...',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  idToken!: string;
}
