-- Enforce table-only workflow scope model

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.workflows
    WHERE scope_type IS DISTINCT FROM 'table'
      OR app_token IS NULL
      OR table_id IS NULL
  ) THEN
    RAISE EXCEPTION 'workflows table contains non-table scope rows or missing table binding, please clean up before applying table-only migration';
  END IF;
END $$;

ALTER TABLE public.workflows
  ALTER COLUMN scope_type SET DEFAULT 'table',
  ALTER COLUMN scope_type SET NOT NULL,
  ALTER COLUMN app_token SET NOT NULL,
  ALTER COLUMN table_id SET NOT NULL;

ALTER TABLE public.workflows
  DROP CONSTRAINT IF EXISTS workflows_scope_type_check,
  DROP CONSTRAINT IF EXISTS workflows_scope_binding_check;

ALTER TABLE public.workflows
  ADD CONSTRAINT workflows_scope_type_check
  CHECK (scope_type = 'table');

ALTER TABLE public.workflows
  ADD CONSTRAINT workflows_scope_binding_check
  CHECK (scope_type = 'table' AND app_token IS NOT NULL AND table_id IS NOT NULL);

DROP INDEX IF EXISTS idx_workflows_scope_global_active;
