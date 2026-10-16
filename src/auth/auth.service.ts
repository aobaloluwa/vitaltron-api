
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, AuthActionType } from '../../generated/prisma/client';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;
const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFICATION_CODE_LIFETIME_MS = 10 * 60 * 1000;
const VERIFICATION_RESEND_DELAY_MS = 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName: dto.displayName.trim(),
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          createdAt: true,
        },
      });

      try {
        await this.sendVerificationCode(user.id, email);
      } catch (error) {
        // Keep the account so the user can request another code.
        throw error;
      }

      return {
        message: 'Account created. Check your email for the verification code.',
        user,
        requiresEmailVerification: true,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with these details already exists.',
        );
      }

      throw error;
    }
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const email = dto.email.trim().toLowerCase();
    const now = new Date();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification code.');
    }

    if (user.emailVerifiedAt) {
      return { message: 'Email address is already verified.' };
    }

    const latestToken = await this.prisma.authActionToken.findFirst({
      where: {
        userId: user.id,
        type: AuthActionType.EMAIL_VERIFICATION,
        usedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (
      !latestToken ||
      latestToken.expiresAt <= now
    ) {
      throw new BadRequestException('Invalid or expired verification code.');
    }

    if (latestToken.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      throw new HttpException(
        'Too many incorrect attempts. Request a new code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const codeHash = this.hashCode(dto.code);

    if (latestToken.tokenHash !== codeHash) {
      await this.prisma.authActionToken.updateMany({
        where: {
          id: latestToken.id,
          usedAt: null,
          attempts: { lt: MAX_VERIFICATION_ATTEMPTS },
        },
        data: { attempts: { increment: 1 } },
      });

      throw new BadRequestException('Invalid or expired verification code.');
    }

    // Atomically consume the code and verify the account.
    const verified = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authActionToken.updateMany({
        where: {
          id: latestToken.id,
          usedAt: null,
          expiresAt: { gt: now },
          attempts: { lt: MAX_VERIFICATION_ATTEMPTS },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        return false;
      }

      await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: now },
      });

      await tx.authActionToken.updateMany({
        where: {
          userId: user.id,
          type: AuthActionType.EMAIL_VERIFICATION,
          usedAt: null,
        },
        data: { usedAt: now },
      });

      return true;
    });

    if (!verified) {
      throw new BadRequestException('Invalid or expired verification code.');
    }

    return {
      message: 'Email verified successfully. You can now log in.',
    };
  }

  async resendVerificationCode(emailInput: string) {
    const email = emailInput.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    const genericResponse = {
      message:
        'If the account exists and needs verification, a code will be sent.',
    };

    if (!user || user.emailVerifiedAt) {
      return genericResponse;
    }

    const latestToken = await this.prisma.authActionToken.findFirst({
      where: {
        userId: user.id,
        type: AuthActionType.EMAIL_VERIFICATION,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (
      latestToken &&
      Date.now() - latestToken.lastSentAt.getTime() <
        VERIFICATION_RESEND_DELAY_MS
    ) {
      throw new HttpException(
        'Please wait before requesting another code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.sendVerificationCode(user.id, email);

    return genericResponse;
  }

  async login(emailInput: string, password: string) {
    const email = emailInput.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordIsValid = await argon2.verify(
      user.passwordHash,
      password,
    );

    if (!passwordIsValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Please verify your email before logging in.',
      );
    }

    const refreshToken = await this.createRefreshSession(user.id);
    const accessToken = await this.createAccessToken(user.id);

    return {
      message: 'Login successful.',
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
      refreshTokenExpiresIn: REFRESH_TOKEN_LIFETIME_MS / 1000,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);

    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            emailVerifiedAt: true,
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (session.revokedAt) {
      await this.revokeAllUserSessions(session.userId);
      throw new UnauthorizedException(
        'Refresh token reuse detected. Please log in again.',
      );
    }

    const now = new Date();

    if (session.expiresAt <= now) {
      throw new UnauthorizedException('Refresh token has expired.');
    }

    if (!session.user.emailVerifiedAt) {
      await this.revokeAllUserSessions(session.userId);
      throw new UnauthorizedException(
        'Please verify your email before continuing.',
      );
    }

    const newRefreshToken = this.generateRefreshToken();
    const newTokenHash = this.hashRefreshToken(newRefreshToken);
    const newExpiresAt = new Date(
      now.getTime() + REFRESH_TOKEN_LIFETIME_MS,
    );

    const rotated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.refreshSession.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          revokedAt: now,
          lastUsedAt: now,
        },
      });

      if (result.count !== 1) {
        return false;
      }

      await tx.refreshSession.create({
        data: {
          tokenHash: newTokenHash,
          userId: session.userId,
          expiresAt: newExpiresAt,
        },
      });

      return true;
    });

    if (!rotated) {
      await this.revokeAllUserSessions(session.userId);
      throw new UnauthorizedException(
        'Refresh token is no longer valid. Please log in again.',
      );
    }

    const accessToken = await this.createAccessToken(session.userId);

    return {
      message: 'Tokens refreshed successfully.',
      accessToken,
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
      refreshTokenExpiresIn: REFRESH_TOKEN_LIFETIME_MS / 1000,
      user: {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
      },
    };
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);

    await this.prisma.refreshSession.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return { message: 'Logged out successfully.' };
  }

  private async sendVerificationCode(
    userId: string,
    email: string,
  ): Promise<void> {
    const now = new Date();
    const code = randomInt(100000, 1000000).toString();
    const tokenHash = this.hashCode(code);

    await this.prisma.$transaction(async (tx) => {
      await tx.authActionToken.updateMany({
        where: {
          userId,
          type: AuthActionType.EMAIL_VERIFICATION,
          usedAt: null,
        },
        data: { usedAt: now },
      });

      await tx.authActionToken.create({
        data: {
          userId,
          type: AuthActionType.EMAIL_VERIFICATION,
          tokenHash,
          expiresAt: new Date(
            now.getTime() + VERIFICATION_CODE_LIFETIME_MS,
          ),
          attempts: 0,
          lastSentAt: now,
        },
      });
    });

    try {
      await this.mailService.sendMail({
        to: email,
        subject: 'Your Vitaltron verification code',
        text: [
          `Your Vitaltron verification code is: ${code}`,
          '',
          'This code expires in 10 minutes.',
          'If you did not create this account, you can ignore this email.',
        ].join('\n'),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6">
            <h2>Verify your Vitaltron email</h2>
            <p>Enter this code in the Vitaltron app:</p>
            <p style="font-size:30px;font-weight:bold;letter-spacing:8px">
              ${code}
            </p>
            <p>This code expires in 10 minutes.</p>
            <p>If you did not create this account, you can ignore this email.</p>
          </div>
        `,
      });
    } catch {
      await this.prisma.authActionToken.updateMany({
        where: {
          userId,
          type: AuthActionType.EMAIL_VERIFICATION,
          tokenHash,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });

      throw new BadRequestException(
        'We could not send the verification email. Please try again later.',
      );
    }
  }

  private async createAccessToken(userId: string): Promise<string> {
    return this.jwtService.signAsync({ sub: userId });
  }

  private generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private async createRefreshSession(userId: string): Promise<string> {
    const refreshToken = this.generateRefreshToken();
    const tokenHash = this.hashRefreshToken(refreshToken);

    await this.prisma.refreshSession.create({
      data: {
        tokenHash,
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS),
      },
    });

    return refreshToken;
  }

  private async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }
}
