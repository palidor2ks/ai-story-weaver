import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShareCardModal } from '@/components/share/ShareCardModal';
import { BRAND_HOST } from '@/lib/brand';

interface ShareDonorButtonProps {
  donorName: string;
  donorType: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
  donorLocation?: string | null;
  totalGiven: string;
  donationCount: string;
  recipientCount: string;
  cycleCount: number;
  profileUrl: string;
}

export const ShareDonorButton = ({
  donorName,
  donorType,
  donorLocation,
  totalGiven,
  donationCount,
  recipientCount,
  cycleCount,
  profileUrl,
}: ShareDonorButtonProps) => {
  const [open, setOpen] = useState(false);
  const brandHost = BRAND_HOST;

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Share2 className="h-4 w-4" />
        Share
      </Button>
      <ShareCardModal
        open={open}
        onOpenChange={setOpen}
        url={profileUrl}
        data={{
          kind: 'donor-stats',
          brandHost,
          donorName,
          donorType,
          donorLocation,
          totalGiven,
          donationCount,
          recipientCount,
          cycleCount,
        }}
        caption={{
          surface: 'donor_profile',
          kind: 'donor-stats',
          donorName,
          totalGiven,
          donationCount,
          recipientCount,
          cycleCount,
          url: profileUrl,
        }}
      />
    </>
  );
};
