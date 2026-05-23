import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { ShareCardModal } from '@/components/share/ShareCardModal';

interface TopicComparison {
  topicName: string;
  score: number;
}

interface ShareProfileButtonProps {
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
}

export const ShareProfileButton = ({
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
}: ShareProfileButtonProps) => {
  const [open, setOpen] = useState(false);
  const brandHost =
    typeof window !== 'undefined' ? window.location.host.replace(/^www\./, '') : 'polipulseapp.com';

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
