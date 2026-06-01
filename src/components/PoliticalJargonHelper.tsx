import { useMemo, useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { politicalGlossaryTerms, type PoliticalGlossaryTerm } from '@/data/politicalGlossary';
import { cn } from '@/lib/utils';

interface PoliticalJargonHelperProps {
  contextText?: string;
  className?: string;
  title?: string;
  description?: string;
  defaultOpen?: boolean;
}

const normalize = (value: string) => value.toLowerCase().replace(/[’']/g, '').trim();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const contextIncludesTerm = (context: string, term: string) => {
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return false;
  return new RegExp(`\\b${escapeRegExp(normalizedTerm)}\\b`, 'i').test(context);
};

const matchesTerm = (entry: PoliticalGlossaryTerm, query: string) => {
  const haystack = [
    entry.term,
    entry.category,
    entry.plainDefinition,
    entry.whyItMatters,
    entry.example,
    ...(entry.aliases ?? []),
  ].map(normalize).join(' ');
  return haystack.includes(normalize(query));
};

const findTermsInContext = (contextText?: string) => {
  if (!contextText) return [];
  const normalizedContext = normalize(contextText);
  return politicalGlossaryTerms.filter((entry) => {
    const words = [entry.term, ...(entry.aliases ?? [])];
    return words.some((word) => contextIncludesTerm(normalizedContext, word));
  });
};

export const PoliticalJargonHelper = ({
  contextText,
  className,
  title = 'Plain-English term helper',
  description = 'Look up political jargon without leaving the page.',
  defaultOpen,
}: PoliticalJargonHelperProps) => {
  const detectedTerms = useMemo(() => findTermsInContext(contextText), [contextText]);
  const [isOpen, setIsOpen] = useState(() => defaultOpen ?? detectedTerms.length > 0);
  const [query, setQuery] = useState(detectedTerms[0]?.term ?? 'Filibuster');
  const [selectedTerm, setSelectedTerm] = useState<PoliticalGlossaryTerm>(detectedTerms[0] ?? politicalGlossaryTerms[0]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return politicalGlossaryTerms.slice(0, 6);
    return politicalGlossaryTerms.filter((entry) => matchesTerm(entry, trimmed)).slice(0, 6);
  }, [query]);

  const selectTerm = (entry: PoliticalGlossaryTerm) => {
    setSelectedTerm(entry);
    setQuery(entry.term);
  };

  return (
    <div className={cn('rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3', className)}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 rounded-full bg-primary/10 p-1.5 text-primary">
          <BookOpen className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 shrink-0 px-2.5 text-xs"
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? 'Hide' : 'Explain'}
        </Button>
      </div>

      {isOpen && detectedTerms.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Terms spotted here</p>
          <div className="flex flex-wrap gap-1.5">
            {detectedTerms.slice(0, 5).map((entry) => (
              <Button
                key={entry.term}
                type="button"
                size="sm"
                variant={selectedTerm.term === entry.term ? 'secondary' : 'outline'}
                className="h-7 rounded-full px-2.5 text-xs"
                onClick={() => selectTerm(entry)}
              >
                {entry.term}
              </Button>
            ))}
          </div>
        </div>
      )}

      {isOpen && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search terms like filibuster, PAC, reconciliation…"
              className="h-9 pl-8 text-sm"
              aria-label="Search political terms"
            />
          </div>

          {results.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {results.map((entry) => (
                <Badge
                  key={entry.term}
                  variant={selectedTerm.term === entry.term ? 'default' : 'secondary'}
                  className="cursor-pointer"
                  onClick={() => selectTerm(entry)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') selectTerm(entry);
                  }}
                >
                  {entry.term}
                </Badge>
              ))}
            </div>
          )}

          <div className="rounded-md border border-border bg-background/80 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h5 className="font-semibold text-foreground">{selectedTerm.term}</h5>
              <Badge variant="outline" className="text-[10px]">{selectedTerm.category}</Badge>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{selectedTerm.plainDefinition}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Why it matters:</span> {selectedTerm.whyItMatters}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Example:</span> {selectedTerm.example}
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default PoliticalJargonHelper;
