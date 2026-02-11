## MODIFIED Requirements

### Requirement: Workflow DSL SHALL support explicit branching control flow
The system SHALL allow workflow nodes to declare directed transitions so that condition results can branch to different downstream nodes, and SHALL allow nodes to declare optional `when` guards for conditional execution.

#### Scenario: Condition true/false branch
- **WHEN** a condition node defines both `onTrue` and `onFalse`
- **THEN** the runtime MUST execute the node referenced by `onTrue` when condition passes and the node referenced by `onFalse` when condition fails

#### Scenario: Action next transition
- **WHEN** a non-condition node defines `next`
- **THEN** the runtime MUST continue execution to the referenced node after the current node succeeds

#### Scenario: Guarded node is skipped
- **WHEN** any node defines `when` and its guard evaluates to false
- **THEN** the runtime MUST skip plugin execution for that node and continue using existing transition behavior

### Requirement: Workflow execution logs SHALL record branch decisions
The system SHALL include branch decision and skip decision context in workflow execution logs for diagnosability.

#### Scenario: Record selected branch path
- **WHEN** a condition node is evaluated
- **THEN** the execution log MUST record condition result and selected downstream node id

#### Scenario: Mark non-selected branch nodes as skipped
- **WHEN** a branch path is not selected
- **THEN** the execution log MUST expose non-selected nodes as skipped or non-executed in step-level result context

#### Scenario: Record guard-based skip reason
- **WHEN** a node is skipped by `when` guard or unresolved-template `skip` policy
- **THEN** the execution log MUST include machine-readable skip reason and effective policy/source context
