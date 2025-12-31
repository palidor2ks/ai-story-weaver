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
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Loader2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Plus, Search, Pencil, Sparkles, XCircle } from "lucide-react";
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

interface QuestionFormData {
  id: string;
  text: string;
  topic_id: string;
  is_onboarding_canonical: boolean;
  onboarding_slot: number | null;
  options: {
    id: string;
    value: number;
    text: string;
    label: string;
    is_skip_option: boolean;
    display_order: number;
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

// Bulk Generate Dialog Component
interface BulkGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topics: Topic[];
  onGenerate: (topicIds: string[]) => Promise<void>;
  progress: {
    isRunning: boolean;
    currentTopic: string;
    completed: number;
    total: number;
    results: { topicId: string; topicName: string; success: boolean; error?: string }[];
  };
}

function BulkGenerateDialog({ open, onOpenChange, topics, onGenerate, progress }: BulkGenerateDialogProps) {
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());

  const toggleTopic = (topicId: string) => {
    const newSelected = new Set(selectedTopics);
    if (newSelected.has(topicId)) {
      newSelected.delete(topicId);
    } else {
      newSelected.add(topicId);
    }
    setSelectedTopics(newSelected);
  };

  const selectAll = () => {
    setSelectedTopics(new Set(topics.map(t => t.id)));
  };

  const selectNone = () => {
    setSelectedTopics(new Set());
  };

  const handleGenerate = () => {
    onGenerate(Array.from(selectedTopics));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Sparkles className="h-4 w-4 mr-2" />
          Bulk Generate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Bulk AI Question Generation
          </DialogTitle>
          <DialogDescription>
            Generate one question per selected topic using AI. Each question will include all 5 answer options.
          </DialogDescription>
        </DialogHeader>

        {progress.isRunning ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Generating: {progress.currentTopic}</span>
                <span>{progress.completed} / {progress.total}</span>
              </div>
              <Progress value={(progress.completed / progress.total) * 100} />
            </div>
            
            {progress.results.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {progress.results.map((result) => (
                  <div key={result.topicId} className="flex items-center gap-2 text-sm">
                    {result.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span>{result.topicName}</span>
                    {result.error && (
                      <span className="text-muted-foreground text-xs">({result.error})</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-4 py-4">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={selectNone}>
                  Select None
                </Button>
              </div>
              
              <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                {topics.map((topic) => (
                  <div
                    key={topic.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                      selectedTopics.has(topic.id) ? 'bg-primary/10 border-primary' : 'hover:bg-muted'
                    }`}
                    onClick={() => toggleTopic(topic.id)}
                  >
                    <Checkbox
                      checked={selectedTopics.has(topic.id)}
                      onCheckedChange={() => toggleTopic(topic.id)}
                    />
                    <span className="text-lg">{topic.icon}</span>
                    <span className="text-sm">{topic.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleGenerate}
                disabled={selectedTopics.size === 0}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate {selectedTopics.size} Question{selectedTopics.size !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </>
        )}

        {!progress.isRunning && progress.results.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <div className="text-sm font-medium">Results:</div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {progress.results.map((result) => (
                <div key={result.topicId} className="flex items-center gap-2 text-sm">
                  {result.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span>{result.topicName}</span>
                  {result.error && (
                    <span className="text-muted-foreground text-xs">({result.error})</span>
                  )}
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function QuestionManagementPanel() {
  const queryClient = useQueryClient();
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isBulkGenerateOpen, setIsBulkGenerateOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [bulkGenerateProgress, setBulkGenerateProgress] = useState<{
    isRunning: boolean;
    currentTopic: string;
    completed: number;
    total: number;
    results: { topicId: string; topicName: string; success: boolean; error?: string }[];
  }>({ isRunning: false, currentTopic: '', completed: 0, total: 0, results: [] });
  const [formData, setFormData] = useState<QuestionFormData>({
    id: "",
    text: "",
    topic_id: "",
    is_onboarding_canonical: false,
    onboarding_slot: null,
    options: DEFAULT_OPTIONS.map((o, i) => ({ 
      ...o, 
      id: "", 
      is_skip_option: false, 
      display_order: i + 1 
    })),
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
    mutationFn: async (form: QuestionFormData) => {
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

      const optionsToInsert = form.options
        .filter(opt => !opt.is_skip_option)
        .map((opt, index) => ({
          id: `${form.id}-opt-${index + 1}`,
          question_id: form.id,
          text: opt.text,
          value: opt.value,
          display_order: index + 1,
          is_skip_option: false,
        }));

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

  // Update question mutation
  const updateQuestionMutation = useMutation({
    mutationFn: async (form: QuestionFormData) => {
      // Update the question
      const { error: questionError } = await supabase
        .from('questions')
        .update({
          text: form.text,
          topic_id: form.topic_id,
          is_onboarding_canonical: form.is_onboarding_canonical,
          onboarding_slot: form.onboarding_slot,
        })
        .eq('id', form.id);

      if (questionError) throw questionError;

      // Update each option
      for (const opt of form.options) {
        if (opt.id) {
          const { error: optionError } = await supabase
            .from('question_options')
            .update({
              text: opt.text,
              value: opt.value,
              display_order: opt.display_order,
            })
            .eq('id', opt.id);

          if (optionError) throw optionError;
        }
      }

      return form.id;
    },
    onSuccess: (questionId) => {
      queryClient.invalidateQueries({ queryKey: ['admin-questions'] });
      toast.success(`Question "${questionId}" updated successfully`);
      setIsEditDialogOpen(false);
      setEditingQuestion(null);
      resetForm();
    },
    onError: (error) => {
      console.error('Failed to update question:', error);
      toast.error(`Failed to update question: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      id: "",
      text: "",
      topic_id: "",
      is_onboarding_canonical: false,
      onboarding_slot: null,
      options: DEFAULT_OPTIONS.map((o, i) => ({ 
        ...o, 
        id: "", 
        is_skip_option: false, 
        display_order: i + 1 
      })),
    });
  };

  const handleOpenCreate = () => {
    resetForm();
    setEditingQuestion(null);
    setIsCreateDialogOpen(true);
  };

  const handleOpenEdit = (question: Question) => {
    setEditingQuestion(question);
    
    // Sort options by value to match the expected order
    const regularOptions = question.question_options
      .filter(o => !o.is_skip_option)
      .sort((a, b) => a.value - b.value);
    
    const skipOption = question.question_options.find(o => o.is_skip_option);
    
    // Map existing options to form data, matching by value
    const mappedOptions = DEFAULT_OPTIONS.map((defaultOpt, index) => {
      const existingOpt = regularOptions.find(o => o.value === defaultOpt.value);
      return {
        id: existingOpt?.id || "",
        value: defaultOpt.value,
        text: existingOpt?.text || "",
        label: defaultOpt.label,
        is_skip_option: false,
        display_order: index + 1,
      };
    });

    // Add skip option if exists
    if (skipOption) {
      mappedOptions.push({
        id: skipOption.id,
        value: skipOption.value,
        text: skipOption.text,
        label: "Skip Option",
        is_skip_option: true,
        display_order: skipOption.display_order || 6,
      });
    }

    setFormData({
      id: question.id,
      text: question.text,
      topic_id: question.topic_id,
      is_onboarding_canonical: question.is_onboarding_canonical || false,
      onboarding_slot: question.onboarding_slot,
      options: mappedOptions,
    });
    
    setIsEditDialogOpen(true);
  };

  const handleTopicChange = (topicId: string) => {
    if (!editingQuestion) {
      const existingIds = questions?.map(q => q.id) || [];
      const suggestedId = generateQuestionId(topicId, existingIds);
      setFormData(prev => ({
        ...prev,
        topic_id: topicId,
        id: prev.id || suggestedId,
      }));
    } else {
      setFormData(prev => ({ ...prev, topic_id: topicId }));
    }
  };

  const handleGenerateWithAI = async () => {
    if (!formData.topic_id) {
      toast.error("Please select a topic first");
      return;
    }

    const topic = topics?.find(t => t.id === formData.topic_id);
    if (!topic) {
      toast.error("Topic not found");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-quiz-question', {
        body: { topicId: formData.topic_id, topicName: topic.name }
      });

      if (error) throw error;

      if (data.error) {
        if (data.error.includes('Rate limit')) {
          toast.error("AI rate limit exceeded. Please wait a moment and try again.");
        } else if (data.error.includes('credits')) {
          toast.error("AI credits exhausted. Please add funds to continue.");
        } else {
          toast.error(data.error);
        }
        return;
      }

      // Update form with AI-generated content
      setFormData(prev => ({
        ...prev,
        text: data.questionText,
        options: prev.options.map(opt => {
          if (opt.is_skip_option) return opt;
          const key = opt.value === -10 ? 'L10' : 
                     opt.value === -5 ? 'L5' : 
                     opt.value === 0 ? 'C' : 
                     opt.value === 5 ? 'R5' : 'R10';
          return { ...opt, text: data.options[key] };
        }),
      }));

      toast.success("AI generated question! Review and edit as needed.");
    } catch (error) {
      console.error('Failed to generate question:', error);
      toast.error("Failed to generate question. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBulkGenerate = async (selectedTopicIds: string[]) => {
    if (selectedTopicIds.length === 0) {
      toast.error("Please select at least one topic");
      return;
    }

    const selectedTopics = topics?.filter(t => selectedTopicIds.includes(t.id)) || [];
    setBulkGenerateProgress({
      isRunning: true,
      currentTopic: selectedTopics[0]?.name || '',
      completed: 0,
      total: selectedTopics.length,
      results: [],
    });

    const existingIds = questions?.map(q => q.id) || [];

    for (let i = 0; i < selectedTopics.length; i++) {
      const topic = selectedTopics[i];
      setBulkGenerateProgress(prev => ({
        ...prev,
        currentTopic: topic.name,
        completed: i,
      }));

      try {
        // Generate question with AI
        const { data, error } = await supabase.functions.invoke('generate-quiz-question', {
          body: { topicId: topic.id, topicName: topic.name }
        });

        if (error || data.error) {
          throw new Error(data?.error || error?.message || 'Unknown error');
        }

        // Generate unique ID
        const questionId = generateQuestionId(topic.id, existingIds);
        existingIds.push(questionId);

        // Create question in database
        const { error: questionError } = await supabase
          .from('questions')
          .insert({
            id: questionId,
            text: data.questionText,
            topic_id: topic.id,
            is_onboarding_canonical: false,
            onboarding_slot: null,
          });

        if (questionError) throw questionError;

        // Create options
        const optionsToInsert = [
          { id: `${questionId}-opt-1`, question_id: questionId, text: data.options.L10, value: -10, display_order: 1, is_skip_option: false },
          { id: `${questionId}-opt-2`, question_id: questionId, text: data.options.L5, value: -5, display_order: 2, is_skip_option: false },
          { id: `${questionId}-opt-3`, question_id: questionId, text: data.options.C, value: 0, display_order: 3, is_skip_option: false },
          { id: `${questionId}-opt-4`, question_id: questionId, text: data.options.R5, value: 5, display_order: 4, is_skip_option: false },
          { id: `${questionId}-opt-5`, question_id: questionId, text: data.options.R10, value: 10, display_order: 5, is_skip_option: false },
          { id: `${questionId}-skip`, question_id: questionId, text: "Not important to me", value: 0, display_order: 6, is_skip_option: true },
        ];

        const { error: optionsError } = await supabase
          .from('question_options')
          .insert(optionsToInsert);

        if (optionsError) {
          await supabase.from('questions').delete().eq('id', questionId);
          throw optionsError;
        }

        setBulkGenerateProgress(prev => ({
          ...prev,
          results: [...prev.results, { topicId: topic.id, topicName: topic.name, success: true }],
        }));

        // Add delay between requests to avoid rate limiting
        if (i < selectedTopics.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } catch (error) {
        console.error(`Failed to generate for ${topic.name}:`, error);
        setBulkGenerateProgress(prev => ({
          ...prev,
          results: [...prev.results, { 
            topicId: topic.id, 
            topicName: topic.name, 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          }],
        }));
      }
    }

    setBulkGenerateProgress(prev => ({
      ...prev,
      isRunning: false,
      completed: selectedTopics.length,
    }));

    queryClient.invalidateQueries({ queryKey: ['admin-questions'] });
    
    const successCount = bulkGenerateProgress.results.filter(r => r.success).length + 1;
    toast.success(`Generated ${successCount} questions successfully`);
  };

  const toggleTopic = (topicId: string) => {
    const newExpanded = new Set(expandedTopics);
    if (newExpanded.has(topicId)) {
      newExpanded.delete(topicId);
    } else {
      newExpanded.add(topicId);
    }
    setExpandedTopics(newExpanded);
  };

  const handleOptionTextChange = (index: number, text: string) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.map((opt, i) => 
        i === index ? { ...opt, text } : opt
      ),
    }));
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.id.trim()) {
      toast.error("Question ID is required");
      return;
    }
    if (!formData.text.trim()) {
      toast.error("Question text is required");
      return;
    }
    if (!formData.topic_id) {
      toast.error("Topic is required");
      return;
    }
    
    const regularOptions = formData.options.filter(o => !o.is_skip_option);
    const emptyOptions = regularOptions.filter(o => !o.text.trim());
    if (emptyOptions.length > 0) {
      toast.error("All 5 answer options are required");
      return;
    }

    if (questions?.some(q => q.id === formData.id)) {
      toast.error("A question with this ID already exists");
      return;
    }

    createQuestionMutation.mutate(formData);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.text.trim()) {
      toast.error("Question text is required");
      return;
    }
    if (!formData.topic_id) {
      toast.error("Topic is required");
      return;
    }
    
    const regularOptions = formData.options.filter(o => !o.is_skip_option);
    const emptyOptions = regularOptions.filter(o => !o.text.trim());
    if (emptyOptions.length > 0) {
      toast.error("All 5 answer options are required");
      return;
    }

    updateQuestionMutation.mutate(formData);
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
    if (topics) {
      setExpandedTopics(new Set(topics.map(t => t.id)));
    }
  };

  const collapseAll = () => {
    setExpandedQuestions(new Set());
    setExpandedTopics(new Set());
  };

  const filteredQuestions = questions?.filter(q => {
    const matchesSearch = searchTerm === "" || 
      q.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTopic = topicFilter === "all" || q.topic_id === topicFilter;
    return matchesSearch && matchesTopic;
  });

  // Group questions by topic
  const questionsByTopic = filteredQuestions?.reduce((acc, q) => {
    if (!acc[q.topic_id]) {
      acc[q.topic_id] = [];
    }
    acc[q.topic_id].push(q);
    return acc;
  }, {} as Record<string, Question[]>) || {};

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

  // Shared form content for create/edit dialogs
  const renderFormContent = (isEdit: boolean) => (
    <form onSubmit={isEdit ? handleEditSubmit : handleCreateSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="topic">Topic *</Label>
          <Select
            value={formData.topic_id}
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
            value={formData.id}
            onChange={(e) => setFormData(prev => ({ 
              ...prev, 
              id: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '') 
            }))}
            placeholder="e.g., eco1, imm3"
            required
            disabled={isEdit}
          />
          {!isEdit && (
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, hyphens only
            </p>
          )}
        </div>
      </div>

      {/* AI Generate Button - Only show for new questions */}
      {!isEdit && (
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-dashed">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="text-sm text-muted-foreground flex-1">
            Generate question and answers with AI
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleGenerateWithAI}
            disabled={isGenerating || !formData.topic_id}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate with AI
              </>
            )}
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="text">Question Text *</Label>
        <Textarea
          id="text"
          value={formData.text}
          onChange={(e) => setFormData(prev => ({ ...prev, text: e.target.value }))}
          placeholder="Enter the question text..."
          rows={2}
          required
        />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="onboarding"
            checked={formData.is_onboarding_canonical}
            onCheckedChange={(checked) => setFormData(prev => ({ 
              ...prev, 
              is_onboarding_canonical: checked,
              onboarding_slot: checked ? (prev.onboarding_slot || 1) : null 
            }))}
          />
          <Label htmlFor="onboarding">Onboarding Question</Label>
        </div>
        
        {formData.is_onboarding_canonical && (
          <div className="flex items-center gap-2">
            <Label htmlFor="slot">Slot #</Label>
            <Input
              id="slot"
              type="number"
              min={1}
              max={20}
              className="w-20"
              value={formData.onboarding_slot || ""}
              onChange={(e) => setFormData(prev => ({ 
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
          {formData.options.filter(o => !o.is_skip_option).map((option, index) => (
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
            A "Not important to me" skip option {isEdit ? "is preserved" : "will be added automatically"}.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button 
          type="button" 
          variant="outline" 
          onClick={() => isEdit ? setIsEditDialogOpen(false) : setIsCreateDialogOpen(false)}
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={isEdit ? updateQuestionMutation.isPending : createQuestionMutation.isPending}
        >
          {(isEdit ? updateQuestionMutation.isPending : createQuestionMutation.isPending) && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          {isEdit ? "Save Changes" : "Create Question"}
        </Button>
      </DialogFooter>
    </form>
  );

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
                <Button onClick={handleOpenCreate}>
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
                {renderFormContent(false)}
              </DialogContent>
            </Dialog>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Question</DialogTitle>
                  <DialogDescription>
                    Update the question text and answer options for "{editingQuestion?.id}".
                  </DialogDescription>
                </DialogHeader>
                {renderFormContent(true)}
              </DialogContent>
            </Dialog>

            <BulkGenerateDialog 
              open={isBulkGenerateOpen}
              onOpenChange={setIsBulkGenerateOpen}
              topics={topics || []}
              onGenerate={handleBulkGenerate}
              progress={bulkGenerateProgress}
            />

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

        {/* Questions List - Grouped by Topic */}
        <div className="space-y-3">
          {topics?.filter(topic => 
            topicFilter === "all" || topic.id === topicFilter
          ).map((topic) => {
            const topicQuestions = questionsByTopic[topic.id] || [];
            if (topicQuestions.length === 0 && topicFilter === "all") return null;
            
            const completeCount = topicQuestions.filter(q => 
              q.question_options.filter(o => !o.is_skip_option).length >= 5
            ).length;
            const incompleteCount = topicQuestions.length - completeCount;

            return (
              <Collapsible
                key={topic.id}
                open={expandedTopics.has(topic.id)}
                onOpenChange={() => toggleTopic(topic.id)}
              >
                <div className="border rounded-lg">
                  <CollapsibleTrigger className="w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors">
                    {expandedTopics.has(topic.id) ? (
                      <ChevronDown className="h-5 w-5 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-5 w-5 flex-shrink-0" />
                    )}
                    <span className="text-xl">{topic.icon}</span>
                    <div className="flex-1 text-left">
                      <div className="font-semibold">{topic.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {topicQuestions.length} question{topicQuestions.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {completeCount > 0 && (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {completeCount} complete
                        </Badge>
                      )}
                      {incompleteCount > 0 && (
                        <Badge variant="destructive">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {incompleteCount} incomplete
                        </Badge>
                      )}
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="border-t">
                      {topicQuestions.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground">
                          No questions in this category
                        </div>
                      ) : (
                        <div className="divide-y">
                          {topicQuestions.map((question) => (
                            <Collapsible
                              key={question.id}
                              open={expandedQuestions.has(question.id)}
                              onOpenChange={() => toggleQuestion(question.id)}
                            >
                              <div className="flex items-center">
                                <CollapsibleTrigger className="flex-1 p-3 pl-12 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                                  {expandedQuestions.has(question.id) ? (
                                    <ChevronDown className="h-4 w-4 flex-shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 flex-shrink-0" />
                                  )}
                                  <div className="flex-1 text-left">
                                    <div className="font-medium text-sm">{question.text}</div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Badge variant="outline" className="text-xs">
                                        {question.id}
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
                                <div className="pr-4">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenEdit(question);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              
                              <CollapsibleContent>
                                <div className="px-4 pb-4 pt-2 ml-8 border-t bg-muted/30">
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
                            </Collapsible>
                          ))}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>

        {Object.keys(questionsByTopic).length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No questions found matching your filters
          </div>
        )}
      </CardContent>
    </Card>
  );
}
