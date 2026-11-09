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
  private transporter: Transporter | null = null;
  private readonly from: string;
  private readonly resendApiKey?: string;

  constructor(private readonly configService: ConfigService) {
    this.resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    this.from =
      this.configService.get<string>('MAIL_FROM') ||
      'Vitaltron <onboarding@resend.dev>';

    const host = this.configService.get<string>('MAIL_HOST');
    const port = this.configService.get<number>('MAIL_PORT');
    const secure = this.configService.get<string>('MAIL_SECURE');
    const user = this.configService.get<string>('MAIL_USER');
    const password = this.configService.get<string>('MAIL_PASSWORD');

    if (host && user && password) {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port: port || 587,
          secure: secure === 'true',
          auth: { user, pass: password },
        });
      } catch {
        this.transporter = null;
      }
    }
  }

  async onModuleInit(): Promise<void> {
    if (this.resendApiKey) {
      this.logger.log('Resend Email API initialized.');
      return;
    }

    if (this.transporter) {
      try {
        await this.transporter.verify();
        this.logger.log('Email SMTP connection verified.');
      } catch {
        this.logger.warn(
          'SMTP verification failed. Email codes will be logged to live console.',
        );
      }
    } else {
      this.logger.log(
        'No SMTP or Resend API key configured. Email codes will be logged to live console.',
      );
    }
  }

  async sendMail(options: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void> {
    // ALWAYS print high-visibility log for Render Live Logs
    console.log('\n==================================================');
    console.log(`📧 [VITALTRON EMAIL CODE] To: ${options.to}`);
    console.log(`📌 Subject: ${options.subject}`);
    console.log(`🔑 Content:\n${options.text}`);
    console.log('==================================================\n');

    // If Resend API Key is set, send via Resend API using onboarding@resend.dev
    if (this.resendApiKey) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Vitaltron <onboarding@resend.dev>',
            to: [options.to],
            subject: options.subject,
            text: options.text,
            ...(options.html ? { html: options.html } : {}),
          }),
        });

        if (response.ok) {
          this.logger.log(`Email successfully delivered via Resend API to ${options.to}`);
          return;
        } else {
          const errText = await response.text();
          this.logger.warn(`Resend API response error: ${errText}`);
        }
      } catch (err: any) {
        this.logger.warn(`Resend API exception: ${err.message}`);
      }
      return;
    }

    // If SMTP transporter exists and Resend isn't configured
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.from,
          to: options.to,
          subject: options.subject,
          text: options.text,
          ...(options.html ? { html: options.html } : {}),
        });
        this.logger.log(`Email successfully sent via SMTP to ${options.to}`);
      } catch (err: any) {
        this.logger.warn(`SMTP delivery failed: ${err.message}`);
      }
    }
  }
}
