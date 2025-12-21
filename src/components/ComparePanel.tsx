import { useMemo } from 'react';
import { X, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScoreDisplay } from './ScoreDisplay';
import { ScoreText } from './ScoreText';
import { Candidate } from '@/types';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface ComparePanelProps {
  candidates: Candidate[];
  userScore: number;
  onRemove: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export const ComparePanel = ({ 
  candidates, 
  userScore, 
  onRemove, 
  onClear,
  onClose 
}: ComparePanelProps) => {
  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-blue-500/10 text-blue-700 border-blue-500/30';
      case 'Republican': return 'bg-red-500/10 text-red-700 border-red-500/30';
      case 'Independent': return 'bg-purple-500/10 text-purple-700 border-purple-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getPartyBgColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-blue-600';
      case 'Republican': return 'bg-red-600';
      case 'Independent': return 'bg-purple-600';
      default: return 'bg-primary';
    }
  };

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Sort by score for easier comparison
  const sortedCandidates = useMemo(() => {
    return [...candidates].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));
  }, [candidates]);

  if (candidates.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
      <Card className="mx-4 mb-4 shadow-2xl border-2 border-primary/20 bg-card/95 backdrop-blur-md">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="font-display text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Compare ({candidates.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onClear} className="text-xs">
                Clear All
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {/* Comparison Grid */}
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(candidates.length, 4)}, 1fr)` }}>
            {sortedCandidates.slice(0, 4).map((candidate) => (
              <div 
                key={candidate.id} 
                className="relative p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                {/* Remove button */}
                <button 
                  onClick={() => onRemove(candidate.id)}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs hover:bg-destructive/80 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>

                {/* Candidate info */}
                <div className="flex items-center gap-2 mb-3">
                  <Avatar className="w-10 h-10 ring-1 ring-border">
                    {candidate.imageUrl && (
                      <AvatarImage src={candidate.imageUrl} alt={candidate.name} />
                    )}
                    <AvatarFallback className={cn("text-xs text-white font-bold", getPartyBgColor(candidate.party))}>
                      {getInitials(candidate.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm text-foreground truncate">{candidate.name}</h4>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-muted-foreground truncate">{candidate.office}</span>
                      <Badge variant="outline" className={cn("text-[10px] px-1 py-0", getPartyColor(candidate.party))}>
                        {candidate.party.charAt(0)}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Score */}
                <div className="mb-3 flex justify-center">
                  <ScoreText score={candidate.overallScore} size="lg" showLabel />
                </div>

                {/* View profile link */}
                <Link to={`/candidate/${candidate.id}`}>
                  <Button variant="ghost" size="sm" className="w-full mt-2 text-xs gap-1">
                    View Profile
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>

          {candidates.length > 4 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              +{candidates.length - 4} more selected (showing first 4)
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
