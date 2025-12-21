import { Header } from '@/components/Header';
import { PartyCard } from '@/components/PartyCard';
import { usePartiesWithStats, calculatePartyAlignment } from '@/hooks/usePartyPlatform';
import { useUserTopicScores } from '@/hooks/useProfile';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Sparkles } from 'lucide-react';

export default function Parties() {
  const { data: parties, isLoading: partiesLoading } = usePartiesWithStats();
  const { data: userTopicScores = [] } = useUserTopicScores();

  const userScores = userTopicScores.map(ts => ({
    topicId: ts.topic_id,
    score: Number(ts.score),
  }));

  // Calculate user alignment with each party
  const getPartyAlignment = (partyId: string) => {
    if (userScores.length === 0) return undefined;
    
    // We'd need party topic scores here - for now use a placeholder
    // This will be properly calculated when viewing individual party pages
    return undefined;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 px-4 max-w-4xl">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-hero flex items-center justify-center">
              <Building2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">
                Party Platforms
              </h1>
              <p className="text-muted-foreground">
                Explore official party positions on every issue
              </p>
            </div>
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-secondary/50 rounded-xl p-4 mb-8 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-foreground font-medium">
              Compare your positions with major political parties
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Each party's positions are documented with sources from official platforms, 
              voting records, and policy statements.
            </p>
          </div>
        </div>

        {/* Party Cards */}
        {partiesLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {parties?.map((party) => (
              <PartyCard
                key={party.id}
                id={party.id}
                name={party.name}
                shortName={party.short_name}
                color={party.color}
                description={party.description}
                answerCount={party.answerCount}
                overallScore={party.overallScore}
                logoIcon={party.logo_icon}
                userAlignment={getPartyAlignment(party.id)}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!partiesLoading && (!parties || parties.length === 0) && (
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">No parties available</h3>
            <p className="text-muted-foreground text-sm">
              Party platform data is being compiled. Check back soon!
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
