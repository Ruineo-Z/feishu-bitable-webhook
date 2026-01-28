-- OpenSpec Change: add-supabase-backed-automation
-- Database Migration Script
-- Run this in Supabase SQL Editor

-- ============================================
-- Create bitables table
-- ============================================
CREATE TABLE IF NOT EXISTS public.bitables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_token TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  table_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Create rules table
-- ============================================
CREATE TABLE IF NOT EXISTS public.rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  bitable_id UUID REFERENCES public.bitables(id) ON DELETE CASCADE,
  trigger JSONB NOT NULL,
  action JSONB NOT NULL,
  on_failure TEXT NOT NULL DEFAULT 'continue' CHECK (on_failure IN ('continue', 'stop')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Create execution_logs table
-- ============================================
CREATE TABLE IF NOT EXISTS public.execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES public.rules(id) ON DELETE SET NULL,
  rule_name TEXT,
  trigger_action TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operator_openid TEXT,
  record_snapshot JSONB,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
  error_message TEXT,
  duration_ms INTEGER,
  response JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Create indexes for better query performance
-- ============================================

-- Index for rules lookup by app_token
CREATE INDEX IF NOT EXISTS idx_rules_app_token
ON public.rules ((trigger->>'app_token'));

-- Index for rules by enabled status
CREATE INDEX IF NOT EXISTS idx_rules_enabled
ON public.rules (enabled) WHERE enabled = true;

-- Index for execution_logs by rule_id
CREATE INDEX IF NOT EXISTS idx_execution_logs_rule_id
ON public.execution_logs (rule_id);

-- Index for execution_logs by created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_execution_logs_created_at
ON public.execution_logs (created_at DESC);

-- Index for execution_logs by status
CREATE INDEX IF NOT EXISTS idx_execution_logs_status
ON public.execution_logs (status);

-- ============================================
-- Create function to update updated_at timestamp
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================
-- Create triggers for updated_at
-- ============================================

DROP TRIGGER IF EXISTS update_bitables_updated_at ON public.bitables;
CREATE TRIGGER update_bitables_updated_at
  BEFORE UPDATE ON public.bitables
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rules_updated_at ON public.rules;
CREATE TRIGGER update_rules_updated_at
  BEFORE UPDATE ON public.rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Enable Row Level Security (optional, for future multi-tenant)
-- ============================================

ALTER TABLE public.bitables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Grant permissions (adjust as needed for your use case)
-- ============================================

-- Grant select, insert, update, delete permissions
-- For anon role (public access):
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bitables TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.execution_logs TO anon;

-- For service role (bypass RLS):
GRANT ALL ON public.bitables TO service_role;
GRANT ALL ON public.rules TO service_role;
GRANT ALL ON public.execution_logs TO service_role;

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON TABLE public.bitables IS 'Feishu Bitable connection configurations';
COMMENT ON TABLE public.rules IS 'Automation rules for Bitable events';
COMMENT ON TABLE public.execution_logs IS 'Execution logs for automation rules';

COMMENT ON COLUMN public.bitables.app_token IS 'Feishu Bitable App Token';
COMMENT ON COLUMN public.bitables.table_ids IS 'List of table IDs to monitor (empty = monitor all)';
COMMENT ON COLUMN public.rules.trigger IS 'JSON object containing trigger conditions (app_token, table_id, actions, condition)';
COMMENT ON COLUMN public.rules.action IS 'JSON object containing action configuration (type, params)';
COMMENT ON COLUMN public.execution_logs.status IS 'Execution status: success, failed, or partial';
COMMENT ON COLUMN public.execution_logs.record_snapshot IS 'Snapshot of the record at trigger time';

-- ============================================
-- Verify tables were created
-- ============================================

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('bitables', 'rules', 'execution_logs')
ORDER BY table_name;
