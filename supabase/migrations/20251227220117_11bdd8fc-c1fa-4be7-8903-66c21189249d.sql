-- Add indexes on donors table for common filter and sort columns
-- These will significantly improve query performance for the paginated donors page

-- Index for cycle filtering (most common filter)
CREATE INDEX IF NOT EXISTS idx_donors_cycle ON public.donors(cycle);

-- Index for type filtering
CREATE INDEX IF NOT EXISTS idx_donors_type ON public.donors(type);

-- Index for state filtering
CREATE INDEX IF NOT EXISTS idx_donors_contributor_state ON public.donors(contributor_state);

-- Index for amount sorting/filtering (most common sort)
CREATE INDEX IF NOT EXISTS idx_donors_amount_desc ON public.donors(amount DESC);

-- Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_donors_cycle_amount ON public.donors(cycle, amount DESC);

-- Composite index for cycle + type combination
CREATE INDEX IF NOT EXISTS idx_donors_cycle_type ON public.donors(cycle, type);

-- Index for candidate_id lookups
CREATE INDEX IF NOT EXISTS idx_donors_candidate_id ON public.donors(candidate_id);

-- Index for name searches
CREATE INDEX IF NOT EXISTS idx_donors_name_pattern ON public.donors(name varchar_pattern_ops);