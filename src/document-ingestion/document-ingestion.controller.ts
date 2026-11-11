import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentIngestionService } from './document-ingestion.service';
import { CloudinaryService } from './cloudinary.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { ConfirmEntityDto } from './dto/confirm-entity.dto';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentIngestionController {
  constructor(
    private readonly documentService: DocumentIngestionService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadDocument(
    @Request() req: any,
    @UploadedFile() file?: any,
    @Body()
    body?: {
      fileName?: string;
      fileUrl?: string;
      fileType?: string;
      fileSize?: number;
      rawText?: string;
      dataUri?: string;
      uploadSource?: string;
    },
  ) {
    let fileUrl = body?.fileUrl;
    let fileName = body?.fileName || file?.originalname || `scan_${Date.now()}.jpg`;
    let fileType = body?.fileType || file?.mimetype || 'image/jpeg';
    let fileSize = body?.fileSize || file?.size || 1024;

    let effectiveDataUri = body?.dataUri;

    if (file && file.buffer) {
      const base64Str = file.buffer.toString('base64');
      effectiveDataUri = `data:${fileType};base64,${base64Str}`;
      try {
        const cloudinaryResult = await this.cloudinaryService.uploadBuffer(
          file.buffer,
          fileName,
        );
        fileUrl = cloudinaryResult.secure_url;
      } catch {
        fileUrl = `https://res.cloudinary.com/datmds5xl/image/upload/v1/vitaltron_documents/${Date.now()}_${fileName}`;
      }
    } else if (body?.dataUri) {
      effectiveDataUri = body.dataUri;
      try {
        const cloudinaryResult = await this.cloudinaryService.uploadDataUri(
          body.dataUri,
        );
        fileUrl = cloudinaryResult.secure_url;
      } catch {
        fileUrl = `https://res.cloudinary.com/datmds5xl/image/upload/v1/vitaltron_documents/${Date.now()}_${fileName}`;
      }
    }

    if (!fileUrl) {
      fileUrl = `https://res.cloudinary.com/datmds5xl/image/upload/v1/vitaltron_documents/${Date.now()}_${fileName}`;
    }

    return this.documentService.createDocument(req.user.id, {
      fileName,
      fileUrl,
      fileType,
      fileSize,
      rawText: body?.rawText,
      dataUri: effectiveDataUri,
      uploadSource: body?.uploadSource,
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
