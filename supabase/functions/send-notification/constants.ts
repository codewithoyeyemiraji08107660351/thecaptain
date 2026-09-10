
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-lovable-signature, x-lovable-timestamp',
};

export const PREVIEW_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

export const CONCURRENCY_LIMIT = 5;
export const REQUEST_TIMEOUT_MS = 30000;
export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 1000;

export const CHANNEL_MAP: Record<string, string> = {
  'RECEIVED_COMMAND': 'commands',
  'NEW_SQUAD_COMMAND': 'commands',
  'FAILED_COMMAND': 'commands',
  'NEW_MESSAGE': 'chat',
  'MENTION': 'chat',
  'NEW_MEMBER': 'squad',
  'GROUP_INVITE': 'squad',
  'DAILY_SPIN_AVAILABLE': 'rewards',
  'DAILY_SPIN_REMINDER': 'rewards',
  'CREDIT_GIFTING': 'rewards',
};