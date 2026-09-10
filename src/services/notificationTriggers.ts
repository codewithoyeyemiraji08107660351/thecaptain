import { supabase } from '@/integrations/supabase/client';
import { isNotificationEnabled, type NotificationSettings } from '@/lib/notifications';

export interface NotificationPayload {
  type: string;
  title: string;
  body: string;
  notificationId: string;
  source: string;
  data: Record<string, any>;
  unreadCounts?: Record<string, number>;
}

export class NotificationTriggers {
  
  private generateNotificationId(
    type: string, 
    entityId: string, 
    timestamp: string | number = Date.now()
  ): string {
    return `${type}_${entityId}_${timestamp}`;
  }

  private generateEventId(type: string, entityId: string): string {
    return `${type}_${entityId}`;
  }

  private generateCollapseKey(type: string, id: string): string {
    const prefixes: Record<string, string> = {
      'NEW_MESSAGE': 'chat',
      'MENTION': 'chat',
      'NEW_SQUAD_COMMAND': 'squad',
      'NEW_MEMBER': 'squad',
      'NEW_POLL': 'squad',
      'POLL_UPDATE': 'squad',
      'POLL_RESULT': 'squad',
      'RECEIVED_COMMAND': 'command',
      'FAILED_COMMAND': 'command',
      'CREDIT_GIFTING': 'credit',
      'WARNING': 'warning',
      'ACTION_USED': 'action',
      'SUPER_ACTION_USED': 'action',
      'DAILY_SPIN_AVAILABLE': 'spin',
      'DAILY_SPIN_REMINDER': 'spin',
    };
    
    const prefix = prefixes[type] || 'notification';
    return `${prefix}_${id}`;
  }

  private getSettingKeyForType(type: string): keyof NotificationSettings | null {
    const mapping: Record<string, keyof NotificationSettings> = {
      'RECEIVED_COMMAND': 'receivedCommands',
      'NEW_SQUAD_COMMAND': 'newCommands',
      'FAILED_COMMAND': 'failedCommands',
      'NEW_MESSAGE': 'newMessages',
      'MENTION': 'mentions',
      'NEW_MEMBER': 'newMembers',
      'NEW_POLL': 'polls',
      'POLL_RESULT': 'polls',
      'POLL_UPDATE': 'polls',
      'CREDIT_GIFTING': 'creditGifting',
      'WARNING': 'warnings',
      'ACTION_USED': 'actionCreditsAgainstYou',
      'SUPER_ACTION_USED': 'superActionsAgainstYou',
      'DAILY_SPIN_AVAILABLE': 'dailySpinReminder',
      'DAILY_SPIN_REMINDER': 'dailySpinReminder',
    };
    return mapping[type] || null;
  }

  // ✅ Use the proper isNotificationEnabled from @/lib/notifications
  private isTypeEnabled(type: string): boolean {
    const settingKey = this.getSettingKeyForType(type);
    if (!settingKey) {
      return true; // Default to enabled if no mapping
    }
    return isNotificationEnabled(settingKey);
  }

  private async sendWithRetry(
    userIds: string[],
    payload: NotificationPayload,
    maxRetries: number = 2
  ): Promise<any> {
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Notification timeout after 10s')), 10000);
        });

        const sendPromise = this.sendBatchNotifications(userIds, payload);
        const result = await Promise.race([sendPromise, timeoutPromise]);
        return result;
        
      } catch (error) {
        lastError = error;
        console.warn(`Notification attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000 + (Math.random() * 500);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.error('All notification attempts failed:', lastError);
    return null;
  }

  private async sendToUser(userId: string, payload: Partial<NotificationPayload>): Promise<any> {
    if (!userId) {
      console.warn('Cannot send notification: missing userId');
      return null;
    }
    
    if (payload.type && !this.isTypeEnabled(payload.type)) {
      console.log(`Notification type ${payload.type} is disabled, skipping`);
      return null;
    }
    
    return await this.sendWithRetry([userId], payload as NotificationPayload);
  }

  async sendBatchNotifications(userIds: string[], payload: NotificationPayload): Promise<any> {
    if (!userIds || userIds.length === 0) {
      console.warn('No userIds provided for batch notification');
      return [];
    }
    
    const uniqueUserIds = [...new Set(userIds)];
    
    try {
      if (!payload.notificationId) {
        console.error('Missing notificationId in payload');
        throw new Error('notificationId is required');
      }

      if (!payload.type) {
        console.error('Missing type in payload');
        throw new Error('type is required');
      }

      if (!payload.source) {
        payload.source = 'app_trigger';
      }

      const requestId = crypto.randomUUID?.() || Date.now().toString();
      
      console.log(`[${requestId}] Sending notification:`, {
        notificationId: payload.notificationId,
        userIds: uniqueUserIds.length,
        type: payload.type,
        source: payload.source,
      });

      const { data, error } = await supabase.functions.invoke('send-notification', {
        body: {
          userIds: uniqueUserIds,
          title: payload.title,
          body: payload.body,
          data: payload.data,
          notificationId: payload.notificationId,
          source: payload.source,
          unreadCounts: payload.unreadCounts,
        },
      });
      
      if (error) {
        console.error('Batch notification failed:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Batch notification error:', error);
      throw error;
    }
  }

  async sendToUsers(userIds: string[], payload: Partial<NotificationPayload>): Promise<any> {
    if (!userIds || userIds.length === 0) {
      console.warn('No users to notify');
      return [];
    }
    
    if (!payload.type) {
      throw new Error('Notification type is required');
    }
    
    if (!this.isTypeEnabled(payload.type)) {
      console.log(`Notification type ${payload.type} is disabled, skipping`);
      return null;
    }
    
    if (!payload.notificationId) {
      const entityId = payload.data?.entityId || 'unknown';
      payload.notificationId = this.generateNotificationId(
        payload.type,
        entityId,
        Date.now()
      );
    }
    
    if (!payload.data) {
      payload.data = {};
    }
    
    if (!payload.data.eventId) {
      const entityId = payload.data?.entityId || 'unknown';
      payload.data.eventId = this.generateEventId(payload.type, entityId);
    }
    
    if (!payload.data.entityType) {
      payload.data.entityType = payload.type;
    }
    
    if (!payload.source) {
      payload.source = 'app_trigger';
    }
    
    if (!payload.data.collapseKey && payload.data.entityId) {
      payload.data.collapseKey = this.generateCollapseKey(
        payload.type,
        payload.data.entityId
      );
    }
    
    return await this.sendWithRetry(userIds, payload as NotificationPayload);
  }

  // ============================================
  // TRIGGER METHODS
  // ============================================

  async triggerReceivedCommand(userId: string, sender: string, commandId: string) {
    const entityId = commandId;
    const timestamp = Date.now();
    
    return await this.sendToUser(userId, {
      type: 'RECEIVED_COMMAND',
      title: '⚓ Command Received',
      body: `${sender} has issued you a command!`,
      notificationId: this.generateNotificationId('RECEIVED_COMMAND', entityId, timestamp),
      source: 'trigger_received_command',
      data: {
        commandId,
        sender,
        screen: 'commands',
        eventId: this.generateEventId('RECEIVED_COMMAND', entityId),
        entityType: 'RECEIVED_COMMAND',
        entityId: commandId,
        collapseKey: this.generateCollapseKey('RECEIVED_COMMAND', commandId),
      },
    });
  }

  async triggerNewSquadCommand(squadId: string, squadName: string, sender: string, memberIds: string[]) {
    const entityId = squadId;
    const timestamp = Date.now();
    
    return await this.sendToUsers(memberIds, {
      type: 'NEW_SQUAD_COMMAND',
      title: '⚓ New Squad Command',
      body: `${sender} has issued a command to a fellow squad member!`,
      notificationId: this.generateNotificationId('NEW_SQUAD_COMMAND', entityId, timestamp),
      source: 'trigger_new_squad_command',
      data: {
        squadId,
        squadName,
        sender,
        screen: 'squad',
        eventId: this.generateEventId('NEW_SQUAD_COMMAND', entityId),
        entityType: 'NEW_SQUAD_COMMAND',
        entityId: squadId,
        collapseKey: this.generateCollapseKey('NEW_SQUAD_COMMAND', squadId),
      },
    });
  }

  async triggerFailedCommand(userId: string, recipient: string, commandName: string, commandId?: string) {
    const entityId = commandId || `${recipient}_${commandName}_${Date.now()}`;
    const timestamp = Date.now();
    
    return await this.sendToUser(userId, {
      type: 'FAILED_COMMAND',
      title: '❌ Command Failed',
      body: `${recipient} has failed the command!`,
      notificationId: this.generateNotificationId('FAILED_COMMAND', entityId, timestamp),
      source: 'trigger_failed_command',
      data: {
        recipient,
        commandName,
        commandId,
        screen: 'commands',
        eventId: this.generateEventId('FAILED_COMMAND', entityId),
        entityType: 'FAILED_COMMAND',
        entityId: entityId,
        collapseKey: this.generateCollapseKey('FAILED_COMMAND', entityId),
      },
    });
  }

  async triggerNewMessage(userId: string, sender: string, chatId: string, message: string, messageId?: string) {
    const entityId = messageId || `${chatId}_${Date.now()}`;
    const timestamp = Date.now();
    const truncatedMessage = message.length > 50 ? message.substring(0, 50) + '...' : message;
    
    return await this.sendToUser(userId, {
      type: 'NEW_MESSAGE',
      title: '💬 New Message',
      body: `${sender}: ${truncatedMessage}`,
      notificationId: this.generateNotificationId('NEW_MESSAGE', entityId, timestamp),
      source: 'trigger_new_message',
      data: {
        sender,
        chatId,
        messageId: messageId || entityId,
        messagePreview: message.substring(0, 100),
        screen: 'chat',
        eventId: this.generateEventId('NEW_MESSAGE', entityId),
        entityType: 'NEW_MESSAGE',
        entityId: entityId,
        collapseKey: this.generateCollapseKey('NEW_MESSAGE', chatId),
      },
    });
  }

  async triggerMention(userId: string, sender: string, chatId: string, chatName: string, messageId?: string) {
    const entityId = messageId || `${chatId}_${Date.now()}`;
    const timestamp = Date.now();
    
    return await this.sendToUser(userId, {
      type: 'MENTION',
      title: '🔔 You Were Mentioned',
      body: `${sender} mentioned you in ${chatName}!`,
      notificationId: this.generateNotificationId('MENTION', entityId, timestamp),
      source: 'trigger_mention',
      data: {
        sender,
        chatId,
        chatName,
        messageId,
        screen: 'chat',
        eventId: this.generateEventId('MENTION', entityId),
        entityType: 'MENTION',
        entityId: entityId,
        collapseKey: this.generateCollapseKey('MENTION', chatId),
      },
    });
  }

  async triggerNewMember(userId: string, name: string, squadId: string, squad: string, memberId?: string) {
    if (!userId) {
      return null;
    }

    const entityId = memberId || `${squadId}_${userId}_${Date.now()}`;
    const timestamp = Date.now();

    return await this.sendToUser(userId, {
      type: 'NEW_MEMBER',
      title: '👤 New Member',
      body: `${name} has joined ${squad}!`,
      notificationId: this.generateNotificationId('NEW_MEMBER', entityId, timestamp),
      source: 'trigger_new_member',
      data: {
        name,
        squadId,
        squad,
        memberId,
        screen: 'squad',
        timestamp: timestamp,
        eventId: this.generateEventId('NEW_MEMBER', entityId),
        entityType: 'NEW_MEMBER',
        entityId: entityId,
        collapseKey: this.generateCollapseKey('NEW_MEMBER', squadId),
      },
    });
  }

  async triggerPollUpdate(userId: string, squadId: string, squad: string, pollId: string) {
    const entityId = pollId;
    const timestamp = Date.now();
    
    return await this.sendToUser(userId, {
      type: 'POLL_UPDATE',
      title: '📊 Poll Update',
      body: `A punishment poll is live in ${squad}. Cast your vote!`,
      notificationId: this.generateNotificationId('POLL_UPDATE', entityId, timestamp),
      source: 'trigger_poll_update',
      data: {
        squadId,
        squad,
        pollId,
        screen: 'poll',
        eventId: this.generateEventId('POLL_UPDATE', entityId),
        entityType: 'POLL_UPDATE',
        entityId: pollId,
        collapseKey: this.generateCollapseKey('POLL_UPDATE', squadId),
      },
    });
  }

  async triggerPollResult(userId: string, squadId: string, squad: string, pollId: string, result: string) {
    const entityId = pollId;
    const timestamp = Date.now();
    
    return await this.sendToUser(userId, {
      type: 'POLL_RESULT',
      title: '📊 Poll Result',
      body: `The punishment poll in ${squad} has concluded!`,
      notificationId: this.generateNotificationId('POLL_RESULT', entityId, timestamp),
      source: 'trigger_poll_result',
      data: {
        squadId,
        squad,
        pollId,
        result,
        screen: 'poll',
        eventId: this.generateEventId('POLL_RESULT', entityId),
        entityType: 'POLL_RESULT',
        entityId: pollId,
        collapseKey: this.generateCollapseKey('POLL_RESULT', squadId),
      },
    });
  }

  async triggerCreditGifting(userId: string, sender: string, amount: number, transactionId?: string) {
    const entityId = transactionId || `${sender}_${userId}_${Date.now()}`;
    const timestamp = Date.now();
    
    return await this.sendToUser(userId, {
      type: 'CREDIT_GIFTING',
      title: '🎁 Credits Received',
      body: `${sender} has gifted you ${amount} Action Credit${amount > 1 ? 's' : ''}!`,
      notificationId: this.generateNotificationId('CREDIT_GIFTING', entityId, timestamp),
      source: 'trigger_credit_gifting',
      data: {
        sender,
        amount,
        transactionId,
        screen: 'credits',
        eventId: this.generateEventId('CREDIT_GIFTING', entityId),
        entityType: 'CREDIT_GIFTING',
        entityId: entityId,
        collapseKey: this.generateCollapseKey('CREDIT_GIFTING', entityId),
      },
    });
  }

  async triggerDailySpinAvailable(userId: string) {
    const date = new Date().toISOString().split('T')[0];
    const entityId = `daily_spin_${date}`;
    const timestamp = Date.now();
    
    return await this.sendToUser(userId, {
      type: 'DAILY_SPIN_AVAILABLE',
      title: '🎡 Daily Spin Available',
      body: 'Your daily spin is ready! Come claim your reward.',
      notificationId: this.generateNotificationId('DAILY_SPIN_AVAILABLE', entityId, timestamp),
      source: 'trigger_daily_spin_available',
      data: {
        screen: 'daily-spin',
        date: date,
        eventId: this.generateEventId('DAILY_SPIN_AVAILABLE', entityId),
        entityType: 'DAILY_SPIN_AVAILABLE',
        entityId: entityId,
        collapseKey: this.generateCollapseKey('DAILY_SPIN_AVAILABLE', date),
      },
    });
  }

  async triggerDailySpinReminder(userId: string) {
    const date = new Date().toISOString().split('T')[0];
    const entityId = `daily_spin_reminder_${date}`;
    const timestamp = Date.now();
    
    return await this.sendToUser(userId, {
      type: 'DAILY_SPIN_REMINDER',
      title: '🎡 Daily Spin Reminder',
      body: 'Don\'t forget to claim your daily spin reward!',
      notificationId: this.generateNotificationId('DAILY_SPIN_REMINDER', entityId, timestamp),
      source: 'trigger_daily_spin_reminder',
      data: {
        screen: 'daily-spin',
        date: date,
        eventId: this.generateEventId('DAILY_SPIN_REMINDER', entityId),
        entityType: 'DAILY_SPIN_REMINDER',
        entityId: entityId,
        collapseKey: this.generateCollapseKey('DAILY_SPIN_REMINDER', date),
      },
    });
  }

  async triggerWarning(userId: string, squadName: string, reason: string, warningId: string) {
    const entityId = warningId;
    const timestamp = Date.now();
    
    return await this.sendToUser(userId, {
      type: 'WARNING',
      title: '⚠️ Warning',
      body: `You have received an official warning from ${squadName}!`,
      notificationId: this.generateNotificationId('WARNING', entityId, timestamp),
      source: 'trigger_warning',
      data: {
        squadName,
        reason,
        warningId,
        screen: 'warnings',
        eventId: this.generateEventId('WARNING', entityId),
        entityType: 'WARNING',
        entityId: warningId,
        collapseKey: this.generateCollapseKey('WARNING', warningId),
      },
    });
  }

  async triggerActionUsed(userId: string, sender: string, actionName: string, actionId?: string) {
    const entityId = actionId || `${sender}_${userId}_${Date.now()}`;
    const timestamp = Date.now();
    
    return await this.sendToUser(userId, {
      type: 'ACTION_USED',
      title: '⚡ Action Used',
      body: `${sender} used ${actionName} against you!`,
      notificationId: this.generateNotificationId('ACTION_USED', entityId, timestamp),
      source: 'trigger_action_used',
      data: {
        sender,
        actionName,
        actionId,
        screen: 'actions',
        eventId: this.generateEventId('ACTION_USED', entityId),
        entityType: 'ACTION_USED',
        entityId: entityId,
        collapseKey: this.generateCollapseKey('ACTION_USED', entityId),
      },
    });
  }

  async triggerSuperActionUsed(userId: string, sender: string, actionName: string, actionId?: string) {
    const entityId = actionId || `${sender}_${userId}_${Date.now()}`;
    const timestamp = Date.now();
    
    return await this.sendToUser(userId, {
      type: 'SUPER_ACTION_USED',
      title: '💥 Super Action!',
      body: `${sender} unleashed ${actionName} on you!`,
      notificationId: this.generateNotificationId('SUPER_ACTION_USED', entityId, timestamp),
      source: 'trigger_super_action_used',
      data: {
        sender,
        actionName,
        actionId,
        screen: 'actions',
        eventId: this.generateEventId('SUPER_ACTION_USED', entityId),
        entityType: 'SUPER_ACTION_USED',
        entityId: entityId,
        collapseKey: this.generateCollapseKey('SUPER_ACTION_USED', entityId),
      },
    });
  }

  async triggerWithUnreadCounts(
    userIds: string[],
    payload: Partial<NotificationPayload>,
    unreadCounts: Record<string, number>
  ): Promise<any> {
    if (!payload.type) {
      throw new Error('Notification type is required');
    }
    
    if (!this.isTypeEnabled(payload.type)) {
      console.log(`Notification type ${payload.type} is disabled, skipping`);
      return null;
    }
    
    if (!payload.notificationId) {
      const entityId = payload.data?.entityId || 'unknown';
      payload.notificationId = this.generateNotificationId(
        payload.type,
        entityId,
        Date.now()
      );
    }
    
    return await this.sendWithRetry(userIds, {
      ...payload,
      unreadCounts,
    } as NotificationPayload);
  }

  async bulkSend(
    userIds: string[],
    payload: Partial<NotificationPayload>,
    batchSize: number = 100
  ): Promise<any[]> {
    const results: any[] = [];
    const uniqueUserIds = [...new Set(userIds)];
    
    if (!payload.type) {
      throw new Error('Notification type is required');
    }
    
    if (!this.isTypeEnabled(payload.type)) {
      console.log(`Notification type ${payload.type} is disabled, skipping bulk send`);
      return [{ error: 'Notification type disabled', skipped: true }];
    }
    
    for (let i = 0; i < uniqueUserIds.length; i += batchSize) {
      const batch = uniqueUserIds.slice(i, i + batchSize);
      
      try {
        if (!payload.notificationId) {
          const entityId = payload.data?.entityId || 'unknown';
          payload.notificationId = this.generateNotificationId(
            payload.type,
            entityId,
            Date.now()
          );
        }
        
        const result = await this.sendToUsers(batch, payload);
        results.push(result);
        
        if (i + batchSize < uniqueUserIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Batch ${i / batchSize} failed:`, error);
        results.push({ error, batch });
      }
    }
    
    return results;
  }

  async forceSend(
    userIds: string[],
    payload: Partial<NotificationPayload>
  ): Promise<any> {
    if (!userIds || userIds.length === 0) {
      console.warn('No users to notify');
      return [];
    }
    
    if (!payload.type) {
      throw new Error('Notification type is required');
    }
    
    if (!payload.notificationId) {
      const entityId = payload.data?.entityId || 'unknown';
      payload.notificationId = this.generateNotificationId(
        payload.type,
        entityId,
        Date.now()
      );
    }
    
    if (!payload.data) {
      payload.data = {};
    }
    
    if (!payload.data.eventId) {
      const entityId = payload.data?.entityId || 'unknown';
      payload.data.eventId = this.generateEventId(payload.type, entityId);
    }
    
    if (!payload.data.entityType) {
      payload.data.entityType = payload.type;
    }
    
    if (!payload.source) {
      payload.source = 'app_trigger_force';
    }
    
    return await this.sendWithRetry(userIds, payload as NotificationPayload);
  }
}

export const notificationTriggers = new NotificationTriggers();
