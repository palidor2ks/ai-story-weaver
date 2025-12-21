import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Trash2, ExternalLink, CheckCircle2 } from 'lucide-react';
import { CandidateAnswer } from '@/hooks/useCandidateAnswers';
import { CandidateAnswerInput } from '@/hooks/usePoliticianProfile';
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

interface QuestionAnswerFormProps {
  question: Question;
  existingAnswer?: CandidateAnswer;
  onSave: (answer: CandidateAnswerInput) => void;
  onDelete?: () => void;
  isSaving?: boolean;
  isDeleting?: boolean;
}

const SOURCE_TYPES = [
  { value: 'voting_record', label: 'Voting Record' },
  { value: 'public_statement', label: 'Public Statement' },
  { value: 'campaign_website', label: 'Campaign Website' },
  { value: 'interview', label: 'Interview' },
  { value: 'legislation', label: 'Legislation' },
  { value: 'other', label: 'Other' },
];

const CONFIDENCE_LEVELS = [
  { value: 'high', label: 'High', color: 'text-agree' },
  { value: 'medium', label: 'Medium', color: 'text-yellow-600' },
  { value: 'low', label: 'Low', color: 'text-muted-foreground' },
];

export function QuestionAnswerForm({
  question,
  existingAnswer,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: QuestionAnswerFormProps) {
  const [answerValue, setAnswerValue] = useState<number>(existingAnswer?.answer_value ?? 0);
  const [sourceUrl, setSourceUrl] = useState(existingAnswer?.source_url ?? '');
  const [sourceDescription, setSourceDescription] = useState(existingAnswer?.source_description ?? '');
  const [sourceType, setSourceType] = useState<string>(existingAnswer?.source_type ?? 'public_statement');
  const [confidence, setConfidence] = useState<string>(existingAnswer?.confidence ?? 'high');
  const [isEdited, setIsEdited] = useState(false);

  useEffect(() => {
    if (existingAnswer) {
      setAnswerValue(existingAnswer.answer_value);
      setSourceUrl(existingAnswer.source_url ?? '');
      setSourceDescription(existingAnswer.source_description ?? '');
      setSourceType(existingAnswer.source_type ?? 'public_statement');
      setConfidence(existingAnswer.confidence ?? 'high');
    }
  }, [existingAnswer]);

  const handleSave = () => {
    onSave({
      question_id: question.id,
      answer_value: answerValue,
      source_url: sourceUrl.trim() || undefined,
      source_description: sourceDescription.trim() || undefined,
      source_type: sourceType,
      confidence,
    });
    setIsEdited(false);
  };

  const getPositionLabel = (value: number) => {
    if (value <= -7) return 'Strongly Conservative';
    if (value <= -3) return 'Conservative';
    if (value < 0) return 'Lean Conservative';
    if (value === 0) return 'Neutral/Moderate';
    if (value < 4) return 'Lean Progressive';
    if (value < 8) return 'Progressive';
    return 'Strongly Progressive';
  };

  const getPositionColor = (value: number) => {
    if (value < 0) return 'text-flag-red';
    if (value > 0) return 'text-flag-blue';
    return 'text-muted-foreground';
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            {question.topics && (
              <Badge variant="outline" className="mb-2 text-xs">
                {question.topics.name}
              </Badge>
            )}
            <CardTitle className="text-base font-medium leading-relaxed">
              {question.text}
            </CardTitle>
          </div>
          {existingAnswer && (
            <Badge variant="secondary" className="shrink-0 bg-agree/10 text-agree">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Answered
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Answer Value Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Your Position</Label>
            <span className={cn("font-semibold", getPositionColor(answerValue))}>
              {answerValue > 0 ? '+' : ''}{answerValue} — {getPositionLabel(answerValue)}
            </span>
          </div>
          <div className="px-2">
            <Slider
              value={[answerValue]}
              onValueChange={(vals) => {
                setAnswerValue(vals[0]);
                setIsEdited(true);
              }}
              min={-10}
              max={10}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Conservative (-10)</span>
              <span>Moderate (0)</span>
              <span>Progressive (+10)</span>
            </div>
          </div>
        </div>

        {/* Source Type and Confidence */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Source Type</Label>
            <Select
              value={sourceType}
              onValueChange={(value) => {
                setSourceType(value);
                setIsEdited(true);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Confidence</Label>
            <Select
              value={confidence}
              onValueChange={(value) => {
                setConfidence(value);
                setIsEdited(true);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONFIDENCE_LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    <span className={level.color}>{level.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Source URL */}
        <div className="space-y-2">
          <Label htmlFor={`source-url-${question.id}`}>
            Source URL (optional)
          </Label>
          <div className="flex gap-2">
            <Input
              id={`source-url-${question.id}`}
              type="url"
              placeholder="https://example.com/your-statement"
              value={sourceUrl}
              onChange={(e) => {
                setSourceUrl(e.target.value);
                setIsEdited(true);
              }}
            />
            {sourceUrl && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => window.open(sourceUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Source Description */}
        <div className="space-y-2">
          <Label htmlFor={`source-desc-${question.id}`}>
            Source Description (optional)
          </Label>
          <Textarea
            id={`source-desc-${question.id}`}
            placeholder="Describe the source or provide additional context for your position..."
            value={sourceDescription}
            onChange={(e) => {
              setSourceDescription(e.target.value);
              setIsEdited(true);
            }}
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          {existingAnswer && onDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={isDeleting}
              className="text-destructive hover:text-destructive"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              Remove
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || (!isEdited && !!existingAnswer)}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            {existingAnswer ? 'Update' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
