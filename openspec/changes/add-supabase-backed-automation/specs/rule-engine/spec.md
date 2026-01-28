## ADDED Requirements

### Requirement: Rule Storage

The system SHALL store automation rules in the `rules` table in Supabase.

#### Scenario: Create a new rule

- **WHEN** a new rule is created with trigger conditions and action configuration
- **THEN** the system SHALL save the rule to the `rules` table in Supabase
- **AND** generate a unique UUID for the rule
- **AND** set `enabled` to true by default

#### Scenario: Retrieve enabled rules for a bitable

- **WHEN** an event is received from a bitable
- **THEN** the system SHALL query the `rules` table for enabled rules matching the app_token
- **AND** return rules ordered by creation time

#### Scenario: Disable a rule

- **WHEN** a rule needs to be temporarily disabled
- **THEN** the system SHALL update the `enabled` field to false
- **AND** the rule SHALL NOT be matched during event processing

#### Scenario: Delete a rule

- **WHEN** a rule is no longer needed
- **THEN** the system SHALL delete the rule from the `rules` table
- **AND** execution logs referencing this rule remain (cascade not applied)

### Requirement: Event Routing

The system SHALL route incoming events to matching rules based on app_token and table_id.

#### Scenario: Route event to bitable-specific rules

- **WHEN** a bitable_record_changed event is received
- **THEN** the system SHALL extract app_token and table_id from the event
- **AND** find all enabled rules with matching app_token
- **AND** filter rules where table_id matches or table_ids is empty (monitor all)

#### Scenario: No matching rules

- **WHEN** no rules match the incoming event
- **THEN** the system SHALL log the event without triggering any action
- **AND** continue processing (no error)

### Requirement: Condition Evaluation

The system SHALL evaluate complex condition expressions against the event data.

#### Scenario: Simple equality condition

- **WHEN** a rule has a condition with single expression
- **THEN** the system SHALL evaluate the expression against the record fields
- **AND** return true if the condition is satisfied

#### Scenario: AND logic evaluation

- **WHEN** a rule has a condition with AND logic and multiple expressions
- **THEN** the system SHALL evaluate all expressions
- **AND** return true only if ALL expressions return true

#### Scenario: OR logic evaluation

- **WHEN** a rule has a condition with OR logic and multiple expressions
- **THEN** the system SHALL evaluate all expressions
- **AND** return true if ANY expression returns true

#### Scenario: Field value comparison

- **WHEN** evaluating a condition with comparison operator
- **THEN** the system SHALL extract the field value from the record
- **AND** compare using the specified operator
- **AND** handle type conversion (string to number for numeric comparisons)

#### Scenario: String contains operator

- **WHEN** a condition uses the "contains" operator
- **THEN** the system SHALL check if the field value contains the specified string
- **AND** be case-insensitive for consistency

#### Scenario: Array contains operator

- **WHEN** a condition uses the "contains" operator on an array field
- **THEN** the system SHALL check if the array contains the specified value

### Requirement: Action Triggering

The system SHALL trigger the rule's action when all conditions are satisfied.

#### Scenario: All conditions met

- **WHEN** all trigger conditions are met (action type + condition evaluation)
- **THEN** the system SHALL execute the rule's action
- **AND** pass the event data and record to the action executor

#### Scenario: Action type not matched

- **WHEN** the event action type (record_added/edited/deleted) is not in the rule's allowed actions
- **THEN** the system SHALL skip this rule
- **AND** continue to check next rule

#### Scenario: Condition not met

- **WHEN** the condition evaluation returns false
- **THEN** the system SHALL skip this rule
- **AND** continue to check next rule
