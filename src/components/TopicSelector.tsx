import { Topic } from '@/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TopicIcon } from '@/components/TopicIcon';


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
  maxSelections = 3 
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
              "h-auto min-h-[100px] py-3 px-2 flex flex-col items-center justify-center gap-2 animate-scale-in relative",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <TopicIcon name={topic.icon} className="w-8 h-8" />
            <span className="text-xs font-medium text-center leading-tight break-words whitespace-normal w-full px-1">
              {topic.displayName || topic.name}
            </span>
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
