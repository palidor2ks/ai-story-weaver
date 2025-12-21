import { Header } from '@/components/Header';
import { ScoreBar } from '@/components/ScoreBar';
import { useUser } from '@/context/UserContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { User, RefreshCw, TrendingUp, Target, Clock } from 'lucide-react';

export const UserProfile = () => {
  const { user } = useUser();

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8 px-4 text-center">
          <p className="text-muted-foreground">Please complete onboarding first.</p>
          <Link to="/">
            <Button className="mt-4">Start Onboarding</Button>
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 px-4 max-w-3xl">
        {/* Profile Header */}
        <div className="bg-card rounded-2xl border border-border p-6 md:p-8 mb-8 shadow-elevated">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-hero flex items-center justify-center">
              <User className="w-10 h-10 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">
                {user.name}
              </h1>
              <p className="text-muted-foreground mt-1">
                Member since {user.createdAt.toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Overall Score */}
        <Card className="mb-8 shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent" />
              Your Political Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-8 p-6 rounded-xl bg-secondary/50">
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Overall Score
              </span>
              <div className={cn(
                "text-5xl font-display font-bold mt-2",
                user.overallScore >= 30 && "text-agree",
                user.overallScore <= -30 && "text-disagree",
                user.overallScore > -30 && user.overallScore < 30 && "text-accent"
              )}>
                {user.overallScore > 0 ? '+' : ''}{user.overallScore}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {user.overallScore >= 30 ? 'You tend to lean Progressive on most issues' : 
                 user.overallScore <= -30 ? 'You tend to lean Conservative on most issues' : 
                 'You hold moderate or mixed views across issues'}
              </p>
            </div>

            {/* Score Breakdown */}
            <div className="space-y-4">
              {user.topicScores.map((ts, index) => (
                <div 
                  key={ts.topicId}
                  className="animate-slide-up"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <ScoreBar
                    score={ts.score}
                    label={ts.topicName}
                    size="md"
                  />
                </div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <Link to="/quiz">
                <Button variant="outline" className="w-full gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Retake Quiz
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Priority Topics */}
        <Card className="mb-8 shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Target className="w-5 h-5 text-accent" />
              Your Priority Topics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {user.topTopics.map(topic => (
                <Badge 
                  key={topic.id} 
                  variant="secondary"
                  className="px-4 py-2 text-base gap-2"
                >
                  <span>{topic.icon}</span>
                  {topic.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quiz History */}
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Clock className="w-5 h-5 text-accent" />
              Quiz History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user.quizHistory.length > 0 ? (
              <div className="space-y-3">
                {user.quizHistory.map((attempt, index) => (
                  <div 
                    key={attempt.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-border"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        Quiz #{user.quizHistory.length - index}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {attempt.timestamp.toLocaleDateString()} at {attempt.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                    <div className={cn(
                      "text-xl font-bold",
                      attempt.resultingScore >= 30 && "text-agree",
                      attempt.resultingScore <= -30 && "text-disagree",
                      attempt.resultingScore > -30 && attempt.resultingScore < 30 && "text-accent"
                    )}>
                      {attempt.resultingScore > 0 ? '+' : ''}{attempt.resultingScore}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                No quiz history yet.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};
