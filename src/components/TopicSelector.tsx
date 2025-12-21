import { Topic } from '@/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface TopicSelectorProps {
  topics: Topic[];
  selectedTopics: Topic[];
  onToggle: (topic: Topic) => void;
  maxSelections?: number;
}

export const TopicSelector = ({ 
  topics, 
  selectedTopics, 
  onToggle,
  maxSelections = 5 
}: TopicSelectorProps) => {
  const isSelected = (topic: Topic) => 
    selectedTopics.some(t => t.id === topic.id);

  const canSelectMore = selectedTopics.length < maxSelections;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {topics.map((topic, index) => {
        const selected = isSelected(topic);
        const disabled = !selected && !canSelectMore;
        
        return (
          <Button
            key={topic.id}
            variant={selected ? "topicSelected" : "topic"}
            onClick={() => onToggle(topic)}
            disabled={disabled}
            className={cn(
              "h-auto py-4 px-4 flex flex-col items-center gap-2 animate-scale-in",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <span className="text-2xl">{topic.icon}</span>
            <span className="text-sm font-medium">{topic.name}</span>
            {selected && (
              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-3 h-3 text-primary-foreground" />
              </div>
            )}
          </Button>
        );
      })}
    </div>
  );
};
