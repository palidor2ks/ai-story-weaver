import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatScore, getScoreLabel } from '@/lib/scoreFormat';

interface Candidate {
  id: string;
  name: string;
  party: 'Democrat' | 'Republican' | 'Independent' | 'Other';
  overall_score: number;
}

interface PoliticalSpectrumProps {
  userScore: number;
  candidates: Candidate[];
  onCandidateClick?: (id: string) => void;
}

export const PoliticalSpectrum = ({ userScore, candidates, onCandidateClick }: PoliticalSpectrumProps) => {
  // Convert score (-10 to +10) to percentage (0 to 100)
  const scoreToPosition = (score: number) => ((score + 10) / 20) * 100;

  // Group candidates by approximate position to avoid overlap
  const groupedCandidates = useMemo(() => {
    const groups: Record<number, Candidate[]> = {};
    candidates.forEach(c => {
      // Round to nearest 2 points for grouping
      const groupKey = Math.round(c.overall_score / 2) * 2;
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(c);
    });
    return groups;
  }, [candidates]);

  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-blue-500 border-blue-600';
      case 'Republican': return 'bg-red-500 border-red-600';
      case 'Independent': return 'bg-purple-500 border-purple-600';
      default: return 'bg-gray-500 border-gray-600';
    }
  };

  const getPartyRingColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'ring-blue-300';
      case 'Republican': return 'ring-red-300';
      case 'Independent': return 'ring-purple-300';
      default: return 'ring-gray-300';
    }
  };

  return (
    <TooltipProvider>
      <div className="relative py-8">
        {/* Background gradient spectrum */}
        <div className="relative h-8 rounded-full overflow-hidden shadow-inner">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/30 via-muted to-red-500/30" />
        </div>

        {/* Candidate markers */}
        <div className="absolute inset-x-4 top-0 h-8" style={{ marginTop: '16px' }}>
          {Object.entries(groupedCandidates).map(([groupScore, groupCandidates]) => {
            const position = scoreToPosition(Number(groupScore));
            const isStacked = groupCandidates.length > 1;
            
            return groupCandidates.map((candidate, idx) => (
              <Tooltip key={candidate.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onCandidateClick?.(candidate.id)}
                    className={cn(
                      "absolute w-4 h-4 rounded-full border-2 transition-all hover:scale-125 hover:z-20 cursor-pointer",
                      getPartyColor(candidate.party),
                      "hover:ring-2",
                      getPartyRingColor(candidate.party)
                    )}
                    style={{
                      left: `${position}%`,
                      transform: `translateX(-50%)`,
                      top: isStacked ? `${-4 + idx * 20}px` : '6px',
                      zIndex: 10 + idx,
                    }}
                    aria-label={`${candidate.name} - ${formatScore(candidate.overall_score)}`}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <div className="font-semibold">{candidate.name}</div>
                  <div className="text-muted-foreground">
                    {candidate.party} • {formatScore(candidate.overall_score)}
                  </div>
                </TooltipContent>
              </Tooltip>
            ));
          })}
        </div>

        {/* User marker - larger and highlighted */}
        <div 
          className="absolute"
          style={{
            left: `calc(${scoreToPosition(userScore)}% + 16px)`,
            transform: 'translateX(-50%)',
            top: '0px',
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative">
                <div className="absolute -inset-2 bg-primary/20 rounded-full animate-pulse" />
                <div className="relative w-6 h-6 rounded-full bg-primary border-4 border-background shadow-lg ring-2 ring-primary/50 flex items-center justify-center">
                  <span className="text-[8px] font-bold text-primary-foreground">YOU</span>
                </div>
                {/* Arrow pointing down */}
                <div className="absolute left-1/2 -translate-x-1/2 top-full">
                  <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-primary" />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <div className="font-semibold">Your Position</div>
              <div className="text-muted-foreground">
                {formatScore(userScore)} • {getScoreLabel(userScore)}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Labels */}
        <div className="flex justify-between mt-4 px-2 text-sm">
          <div className="flex flex-col items-start">
            <span className="font-semibold text-blue-600">Left</span>
            <span className="text-xs text-muted-foreground">Progressive</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="font-semibold text-purple-600">Center</span>
            <span className="text-xs text-muted-foreground">Moderate</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-semibold text-red-600">Right</span>
            <span className="text-xs text-muted-foreground">Conservative</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-6 mt-6 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-muted-foreground">Democrat</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-muted-foreground">Republican</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <span className="text-muted-foreground">Independent</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-primary border-2 border-background flex items-center justify-center text-[6px] text-primary-foreground font-bold">YOU</div>
            <span className="text-muted-foreground">Your Position</span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};
