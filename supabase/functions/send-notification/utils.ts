
import { CHANNEL_MAP } from './constants';

export function getChannelForType(type?: string): string {
  if (!type) return 'general_notifications';
  return CHANNEL_MAP[type] || 'general_notifications';
}

export function base64UrlEncode(input: string): string {
  return btoa(input)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function log(level: 'info' | 'error' | 'warn', message: string, data?: any): void {
  console.log(JSON.stringify({
    level,
    message,
    data,
    timestamp: new Date().toISOString(),
    service: 'send-notification'
  }));
}

export function generateRequestId(): string {
  return crypto.randomUUID();
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function extractUserIds(body: any): { userIds: string[]; title: string; bodyText: string; notificationData: any } {
  let userIds: string[] = [];
  let title: string;
  let bodyText: string;
  let notificationData: any;

  if (body.userIds && Array.isArray(body.userIds)) {
    userIds = body.userIds;
    title = body.title;
    bodyText = body.body;
    notificationData = body.data;
  } else {
    userIds = [body.userId];
    title = body.title;
    bodyText = body.body;
    notificationData = body.data;
  }

  return { userIds, title, bodyText, notificationData };
}