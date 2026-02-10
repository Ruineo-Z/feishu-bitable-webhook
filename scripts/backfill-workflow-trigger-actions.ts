import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildWorkflowTriggerActionsBackfillPlan } from '../src/workflow/scope';
import { WorkflowConfig } from '../src/workflow/types';

config();

interface WorkflowTriggerActionsRow {
  id: string;
  name: string;
  config: WorkflowConfig;
  trigger_actions: string[] | null;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_KEY environment variable');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('workflows')
    .select('id,name,config,trigger_actions')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data || []) as WorkflowTriggerActionsRow[];
  const plan = buildWorkflowTriggerActionsBackfillPlan(rows);

  const applyErrors: Array<{ id: string; message: string }> = [];

  for (const update of plan.updates) {
    const { id, ...payload } = update;
    const { error: updateError } = await supabase
      .from('workflows')
      .update(payload)
      .eq('id', id);

    if (updateError) {
      applyErrors.push({ id, message: updateError.message || String(updateError) });
    }
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const auditDir = join(process.cwd(), 'tmp');
  mkdirSync(auditDir, { recursive: true });
  const auditPath = join(auditDir, `workflow-trigger-actions-backfill-audit-${timestamp}.json`);

  const auditPayload = {
    generatedAt: now.toISOString(),
    totalRows: rows.length,
    updatesPlanned: plan.updates.length,
    updatesSucceeded: plan.updates.length - applyErrors.length,
    updatesFailed: applyErrors.length,
    audit: plan.audit,
    applyErrors,
  };

  writeFileSync(auditPath, JSON.stringify(auditPayload, null, 2), 'utf8');

  console.log('[workflow-trigger-actions-backfill] done');
  console.log(`- totalRows: ${rows.length}`);
  console.log(`- updatesPlanned: ${plan.updates.length}`);
  console.log(`- updatesSucceeded: ${plan.updates.length - applyErrors.length}`);
  console.log(`- updatesFailed: ${applyErrors.length}`);
  console.log(`- backfilled: ${plan.audit.backfilled.length}`);
  console.log(`- wildcard: ${plan.audit.wildcard.length}`);
  console.log(`- anomalies: ${plan.audit.anomalies.length}`);
  console.log(`- auditReport: ${auditPath}`);
}

main().catch((error) => {
  console.error('[workflow-trigger-actions-backfill] failed:', error);
  process.exit(1);
});
