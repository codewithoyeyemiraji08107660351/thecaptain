export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      bug_reports: {
        Row: {
          created_at: string
          id: string
          message: string
          squad_id: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          squad_id?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          squad_id?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      daily_spins: {
        Row: {
          boosted_odds_until: string | null
          chemlight_until: string | null
          created_at: string
          has_reroll: boolean
          id: string
          last_spin_at: string | null
          user_id: string
        }
        Insert: {
          boosted_odds_until?: string | null
          chemlight_until?: string | null
          created_at?: string
          has_reroll?: boolean
          id?: string
          last_spin_at?: string | null
          user_id: string
        }
        Update: {
          boosted_odds_until?: string | null
          chemlight_until?: string | null
          created_at?: string
          has_reroll?: boolean
          id?: string
          last_spin_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          action_credits: number
          action_credits_exhausted_at: string | null
          avatar: string
          completed_commands: number
          consecutive_fails: number
          created_at: string
          first_name: string
          id: string
          is_premium: boolean
          last_name: string
          last_seen_at: string | null
          strikes: number
          super_action_credits: number
          super_action_credits_exhausted_at: string | null
          username: string
          warnings: number
          fcm_token?: string | null;
          fcm_token_updated_at?: string | null;
        }
        Insert: {
          action_credits?: number
          action_credits_exhausted_at?: string | null
          avatar?: string
          completed_commands?: number
          consecutive_fails?: number
          created_at?: string
          first_name?: string
          id: string
          is_premium?: boolean
          last_name?: string
          last_seen_at?: string | null
          strikes?: number
          super_action_credits?: number
          super_action_credits_exhausted_at?: string | null
          username: string
          warnings?: number
        }
        Update: {
          action_credits?: number
          action_credits_exhausted_at?: string | null
          avatar?: string
          completed_commands?: number
          consecutive_fails?: number
          created_at?: string
          first_name?: string
          id?: string
          is_premium?: boolean
          last_name?: string
          last_seen_at?: string | null
          strikes?: number
          super_action_credits?: number
          super_action_credits_exhausted_at?: string | null
          username?: string
          warnings?: number
        }
        Relationships: []
      }
      squad_live_state: {
        Row: {
          created_at: string
          squad_id: string
          state: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          squad_id: string
          state?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          squad_id?: string
          state?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_live_state_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: true
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      squad_members: {
        Row: {
          id: string
          is_captain: boolean
          joined_at: string
          last_command_at: string
          squad_id: string
          user_id: string
        }
        Insert: {
          id?: string
          is_captain?: boolean
          joined_at?: string
          last_command_at?: string
          squad_id: string
          user_id: string
        }
        Update: {
          id?: string
          is_captain?: boolean
          joined_at?: string
          last_command_at?: string
          squad_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_members_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      squads: {
        Row: {
          admin_id: string
          captain_fail_limit: number
          command_duration_hours: number
          created_at: string
          id: string
          invite_code: string
          invite_link_expires_at: string | null
          is_open: boolean
          max_captains: number
          name: string
          poll_duration_hours: number
          punishment_duration_hours: number
          theme: string
        }
        Insert: {
          admin_id: string
          captain_fail_limit?: number
          command_duration_hours?: number
          created_at?: string
          id?: string
          invite_code?: string
          invite_link_expires_at?: string | null
          is_open?: boolean
          max_captains?: number
          name: string
          poll_duration_hours?: number
          punishment_duration_hours?: number
          theme?: string
        }
        Update: {
          admin_id?: string
          captain_fail_limit?: number
          command_duration_hours?: number
          created_at?: string
          id?: string
          invite_code?: string
          invite_link_expires_at?: string | null
          is_open?: boolean
          max_captains?: number
          name?: string
          poll_duration_hours?: number
          punishment_duration_hours?: number
          theme?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_lifetime_stats: {
        Row: {
          best_spin_reward: string | null
          commands_completed: number
          commands_failed: number
          commands_issued: number
          commands_received: number
          coup_uses: number
          created_at: string
          friendly_fire_uses: number
          highest_rank_commands: number
          id: string
          power_trip_uses: number
          rank_lottery_uses: number
          saboteur_uses: number
          shield_uses: number
          spin_action_credits_earned: number
          spin_super_credits_earned: number
          stray_bullet_uses: number
          successful_coups: number
          total_action_credits_used: number
          total_captain_titles: number
          total_demotions: number
          total_promotions: number
          total_punishments_completed: number
          total_punishments_failed: number
          total_spins: number
          total_squads_joined: number
          total_strikes: number
          total_super_credits_used: number
          total_warnings: number
          user_id: string
        }
        Insert: {
          best_spin_reward?: string | null
          commands_completed?: number
          commands_failed?: number
          commands_issued?: number
          commands_received?: number
          coup_uses?: number
          created_at?: string
          friendly_fire_uses?: number
          highest_rank_commands?: number
          id?: string
          power_trip_uses?: number
          rank_lottery_uses?: number
          saboteur_uses?: number
          shield_uses?: number
          spin_action_credits_earned?: number
          spin_super_credits_earned?: number
          stray_bullet_uses?: number
          successful_coups?: number
          total_action_credits_used?: number
          total_captain_titles?: number
          total_demotions?: number
          total_promotions?: number
          total_punishments_completed?: number
          total_punishments_failed?: number
          total_spins?: number
          total_squads_joined?: number
          total_strikes?: number
          total_super_credits_used?: number
          total_warnings?: number
          user_id: string
        }
        Update: {
          best_spin_reward?: string | null
          commands_completed?: number
          commands_failed?: number
          commands_issued?: number
          commands_received?: number
          coup_uses?: number
          created_at?: string
          friendly_fire_uses?: number
          highest_rank_commands?: number
          id?: string
          power_trip_uses?: number
          rank_lottery_uses?: number
          saboteur_uses?: number
          shield_uses?: number
          spin_action_credits_earned?: number
          spin_super_credits_earned?: number
          stray_bullet_uses?: number
          successful_coups?: number
          total_action_credits_used?: number
          total_captain_titles?: number
          total_demotions?: number
          total_promotions?: number
          total_punishments_completed?: number
          total_punishments_failed?: number
          total_spins?: number
          total_squads_joined?: number
          total_strikes?: number
          total_super_credits_used?: number
          total_warnings?: number
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          squad_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          squad_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          squad_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_squad_preferences: {
        Row: {
          created_at: string
          custom_order: Json
          id: string
          sort_desc: boolean
          sort_mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_order?: Json
          id?: string
          sort_desc?: boolean
          sort_mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_order?: Json
          id?: string
          sort_desc?: boolean
          sort_mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_squad_themes: {
        Row: {
          created_at: string
          id: string
          squad_id: string
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          squad_id: string
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          squad_id?: string
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_squad_themes_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_member_rank: {
        Args: { _delta: number; _squad_id: string; _target_user_id: string }
        Returns: number
      }
      apply_demotion: {
        Args: {
          _completed_commands: number
          _squad_id: string
          _target_user_id: string
        }
        Returns: undefined
      }
      apply_legendary_bonus: {
        Args: {
          _completed_commands: number
          _squad_id: string
          _target_user_id: string
        }
        Returns: undefined
      }
      apply_punishment_outcome: {
        Args: {
          _new_warnings: number
          _squad_id: string
          _target_user_id: string
        }
        Returns: undefined
      }
      award_ad_credit: {
        Args: { _credit_type?: string | null; _transaction_id?: string | null }
        Returns: Json
      }
      award_spin_credit: { Args: { _credit_type: string }; Returns: undefined }
      can_watch_ad: {
        Args: { _credit_type: string }
        Returns: {
          can_watch: boolean
          watched_today: number
          remaining: number
          max_per_day: number
        }
      }
      check_username_available: {
        Args: { _username: string }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_lifetime_stats_row: {
        Args: { _user_id: string }
        Returns: undefined
      }
      get_my_squad_ids: { Args: never; Returns: string[] }
      get_profile_id_by_username: {
        Args: { _username: string }
        Returns: string
      }
      get_squad_invite_code: {
        Args: { _squad_id: string }
        Returns: {
          invite_code: string
          invite_link_expires_at: string
        }[]
      }
      gift_action_credits: {
        Args: { _amount: number; _recipient_id: string }
        Returns: undefined
      }
      grant_premium: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _squad_id: string
          _user_id: string
        }
        Returns: boolean
      }
      lookup_squad_by_invite_code: {
        Args: { _invite_code: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      purchase_credits: {
        Args: { _action_credits?: number; _super_credits?: number }
        Returns: undefined
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      realtime_topic_squad_id: { Args: { _topic: string }; Returns: string }
      realtime_topic_user_id: { Args: { _topic: string }; Returns: string }
      record_captain_command: {
        Args: { _squad_id: string }
        Returns: undefined
      }
      record_mission_failure: {
        Args: { _squad_id: string; _target_user_id: string }
        Returns: {
          consecutive_fails: number
          strikes: number
        }[]
      }
      record_mission_success: {
        Args: { _squad_id: string; _target_user_id: string }
        Returns: {
          completed_commands: number
        }[]
      }
      regenerate_invite_link: {
        Args: { _squad_id: string }
        Returns: {
          expires_at: string
          invite_code: string
        }[]
      }
      reset_member_profile_full: {
        Args: { _squad_id: string; _target_user_id: string }
        Returns: undefined
      }
      reset_profile_for_squad_join: { Args: never; Returns: undefined }
      reset_squad_profiles: { Args: { _squad_id: string }; Returns: undefined }
      rotate_inactive_captains: {
        Args: { _squad_id: string }
        Returns: {
          new_captain_id: string
          old_captain_id: string
        }[]
      }
      set_member_strikes: {
        Args: { _squad_id: string; _strikes: number; _target_user_id: string }
        Returns: undefined
      }
      spend_action_credits_v2: { Args: { _amount: number }; Returns: undefined }
      spend_super_action_credits_v2: {
        Args: { _amount: number }
        Returns: undefined
      }
      sync_squad_admin_role: { Args: { _squad_id: string }; Returns: undefined }
      sync_squad_captains: {
        Args: { _captain_ids: string[]; _squad_id: string }
        Returns: undefined
      }
      sync_vice_admin_roles: { Args: { _squad_id: string }; Returns: undefined }
      track_best_spin_reward: { Args: { _reward: string }; Returns: undefined }
      track_highest_rank: { Args: { _commands: number }; Returns: undefined }
      track_lifetime_stat: {
        Args: { _amount?: number; _stat: string }
        Returns: undefined
      }
      transfer_squad_admin: {
        Args: { _new_admin_id: string; _squad_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "vice_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "vice_admin"],
    },
  },
} as const
