-- CreateEnum
DO $$ BEGIN CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'CLINICIAN', 'ADMIN'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "RecordType" AS ENUM ('DIAGNOSIS', 'MEDICATION', 'LAB_TEST', 'ALLERGY', 'PROCEDURE', 'VITAL_SIGN', 'CLINICAL_NOTE'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PATIENT_CONFIRMED', 'CLINICIAN_VERIFIED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "IngestionStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'REVIEW_REQUIRED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "GrantStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "RelationshipType" AS ENUM ('CHILD', 'PARENT', 'SPOUSE', 'DEPENDENT', 'OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "TrackingMode" AS ENUM ('MENSTRUAL', 'CONCEPTION', 'PREGNANCY', 'POSTPARTUM', 'MENOPAUSE'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "CyclePhase" AS ENUM ('MENSTRUAL', 'FOLLICULAR', 'OVULATORY', 'LUTAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "FlowIntensity" AS ENUM ('LIGHT', 'MEDIUM', 'HEAVY', 'VERY_HEAVY', 'SPOTTING'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "CervicalMucusType" AS ENUM ('DRY', 'STICKY', 'CREAMY', 'EGG_WHITE', 'WATERY'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "PregnancyType" AS ENUM ('SINGLETON', 'TWINS', 'TRIPLETS', 'OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "DeliveryType" AS ENUM ('VAGINAL', 'CESAREAN', 'VBAC', 'OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "ContraceptionType" AS ENUM ('PILL', 'IUD_HORMONAL', 'IUD_COPPER', 'IMPLANT', 'PATCH', 'RING', 'INJECTION', 'CONDOM', 'OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "RemindFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "ArticleCategory" AS ENUM ('MENSTRUATION', 'OVULATION_FERTILITY', 'PREGNANCY', 'POSTPARTUM', 'MENOPAUSE', 'CONTRACEPTION', 'SEXUAL_HEALTH', 'GENERAL_WELLNESS'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isProfileComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'PATIENT';

-- CreateTable
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "push_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "device" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "patient_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" VARCHAR(50),
    "bloodType" VARCHAR(10),
    "emergencyContactName" VARCHAR(100),
    "emergencyContactPhone" VARCHAR(20),
    "allergiesSummary" TEXT,
    "chronicConditionsSummary" TEXT,
    "primaryLanguage" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "clinician_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "licenseNumber" VARCHAR(100) NOT NULL,
    "specialization" VARCHAR(100) NOT NULL,
    "facilityName" VARCHAR(150) NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinician_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "family_relationships" (
    "id" UUID NOT NULL,
    "primaryUserId" UUID NOT NULL,
    "dependentUserId" UUID NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL DEFAULT 'DEPENDENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "health_records" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "type" "RecordType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "eventDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" VARCHAR(50),
    "status" VARCHAR(50),
    "facilityName" VARCHAR(150),
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "fhirData" JSONB,
    "documentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_documents" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" VARCHAR(100) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksum" VARCHAR(64),
    "uploadSource" VARCHAR(50) NOT NULL DEFAULT 'USER_UPLOAD',
    "ingestionStatus" "IngestionStatus" NOT NULL DEFAULT 'PENDING',
    "extractedText" TEXT,
    "extractedMetaData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "extracted_entities" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "recordType" "RecordType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedRecordId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extracted_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "clinical_briefs" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "generatedById" UUID NOT NULL,
    "summaryText" TEXT NOT NULL,
    "activeMedications" JSONB NOT NULL,
    "severeAllergies" JSONB NOT NULL,
    "recentLabs" JSONB NOT NULL,
    "riskFlags" JSONB NOT NULL,
    "briefPurpose" VARCHAR(100) NOT NULL DEFAULT 'CLINICAL_CONSULTATION',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "access_grants" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "passcodeHash" VARCHAR(255),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxAccessCount" INTEGER NOT NULL DEFAULT 5,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "allowedRecordTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recipientName" VARCHAR(150),
    "status" "GrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "grant_access_logs" (
    "id" UUID NOT NULL,
    "accessGrantId" UUID NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessorIp" VARCHAR(45),
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "grant_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "actorUserId" UUID,
    "targetPatientId" UUID,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "womens_health_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "activeMode" "TrackingMode" NOT NULL DEFAULT 'MENSTRUAL',
    "isOnboarded" BOOLEAN NOT NULL DEFAULT false,
    "declaredSex" VARCHAR(20),
    "averageCycleLength" INTEGER NOT NULL DEFAULT 28,
    "averagePeriodDuration" INTEGER NOT NULL DEFAULT 5,
    "lastPeriodStart" TIMESTAMP(3),
    "estimatedDueDate" TIMESTAMP(3),
    "isHighPrivacy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "womens_health_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "menstrual_cycles" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "cycleLength" INTEGER,
    "periodDuration" INTEGER,
    "isIrregular" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menstrual_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "period_records" (
    "id" UUID NOT NULL,
    "cycleId" UUID,
    "patientId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "flow" "FlowIntensity" NOT NULL DEFAULT 'MEDIUM',
    "isSpotting" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "daily_cycle_logs" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "symptoms" JSONB,
    "mood" VARCHAR(100),
    "cervicalMucus" "CervicalMucusType",
    "bbt" DOUBLE PRECISION,
    "sexualActivity" BOOLEAN DEFAULT false,
    "ovulationTestResult" VARCHAR(50),
    "pregnancyTestResult" VARCHAR(50),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_cycle_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "fertility_profiles" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "goal" VARCHAR(100) NOT NULL DEFAULT 'CONCEPTION',
    "startedTryingDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fertility_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pregnancy_profiles" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "lmpDate" TIMESTAMP(3),
    "confirmedDueDate" TIMESTAMP(3),
    "conceptionDate" TIMESTAMP(3),
    "pregnancyType" "PregnancyType" NOT NULL DEFAULT 'SINGLETON',
    "babiesCount" INTEGER NOT NULL DEFAULT 1,
    "healthcareProvider" VARCHAR(150),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pregnancy_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pregnancy_milestones" (
    "id" UUID NOT NULL,
    "pregnancyId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "milestoneDate" TIMESTAMP(3) NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "category" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pregnancy_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pregnancy_weights" (
    "id" UUID NOT NULL,
    "pregnancyId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pregnancy_weights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "kick_sessions" (
    "id" UUID NOT NULL,
    "pregnancyId" UUID NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "kickCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kick_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "contraction_sessions" (
    "id" UUID NOT NULL,
    "pregnancyId" UUID NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "intervalMinutes" DOUBLE PRECISION,
    "severity" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contraction_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pregnancy_journals" (
    "id" UUID NOT NULL,
    "pregnancyId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "weekNumber" INTEGER,
    "mood" VARCHAR(50),
    "photoUrl" TEXT,
    "isMemory" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pregnancy_journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "postpartum_profiles" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "deliveryType" "DeliveryType" NOT NULL DEFAULT 'VAGINAL',
    "recoveryNotes" TEXT,
    "moodRating" INTEGER,
    "lochiaStatus" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "postpartum_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "breastfeeding_records" (
    "id" UUID NOT NULL,
    "postpartumId" UUID NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "breastSide" VARCHAR(20),
    "durationMinutes" INTEGER,
    "expressedAmountMl" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "breastfeeding_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "menopause_profiles" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "stage" VARCHAR(50),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menopause_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "menopause_symptom_logs" (
    "id" UUID NOT NULL,
    "menopauseId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hotFlashSeverity" INTEGER,
    "nightSweats" BOOLEAN DEFAULT false,
    "sleepQuality" INTEGER,
    "brainFogRating" INTEGER,
    "moodChanges" VARCHAR(100),
    "triggers" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menopause_symptom_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "contraception_profiles" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "type" "ContraceptionType" NOT NULL DEFAULT 'PILL',
    "brandName" VARCHAR(100),
    "startDate" TIMESTAMP(3) NOT NULL,
    "replacementDate" TIMESTAMP(3),
    "reminderTime" VARCHAR(20),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contraception_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sexual_health_records" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "activityType" VARCHAR(100),
    "protectionUsed" BOOLEAN DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sexual_health_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sti_screening_records" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "testDate" TIMESTAMP(3) NOT NULL,
    "testType" VARCHAR(150) NOT NULL,
    "result" VARCHAR(100),
    "provider" VARCHAR(150),
    "followUpDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sti_screening_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "womens_health_articles" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" "ArticleCategory" NOT NULL DEFAULT 'GENERAL_WELLNESS',
    "readTimeMinutes" INTEGER NOT NULL DEFAULT 5,
    "authorName" VARCHAR(100) NOT NULL,
    "reviewerName" VARCHAR(100) NOT NULL,
    "reviewerTitle" VARCHAR(150) NOT NULL,
    "lastReviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "womens_health_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "article_bookmarks" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "womens_health_reminders" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "reminderTime" VARCHAR(20) NOT NULL,
    "frequency" "RemindFrequency" NOT NULL DEFAULT 'DAILY',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "womens_health_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "womens_health_reports" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "reportType" VARCHAR(50) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "summaryData" JSONB NOT NULL,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "womens_health_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "push_tokens_userId_idx" ON "push_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "patient_profiles_userId_key" ON "patient_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "clinician_profiles_userId_key" ON "clinician_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "family_relationships_primaryUserId_dependentUserId_key" ON "family_relationships"("primaryUserId", "dependentUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "health_records_patientId_eventDate_idx" ON "health_records"("patientId", "eventDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "health_records_type_idx" ON "health_records"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_documents_userId_idx" ON "medical_documents"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "extracted_entities_documentId_idx" ON "extracted_entities"("documentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "clinical_briefs_patientId_generatedAt_idx" ON "clinical_briefs"("patientId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "access_grants_tokenHash_key" ON "access_grants"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "access_grants_tokenHash_idx" ON "access_grants"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "access_grants_patientId_idx" ON "access_grants"("patientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "grant_access_logs_accessGrantId_idx" ON "grant_access_logs"("accessGrantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_actorUserId_idx" ON "audit_logs"("actorUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_targetPatientId_idx" ON "audit_logs"("targetPatientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "womens_health_profiles_userId_key" ON "womens_health_profiles"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "menstrual_cycles_patientId_startDate_idx" ON "menstrual_cycles"("patientId", "startDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "period_records_patientId_date_idx" ON "period_records"("patientId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "daily_cycle_logs_patientId_date_idx" ON "daily_cycle_logs"("patientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "daily_cycle_logs_patientId_date_key" ON "daily_cycle_logs"("patientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "fertility_profiles_patientId_key" ON "fertility_profiles"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pregnancy_profiles_patientId_key" ON "pregnancy_profiles"("patientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pregnancy_milestones_pregnancyId_idx" ON "pregnancy_milestones"("pregnancyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pregnancy_weights_pregnancyId_date_idx" ON "pregnancy_weights"("pregnancyId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "kick_sessions_pregnancyId_startTime_idx" ON "kick_sessions"("pregnancyId", "startTime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contraction_sessions_pregnancyId_startTime_idx" ON "contraction_sessions"("pregnancyId", "startTime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pregnancy_journals_pregnancyId_createdAt_idx" ON "pregnancy_journals"("pregnancyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "postpartum_profiles_patientId_key" ON "postpartum_profiles"("patientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "breastfeeding_records_postpartumId_startTime_idx" ON "breastfeeding_records"("postpartumId", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "menopause_profiles_patientId_key" ON "menopause_profiles"("patientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "menopause_symptom_logs_menopauseId_date_idx" ON "menopause_symptom_logs"("menopauseId", "date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "contraception_profiles_patientId_key" ON "contraception_profiles"("patientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sexual_health_records_patientId_date_idx" ON "sexual_health_records"("patientId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sti_screening_records_patientId_testDate_idx" ON "sti_screening_records"("patientId", "testDate");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "womens_health_articles_slug_key" ON "womens_health_articles"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "womens_health_articles_category_idx" ON "womens_health_articles"("category");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "article_bookmarks_userId_articleId_key" ON "article_bookmarks"("userId", "articleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "womens_health_reminders_userId_idx" ON "womens_health_reminders"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "womens_health_reports_userId_createdAt_idx" ON "womens_health_reports"("userId", "createdAt");

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "clinician_profiles" ADD CONSTRAINT "clinician_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "family_relationships" ADD CONSTRAINT "family_relationships_primaryUserId_fkey" FOREIGN KEY ("primaryUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "family_relationships" ADD CONSTRAINT "family_relationships_dependentUserId_fkey" FOREIGN KEY ("dependentUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "health_records" ADD CONSTRAINT "health_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "health_records" ADD CONSTRAINT "health_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "health_records" ADD CONSTRAINT "health_records_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "medical_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "extracted_entities" ADD CONSTRAINT "extracted_entities_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "medical_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "extracted_entities" ADD CONSTRAINT "extracted_entities_confirmedRecordId_fkey" FOREIGN KEY ("confirmedRecordId") REFERENCES "health_records"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "clinical_briefs" ADD CONSTRAINT "clinical_briefs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "clinical_briefs" ADD CONSTRAINT "clinical_briefs_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "grant_access_logs" ADD CONSTRAINT "grant_access_logs_accessGrantId_fkey" FOREIGN KEY ("accessGrantId") REFERENCES "access_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_targetPatientId_fkey" FOREIGN KEY ("targetPatientId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "womens_health_profiles" ADD CONSTRAINT "womens_health_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "menstrual_cycles" ADD CONSTRAINT "menstrual_cycles_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "period_records" ADD CONSTRAINT "period_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "period_records" ADD CONSTRAINT "period_records_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "menstrual_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "daily_cycle_logs" ADD CONSTRAINT "daily_cycle_logs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "fertility_profiles" ADD CONSTRAINT "fertility_profiles_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "pregnancy_profiles" ADD CONSTRAINT "pregnancy_profiles_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "pregnancy_milestones" ADD CONSTRAINT "pregnancy_milestones_pregnancyId_fkey" FOREIGN KEY ("pregnancyId") REFERENCES "pregnancy_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "pregnancy_weights" ADD CONSTRAINT "pregnancy_weights_pregnancyId_fkey" FOREIGN KEY ("pregnancyId") REFERENCES "pregnancy_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "kick_sessions" ADD CONSTRAINT "kick_sessions_pregnancyId_fkey" FOREIGN KEY ("pregnancyId") REFERENCES "pregnancy_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "contraction_sessions" ADD CONSTRAINT "contraction_sessions_pregnancyId_fkey" FOREIGN KEY ("pregnancyId") REFERENCES "pregnancy_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "pregnancy_journals" ADD CONSTRAINT "pregnancy_journals_pregnancyId_fkey" FOREIGN KEY ("pregnancyId") REFERENCES "pregnancy_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "postpartum_profiles" ADD CONSTRAINT "postpartum_profiles_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "breastfeeding_records" ADD CONSTRAINT "breastfeeding_records_postpartumId_fkey" FOREIGN KEY ("postpartumId") REFERENCES "postpartum_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "menopause_profiles" ADD CONSTRAINT "menopause_profiles_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "menopause_symptom_logs" ADD CONSTRAINT "menopause_symptom_logs_menopauseId_fkey" FOREIGN KEY ("menopauseId") REFERENCES "menopause_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "contraception_profiles" ADD CONSTRAINT "contraception_profiles_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "sexual_health_records" ADD CONSTRAINT "sexual_health_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "sti_screening_records" ADD CONSTRAINT "sti_screening_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "article_bookmarks" ADD CONSTRAINT "article_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "article_bookmarks" ADD CONSTRAINT "article_bookmarks_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "womens_health_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "womens_health_reminders" ADD CONSTRAINT "womens_health_reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "womens_health_reports" ADD CONSTRAINT "womens_health_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

