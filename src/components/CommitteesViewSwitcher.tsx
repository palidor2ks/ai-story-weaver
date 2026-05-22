import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * Segmented control that switches between the two committee views:
 * - /committees   → ranked by receipts (money raised)
 * - /top-spenders → ranked by independent expenditures (money spent supporting/opposing candidates)
 */
export const CommitteesViewSwitcher = () => {
  const { pathname } = useLocation();
  const isCommittees = pathname.startsWith('/committees');
  const isSpenders = pathname.startsWith('/top-spenders');

  return (
    <div className="inline-flex items-center rounded-md border border-border bg-muted/30 p-1 text-sm">
      <Link
        to="/committees"
        className={cn(
          'px-3 py-1.5 rounded-sm transition-colors',
          isCommittees ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        By receipts
      </Link>
      <Link
        to="/top-spenders"
        className={cn(
          'px-3 py-1.5 rounded-sm transition-colors',
          isSpenders ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        By outside spending
      </Link>
    </div>
  );
};
