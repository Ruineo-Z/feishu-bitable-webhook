## ADDED Requirements

### Requirement: Workflow DSL SHALL support explicit branching control flow
The system SHALL allow workflow nodes to declare directed transitions so that condition results can branch to different downstream nodes.

#### Scenario: Condition true/false branch
- **WHEN** a condition node defines both `onTrue` and `onFalse`
- **THEN** the runtime MUST execute the node referenced by `onTrue` when condition passes and the node referenced by `onFalse` when condition fails

#### Scenario: Action next transition
- **WHEN** a non-condition node defines `next`
- **THEN** the runtime MUST continue execution to the referenced node after the current node succeeds

### Requirement: Workflow graph definition SHALL be validated as DAG before execution
The system SHALL validate branching workflow definitions for node integrity and acyclic structure.

#### Scenario: Reject unknown target node
- **WHEN** a node transition points to a non-existent node id
- **THEN** the system MUST reject workflow create/update request with a validation error

#### Scenario: Reject cyclic workflow graph
- **WHEN** transitions form a cycle in the workflow graph
- **THEN** the system MUST reject workflow create/update request and report cycle validation failure

### Requirement: Branching runtime SHALL preserve backward compatibility for linear workflows
The system SHALL continue to execute legacy linear workflows without requiring branching fields.

#### Scenario: Execute legacy linear steps
- **WHEN** workflow steps do not define `onTrue` / `onFalse` / `next`
- **THEN** the runtime MUST execute steps in original array order with existing failure-stop semantics

#### Scenario: Mixed linear and branching workflow
- **WHEN** a workflow contains both legacy linear nodes and branching nodes
- **THEN** the runtime MUST execute deterministically without requiring full graph migration for all nodes

### Requirement: Workflow execution logs SHALL record branch decisions
The system SHALL include branch decision context in workflow execution logs for diagnosability.

#### Scenario: Record selected branch path
- **WHEN** a condition node is evaluated
- **THEN** the execution log MUST record condition result and selected downstream node id

#### Scenario: Mark non-selected branch nodes as skipped
- **WHEN** a branch path is not selected
- **THEN** the execution log MUST expose non-selected nodes as skipped or non-executed in step-level result context
