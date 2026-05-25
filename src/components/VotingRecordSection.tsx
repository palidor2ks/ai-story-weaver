import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown, ThumbsUp, ThumbsDown, HelpCircle, ExternalLink } from 'lucide-react';

interface Vote {
  id: string;
  bill_id: string;
  bill_name: string;
  date: string;
  position: string;
  topic: string;
  description: string | null;
}

interface TopicScore {
  topic_id: string;
  score: number;
  topics?: {
    name: string;
    icon: string;
  };
}

interface VotingRecordSectionProps {
  votes: Vote[];
  userTopicScores: TopicScore[];
  representativeParty: string;
}

// Map display topic names to the 6 consolidated federal topic IDs
const topicNameToId: Record<string, string> = {
  'Economy & Work': 'economy-work',
  'Economy': 'economy-work',
  'Technology': 'economy-work',
  'Health, Education & Social Safety Net': 'health-safety-net',
  'Healthcare': 'health-safety-net',
  'Education': 'health-safety-net',
  'Social Programs': 'health-safety-net',
  'Environment & Energy': 'environment-energy',
  'Environment': 'environment-energy',
  'National Security & Borders': 'national-security-borders',
  'Defense': 'national-security-borders',
  'Immigration': 'national-security-borders',
  'Foreign Affairs': 'national-security-borders',
  'Foreign Policy': 'national-security-borders',
  'Rights & Justice': 'rights-justice',
  'Civil Rights': 'rights-justice',
  'Judicial': 'rights-justice',
  'Criminal Justice': 'rights-justice',
  'Gun Policy': 'rights-justice',
  'Government & Democracy': 'government-democracy',
  'Government Reform': 'government-democracy',
  'Electoral Reform': 'government-democracy',
};

export const VotingRecordSection = ({ 
  votes, 
  userTopicScores, 
  representativeParty 
}: VotingRecordSectionProps) => {
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [expandedVotes, setExpandedVotes] = useState<Set<string>>(new Set());

  // Group votes by topic
  const votesByTopic = useMemo(() => {
    const grouped: Record<string, Vote[]> = {};
    votes.forEach(vote => {
      const topic = vote.topic || 'Other';
      if (!grouped[topic]) grouped[topic] = [];
      grouped[topic].push(vote);
    });
    // Sort topics by vote count descending
    return Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);
  }, [votes]);

  // Create a map of topic_id -> user score for quick lookup
  const userScoreMap = useMemo(() => {
    const map: Record<string, number> = {};
    userTopicScores.forEach(ts => {
      map[ts.topic_id] = ts.score;
    });
    return map;
  }, [userTopicScores]);

  // Determine user's likely support for a bill
  const getUserSupport = (vote: Vote): 'support' | 'oppose' | 'unknown' => {
    const topicId = topicNameToId[vote.topic];
    if (!topicId) return 'unknown';
    
    const userScore = userScoreMap[topicId];
    if (userScore === undefined || userScore === null) return 'unknown';
    
    // Determine bill's likely political leaning based on sponsor's party
    // Democrat sponsor → likely progressive (negative score alignment)
    // Republican sponsor → likely conservative (positive score alignment)
    const isProgressiveBill = representativeParty === 'Democrat';
    
    // If user leans left (negative) and bill is progressive, they'd support
    // If user leans right (positive) and bill is conservative, they'd support
    if (isProgressiveBill) {
      return userScore < 0 ? 'support' : userScore > 0 ? 'oppose' : 'unknown';
    } else {
      return userScore > 0 ? 'support' : userScore < 0 ? 'oppose' : 'unknown';
    }
  };

  // Calculate alignment stats
  const alignmentStats = useMemo(() => {
    let supportCount = 0;
    let opposeCount = 0;
    let unknownCount = 0;
    
    votes.forEach(vote => {
      const support = getUserSupport(vote);
      if (support === 'support') supportCount++;
      else if (support === 'oppose') opposeCount++;
      else unknownCount++;
    });
    
    const knownVotes = supportCount + opposeCount;
    const alignmentPercent = knownVotes > 0 
      ? Math.round((supportCount / knownVotes) * 100) 
      : null;
    
    return {
      supportCount,
      opposeCount,
      unknownCount,
      knownVotes,
      alignmentPercent
    };
  }, [votes, userScoreMap, representativeParty]);

  const toggleTopic = (topic: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topic)) {
        next.delete(topic);
      } else {
        next.add(topic);
      }
      return next;
    });
  };

  const toggleVote = (voteId: string) => {
    setExpandedVotes(prev => {
      const next = new Set(prev);
      if (next.has(voteId)) {
        next.delete(voteId);
      } else {
        next.add(voteId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedTopics(new Set(votesByTopic.map(([topic]) => topic)));
  };

  const collapseAll = () => {
    setExpandedTopics(new Set());
    setExpandedVotes(new Set());
  };

  const getCongressGovUrl = (billId: string) => {
    // Parse bill ID like "H.R.6924" or "S.1234" 
    const match = billId.match(/^(H\.R\.|S\.|H\.Res\.|S\.Res\.|H\.J\.Res\.|S\.J\.Res\.|H\.Con\.Res\.|S\.Con\.Res\.)(\d+)$/i);
    if (match) {
      const type = match[1].toLowerCase().replace(/\./g, '');
      const number = match[2];
      return `https://www.congress.gov/bill/118th-congress/${type === 'hr' ? 'house-bill' : type === 's' ? 'senate-bill' : type}/${number}`;
    }
    return null;
  };

  if (votes.length === 0) {
    return (
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="font-display">Voting Record</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Voting record not available for this candidate.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-elevated">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-display">Voting Record</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll}>
              Collapse All
            </Button>
          </div>
        </div>
        
        {/* Alignment Summary */}
        {alignmentStats.alignmentPercent !== null && (
          <div className={cn(
            "mt-3 p-3 rounded-lg border",
            alignmentStats.alignmentPercent >= 70 
              ? "bg-agree/10 border-agree/30" 
              : alignmentStats.alignmentPercent >= 40 
                ? "bg-amber-500/10 border-amber-500/30" 
                : "bg-disagree/10 border-disagree/30"
          )}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  You align with{' '}
                  <span className={cn(
                    "font-bold",
                    alignmentStats.alignmentPercent >= 70 
                      ? "text-agree" 
                      : alignmentStats.alignmentPercent >= 40 
                        ? "text-amber-600" 
                        : "text-disagree"
                  )}>
                    {alignmentStats.alignmentPercent}%
                  </span>
                  {' '}of their legislative activity
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Based on {alignmentStats.knownVotes} bills where your position is known
                  {alignmentStats.unknownCount > 0 && (
                    <span> • {alignmentStats.unknownCount} bills in topics you haven't answered</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-agree">
                  <ThumbsUp className="w-3.5 h-3.5" />
                  {alignmentStats.supportCount}
                </span>
                <span className="flex items-center gap-1 text-disagree">
                  <ThumbsDown className="w-3.5 h-3.5" />
                  {alignmentStats.opposeCount}
                </span>
              </div>
            </div>
          </div>
        )}
        
        {alignmentStats.alignmentPercent === null && userTopicScores.length === 0 && (
          <div className="mt-3 p-3 rounded-lg bg-secondary/50 border border-border">
            <p className="text-sm text-muted-foreground">
              <HelpCircle className="w-4 h-4 inline mr-1" />
              Take the quiz to see how you align with this representative's voting record
            </p>
          </div>
        )}
        
        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3">
          <span className="flex items-center gap-1">
            <ThumbsUp className="w-3 h-3 text-agree" /> You'd likely support
          </span>
          <span className="flex items-center gap-1">
            <ThumbsDown className="w-3 h-3 text-disagree" /> You'd likely oppose
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {votesByTopic.map(([topic, topicVotes]) => {
          const isExpanded = expandedTopics.has(topic);
          
          return (
            <Collapsible key={topic} open={isExpanded} onOpenChange={() => toggleTopic(topic)}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="font-medium text-foreground">{topic}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {topicVotes.length} {topicVotes.length === 1 ? 'vote' : 'votes'}
                  </Badge>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-4 mt-2 space-y-1 border-l-2 border-border pl-4">
                  {topicVotes.map(vote => {
                    const support = getUserSupport(vote);
                    const isVoteExpanded = expandedVotes.has(vote.id);
                    const congressUrl = getCongressGovUrl(vote.bill_id);
                    
                    return (
                      <div key={vote.id} className="rounded-md border border-border/50 overflow-hidden">
                        <button
                          onClick={() => toggleVote(vote.id)}
                          className="w-full p-2 flex items-center gap-2 text-left hover:bg-accent/30 transition-colors"
                        >
                          <span className="text-xs font-mono text-muted-foreground w-20 flex-shrink-0">
                            {vote.bill_id}
                          </span>
                          <span className="text-sm flex-1 truncate text-foreground">
                            {vote.bill_name.length > 60 
                              ? vote.bill_name.slice(0, 60) + '...' 
                              : vote.bill_name}
                          </span>
                          
                          {/* User support indicator */}
                          {support === 'support' && (
                            <span className="flex items-center gap-1 text-xs text-agree flex-shrink-0">
                              <ThumbsUp className="w-3 h-3" />
                            </span>
                          )}
                          {support === 'oppose' && (
                            <span className="flex items-center gap-1 text-xs text-disagree flex-shrink-0">
                              <ThumbsDown className="w-3 h-3" />
                            </span>
                          )}
                          {support === 'unknown' && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                              <HelpCircle className="w-3 h-3" />
                            </span>
                          )}
                          
                          {/* Position badge */}
                          <Badge 
                            variant="secondary"
                            className={cn(
                              "text-xs flex-shrink-0",
                              (vote.position === 'Yea' || vote.position === 'Sponsored') && 
                                "bg-agree/20 text-agree border-agree/30",
                              vote.position === 'Nay' && 
                                "bg-disagree/20 text-disagree border-disagree/30",
                              vote.position === 'Cosponsored' && 
                                "bg-primary/20 text-primary border-primary/30"
                            )}
                          >
                            {vote.position}
                          </Badge>
                          
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {new Date(vote.date).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </span>
                        </button>
                        
                        {isVoteExpanded && (
                          <div className="px-3 pb-3 pt-1 bg-accent/20 border-t border-border/50">
                            <p className="text-sm font-medium text-foreground mb-1">
                              {vote.bill_name}
                            </p>
                            {vote.description && (
                              <p className="text-xs text-muted-foreground mb-2">
                                {vote.description}
                              </p>
                            )}
                            {congressUrl && (
                              <a 
                                href={congressUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View on Congress.gov
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
};
