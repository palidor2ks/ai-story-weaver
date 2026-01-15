-- Create unique index on bill_summary_stats materialized view
-- Required for REFRESH MATERIALIZED VIEW CONCURRENTLY to work
CREATE UNIQUE INDEX IF NOT EXISTS bill_summary_stats_id_idx 
ON bill_summary_stats (id);