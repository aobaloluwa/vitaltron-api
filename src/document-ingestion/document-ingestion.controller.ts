import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { DocumentIngestionService } from './document-ingestion.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { ConfirmEntityDto } from './dto/confirm-entity.dto';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentIngestionController {
  constructor(private readonly documentService: DocumentIngestionService) {}

  @Post('upload')
  async uploadDocument(
    @Request() req: any,
    @Body() body: { fileName: string; fileUrl: string; fileType?: string; fileSize?: number; rawText?: string },
  ) {
    return this.documentService.createDocument(req.user.id, {
      fileName: body.fileName,
      fileUrl: body.fileUrl || `https://storage.vitaltron.health/docs/${Date.now()}_${body.fileName}`,
      fileType: body.fileType || 'application/pdf',
      fileSize: body.fileSize || 1024,
      rawText: body.rawText,
    });
  }

  @Get()
  async getUserDocuments(@Request() req: any) {
    return this.documentService.getUserDocuments(req.user.id);
  }

  @Get(':id')
  async getDocumentById(@Request() req: any, @Param('id') id: string) {
    return this.documentService.getDocumentById(req.user.id, id);
  }

  @Post('entities/:entityId/confirm')
  async confirmExtractedEntity(
    @Request() req: any,
    @Param('entityId') entityId: string,
    @Body() dto: ConfirmEntityDto,
  ) {
    return this.documentService.confirmExtractedEntity(req.user.id, entityId, dto);
  }
}
