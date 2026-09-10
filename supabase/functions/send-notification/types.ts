// supabase/functions/send-notification/types.ts

export interface NotificationPayload {
  userIds?: string[];
  userId?: string;
  title: string;
  body: string;
  data?: NotificationData;
}

export interface NotificationData {
  type: string;
  screen?: string;
  [key: string]: any;
}

export interface FCMToken {
  id: string;
  fcm_token: string;
}

export interface SendResult {
  userId: string;
  messageId?: string;
  error?: string;
}

export interface BatchResult {
  success: boolean;
  total: number;
  sent: number;
  failed: number;
  results: SendResult[];
  failedUsers: SendResult[];
  requestId: string;
}

export interface FCMMessage {
  token: string;
  notification: {
    title: string;
    body: string;
  };
  data: Record<string, string>;
  android: {
    priority: string;
    notification: {
      sound: string;
      priority: string;
      channel_id: string;
    };
  };
  apns: {
    payload: {
      aps: {
        sound: string;
        badge: number;
        'content-available': number;
      };
    };
    headers: {
      'apns-priority': string;
    };
  };
}