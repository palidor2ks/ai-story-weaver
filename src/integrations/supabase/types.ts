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
      admin_stats_cache: {
        Row: {
          stat_key: string
          stat_value: Json
          updated_at: string | null
        }
        Insert: {
          stat_key: string
          stat_value: Json
          updated_at?: string | null
        }
        Update: {
          stat_key?: string
          stat_value?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      bills: {
        Row: {
          additional_topics: string[] | null
          ai_detected_topics: string[] | null
          bill_number: number | null
          bill_type: string | null
          chamber: string | null
          congress: number | null
          created_at: string | null
          description: string | null
          id: string
          introduced_date: string | null
          last_action_date: string | null
          name: string
          omnibus_type: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          session: number | null
          summary: string | null
          summary_fetched_at: string | null
          topic: string
          topic_flag: string | null
          updated_at: string | null
        }
        Insert: {
          additional_topics?: string[] | null
          ai_detected_topics?: string[] | null
          bill_number?: number | null
          bill_type?: string | null
          chamber?: string | null
          congress?: number | null
          created_at?: string | null
          description?: string | null
          id: string
          introduced_date?: string | null
          last_action_date?: string | null
          name: string
          omnibus_type?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session?: number | null
          summary?: string | null
          summary_fetched_at?: string | null
          topic?: string
          topic_flag?: string | null
          updated_at?: string | null
        }
        Update: {
          additional_topics?: string[] | null
          ai_detected_topics?: string[] | null
          bill_number?: number | null
          bill_type?: string | null
          chamber?: string | null
          congress?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          introduced_date?: string | null
          last_action_date?: string | null
          name?: string
          omnibus_type?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session?: number | null
          summary?: string | null
          summary_fetched_at?: string | null
          topic?: string
          topic_flag?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      candidate_answers: {
        Row: {
          answer_value: number
          candidate_id: string
          confidence: string | null
          created_at: string
          discrepancy_note: string | null
          evidence_type: string | null
          has_discrepancy: boolean | null
          id: string
          public_statement_summary: string | null
          question_id: string
          relevance_flag: string | null
          source_description: string | null
          source_titles: string[] | null
          source_type: string | null
          source_url: string | null
          source_urls: string[] | null
          topic_flag: string | null
          updated_at: string
          voting_record_summary: string | null
        }
        Insert: {
          answer_value: number
          candidate_id: string
          confidence?: string | null
          created_at?: string
          discrepancy_note?: string | null
          evidence_type?: string | null
          has_discrepancy?: boolean | null
          id?: string
          public_statement_summary?: string | null
          question_id: string
          relevance_flag?: string | null
          source_description?: string | null
          source_titles?: string[] | null
          source_type?: string | null
          source_url?: string | null
          source_urls?: string[] | null
          topic_flag?: string | null
          updated_at?: string
          voting_record_summary?: string | null
        }
        Update: {
          answer_value?: number
          candidate_id?: string
          confidence?: string | null
          created_at?: string
          discrepancy_note?: string | null
          evidence_type?: string | null
          has_discrepancy?: boolean | null
          id?: string
          public_statement_summary?: string | null
          question_id?: string
          relevance_flag?: string | null
          source_description?: string | null
          source_titles?: string[] | null
          source_type?: string | null
          source_url?: string | null
          source_urls?: string[] | null
          topic_flag?: string | null
          updated_at?: string
          voting_record_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_answers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_voting_coverage"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "candidate_answers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_committees: {
        Row: {
          active: boolean | null
          candidate_id: string | null
          created_at: string | null
          cycles: string[] | null
          designation: string | null
          designation_full: string | null
          fec_committee_id: string
          fec_itemized_total: number | null
          has_more: boolean | null
          id: string
          is_terminated: boolean | null
          last_contribution_date: string | null
          last_cycle: string | null
          last_index: string | null
          last_sync_completed_at: string | null
          last_sync_date: string | null
          last_sync_started_at: string | null
          local_itemized_total: number | null
          name: string | null
          role: string
          source_fec_candidate_id: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          candidate_id?: string | null
          created_at?: string | null
          cycles?: string[] | null
          designation?: string | null
          designation_full?: string | null
          fec_committee_id: string
          fec_itemized_total?: number | null
          has_more?: boolean | null
          id?: string
          is_terminated?: boolean | null
          last_contribution_date?: string | null
          last_cycle?: string | null
          last_index?: string | null
          last_sync_completed_at?: string | null
          last_sync_date?: string | null
          last_sync_started_at?: string | null
          local_itemized_total?: number | null
          name?: string | null
          role?: string
          source_fec_candidate_id?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          candidate_id?: string | null
          created_at?: string | null
          cycles?: string[] | null
          designation?: string | null
          designation_full?: string | null
          fec_committee_id?: string
          fec_itemized_total?: number | null
          has_more?: boolean | null
          id?: string
          is_terminated?: boolean | null
          last_contribution_date?: string | null
          last_cycle?: string | null
          last_index?: string | null
          last_sync_completed_at?: string | null
          last_sync_date?: string | null
          last_sync_started_at?: string | null
          local_itemized_total?: number | null
          name?: string | null
          role?: string
          source_fec_candidate_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_committees_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_voting_coverage"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "candidate_committees_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_fec_ids: {
        Row: {
          candidate_id: string
          created_at: string | null
          cycle: string | null
          district: string | null
          fec_candidate_id: string
          id: string
          is_primary: boolean | null
          match_method: string | null
          match_score: number | null
          office: string
          state: string | null
          updated_at: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string | null
          cycle?: string | null
          district?: string | null
          fec_candidate_id: string
          id?: string
          is_primary?: boolean | null
          match_method?: string | null
          match_score?: number | null
          office: string
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string | null
          cycle?: string | null
          district?: string | null
          fec_candidate_id?: string
          id?: string
          is_primary?: boolean | null
          match_method?: string | null
          match_score?: number | null
          office?: string
          state?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
            referencedRelation: "candidate_voting_coverage"
            referencedColumns: ["candidate_id"]
          },
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
      candidate_votes: {
        Row: {
          action_date: string
          action_type: string
          bill_id: string
          candidate_id: string
          created_at: string | null
          id: string
          position: string
          vote_number: number | null
        }
        Insert: {
          action_date: string
          action_type: string
          bill_id: string
          candidate_id: string
          created_at?: string | null
          id?: string
          position: string
          vote_number?: number | null
        }
        Update: {
          action_date?: string
          action_type?: string
          bill_id?: string
          candidate_id?: string
          created_at?: string | null
          id?: string
          position?: string
          vote_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_votes_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
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
          lis_member_id: string | null
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
          lis_member_id?: string | null
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
          lis_member_id?: string | null
          name?: string
          office?: string
          overall_score?: number | null
          party?: Database["public"]["Enums"]["party_type"]
          score_version?: string | null
          state?: string
        }
        Relationships: []
      }
      committee_finance_rollups: {
        Row: {
          candidate_id: string
          committee_id: string
          contribution_count: number | null
          created_at: string | null
          cycle: string
          donor_count: number | null
          fec_itemized: number | null
          fec_total_receipts: number | null
          fec_unitemized: number | null
          id: string
          last_fec_check: string | null
          last_sync: string | null
          local_earmarked: number | null
          local_individual_itemized: number | null
          local_itemized: number | null
          local_loans: number | null
          local_organization: number | null
          local_other: number | null
          local_pac_contributions: number | null
          local_party_contributions: number | null
          local_transfers: number | null
          updated_at: string | null
        }
        Insert: {
          candidate_id: string
          committee_id: string
          contribution_count?: number | null
          created_at?: string | null
          cycle: string
          donor_count?: number | null
          fec_itemized?: number | null
          fec_total_receipts?: number | null
          fec_unitemized?: number | null
          id?: string
          last_fec_check?: string | null
          last_sync?: string | null
          local_earmarked?: number | null
          local_individual_itemized?: number | null
          local_itemized?: number | null
          local_loans?: number | null
          local_organization?: number | null
          local_other?: number | null
          local_pac_contributions?: number | null
          local_party_contributions?: number | null
          local_transfers?: number | null
          updated_at?: string | null
        }
        Update: {
          candidate_id?: string
          committee_id?: string
          contribution_count?: number | null
          created_at?: string | null
          cycle?: string
          donor_count?: number | null
          fec_itemized?: number | null
          fec_total_receipts?: number | null
          fec_unitemized?: number | null
          id?: string
          last_fec_check?: string | null
          last_sync?: string | null
          local_earmarked?: number | null
          local_individual_itemized?: number | null
          local_itemized?: number | null
          local_loans?: number | null
          local_organization?: number | null
          local_other?: number | null
          local_pac_contributions?: number | null
          local_party_contributions?: number | null
          local_transfers?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contributions: {
        Row: {
          amount: number
          candidate_id: string | null
          conduit_committee_id: string | null
          conduit_committee_name: string | null
          contributor_city: string | null
          contributor_name: string
          contributor_state: string | null
          contributor_type: string
          contributor_zip: string | null
          created_at: string | null
          cycle: string
          earmarked_for_candidate_id: string | null
          employer: string | null
          fec_transaction_id: string | null
          id: string
          identity_hash: string
          is_contribution: boolean | null
          is_earmarked: boolean | null
          is_transfer: boolean | null
          line_number: string | null
          memo_code: string | null
          memo_text: string | null
          occupation: string | null
          receipt_date: string | null
          recipient_committee_id: string
          recipient_committee_name: string | null
        }
        Insert: {
          amount: number
          candidate_id?: string | null
          conduit_committee_id?: string | null
          conduit_committee_name?: string | null
          contributor_city?: string | null
          contributor_name: string
          contributor_state?: string | null
          contributor_type?: string
          contributor_zip?: string | null
          created_at?: string | null
          cycle: string
          earmarked_for_candidate_id?: string | null
          employer?: string | null
          fec_transaction_id?: string | null
          id?: string
          identity_hash: string
          is_contribution?: boolean | null
          is_earmarked?: boolean | null
          is_transfer?: boolean | null
          line_number?: string | null
          memo_code?: string | null
          memo_text?: string | null
          occupation?: string | null
          receipt_date?: string | null
          recipient_committee_id: string
          recipient_committee_name?: string | null
        }
        Update: {
          amount?: number
          candidate_id?: string | null
          conduit_committee_id?: string | null
          conduit_committee_name?: string | null
          contributor_city?: string | null
          contributor_name?: string
          contributor_state?: string | null
          contributor_type?: string
          contributor_zip?: string | null
          created_at?: string | null
          cycle?: string
          earmarked_for_candidate_id?: string | null
          employer?: string | null
          fec_transaction_id?: string | null
          id?: string
          identity_hash?: string
          is_contribution?: boolean | null
          is_earmarked?: boolean | null
          is_transfer?: boolean | null
          line_number?: string | null
          memo_code?: string | null
          memo_text?: string | null
          occupation?: string | null
          receipt_date?: string | null
          recipient_committee_id?: string
          recipient_committee_name?: string | null
        }
        Relationships: []
      }
      donor_aliases: {
        Row: {
          alias_pattern: string
          alias_patterns: string[] | null
          canonical_name: string
          created_at: string | null
          donor_type: string
          donor_types: string[] | null
          fec_committee_id: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          alias_pattern: string
          alias_patterns?: string[] | null
          canonical_name: string
          created_at?: string | null
          donor_type: string
          donor_types?: string[] | null
          fec_committee_id?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          alias_pattern?: string
          alias_patterns?: string[] | null
          canonical_name?: string
          created_at?: string | null
          donor_type?: string
          donor_types?: string[] | null
          fec_committee_id?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      donors: {
        Row: {
          amount: number
          candidate_id: string | null
          conduit_committee_id: string | null
          conduit_name: string | null
          contributor_city: string | null
          contributor_state: string | null
          contributor_zip: string | null
          cycle: string
          display_name: string | null
          employer: string | null
          first_receipt_date: string | null
          id: string
          is_conduit_org: boolean | null
          is_contribution: boolean | null
          is_transfer: boolean | null
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
          candidate_id?: string | null
          conduit_committee_id?: string | null
          conduit_name?: string | null
          contributor_city?: string | null
          contributor_state?: string | null
          contributor_zip?: string | null
          cycle: string
          display_name?: string | null
          employer?: string | null
          first_receipt_date?: string | null
          id: string
          is_conduit_org?: boolean | null
          is_contribution?: boolean | null
          is_transfer?: boolean | null
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
          candidate_id?: string | null
          conduit_committee_id?: string | null
          conduit_name?: string | null
          contributor_city?: string | null
          contributor_state?: string | null
          contributor_zip?: string | null
          cycle?: string
          display_name?: string | null
          employer?: string | null
          first_receipt_date?: string | null
          id?: string
          is_conduit_org?: boolean | null
          is_contribution?: boolean | null
          is_transfer?: boolean | null
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
            referencedRelation: "candidate_voting_coverage"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "donors_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      external_committee_finance: {
        Row: {
          candidate_id: string | null
          committee_id: string
          committee_name: string | null
          created_at: string | null
          cycle: string
          designation: string
          designation_full: string | null
          id: string
          independent_expenditures: number | null
          individual_contributions: number | null
          last_fec_check: string | null
          operating_expenses: number | null
          oppose_total: number | null
          pac_contributions: number | null
          party_contributions: number | null
          support_total: number | null
          total_disbursed: number | null
          total_raised: number | null
          updated_at: string | null
        }
        Insert: {
          candidate_id?: string | null
          committee_id: string
          committee_name?: string | null
          created_at?: string | null
          cycle: string
          designation: string
          designation_full?: string | null
          id?: string
          independent_expenditures?: number | null
          individual_contributions?: number | null
          last_fec_check?: string | null
          operating_expenses?: number | null
          oppose_total?: number | null
          pac_contributions?: number | null
          party_contributions?: number | null
          support_total?: number | null
          total_disbursed?: number | null
          total_raised?: number | null
          updated_at?: string | null
        }
        Update: {
          candidate_id?: string | null
          committee_id?: string
          committee_name?: string | null
          created_at?: string | null
          cycle?: string
          designation?: string
          designation_full?: string | null
          id?: string
          independent_expenditures?: number | null
          individual_contributions?: number | null
          last_fec_check?: string | null
          operating_expenses?: number | null
          oppose_total?: number | null
          pac_contributions?: number | null
          party_contributions?: number | null
          support_total?: number | null
          total_disbursed?: number | null
          total_raised?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      finance_reconciliation: {
        Row: {
          candidate_id: string
          checked_at: string | null
          created_at: string | null
          cycle: string
          delta_amount: number | null
          delta_pct: number | null
          fec_candidate_contribution: number | null
          fec_itemized: number | null
          fec_loans: number | null
          fec_other_receipts: number | null
          fec_pac_contributions: number | null
          fec_party_contributions: number | null
          fec_total_receipts: number | null
          fec_transfers: number | null
          fec_unitemized: number | null
          id: string
          individual_delta_amount: number | null
          individual_delta_pct: number | null
          local_earmarked: number | null
          local_gross_individual: number | null
          local_individual_itemized: number | null
          local_itemized: number | null
          local_itemized_net: number | null
          local_loans: number | null
          local_organization: number | null
          local_pac_contributions: number | null
          local_party_contributions: number | null
          local_transfers: number | null
          memo_x_amount: number | null
          notes: string | null
          pac_delta_amount: number | null
          pac_delta_pct: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          candidate_id: string
          checked_at?: string | null
          created_at?: string | null
          cycle: string
          delta_amount?: number | null
          delta_pct?: number | null
          fec_candidate_contribution?: number | null
          fec_itemized?: number | null
          fec_loans?: number | null
          fec_other_receipts?: number | null
          fec_pac_contributions?: number | null
          fec_party_contributions?: number | null
          fec_total_receipts?: number | null
          fec_transfers?: number | null
          fec_unitemized?: number | null
          id?: string
          individual_delta_amount?: number | null
          individual_delta_pct?: number | null
          local_earmarked?: number | null
          local_gross_individual?: number | null
          local_individual_itemized?: number | null
          local_itemized?: number | null
          local_itemized_net?: number | null
          local_loans?: number | null
          local_organization?: number | null
          local_pac_contributions?: number | null
          local_party_contributions?: number | null
          local_transfers?: number | null
          memo_x_amount?: number | null
          notes?: string | null
          pac_delta_amount?: number | null
          pac_delta_pct?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          candidate_id?: string
          checked_at?: string | null
          created_at?: string | null
          cycle?: string
          delta_amount?: number | null
          delta_pct?: number | null
          fec_candidate_contribution?: number | null
          fec_itemized?: number | null
          fec_loans?: number | null
          fec_other_receipts?: number | null
          fec_pac_contributions?: number | null
          fec_party_contributions?: number | null
          fec_total_receipts?: number | null
          fec_transfers?: number | null
          fec_unitemized?: number | null
          id?: string
          individual_delta_amount?: number | null
          individual_delta_pct?: number | null
          local_earmarked?: number | null
          local_gross_individual?: number | null
          local_individual_itemized?: number | null
          local_itemized?: number | null
          local_itemized_net?: number | null
          local_loans?: number | null
          local_organization?: number | null
          local_pac_contributions?: number | null
          local_party_contributions?: number | null
          local_transfers?: number | null
          memo_x_amount?: number | null
          notes?: string | null
          pac_delta_amount?: number | null
          pac_delta_pct?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
      pac_candidate_totals: {
        Row: {
          candidate_id: string
          candidate_name: string | null
          committee_id: string
          committee_name: string | null
          created_at: string | null
          cycle: string
          id: string
          oppose_ratio: number | null
          oppose_total: number
          support_ratio: number | null
          support_total: number
          total_spent: number
          updated_at: string | null
        }
        Insert: {
          candidate_id: string
          candidate_name?: string | null
          committee_id: string
          committee_name?: string | null
          created_at?: string | null
          cycle: string
          id?: string
          oppose_ratio?: number | null
          oppose_total?: number
          support_ratio?: number | null
          support_total?: number
          total_spent?: number
          updated_at?: string | null
        }
        Update: {
          candidate_id?: string
          candidate_name?: string | null
          committee_id?: string
          committee_name?: string | null
          created_at?: string | null
          cycle?: string
          id?: string
          oppose_ratio?: number | null
          oppose_total?: number
          support_ratio?: number | null
          support_total?: number
          total_spent?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      pac_expenditures: {
        Row: {
          candidate_id: string | null
          candidate_name: string | null
          committee_id: string
          committee_name: string | null
          created_at: string | null
          cycle: string
          expenditure_count: number
          fec_candidate_id: string | null
          id: string
          last_expenditure_date: string | null
          support_oppose: string
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          candidate_id?: string | null
          candidate_name?: string | null
          committee_id: string
          committee_name?: string | null
          created_at?: string | null
          cycle: string
          expenditure_count?: number
          fec_candidate_id?: string | null
          id?: string
          last_expenditure_date?: string | null
          support_oppose: string
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          candidate_id?: string | null
          candidate_name?: string | null
          committee_id?: string
          committee_name?: string | null
          created_at?: string | null
          cycle?: string
          expenditure_count?: number
          fec_candidate_id?: string | null
          id?: string
          last_expenditure_date?: string | null
          support_oppose?: string
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      party_answers: {
        Row: {
          answer_value: number
          confidence: string | null
          created_at: string | null
          discrepancy_note: string | null
          evidence_type: string | null
          has_discrepancy: boolean | null
          id: string
          notes: string | null
          party_id: string
          question_id: string
          rep_voting_summary: string | null
          source_description: string | null
          source_titles: string[] | null
          source_url: string | null
          source_urls: string[] | null
          updated_at: string | null
        }
        Insert: {
          answer_value: number
          confidence?: string | null
          created_at?: string | null
          discrepancy_note?: string | null
          evidence_type?: string | null
          has_discrepancy?: boolean | null
          id?: string
          notes?: string | null
          party_id: string
          question_id: string
          rep_voting_summary?: string | null
          source_description?: string | null
          source_titles?: string[] | null
          source_url?: string | null
          source_urls?: string[] | null
          updated_at?: string | null
        }
        Update: {
          answer_value?: number
          confidence?: string | null
          created_at?: string | null
          discrepancy_note?: string | null
          evidence_type?: string | null
          has_discrepancy?: boolean | null
          id?: string
          notes?: string | null
          party_id?: string
          question_id?: string
          rep_voting_summary?: string | null
          source_description?: string | null
          source_titles?: string[] | null
          source_url?: string | null
          source_urls?: string[] | null
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
          avatar_url: string | null
          birth_date: string | null
          created_at: string | null
          email: string | null
          id: string
          identity_provider: string | null
          identity_verification_id: string | null
          identity_verified: boolean | null
          identity_verified_at: string | null
          income: string | null
          location: string | null
          name: string
          overall_score: number | null
          political_party: string | null
          religion: string | null
          score_version: string | null
          sex: string | null
          updated_at: string | null
          voter_registration_status: string | null
          voter_state: string | null
          voter_verified: boolean | null
          voter_verified_at: string | null
        }
        Insert: {
          address?: string | null
          age?: number | null
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string | null
          email?: string | null
          id: string
          identity_provider?: string | null
          identity_verification_id?: string | null
          identity_verified?: boolean | null
          identity_verified_at?: string | null
          income?: string | null
          location?: string | null
          name: string
          overall_score?: number | null
          political_party?: string | null
          religion?: string | null
          score_version?: string | null
          sex?: string | null
          updated_at?: string | null
          voter_registration_status?: string | null
          voter_state?: string | null
          voter_verified?: boolean | null
          voter_verified_at?: string | null
        }
        Update: {
          address?: string | null
          age?: number | null
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          identity_provider?: string | null
          identity_verification_id?: string | null
          identity_verified?: boolean | null
          identity_verified_at?: string | null
          income?: string | null
          location?: string | null
          name?: string
          overall_score?: number | null
          political_party?: string | null
          religion?: string | null
          score_version?: string | null
          sex?: string | null
          updated_at?: string | null
          voter_registration_status?: string | null
          voter_state?: string | null
          voter_verified?: boolean | null
          voter_verified_at?: string | null
        }
        Relationships: []
      }
      question_options: {
        Row: {
          display_order: number | null
          id: string
          is_skip_option: boolean | null
          question_id: string
          text: string
          value: number
        }
        Insert: {
          display_order?: number | null
          id: string
          is_skip_option?: boolean | null
          question_id: string
          text: string
          value: number
        }
        Update: {
          display_order?: number | null
          id?: string
          is_skip_option?: boolean | null
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
      question_update_notifications: {
        Row: {
          created_at: string | null
          dismissed_at: string | null
          entity_id: string
          entity_type: string
          id: string
          is_read: boolean | null
          new_question_text: string
          old_question_text: string
          question_id: string
          updated_answer_at: string | null
        }
        Insert: {
          created_at?: string | null
          dismissed_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          is_read?: boolean | null
          new_question_text: string
          old_question_text: string
          question_id: string
          updated_answer_at?: string | null
        }
        Update: {
          created_at?: string | null
          dismissed_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          is_read?: boolean | null
          new_question_text?: string
          old_question_text?: string
          question_id?: string
          updated_answer_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_update_notifications_question_id_fkey"
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
      user_party_comparisons: {
        Row: {
          created_at: string | null
          deep_analysis: string | null
          deep_analysis_generated_at: string | null
          id: string
          key_agreements: string[] | null
          key_disagreements: string[] | null
          match_score: number | null
          party_answers_hash: string | null
          party_id: string
          sources: Json | null
          summary: string
          updated_at: string | null
          user_answers_hash: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deep_analysis?: string | null
          deep_analysis_generated_at?: string | null
          id?: string
          key_agreements?: string[] | null
          key_disagreements?: string[] | null
          match_score?: number | null
          party_answers_hash?: string | null
          party_id: string
          sources?: Json | null
          summary: string
          updated_at?: string | null
          user_answers_hash?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          deep_analysis?: string | null
          deep_analysis_generated_at?: string | null
          id?: string
          key_agreements?: string[] | null
          key_disagreements?: string[] | null
          match_score?: number | null
          party_answers_hash?: string | null
          party_id?: string
          sources?: Json | null
          summary?: string
          updated_at?: string | null
          user_answers_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_rep_comparisons: {
        Row: {
          candidate_id: string
          created_at: string | null
          deep_analysis: string | null
          deep_analysis_generated_at: string | null
          id: string
          key_agreements: string[] | null
          key_disagreements: string[] | null
          match_score: number | null
          rep_answers_hash: string | null
          sources: Json | null
          summary: string
          updated_at: string | null
          user_answers_hash: string | null
          user_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string | null
          deep_analysis?: string | null
          deep_analysis_generated_at?: string | null
          id?: string
          key_agreements?: string[] | null
          key_disagreements?: string[] | null
          match_score?: number | null
          rep_answers_hash?: string | null
          sources?: Json | null
          summary: string
          updated_at?: string | null
          user_answers_hash?: string | null
          user_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string | null
          deep_analysis?: string | null
          deep_analysis_generated_at?: string | null
          id?: string
          key_agreements?: string[] | null
          key_disagreements?: string[] | null
          match_score?: number | null
          rep_answers_hash?: string | null
          sources?: Json | null
          summary?: string
          updated_at?: string | null
          user_answers_hash?: string | null
          user_id?: string
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
      vote_sync_status: {
        Row: {
          candidate_id: string
          created_at: string | null
          expected_cosponsored: number | null
          expected_floor_votes: number | null
          expected_sponsored: number | null
          expected_total: number | null
          floor_vote_sync_error: string | null
          id: string
          last_floor_vote_date: string | null
          last_sync_completed_at: string | null
          last_sync_started_at: string | null
          persisted_count: number | null
          persisted_floor_votes: number | null
          sync_error: string | null
          updated_at: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string | null
          expected_cosponsored?: number | null
          expected_floor_votes?: number | null
          expected_sponsored?: number | null
          expected_total?: number | null
          floor_vote_sync_error?: string | null
          id?: string
          last_floor_vote_date?: string | null
          last_sync_completed_at?: string | null
          last_sync_started_at?: string | null
          persisted_count?: number | null
          persisted_floor_votes?: number | null
          sync_error?: string | null
          updated_at?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string | null
          expected_cosponsored?: number | null
          expected_floor_votes?: number | null
          expected_sponsored?: number | null
          expected_total?: number | null
          floor_vote_sync_error?: string | null
          id?: string
          last_floor_vote_date?: string | null
          last_sync_completed_at?: string | null
          last_sync_started_at?: string | null
          persisted_count?: number | null
          persisted_floor_votes?: number | null
          sync_error?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      bill_summary_stats: {
        Row: {
          civil_rights_count: number | null
          congress_118_count: number | null
          congress_119_count: number | null
          defense_count: number | null
          economy_count: number | null
          education_count: number | null
          environment_count: number | null
          flagged_count: number | null
          government_count: number | null
          healthcare_count: number | null
          id: number | null
          immigration_count: number | null
          last_refreshed: string | null
          mismatch_count: number | null
          multi_topic_count: number | null
          native_affairs_count: number | null
          no_summary_available: number | null
          omnibus_count: number | null
          pending_fetch: number | null
          science_count: number | null
          total_bills: number | null
          with_ai_procedural_summary: number | null
          with_ai_summary: number | null
          with_crs_summary: number | null
        }
        Relationships: []
      }
      calculated_candidate_topic_scores: {
        Row: {
          answer_count: number | null
          calculated_score: number | null
          candidate_id: string | null
          topic_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_answers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_voting_coverage"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "candidate_answers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_answer_coverage_stats: {
        Row: {
          answer_count: number | null
          candidate_id: string | null
          sourced_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_answers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_voting_coverage"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "candidate_answers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_donor_counts: {
        Row: {
          candidate_id: string | null
          donor_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "donors_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_voting_coverage"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "donors_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_voting_coverage: {
        Row: {
          candidate_id: string | null
          floor_votes_count: number | null
          last_floor_vote_date: string | null
          last_vote_date: string | null
          legislative_actions_count: number | null
          name: string | null
          office: string | null
          party: Database["public"]["Enums"]["party_type"] | null
          topics_covered: number | null
          total_votes_stored: number | null
        }
        Relationships: []
      }
      donor_attributed_impact: {
        Row: {
          attributed_oppose_amount: number | null
          attributed_support_amount: number | null
          candidate_id: string | null
          candidate_name: string | null
          committee_id: string | null
          cycle: string | null
          display_name: string | null
          donation_amount: number | null
          donor_id: string | null
          donor_name: string | null
          donor_type: Database["public"]["Enums"]["donor_type"] | null
          impact_type: string | null
          oppose_ratio: number | null
          support_ratio: number | null
        }
        Relationships: []
      }
      donor_consolidated: {
        Row: {
          cycle: string | null
          display_name: string | null
          donor_ids: string[] | null
          is_consolidated: boolean | null
          name_variations: string[] | null
          primary_id: string | null
          recipient_count: number | null
          search_text: string | null
          total_amount: number | null
          total_transactions: number | null
          type: Database["public"]["Enums"]["donor_type"] | null
          types: Database["public"]["Enums"]["donor_type"][] | null
        }
        Relationships: []
      }
      topic_answer_counts: {
        Row: {
          answer_count: number | null
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
      count_donors_matching_patterns: {
        Args: { p_donor_types: string[]; patterns: string[] }
        Returns: number
      }
      get_contribution_totals: {
        Args: { p_candidate_id: string; p_cycle: string }
        Returns: {
          contribution_count: number
          earmarked_total: number
          gross_individual_total: number
          individual_total: number
          itemized_total: number
          loans_total: number
          organization_total: number
          other_total: number
          pac_total: number
          party_total: number
          passthrough_total: number
          transfers_total: number
        }[]
      }
      get_contribution_totals_by_committee: {
        Args: { p_candidate_id: string; p_cycle: string }
        Returns: {
          committee_id: string
          contribution_count: number
          earmarked_total: number
          gross_individual_total: number
          individual_total: number
          itemized_total: number
          loans_total: number
          organization_total: number
          other_total: number
          pac_total: number
          party_total: number
          transfers_total: number
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
      refresh_bill_summary_stats: { Args: never; Returns: undefined }
      refresh_donor_display_names: { Args: never; Returns: undefined }
      resolve_donor_display_name: {
        Args: { p_donor_name: string; p_donor_type: string }
        Returns: string
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
      vote_position:
        | "Yea"
        | "Nay"
        | "Present"
        | "Not Voting"
        | "Sponsored"
        | "Cosponsored"
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
      vote_position: [
        "Yea",
        "Nay",
        "Present",
        "Not Voting",
        "Sponsored",
        "Cosponsored",
      ],
    },
  },
} as const
