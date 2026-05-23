import * as React from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface IconActionButtonProps extends Omit<ButtonProps, 'children'> {
  label: string;
  icon: React.ReactNode;
}

/**
 * Compact icon-only action button with a tooltip showing the label.
 * Use across profile/detail headers to reduce visual clutter.
 */
export const IconActionButton = React.forwardRef<HTMLButtonElement, IconActionButtonProps>(
  ({ label, icon, variant = 'outline', size = 'icon', className, ...props }, ref) => {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={ref}
            variant={variant}
            size={size}
            aria-label={label}
            className={cn('h-9 w-9 shrink-0', className)}
            {...props}
          >
            {icon}
            <span className="sr-only">{label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    );
  }
);
IconActionButton.displayName = 'IconActionButton';
