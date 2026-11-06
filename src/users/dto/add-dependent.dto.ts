import { IsNotEmpty, IsString, IsEnum, IsOptional, IsDateString, IsEmail } from 'class-validator';
import { RelationshipType } from '../../../generated/prisma/enums';

export class AddDependentDto {
  @IsNotEmpty()
  @IsString()
  displayName: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsNotEmpty()
  @IsEnum(RelationshipType)
  relationshipType: RelationshipType;
}
