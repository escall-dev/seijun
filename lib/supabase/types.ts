export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type ProfileSex = "male" | "female" | "prefer_not_to_say"
export type ProfileUsageRole = "cycle_tracker" | "supporter" | "both"
export type NotificationEventStatus = "pending" | "sent" | "failed" | "cancelled"
export type CycleReminderType =
  | "period_upcoming"
  | "period_expected"
  | "fertile_window"
  | "ovulation"
  | "cycle_transition"
  | "missed_period"
  | "partner_invitation"
  | "partner_cycle_updates"
  | "partner_daily_notes"
export type PartnerRelationshipStatus = "pending" | "active" | "revoked" | "declined" | "expired"
export type PartnerInvitationStatus = "pending" | "accepted" | "declined" | "expired" | "cancelled"
export type AffinityDisplayFormat =
  | "detailed"
  | "years_months"
  | "months_days"
  | "weeks_days"
  | "total_days"

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          user_id: string
          display_name: string | null
          username: string | null
          avatar_url: string | null
          sex: ProfileSex | null
          usage_role: ProfileUsageRole | null
          last_period_start: string | null
          typical_cycle_length: number | null
          onboarding_completed: boolean
          affinity_display_format: AffinityDisplayFormat
          has_mpin: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          display_name?: string | null
          username?: string | null
          avatar_url?: string | null
          sex?: ProfileSex | null
          usage_role?: ProfileUsageRole | null
          last_period_start?: string | null
          typical_cycle_length?: number | null
          onboarding_completed?: boolean
          affinity_display_format?: AffinityDisplayFormat
          has_mpin?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          display_name?: string | null
          username?: string | null
          avatar_url?: string | null
          sex?: ProfileSex | null
          usage_role?: ProfileUsageRole | null
          last_period_start?: string | null
          typical_cycle_length?: number | null
          onboarding_completed?: boolean
          affinity_display_format?: AffinityDisplayFormat
          has_mpin?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      cycles: {
        Row: {
          id: string
          user_id: string
          start_date: string
          end_date: string | null
          cycle_length: number | null
          period_duration: number | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          start_date: string
          end_date?: string | null
          cycle_length?: number | null
          period_duration?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          start_date?: string
          end_date?: string | null
          cycle_length?: number | null
          period_duration?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      period_days: {
        Row: {
          id: string
          cycle_id: string
          user_id: string
          date: string
          flow: "light" | "medium" | "heavy"
          created_at: string
        }
        Insert: {
          id?: string
          cycle_id: string
          user_id: string
          date: string
          flow: "light" | "medium" | "heavy"
          created_at?: string
        }
        Update: {
          id?: string
          cycle_id?: string
          user_id?: string
          date?: string
          flow?: "light" | "medium" | "heavy"
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "period_days_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      symptoms: {
        Row: {
          id: string
          user_id: string
          date: string
          symptoms: string[] | null
          symptom: string
          severity: "mild" | "moderate" | "severe"
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          symptoms?: string[] | null
          symptom: string
          severity: "mild" | "moderate" | "severe"
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          symptoms?: string[] | null
          symptom?: string
          severity?: "mild" | "moderate" | "severe"
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      daily_notes: {
        Row: {
          id: string
          user_id: string
          sent_at: string | null
          request_id: string | null
          author_id: string | null
          date: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          sent_at?: string | null
          request_id?: string | null
          author_id?: string | null
          date: string
          content: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          sent_at?: string | null
          request_id?: string | null
          author_id?: string | null
          date?: string
          content?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          device_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          device_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          user_agent?: string | null
          device_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          user_id: string
          personal_reminders: boolean
          personal_updates: boolean
          partner_daily_notes: boolean
          partner_cycle_updates: boolean
          partner_activity: boolean
          partner_connection: boolean
          shared_reminders: boolean
          shared_updates: boolean
          system_notifications: boolean
          security_notifications: boolean
          period_reminders: boolean
          fertile_window_reminders: boolean
          ovulation_reminders: boolean
          cycle_transition_reminders: boolean
          missed_period_reminders: boolean
          reminder_days_before: number
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          personal_reminders?: boolean
          personal_updates?: boolean
          partner_daily_notes?: boolean
          partner_cycle_updates?: boolean
          partner_activity?: boolean
          partner_connection?: boolean
          shared_reminders?: boolean
          shared_updates?: boolean
          system_notifications?: boolean
          security_notifications?: boolean
          period_reminders?: boolean
          fertile_window_reminders?: boolean
          ovulation_reminders?: boolean
          cycle_transition_reminders?: boolean
          missed_period_reminders?: boolean
          reminder_days_before?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          personal_reminders?: boolean
          personal_updates?: boolean
          partner_daily_notes?: boolean
          partner_cycle_updates?: boolean
          partner_activity?: boolean
          partner_connection?: boolean
          shared_reminders?: boolean
          shared_updates?: boolean
          system_notifications?: boolean
          security_notifications?: boolean
          period_reminders?: boolean
          fertile_window_reminders?: boolean
          ovulation_reminders?: boolean
          cycle_transition_reminders?: boolean
          missed_period_reminders?: boolean
          reminder_days_before?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_events: {
        Row: {
          id: string
          user_id: string
          cycle_id: string | null
          type: CycleReminderType
          scheduled_for: string
          sent_at: string | null
          status: NotificationEventStatus
          title: string
          body: string
          url: string
          metadata: Json
          read_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          cycle_id?: string | null
          type: CycleReminderType
          scheduled_for: string
          sent_at?: string | null
          status?: NotificationEventStatus
          title: string
          body: string
          url?: string
          metadata?: Json
          read_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          cycle_id?: string | null
          type?: CycleReminderType
          scheduled_for?: string
          sent_at?: string | null
          status?: NotificationEventStatus
          title?: string
          body?: string
          url?: string
          metadata?: Json
          read_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_relationships: {
        Row: {
          id: string
          owner_user_id: string
          supporter_user_id: string | null
          status: PartnerRelationshipStatus
          relationship_start_date: string | null
          created_at: string
          accepted_at: string | null
          revoked_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          owner_user_id: string
          supporter_user_id?: string | null
          status?: PartnerRelationshipStatus
          relationship_start_date?: string | null
          created_at?: string
          accepted_at?: string | null
          revoked_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          owner_user_id?: string
          supporter_user_id?: string | null
          status?: PartnerRelationshipStatus
          relationship_start_date?: string | null
          created_at?: string
          accepted_at?: string | null
          revoked_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      partner_sharing_preferences: {
        Row: {
          id: string
          relationship_id: string
          owner_user_id: string
          cycle_estimates: boolean
          period_status: boolean
          cycle_preferences: boolean
          daily_notes: boolean
          manage_cycle_preferences: boolean
          manage_period_status: boolean
          manage_daily_notes: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          relationship_id: string
          owner_user_id: string
          cycle_estimates?: boolean
          period_status?: boolean
          cycle_preferences?: boolean
          daily_notes?: boolean
          manage_cycle_preferences?: boolean
          manage_period_status?: boolean
          manage_daily_notes?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          relationship_id?: string
          owner_user_id?: string
          cycle_estimates?: boolean
          period_status?: boolean
          cycle_preferences?: boolean
          daily_notes?: boolean
          manage_cycle_preferences?: boolean
          manage_period_status?: boolean
          manage_daily_notes?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_sharing_preferences_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: true
            referencedRelation: "partner_relationships"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_invitations: {
        Row: {
          id: string
          relationship_id: string
          inviter_user_id: string
          invitee_user_id: string | null
          token_hash: string
          expires_at: string
          status: PartnerInvitationStatus
          created_at: string
          accepted_at: string | null
          declined_at: string | null
          cancelled_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          relationship_id: string
          inviter_user_id: string
          invitee_user_id?: string | null
          token_hash: string
          expires_at: string
          status?: PartnerInvitationStatus
          created_at?: string
          accepted_at?: string | null
          declined_at?: string | null
          cancelled_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          relationship_id?: string
          inviter_user_id?: string
          invitee_user_id?: string | null
          token_hash?: string
          expires_at?: string
          status?: PartnerInvitationStatus
          created_at?: string
          accepted_at?: string | null
          declined_at?: string | null
          cancelled_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_invitations_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "partner_relationships"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      mpin_access_allowed: { Args: Record<PropertyKey, never>; Returns: boolean }
      mpin_status: { Args: Record<PropertyKey, never>; Returns: Json }
      mpin_enroll: { Args: { p_pin: string }; Returns: boolean }
      mpin_verify: { Args: { p_pin: string }; Returns: Json }
      mpin_lock: { Args: Record<PropertyKey, never>; Returns: undefined }
      mpin_change: { Args: { p_old_pin: string; p_new_pin: string }; Returns: boolean }
      mpin_recover: { Args: { p_new_pin: string }; Returns: boolean }
      claim_note_notification: { Args: { p_event_id: string }; Returns: string | null }
      get_notes_date_page: { Args: { p_user_id: string; p_author: string; p_snapshot: string; p_before?: string; p_limit?: number }; Returns: Json }
      get_all_push_subscriptions_for_admin_test: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at: string
          updated_at: string
        }[]
      }
      delete_expired_push_subscription_admin: {
        Args: {
          target_id: string
        }
        Returns: boolean
      }
      accept_partner_invitation: {
        Args: {
          p_token_hash: string
          p_accepting_user_id: string
        }
        Returns: Json
      }
      accept_partner_invitation_by_id: {
        Args: {
          p_invitation_id: string
          p_accepting_user_id: string
        }
        Returns: Json
      }
      decline_partner_invitation_by_id: {
        Args: {
          p_invitation_id: string
          p_declining_user_id: string
        }
        Returns: Json
      }
      search_partner_by_username: {
        Args: {
          p_query: string
          p_current_user_id: string
          p_limit?: number
        }
        Returns: {
          username: string
          display_name: string
        }[]
      }
      resolve_partner_by_username: {
        Args: {
          p_username: string
        }
        Returns: {
          user_id: string
          username: string
          display_name: string
        }[]
      }
      notify_partner_invitation: {
        Args: {
          p_invitee_user_id: string
          p_inviter_user_id: string
          p_inviter_username: string
          p_inviter_display_name?: string
        }
        Returns: string
      }
      get_partner_push_subscriptions: {
        Args: {
          p_target_user_id: string
        }
        Returns: {
          id: string
          endpoint: string
          p256dh: string
          auth: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
