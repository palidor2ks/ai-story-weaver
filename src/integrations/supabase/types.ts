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
      ai_analysis_cache: {
        Row: {
          created_at: string
          cycle: string | null
          id: string
          input_fingerprint: string | null
          kind: string
          model: string | null
          payload: Json
          subject_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          cycle?: string | null
          id?: string
          input_fingerprint?: string | null
          kind: string
          model?: string | null
          payload: Json
          subject_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          cycle?: string | null
          id?: string
          input_fingerprint?: string | null
          kind?: string
          model?: string | null
          payload?: Json
          subject_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      badge_definitions: {
        Row: {
          active: boolean
          category: Database["public"]["Enums"]["badge_category"]
          created_at: string
          criteria: Json
          description: string
          icon: string | null
          is_repeatable: boolean
          name: string
          points: number
          priority: number
          slug: string
          tier: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: Database["public"]["Enums"]["badge_category"]
          created_at?: string
          criteria?: Json
          description: string
          icon?: string | null
          is_repeatable?: boolean
          name: string
          points?: number
          priority?: number
          slug: string
          tier?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: Database["public"]["Enums"]["badge_category"]
          created_at?: string
          criteria?: Json
          description?: string
          icon?: string | null
          is_repeatable?: boolean
          name?: string
          points?: number
          priority?: number
          slug?: string
          tier?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      bill_ingestion_status: {
        Row: {
          completed_at: string | null
          congress: number
          created_at: string | null
          error_message: string | null
          id: string
          last_offset: number | null
          started_at: string | null
          status: string | null
          total_available: number | null
          total_fetched: number | null
          total_filtered: number | null
          total_inserted: number | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          congress: number
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_offset?: number | null
          started_at?: string | null
          status?: string | null
          total_available?: number | null
          total_fetched?: number | null
          total_filtered?: number | null
          total_inserted?: number | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          congress?: number
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_offset?: number | null
          started_at?: string | null
          status?: string | null
          total_available?: number | null
          total_fetched?: number | null
          total_filtered?: number | null
          total_inserted?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bill_sponsors: {
        Row: {
          bill_id: string
          bioguide_id: string
          created_at: string | null
          id: string
          is_sponsor: boolean | null
          name: string
          party: string | null
          sponsorship_date: string | null
          state: string | null
        }
        Insert: {
          bill_id: string
          bioguide_id: string
          created_at?: string | null
          id?: string
          is_sponsor?: boolean | null
          name: string
          party?: string | null
          sponsorship_date?: string | null
          state?: string | null
        }
        Update: {
          bill_id?: string
          bioguide_id?: string
          created_at?: string | null
          id?: string
          is_sponsor?: boolean | null
          name?: string
          party?: string | null
          sponsorship_date?: string | null
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_sponsors_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_sync_status: {
        Row: {
          bills_checked: number | null
          bills_updated: number | null
          created_at: string | null
          error_message: string | null
          id: string
          last_sync_completed_at: string | null
          last_sync_started_at: string | null
          new_bills_added: number | null
          sync_type: string
          updated_at: string | null
        }
        Insert: {
          bills_checked?: number | null
          bills_updated?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_sync_completed_at?: string | null
          last_sync_started_at?: string | null
          new_bills_added?: number | null
          sync_type?: string
          updated_at?: string | null
        }
        Update: {
          bills_checked?: number | null
          bills_updated?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_sync_completed_at?: string | null
          last_sync_started_at?: string | null
          new_bills_added?: number | null
          sync_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      bills: {
        Row: {
          additional_topics: string[] | null
          ai_detected_topics: string[] | null
          amends_bill: string | null
          bill_number: number | null
          bill_type: string | null
          chamber: string | null
          committees: string | null
          congress: number | null
          cosponsor_count: number | null
          created_at: string | null
          description: string | null
          id: string
          introduced_date: string | null
          last_action_date: string | null
          last_ai_scan_at: string | null
          latest_action_date: string | null
          latest_action_text: string | null
          max_action_code: number | null
          name: string
          omnibus_type: string | null
          passed_house: boolean | null
          passed_senate: boolean | null
          raw_cosponsors: string[] | null
          related_bill_count: number | null
          related_bills: string[] | null
          reviewed_at: string | null
          reviewed_by: string | null
          session: number | null
          sponsor_bioguide_id: string | null
          sponsor_name: string | null
          sponsor_party: string | null
          sponsor_state: string | null
          status: string | null
          status_updated_at: string | null
          subject_terms: string[] | null
          summary: string | null
          summary_fetched_at: string | null
          topic: string
          topic_flag: string | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          additional_topics?: string[] | null
          ai_detected_topics?: string[] | null
          amends_bill?: string | null
          bill_number?: number | null
          bill_type?: string | null
          chamber?: string | null
          committees?: string | null
          congress?: number | null
          cosponsor_count?: number | null
          created_at?: string | null
          description?: string | null
          id: string
          introduced_date?: string | null
          last_action_date?: string | null
          last_ai_scan_at?: string | null
          latest_action_date?: string | null
          latest_action_text?: string | null
          max_action_code?: number | null
          name: string
          omnibus_type?: string | null
          passed_house?: boolean | null
          passed_senate?: boolean | null
          raw_cosponsors?: string[] | null
          related_bill_count?: number | null
          related_bills?: string[] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session?: number | null
          sponsor_bioguide_id?: string | null
          sponsor_name?: string | null
          sponsor_party?: string | null
          sponsor_state?: string | null
          status?: string | null
          status_updated_at?: string | null
          subject_terms?: string[] | null
          summary?: string | null
          summary_fetched_at?: string | null
          topic?: string
          topic_flag?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          additional_topics?: string[] | null
          ai_detected_topics?: string[] | null
          amends_bill?: string | null
          bill_number?: number | null
          bill_type?: string | null
          chamber?: string | null
          committees?: string | null
          congress?: number | null
          cosponsor_count?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          introduced_date?: string | null
          last_action_date?: string | null
          last_ai_scan_at?: string | null
          latest_action_date?: string | null
          latest_action_text?: string | null
          max_action_code?: number | null
          name?: string
          omnibus_type?: string | null
          passed_house?: boolean | null
          passed_senate?: boolean | null
          raw_cosponsors?: string[] | null
          related_bill_count?: number | null
          related_bills?: string[] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session?: number | null
          sponsor_bioguide_id?: string | null
          sponsor_name?: string | null
          sponsor_party?: string | null
          sponsor_state?: string | null
          status?: string | null
          status_updated_at?: string | null
          subject_terms?: string[] | null
          summary?: string | null
          summary_fetched_at?: string | null
          topic?: string
          topic_flag?: string | null
          updated_at?: string | null
          url?: string | null
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
      candidate_ingest_status: {
        Row: {
          cursor: Json
          error_message: string | null
          last_completed_at: string | null
          last_page: number
          last_started_at: string | null
          last_total_fetched: number
          last_total_new: number
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          cursor?: Json
          error_message?: string | null
          last_completed_at?: string | null
          last_page?: number
          last_started_at?: string | null
          last_total_fetched?: number
          last_total_new?: number
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          cursor?: Json
          error_message?: string | null
          last_completed_at?: string | null
          last_page?: number
          last_started_at?: string | null
          last_total_fetched?: number
          last_total_new?: number
          source?: string
          status?: string
          updated_at?: string
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
          is_active: boolean
          name: string | null
          notes: string | null
          office: string | null
          overall_score: number | null
          party: string | null
          prior_offices: Json | null
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
          is_active?: boolean
          name?: string | null
          notes?: string | null
          office?: string | null
          overall_score?: number | null
          party?: string | null
          prior_offices?: Json | null
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
          is_active?: boolean
          name?: string | null
          notes?: string | null
          office?: string | null
          overall_score?: number | null
          party?: string | null
          prior_offices?: Json | null
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
          vote_number: number
        }
        Insert: {
          action_date: string
          action_type: string
          bill_id: string
          candidate_id: string
          created_at?: string | null
          id?: string
          position: string
          vote_number?: number
        }
        Update: {
          action_date?: string
          action_type?: string
          bill_id?: string
          candidate_id?: string
          created_at?: string | null
          id?: string
          position?: string
          vote_number?: number
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
          last_research_at: string | null
          last_updated: string | null
          lis_member_id: string | null
          name: string
          office: string
          overall_score: number | null
          party: Database["public"]["Enums"]["party_type"]
          person_id: string | null
          research_attempts: number
          score_version: string | null
          state: string
          x_handle: string | null
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
          last_research_at?: string | null
          last_updated?: string | null
          lis_member_id?: string | null
          name: string
          office: string
          overall_score?: number | null
          party: Database["public"]["Enums"]["party_type"]
          person_id?: string | null
          research_attempts?: number
          score_version?: string | null
          state: string
          x_handle?: string | null
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
          last_research_at?: string | null
          last_updated?: string | null
          lis_member_id?: string | null
          name?: string
          office?: string
          overall_score?: number | null
          party?: Database["public"]["Enums"]["party_type"]
          person_id?: string | null
          research_attempts?: number
          score_version?: string | null
          state?: string
          x_handle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      civic_lookup_cache: {
        Row: {
          cached_at: string
          city: string | null
          district: string | null
          lat: number | null
          lng: number | null
          matched_address: string | null
          normalized_address: string
          payload: Json | null
          state: string | null
        }
        Insert: {
          cached_at?: string
          city?: string | null
          district?: string | null
          lat?: number | null
          lng?: number | null
          matched_address?: string | null
          normalized_address: string
          payload?: Json | null
          state?: string | null
        }
        Update: {
          cached_at?: string
          city?: string | null
          district?: string | null
          lat?: number | null
          lng?: number | null
          matched_address?: string | null
          normalized_address?: string
          payload?: Json | null
          state?: string | null
        }
        Relationships: []
      }
      committee_aliases: {
        Row: {
          canonical_name: string
          created_at: string
          fec_committee_ids: string[]
          id: string
          is_active: boolean
          notes: string | null
          updated_at: string
        }
        Insert: {
          canonical_name: string
          created_at?: string
          fec_committee_ids?: string[]
          id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
        }
        Update: {
          canonical_name?: string
          created_at?: string
          fec_committee_ids?: string[]
          id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      committee_causes: {
        Row: {
          ai_reasoning: string | null
          aliases: string[]
          approved_by: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          issue: string
          label: string
          quiz_topic_id: string
          stance: string
          status: string
          updated_at: string
        }
        Insert: {
          ai_reasoning?: string | null
          aliases?: string[]
          approved_by?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id: string
          issue: string
          label: string
          quiz_topic_id: string
          stance: string
          status?: string
          updated_at?: string
        }
        Update: {
          ai_reasoning?: string | null
          aliases?: string[]
          approved_by?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          issue?: string
          label?: string
          quiz_topic_id?: string
          stance?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_causes_quiz_topic_id_fkey"
            columns: ["quiz_topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
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
      committee_topics: {
        Row: {
          admin_overridden: boolean
          ai_confidence: string | null
          ai_reasoning: string | null
          assigned_by: string
          created_at: string
          fec_committee_id: string
          primary_cause_id: string
          secondary_cause_ids: string[]
          updated_at: string
        }
        Insert: {
          admin_overridden?: boolean
          ai_confidence?: string | null
          ai_reasoning?: string | null
          assigned_by?: string
          created_at?: string
          fec_committee_id: string
          primary_cause_id: string
          secondary_cause_ids?: string[]
          updated_at?: string
        }
        Update: {
          admin_overridden?: boolean
          ai_confidence?: string | null
          ai_reasoning?: string | null
          assigned_by?: string
          created_at?: string
          fec_committee_id?: string
          primary_cause_id?: string
          secondary_cause_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_topics_primary_cause_fk"
            columns: ["primary_cause_id"]
            isOneToOne: false
            referencedRelation: "committee_causes"
            referencedColumns: ["id"]
          },
        ]
      }
      conduit_organizations: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          type?: string | null
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
          fec_committee_transaction_id: string | null
          fec_transaction_id: string | null
          id: string
          identity_hash: string
          import_session_id: string | null
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
          fec_committee_transaction_id?: string | null
          fec_transaction_id?: string | null
          id?: string
          identity_hash: string
          import_session_id?: string | null
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
          fec_committee_transaction_id?: string | null
          fec_transaction_id?: string | null
          id?: string
          identity_hash?: string
          import_session_id?: string | null
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
      donor_alias_members: {
        Row: {
          alias_id: string
          created_at: string
          donor_name: string
          donor_type: string
          id: string
        }
        Insert: {
          alias_id: string
          created_at?: string
          donor_name: string
          donor_type: string
          id?: string
        }
        Update: {
          alias_id?: string
          created_at?: string
          donor_name?: string
          donor_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "donor_alias_members_alias_id_fkey"
            columns: ["alias_id"]
            isOneToOne: false
            referencedRelation: "donor_aliases"
            referencedColumns: ["id"]
          },
        ]
      }
      donor_aliases: {
        Row: {
          canonical_name: string
          cause_ai_confidence: string | null
          cause_ai_reasoning: string | null
          cause_assigned_at: string | null
          cause_assigned_by: string | null
          created_at: string | null
          fec_committee_id: string | null
          fec_committee_ids: string[]
          id: string
          is_active: boolean | null
          notes: string | null
          primary_cause_id: string | null
          updated_at: string | null
        }
        Insert: {
          canonical_name: string
          cause_ai_confidence?: string | null
          cause_ai_reasoning?: string | null
          cause_assigned_at?: string | null
          cause_assigned_by?: string | null
          created_at?: string | null
          fec_committee_id?: string | null
          fec_committee_ids?: string[]
          id?: string
          is_active?: boolean | null
          notes?: string | null
          primary_cause_id?: string | null
          updated_at?: string | null
        }
        Update: {
          canonical_name?: string
          cause_ai_confidence?: string | null
          cause_ai_reasoning?: string | null
          cause_assigned_at?: string | null
          cause_assigned_by?: string | null
          created_at?: string | null
          fec_committee_id?: string | null
          fec_committee_ids?: string[]
          id?: string
          is_active?: boolean | null
          notes?: string | null
          primary_cause_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donor_aliases_primary_cause_id_fkey"
            columns: ["primary_cause_id"]
            isOneToOne: false
            referencedRelation: "committee_causes"
            referencedColumns: ["id"]
          },
        ]
      }
      donor_cause_overrides: {
        Row: {
          assigned_at: string
          assigned_by: string
          created_at: string
          donor_name: string
          donor_type: string
          id: string
          primary_cause_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string
          created_at?: string
          donor_name: string
          donor_type: string
          id?: string
          primary_cause_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          created_at?: string
          donor_name?: string
          donor_type?: string
          id?: string
          primary_cause_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "donor_cause_overrides_primary_cause_id_fkey"
            columns: ["primary_cause_id"]
            isOneToOne: false
            referencedRelation: "committee_causes"
            referencedColumns: ["id"]
          },
        ]
      }
      donor_import_sessions: {
        Row: {
          candidate_id: string | null
          committee_id: string | null
          completed_at: string | null
          cycle: string
          detected_cycle: string | null
          filename: string | null
          id: string
          inserted_contributions: number
          inserted_donors: number
          multi_committee: boolean
          row_count: number
          started_at: string
          started_by: string | null
          status: string
          undo_summary: Json | null
          undone_at: string | null
        }
        Insert: {
          candidate_id?: string | null
          committee_id?: string | null
          completed_at?: string | null
          cycle: string
          detected_cycle?: string | null
          filename?: string | null
          id: string
          inserted_contributions?: number
          inserted_donors?: number
          multi_committee?: boolean
          row_count?: number
          started_at?: string
          started_by?: string | null
          status?: string
          undo_summary?: Json | null
          undone_at?: string | null
        }
        Update: {
          candidate_id?: string | null
          committee_id?: string | null
          completed_at?: string | null
          cycle?: string
          detected_cycle?: string | null
          filename?: string | null
          id?: string
          inserted_contributions?: number
          inserted_donors?: number
          multi_committee?: boolean
          row_count?: number
          started_at?: string
          started_by?: string | null
          status?: string
          undo_summary?: Json | null
          undone_at?: string | null
        }
        Relationships: []
      }
      donor_sync_runs: {
        Row: {
          errors: Json
          failed_count: number
          fec_ids_filled: number
          finished_at: string | null
          id: string
          mode: string
          notes: string | null
          processed: number
          remaining: number | null
          scope: string
          started_at: string
          success_count: number
          triggered_by: string
        }
        Insert: {
          errors?: Json
          failed_count?: number
          fec_ids_filled?: number
          finished_at?: string | null
          id?: string
          mode: string
          notes?: string | null
          processed?: number
          remaining?: number | null
          scope: string
          started_at?: string
          success_count?: number
          triggered_by?: string
        }
        Update: {
          errors?: Json
          failed_count?: number
          fec_ids_filled?: number
          finished_at?: string | null
          id?: string
          mode?: string
          notes?: string | null
          processed?: number
          remaining?: number | null
          scope?: string
          started_at?: string
          success_count?: number
          triggered_by?: string
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
          import_session_id: string | null
          is_conduit_org: boolean | null
          is_contribution: boolean | null
          is_transfer: boolean | null
          is_vendor_refund: boolean
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
          import_session_id?: string | null
          is_conduit_org?: boolean | null
          is_contribution?: boolean | null
          is_transfer?: boolean | null
          is_vendor_refund?: boolean
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
          import_session_id?: string | null
          is_conduit_org?: boolean | null
          is_contribution?: boolean | null
          is_transfer?: boolean | null
          is_vendor_refund?: boolean
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
      election_candidates: {
        Row: {
          candidate_id: string
          created_at: string
          election_id: string
          id: string
          is_incumbent: boolean
          office: string
          person_id: string | null
          source: string
          source_ref: string | null
          status: string
          updated_at: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          election_id: string
          id?: string
          is_incumbent?: boolean
          office: string
          person_id?: string | null
          source: string
          source_ref?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          election_id?: string
          id?: string
          is_incumbent?: boolean
          office?: string
          person_id?: string | null
          source?: string
          source_ref?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "election_candidates_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "election_candidates_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      elections: {
        Row: {
          confidence: string | null
          created_at: string
          election_date: string
          election_type: string
          id: string
          jurisdiction: string | null
          level: string
          name: string
          source: string
          source_ref: string | null
          source_url: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          election_date: string
          election_type?: string
          id?: string
          jurisdiction?: string | null
          level: string
          name: string
          source: string
          source_ref?: string | null
          source_url?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          confidence?: string | null
          created_at?: string
          election_date?: string
          election_type?: string
          id?: string
          jurisdiction?: string | null
          level?: string
          name?: string
          source?: string
          source_ref?: string | null
          source_url?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
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
      external_pacs: {
        Row: {
          city: string | null
          committee_type: string | null
          committee_type_full: string | null
          created_at: string
          cycles: string[] | null
          designation: string | null
          designation_full: string | null
          fec_committee_id: string
          filing_frequency: string | null
          first_file_date: string | null
          is_active: boolean
          last_file_date: string | null
          name: string
          organization_type: string | null
          party: string | null
          source: string
          state: string | null
          street_1: string | null
          treasurer_name: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          city?: string | null
          committee_type?: string | null
          committee_type_full?: string | null
          created_at?: string
          cycles?: string[] | null
          designation?: string | null
          designation_full?: string | null
          fec_committee_id: string
          filing_frequency?: string | null
          first_file_date?: string | null
          is_active?: boolean
          last_file_date?: string | null
          name: string
          organization_type?: string | null
          party?: string | null
          source?: string
          state?: string | null
          street_1?: string | null
          treasurer_name?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          city?: string | null
          committee_type?: string | null
          committee_type_full?: string | null
          created_at?: string
          cycles?: string[] | null
          designation?: string | null
          designation_full?: string | null
          fec_committee_id?: string
          filing_frequency?: string | null
          first_file_date?: string | null
          is_active?: boolean
          last_file_date?: string | null
          name?: string
          organization_type?: string | null
          party?: string | null
          source?: string
          state?: string | null
          street_1?: string | null
          treasurer_name?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      fec_committee_sync_status: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          last_page: number
          started_at: string
          status: string
          total_fetched: number
          total_upserted: number
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          last_page?: number
          started_at?: string
          status?: string
          total_fetched?: number
          total_upserted?: number
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          last_page?: number
          started_at?: string
          status?: string
          total_fetched?: number
          total_upserted?: number
          triggered_by?: string | null
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
          fec_offsets_to_operating_expenditures: number | null
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
          local_other_receipts: number | null
          local_pac_contributions: number | null
          local_party_contributions: number | null
          local_transfers: number | null
          memo_x_amount: number | null
          notes: string | null
          pac_delta_amount: number | null
          pac_delta_pct: number | null
          pass_through_excluded: number | null
          status: string | null
          total_receipts_delta_amount: number | null
          total_receipts_delta_pct: number | null
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
          fec_offsets_to_operating_expenditures?: number | null
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
          local_other_receipts?: number | null
          local_pac_contributions?: number | null
          local_party_contributions?: number | null
          local_transfers?: number | null
          memo_x_amount?: number | null
          notes?: string | null
          pac_delta_amount?: number | null
          pac_delta_pct?: number | null
          pass_through_excluded?: number | null
          status?: string | null
          total_receipts_delta_amount?: number | null
          total_receipts_delta_pct?: number | null
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
          fec_offsets_to_operating_expenditures?: number | null
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
          local_other_receipts?: number | null
          local_pac_contributions?: number | null
          local_party_contributions?: number | null
          local_transfers?: number | null
          memo_x_amount?: number | null
          notes?: string | null
          pac_delta_amount?: number | null
          pac_delta_pct?: number | null
          pass_through_excluded?: number | null
          status?: string | null
          total_receipts_delta_amount?: number | null
          total_receipts_delta_pct?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      fl_contributions: {
        Row: {
          address: string | null
          amount: number | null
          candidate_name: string | null
          candidate_party: string | null
          candidate_raw: string | null
          city_state_zip: string | null
          cont_date: string | null
          contributor: string | null
          district: number | null
          election: string | null
          election_year: number | null
          id: string
          inkind_desc: string | null
          is_individual: boolean | null
          occupation: string | null
          office_code: string | null
          raw: string | null
          synced_at: string
          typ: string | null
          unit_id: string
        }
        Insert: {
          address?: string | null
          amount?: number | null
          candidate_name?: string | null
          candidate_party?: string | null
          candidate_raw?: string | null
          city_state_zip?: string | null
          cont_date?: string | null
          contributor?: string | null
          district?: number | null
          election?: string | null
          election_year?: number | null
          id: string
          inkind_desc?: string | null
          is_individual?: boolean | null
          occupation?: string | null
          office_code?: string | null
          raw?: string | null
          synced_at?: string
          typ?: string | null
          unit_id: string
        }
        Update: {
          address?: string | null
          amount?: number | null
          candidate_name?: string | null
          candidate_party?: string | null
          candidate_raw?: string | null
          city_state_zip?: string | null
          cont_date?: string | null
          contributor?: string | null
          district?: number | null
          election?: string | null
          election_year?: number | null
          id?: string
          inkind_desc?: string | null
          is_individual?: boolean | null
          occupation?: string | null
          office_code?: string | null
          raw?: string | null
          synced_at?: string
          typ?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fl_contributions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "fl_finance_units"
            referencedColumns: ["id"]
          },
        ]
      }
      fl_finance_units: {
        Row: {
          contrib_synced_at: string | null
          district: number
          election: string
          election_label: string | null
          election_year: number | null
          first_seen_at: string
          id: string
          last_row_count: number | null
          last_synced_at: string | null
          office: string | null
          office_code: string
        }
        Insert: {
          contrib_synced_at?: string | null
          district: number
          election: string
          election_label?: string | null
          election_year?: number | null
          first_seen_at?: string
          id: string
          last_row_count?: number | null
          last_synced_at?: string | null
          office?: string | null
          office_code: string
        }
        Update: {
          contrib_synced_at?: string | null
          district?: number
          election?: string
          election_label?: string | null
          election_year?: number | null
          first_seen_at?: string
          id?: string
          last_row_count?: number | null
          last_synced_at?: string | null
          office?: string | null
          office_code?: string
        }
        Relationships: []
      }
      fl_sync_runs: {
        Row: {
          contributions_upserted: number | null
          error: string | null
          finished_at: string | null
          id: number
          mode: string | null
          notes: Json | null
          remaining: number | null
          started_at: string
          status: string
          units_processed: number | null
          units_upserted: number | null
        }
        Insert: {
          contributions_upserted?: number | null
          error?: string | null
          finished_at?: string | null
          id?: never
          mode?: string | null
          notes?: Json | null
          remaining?: number | null
          started_at?: string
          status?: string
          units_processed?: number | null
          units_upserted?: number | null
        }
        Update: {
          contributions_upserted?: number | null
          error?: string | null
          finished_at?: string | null
          id?: never
          mode?: string | null
          notes?: Json | null
          remaining?: number | null
          started_at?: string
          status?: string
          units_processed?: number | null
          units_upserted?: number | null
        }
        Relationships: []
      }
      hidden_states: {
        Row: {
          hidden_at: string
          hidden_by: string | null
          state_code: string
        }
        Insert: {
          hidden_at?: string
          hidden_by?: string | null
          state_code: string
        }
        Update: {
          hidden_at?: string
          hidden_by?: string | null
          state_code?: string
        }
        Relationships: []
      }
      ie_excluded_committees: {
        Row: {
          excluded_at: string
          excluded_by: string | null
          fec_committee_id: string
          reason: string
        }
        Insert: {
          excluded_at?: string
          excluded_by?: string | null
          fec_committee_id: string
          reason: string
        }
        Update: {
          excluded_at?: string
          excluded_by?: string | null
          fec_committee_id?: string
          reason?: string
        }
        Relationships: []
      }
      ie_import_sessions: {
        Row: {
          completed_at: string | null
          created_by: string | null
          cycle: string
          detected_cycle: string | null
          filename: string | null
          id: string
          inserted_rows: number
          row_count: number
          started_at: string
          status: string
          undo_summary: Json | null
          undone_at: string | null
          updated_rows: number
        }
        Insert: {
          completed_at?: string | null
          created_by?: string | null
          cycle: string
          detected_cycle?: string | null
          filename?: string | null
          id: string
          inserted_rows?: number
          row_count?: number
          started_at?: string
          status?: string
          undo_summary?: Json | null
          undone_at?: string | null
          updated_rows?: number
        }
        Update: {
          completed_at?: string | null
          created_by?: string | null
          cycle?: string
          detected_cycle?: string | null
          filename?: string | null
          id?: string
          inserted_rows?: number
          row_count?: number
          started_at?: string
          status?: string
          undo_summary?: Json | null
          undone_at?: string | null
          updated_rows?: number
        }
        Relationships: []
      }
      independent_expenditures: {
        Row: {
          amount: number
          candidate_id: string | null
          communication_type: string | null
          created_at: string
          cycle: string | null
          district: string | null
          election_type: string | null
          expenditure_date: string | null
          fec_transaction_id: string
          id: string
          image_number: string | null
          import_session_id: string | null
          office: string | null
          purpose: string | null
          raw_payload: Json
          report_type: string | null
          source: string
          spending_committee_fec_id: string
          spending_committee_name: string | null
          state: string | null
          support_oppose_indicator: string
          target_candidate_name: string | null
          target_fec_candidate_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          candidate_id?: string | null
          communication_type?: string | null
          created_at?: string
          cycle?: string | null
          district?: string | null
          election_type?: string | null
          expenditure_date?: string | null
          fec_transaction_id: string
          id?: string
          image_number?: string | null
          import_session_id?: string | null
          office?: string | null
          purpose?: string | null
          raw_payload?: Json
          report_type?: string | null
          source?: string
          spending_committee_fec_id: string
          spending_committee_name?: string | null
          state?: string | null
          support_oppose_indicator: string
          target_candidate_name?: string | null
          target_fec_candidate_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          candidate_id?: string | null
          communication_type?: string | null
          created_at?: string
          cycle?: string | null
          district?: string | null
          election_type?: string | null
          expenditure_date?: string | null
          fec_transaction_id?: string
          id?: string
          image_number?: string | null
          import_session_id?: string | null
          office?: string | null
          purpose?: string | null
          raw_payload?: Json
          report_type?: string | null
          source?: string
          spending_committee_fec_id?: string
          spending_committee_name?: string | null
          state?: string | null
          support_oppose_indicator?: string
          target_candidate_name?: string | null
          target_fec_candidate_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "independent_expenditures_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_voting_coverage"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "independent_expenditures_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      job_dead_letters: {
        Row: {
          attempts: number
          failed_at: string
          id: string
          job_type: string
          last_error: string | null
          metadata: Json
          original_queue_id: string | null
          payload: Json
        }
        Insert: {
          attempts: number
          failed_at?: string
          id?: string
          job_type: string
          last_error?: string | null
          metadata?: Json
          original_queue_id?: string | null
          payload: Json
        }
        Update: {
          attempts?: number
          failed_at?: string
          id?: string
          job_type?: string
          last_error?: string | null
          metadata?: Json
          original_queue_id?: string | null
          payload?: Json
        }
        Relationships: []
      }
      job_queue: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          created_by: string | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          job_type: string
          last_error: string | null
          lock_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          priority: number
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          job_type: string
          last_error?: string | null
          lock_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          job_type?: string
          last_error?: string | null
          lock_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Relationships: []
      }
      job_runs: {
        Row: {
          attempt: number
          checkpoint: Json | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          job_type: string
          metadata: Json
          queue_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["job_status"]
          worker_id: string | null
        }
        Insert: {
          attempt?: number
          checkpoint?: Json | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          job_type: string
          metadata?: Json
          queue_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          worker_id?: string | null
        }
        Update: {
          attempt?: number
          checkpoint?: Json | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          job_type?: string
          metadata?: Json
          queue_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_runs_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "job_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      mayor_fetch_queue: {
        Row: {
          attempts: number
          city: string
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          last_attempted_at: string | null
          resulting_candidate_id: string | null
          state: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          city: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          last_attempted_at?: string | null
          resulting_candidate_id?: string | null
          state: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          city?: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          last_attempted_at?: string | null
          resulting_candidate_id?: string | null
          state?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      news_article_questions: {
        Row: {
          article_id: string
          linked_at: string
          matched_people: string[]
          matched_topics: string[]
          question_id: string
          relevance_score: number
        }
        Insert: {
          article_id: string
          linked_at?: string
          matched_people?: string[]
          matched_topics?: string[]
          question_id: string
          relevance_score?: number
        }
        Update: {
          article_id?: string
          linked_at?: string
          matched_people?: string[]
          matched_topics?: string[]
          question_id?: string
          relevance_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "news_article_questions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "news_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_article_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      news_articles: {
        Row: {
          created_at: string
          id: string
          published_at: string
          snippet: string | null
          source: string
          title: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          published_at: string
          snippet?: string | null
          source: string
          title: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          published_at?: string
          snippet?: string | null
          source?: string
          title?: string
          url?: string
        }
        Relationships: []
      }
      nj_elec_contributions: {
        Row: {
          cand_name: string | null
          city: string | null
          cont_amt: number | null
          cont_date: string | null
          cont_type: string | null
          contrib_s: number
          contribution_type: string | null
          contributor: string | null
          contributor_type: string | null
          election_type_code: string | null
          election_year: number | null
          emp_city: string | null
          emp_name: string | null
          emp_state: string | null
          entity_s: string
          first_name: string | null
          is_individual: boolean | null
          last_name: string | null
          middle_init: string | null
          non_ind_name: string | null
          occupation_code: string | null
          occupation_name: string | null
          office_code: string | null
          party_code: string | null
          raw: Json | null
          state: string | null
          street1: string | null
          street2: string | null
          suffix: string | null
          synced_at: string
          zip: string | null
        }
        Insert: {
          cand_name?: string | null
          city?: string | null
          cont_amt?: number | null
          cont_date?: string | null
          cont_type?: string | null
          contrib_s: number
          contribution_type?: string | null
          contributor?: string | null
          contributor_type?: string | null
          election_type_code?: string | null
          election_year?: number | null
          emp_city?: string | null
          emp_name?: string | null
          emp_state?: string | null
          entity_s: string
          first_name?: string | null
          is_individual?: boolean | null
          last_name?: string | null
          middle_init?: string | null
          non_ind_name?: string | null
          occupation_code?: string | null
          occupation_name?: string | null
          office_code?: string | null
          party_code?: string | null
          raw?: Json | null
          state?: string | null
          street1?: string | null
          street2?: string | null
          suffix?: string | null
          synced_at?: string
          zip?: string | null
        }
        Update: {
          cand_name?: string | null
          city?: string | null
          cont_amt?: number | null
          cont_date?: string | null
          cont_type?: string | null
          contrib_s?: number
          contribution_type?: string | null
          contributor?: string | null
          contributor_type?: string | null
          election_type_code?: string | null
          election_year?: number | null
          emp_city?: string | null
          emp_name?: string | null
          emp_state?: string | null
          entity_s?: string
          first_name?: string | null
          is_individual?: boolean | null
          last_name?: string | null
          middle_init?: string | null
          non_ind_name?: string | null
          occupation_code?: string | null
          occupation_name?: string | null
          office_code?: string | null
          party_code?: string | null
          raw?: Json | null
          state?: string | null
          street1?: string | null
          street2?: string | null
          suffix?: string | null
          synced_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nj_elec_contributions_entity_s_fkey"
            columns: ["entity_s"]
            isOneToOne: false
            referencedRelation: "nj_elec_entities"
            referencedColumns: ["entity_s"]
          },
        ]
      }
      nj_elec_entities: {
        Row: {
          contrib_synced_at: string | null
          election_type: string | null
          election_type_code: string | null
          election_year: number | null
          entity_first_name: string | null
          entity_id: string | null
          entity_last_name: string | null
          entity_name: string
          entity_s: string
          first_seen_at: string
          last_synced_at: string
          location: string | null
          location_code: string | null
          office: string | null
          office_code: string | null
          party: string | null
          party_code: string | null
          raw: Json | null
          total_contributions: number | null
          total_expenditures: number | null
        }
        Insert: {
          contrib_synced_at?: string | null
          election_type?: string | null
          election_type_code?: string | null
          election_year?: number | null
          entity_first_name?: string | null
          entity_id?: string | null
          entity_last_name?: string | null
          entity_name: string
          entity_s: string
          first_seen_at?: string
          last_synced_at?: string
          location?: string | null
          location_code?: string | null
          office?: string | null
          office_code?: string | null
          party?: string | null
          party_code?: string | null
          raw?: Json | null
          total_contributions?: number | null
          total_expenditures?: number | null
        }
        Update: {
          contrib_synced_at?: string | null
          election_type?: string | null
          election_type_code?: string | null
          election_year?: number | null
          entity_first_name?: string | null
          entity_id?: string | null
          entity_last_name?: string | null
          entity_name?: string
          entity_s?: string
          first_seen_at?: string
          last_synced_at?: string
          location?: string | null
          location_code?: string | null
          office?: string | null
          office_code?: string | null
          party?: string | null
          party_code?: string | null
          raw?: Json | null
          total_contributions?: number | null
          total_expenditures?: number | null
        }
        Relationships: []
      }
      nj_elec_sync_runs: {
        Row: {
          contributions_upserted: number | null
          election_years: number[] | null
          entities_upserted: number | null
          error: string | null
          finished_at: string | null
          id: number
          notes: Json | null
          office_codes: string[] | null
          started_at: string
          status: string
        }
        Insert: {
          contributions_upserted?: number | null
          election_years?: number[] | null
          entities_upserted?: number | null
          error?: string | null
          finished_at?: string | null
          id?: never
          notes?: Json | null
          office_codes?: string[] | null
          started_at?: string
          status?: string
        }
        Update: {
          contributions_upserted?: number | null
          election_years?: number[] | null
          entities_upserted?: number | null
          error?: string | null
          finished_at?: string | null
          id?: never
          notes?: Json | null
          office_codes?: string[] | null
          started_at?: string
          status?: string
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
      pending_badge_notifications: {
        Row: {
          badge_slug: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_slug: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_slug?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_badge_notifications_badge_slug_fkey"
            columns: ["badge_slug"]
            isOneToOne: false
            referencedRelation: "badge_definitions"
            referencedColumns: ["slug"]
          },
        ]
      }
      persons: {
        Row: {
          bioguide_id: string | null
          created_at: string
          display_name: string
          fec_candidate_id: string | null
          id: string
          normalized_name: string | null
          office_key: string | null
          openstates_id: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          bioguide_id?: string | null
          created_at?: string
          display_name: string
          fec_candidate_id?: string | null
          id?: string
          normalized_name?: string | null
          office_key?: string | null
          openstates_id?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          bioguide_id?: string | null
          created_at?: string
          display_name?: string
          fec_candidate_id?: string | null
          id?: string
          normalized_name?: string | null
          office_key?: string | null
          openstates_id?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      poll_questions: {
        Row: {
          created_at: string
          display_order: number
          id: string
          poll_id: string
          question_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          poll_id: string
          question_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          poll_id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_questions_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_response_answers: {
        Row: {
          created_at: string
          id: string
          question_id: string
          response_id: string
          selected_option_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          response_id: string
          selected_option_id: string
          value?: number
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          response_id?: string
          selected_option_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "poll_response_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_response_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "poll_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_response_answers_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_responses: {
        Row: {
          anon_session_id: string | null
          id: string
          poll_id: string
          referrer: string | null
          submitted_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          anon_session_id?: string | null
          id?: string
          poll_id: string
          referrer?: string | null
          submitted_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          anon_session_id?: string | null
          id?: string
          poll_id?: string
          referrer?: string | null
          submitted_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "poll_responses_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_social_posts: {
        Row: {
          created_at: string
          error: string | null
          id: string
          platform: string
          poll_id: string
          posted_at: string | null
          remote_post_id: string | null
          remote_post_url: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          platform: string
          poll_id: string
          posted_at?: string | null
          remote_post_id?: string | null
          remote_post_url?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          platform?: string
          poll_id?: string
          posted_at?: string | null
          remote_post_id?: string | null
          remote_post_url?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_social_posts_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          auto_post: boolean | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          og_image_url: string | null
          published_at: string | null
          share_caption: string | null
          share_platforms: string[] | null
          slug: string
          status: string
          title: string
          topic_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          auto_post?: boolean | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          og_image_url?: string | null
          published_at?: string | null
          share_caption?: string | null
          share_platforms?: string[] | null
          slug: string
          status?: string
          title: string
          topic_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          auto_post?: boolean | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          og_image_url?: string | null
          published_at?: string | null
          share_caption?: string | null
          share_platforms?: string[] | null
          slug?: string
          status?: string
          title?: string
          topic_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "polls_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
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
          education_level: string | null
          email: string | null
          employment_status: string | null
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
          race: string | null
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
          education_level?: string | null
          email?: string | null
          employment_status?: string | null
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
          race?: string | null
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
          education_level?: string | null
          email?: string | null
          employment_status?: string | null
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
          race?: string | null
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
      question_news_feed_cache: {
        Row: {
          article_id: string
          last_seen_at: string
          question_id: string
          rank_score: number
          window_label: string
        }
        Insert: {
          article_id: string
          last_seen_at?: string
          question_id: string
          rank_score?: number
          window_label: string
        }
        Update: {
          article_id?: string
          last_seen_at?: string
          question_id?: string
          rank_score?: number
          window_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_news_feed_cache_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "news_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_news_feed_cache_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
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
          include_in_politician_quiz: boolean
          include_in_quiz_library: boolean
          is_onboarding_canonical: boolean | null
          onboarding_slot: number | null
          source: string
          text: string
          topic_id: string
        }
        Insert: {
          created_at?: string | null
          id: string
          include_in_politician_quiz?: boolean
          include_in_quiz_library?: boolean
          is_onboarding_canonical?: boolean | null
          onboarding_slot?: number | null
          source?: string
          text: string
          topic_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          include_in_politician_quiz?: boolean
          include_in_quiz_library?: boolean
          is_onboarding_canonical?: boolean | null
          onboarding_slot?: number | null
          source?: string
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
      representative_social_posts: {
        Row: {
          candidate_id: string
          created_at: string
          fetched_at: string
          handle: string
          id: string
          metadata: Json
          platform: string
          post_id: string
          post_text: string | null
          post_url: string
          posted_at: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          fetched_at?: string
          handle: string
          id?: string
          metadata?: Json
          platform?: string
          post_id: string
          post_text?: string | null
          post_url: string
          posted_at: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          fetched_at?: string
          handle?: string
          id?: string
          metadata?: Json
          platform?: string
          post_id?: string
          post_text?: string | null
          post_url?: string
          posted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "representative_social_posts_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_voting_coverage"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "representative_social_posts_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      share_cards: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          image_path: string
          og_description: string
          og_title: string
          target_url: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id: string
          image_path: string
          og_description?: string
          og_title: string
          target_url: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          image_path?: string
          og_description?: string
          og_title?: string
          target_url?: string
          user_id?: string | null
        }
        Relationships: []
      }
      social_post_platforms: {
        Row: {
          caption: string | null
          created_at: string
          enabled: boolean
          error_message: string | null
          external_post_id: string | null
          external_url: string | null
          id: string
          platform: string
          post_id: string
          posted_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          enabled?: boolean
          error_message?: string | null
          external_post_id?: string | null
          external_url?: string | null
          id?: string
          platform: string
          post_id: string
          posted_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          enabled?: boolean
          error_message?: string | null
          external_post_id?: string | null
          external_url?: string | null
          id?: string
          platform?: string
          post_id?: string
          posted_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_platforms_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_settings: {
        Row: {
          auto_approve_after_hours: number
          facebook_enabled: boolean
          id: number
          instagram_enabled: boolean
          mode: string
          post_time_local: string
          recent_skip_days: number
          tiktok_enabled: boolean
          timezone: string
          updated_at: string
          x_enabled: boolean
        }
        Insert: {
          auto_approve_after_hours?: number
          facebook_enabled?: boolean
          id?: number
          instagram_enabled?: boolean
          mode?: string
          post_time_local?: string
          recent_skip_days?: number
          tiktok_enabled?: boolean
          timezone?: string
          updated_at?: string
          x_enabled?: boolean
        }
        Update: {
          auto_approve_after_hours?: number
          facebook_enabled?: boolean
          id?: number
          instagram_enabled?: boolean
          mode?: string
          post_time_local?: string
          recent_skip_days?: number
          tiktok_enabled?: boolean
          timezone?: string
          updated_at?: string
          x_enabled?: boolean
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          image_path: string | null
          image_url: string | null
          posted_at: string | null
          rejected_reason: string | null
          reviewed_by: string | null
          scheduled_for: string | null
          share_card_id: string | null
          share_url: string | null
          stat_key: string | null
          stat_payload: Json | null
          status: string
          subject_id: string
          subject_label: string | null
          subject_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          image_path?: string | null
          image_url?: string | null
          posted_at?: string | null
          rejected_reason?: string | null
          reviewed_by?: string | null
          scheduled_for?: string | null
          share_card_id?: string | null
          share_url?: string | null
          stat_key?: string | null
          stat_payload?: Json | null
          status?: string
          subject_id: string
          subject_label?: string | null
          subject_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          image_path?: string | null
          image_url?: string | null
          posted_at?: string | null
          rejected_reason?: string | null
          reviewed_by?: string | null
          scheduled_for?: string | null
          share_card_id?: string | null
          share_url?: string | null
          stat_key?: string | null
          stat_payload?: Json | null
          status?: string
          subject_id?: string
          subject_label?: string | null
          subject_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      static_officials: {
        Row: {
          bio: string | null
          city: string | null
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
          person_id: string | null
          source_last_fetched_at: string | null
          source_url: string | null
          state: string
          term_end: string | null
          term_start: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          bio?: string | null
          city?: string | null
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
          person_id?: string | null
          source_last_fetched_at?: string | null
          source_url?: string | null
          state: string
          term_end?: string | null
          term_start?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          bio?: string | null
          city?: string | null
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
          person_id?: string | null
          source_last_fetched_at?: string | null
          source_url?: string | null
          state?: string
          term_end?: string | null
          term_start?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "static_officials_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          icon: string
          id: string
          name: string
          scope: string
          weight: number | null
        }
        Insert: {
          icon: string
          id: string
          name: string
          scope?: string
          weight?: number | null
        }
        Update: {
          icon?: string
          id?: string
          name?: string
          scope?: string
          weight?: number | null
        }
        Relationships: []
      }
      user_activity_events: {
        Row: {
          created_at: string
          day_key: string | null
          event_type: string
          id: string
          payload: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          day_key?: string | null
          event_type: string
          id?: string
          payload?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          day_key?: string | null
          event_type?: string
          id?: string
          payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          awarded_at: string
          badge_slug: string
          event_id: string | null
          id: string
          metadata: Json
          scope_key: string | null
          user_id: string
        }
        Insert: {
          awarded_at?: string
          badge_slug: string
          event_id?: string | null
          id?: string
          metadata?: Json
          scope_key?: string | null
          user_id: string
        }
        Update: {
          awarded_at?: string
          badge_slug?: string
          event_id?: string | null
          id?: string
          metadata?: Json
          scope_key?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_slug_fkey"
            columns: ["badge_slug"]
            isOneToOne: false
            referencedRelation: "badge_definitions"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "user_badges_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "user_activity_events"
            referencedColumns: ["id"]
          },
        ]
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
      vendor_refund_organizations: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
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
      x_account_tokens: {
        Row: {
          access_token: string
          account_handle: string
          created_at: string
          expires_at: string | null
          id: string
          refresh_token: string | null
          scope: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          account_handle: string
          created_at?: string
          expires_at?: string | null
          id?: string
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          account_handle?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      x_oauth_pending: {
        Row: {
          code_verifier: string
          created_at: string
          redirect_uri: string | null
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          redirect_uri?: string | null
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          redirect_uri?: string | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      bill_summary_stats: {
        Row: {
          congress_114_count: number | null
          congress_115_count: number | null
          congress_116_count: number | null
          congress_117_count: number | null
          congress_118_count: number | null
          congress_119_count: number | null
          flagged_count: number | null
          id: number | null
          last_refreshed: string | null
          mismatch_count: number | null
          multi_topic_count: number | null
          needs_ai_generation: number | null
          no_summary_available: number | null
          omnibus_count: number | null
          pending_fetch: number | null
          topic_civil_rights: number | null
          topic_defense: number | null
          topic_economy: number | null
          topic_education: number | null
          topic_environment: number | null
          topic_foreign_affairs: number | null
          topic_government: number | null
          topic_health: number | null
          topic_immigration: number | null
          topic_judicial: number | null
          topic_native: number | null
          topic_science: number | null
          topic_social: number | null
          topic_uncategorized: number | null
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
        Relationships: []
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
      candidate_independent_expenditure_totals: {
        Row: {
          candidate_id: string | null
          expenditure_count: number | null
          oppose_amount: number | null
          support_amount: number | null
          target_fec_candidate_id: string | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "independent_expenditures_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_voting_coverage"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "independent_expenditures_candidate_id_fkey"
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
      committee_independent_expenditure_totals: {
        Row: {
          expenditure_count: number | null
          oppose_amount: number | null
          spending_committee_fec_id: string | null
          spending_committee_name: string | null
          support_amount: number | null
          total_amount: number | null
        }
        Relationships: []
      }
      committee_pool_mv: {
        Row: {
          committee_type: string | null
          designation: string | null
          fec_committee_id: string | null
          name: string | null
          source: string | null
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
      ie_excluded_committees_public: {
        Row: {
          excluded_at: string | null
          fec_committee_id: string | null
          reason: string | null
        }
        Insert: {
          excluded_at?: string | null
          fec_committee_id?: string | null
          reason?: string | null
        }
        Update: {
          excluded_at?: string | null
          fec_committee_id?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      independent_expenditure_cycles: {
        Row: {
          cycle: string | null
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
      _award_badge: {
        Args: {
          p_event_id?: string
          p_metadata?: Json
          p_slug: string
          p_user_id: string
        }
        Returns: boolean
      }
      _candidate_district_key: { Args: { p_district: string }; Returns: string }
      _candidate_name_key: { Args: { p_name: string }; Returns: string }
      _candidate_office_class: { Args: { p_office: string }; Returns: string }
      _check_candidate: {
        Args: {
          p_event: string
          p_event_id: string
          p_payload: Json
          p_user: string
        }
        Returns: undefined
      }
      _check_engagement_misc: {
        Args: {
          p_event: string
          p_event_id: string
          p_payload: Json
          p_user: string
        }
        Returns: undefined
      }
      _check_identity: {
        Args: {
          p_event: string
          p_event_id: string
          p_payload: Json
          p_user: string
        }
        Returns: undefined
      }
      _check_onboarding: {
        Args: {
          p_event: string
          p_event_id: string
          p_payload: Json
          p_user: string
        }
        Returns: undefined
      }
      _check_question_progress: {
        Args: {
          p_event: string
          p_event_id: string
          p_payload: Json
          p_user: string
        }
        Returns: undefined
      }
      _check_social: {
        Args: {
          p_event: string
          p_event_id: string
          p_payload: Json
          p_user: string
        }
        Returns: undefined
      }
      _check_streaks: {
        Args: {
          p_event: string
          p_event_id: string
          p_payload: Json
          p_user: string
        }
        Returns: undefined
      }
      _check_topic_depth: {
        Args: {
          p_event: string
          p_event_id: string
          p_payload: Json
          p_user: string
        }
        Returns: undefined
      }
      _merge_candidate: {
        Args: { p_loser: string; p_winner: string }
        Returns: undefined
      }
      _user_question_scope: { Args: { p_user_id: string }; Returns: string }
      admin_delete_roster_row: {
        Args: { _id: string; _source: string }
        Returns: undefined
      }
      auto_merge_obvious_persons: { Args: never; Returns: number }
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
      cancel_job: { Args: { p_id: string }; Returns: undefined }
      check_fl_sync_secret: { Args: { p_token: string }; Returns: boolean }
      check_nj_sync_secret: { Args: { p_token: string }; Returns: boolean }
      claim_anon_poll_responses: {
        Args: { p_anon_session_id: string }
        Returns: number
      }
      claim_jobs: {
        Args: {
          p_batch_size?: number
          p_job_type: string
          p_lock_seconds?: number
          p_worker_id: string
        }
        Returns: {
          attempts: number
          available_at: string
          created_at: string
          created_by: string | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          job_type: string
          last_error: string | null
          lock_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          priority: number
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "job_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_redundant_ai_candidates: { Args: never; Returns: number }
      cleanup_x_oauth_pending: { Args: never; Returns: undefined }
      complete_job: { Args: { p_id: string }; Returns: undefined }
      evaluate_badges: {
        Args: {
          p_event: string
          p_event_id: string
          p_payload: Json
          p_user: string
        }
        Returns: undefined
      }
      fail_job: {
        Args: { p_error: string; p_id: string; p_retry_delay_seconds?: number }
        Returns: undefined
      }
      fl_legislator_finance: {
        Args: { p_district?: string; p_name: string; p_office?: string }
        Returns: Json
      }
      get_admin_user_last_signins: {
        Args: never
        Returns: {
          last_sign_in_at: string
          user_id: string
        }[]
      }
      get_committee_cycles: { Args: never; Returns: string[] }
      get_contribution_totals: {
        Args: { p_candidate_id: string; p_cycle: string }
        Returns: {
          conduit_excluded: number
          earmarked_total: number
          grand_total: number
          individual_gross: number
          individual_total: number
          loan_total: number
          memo_x_total: number
          offset_total: number
          organization_total: number
          other_receipts_total: number
          other_total: number
          pac_total: number
          party_total: number
          pass_through_excluded: number
          transfer_total: number
        }[]
      }
      get_contribution_totals_by_committee: {
        Args: { p_committee_id: string; p_cycle: string }
        Returns: {
          conduit_excluded: number
          earmarked_total: number
          grand_total: number
          individual_gross: number
          individual_total: number
          loan_total: number
          memo_x_total: number
          offset_total: number
          organization_total: number
          other_receipts_total: number
          other_total: number
          pac_total: number
          party_total: number
          pass_through_excluded: number
          transfer_total: number
        }[]
      }
      get_donor_cycles: {
        Args: never
        Returns: {
          cycle: string
        }[]
      }
      get_donors_paginated: {
        Args: {
          p_cycle?: string
          p_min_amount?: number
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_sort_by?: string
          p_sort_order?: string
          p_source?: string
          p_type?: string
        }
        Returns: {
          cycle: string
          display_name: string
          federal_amount: number
          is_consolidated: boolean
          name_variations: string[]
          primary_id: string
          recipient_count: number
          sources: string[]
          state_amount: number
          total_amount: number
          total_count: number
          total_transactions: number
          type: string
          types: string[]
        }[]
      }
      get_hidden_state_codes: {
        Args: never
        Returns: {
          state_code: string
        }[]
      }
      get_poll_tally: {
        Args: { p_poll_id: string }
        Returns: {
          count: number
          question_id: string
          selected_option_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      ie_excluded_committee_ids: { Args: never; Returns: string[] }
      list_committee_pool: {
        Args: {
          p_assigned?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_source?: string
        }
        Returns: {
          admin_overridden: boolean
          ai_confidence: string
          ai_reasoning: string
          committee_type: string
          designation: string
          fec_committee_id: string
          name: string
          primary_cause_id: string
          secondary_cause_ids: string[]
          source: string
          total_count: number
        }[]
      }
      list_ie_spenders: {
        Args: never
        Returns: {
          fec_committee_id: string
          name: string
          total: number
        }[]
      }
      log_user_event: {
        Args: { p_event_type: string; p_payload?: Json }
        Returns: string
      }
      merge_persons: {
        Args: { from_id: string; into_id: string }
        Returns: undefined
      }
      nj_legislator_finance: {
        Args: { p_district?: string; p_name: string; p_office?: string }
        Returns: Json
      }
      normalize_office_key: { Args: { _office: string }; Returns: string }
      normalize_person_name: { Args: { _name: string }; Returns: string }
      rebuild_donors_for_committee: {
        Args: {
          p_candidate_id?: string
          p_committee_id: string
          p_cycle: string
        }
        Returns: number
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
      refresh_committee_pool: { Args: never; Returns: undefined }
      refresh_donor_consolidated_mv: { Args: never; Returns: undefined }
      resolve_committee_alias: { Args: { p_fec_id: string }; Returns: string[] }
      resolve_donor_display_name: {
        Args: { p_donor_name: string; p_donor_type: string }
        Returns: string
      }
      resolve_person: {
        Args: {
          _bioguide_id?: string
          _fec_candidate_id?: string
          _name: string
          _office: string
          _openstates_id?: string
          _state: string
        }
        Returns: string
      }
      retag_vendor_refunds: { Args: never; Returns: number }
      retry_job: { Args: { p_id: string }; Returns: undefined }
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
      search_donors_by_name: {
        Args: { p_limit?: number; p_search: string; p_type?: string }
        Returns: {
          display_name: string
          is_consolidated: boolean
          name_variations: string[]
          total_amount: number
          type: string
        }[]
      }
      search_raw_donors_by_name: {
        Args: { p_limit?: number; p_search: string; p_type?: string }
        Returns: {
          donor_name: string
          total_amount: number
          transaction_count: number
          type: string
        }[]
      }
      submit_poll_response: {
        Args: {
          p_anon_session_id: string
          p_answers: Json
          p_poll_id: string
          p_referrer: string
          p_user_agent: string
        }
        Returns: string
      }
      undo_donor_import: { Args: { p_session_id: string }; Returns: Json }
      undo_ie_import: { Args: { p_session_id: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "politician"
      badge_category:
        | "onboarding"
        | "progress"
        | "topic"
        | "engagement"
        | "social"
        | "candidate"
      confidence_level: "high" | "medium" | "low"
      coverage_tier: "tier_1" | "tier_2" | "tier_3"
      donor_type: "Individual" | "PAC" | "Organization" | "Unknown"
      job_status: "pending" | "running" | "done" | "failed" | "dead"
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
      badge_category: [
        "onboarding",
        "progress",
        "topic",
        "engagement",
        "social",
        "candidate",
      ],
      confidence_level: ["high", "medium", "low"],
      coverage_tier: ["tier_1", "tier_2", "tier_3"],
      donor_type: ["Individual", "PAC", "Organization", "Unknown"],
      job_status: ["pending", "running", "done", "failed", "dead"],
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
