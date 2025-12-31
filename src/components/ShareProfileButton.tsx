import { Share2, Copy, Link, Twitter, Facebook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatScore } from '@/lib/scoreFormat';
import { toast } from 'sonner';

interface TopicComparison {
  topicName: string;
  score: number;
}

interface ShareProfileButtonProps {
  candidateName: string;
  candidateOffice: string;
  candidateParty: string;
  candidateScore: number | null;
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
  userScore,
  matchScore,
  agreements,
  disagreements,
  profileUrl,
}: ShareProfileButtonProps) => {
  
  const generateFullSummary = () => {
    const lines: string[] = [];
    
    lines.push(`My political alignment with ${candidateName} (${candidateParty}) - ${candidateOffice}`);
    lines.push('');
    lines.push(`Match Score: ${matchScore}% aligned`);
    
    if (agreements.length > 0) {
      lines.push('');
      lines.push('Where we agree:');
      agreements.slice(0, 2).forEach(a => {
        lines.push(`• ${a.topicName}`);
      });
    }
    
    if (disagreements.length > 0) {
      lines.push('');
      lines.push('Where we differ:');
      disagreements.slice(0, 2).forEach(d => {
        lines.push(`• ${d.topicName}`);
      });
    }
    
    lines.push('');
    lines.push(`My position: ${formatScore(userScore)} | Their position: ${formatScore(candidateScore)}`);
    lines.push('');
    lines.push(`Discover your alignment at ${profileUrl}`);
    lines.push('#Pulse #VoterMatch');
    
    return lines.join('\n');
  };
  
  const generateTwitterSummary = () => {
    const agreementText = agreements.length > 0 
      ? `Agree on: ${agreements.slice(0, 2).map(a => a.topicName).join(', ')}`
      : '';
    const disagreementText = disagreements.length > 0
      ? `Differ on: ${disagreements.slice(0, 1).map(d => d.topicName).join(', ')}`
      : '';
      
    const parts = [
      `My alignment with ${candidateName}: ${matchScore}% match`,
      agreementText,
      disagreementText,
      `${formatScore(userScore)} vs ${formatScore(candidateScore)}`,
    ].filter(Boolean);
    
    // Keep under 280 chars with URL and hashtags
    let text = parts.join(' | ');
    if (text.length > 200) {
      text = `My alignment with ${candidateName}: ${matchScore}% match | ${formatScore(userScore)} vs ${formatScore(candidateScore)}`;
    }
    
    return text;
  };
  
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Failed to copy link');
    }
  };
  
  const copySummary = async () => {
    try {
      const summary = generateFullSummary();
      await navigator.clipboard.writeText(summary);
      toast.success('Summary copied to clipboard');
    } catch {
      toast.error('Failed to copy summary');
    }
  };
  
  const shareOnTwitter = () => {
    const text = generateTwitterSummary();
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(profileUrl)}&hashtags=Pulse,VoterMatch`;
    window.open(url, '_blank', 'width=600,height=400');
  };
  
  const shareOnFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(profileUrl)}`;
    window.open(url, '_blank', 'width=600,height=400');
  };
  
  const nativeShare = async () => {
    if (!navigator.share) return;
    
    try {
      await navigator.share({
        title: `My alignment with ${candidateName}`,
        text: generateTwitterSummary(),
        url: profileUrl,
      });
    } catch (error) {
      // User cancelled or share failed silently
      if ((error as Error).name !== 'AbortError') {
        toast.error('Failed to share');
      }
    }
  };
  
  const supportsNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={copyLink} className="cursor-pointer">
          <Link className="h-4 w-4 mr-2" />
          Copy Link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copySummary} className="cursor-pointer">
          <Copy className="h-4 w-4 mr-2" />
          Copy Summary
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={shareOnTwitter} className="cursor-pointer">
          <Twitter className="h-4 w-4 mr-2" />
          Share on X
        </DropdownMenuItem>
        <DropdownMenuItem onClick={shareOnFacebook} className="cursor-pointer">
          <Facebook className="h-4 w-4 mr-2" />
          Share on Facebook
        </DropdownMenuItem>
        {supportsNativeShare && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={nativeShare} className="cursor-pointer">
              <Share2 className="h-4 w-4 mr-2" />
              Share...
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
