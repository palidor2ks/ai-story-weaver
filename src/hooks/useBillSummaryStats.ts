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
  resolvingDifferences: number;
  toPresident: number;
  vetoActions: number;
  becameLaw: number;
}

export interface IngestionStatus {
  congress: number;
  lastOffset: number;
  totalFetched: number;
  totalInserted: number;
  totalFiltered: number;
  totalAvailable: number | null;
  status: 'pending' | 'in_progress' | 'complete' | 'failed';
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
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
  billsNeedingStatusEnrich: number;
  lastBillSync: string | null;
  lastRefreshed: string | null;
  ingestionStatuses: IngestionStatus[];
  // Congress-specific counts
  selectedCongressTotal: number;
}

// Valid bill types for status tracking (excludes simple and concurrent resolutions)
const COUNTABLE_BILL_TYPES = ['HR', 'S', 'HJRES', 'SJRES'];

export function useBillSummaryStats(selectedCongress?: number, includeResolutions = true) {
  return useQuery<SummaryStats>({
    queryKey: ['bill-summary-stats', selectedCongress, includeResolutions],
    queryFn: async () => {
      // Fetch bill summary stats (materialized view - all congresses)
      const { data, error } = await supabase
        .from('bill_summary_stats')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching bill summary stats:', error);
        throw error;
      }

      // Build status query with filters for selected congress and bill types
      let statusQuery = supabase
        .from('bills')
        .select('status, max_action_code, passed_house, passed_senate, bill_type');
      
      // Filter by congress if provided
      if (selectedCongress) {
        statusQuery = statusQuery.eq('congress', selectedCongress);
      }
      
      // Filter to countable bill types if not including resolutions
      if (!includeResolutions) {
        statusQuery = statusQuery.in('bill_type', COUNTABLE_BILL_TYPES);
      }
      
      const { data: statusData } = await statusQuery;
      
      const statusCounts = {
        introduced: 0,
        passedOneChamber: 0,
        passedBothChambers: 0,
        toPresident: 0,
        vetoActions: 0,
        becameLaw: 0,
        resolvingDifferences: 0,
      };
      
      if (statusData) {
        // Terminal statuses that should be trusted from stored status field
        const terminalStatuses = ['became_law', 'veto_actions', 'to_president', 'resolving_differences'];
        
        for (const bill of statusData) {
          const maxCode = bill.max_action_code as number | null;
          const passedHouse = bill.passed_house as boolean | null;
          const passedSenate = bill.passed_senate as boolean | null;
          const storedStatus = bill.status as string | null;
          
          let derivedStatus: string;
          
          // Priority 1: Trust stored terminal statuses (from Excel import or API)
          // These represent final legislative milestones and should not be overridden
          if (storedStatus && terminalStatuses.includes(storedStatus)) {
            derivedStatus = storedStatus;
          }
          // Priority 2: Use action codes for precise status when available
          else if (maxCode) {
            if (maxCode >= 36000) {
              derivedStatus = 'became_law';
            } else if (maxCode >= 30000 && maxCode < 36000) {
              derivedStatus = 'veto_actions';
            } else if (maxCode >= 28000 && maxCode < 30000) {
              derivedStatus = 'to_president';
            } else if (maxCode >= 19000 && maxCode < 25000) {
              derivedStatus = 'resolving_differences';
            } else if (passedHouse && passedSenate) {
              derivedStatus = 'passed_both_chambers';
            } else if (passedHouse || passedSenate) {
              derivedStatus = 'passed_one_chamber';
            } else {
              derivedStatus = 'introduced';
            }
          }
          // Priority 3: Use passage flags for non-terminal status
          else if (passedHouse && passedSenate) {
            derivedStatus = 'passed_both_chambers';
          } else if (passedHouse || passedSenate) {
            derivedStatus = 'passed_one_chamber';
          }
          // Priority 4: Fall back to stored status
          else {
            derivedStatus = storedStatus || 'introduced';
          }
          
          // Count by derived status
          if (derivedStatus === 'became_law') statusCounts.becameLaw++;
          else if (derivedStatus === 'veto_actions') statusCounts.vetoActions++;
          else if (derivedStatus === 'to_president') statusCounts.toPresident++;
          else if (derivedStatus === 'resolving_differences') statusCounts.resolvingDifferences++;
          else if (derivedStatus === 'passed_both_chambers') statusCounts.passedBothChambers++;
          else if (derivedStatus === 'passed_one_chamber') statusCounts.passedOneChamber++;
          else statusCounts.introduced++;
        }
      }

      // Count total for selected congress (filtered by bill type)
      const selectedCongressTotal = statusData?.length || 0;

      // Fetch bills missing sponsor (for selected congress)
      let missingSponsorQuery = supabase
        .from('bills')
        .select('*', { count: 'exact', head: true })
        .is('sponsor_bioguide_id', null);
      
      if (selectedCongress) {
        missingSponsorQuery = missingSponsorQuery.eq('congress', selectedCongress);
      }
      
      const { count: missingSponsor } = await missingSponsorQuery;

      // Fetch bills needing status enrichment (for selected congress)
      let needingEnrichQuery = supabase
        .from('bills')
        .select('*', { count: 'exact', head: true })
        .is('max_action_code', null);
      
      if (selectedCongress) {
        needingEnrichQuery = needingEnrichQuery.eq('congress', selectedCongress);
      }
      
      const { count: needingStatusEnrich } = await needingEnrichQuery;

      // Fetch last sync status
      const { data: syncStatus } = await supabase
        .from('bill_sync_status')
        .select('last_sync_completed_at')
        .eq('sync_type', 'nightly')
        .single();

      // Fetch ingestion status for all congresses
      const { data: ingestionData } = await supabase
        .from('bill_ingestion_status')
        .select('*')
        .order('congress', { ascending: false });

      const ingestionStatuses: IngestionStatus[] = (ingestionData || []).map((row: Record<string, unknown>) => ({
        congress: row.congress as number,
        lastOffset: row.last_offset as number,
        totalFetched: row.total_fetched as number,
        totalInserted: row.total_inserted as number,
        totalFiltered: row.total_filtered as number,
        totalAvailable: row.total_available as number | null,
        status: row.status as 'pending' | 'in_progress' | 'complete' | 'failed',
        startedAt: row.started_at as string | null,
        completedAt: row.completed_at as string | null,
        errorMessage: row.error_message as string | null,
      }));

      if (!data) {
        return {
          totalBills: 0, withSummary: 0, withCrsSummary: 0, withAiSummary: 0,
          withAiProceduralSummary: 0, noSummaryAvailable: 0, needsAiGeneration: 0,
          pendingFetch: 0, coveragePct: 0, flaggedCount: 0, mismatchCount: 0,
          multiTopicCount: 0, omnibusCount: 0, congress118Count: 0, congress119Count: 0,
          topicBreakdown: [], statusBreakdown: statusCounts, 
          billsMissingSponsor: missingSponsor || 0,
          billsNeedingStatusEnrich: needingStatusEnrich || 0,
          lastBillSync: syncStatus?.last_sync_completed_at || null,
          lastRefreshed: null,
          ingestionStatuses,
          selectedCongressTotal,
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
        { name: 'Social Programs', count: Number(rawData.topic_social) || 0, color: '#a855f7' },
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
        billsNeedingStatusEnrich: needingStatusEnrich || 0,
        lastBillSync: syncStatus?.last_sync_completed_at || null,
        lastRefreshed: rawData.last_refreshed ? String(rawData.last_refreshed) : null,
        ingestionStatuses,
        selectedCongressTotal,
      };
    },
    staleTime: 60000,
  });
}
