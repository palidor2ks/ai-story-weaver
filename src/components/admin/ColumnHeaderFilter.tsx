import { ChevronDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface FilterOption {
  value: string;
  label: string;
  count?: number;
  className?: string;
}

interface ColumnHeaderFilterProps {
  label: React.ReactNode;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  className?: string;
  align?: "start" | "center" | "end";
}

export function ColumnHeaderFilter({
  label,
  value,
  options,
  onChange,
  className,
  align = "start",
}: ColumnHeaderFilterProps) {
  const isFiltered = value !== "all";
  const selectedOption = options.find((o) => o.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-auto p-0 font-medium text-xs hover:bg-transparent flex items-center gap-0.5",
            isFiltered && "text-primary",
            className
          )}
        >
          {typeof label === "string" ? (
            <span className={cn(isFiltered && "underline underline-offset-2")}>
              {label}
            </span>
          ) : (
            label
          )}
          <ChevronDown
            className={cn(
              "h-3 w-3 opacity-50",
              isFiltered && "opacity-100 text-primary"
            )}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[120px]">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "text-xs",
              option.value === value && "bg-accent",
              option.className
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="ml-auto text-muted-foreground">
                ({option.count})
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
