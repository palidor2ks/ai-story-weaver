import { Link } from 'react-router-dom';
import { Candidate } from '@/types';
import { MatchBadge } from './MatchBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { calculateMatchScore } from '@/data/mockData';
import { useUser } from '@/context/UserContext';
import { User, MapPin, Calendar } from 'lucide-react';
import { ScoreDisplay } from './ScoreDisplay';
import { CoverageTierBadge, ConfidenceBadge, IncumbentBadge } from './CoverageTierBadge';
import { TransitionBadge, TransitionStatus } from './TransitionBadge';
import { CoverageTier, ConfidenceLevel } from '@/lib/scoreFormat';

interface CandidateCardProps {
  candidate: Candidate;
  index?: number;
}

export const CandidateCard = ({ candidate, index = 0 }: CandidateCardProps) => {
  const { user } = useUser();
  const userScore = user?.overallScore ?? 0;
  const matchScore = calculateMatchScore(userScore, candidate.overallScore);

  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-blue-500/10 text-blue-700 border-blue-500/30';
      case 'Republican': return 'bg-red-500/10 text-red-700 border-red-500/30';
      case 'Independent': return 'bg-purple-500/10 text-purple-700 border-purple-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Find top agreement and disagreement
  const userTopics = user?.topicScores || [];
  const agreements = candidate.topicScores
    .filter(cs => {
      const userTopic = userTopics.find(ut => ut.topicId === cs.topicId);
      return userTopic && Math.sign(userTopic.score) === Math.sign(cs.score);
    })
    .slice(0, 1);
  
  const disagreements = candidate.topicScores
    .filter(cs => {
      const userTopic = userTopics.find(ut => ut.topicId === cs.topicId);
      return userTopic && Math.sign(userTopic.score) !== Math.sign(cs.score) && cs.score !== 0;
    })
    .slice(0, 1);

  // Get coverage tier, confidence, and transition status from candidate (with defaults)
  const coverageTier: CoverageTier = (candidate as any).coverageTier || 'tier_3';
  const confidence: ConfidenceLevel = (candidate as any).confidence || 'medium';
  const isIncumbent: boolean = (candidate as any).isIncumbent ?? true;
  const transitionStatus: TransitionStatus | undefined = (candidate as any).transitionStatus;
  const newOffice: string | undefined = (candidate as any).newOffice;

  return (
    <Link to={`/candidate/${candidate.id}`}>
      <Card 
        className={cn(
          "group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer",
          "animate-slide-up bg-card border-border"
        )}
        style={{ animationDelay: `${index * 100}ms` }}
      >
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            {/* Avatar with image */}
            <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0">
              {candidate.imageUrl ? (
                <img 
                  src={candidate.imageUrl}
                  alt={candidate.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    const fallback = target.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
              ) : null}
              <div 
                className="w-full h-full bg-gradient-hero flex items-center justify-center"
                style={{ display: candidate.imageUrl ? 'none' : 'flex' }}
              >
                <User className="w-8 h-8 text-primary-foreground" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                    {candidate.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <span>{candidate.office}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {candidate.state}
                    </span>
                  </div>
                </div>
                <MatchBadge matchScore={matchScore} size="sm" />
              </div>

              {/* Score display */}
              <div className="mt-2">
                <ScoreDisplay score={candidate.overallScore} size="sm" />
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-3">
                <Badge variant="outline" className={cn("border", getPartyColor(candidate.party))}>
                  {candidate.party}
                </Badge>
                {transitionStatus && transitionStatus !== 'current' ? (
                  <TransitionBadge status={transitionStatus} newOffice={newOffice} />
                ) : (
                  <IncumbentBadge isIncumbent={isIncumbent} />
                )}
                
                {agreements.length > 0 && (
                  <Badge variant="outline" className="bg-agree/10 text-agree border-agree/30">
                    ✓ {agreements[0].topicName}
                  </Badge>
                )}
                
                {disagreements.length > 0 && (
                  <Badge variant="outline" className="bg-disagree/10 text-disagree border-disagree/30">
                    ✗ {disagreements[0].topicName}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-2">
                <CoverageTierBadge tier={coverageTier} showTooltip={false} />
                <ConfidenceBadge confidence={confidence} />
              </div>

              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span>Updated {candidate.lastUpdated.toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};
