import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DocumentIngestionService } from './document-ingestion.service';
import { DocumentIngestionController } from './document-ingestion.controller';
import { AiExtractorService } from './ai-extractor.service';
import { CloudinaryService } from './cloudinary.service';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max file size
      },
    }),
  ],
  controllers: [DocumentIngestionController],
  providers: [DocumentIngestionService, AiExtractorService, CloudinaryService],
  exports: [DocumentIngestionService, AiExtractorService, CloudinaryService],
})
export class DocumentIngestionModule {}
