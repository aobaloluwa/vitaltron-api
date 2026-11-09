import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly configService: ConfigService) {
    const cloudName =
      this.configService.get<string>('CLOUDINARY_CLOUD_NAME') || 'datmds5xl';
    const apiKey =
      this.configService.get<string>('CLOUDINARY_API_KEY') || '328926332632131';
    const apiSecret =
      this.configService.get<string>('CLOUDINARY_API_SECRET') ||
      '1A6Z4RA4YlfNS1WDV-t0yy-8fHo';

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    this.logger.log(`Cloudinary Service initialized for cloud: ${cloudName}`);
  }

  async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    folder = 'vitaltron_documents',
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          public_id: `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`,
        },
        (error, result) => {
          if (error) {
            this.logger.error('Cloudinary upload error:', error);
            return reject(error);
          }
          if (!result) {
            return reject(new Error('Cloudinary upload returned empty result'));
          }
          this.logger.log(`Document uploaded to Cloudinary: ${result.secure_url}`);
          resolve(result);
        },
      );

      uploadStream.end(buffer);
    });
  }

  async uploadDataUri(
    dataUri: string,
    folder = 'vitaltron_documents',
  ): Promise<UploadApiResponse> {
    return cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: 'auto',
    });
  }
}
