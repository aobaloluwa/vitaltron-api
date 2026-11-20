import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async getNotifications(userId: string) {
    try {
      const items = await this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return items || [];
    } catch (error) {
      this.logger.error(`Failed to fetch notifications for user ${userId}`, error);
      return [];
    }
  }

  async markAsRead(notificationId: string, userId: string) {
    try {
      return await this.prisma.notification.updateMany({
        where: { id: notificationId, userId },
        data: { isRead: true },
      });
    } catch (error) {
      this.logger.error(`Failed to mark notification ${notificationId} as read`, error);
      return { count: 0 };
    }
  }

  async markAllAsRead(userId: string) {
    try {
      return await this.prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      });
    } catch (error) {
      this.logger.error(`Failed to mark all notifications as read for user ${userId}`, error);
      return { count: 0 };
    }
  }

  async registerPushToken(userId: string, token: string, device?: string) {
    if (!token) return { success: false };
    try {
      return await this.prisma.pushToken.upsert({
        where: { token },
        update: { userId, device, createdAt: new Date() },
        create: { userId, token, device },
      });
    } catch (error) {
      this.logger.error(`Failed to register push token for user ${userId}`, error);
      return { success: false };
    }
  }

  async createNotification(userId: string, title: string, message: string, type = 'SYSTEM') {
    try {
      const notification = await this.prisma.notification.create({
        data: { userId, title, message, type },
      });

      // Attempt to send push notification asynchronously
      void this.sendPushNotification(userId, title, message, { notificationId: notification.id, type });

      return notification;
    } catch (error) {
      this.logger.error(`Failed to create notification for user ${userId}`, error);
      return null;
    }
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
