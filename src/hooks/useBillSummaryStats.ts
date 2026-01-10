import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TopicBreakdown {
  name: string;
  count: number;
  color: string;
}

export interface StatusBreakdown {
  introduced: number;
  passedOneChamber: number;
  passedBothChambers: number;
  toPresident: number;
  vetoActions: number;
  becameLaw: number;
}

export interface SummaryStats {
  totalBills: number;
  withSummary: number;
  withCrsSummary: number;
  withAiSummary: number;
  withAiProceduralSummary: number;
  noSummaryAvailable: number;
  needsAiGeneration: number;
  pendingFetch: number;
  coveragePct: number;
  flaggedCount: number;
  mismatchCount: number;
  multiTopicCount: number;
  omnibusCount: number;
  congress118Count: number;
  congress119Count: number;
  topicBreakdown: TopicBreakdown[];
  statusBreakdown: StatusBreakdown;
  billsMissingSponsor: number;
  lastBillSync: string | null;
  lastRefreshed: string | null;
}

export function useBillSummaryStats() {
  return useQuery<SummaryStats>({
    queryKey: ['bill-summary-stats'],
    queryFn: async () => {
      // Fetch bill summary stats
      const { data, error } = await supabase
        .from('bill_summary_stats')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching bill summary stats:', error);
        throw error;
      }

      // Fetch status breakdown directly from bills table
      const { data: statusData } = await supabase
        .from('bills')
        .select('status')
        .not('status', 'is', null);
      
      const statusCounts = {
        introduced: 0,
        passedOneChamber: 0,
        passedBothChambers: 0,
        toPresident: 0,
        vetoActions: 0,
        becameLaw: 0,
      };
      
      if (statusData) {
        for (const bill of statusData) {
          const status = bill.status as string;
          if (status === 'introduced') statusCounts.introduced++;
          else if (status === 'passed_one_chamber') statusCounts.passedOneChamber++;
          else if (status === 'passed_both_chambers') statusCounts.passedBothChambers++;
          else if (status === 'to_president') statusCounts.toPresident++;
          else if (status === 'veto_actions') statusCounts.vetoActions++;
          else if (status === 'became_law') statusCounts.becameLaw++;
        }
      }

      // Fetch bills missing sponsor
      const { count: missingSponsor } = await supabase
        .from('bills')
        .select('*', { count: 'exact', head: true })
        .is('sponsor_bioguide_id', null);

      // Fetch last sync status
      const { data: syncStatus } = await supabase
        .from('bill_sync_status')
        .select('last_sync_completed_at')
        .eq('sync_type', 'nightly')
        .single();

      if (!data) {
        return {
          totalBills: 0, withSummary: 0, withCrsSummary: 0, withAiSummary: 0,
          withAiProceduralSummary: 0, noSummaryAvailable: 0, needsAiGeneration: 0,
          pendingFetch: 0, coveragePct: 0, flaggedCount: 0, mismatchCount: 0,
          multiTopicCount: 0, omnibusCount: 0, congress118Count: 0, congress119Count: 0,
          topicBreakdown: [], statusBreakdown: statusCounts, 
          billsMissingSponsor: missingSponsor || 0,
          lastBillSync: syncStatus?.last_sync_completed_at || null,
          lastRefreshed: null,
        };
      }

      const rawData = data as Record<string, unknown>;
      const withCrsSummary = Number(rawData.with_crs_summary) || 0;
      const withAiSummary = Number(rawData.with_ai_summary) || 0;
      const withAiProceduralSummary = Number(rawData.with_ai_procedural_summary) || 0;
      const withSummary = withCrsSummary + withAiSummary + withAiProceduralSummary;
      const totalBills = Number(rawData.total_bills) || 0;
      const noSummaryAvailable = Number(rawData.no_summary_available) || 0;
      const needsAiGeneration = Number(rawData.needs_ai_generation) || 0;
      const pendingFetch = Number(rawData.pending_fetch) || 0;
      
      const coveragePct = totalBills > 0 ? Math.round((withSummary / totalBills) * 100) : 0;

      // Build topic breakdown array
      const topicBreakdown: TopicBreakdown[] = [
        { name: 'Economy & Jobs', count: Number(rawData.topic_economy) || 0, color: '#22c55e' },
        { name: 'Health & Welfare', count: Number(rawData.topic_health) || 0, color: '#ef4444' },
        { name: 'Environment & Energy', count: Number(rawData.topic_environment) || 0, color: '#10b981' },
        { name: 'Education', count: Number(rawData.topic_education) || 0, color: '#f59e0b' },
        { name: 'Foreign Affairs', count: Number(rawData.topic_defense) || 0, color: '#6366f1' },
        { name: 'Civil Rights & Liberties', count: Number(rawData.topic_civil_rights) || 0, color: '#ec4899' },
        { name: 'Immigration & Society', count: Number(rawData.topic_immigration) || 0, color: '#14b8a6' },
        { name: 'Government & Politics', count: Number(rawData.topic_government) || 0, color: '#8b5cf6' },
        { name: 'Science & Technology', count: Number(rawData.topic_science) || 0, color: '#0ea5e9' },
        { name: 'Native & Tribal Affairs', count: Number(rawData.topic_native) || 0, color: '#d97706' },
        { name: 'Uncategorized', count: Number(rawData.topic_uncategorized) || 0, color: '#6b7280' },
      ].filter(t => t.count > 0).sort((a, b) => b.count - a.count);

      return {
        totalBills,
        withSummary,
        withCrsSummary,
        withAiSummary,
        withAiProceduralSummary,
        noSummaryAvailable,
        needsAiGeneration,
        pendingFetch,
        coveragePct,
        flaggedCount: Number(rawData.flagged_count) || 0,
        mismatchCount: Number(rawData.mismatch_count) || 0,
        multiTopicCount: Number(rawData.multi_topic_count) || 0,
        omnibusCount: Number(rawData.omnibus_count) || 0,
        congress118Count: Number(rawData.congress_118_count) || 0,
        congress119Count: Number(rawData.congress_119_count) || 0,
        topicBreakdown,
        statusBreakdown: statusCounts,
        billsMissingSponsor: missingSponsor || 0,
        lastBillSync: syncStatus?.last_sync_completed_at || null,
        lastRefreshed: rawData.last_refreshed ? String(rawData.last_refreshed) : null,
      };
    },
    staleTime: 60000,
  });
}
