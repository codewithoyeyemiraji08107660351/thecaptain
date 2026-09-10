// supabase/functions/send-notification/handlers.ts

import { CORS_HEADERS, PREVIEW_CORS_HEADERS, CONCURRENCY_LIMIT } from './constants.ts';
import { SupabaseService, FCMService } from './services.ts';
import { extractUserIds, log, generateRequestId, getChannelForType } from './utils.ts';
import { BatchResult } from './types.ts';

export async function handlePreview(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: PREVIEW_CORS_HEADERS });
  }

  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  const authHeader = req.headers.get('Authorization');

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...PREVIEW_CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      message: 'Notification preview endpoint',
      example: {
        userIds: ['user-id-1', 'user-id-2'],
        title: 'Test Notification',
        body: 'This is a test',
        data: { type: 'TEST', screen: 'home' }
      }
    }),
    { headers: { ...PREVIEW_CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
}

export async function handleNotification(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  log('info', 'Notification request received', { requestId });

  try {
    const body = await req.json();
    const { userIds, title, bodyText, notificationData } = extractUserIds(body);

    if (!userIds.length) {
      throw new Error('No userIds provided');
    }

    if (!title || !bodyText) {
      throw new Error('Missing title or body');
    }

    log('info', 'Processing notification', { requestId, userIdCount: userIds.length, title });

    const supabaseService = new SupabaseService();
    const fcmService = new FCMService();

    const tokens = await supabaseService.getFCMTokens(userIds);

    if (!tokens.length) {
      log('warn', 'No users with FCM tokens found', { requestId });
      return new Response(
        JSON.stringify({ error: 'No users with FCM tokens found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    log('info', 'FCM tokens fetched', { requestId, tokenCount: tokens.length });

    const fcmData: Record<string, string> = {
      timestamp: Date.now().toString(),
      requestId,
    };

    if (notificationData) {
      Object.keys(notificationData).forEach(key => {
        if (notificationData[key] !== undefined && notificationData[key] !== null) {
          fcmData[key] = String(notificationData[key]);
        }
      });
    }

    const channelId = getChannelForType(notificationData?.type);
    const results = await fcmService.sendBatch(
      tokens,
      title,
      bodyText,
      fcmData,
      channelId,
      CONCURRENCY_LIMIT
    );

    // Handle invalid tokens
    for (const result of results) {
      if (result.error === 'INVALID_TOKEN') {
        await supabaseService.invalidateToken(result.userId);
      }
    }

    const successful = results.filter(r => r.messageId);
    const failed = results.filter(r => r.error && r.error !== 'INVALID_TOKEN');

    const response: BatchResult = {
      success: successful.length > 0,
      total: tokens.length,
      sent: successful.length,
      failed: failed.length,
      results: successful,
      failedUsers: failed,
      requestId,
    };

    log('info', 'Notification batch completed', {
      requestId,
      total: tokens.length,
      sent: successful.length,
      failed: failed.length
    });

    return new Response(
      JSON.stringify(response),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    log('error', 'Notification handler error', { requestId, error: error.message });
    return new Response(
      JSON.stringify({ error: error.message, requestId }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
}