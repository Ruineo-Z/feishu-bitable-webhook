# workflow-source-aware-conditions Specification

## Purpose
TBD - created by archiving change enhance-workflow-dsl-source-aware-conditions. Update Purpose after archive.
## Requirements
### Requirement: Condition expressions SHALL support explicit snapshot source
The system SHALL allow each condition expression to declare data source as `before` or `after`, MUST default to `after` when not provided, and MUST evaluate the selected snapshot with field-type-aware semantics when field type metadata is available.

#### Scenario: Evaluate expression from before snapshot
- **WHEN** a condition expression sets `source` to `before`
- **THEN** the evaluator MUST read the field value from `trigger.record.beforeFields` for that expression

#### Scenario: Keep backward compatibility with default source
- **WHEN** a condition expression omits `source`
- **THEN** the evaluator MUST use `trigger.record.fields` (`after`) and preserve existing behavior

#### Scenario: Apply type-aware handler on selected source snapshot
- **WHEN** an expression targets a field with known type metadata (for example `number`, `user`, `multi_select`, or `link`)
- **THEN** the evaluator MUST use the matching type handler semantics for the selected snapshot instead of generic text comparison

#### Scenario: Fallback deterministically when type metadata missing
- **WHEN** an expression cannot resolve field type metadata
- **THEN** the evaluator MUST fall back to text handler behavior without throwing runtime error

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
