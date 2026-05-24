import { useEffect, useMemo, useState } from 'react';

const imageUrlToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
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

interface TopicComparison {
  topicName: string;
  score: number;
}

interface ShareProfileButtonProps {
  candidateId?: string;
  candidateName: string;
  candidateOffice: string;
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
}

export const ShareProfileButton = ({
  candidateId,
  candidateName,
  candidateOffice,
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
}: ShareProfileButtonProps) => {
  const [open, setOpen] = useState(false);
  const [resolvedImage, setResolvedImage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!candidateImage) {
      setResolvedImage(null);
      return;
    }
    if (candidateImage.startsWith('data:')) {
      setResolvedImage(candidateImage);
      return;
    }
    imageUrlToBase64(candidateImage)
      .then((b64) => {
        if (!cancelled) setResolvedImage(b64);
      })
      .catch(() => {
        if (!cancelled) setResolvedImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [candidateImage]);

  const brandHost =
    typeof window !== 'undefined' ? window.location.host.replace(/^www\./, '') : 'polipulseapp.com';

  // Pull latest-cycle IE rows for top spenders
  const { data: ieData } = useCandidateIE(candidateId ?? null);
  const { topSpenders, ieCycle } = useMemo(() => {
    const cycles = ieData?.availableCycles ?? [];
    const latest = cycles[0] ?? null;
    const rows = (ieData?.rows ?? []).filter((r) => (latest ? String(r.cycle) === latest : true));
    const map = new Map<string, { name: string; support: number; oppose: number }>();
    rows.forEach((r) => {
      const key = r.spending_committee_fec_id;
      const cur = map.get(key) ?? {
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
          topSpenders,
          topDonors,
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
