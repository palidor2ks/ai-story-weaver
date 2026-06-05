import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTileTone = "default" | "muted" | "amber" | "green" | "purple" | "blue";

const TONE_STYLES: Record<StatTileTone, { box: string; value: string; icon: string }> = {
  default: { box: "bg-muted/50", value: "text-foreground", icon: "text-muted-foreground" },
  muted: { box: "bg-muted/30", value: "text-muted-foreground", icon: "text-muted-foreground" },
  amber: { box: "bg-amber-500/10", value: "text-amber-600", icon: "text-amber-600" },
  green: { box: "bg-green-500/10", value: "text-green-600", icon: "text-green-600" },
  purple: { box: "bg-purple-500/10", value: "text-purple-600", icon: "text-purple-600" },
  blue: { box: "bg-blue-500/10", value: "text-blue-600", icon: "text-blue-600" },
};

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  suffix?: React.ReactNode;
  tone?: StatTileTone;
  className?: string;
}

/**
 * Compact stat tile used across the Coverage & Finance dashboard. Smaller than
 * the original cards (tighter padding + single-line value) so more numbers fit
 * above the fold.
 */
export function StatTile({ icon: Icon, label, value, suffix, tone = "default", className }: StatTileProps) {
  const styles = TONE_STYLES[tone];
  return (
    <div className={cn("rounded-md p-2.5", styles.box, className)}>
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", styles.icon)} />
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("mt-1 text-lg font-semibold leading-none", styles.value)}>
        {value}
        {suffix && <span className="text-xs font-normal text-muted-foreground"> {suffix}</span>}
      </div>
    </div>
  );
}
