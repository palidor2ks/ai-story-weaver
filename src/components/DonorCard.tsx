import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, User as UserIcon, Users, TrendingUp } from 'lucide-react';

interface DonorCardProps {
  id: string;
  name: string;
  type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
  amount: number;
  transactionCount: number;
  isConsolidated?: boolean;
  nameVariations?: string[];
  recipientCount?: number;
}

const formatAmount = (amount: number) => {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'Individual':
      return <UserIcon className="w-5 h-5" />;
    case 'PAC':
      return <Users className="w-5 h-5" />;
    case 'Organization':
      return <Building2 className="w-5 h-5" />;
    default:
      return <TrendingUp className="w-5 h-5" />;
  }
};

const getTypeBadgeStyle = (type: string) => {
  switch (type) {
    case 'Individual':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400';
    case 'PAC':
      return 'bg-purple-500/10 text-purple-600 border-purple-500/20 dark:bg-purple-500/20 dark:text-purple-400';
    case 'Organization':
      return 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

export const DonorCard = ({ 
  id, 
  name, 
  type, 
  amount, 
  transactionCount,
  isConsolidated,
  nameVariations,
  recipientCount,
}: DonorCardProps) => {
  // For consolidated donors with multiple variations, link to filtered search
  const linkPath = isConsolidated && nameVariations && nameVariations.length > 1
    ? `/donors?search=${encodeURIComponent(name)}&consolidated=false`
    : `/donor/${id}`;

  return (
    <Link to={linkPath} className="block group">
      <Card className="h-full transition-all duration-200 hover:shadow-lg hover:border-primary/30 group-hover:scale-[1.01]">
        <CardContent className="p-5">
          {/* Header with type icon and badge */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className={`p-2.5 rounded-lg ${getTypeBadgeStyle(type)}`}>
              {getTypeIcon(type)}
            </div>
            <div className="flex items-center gap-2">
              {isConsolidated && nameVariations && nameVariations.length > 1 && (
                <Badge variant="secondary" className="text-xs">
                  {nameVariations.length} merged
                </Badge>
              )}
              <Badge variant="outline" className={`shrink-0 ${getTypeBadgeStyle(type)}`}>
                {type}
              </Badge>
            </div>
          </div>

          {/* Donor name - clickable */}
          <h3 className="font-semibold text-lg text-foreground mb-4 line-clamp-2 group-hover:text-primary transition-colors">
            {name}
          </h3>

          {/* Stats row */}
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                {isConsolidated && recipientCount ? 'Recipients' : 'Donations'}
              </p>
              <p className="text-xl font-bold text-foreground">
                {isConsolidated && recipientCount 
                  ? recipientCount.toLocaleString()
                  : transactionCount.toLocaleString()
                }
              </p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                Total
              </p>
              <p className="text-2xl font-bold text-agree">
                {formatAmount(amount)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};
