-- Add structured event routing field for workflow scope routing

ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS trigger_actions TEXT[];

ALTER TABLE public.workflows
  DROP CONSTRAINT IF EXISTS workflows_trigger_actions_check;

ALTER TABLE public.workflows
  ADD CONSTRAINT workflows_trigger_actions_check
  CHECK (
    trigger_actions IS NULL
    OR trigger_actions <@ ARRAY['record_created', 'record_updated', 'record_deleted']::text[]
  );

CREATE INDEX IF NOT EXISTS idx_workflows_trigger_actions_active
ON public.workflows
USING GIN (trigger_actions)
WHERE is_active = true;
