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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      candidate_answers: {
        Row: {
          answer_value: number
          candidate_id: string
          confidence: string | null
          created_at: string
          id: string
          question_id: string
          source_description: string | null
          source_type: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          answer_value: number
          candidate_id: string
          confidence?: string | null
          created_at?: string
          id?: string
          question_id: string
          source_description?: string | null
          source_type?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          answer_value?: number
          candidate_id?: string
          confidence?: string | null
          created_at?: string
          id?: string
          question_id?: string
          source_description?: string | null
          source_type?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_overrides: {
        Row: {
          candidate_id: string
          confidence: string | null
          coverage_tier: string | null
          created_at: string | null
          created_by: string | null
          district: string | null
          id: string
          image_url: string | null
          name: string | null
          notes: string | null
          office: string | null
          overall_score: number | null
          party: string | null
          state: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          candidate_id: string
          confidence?: string | null
          coverage_tier?: string | null
          created_at?: string | null
          created_by?: string | null
          district?: string | null
          id?: string
          image_url?: string | null
          name?: string | null
          notes?: string | null
          office?: string | null
          overall_score?: number | null
          party?: string | null
          state?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          candidate_id?: string
          confidence?: string | null
          coverage_tier?: string | null
          created_at?: string | null
          created_by?: string | null
          district?: string | null
          id?: string
          image_url?: string | null
          name?: string | null
          notes?: string | null
          office?: string | null
          overall_score?: number | null
          party?: string | null
          state?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      candidate_topic_scores: {
        Row: {
          candidate_id: string
          id: string
          score: number
          topic_id: string
        }
        Insert: {
          candidate_id: string
          id?: string
          score?: number
          topic_id: string
        }
        Update: {
          candidate_id?: string
          id?: string
          score?: number
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_topic_scores_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_topic_scores_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          answers_source: string | null
          claimed_at: string | null
          claimed_by_user_id: string | null
          confidence: Database["public"]["Enums"]["confidence_level"] | null
          coverage_tier: Database["public"]["Enums"]["coverage_tier"] | null
          created_at: string | null
          district: string | null
          fec_candidate_id: string | null
          fec_committee_id: string | null
          id: string
          image_url: string | null
          is_incumbent: boolean | null
          last_answers_sync: string | null
          last_donor_sync: string | null
          last_updated: string | null
          name: string
          office: string
          overall_score: number | null
          party: Database["public"]["Enums"]["party_type"]
          score_version: string | null
          state: string
        }
        Insert: {
          answers_source?: string | null
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          confidence?: Database["public"]["Enums"]["confidence_level"] | null
          coverage_tier?: Database["public"]["Enums"]["coverage_tier"] | null
          created_at?: string | null
          district?: string | null
          fec_candidate_id?: string | null
          fec_committee_id?: string | null
          id: string
          image_url?: string | null
          is_incumbent?: boolean | null
          last_answers_sync?: string | null
          last_donor_sync?: string | null
          last_updated?: string | null
          name: string
          office: string
          overall_score?: number | null
          party: Database["public"]["Enums"]["party_type"]
          score_version?: string | null
          state: string
        }
        Update: {
          answers_source?: string | null
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          confidence?: Database["public"]["Enums"]["confidence_level"] | null
          coverage_tier?: Database["public"]["Enums"]["coverage_tier"] | null
          created_at?: string | null
          district?: string | null
          fec_candidate_id?: string | null
          fec_committee_id?: string | null
          id?: string
          image_url?: string | null
          is_incumbent?: boolean | null
          last_answers_sync?: string | null
          last_donor_sync?: string | null
          last_updated?: string | null
          name?: string
          office?: string
          overall_score?: number | null
          party?: Database["public"]["Enums"]["party_type"]
          score_version?: string | null
          state?: string
        }
        Relationships: []
      }
      donors: {
        Row: {
          amount: number
          candidate_id: string
          contributor_city: string | null
          contributor_state: string | null
          contributor_zip: string | null
          cycle: string
          employer: string | null
          first_receipt_date: string | null
          id: string
          is_contribution: boolean | null
          last_receipt_date: string | null
          line_number: string | null
          name: string
          occupation: string | null
          recipient_committee_id: string | null
          recipient_committee_name: string | null
          transaction_count: number | null
          type: Database["public"]["Enums"]["donor_type"]
        }
        Insert: {
          amount: number
          candidate_id: string
          contributor_city?: string | null
          contributor_state?: string | null
          contributor_zip?: string | null
          cycle: string
          employer?: string | null
          first_receipt_date?: string | null
          id: string
          is_contribution?: boolean | null
          last_receipt_date?: string | null
          line_number?: string | null
          name: string
          occupation?: string | null
          recipient_committee_id?: string | null
          recipient_committee_name?: string | null
          transaction_count?: number | null
          type: Database["public"]["Enums"]["donor_type"]
        }
        Update: {
          amount?: number
          candidate_id?: string
          contributor_city?: string | null
          contributor_state?: string | null
          contributor_zip?: string | null
          cycle?: string
          employer?: string | null
          first_receipt_date?: string | null
          id?: string
          is_contribution?: boolean | null
          last_receipt_date?: string | null
          line_number?: string | null
          name?: string
          occupation?: string | null
          recipient_committee_id?: string | null
          recipient_committee_name?: string | null
          transaction_count?: number | null
          type?: Database["public"]["Enums"]["donor_type"]
        }
        Relationships: [
          {
            foreignKeyName: "donors_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      official_transitions: {
        Row: {
          ai_confidence: string | null
          created_at: string | null
          current_office: string | null
          district: string | null
          election_date: string
          id: string
          inauguration_date: string
          is_active: boolean | null
          new_office: string
          official_name: string
          party: string | null
          source_url: string | null
          state: string
          transition_type: string
          updated_at: string | null
          verified: boolean | null
        }
        Insert: {
          ai_confidence?: string | null
          created_at?: string | null
          current_office?: string | null
          district?: string | null
          election_date: string
          id?: string
          inauguration_date: string
          is_active?: boolean | null
          new_office: string
          official_name: string
          party?: string | null
          source_url?: string | null
          state: string
          transition_type?: string
          updated_at?: string | null
          verified?: boolean | null
        }
        Update: {
          ai_confidence?: string | null
          created_at?: string | null
          current_office?: string | null
          district?: string | null
          election_date?: string
          id?: string
          inauguration_date?: string
          is_active?: boolean | null
          new_office?: string
          official_name?: string
          party?: string | null
          source_url?: string | null
          state?: string
          transition_type?: string
          updated_at?: string | null
          verified?: boolean | null
        }
        Relationships: []
      }
      party_answers: {
        Row: {
          answer_value: number
          confidence: string | null
          created_at: string | null
          id: string
          notes: string | null
          party_id: string
          question_id: string
          source_description: string | null
          source_url: string | null
          updated_at: string | null
        }
        Insert: {
          answer_value: number
          confidence?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          party_id: string
          question_id: string
          source_description?: string | null
          source_url?: string | null
          updated_at?: string | null
        }
        Update: {
          answer_value?: number
          confidence?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          party_id?: string
          question_id?: string
          source_description?: string | null
          source_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "party_answers_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "party_platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      party_platforms: {
        Row: {
          color: string
          created_at: string | null
          description: string | null
          id: string
          logo_icon: string | null
          name: string
          short_name: string
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          color: string
          created_at?: string | null
          description?: string | null
          id: string
          logo_icon?: string | null
          name: string
          short_name: string
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          description?: string | null
          id?: string
          logo_icon?: string | null
          name?: string
          short_name?: string
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      profile_access_log: {
        Row: {
          accessed_at: string | null
          action: string
          changed_fields: string[] | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accessed_at?: string | null
          action: string
          changed_fields?: string[] | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accessed_at?: string | null
          action?: string
          changed_fields?: string[] | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profile_claims: {
        Row: {
          candidate_id: string
          created_at: string | null
          id: string
          official_email: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string | null
          user_id: string
          verification_info: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string | null
          id?: string
          official_email?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
          verification_info?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string | null
          id?: string
          official_email?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
          verification_info?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          age: number | null
          created_at: string | null
          email: string | null
          id: string
          income: string | null
          location: string | null
          name: string
          overall_score: number | null
          political_party: string | null
          score_version: string | null
          sex: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          age?: number | null
          created_at?: string | null
          email?: string | null
          id: string
          income?: string | null
          location?: string | null
          name: string
          overall_score?: number | null
          political_party?: string | null
          score_version?: string | null
          sex?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          age?: number | null
          created_at?: string | null
          email?: string | null
          id?: string
          income?: string | null
          location?: string | null
          name?: string
          overall_score?: number | null
          political_party?: string | null
          score_version?: string | null
          sex?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      question_options: {
        Row: {
          display_order: number | null
          id: string
          question_id: string
          text: string
          value: number
        }
        Insert: {
          display_order?: number | null
          id: string
          question_id: string
          text: string
          value: number
        }
        Update: {
          display_order?: number | null
          id?: string
          question_id?: string
          text?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          created_at: string | null
          id: string
          is_onboarding_canonical: boolean | null
          onboarding_slot: number | null
          text: string
          topic_id: string
        }
        Insert: {
          created_at?: string | null
          id: string
          is_onboarding_canonical?: boolean | null
          onboarding_slot?: number | null
          text: string
          topic_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_onboarding_canonical?: boolean | null
          onboarding_slot?: number | null
          text?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_answers: {
        Row: {
          created_at: string | null
          id: string
          question_id: string
          selected_option_id: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          question_id: string
          selected_option_id: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string | null
          id?: string
          question_id?: string
          selected_option_id?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      static_officials: {
        Row: {
          confidence: string | null
          coverage_tier: string | null
          created_at: string | null
          district: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          level: string
          name: string
          office: string
          party: string
          state: string
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          confidence?: string | null
          coverage_tier?: string | null
          created_at?: string | null
          district?: string | null
          id: string
          image_url?: string | null
          is_active?: boolean | null
          level: string
          name: string
          office: string
          party: string
          state: string
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          confidence?: string | null
          coverage_tier?: string | null
          created_at?: string | null
          district?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          level?: string
          name?: string
          office?: string
          party?: string
          state?: string
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      topics: {
        Row: {
          icon: string
          id: string
          name: string
          weight: number | null
        }
        Insert: {
          icon: string
          id: string
          name: string
          weight?: number | null
        }
        Update: {
          icon?: string
          id?: string
          name?: string
          weight?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_topic_scores: {
        Row: {
          id: string
          score: number
          topic_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          score?: number
          topic_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          score?: number
          topic_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_topic_scores_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_topic_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_topics: {
        Row: {
          created_at: string | null
          id: string
          topic_id: string
          user_id: string
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          topic_id: string
          user_id: string
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          topic_id?: string
          user_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_topics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_topics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      votes: {
        Row: {
          bill_id: string
          bill_name: string
          candidate_id: string
          date: string
          description: string | null
          id: string
          position: Database["public"]["Enums"]["vote_position"]
          topic: string
        }
        Insert: {
          bill_id: string
          bill_name: string
          candidate_id: string
          date: string
          description?: string | null
          id: string
          position: Database["public"]["Enums"]["vote_position"]
          topic: string
        }
        Update: {
          bill_id?: string
          bill_name?: string
          candidate_id?: string
          date?: string
          description?: string | null
          id?: string
          position?: Database["public"]["Enums"]["vote_position"]
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      calculated_candidate_topic_scores: {
        Row: {
          answer_count: number | null
          calculated_score: number | null
          candidate_id: string | null
          topic_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      backfill_candidate_scores: {
        Args: never
        Returns: {
          details: string
          updated_count: number
        }[]
      }
      calculate_coverage_tier: {
        Args: { p_candidate_id: string }
        Returns: {
          confidence: Database["public"]["Enums"]["confidence_level"]
          coverage_tier: Database["public"]["Enums"]["coverage_tier"]
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recalculate_all_coverage_tiers: {
        Args: never
        Returns: {
          details: string
          updated_count: number
        }[]
      }
      recalculate_candidate_coverage: {
        Args: { p_candidate_id: string }
        Returns: {
          confidence: Database["public"]["Enums"]["confidence_level"]
          coverage_tier: Database["public"]["Enums"]["coverage_tier"]
          updated: boolean
        }[]
      }
      save_quiz_results: {
        Args: {
          p_answers: Json
          p_overall_score: number
          p_topic_scores: Json
          p_user_id: string
        }
        Returns: undefined
      }
      save_user_topics: {
        Args: { p_topics: Json; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "politician"
      confidence_level: "high" | "medium" | "low"
      coverage_tier: "tier_1" | "tier_2" | "tier_3"
      donor_type: "Individual" | "PAC" | "Organization" | "Unknown"
      party_type: "Democrat" | "Republican" | "Independent" | "Other"
      vote_position: "Yea" | "Nay" | "Present" | "Not Voting"
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
      app_role: ["admin", "moderator", "user", "politician"],
      confidence_level: ["high", "medium", "low"],
      coverage_tier: ["tier_1", "tier_2", "tier_3"],
      donor_type: ["Individual", "PAC", "Organization", "Unknown"],
      party_type: ["Democrat", "Republican", "Independent", "Other"],
      vote_position: ["Yea", "Nay", "Present", "Not Voting"],
    },
  },
} as const
