import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShareCardModal } from '@/components/share/ShareCardModal';
import { summarizeForSocial } from '@/lib/shareCaptions';
import { BRAND_HOST } from '@/lib/brand';

const COVERAGE_LABELS: Record<string, string> = {
  none: 'No filings',
  sparse: 'Sparse filings',
  moderate: 'Moderate filings',
  rich: 'Rich filings',
};

interface ShareAIAnalysisButtonProps {
  /** Subject of the analysis (donor / candidate / committee / bill name). */
  subjectName: string;
  /** Short label for the kind of analysis, e.g. "Donor Analysis". */
  subtitle: string;
  /** Lower-cased subject kind used in captions, e.g. "donor", "candidate". */
  subjectKind?: string;
  summary: string;
  confidence?: number | null;
  dataCoverage?: 'none' | 'sparse' | 'moderate' | 'rich' | null;
  causes?: string[];
  partySupport?: { party: string; share: number }[];
  /** Absolute URL to share. Defaults to the current page. */
  profileUrl?: string;
  size?: 'sm' | 'default';
  className?: string;
}

/**
 * Share button for AI-generated analyses (donor, candidate, committee, bill).
 * Opens the shared ShareCardModal with a dedicated "Analysis Card" template and
 * seeds the caption with a social-friendly snippet of the AI summary.
 */
export const ShareAIAnalysisButton = ({
  subjectName,
  subtitle,
  subjectKind,
  summary,
  confidence,
  dataCoverage,
  causes,
  partySupport,
  profileUrl,
  size = 'sm',
  className,
}: ShareAIAnalysisButtonProps) => {
  const [open, setOpen] = useState(false);
  const url =
    profileUrl ?? (typeof window !== 'undefined' ? window.location.href : 'https://www.polipulseapp.com');
  const coverageLabel = dataCoverage ? COVERAGE_LABELS[dataCoverage] ?? null : null;
  const captionOverride = summarizeForSocial(summary, 240);

  return (
    <>
      <Button
        size={size === 'sm' ? 'sm' : 'default'}
        variant="outline"
        className={className ?? 'gap-1.5'}
        onClick={() => setOpen(true)}
      >
        <Share2 className="h-3.5 w-3.5" />
        Share
      </Button>
      <ShareCardModal
        open={open}
        onOpenChange={setOpen}
        url={url}
        data={{
          kind: 'ai-analysis',
          brandHost: BRAND_HOST,
          analysisTitle: subjectName,
          analysisSubtitle: subtitle,
          analysisSummary: summary,
          analysisConfidence: confidence ?? null,
          analysisDataCoverageLabel: coverageLabel,
          analysisCauses: causes,
          analysisPartySupport: partySupport,
        }}
        caption={{
          surface: 'ai_analysis',
          kind: 'ai-analysis',
          subjectName,
          subjectKind,
          url,
        }}
        captionBodyOverride={captionOverride}
      />
    </>
  );
};
