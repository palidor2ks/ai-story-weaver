import { cn } from '@/lib/utils';

interface BetaBadgeProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md';
}

/**
 * Small "BETA" pill used near the app logo and other surfaces to signal
 * that the product is still in active development.
 */
export function BetaBadge({ className, size = 'sm' }: BetaBadgeProps) {
  const sizeClasses =
    size === 'xs'
      ? 'text-[9px] px-1.5 py-0.5'
      : size === 'md'
        ? 'text-xs px-2 py-0.5'
        : 'text-[10px] px-1.5 py-0.5';

  return (
    <span
      aria-label="Beta version"
      title="Beta version — features may change"
      className={cn(
        'inline-flex items-center justify-center rounded-full font-bold uppercase tracking-wider',
        'bg-primary/15 text-primary border border-primary/30',
        sizeClasses,
        className
      )}
    >
      Beta
    </span>
  );
}
