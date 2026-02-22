-- OpenSpec Change: improve-execution-log-sync-reliability
-- Persist workflow identifier on execution logs for query performance

ALTER TABLE public.execution_logs
  ADD COLUMN IF NOT EXISTS workflow_id UUID;

CREATE INDEX IF NOT EXISTS idx_execution_logs_workflow_id
ON public.execution_logs (workflow_id);

COMMENT ON COLUMN public.execution_logs.workflow_id IS 'Workflow identity for workflow-only runtime execution logs';
