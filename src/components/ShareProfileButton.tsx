import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { ShareCardModal } from '@/components/share/ShareCardModal';
import { useCandidatesIE } from '@/hooks/useIndependentExpenditures';

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
  votingRecordPct?: number | null;
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
  votingRecordPct,
}: ShareProfileButtonProps) => {
  const [open, setOpen] = useState(false);
  const brandHost =
    typeof window !== 'undefined' ? window.location.host.replace(/^www\./, '') : 'polipulseapp.com';

  const { data: ieMap } = useCandidatesIE(candidateId ? [candidateId] : []);
  const ie = candidateId ? ieMap?.get(candidateId) : undefined;

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
          candidateImage: candidateImage ?? null,
          candidateScore,
          userScore,
          matchScore,
          agreements,
          disagreements,
          incumbent,
          coverageTier,
          confidence,
          votingRecordPct: votingRecordPct ?? null,
          ieSupport: ie?.support_amount ?? null,
          ieOppose: ie?.oppose_amount ?? null,
          ieCycle: ie?.cycle ?? null,
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
