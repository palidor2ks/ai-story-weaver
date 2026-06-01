import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Mount once in the app root. Polls pending_badge_notifications every 8s
 * for the current user, shows a celebratory toast for each, and deletes
 * them after display.
 */
export function BadgeAwardToast() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!userId) return;
    seen.current = new Set<string>();

    const poll = async () => {
      const { data, error } = await supabase
        .from('pending_badge_notifications' as never)
        .select('id,badge_slug')
        .eq('user_id', userId);
      if (error || !data) return;
      const rows = data as unknown as Array<{ id: string; badge_slug: string }>;
      if (rows.length === 0) return;

      // Lookup names from catalog cache
      const { data: defs } = await supabase
        .from('badge_definitions' as never)
        .select('slug,name,icon,description')
        .in('slug', rows.map(r => r.badge_slug));
      const defMap = new Map<string, { name: string; icon: string | null; description: string }>(
        ((defs ?? []) as unknown as Array<{ slug: string; name: string; icon: string | null; description: string }>)
          .map(d => [d.slug, d])
      );

      const toDelete: string[] = [];
      for (const row of rows) {
        if (seen.current.has(row.id)) continue;
        seen.current.add(row.id);
        const def = defMap.get(row.badge_slug);
        toast.success(`${def?.icon ?? '🏅'} Badge unlocked: ${def?.name ?? row.badge_slug}`, {
          description: def?.description,
          duration: 6000,
        });
        toDelete.push(row.id);
      }
      if (toDelete.length > 0) {
        await supabase.from('pending_badge_notifications' as never).delete().in('id', toDelete);
        queryClient.invalidateQueries({ queryKey: ['user_badges', userId] });
      }
    };

    poll();
    const id = setInterval(poll, 8000);
    return () => clearInterval(id);
  }, [userId, queryClient]);

  return null;
}
