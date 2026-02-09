-- OpenSpec Change: optimize-workflow-scope-routing
-- Add explicit workflow scope fields and indexed routing path

ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS scope_type TEXT,
  ADD COLUMN IF NOT EXISTS app_token TEXT,
  ADD COLUMN IF NOT EXISTS table_id TEXT;

-- Backfill existing rows:
-- table scope when legacy trigger includes both app_token and table_id; otherwise global
UPDATE public.workflows
SET
  scope_type = CASE
    WHEN COALESCE(config->'trigger'->'config'->>'app_token', '') <> ''
     AND COALESCE(config->'trigger'->'config'->>'table_id', '') <> '' THEN 'table'
    ELSE 'global'
  END,
  app_token = CASE
    WHEN COALESCE(config->'trigger'->'config'->>'app_token', '') <> ''
     AND COALESCE(config->'trigger'->'config'->>'table_id', '') <> ''
      THEN config->'trigger'->'config'->>'app_token'
    ELSE NULL
  END,
  table_id = CASE
    WHEN COALESCE(config->'trigger'->'config'->>'app_token', '') <> ''
     AND COALESCE(config->'trigger'->'config'->>'table_id', '') <> ''
      THEN config->'trigger'->'config'->>'table_id'
    ELSE NULL
  END
WHERE scope_type IS NULL;

ALTER TABLE public.workflows
  ALTER COLUMN scope_type SET DEFAULT 'table';

-- Scope enum constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workflows_scope_type_check'
  ) THEN
    ALTER TABLE public.workflows
      ADD CONSTRAINT workflows_scope_type_check
      CHECK (scope_type IN ('table', 'global'));
  END IF;
END $$;

-- Scope binding consistency constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workflows_scope_binding_check'
  ) THEN
    ALTER TABLE public.workflows
      ADD CONSTRAINT workflows_scope_binding_check
      CHECK (
        (scope_type = 'table' AND app_token IS NOT NULL AND table_id IS NOT NULL)
        OR
        (scope_type = 'global' AND app_token IS NULL AND table_id IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workflows_scope_route_active
ON public.workflows (scope_type, app_token, table_id)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_workflows_scope_global_active
ON public.workflows (scope_type)
WHERE is_active = true AND scope_type = 'global';
