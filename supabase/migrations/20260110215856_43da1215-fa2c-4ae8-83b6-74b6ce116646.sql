-- Create table to track ingestion progress per Congress
CREATE TABLE IF NOT EXISTS public.bill_ingestion_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congress integer NOT NULL UNIQUE,
  last_offset integer DEFAULT 0,
  total_fetched integer DEFAULT 0,
  total_inserted integer DEFAULT 0,
  total_filtered integer DEFAULT 0,
  total_available integer,
  status text DEFAULT 'pending', -- 'pending', 'in_progress', 'complete', 'failed'
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bill_ingestion_status ENABLE ROW LEVEL SECURITY;

-- Allow admins to read/write
CREATE POLICY "Admins can manage bill ingestion status"
ON public.bill_ingestion_status
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow service role full access (for edge functions)
CREATE POLICY "Service role has full access to bill ingestion status"
ON public.bill_ingestion_status
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Add index on congress for fast lookups
CREATE INDEX idx_bill_ingestion_status_congress ON public.bill_ingestion_status(congress);

-- Add trigger for updated_at
CREATE TRIGGER update_bill_ingestion_status_updated_at
BEFORE UPDATE ON public.bill_ingestion_status
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();