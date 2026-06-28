import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FlaggedBill {
  id: string;
  name: string;
  topic: string;
  additional_topics: string[] | null;
  topic_flag: string;
  ai_detected_topics: string[] | null;
  omnibus_type: string | null;
  summary: string | null;
  latest_action_date: string | null;
  reviewed_at: string | null;
}

// Flagged, not-yet-reviewed bills from the bills table (already deduplicated).
export function useFlaggedBills(filterType: string) {
  return useQuery({
    queryKey: ['flagged-bills', filterType],
    queryFn: async () => {
      let query = supabase
        .from('bills')
        .select('id, name, topic, additional_topics, topic_flag, ai_detected_topics, omnibus_type, summary, latest_action_date, reviewed_at')
        .not('topic_flag', 'is', null)
        .is('reviewed_at', null)
        .order('latest_action_date', { ascending: false })
        .limit(200);

      if (filterType !== 'all') {
        query = query.eq('topic_flag', filterType);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []) as FlaggedBill[];
    },
  });
}

export function useTopicReviewStats() {
  return useQuery({
    queryKey: ['topic-review-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bills')
        .select('topic_flag')
        .not('topic_flag', 'is', null)
        .is('reviewed_at', null);

      if (error) throw error;

      const counts = {
        total: data?.length || 0,
        multi_topic: data?.filter(d => d.topic_flag === 'multi_topic_detected').length || 0,
        mismatch: data?.filter(d => d.topic_flag === 'possible_mismatch').length || 0,
        omnibus: data?.filter(d => d.topic_flag === 'omnibus_detected').length || 0,
        omnibus_major: data?.filter(d => d.topic_flag === 'omnibus_major').length || 0,
      };
      return counts;
    },
  });
}

// Counts of bills needing / eligible for an AI topic scan.
export function useTopicScanStats() {
  return useQuery({
    queryKey: ['topic-scan-stats'],
    queryFn: async () => {
      // Bills that need initial scanning (have summary but no ai_detected_topics)
      const { count: needsScan } = await supabase
        .from('bills')
        .select('id', { count: 'exact', head: true })
        .not('summary', 'is', null)
        .neq('summary', '')
        .neq('summary', '[NO_SUMMARY]')
        .is('reviewed_at', null)
        .or('ai_detected_topics.is.null,ai_detected_topics.eq.{}');

      // Bills that can be force-rescanned (already scanned but not reviewed)
      const { count: canRescan } = await supabase
        .from('bills')
        .select('id', { count: 'exact', head: true })
        .not('summary', 'is', null)
        .neq('summary', '')
        .neq('summary', '[NO_SUMMARY]')
        .is('reviewed_at', null)
        .not('ai_detected_topics', 'is', null)
        .filter('ai_detected_topics', 'neq', '{}');

      // Flagged bills count (for targeted rescan)
      const { count: flaggedCount } = await supabase
        .from('bills')
        .select('id', { count: 'exact', head: true })
        .not('topic_flag', 'is', null)
        .is('reviewed_at', null);

      return { needsScan: needsScan || 0, canRescan: canRescan || 0, flaggedCount: flaggedCount || 0 };
    },
  });
}

// Direct update of a bills row (used by both the manual review save and quick-approve).
export async function updateBillRecord(billId: string, updates: Record<string, unknown>) {
  const { error } = await supabase
    .from('bills')
    .update(updates)
    .eq('id', billId);
  if (error) throw error;
}

// Invoke the scan-bill-topics edge function; throws on error, returns its data.
export async function scanBillTopics(body: Record<string, unknown>) {
  const response = await supabase.functions.invoke('scan-bill-topics', { body });
  if (response.error) throw response.error;
  return response.data;
}
