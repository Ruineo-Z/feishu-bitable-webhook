## ADDED Requirements

### Requirement: Condition expressions SHALL support explicit snapshot source
The system SHALL allow each condition expression to declare data source as `before` or `after`, and MUST default to `after` when not provided.

#### Scenario: Evaluate expression from before snapshot
- **WHEN** a condition expression sets `source` to `before`
- **THEN** the evaluator MUST read the field value from `trigger.record.beforeFields` for that expression

#### Scenario: Keep backward compatibility with default source
- **WHEN** a condition expression omits `source`
- **THEN** the evaluator MUST use `trigger.record.fields` (`after`) and preserve existing behavior

### Requirement: Workflow steps SHALL support pre-execution guard conditions
The system SHALL allow steps to define optional `when` guard conditions and MUST skip step execution when guard evaluates to false.

#### Scenario: Execute guarded step when condition passes
- **WHEN** a step defines `when` and the guard evaluates to true
- **THEN** the runtime MUST execute the step normally

#### Scenario: Skip guarded step when condition fails
- **WHEN** a step defines `when` and the guard evaluates to false
- **THEN** the runtime MUST mark the step as skipped and continue with existing transition semantics without treating it as failure

### Requirement: Runtime SHALL enforce explicit unresolved-template handling policy
The system SHALL support unresolved-template policy to control behavior when `${...}` variables cannot be resolved before action encoding.

#### Scenario: Fail on unresolved template under fail policy
- **WHEN** unresolved template variables exist and policy is `fail`
- **THEN** step execution MUST fail with structured diagnostics before calling downstream SDK

#### Scenario: Skip on unresolved template under skip policy
- **WHEN** unresolved template variables exist and policy is `skip`
- **THEN** runtime MUST skip the step and record skip reason without calling downstream SDK
