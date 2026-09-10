// supabase/functions/send-notification/services.ts
// @ts-ignore - Deno is available at runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { FCMToken, FCMMessage, SendResult } from './types.ts';
import { CONCURRENCY_LIMIT, MAX_RETRIES, RETRY_DELAY_MS } from './constants.ts';
import { log, delay } from './utils.ts';

// JWT Service
export class JWTService {
  private static instance: JWTService;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  static getInstance(): JWTService {
    if (!JWTService.instance) {
      JWTService.instance = new JWTService();
    }
    return JWTService.instance;
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const clientEmail = Deno.env.get('FCM_CLIENT_EMAIL');
    const privateKey = Deno.env.get('FCM_PRIVATE_KEY');

    if (!clientEmail || !privateKey) {
      throw new Error('FCM credentials not configured');
    }

    const cleanPrivateKey = privateKey.replace(/\\n/g, '\n');
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    const header = { alg: 'RS256', typ: 'JWT' };
    const { base64UrlEncode } = await import('./utils.ts');
    
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedClaims = base64UrlEncode(JSON.stringify(claims));
    const signatureInput = `${encodedHeader}.${encodedClaims}`;

    const pemToBinary = (pem: string): Uint8Array => {
      const pemContent = pem
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s/g, '');
      return Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));
    };

    const binaryKey = pemToBinary(cleanPrivateKey);
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      cryptoKey,
      new TextEncoder().encode(signatureInput)
    );

    const encodedSignature = base64UrlEncode(
      String.fromCharCode(...new Uint8Array(signature))
    );

    const jwt = `${encodedHeader}.${encodedClaims}.${encodedSignature}`;

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get access token: ${error}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;

    return this.accessToken;
  }
}

// Supabase Service
export class SupabaseService {
  private supabaseClient: any;

  constructor() {
    this.supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
  }

  async getFCMTokens(userIds: string[]): Promise<FCMToken[]> {
    const { data, error } = await this.supabaseClient
      .from('profiles')
      .select('id, fcm_token')
      .in('id', userIds)
      .not('fcm_token', 'is', null);

    if (error) {
      throw new Error(`Failed to fetch user tokens: ${error.message}`);
    }

    return data || [];
  }

  async invalidateToken(userId: string): Promise<void> {
    await this.supabaseClient
      .from('profiles')
      .update({ fcm_token: null, fcm_token_updated_at: new Date().toISOString() })
      .eq('id', userId);
    log('info', 'Invalid token cleared', { userId });
  }
}

// FCM Service
export class FCMService {
  private jwtService: JWTService;

  constructor() {
    this.jwtService = JWTService.getInstance();
  }

  private async sendSingleMessage(
    token: string,
    title: string,
    body: string,
    data: Record<string, string>,
    channelId: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const accessToken = await this.jwtService.getAccessToken();
    const projectId = Deno.env.get('FCM_PROJECT_ID') || Deno.env.get('VITE_SUPABASE_PROJECT_ID');

    if (!projectId) {
      throw new Error('FCM_PROJECT_ID not configured');
    }

    const message: FCMMessage = {
      token,
      notification: { title, body },
      data,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          priority: 'high',
          channel_id: channelId,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            'content-available': 1,
          },
        },
        headers: {
          'apns-priority': '10',
        },
      },
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message }),
          }
        );

        const result = await response.json();

        if (response.ok) {
          return { success: true, messageId: result.name };
        }

        if (result.error?.message?.includes('NotRegistered') ||
            result.error?.message?.includes('InvalidRegistration')) {
          return { success: false, error: 'INVALID_TOKEN' };
        }

        if (attempt === MAX_RETRIES) {
          return { success: false, error: result.error?.message || 'FCM send failed' };
        }

        await delay(RETRY_DELAY_MS * attempt);
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          return { success: false, error: error.message };
        }
        await delay(RETRY_DELAY_MS * attempt);
      }
    }

    return { success: false, error: 'Max retries exceeded' };
  }

  async sendBatch(
    tokens: FCMToken[],
    title: string,
    body: string,
    data: Record<string, string>,
    channelId: string,
    concurrencyLimit: number
  ): Promise<SendResult[]> {
    const results: SendResult[] = [];

    for (let i = 0; i < tokens.length; i += concurrencyLimit) {
      const batch = tokens.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map(async (tokenInfo) => {
        const result = await this.sendSingleMessage(
          tokenInfo.fcm_token,
          title,
          body,
          { ...data, userId: tokenInfo.id },
          channelId
        );

        return {
          userId: tokenInfo.id,
          messageId: result.messageId,
          error: result.error === 'INVALID_TOKEN' ? undefined : result.error,
        };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }
}