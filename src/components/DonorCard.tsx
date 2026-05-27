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
  primaryCauseLabel?: string;
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
  primaryCauseLabel,
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
      <CardContent className="p-4 sm:p-5">
        <Link to={`/donor/${id}`} onClick={requireAuth} className="block rounded-md -m-2 p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className={`p-2.5 rounded-lg ${getTypeBadgeStyle(type)}`}>
              {getTypeIcon(type)}
            </div>
            <div className="flex flex-wrap items-center justify-start gap-1.5 sm:justify-end">
              {hasMultipleVariations && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="gap-1 text-[11px] sm:text-xs">
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
                <div className="flex flex-wrap gap-1 sm:justify-end">
                  {types!.map(t => (
                    <Badge key={t} variant="outline" className={`shrink-0 text-[11px] sm:text-xs ${getTypeBadgeStyle(t)}`}>
                      {t === 'Organization' ? 'Org' : t}
                    </Badge>
                  ))}
                </div>
) : (
                <Badge variant="outline" className={`shrink-0 text-[11px] sm:text-xs ${getTypeBadgeStyle(type)}`}>
                  {type}
                </Badge>
              )}
              {primaryCauseLabel && <CauseBadge cause={{ label: primaryCauseLabel }} />}
            </div>
          </div>

          <h3 className="mb-4 line-clamp-2 text-lg font-semibold text-foreground transition-colors group-hover:text-primary sm:text-xl">
            {name}
          </h3>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                {recipientCount ? 'Recipients' : 'Donations'}
              </p>
              <p className="text-xl font-bold text-foreground sm:text-2xl">
                {recipientCount
                  ? recipientCount.toLocaleString()
                  : transactionCount.toLocaleString()}
              </p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Total</p>
              <p className="text-2xl font-bold leading-none text-agree sm:text-3xl">{formatAmount(amount)}</p>
            </div>
          </div>
        </Link>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Link to={`/donor/${id}`} onClick={requireAuth}>
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 sm:w-auto">View details</Button>
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
                className="w-full gap-1.5 sm:w-auto"
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
