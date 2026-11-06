import { Module } from '@nestjs/common';
import { DocumentIngestionService } from './document-ingestion.service';
import { DocumentIngestionController } from './document-ingestion.controller';
import { AiExtractorService } from './ai-extractor.service';

@Module({
  controllers: [DocumentIngestionController],
  providers: [DocumentIngestionService, AiExtractorService],
  exports: [DocumentIngestionService, AiExtractorService],
})
export class DocumentIngestionModule {}
