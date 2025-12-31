import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Plus, Pencil, Search } from "lucide-react";
import { toast } from "sonner";

interface QuestionOption {
  id: string;
  question_id: string;
  text: string;
  value: number;
  display_order: number | null;
  is_skip_option: boolean | null;
}

interface Question {
  id: string;
  text: string;
  topic_id: string;
  is_onboarding_canonical: boolean | null;
  onboarding_slot: number | null;
  question_options: QuestionOption[];
}

interface Topic {
  id: string;
  name: string;
  icon: string;
}

export function QuestionManagementPanel() {
  const queryClient = useQueryClient();
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [editingOption, setEditingOption] = useState<QuestionOption | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({ text: "", value: 0 });

  // Fetch all questions with their options
  const { data: questions, isLoading: questionsLoading } = useQuery({
    queryKey: ['admin-questions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questions')
        .select('*, question_options(*)')
        .order('topic_id')
        .order('id');

      if (error) throw error;
      return data as Question[];
    },
  });

  // Fetch topics for filtering
  const { data: topics } = useQuery({
    queryKey: ['topics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('topics')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Topic[];
    },
  });

  // Update option mutation (admin only via edge function would be needed for full CRUD)
  // For now, showing read-only view with edit placeholder

  const toggleQuestion = (questionId: string) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId);
    } else {
      newExpanded.add(questionId);
    }
    setExpandedQuestions(newExpanded);
  };

  const expandAll = () => {
    if (filteredQuestions) {
      setExpandedQuestions(new Set(filteredQuestions.map(q => q.id)));
    }
  };

  const collapseAll = () => {
    setExpandedQuestions(new Set());
  };

  // Filter questions
  const filteredQuestions = questions?.filter(q => {
    const matchesSearch = searchTerm === "" || 
      q.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTopic = topicFilter === "all" || q.topic_id === topicFilter;
    return matchesSearch && matchesTopic;
  });

  // Calculate stats
  const stats = {
    totalQuestions: questions?.length || 0,
    questionsWithAllOptions: questions?.filter(q => 
      q.question_options.filter(o => !o.is_skip_option).length >= 5
    ).length || 0,
    questionsMissingOptions: questions?.filter(q => 
      q.question_options.filter(o => !o.is_skip_option).length < 5
    ).length || 0,
    onboardingQuestions: questions?.filter(q => q.is_onboarding_canonical).length || 0,
  };

  const getValueBadge = (value: number) => {
    if (value <= -7) return <Badge className="bg-blue-700 text-white">L10</Badge>;
    if (value <= -3) return <Badge className="bg-blue-500 text-white">L5</Badge>;
    if (value >= 7) return <Badge className="bg-red-700 text-white">R10</Badge>;
    if (value >= 3) return <Badge className="bg-red-500 text-white">R5</Badge>;
    return <Badge variant="outline">C</Badge>;
  };

  const getOptionStatus = (question: Question) => {
    const regularOptions = question.question_options.filter(o => !o.is_skip_option);
    const skipOptions = question.question_options.filter(o => o.is_skip_option);
    
    if (regularOptions.length < 5) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Missing ({regularOptions.length}/5)
        </Badge>
      );
    }
    return (
      <Badge variant="default" className="gap-1 bg-green-600">
        <CheckCircle2 className="h-3 w-3" />
        Complete ({regularOptions.length} + {skipOptions.length} skip)
      </Badge>
    );
  };

  const getTopicName = (topicId: string) => {
    return topics?.find(t => t.id === topicId)?.name || topicId;
  };

  if (questionsLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Quiz Questions & Options</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              Collapse All
            </Button>
          </div>
        </CardTitle>
        <CardDescription>
          View and manage quiz questions and their answer options
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-2xl font-bold">{stats.totalQuestions}</div>
            <div className="text-sm text-muted-foreground">Total Questions</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-green-600">{stats.questionsWithAllOptions}</div>
            <div className="text-sm text-muted-foreground">Complete (5+ options)</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-red-600">{stats.questionsMissingOptions}</div>
            <div className="text-sm text-muted-foreground">Missing Options</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-primary">{stats.onboardingQuestions}</div>
            <div className="text-sm text-muted-foreground">Onboarding Canonical</div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search questions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={topicFilter} onValueChange={setTopicFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by topic" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Topics</SelectItem>
              {topics?.map((topic) => (
                <SelectItem key={topic.id} value={topic.id}>
                  {topic.icon} {topic.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Questions List */}
        <div className="space-y-2">
          {filteredQuestions?.map((question) => (
            <Collapsible
              key={question.id}
              open={expandedQuestions.has(question.id)}
              onOpenChange={() => toggleQuestion(question.id)}
            >
              <div className="border rounded-lg">
                <CollapsibleTrigger className="w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors">
                  {expandedQuestions.has(question.id) ? (
                    <ChevronDown className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 flex-shrink-0" />
                  )}
                  <div className="flex-1 text-left">
                    <div className="font-medium">{question.text}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {question.id}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {getTopicName(question.topic_id)}
                      </Badge>
                      {question.is_onboarding_canonical && (
                        <Badge className="text-xs bg-primary">
                          Onboarding #{question.onboarding_slot}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {getOptionStatus(question)}
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div className="px-4 pb-4 pt-2 border-t bg-muted/30">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px]">Order</TableHead>
                          <TableHead className="w-[80px]">Value</TableHead>
                          <TableHead>Option Text</TableHead>
                          <TableHead className="w-[100px]">Type</TableHead>
                          <TableHead className="w-[80px] text-right">ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {question.question_options
                          .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                          .map((option) => (
                            <TableRow key={option.id} className={option.is_skip_option ? "opacity-60" : ""}>
                              <TableCell>{option.display_order ?? '-'}</TableCell>
                              <TableCell>{getValueBadge(option.value)}</TableCell>
                              <TableCell className="max-w-md">
                                <span className={option.is_skip_option ? "italic" : ""}>
                                  {option.text}
                                </span>
                              </TableCell>
                              <TableCell>
                                {option.is_skip_option ? (
                                  <Badge variant="outline" className="text-xs">Skip</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">Regular</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <code className="text-xs text-muted-foreground">
                                  {option.id.slice(-8)}
                                </code>
                              </TableCell>
                            </TableRow>
                          ))}
                        {question.question_options.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                              No options defined for this question
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>

        {filteredQuestions?.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No questions found matching your filters
          </div>
        )}
      </CardContent>
    </Card>
  );
}
