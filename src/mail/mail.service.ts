
import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.getOrThrow<string>('MAIL_HOST');
    const port = this.configService.getOrThrow<number>('MAIL_PORT');
    const secure = this.configService.getOrThrow<string>('MAIL_SECURE');
    const user = this.configService.getOrThrow<string>('MAIL_USER');
    const password =
      this.configService.getOrThrow<string>('MAIL_PASSWORD');

    this.from = this.configService.getOrThrow<string>('MAIL_FROM');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: secure === 'true',
      auth: {
        user,
        pass: password,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.transporter.verify();
      this.logger.log('Email SMTP connection verified.');
    } catch {
      // Avoid logging SMTP credentials or provider error details.
      this.logger.error(
        'Email SMTP verification failed. Check MAIL_* configuration.',
      );
    }
  }

  async sendMail(options: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      ...(options.html ? { html: options.html } : {}),
    });
  }
}
