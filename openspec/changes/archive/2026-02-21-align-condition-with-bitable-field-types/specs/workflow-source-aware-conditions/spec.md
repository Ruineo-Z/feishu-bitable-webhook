## MODIFIED Requirements

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
