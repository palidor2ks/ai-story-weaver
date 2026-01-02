-- Create question_update_notifications table
CREATE TABLE public.question_update_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id text NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('user', 'candidate', 'party')),
  entity_id text NOT NULL,
  old_question_text text NOT NULL,
  new_question_text text NOT NULL,
  created_at timestamptz DEFAULT now(),
  dismissed_at timestamptz,
  updated_answer_at timestamptz,
  is_read boolean DEFAULT false
);

-- Enable RLS
ALTER TABLE public.question_update_notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications (entity_type = 'user' and entity_id matches their uid)
CREATE POLICY "Users can view their own notifications"
  ON public.question_update_notifications FOR SELECT
  USING (entity_type = 'user' AND entity_id = auth.uid()::text);

-- Users can update their own notifications (dismiss, mark as read, etc.)
CREATE POLICY "Users can update their own notifications"
  ON public.question_update_notifications FOR UPDATE
  USING (entity_type = 'user' AND entity_id = auth.uid()::text);

-- Politicians can view notifications for their claimed candidate
CREATE POLICY "Politicians can view their candidate notifications"
  ON public.question_update_notifications FOR SELECT
  USING (
    entity_type = 'candidate' AND 
    EXISTS (
      SELECT 1 FROM candidates c 
      WHERE c.id = question_update_notifications.entity_id 
      AND c.claimed_by_user_id = auth.uid()
    )
  );

-- Politicians can update notifications for their claimed candidate
CREATE POLICY "Politicians can update their candidate notifications"
  ON public.question_update_notifications FOR UPDATE
  USING (
    entity_type = 'candidate' AND 
    EXISTS (
      SELECT 1 FROM candidates c 
      WHERE c.id = question_update_notifications.entity_id 
      AND c.claimed_by_user_id = auth.uid()
    )
  );

-- Admins can manage all notifications
CREATE POLICY "Admins can manage all notifications"
  ON public.question_update_notifications FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can manage all notifications (for insert during update)
CREATE POLICY "Service role can manage notifications"
  ON public.question_update_notifications FOR ALL
  USING (auth.role() = 'service_role');

-- Create index for efficient queries
CREATE INDEX idx_question_notifications_entity ON public.question_update_notifications(entity_type, entity_id);
CREATE INDEX idx_question_notifications_question ON public.question_update_notifications(question_id);
CREATE INDEX idx_question_notifications_pending ON public.question_update_notifications(entity_type, entity_id) 
  WHERE dismissed_at IS NULL AND updated_answer_at IS NULL;