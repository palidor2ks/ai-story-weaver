import { useState, useMemo } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useClaimedProfile, usePoliticianRole, useUpsertCandidateAnswer, useDeleteCandidateAnswer } from '@/hooks/usePoliticianProfile';
import { useCandidateAnswers, CandidateAnswer } from '@/hooks/useCandidateAnswers';
import { Header } from '@/components/Header';
import { QuestionAnswerForm } from '@/components/politician/QuestionAnswerForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Loader2, Search, User, FileText, CheckCircle2, Clock, ExternalLink, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface Question {
  id: string;
  text: string;
  topic_id: string;
  topics?: {
    id: string;
    name: string;
  };
}

interface Topic {
  id: string;
  name: string;
  icon: string;
}

export default function PoliticianDashboard() {
  const { user, loading: authLoading } = useAuth();
  const { data: politicianData, isLoading: politicianLoading } = usePoliticianRole();
  const { data: claimedProfile, isLoading: profileLoading } = useClaimedProfile();
  const { data: candidateAnswers = [], isLoading: answersLoading } = useCandidateAnswers(claimedProfile?.id);
  
  const upsertMutation = useUpsertCandidateAnswer();
  const deleteMutation = useDeleteCandidateAnswer();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [showAnswered, setShowAnswered] = useState<'all' | 'answered' | 'unanswered'>('all');

  // Fetch all questions
  const { data: questions = [], isLoading: questionsLoading } = useQuery({
    queryKey: ['all-questions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questions')
        .select('id, text, topic_id, topics(id, name)')
        .order('topic_id');
      
      if (error) throw error;
      return data as Question[];
    },
  });

  // Fetch all topics
  const { data: topics = [] } = useQuery({
    queryKey: ['topics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('topics')
        .select('id, name, icon')
        .order('name');
      
      if (error) throw error;
      return data as Topic[];
    },
  });

  // Create a map of answers by question ID
  const answersMap = useMemo(() => {
    const map = new Map<string, CandidateAnswer>();
    candidateAnswers.forEach(answer => {
      map.set(answer.question_id, answer);
    });
    return map;
  }, [candidateAnswers]);

  // Filter questions
  const filteredQuestions = useMemo(() => {
    return questions.filter(q => {
      // Search filter
      if (searchQuery) {
        const search = searchQuery.toLowerCase();
        if (!q.text.toLowerCase().includes(search) && 
            !q.topics?.name.toLowerCase().includes(search)) {
          return false;
        }
      }

      // Topic filter
      if (selectedTopic !== 'all' && q.topic_id !== selectedTopic) {
        return false;
      }

      // Answered filter
      const hasAnswer = answersMap.has(q.id);
      if (showAnswered === 'answered' && !hasAnswer) return false;
      if (showAnswered === 'unanswered' && hasAnswer) return false;

      return true;
    });
  }, [questions, searchQuery, selectedTopic, showAnswered, answersMap]);

  // Calculate progress
  const totalQuestions = questions.length;
  const answeredQuestions = candidateAnswers.length;
  const progressPercentage = totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0;

  // Loading state
  if (authLoading || politicianLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Auth guard
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Politician guard
  if (!politicianData?.isPolitician || !claimedProfile) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Card className="max-w-lg mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-6 w-6 text-primary" />
                Politician Dashboard
              </CardTitle>
              <CardDescription>
                This dashboard is only available for verified politicians who have claimed their profile.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                To access this dashboard, you need to:
              </p>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground mb-6">
                <li>Find your candidate profile on the platform</li>
                <li>Submit a claim request with verification information</li>
                <li>Wait for admin approval</li>
              </ol>
              <Link to="/feed">
                <Button>Browse Candidates</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-flag-blue/10 text-flag-blue border-flag-blue/30';
      case 'Republican': return 'bg-flag-red/10 text-flag-red border-flag-red/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileText className="h-8 w-8 text-primary" />
              Politician Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Answer questions to help voters understand your positions
            </p>
          </div>
          <Link to={`/candidate/${claimedProfile.id}`}>
            <Button variant="outline" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              View Public Profile
            </Button>
          </Link>
        </div>

        {/* Profile Card */}
        <Card className="mb-8">
          <CardContent className="py-6">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
                  <User className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">{claimedProfile.name}</h2>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{claimedProfile.office}</span>
                    <span>•</span>
                    <span>{claimedProfile.state}</span>
                    <Badge variant="outline" className={cn("ml-2", getPartyColor(claimedProfile.party))}>
                      {claimedProfile.party}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex-1 md:ml-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Questions Answered</span>
                  <span className="text-sm text-muted-foreground">
                    {answeredQuestions} / {totalQuestions}
                  </span>
                </div>
                <Progress value={progressPercentage} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {progressPercentage.toFixed(0)}% complete
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-agree/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-agree" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{answeredQuestions}</p>
                  <p className="text-sm text-muted-foreground">Answered</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalQuestions - answeredQuestions}</p>
                  <p className="text-sm text-muted-foreground">Remaining</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Filter className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{topics.length}</p>
                  <p className="text-sm text-muted-foreground">Topics</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search questions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={selectedTopic} onValueChange={setSelectedTopic}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="All Topics" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Topics</SelectItem>
                  {topics.map((topic) => (
                    <SelectItem key={topic.id} value={topic.id}>
                      {topic.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Tabs value={showAnswered} onValueChange={(v) => setShowAnswered(v as typeof showAnswered)}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="unanswered">Unanswered</TabsTrigger>
                  <TabsTrigger value="answered">Answered</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        {/* Questions List */}
        {questionsLoading || answersLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredQuestions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                {searchQuery || selectedTopic !== 'all' || showAnswered !== 'all'
                  ? 'No questions match your filters.'
                  : 'No questions available.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Showing {filteredQuestions.length} of {totalQuestions} questions
            </p>
            {filteredQuestions.map((question) => (
              <QuestionAnswerForm
                key={question.id}
                question={question}
                existingAnswer={answersMap.get(question.id)}
                onSave={(answer) => {
                  upsertMutation.mutate({
                    candidateId: claimedProfile.id,
                    answer,
                  });
                }}
                onDelete={() => {
                  deleteMutation.mutate({
                    candidateId: claimedProfile.id,
                    questionId: question.id,
                  });
                }}
                isSaving={upsertMutation.isPending}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
