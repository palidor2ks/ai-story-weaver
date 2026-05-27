import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Building2,
  User as UserIcon,
  Users,
  TrendingUp,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DonorAIAnalysisDialog } from '@/components/DonorAIAnalysisDialog';
import { CauseBadge } from '@/components/CauseBadge';
import { useAuth } from '@/context/AuthContext';

interface DonorCardProps {
  id: string;
  name: string;
  type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
  types?: string[];
  amount: number;
  transactionCount: number;
  isConsolidated?: boolean;
  nameVariations?: string[];
  recipientCount?: number;
  cycle?: string;
  primaryCause?: import('@/hooks/useDonorCauses').DonorCauseInfo;
}


const formatAmount = (amount: number) => {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount}`;
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'Individual': return <UserIcon className="w-5 h-5" />;
    case 'PAC': return <Users className="w-5 h-5" />;
    case 'Organization': return <Building2 className="w-5 h-5" />;
    default: return <TrendingUp className="w-5 h-5" />;
  }
};

const getTypeBadgeStyle = (type: string) => {
  switch (type) {
    case 'Individual':
      return 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400';
    case 'PAC':
      return 'bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-400';
    case 'Organization':
      return 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

export const DonorCard = ({
  id,
  name,
  type,
  types,
  amount,
  transactionCount,
  nameVariations,
  recipientCount,
  cycle,
  primaryCause,
}: DonorCardProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const hasMultipleVariations = nameVariations && nameVariations.length > 1;
  const hasMultipleTypes = types && types.length > 1;

  const requireAuth = (e: React.MouseEvent) => {
    if (user) return false;
    e.preventDefault();
    e.stopPropagation();
    navigate('/auth');
    return true;
  };

  return (
    <Card className="h-full transition-all duration-200 hover:shadow-lg hover:border-primary/30 group hover:scale-[1.01]">
      <CardContent className="p-5">
        <Link to={`/donor/${id}`} onClick={requireAuth} className="block rounded-md -m-2 p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <div className="flex items-start justify-between mb-4">
            <div className={`p-2.5 rounded-lg ${getTypeBadgeStyle(type)}`}>
              {getTypeIcon(type)}
            </div>
            <div className="flex items-center gap-2">
              {hasMultipleVariations && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Layers className="h-3 w-3" />
                        {nameVariations!.length} merged
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium mb-1">Merged donor names:</p>
                      <ul className="text-xs space-y-0.5">
                        {nameVariations!.slice(0, 5).map((v, i) => (
                          <li key={i} className="text-muted-foreground">• {v}</li>
                        ))}
                        {nameVariations!.length > 5 && (
                          <li className="text-muted-foreground">... and {nameVariations!.length - 5} more</li>
                        )}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {hasMultipleTypes ? (
                <div className="flex gap-1">
                  {types!.map(t => (
                    <Badge key={t} variant="outline" className={`shrink-0 text-xs ${getTypeBadgeStyle(t)}`}>
                      {t === 'Organization' ? 'Org' : t}
                    </Badge>
                  ))}
                </div>
) : (
                <Badge variant="outline" className={`shrink-0 ${getTypeBadgeStyle(type)}`}>
                  {type}
                </Badge>
              )}
              {primaryCause && <CauseBadge cause={primaryCause} />}
            </div>
          </div>

          <h3 className="font-semibold text-foreground mb-4 line-clamp-2 group-hover:text-primary transition-colors">
            {name}
          </h3>

          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                {recipientCount ? 'Recipients' : 'Donations'}
              </p>
              <p className="text-xl font-bold text-foreground">
                {recipientCount
                  ? recipientCount.toLocaleString()
                  : transactionCount.toLocaleString()}
              </p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Total</p>
              <p className="text-2xl font-bold text-agree">{formatAmount(amount)}</p>
            </div>
          </div>
        </Link>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Link to={`/donor/${id}`} onClick={requireAuth}>
            <Button variant="ghost" size="sm" className="px-2">View details</Button>
          </Link>

          <DonorAIAnalysisDialog
            id={id}
            name={name}
            type={type}
            cycle={cycle}
            profileHref={`/donor/${id}`}
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={(e) => {
                  if (!user) {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate('/auth');
                  }
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI Analysis
              </Button>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
};
