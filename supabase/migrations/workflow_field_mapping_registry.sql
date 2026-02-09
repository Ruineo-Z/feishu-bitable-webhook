-- OpenSpec Change: migrate-to-workflow-only-with-field-mapping
-- Create dedicated field mapping registry for workflow runtime

CREATE TABLE IF NOT EXISTS public.bitable_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_token TEXT NOT NULL,
  table_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bitable_field_mappings_unique_field_identity'
  ) THEN
    ALTER TABLE public.bitable_field_mappings
      ADD CONSTRAINT bitable_field_mappings_unique_field_identity
      UNIQUE (app_token, table_id, field_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bitable_field_mappings_table_scope
ON public.bitable_field_mappings (app_token, table_id);

CREATE INDEX IF NOT EXISTS idx_bitable_field_mappings_name_lookup
ON public.bitable_field_mappings (app_token, table_id, field_name);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'update_bitable_field_mappings_updated_at'
    ) THEN
      CREATE TRIGGER update_bitable_field_mappings_updated_at
        BEFORE UPDATE ON public.bitable_field_mappings
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
  END IF;
END $$;

ALTER TABLE public.bitable_field_mappings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bitable_field_mappings TO anon;
GRANT ALL ON public.bitable_field_mappings TO service_role;
