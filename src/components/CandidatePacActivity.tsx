import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCandidatePacActivity } from '@/hooks/usePacExpenditures';
import { useAttributedDonors } from '@/hooks/useAttributedDonors';
import { ThumbsUp, ThumbsDown, Users, Loader2, ChevronDown, ChevronUp, User } from 'lucide-react';

interface CandidatePacActivityProps {
  candidateId: string;
  candidateName: string;
  cycle?: string;
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

export function CandidatePacActivity({
  candidateId,
  candidateName,
  cycle = '2024',
  className,
}: CandidatePacActivityProps) {
  const { data, isLoading } = useCandidatePacActivity(candidateId, cycle);
  const { data: attributedData, isLoading: loadingDonors } = useAttributedDonors(candidateId, cycle);
  const [showSupportDonors, setShowSupportDonors] = useState(false);
  const [showOpposeDonors, setShowOpposeDonors] = useState(false);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const { supporting = [], opposing = [] } = data || {};

  if (supporting.length === 0 && opposing.length === 0) {
    return null; // Don't render if no PAC activity
  }

  const totalSupport = supporting.reduce((sum, p) => sum + p.support_total, 0);
  const totalOppose = opposing.reduce((sum, p) => sum + p.oppose_total, 0);

  const supportingDonors = attributedData?.supporting || [];
  const opposingDonors = attributedData?.opposing || [];

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Super PAC Activity
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Independent expenditures for or against {candidateName.split(' ')[0]}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-agree/10 border border-agree/20">
            <div className="flex items-center gap-2 mb-2">
              <ThumbsUp className="h-4 w-4 text-agree" />
              <span className="text-sm font-medium text-agree">Supporting PACs</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(totalSupport)}</p>
            <p className="text-xs text-muted-foreground">{supporting.length} PAC{supporting.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="p-4 rounded-lg bg-disagree/10 border border-disagree/20">
            <div className="flex items-center gap-2 mb-2">
              <ThumbsDown className="h-4 w-4 text-disagree" />
              <span className="text-sm font-medium text-disagree">Opposing PACs</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(totalOppose)}</p>
            <p className="text-xs text-muted-foreground">{opposing.length} PAC{opposing.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Supporting PACs */}
        {supporting.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-agree" />
              Supporting This Candidate
            </h4>
            <div className="space-y-2">
              {supporting.map((pac) => (
                <div 
                  key={pac.id} 
                  className="flex items-center justify-between p-3 rounded-lg border border-agree/20 bg-agree/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">
                      {pac.committee_name || pac.committee_id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(pac.support_ratio * 100).toFixed(0)}% of PAC spending
                    </p>
                  </div>
                  <span className="font-bold text-agree ml-4">{formatCurrency(pac.support_total)}</span>
                </div>
              ))}
            </div>

            {/* Attributed Supporting Donors */}
            {supportingDonors.length > 0 && (
              <div className="mt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSupportDonors(!showSupportDonors)}
                >
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Top Donors Funding Support ({supportingDonors.length})
                  </span>
                  {showSupportDonors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
                
                {showSupportDonors && (
                  <div className="mt-2 space-y-1 pl-2 border-l-2 border-agree/20">
                    {supportingDonors.slice(0, 10).map((donor) => (
                      <Link
                        key={donor.donor_id}
                        to={`/donor/${encodeURIComponent(donor.donor_name)}?type=${donor.donor_type}`}
                        className="flex items-center justify-between py-2 px-2 rounded text-sm hover:bg-agree/10 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground truncate">
                            {donor.display_name || donor.donor_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(donor.donation_amount)} donated → {formatCurrency(donor.totalAttributed)} attributed
                          </p>
                        </div>
                        <Badge variant="outline" className="ml-2 text-xs border-agree/30 text-agree">
                          {donor.donor_type}
                        </Badge>
                      </Link>
                    ))}
                    {supportingDonors.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        + {supportingDonors.length - 10} more donors
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Opposing PACs */}
        {opposing.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <ThumbsDown className="h-4 w-4 text-disagree" />
              Opposing This Candidate
            </h4>
            <div className="space-y-2">
              {opposing.map((pac) => (
                <div 
                  key={pac.id} 
                  className="flex items-center justify-between p-3 rounded-lg border border-disagree/20 bg-disagree/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">
                      {pac.committee_name || pac.committee_id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(pac.oppose_ratio * 100).toFixed(0)}% of PAC spending
                    </p>
                  </div>
                  <span className="font-bold text-disagree ml-4">{formatCurrency(pac.oppose_total)}</span>
                </div>
              ))}
            </div>

            {/* Attributed Opposing Donors */}
            {opposingDonors.length > 0 && (
              <div className="mt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowOpposeDonors(!showOpposeDonors)}
                >
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Top Donors Funding Opposition ({opposingDonors.length})
                  </span>
                  {showOpposeDonors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
                
                {showOpposeDonors && (
                  <div className="mt-2 space-y-1 pl-2 border-l-2 border-disagree/20">
                    {opposingDonors.slice(0, 10).map((donor) => (
                      <Link
                        key={donor.donor_id}
                        to={`/donor/${encodeURIComponent(donor.donor_name)}?type=${donor.donor_type}`}
                        className="flex items-center justify-between py-2 px-2 rounded text-sm hover:bg-disagree/10 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground truncate">
                            {donor.display_name || donor.donor_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(donor.donation_amount)} donated → {formatCurrency(donor.totalAttributed)} attributed
                          </p>
                        </div>
                        <Badge variant="outline" className="ml-2 text-xs border-disagree/30 text-disagree">
                          {donor.donor_type}
                        </Badge>
                      </Link>
                    ))}
                    {opposingDonors.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        + {opposingDonors.length - 10} more donors
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground border-t border-border pt-4">
          Super PACs make independent expenditures and are not coordinated with campaigns. 
          Donor attribution is proportional to PAC spending ratios. Data from FEC Schedule A & E filings.
        </p>
      </CardContent>
    </Card>
  );
}
