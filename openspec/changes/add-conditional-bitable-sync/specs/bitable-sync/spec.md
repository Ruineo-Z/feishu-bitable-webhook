## ADDED Requirements

### Requirement: Field Change Monitoring
The system SHALL monitor specified fields in source Bitable table for changes.

#### Scenario: Monitored field changes
- **WHEN** a record in the source table is modified
- **THEN** the system SHALL detect changes to configured monitored fields

### Requirement: Exact Match Condition
The system SHALL support exact value matching for field conditions.

#### Scenario: Status field equals specific value
- **WHEN** monitored field "status" changes and new value equals "completed"
- **THEN** the exact match condition is satisfied

### Requirement: Numeric Comparison Condition
The system SHALL support numeric comparison operators (>, <, >=, <=, ==, !=) for field conditions.

#### Scenario: Amount field greater than threshold
- **WHEN** monitored field "amount" changes and value is greater than 1000
- **THEN** the numeric comparison condition is satisfied

#### Scenario: Quantity field less than or equal
- **WHEN** monitored field "quantity" changes and value is less than or equal to 5
- **THEN** the numeric comparison condition is satisfied

### Requirement: Multi-Condition Evaluation
The system SHALL evaluate multiple conditions with AND logic.

#### Scenario: All conditions must be met
- **WHEN** multiple conditions are configured AND all conditions are satisfied
- **THEN** the record sync SHALL be triggered

#### Scenario: Not all conditions met
- **WHEN** multiple conditions are configured but at least one is not satisfied
- **THEN** the record sync SHALL NOT be triggered

### Requirement: Target Table Record Creation
The system SHALL create a new record in the target table when all conditions are met.

#### Scenario: Create record in target table
- **WHEN** all field conditions are satisfied after a change event
- **THEN** the system SHALL create a new record in the configured target table with appropriate field mapping

#### Scenario: Create record with mapped fields
- **WHEN** record creation is triggered
- **THEN** the system SHALL map source record fields to target table fields according to configured mapping
