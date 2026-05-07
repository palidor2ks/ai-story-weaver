
-- Add scope column to topics table
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'all';

-- Insert 5 new local-only topics
INSERT INTO public.topics (id, name, icon, weight, scope) VALUES
  ('local-education', 'Local Education', '🏫', 1, 'local'),
  ('local-housing', 'Local Housing', '🏠', 1, 'local'),
  ('local-public-health', 'Local Public Health', '🩺', 1, 'local'),
  ('local-cost-of-living', 'Local Cost of Living', '💲', 1, 'local'),
  ('local-public-safety', 'Local Public Safety', '🚔', 1, 'local')
ON CONFLICT (id) DO UPDATE SET scope = 'local', name = EXCLUDED.name, icon = EXCLUDED.icon;
