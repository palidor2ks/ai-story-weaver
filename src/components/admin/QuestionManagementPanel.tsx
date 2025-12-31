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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Loader2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Plus, Search } from "lucide-react";
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

interface NewQuestionForm {
  id: string;
  text: string;
  topic_id: string;
  is_onboarding_canonical: boolean;
  onboarding_slot: number | null;
  options: {
    value: number;
    text: string;
    label: string;
  }[];
}

const DEFAULT_OPTIONS = [
  { value: -10, text: "", label: "Far Left (L10)" },
  { value: -5, text: "", label: "Center Left (L5)" },
  { value: 0, text: "", label: "Center (C)" },
  { value: 5, text: "", label: "Center Right (R5)" },
  { value: 10, text: "", label: "Far Right (R10)" },
];

const generateQuestionId = (topicId: string, existingIds: string[]): string => {
  const prefix = topicId.slice(0, 3).toLowerCase();
  let counter = 1;
  while (existingIds.includes(`${prefix}${counter}`)) {
    counter++;
  }
  return `${prefix}${counter}`;
};

export function QuestionManagementPanel() {
  const queryClient = useQueryClient();
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState<NewQuestionForm>({
    id: "",
    text: "",
    topic_id: "",
    is_onboarding_canonical: false,
    onboarding_slot: null,
    options: DEFAULT_OPTIONS.map(o => ({ ...o })),
  });

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

  // Create question mutation
  const createQuestionMutation = useMutation({
    mutationFn: async (form: NewQuestionForm) => {
      // First, insert the question
      const { error: questionError } = await supabase
        .from('questions')
        .insert({
          id: form.id,
          text: form.text,
          topic_id: form.topic_id,
          is_onboarding_canonical: form.is_onboarding_canonical,
          onboarding_slot: form.onboarding_slot,
        });

      if (questionError) throw questionError;

      // Then, insert all the options
      const optionsToInsert = form.options.map((opt, index) => ({
        id: `${form.id}-opt-${index + 1}`,
        question_id: form.id,
        text: opt.text,
        value: opt.value,
        display_order: index + 1,
        is_skip_option: false,
      }));

      // Add the skip option
      optionsToInsert.push({
        id: `${form.id}-skip`,
        question_id: form.id,
        text: "Not important to me",
        value: 0,
        display_order: 6,
        is_skip_option: true,
      });

      const { error: optionsError } = await supabase
        .from('question_options')
        .insert(optionsToInsert);

      if (optionsError) {
        // Rollback: delete the question if options failed
        await supabase.from('questions').delete().eq('id', form.id);
        throw optionsError;
      }

      return form.id;
    },
    onSuccess: (questionId) => {
      queryClient.invalidateQueries({ queryKey: ['admin-questions'] });
      toast.success(`Question "${questionId}" created successfully`);
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      console.error('Failed to create question:', error);
      toast.error(`Failed to create question: ${error.message}`);
    },
  });

  const resetForm = () => {
    setNewQuestion({
      id: "",
      text: "",
      topic_id: "",
      is_onboarding_canonical: false,
      onboarding_slot: null,
      options: DEFAULT_OPTIONS.map(o => ({ ...o })),
    });
  };

  const handleTopicChange = (topicId: string) => {
    const existingIds = questions?.map(q => q.id) || [];
    const suggestedId = generateQuestionId(topicId, existingIds);
    setNewQuestion(prev => ({
      ...prev,
      topic_id: topicId,
      id: prev.id || suggestedId,
    }));
  };

  const handleOptionTextChange = (index: number, text: string) => {
    setNewQuestion(prev => ({
      ...prev,
      options: prev.options.map((opt, i) => 
        i === index ? { ...opt, text } : opt
      ),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!newQuestion.id.trim()) {
      toast.error("Question ID is required");
      return;
    }
    if (!newQuestion.text.trim()) {
      toast.error("Question text is required");
      return;
    }
    if (!newQuestion.topic_id) {
      toast.error("Topic is required");
      return;
    }
    
    const emptyOptions = newQuestion.options.filter(o => !o.text.trim());
    if (emptyOptions.length > 0) {
      toast.error("All 5 answer options are required");
      return;
    }

    // Check for duplicate ID
    if (questions?.some(q => q.id === newQuestion.id)) {
      toast.error("A question with this ID already exists");
      return;
    }

    createQuestionMutation.mutate(newQuestion);
  };

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
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => resetForm()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Question
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Question</DialogTitle>
                  <DialogDescription>
                    Add a new quiz question with all 5 required answer options (L10, L5, Center, R5, R10).
                  </DialogDescription>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="topic">Topic *</Label>
                      <Select
                        value={newQuestion.topic_id}
                        onValueChange={handleTopicChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select topic" />
                        </SelectTrigger>
                        <SelectContent>
                          {topics?.map((topic) => (
                            <SelectItem key={topic.id} value={topic.id}>
                              {topic.icon} {topic.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="id">Question ID *</Label>
                      <Input
                        id="id"
                        value={newQuestion.id}
                        onChange={(e) => setNewQuestion(prev => ({ ...prev, id: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '') }))}
                        placeholder="e.g., eco1, imm3"
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Lowercase letters, numbers, hyphens only
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="text">Question Text *</Label>
                    <Textarea
                      id="text"
                      value={newQuestion.text}
                      onChange={(e) => setNewQuestion(prev => ({ ...prev, text: e.target.value }))}
                      placeholder="Enter the question text..."
                      rows={2}
                      required
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="onboarding"
                        checked={newQuestion.is_onboarding_canonical}
                        onCheckedChange={(checked) => setNewQuestion(prev => ({ 
                          ...prev, 
                          is_onboarding_canonical: checked,
                          onboarding_slot: checked ? 1 : null 
                        }))}
                      />
                      <Label htmlFor="onboarding">Onboarding Question</Label>
                    </div>
                    
                    {newQuestion.is_onboarding_canonical && (
                      <div className="flex items-center gap-2">
                        <Label htmlFor="slot">Slot #</Label>
                        <Input
                          id="slot"
                          type="number"
                          min={1}
                          max={20}
                          className="w-20"
                          value={newQuestion.onboarding_slot || ""}
                          onChange={(e) => setNewQuestion(prev => ({ 
                            ...prev, 
                            onboarding_slot: parseInt(e.target.value) || null 
                          }))}
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label>Answer Options * (all 5 required)</Label>
                    <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                      {newQuestion.options.map((option, index) => (
                        <div key={option.value} className="flex items-start gap-3">
                          <div className="w-20 flex-shrink-0 pt-2">
                            {getValueBadge(option.value)}
                          </div>
                          <div className="flex-1">
                            <Textarea
                              value={option.text}
                              onChange={(e) => handleOptionTextChange(index, e.target.value)}
                              placeholder={`${option.label} position...`}
                              rows={2}
                              className="resize-none"
                              required
                            />
                          </div>
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground mt-2">
                        A "Not important to me" skip option will be added automatically.
                      </p>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createQuestionMutation.isPending}
                    >
                      {createQuestionMutation.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Create Question
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
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
