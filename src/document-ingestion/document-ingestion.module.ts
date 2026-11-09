import { Module } from '@nestjs/common';
import { DocumentIngestionService } from './document-ingestion.service';
import { DocumentIngestionController } from './document-ingestion.controller';
import { AiExtractorService } from './ai-extractor.service';
import { CloudinaryService } from './cloudinary.service';

@Module({
  controllers: [DocumentIngestionController],
  providers: [DocumentIngestionService, AiExtractorService, CloudinaryService],
  exports: [DocumentIngestionService, AiExtractorService, CloudinaryService],
})
export class DocumentIngestionModule {}
