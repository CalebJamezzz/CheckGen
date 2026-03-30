-- Add status column to checklist_sessions
-- Values: 'in_progress' | 'complete' | 'abandoned'
-- Defaults to 'in_progress' for all existing rows

ALTER TABLE checklist_sessions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'in_progress';

-- Optional: index for efficient resume panel queries
CREATE INDEX IF NOT EXISTS idx_checklist_sessions_status
  ON checklist_sessions (user_id, status, updated_at DESC);
