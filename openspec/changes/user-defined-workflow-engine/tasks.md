# Implementation Tasks

## Phase 1: Core Engine & DSL (Foundation)

- [ ] **Define DSL Interfaces**
  - Create `src/workflow/types.ts` defining `WorkflowConfig`, `WorkflowStep`, `WorkflowContext`.
  - Create `src/workflow/dsl/schema.ts` with Zod validation schemas.
- [ ] **Implement Context Manager**
  - Create `src/workflow/core/context.ts` to handle variable storage and `${}` substitution logic.
  - Add unit tests for variable substitution (e.g., nested object access).
- [ ] **Implement Plugin Registry**
  - Create `src/workflow/core/registry.ts` to manage plugin registration.
  - Define `IWorkflowPlugin` interface.
- [ ] **Implement Workflow Engine**
  - Create `src/workflow/core/engine.ts`.
  - Implement `executeWorkflow(config, context)` method.
  - Implement step iteration and error handling logic.

## Phase 2: Standard Plugins (Capabilities)

- [ ] **Implement Condition Plugin**
  - Create `src/workflow/plugins/condition.ts`.
  - Implement basic logic (equals, not equals, contains) using `condition-evaluator.ts` logic if reusable.
- [ ] **Implement Feishu Message Action**
  - Create `src/workflow/plugins/feishu-message.ts`.
  - Port logic from `src/actions/send-feishu-message.ts` to implement `IWorkflowPlugin`.
- [ ] **Implement Bitable Update Action**
  - Create `src/workflow/plugins/bitable-update.ts`.
  - Port logic from `src/actions/update-record.ts`.

## Phase 3: Integration & Persistence

- [ ] **Database Setup**
  - Create Supabase migration for `workflows` table.
  - Create `src/db/workflows.ts` for database operations.
- [ ] **Workflow Loader**
  - Implement `loadActiveWorkflows()` to fetch configs from DB.
- [ ] **Event Listener Integration**
  - Modify `src/lark.ts`: Inside `processEvent`, add a hook to trigger the Workflow Engine.
  - Ensure `RawEvent` is correctly mapped to `TriggerContext`.
- [ ] **Verification**
  - Add integration test: Mock a Feishu event -> Engine runs -> Action executes.
