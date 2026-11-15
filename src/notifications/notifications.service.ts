import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async getNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async registerPushToken(userId: string, token: string, device?: string) {
    return this.prisma.pushToken.upsert({
      where: { token },
      update: { userId, device, createdAt: new Date() },
      create: { userId, token, device },
    });
  }

  async createNotification(userId: string, title: string, message: string, type = 'SYSTEM') {
    const notification = await this.prisma.notification.create({
      data: { userId, title, message, type },
    });

    // Attempt to send push notification
    await this.sendPushNotification(userId, title, message, { notificationId: notification.id, type });

    return notification;
  }

  private async sendPushNotification(userId: string, title: string, body: string, data: any) {
    try {
      const tokens = await this.prisma.pushToken.findMany({ where: { userId } });
      if (!tokens.length) return;

      const messages = tokens.map((t) => ({
        to: t.token,
        sound: 'default',
        title,
        body,
        data,
      }));

      // In a real app, use the expo-server-sdk
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      this.logger.log(`Sent push notifications to ${tokens.length} devices for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to send push notification', error);
    }
  }
}