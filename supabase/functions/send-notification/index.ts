// supabase/functions/send-notification/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  'Content-Type': 'application/json',
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const MAX_IN_FLIGHT = 100; 
const FETCH_TIMEOUT_MS = 10000;
const BATCH_SIZE = 100;

const CHANNEL_MAP: Record<string, string> = {
  'RECEIVED_COMMAND': 'commands',
  'NEW_SQUAD_COMMAND': 'commands',
  'FAILED_COMMAND': 'commands',
  'NEW_MESSAGE': 'chat',
  'MENTION': 'chat',
  'NEW_MEMBER': 'squad', 
  'NEW_POLL': 'squad',
  'POLL_RESULT': 'squad',
  'CREDIT_GIFTING': 'rewards',
  'DAILY_SPIN_AVAILABLE': 'rewards',
  'DAILY_SPIN_REMINDER': 'rewards',
  'WARNING': 'general_notifications',
  'ACTION_USED': 'general_notifications',
  'SUPER_ACTION_USED': 'general_notifications',
};


function log(level: 'info' | 'error' | 'warn', message: string, data?: any): void {
  console.log(JSON.stringify({
    level,
    message,
    data,
    timestamp: new Date().toISOString(),
    service: 'send-notification'
  }));
}

function getChannelForType(type?: string): string {
  if (!type) return 'general_notifications';
  return CHANNEL_MAP[type] || 'general_notifications';
}

function base64UrlEncode(bytes: Uint8Array): string {
  const binaryString = Array.from(bytes)
    .map(byte => String.fromCharCode(byte))
    .join('');
  
  return btoa(binaryString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function delayWithJitter(baseMs: number, attempt: number): Promise<void> {
  const exponentialMs = baseMs * Math.pow(2, attempt - 1);
  const jitter = 0.8 + Math.random() * 0.4;
  const delayMs = exponentialMs * jitter;
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

function isRetryableError(errorMessage: string): boolean {
  const retryablePatterns = [
    '429', '500', '503', '504',
    'timeout', 'unavailable', 'rate_limit', 'deadline',
    'internal server error', 'service unavailable'
  ];
  return retryablePatterns.some(pattern => 
    errorMessage.toLowerCase().includes(pattern)
  );
}

function isInvalidTokenError(error: any): boolean {
  const errorString = JSON.stringify(error).toLowerCase();
  
  const patterns = [
    'notregistered',
    'invalidregistration', 
    'registration-token-not-registered',
    'unregistered',
    'not_found',
    'device not found',
    'invalid token',
    'mismatched sender id'
  ];
  
  if (patterns.some(p => errorString.includes(p))) {
    return true;
  }
  
  if (error.details && Array.isArray(error.details)) {
    for (const detail of error.details) {
      if (detail.errorCode === 'UNREGISTERED' || 
          detail.errorCode === 'NOT_FOUND' ||
          detail.errorCode === 'INVALID_ARGUMENT') {
        return true;
      }
    }
  }
  
  if (error.status && 
      (error.status === 'NOT_FOUND' || 
       error.status === 'INVALID_ARGUMENT')) {
    return true;
  }
  
  return false;
}

function getCollapseKey(data: Record<string, string>, type: string, notificationId: string): string {
  if (data.messageId) return `msg_${data.messageId}`;
  if (data.commandId) return `cmd_${data.commandId}`;
  if (data.pollId) return `poll_${data.pollId}`;
  if (data.warningId) return `warn_${data.warningId}`;
  if (data.requestId) return `req_${data.requestId}`;
  if (data.rewardId) return `reward_${data.rewardId}`;
  if (data.chatId) return `chat_${data.chatId}`;
  if (data.squadId) return `squad_${data.squadId}`;
  return `notification_${notificationId}`;
}

function getNotificationGroup(data: Record<string, string>, type: string): string {
  if (data.chatId) return `chat_${data.chatId}`;
  if (data.squadId) return `squad_${data.squadId}`;
  if (data.messageId) return `msg_${data.messageId}`;
  if (data.commandId) return `cmd_${data.commandId}`;
  if (data.pollId) return `poll_${data.pollId}`;
  return type;
}

function extractUserIds(body: any): { 
  userIds: string[]; 
  title: string; 
  bodyText: string; 
  notificationData: any; 
  notificationId?: string;
  source?: string;
  unreadCounts?: Map<string, number>;
} {
  let userIds: string[] = [];
  let title: string;
  let bodyText: string;
  let notificationData: any;
  let notificationId: string | undefined;
  let source: string | undefined;
  let unreadCounts: Map<string, number> | undefined;

  notificationId = body.notificationId || body.data?.notificationId;
  source = body.source || body.data?.source || 'unknown';

  if (body.userIds && Array.isArray(body.userIds)) {
    userIds = body.userIds;
    title = body.title;
    bodyText = body.body;
    notificationData = body.data;
  } else if (body.userId) {
    userIds = [body.userId];
    title = body.title;
    bodyText = body.body;
    notificationData = body.data;
  } else {
    const possibleUserFields = ['userId', 'user_id', 'recipientId', 'targetUserId'];
    for (const field of possibleUserFields) {
      if (body[field]) {
        userIds = [body[field]];
        title = body.title || 'Notification';
        bodyText = body.body || '';
        notificationData = body.data || body.notificationData || {};
        break;
      }
    }
  }

  userIds = [...new Set(userIds)];
  
  if (body.unreadCounts) {
    unreadCounts = new Map(Object.entries(body.unreadCounts));
  }
  
  return { userIds, title, bodyText, notificationData, notificationId, source, unreadCounts };
}

async function promisePool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];
  
  for (const item of items) {
    const promise = fn(item).then((result) => {
      results.push(result);
    });
    
    executing.push(promise);
    
    if (executing.length >= concurrency) {
      await Promise.race(executing);
     
      for (let i = executing.length - 1; i >= 0; i--) {
        if (await Promise.race([executing[i], Promise.resolve()]) === undefined) {
     
          try {
            await Promise.race([executing[i], Promise.resolve()]);
          } catch {
         
          }
          executing.splice(i, 1);
        }
      }
    }
  }
  
  await Promise.all(executing);
  return results;
}


class JWTService {
  private static instance: JWTService;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private clientEmail: string;
  private privateKey: string;
  private authClient: any = null; 
  private googleAuthInstance: any = null;

  private constructor() {
    this.clientEmail = Deno.env.get('FCM_CLIENT_EMAIL') || '';
    this.privateKey = Deno.env.get('FCM_PRIVATE_KEY')?.replace(/\\n/g, '\n') || '';

    if (!this.clientEmail || !this.privateKey) {
      throw new Error('FCM credentials not configured.');
    }
  }

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

    try {

      if (!this.googleAuthInstance) {
        const { GoogleAuth } = await import('https://esm.sh/google-auth-library@9');
        this.googleAuthInstance = new GoogleAuth({
          credentials: {
            client_email: this.clientEmail,
            private_key: this.privateKey,
          },
          scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
        });
      }

      if (!this.authClient) {
        this.authClient = await this.googleAuthInstance.getClient();
      }

      const token = await this.authClient.getAccessToken();
      
      if (token.token) {
        this.accessToken = token.token;
        this.tokenExpiry = Date.now() + 3600000;
        log('info', 'Access token obtained via GoogleAuth');
        return this.accessToken;
      }
    } catch (error) {
      log('warn', 'GoogleAuth failed, falling back to manual JWT', { error: error.message });
    }

    return this.generateManualToken();
  }

  private async generateManualToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    
    const claims = {
      iss: this.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    const header = { alg: 'RS256', typ: 'JWT' };
    
    const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
    const encodedClaims = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
    const signatureInput = `${encodedHeader}.${encodedClaims}`;

    const pemToBinary = (pem: string): Uint8Array => {
      const pemContent = pem
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s/g, '');
      return Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));
    };

    const binaryKey = pemToBinary(this.privateKey);
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

    const encodedSignature = base64UrlEncode(new Uint8Array(signature));
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

    log('info', 'Access token obtained via manual JWT');
    return this.accessToken;
  }
}


class SupabaseService {
  private supabaseClient: any;

  constructor() {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    this.supabaseClient = createClient(supabaseUrl, supabaseKey);
  }

  async tryAcquireNotificationLock(
    notificationId: string,
    userIds: string[],
    data: any,
    source: string
  ): Promise<boolean> {
    try {
      const { data: result, error } = await this.supabaseClient
        .rpc('acquire_notification_lock', {
          p_notification_id: notificationId,
          p_recipient_ids: userIds,
          p_data: data,
          p_source: source
        });

      if (error) {
        log('error', 'Failed to acquire lock via RPC', { 
          notificationId, 
          error: error.message 
        });
        return false;
      }

      return !!result;
    } catch (error) {
      log('error', 'Error in tryAcquireNotificationLock', { 
        notificationId, 
        error: error.message 
      });
      return false;
    }
  }

  async updateNotificationStatus(
    notificationId: string, 
    status: 'pending' | 'sent' | 'partial' | 'failed' | 'duplicate',
    details?: { sent: number; failed: number; total: number; latency?: number }
  ): Promise<void> {
    try {
      const updateData: any = { 
        status: status,
        updated_at: new Date().toISOString()
      };
      
      if (details) {
        updateData.sent_count = details.sent;
        updateData.failed_count = details.failed;
        updateData.total_count = details.total;
        if (details.latency !== undefined) {
          updateData.latency_ms = details.latency;
        }
      }
      
      await this.supabaseClient
        .from('notification_log')
        .update(updateData)
        .eq('notification_id', notificationId);
    } catch (error) {
      log('error', 'Failed to update notification status', { 
        notificationId, 
        status, 
        error: error.message 
      });
    }
  }

  async getDeviceTokens(userIds: string[]): Promise<Array<{ userId: string; fcm_token: string; device_id: string }>> {
    if (userIds.length === 0) return [];

    try {
      const { data, error } = await this.supabaseClient
        .from('user_devices')
        .select('user_id, fcm_token, device_id')
        .in('user_id', userIds)
        .not('fcm_token', 'is', null)
        .eq('enabled', true)
        .gt('last_seen', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (error) {
        log('error', 'Failed to fetch device tokens', { error: error.message });
        throw new Error(`Failed to fetch device tokens: ${error.message}`);
      }

      const validTokens = (data || []).filter(
        (item: any) => item.fcm_token && item.fcm_token.trim() !== ''
      );

      log('info', 'Fetched device tokens', { 
        requested: userIds.length, 
        found: validTokens.length 
      });

      return validTokens;
    } catch (error) {
      log('error', 'Error in getDeviceTokens', { error: error.message });
      throw error;
    }
  }

  async getNotificationSettings(
    userIds: string[],
    notificationType: string
  ): Promise<Map<string, boolean>> {
    try {
      const { data, error } = await this.supabaseClient
        .from('notification_settings')
        .select('user_id, enabled')
        .in('user_id', userIds)
        .eq('notification_type', notificationType);

      if (error) {
        log('error', 'Failed to fetch notification settings', { error: error.message });
      
        return new Map(userIds.map(id => [id, false]));
      }

      const settingsMap = new Map<string, boolean>();
      userIds.forEach(userId => {
        const setting = data?.find((item: any) => item.user_id === userId);
      
        settingsMap.set(userId, setting?.enabled ?? false);
      });

      return settingsMap;
    } catch (error) {
      log('error', 'Error in getNotificationSettings', { error: error.message });
      return new Map(userIds.map(id => [id, false]));
    }
  }

  async invalidateDeviceTokens(deviceIds: string[]): Promise<void> {
    if (deviceIds.length === 0) return;

    try {
      for (let i = 0; i < deviceIds.length; i += BATCH_SIZE) {
        const batch = deviceIds.slice(i, i + BATCH_SIZE);
        await this.supabaseClient
          .from('user_devices')
          .update({ 
            fcm_token: null, 
            enabled: false,
            last_seen: new Date().toISOString()
          })
          .in('device_id', batch);
      }
      log('info', 'Invalidated device tokens', { count: deviceIds.length });
    } catch (error) {
      log('error', 'Failed to invalidate device tokens', { 
        count: deviceIds.length, 
        error: error.message 
      });
    }
  }

  async getUnreadCounts(userIds: string[], chatIds?: string[]): Promise<Map<string, number>> {
    try {
      const { data, error } = await this.supabaseClient
        .rpc('get_unread_counts', {
          p_user_ids: userIds,
          p_chat_ids: chatIds || null
        });

      if (error) {
        log('error', 'Failed to fetch unread counts', { error: error.message });
        return new Map();
      }

      const countMap = new Map<string, number>();
      data?.forEach((item: any) => {
        countMap.set(item.user_id, Number(item.unread_count));
      });

      return countMap;
    } catch (error) {
      log('error', 'Error in getUnreadCounts', { error: error.message });
      return new Map();
    }
  }
}



class FCMService {
  private jwtService: JWTService;

  constructor() {
    this.jwtService = JWTService.getInstance();
  }

  private async sendSingleMessage(
    token: string,
    title: string,
    body: string,
    data: Record<string, string>,
    channelId: string,
    userId: string,
    deviceId: string,
    unreadCount?: number,
    dryRun?: boolean
  ): Promise<{ success: boolean; messageId?: string; error?: string; latency?: number; status?: string }> {
    const startTime = Date.now();
    
    try {
      const accessToken = await this.jwtService.getAccessToken();
      const projectId = Deno.env.get('FCM_PROJECT_ID');

      if (!projectId) {
        throw new Error('FCM_PROJECT_ID not configured');
      }

      const notificationId = data.notificationId;
      if (!notificationId) {
        throw new Error('notificationId is required in FCM data');
      }

      const notificationType = data.type || 'general';
      const notificationGroup = getNotificationGroup(data, notificationType);
      const collapseKey = getCollapseKey(data, notificationType, notificationId);
      
      const shouldShowBadge = notificationType === 'NEW_MESSAGE' || 
                             notificationType === 'MENTION' || 
                             notificationType === 'RECEIVED_COMMAND';

      const message = {
        token,
        notification: { 
          title, 
          body 
        },
        data: {
          ...data,
          title: title,
          body: body,
          channelId: channelId,
          notificationId: notificationId,
          notificationGroup: notificationGroup,
          collapseKey: collapseKey,
          userId: userId,
          deviceId: deviceId,
        },
        android: {
          priority: 'high' as const,
          collapse_key: collapseKey,
          ttl: '86400s',
          notification: {
            title: title,
            body: body,
            sound: 'default',
            priority: 'high' as const,
            channel_id: channelId,
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
            vibrate_timings: [0, 100, 200, 100],
            default_vibrate_timings: true,
            default_sound: true,
            tag: collapseKey, 
            group: notificationGroup,
            group_summary: false,
            ...(shouldShowBadge && unreadCount !== undefined && { 
              notification_count: unreadCount 
            }),
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              ...(shouldShowBadge && unreadCount !== undefined && { badge: unreadCount }),
              'content-available': 1,
              'mutable-content': 1, 
              alert: {
                title: title,
                body: body,
              },
              'thread-id': notificationGroup,
            },
          },
          headers: {
            'apns-priority': '10',
            'apns-collapse-id': collapseKey, 
          },
        },
      };

      const url = dryRun
        ? `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send?dryRun=true`
        : `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

          const response = await fetch(
            url,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ message }),
              signal: controller.signal,
            }
          );

          clearTimeout(timeoutId);

          const result = await response.json();
          const latency = Date.now() - startTime;

          if (response.ok) {
            log('info', 'Notification sent successfully', { 
              messageId: result.name,
              notificationId,
              userId,
              deviceId,
              latency,
              status: response.status,
              attempt,
              dryRun,
              projectId
            });
            return { success: true, messageId: result.name, latency, status: 'sent' };
          }

          const errorData = result.error || {};
          const errorMessage = errorData.message || 'Unknown FCM error';
          
       
          let failureType = 'unknown';
          if (isInvalidTokenError(errorData)) {
            failureType = 'invalid_token';
          } else if (response.status === 429) {
            failureType = 'rate_limited';
          } else if (response.status >= 500) {
            failureType = 'server_error';
          } else if (errorMessage.includes('timeout')) {
            failureType = 'timeout';
          }

          log('error', 'FCM API error', { 
            errorMessage, 
            status: response.status, 
            notificationId, 
            userId, 
            deviceId,
            attempt,
            failureType,
            dryRun,
            projectId
          });

          if (failureType === 'invalid_token') {
            return { success: false, error: 'INVALID_TOKEN', latency, status: 'invalid_token' };
          }

          if (attempt === MAX_RETRIES || !isRetryableError(errorMessage)) {
            return { success: false, error: errorMessage, latency, status: failureType };
          }

          await delayWithJitter(RETRY_DELAY_MS, attempt);
        } catch (error) {
          const latency = Date.now() - startTime;
          
          if (error.name === 'AbortError') {
            log('error', 'FCM request timeout', { 
              attempt, 
              notificationId,
              timeout: FETCH_TIMEOUT_MS,
              dryRun
            });
            return { success: false, error: 'Timeout', latency, status: 'timeout' };
          }

          log('error', 'FCM send attempt failed', { 
            attempt, 
            error: error.message, 
            notificationId,
            dryRun
          });
          
          if (attempt === MAX_RETRIES) {
            return { success: false, error: error.message, latency, status: 'error' };
          }
          await delayWithJitter(RETRY_DELAY_MS, attempt);
        }
      }

      const latency = Date.now() - startTime;
      return { success: false, error: 'Max retries exceeded', latency, status: 'max_retries' };
    } catch (error) {
      const latency = Date.now() - startTime;
      log('error', 'Failed to send message', { error: error.message });
      return { success: false, error: error.message, latency, status: 'error' };
    }
  }

  async sendBatch(
    devices: Array<{ userId: string; fcm_token: string; device_id: string }>,
    title: string,
    body: string,
    data: Record<string, string>,
    channelId: string,
    unreadCounts?: Map<string, number>,
    dryRun?: boolean
  ): Promise<Array<{ userId: string; deviceId: string; messageId?: string; error?: string; status?: string }>> {
    if (devices.length === 0) return [];

    log('info', 'Sending batch notifications', { 
      count: devices.length,
      title,
      channelId,
      notificationId: data.notificationId,
      dryRun,
      maxConcurrency: MAX_IN_FLIGHT
    });

    const results = await promisePool(
      devices,
      MAX_IN_FLIGHT,
      async (device) => {
        const unreadCount = unreadCounts?.get(device.userId);
        
        const result = await this.sendSingleMessage(
          device.fcm_token,
          title,
          body,
          { ...data, userId: device.userId },
          channelId,
          device.userId,
          device.device_id,
          unreadCount,
          dryRun
        );

        return {
          userId: device.userId,
          deviceId: device.device_id,
          messageId: result.messageId,
          error: result.error === 'INVALID_TOKEN' ? 'INVALID_TOKEN' : result.error,
          status: result.status,
        };
      }
    );

    const successCount = results.filter(r => r.messageId).length;
    const failCount = results.filter(r => r.error).length;
    
    log('info', 'Batch send complete', { 
      total: results.length,
      sent: successCount,
      failed: failCount,
      notificationId: data.notificationId,
      dryRun
    });

    return results;
  }
}


async function handleNotification(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  let body: any = null;
  

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';
  
  try {
    log('info', 'Received notification request', { requestId, dryRun });
    
    try {
      body = await req.json();
    } catch (parseError) {
      log('error', 'Failed to parse request body', { error: parseError.message, requestId });
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON body' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const { 
      userIds, 
      title, 
      bodyText, 
      notificationData, 
      notificationId, 
      source,
      unreadCounts: providedUnreadCounts 
    } = extractUserIds(body);

    if (!notificationId) {
      log('error', 'notificationId is required', { requestId, body });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'notificationId is required. This must be a stable event identifier.' 
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const genericIds = ['chat', 'user', 'notification', 'general', 'update'];
    if (genericIds.includes(notificationId.toLowerCase())) {
      log('error', 'notificationId is too generic', { notificationId, requestId });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'notificationId must be a specific event identifier (e.g., messageId, commandId, pollId)' 
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!userIds || userIds.length === 0) {
      log('warn', 'No user IDs provided', { requestId, notificationId });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No user IDs provided. Please provide userId or userIds array' 
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!title) {
      log('warn', 'No title provided', { requestId, notificationId });
      return new Response(
        JSON.stringify({ success: false, error: 'Title is required' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabaseService = new SupabaseService();


    let lockAcquired = true;
    if (!dryRun) {
      lockAcquired = await supabaseService.tryAcquireNotificationLock(
        notificationId,
        userIds,
        { ...notificationData, title, body: bodyText },
        source || 'unknown'
      );
    }

    if (!lockAcquired) {
      log('info', 'Duplicate notification detected, skipping', { 
        notificationId, 
        requestId,
        userIds,
        source 
      });
      await supabaseService.updateNotificationStatus(notificationId, 'duplicate');
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Notification already processed (duplicate ignored)',
          notificationId,
          total: userIds.length,
          sent: 0,
          failed: 0,
          results: []
        }),
        { headers: CORS_HEADERS }
      );
    }


    const notificationType = notificationData?.type || 'general';
    const settingsMap = await supabaseService.getNotificationSettings(userIds, notificationType);
    
    const enabledUserIds = userIds.filter(userId => 
      settingsMap.get(userId) === true
    );

    if (enabledUserIds.length === 0) {
      log('info', 'All users have notifications disabled', { 
        requested: userIds.length,
        type: notificationType,
        requestId,
        notificationId,
      });
      
      if (!dryRun) {
        await supabaseService.updateNotificationStatus(notificationId, 'sent');
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'All users have notifications disabled for this type',
          notificationId,
          requested: userIds.length,
          enabled: 0,
          sent: 0,
          failed: 0,
        }),
        { headers: CORS_HEADERS }
      );
    }

    const devices = await supabaseService.getDeviceTokens(enabledUserIds);

    if (devices.length === 0) {
      log('warn', 'No valid device tokens found', { 
        requested: enabledUserIds.length,
        requestId,
        notificationId,
      });
      
      if (!dryRun) {
        await supabaseService.updateNotificationStatus(notificationId, 'sent');
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No users with valid device tokens found',
          notificationId,
          requested: enabledUserIds.length,
          sent: 0,
          failed: 0,
        }),
        { headers: CORS_HEADERS }
      );
    }

    let unreadCounts: Map<string, number> | undefined = providedUnreadCounts;
    if (!unreadCounts && (notificationType === 'NEW_MESSAGE' || notificationType === 'MENTION')) {
      const chatIds = notificationData?.chatId ? [notificationData.chatId] : undefined;
      unreadCounts = await supabaseService.getUnreadCounts(enabledUserIds, chatIds);
    }

    const data: Record<string, string> = {
      type: notificationType,
      event_time: notificationData?.event_time || new Date().toISOString(),
      notificationId: notificationId,
      source: source || 'unknown',
    };

    if (notificationData) {
      Object.entries(notificationData).forEach(([key, value]) => {
        if (value !== undefined && value !== null && key !== 'event_time') {
          data[key] = String(value);
        }
      });
    }

    const channelId = getChannelForType(notificationType);
    const fcmService = new FCMService();
    
    const results = await fcmService.sendBatch(
      devices, 
      title, 
      bodyText, 
      data, 
      channelId,
      unreadCounts,
      dryRun
    );

    const invalidDevices = results
      .filter(r => r.error === 'INVALID_TOKEN')
      .map(r => r.deviceId)
      .filter((id): id is string => !!id);

    if (invalidDevices.length > 0 && !dryRun) {
      await supabaseService.invalidateDeviceTokens(invalidDevices);
    }

    const sent = results.filter(r => r.messageId).length;
    const failed = results.filter(r => r.error).length;

    let status: 'sent' | 'partial' | 'failed' = 'sent';
    if (sent === 0 && failed > 0) status = 'failed';
    else if (sent > 0 && failed > 0) status = 'partial';

    const totalLatency = Date.now() - startTime;

    if (!dryRun) {
      await supabaseService.updateNotificationStatus(
        notificationId, 
        status,
        { 
          sent, 
          failed, 
          total: devices.length,
          latency: totalLatency 
        }
      );
    }

    log('info', 'Notification request complete', {
      requestId,
      notificationId,
      source,
      total: userIds.length,
      enabled: enabledUserIds.length,
      devices: devices.length,
      sent,
      failed,
      status,
      latency: totalLatency,
      invalidTokens: invalidDevices.length,
      dryRun,
    });

    return new Response(
      JSON.stringify({
        success: true,
        notificationId,
        status,
        total: userIds.length,
        enabled: enabledUserIds.length,
        devices: devices.length,
        sent,
        failed,
        invalidTokens: invalidDevices.length,
        latency: totalLatency,
        dryRun,
        results: results.map(r => ({
          userId: r.userId,
          deviceId: r.deviceId,
          messageId: r.messageId,
          error: r.error,
          status: r.status
        }))
      }),
      { headers: CORS_HEADERS }
    );

  } catch (error) {
    log('error', 'Unhandled error in handleNotification', { 
      error: error.message,
      stack: error.stack,
      requestId,
      notificationId: body?.notificationId || 'unknown'
    });
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error',
        requestId,
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}



async function handlePreview(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  return new Response(
    JSON.stringify({ 
      message: 'Send Notification Function is running',
      version: '5.0.0',
      endpoints: {
        '/': 'Send notifications to users',
        '/preview': 'This preview endpoint',
        '/?dryRun=true': 'Validate without actually sending',
      },
      features: [
        'Atomic idempotency with RPC',
        'Multi-device support',
        'Rich status tracking (sent/partial/failed)',
        'Smart badge counts for iOS/Android',
        'Conversation-based grouping',
        'Collapse keys with specific IDs',
        'Exponential backoff with jitter',
        'Promise pool concurrency control',
        'Batch invalid token cleanup',
        'Fetch timeout protection',
        'GoogleAuth client caching',
        'APNS collapse-id support',
        'Android TTL (24 hours)',
        'Comprehensive failure classification',
        'Dry run support',
        'Latency metrics'
      ],
      usage: {
        method: 'POST',
        body: {
          userIds: ['user-id-1', 'user-id-2'],
          title: 'Notification Title',
          body: 'Notification Body',
          notificationId: 'message-uuid-123',
          source: 'database_trigger',
          data: { 
            type: 'NEW_MESSAGE', 
            screen: 'chat',
            chatId: 'chat-123',
            messageId: 'msg-456'
          },
          unreadCounts: { 
            'user-id-1': 5,
            'user-id-2': 3 
          }
        },
        queryParams: {
          dryRun: 'true/false - Validate without sending'
        }
      },
      env: {
        SUPABASE_URL: !!Deno.env.get('SUPABASE_URL'),
        SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        FCM_PROJECT_ID: !!Deno.env.get('FCM_PROJECT_ID'),
        FCM_CLIENT_EMAIL: !!Deno.env.get('FCM_CLIENT_EMAIL'),
        FCM_PRIVATE_KEY: !!Deno.env.get('FCM_PRIVATE_KEY'),
      }
    }),
    { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
}


Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (url.pathname.endsWith('/preview')) {
    return handlePreview(req);
  }
  
  return handleNotification(req);
});