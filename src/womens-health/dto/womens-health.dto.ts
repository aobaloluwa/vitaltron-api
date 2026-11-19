import {
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  IsNumber,
  IsBoolean,
  IsDateString,
  Min,
  Max,
  IsArray,
} from 'class-validator';
import {
  TrackingMode,
  FlowIntensity,
  CervicalMucusType,
  PregnancyType,
  DeliveryType,
  ContraceptionType,
  RemindFrequency,
  ArticleCategory,
} from '../../../generated/prisma/enums';

export class UpdateProfileDto {
  @IsOptional()
  @IsEnum(TrackingMode)
  activeMode?: TrackingMode;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(45)
  averageCycleLength?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(15)
  averagePeriodDuration?: number;

  @IsOptional()
  @IsDateString()
  lastPeriodStart?: string;

  @IsOptional()
  @IsDateString()
  estimatedDueDate?: string;

  @IsOptional()
  @IsBoolean()
  isHighPrivacy?: boolean;
}

export class CreatePeriodDto {
  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(FlowIntensity)
  flow?: FlowIntensity;

  @IsOptional()
  @IsBoolean()
  isSpotting?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class LogDailyCycleDto {
  @IsDateString()
  date: string;

  @IsOptional()
  symptoms?: any;

  @IsOptional()
  @IsString()
  mood?: string;

  @IsOptional()
  @IsEnum(CervicalMucusType)
  cervicalMucus?: CervicalMucusType;

  @IsOptional()
  @IsNumber()
  bbt?: number;

  @IsOptional()
  @IsBoolean()
  sexualActivity?: boolean;

  @IsOptional()
  @IsString()
  ovulationTestResult?: string;

  @IsOptional()
  @IsString()
  pregnancyTestResult?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreatePregnancyProfileDto {
  @IsOptional()
  @IsDateString()
  lmpDate?: string;

  @IsOptional()
  @IsDateString()
  confirmedDueDate?: string;

  @IsOptional()
  @IsDateString()
  conceptionDate?: string;

  @IsOptional()
  @IsEnum(PregnancyType)
  pregnancyType?: PregnancyType;

  @IsOptional()
  @IsInt()
  @Min(1)
  babiesCount?: number;

  @IsOptional()
  @IsString()
  healthcareProvider?: string;
}

export class LogKickSessionDto {
  @IsDateString()
  startTime: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsInt()
  @Min(1)
  kickCount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class LogContractionSessionDto {
  @IsDateString()
  startTime: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsInt()
  durationSeconds?: number;

  @IsOptional()
  @IsNumber()
  intervalMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  severity?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateJournalDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsInt()
  weekNumber?: number;

  @IsOptional()
  @IsString()
  mood?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsBoolean()
  isMemory?: boolean;
}

export class CreatePostpartumDto {
  @IsDateString()
  deliveryDate: string;

  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;

  @IsOptional()
  @IsString()
  recoveryNotes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  moodRating?: number;

  @IsOptional()
  @IsString()
  lochiaStatus?: string;
}

export class LogBreastfeedingDto {
  @IsDateString()
  startTime: string;

  @IsOptional()
  @IsString()
  breastSide?: string;

  @IsOptional()
  @IsInt()
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  expressedAmountMl?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class LogMenopauseSymptomDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  hotFlashSeverity?: number;

  @IsOptional()
  @IsBoolean()
  nightSweats?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  sleepQuality?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  brainFogRating?: number;

  @IsOptional()
  @IsString()
  moodChanges?: string;

  @IsOptional()
  @IsString()
  triggers?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateContraceptionDto {
  @IsEnum(ContraceptionType)
  type: ContraceptionType;

  @IsOptional()
  @IsString()
  brandName?: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  replacementDate?: string;

  @IsOptional()
  @IsString()
  reminderTime?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class LogSexualHealthDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  activityType?: string;

  @IsOptional()
  @IsBoolean()
  protectionUsed?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class LogStiScreeningDto {
  @IsDateString()
  testDate: string;

  @IsString()
  testType: string;

  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateReminderDto {
  @IsString()
  title: string;

  @IsString()
  category: string;

  @IsString()
  reminderTime: string;

  @IsOptional()
  @IsEnum(RemindFrequency)
  frequency?: RemindFrequency;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateArticleDto {
  @IsString()
  slug: string;

  @IsString()
  title: string;

  @IsString()
  summary: string;

  @IsString()
  content: string;

  @IsEnum(ArticleCategory)
  category: ArticleCategory;

  @IsOptional()
  @IsInt()
  readTimeMinutes?: number;

  @IsString()
  authorName: string;

  @IsString()
  reviewerName: string;

  @IsString()
  reviewerTitle: string;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class GenerateReportDto {
  @IsString()
  title: string;

  @IsString()
  reportType: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
