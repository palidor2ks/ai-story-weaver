import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { usePacCandidateTotals, useFetchPacExpenditures } from '@/hooks/usePacExpenditures';
import { ThumbsUp, ThumbsDown, DollarSign, Users, RefreshCw, Loader2 } from 'lucide-react';

interface PacExpenditureBreakdownProps {
  committeeId: string;
  committeeName?: string;
  cycle?: string;
  showFetchButton?: boolean;
  className?: string;
}

const formatCurrency = (value: number) => {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${Math.round(value / 1_000)}K`;
  }
  return `$${value.toLocaleString()}`;
};

export function PacExpenditureBreakdown({
  committeeId,
  committeeName,
  cycle = '2024',
  showFetchButton = false,
  className,
}: PacExpenditureBreakdownProps) {
  const { data: candidateTotals = [], isLoading } = usePacCandidateTotals(committeeId, cycle);
  const fetchMutation = useFetchPacExpenditures();

  const totalSpent = candidateTotals.reduce((sum, ct) => sum + ct.total_spent, 0);
  const supportTotal = candidateTotals.reduce((sum, ct) => sum + ct.support_total, 0);
  const opposeTotal = candidateTotals.reduce((sum, ct) => sum + ct.oppose_total, 0);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (candidateTotals.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            PAC Expenditures
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            No expenditure data available for this PAC.
          </p>
          {showFetchButton && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchMutation.mutate({ committeeId, cycle })}
              disabled={fetchMutation.isPending}
            >
              {fetchMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Fetch Expenditure Data
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            {committeeName || 'PAC'} Expenditure Breakdown
          </CardTitle>
          {showFetchButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchMutation.mutate({ committeeId, cycle })}
              disabled={fetchMutation.isPending}
            >
              {fetchMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-secondary/50">
            <p className="text-2xl font-bold text-foreground">{formatCurrency(totalSpent)}</p>
            <p className="text-xs text-muted-foreground">Total Spent</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-agree/10 border border-agree/20">
            <p className="text-2xl font-bold text-agree">{formatCurrency(supportTotal)}</p>
            <p className="text-xs text-muted-foreground">Supporting</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-disagree/10 border border-disagree/20">
            <p className="text-2xl font-bold text-disagree">{formatCurrency(opposeTotal)}</p>
            <p className="text-xs text-muted-foreground">Opposing</p>
          </div>
        </div>

        {/* Candidate Breakdown */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Candidate Allocation</h4>
          {candidateTotals.map((ct) => {
            const supportPct = ct.support_ratio * 100;
            const opposePct = ct.oppose_ratio * 100;
            const totalPct = supportPct + opposePct;
            
            return (
              <div key={ct.id} className="p-4 rounded-lg border border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {ct.candidate_id ? (
                      <Link 
                        to={`/candidate/${ct.candidate_id}`}
                        className="font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {ct.candidate_name || 'Unknown'}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">{ct.candidate_name || 'Unknown'}</span>
                    )}
                    {ct.support_total > 0 && (
                      <Badge variant="outline" className="gap-1 text-agree border-agree/30 bg-agree/10">
                        <ThumbsUp className="h-3 w-3" />
                        Support
                      </Badge>
                    )}
                    {ct.oppose_total > 0 && (
                      <Badge variant="outline" className="gap-1 text-disagree border-disagree/30 bg-disagree/10">
                        <ThumbsDown className="h-3 w-3" />
                        Oppose
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm font-semibold">{totalPct.toFixed(1)}%</span>
                </div>
                
                {/* Progress bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
                    {supportPct > 0 && (
                      <div 
                        className="h-full bg-agree" 
                        style={{ width: `${(supportPct / totalPct) * 100}%` }}
                      />
                    )}
                    {opposePct > 0 && (
                      <div 
                        className="h-full bg-disagree" 
                        style={{ width: `${(opposePct / totalPct) * 100}%` }}
                      />
                    )}
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span>
                    {ct.support_total > 0 && `FOR: ${formatCurrency(ct.support_total)}`}
                    {ct.support_total > 0 && ct.oppose_total > 0 && ' • '}
                    {ct.oppose_total > 0 && `AGAINST: ${formatCurrency(ct.oppose_total)}`}
                  </span>
                  <span className="font-medium">{formatCurrency(ct.total_spent)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
