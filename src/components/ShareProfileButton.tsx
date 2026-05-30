import { useEffect, useMemo, useState } from 'react';

import { proxiedImageUrl } from '@/lib/imageProxy';

const imageUrlToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(proxiedImageUrl(url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  if (blob.type.includes('text/html')) throw new Error('Not an image');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
import { Share2 } from 'lucide-react';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { ShareCardModal } from '@/components/share/ShareCardModal';
import { useCandidateIE } from '@/hooks/useIndependentExpenditures';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface TopicComparison {
  topicName: string;
  score: number;
}

interface ShareProfileButtonProps {
  candidateId?: string;
  candidateName: string;
  candidateOffice: string;
  candidateState?: string | null;
  candidateDistrict?: string | null;
  candidateParty: string;
  candidateScore: number | null;
  candidateImage?: string | null;
  userScore: number | null;
  matchScore: number;
  agreements: TopicComparison[];
  disagreements: TopicComparison[];
  profileUrl: string;
  incumbent?: boolean;
  coverageTier?: string;
  confidence?: string;
  topDonors?: { name: string; amount: number }[];
  fundingBreakdown?: { label: string; pct: number; color: string }[];
  fundingCycle?: string;
}

export const ShareProfileButton = ({
  candidateId,
  candidateName,
  candidateOffice,
  candidateState,
  candidateDistrict,
  candidateParty,
  candidateScore,
  candidateImage,
  userScore,
  matchScore,
  agreements,
  disagreements,
  profileUrl,
  incumbent,
  coverageTier,
  confidence,
  topDonors,
  fundingBreakdown,
  fundingCycle,
}: ShareProfileButtonProps) => {
  const [open, setOpen] = useState(false);

  // Try the provided URL first; fall back to Bioguide for federal IDs (e.g. M001184).
  const candidateImages = useMemo(() => {
    const urls: string[] = [];
    if (candidateImage) urls.push(candidateImage);
    if (candidateId && /^[A-Z]\d{6}$/.test(candidateId)) {
      const bg = `https://bioguide.congress.gov/bioguide/photo/${candidateId[0]}/${candidateId}.jpg`;
      if (!urls.includes(bg)) urls.push(bg);
    }
    return urls;
  }, [candidateImage, candidateId]);

  // Show the original URL immediately so the preview is never blank while
  // base64 conversion (used to make PNG export CORS-safe) is pending.
  const [resolvedImage, setResolvedImage] = useState<string | null>(
    candidateImages[0] ?? null,
  );

  useEffect(() => {
    setResolvedImage(candidateImages[0] ?? null);
    if (candidateImages.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const url of candidateImages) {
        if (url.startsWith('data:')) {
          if (!cancelled) setResolvedImage(url);
          return;
        }
        try {
          const b64 = await imageUrlToBase64(url);
          if (!cancelled) setResolvedImage(b64);
          return;
        } catch {
          // try next fallback URL
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidateImages]);

  const brandHost =
    typeof window !== 'undefined' ? window.location.host.replace(/^www\./, '') : 'polipulseapp.com';

  // Pull latest-cycle IE rows for top spenders
  const { data: ieData } = useCandidateIE(candidateId ?? null);
  const { topSpenders, ieCycle } = useMemo(() => {
    const cycles = ieData?.availableCycles ?? [];
    const latest = cycles[0] ?? null;
    const rows = (ieData?.rows ?? []).filter((r) => (latest ? String(r.cycle) === latest : true));
    const map = new Map<string, { fecId: string; name: string; support: number; oppose: number }>();
    rows.forEach((r) => {
      const key = r.spending_committee_fec_id;
      const cur = map.get(key) ?? {
        fecId: key,
        name: r.spending_committee_name ?? key,
        support: 0,
        oppose: 0,
      };
      const amt = Number(r.amount ?? 0);
      if (r.support_oppose_indicator === 'S') cur.support += amt;
      else cur.oppose += amt;
      map.set(key, cur);
    });
    const ts = Array.from(map.values())
      .sort((a, b) => b.support + b.oppose - (a.support + a.oppose))
      .slice(0, 2);
    return { topSpenders: ts, ieCycle: latest };
  }, [ieData]);

  const topSpenderIds = useMemo(
    () => topSpenders.map((s) => s.fecId).filter(Boolean).sort(),
    [topSpenders],
  );
  const { data: spenderCauseMap } = useQuery({
    queryKey: ['share-profile-spender-causes', topSpenderIds],
    enabled: topSpenderIds.length > 0,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('committee_topics')
        .select('fec_committee_id, primary_cause:primary_cause_id(label)')
        .in('fec_committee_id', topSpenderIds);
      const map = new Map<string, string>();
      (data ?? []).forEach((r: any) => {
        if (r.fec_committee_id && r.primary_cause?.label) {
          map.set(r.fec_committee_id, r.primary_cause.label);
        }
      });
      return map;
    },
  });

  const topSpendersWithCauses = useMemo(
    () => topSpenders.map(({ fecId, ...spender }) => ({
      ...spender,
      primaryCause: spenderCauseMap?.get(fecId) ?? null,
    })),
    [topSpenders, spenderCauseMap],
  );

  return (
    <>
      <IconActionButton
        label="Share"
        icon={<Share2 className="h-4 w-4" />}
        onClick={() => setOpen(true)}
      />
      <ShareCardModal
        open={open}
        onOpenChange={setOpen}
        url={profileUrl}
        data={{
          kind: 'candidate-alignment',
          brandHost,
          candidateName,
          candidateOffice,
          candidateState,
          candidateDistrict,
          candidateParty,
          candidateImage: resolvedImage ?? null,
          candidateScore,
          userScore,
          matchScore,
          agreements,
          disagreements,
          incumbent,
          coverageTier,
          confidence,
          ieCycle,
          topSpenders: topSpendersWithCauses,
          topDonors,
          fundingBreakdown,
          fundingCycle,
        }}
        caption={{
          surface: 'candidate_profile',
          kind: 'candidate-alignment',
          candidateName,
          candidateOffice,
          candidateParty,
          candidateScore,
          userScore,
          matchScore,
          agreements,
          disagreements,
          url: profileUrl,
        }}
      />
    </>
  );
};
