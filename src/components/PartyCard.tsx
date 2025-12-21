import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScoreText } from '@/components/ScoreText';
import { Building2, Leaf, Scale, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PartyCardProps {
  id: string;
  name: string;
  shortName: string;
  color: string;
  description: string | null;
  answerCount: number;
  overallScore: number;
  userAlignment?: number;
  logoIcon?: string | null;
}

const iconMap: Record<string, typeof Building2> = {
  Building2,
  Leaf,
  Scale,
};

export function PartyCard({
  id,
  name,
  shortName,
  color,
  description,
  answerCount,
  overallScore,
  userAlignment,
  logoIcon,
}: PartyCardProps) {
  const Icon = iconMap[logoIcon || 'Building2'] || Building2;
  
  const getPartyBgClass = () => {
    switch (id) {
      case 'democrat': return 'bg-blue-500/10 border-blue-500/30 hover:border-blue-500/50';
      case 'republican': return 'bg-red-500/10 border-red-500/30 hover:border-red-500/50';
      case 'green': return 'bg-green-500/10 border-green-500/30 hover:border-green-500/50';
      case 'libertarian': return 'bg-yellow-500/10 border-yellow-500/30 hover:border-yellow-500/50';
      default: return 'bg-secondary border-border hover:border-primary/50';
    }
  };

  const getPartyTextClass = () => {
    switch (id) {
      case 'democrat': return 'text-blue-600';
      case 'republican': return 'text-red-600';
      case 'green': return 'text-green-600';
      case 'libertarian': return 'text-yellow-600';
      default: return 'text-foreground';
    }
  };

  return (
    <Link to={`/party/${id}`}>
      <Card className={cn(
        "transition-all duration-200 hover:shadow-lg cursor-pointer",
        getPartyBgClass()
      )}>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div 
              className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${color}20` }}
            >
              <Icon className="w-7 h-7" style={{ color }} />
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className={cn("font-display text-xl font-bold", getPartyTextClass())}>
                {name}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {description}
              </p>
              
              <div className="flex items-center gap-3 mt-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Platform:</span>
                  <ScoreText score={overallScore} size="sm" />
                </div>
                
                <Badge variant="outline" className="text-xs">
                  {answerCount} positions
                </Badge>
                
                {userAlignment !== undefined && (
                  <Badge 
                    className="text-xs"
                    style={{ 
                      backgroundColor: `${color}20`,
                      color: color,
                      borderColor: `${color}40`,
                    }}
                  >
                    {userAlignment}% match
                  </Badge>
                )}
              </div>
            </div>
            
            <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
