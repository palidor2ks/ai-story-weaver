-- Enable RLS on topic_legacy_mapping (read-only reference table)
ALTER TABLE topic_legacy_mapping ENABLE ROW LEVEL SECURITY;

-- Allow public read access (this is a reference mapping table)
CREATE POLICY "Anyone can read topic mappings" ON topic_legacy_mapping
  FOR SELECT USING (true);