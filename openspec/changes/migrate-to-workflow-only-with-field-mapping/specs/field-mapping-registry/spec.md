## ADDED Requirements

### Requirement: Field mapping registry SHALL provide stable field identity mapping
The system SHALL persist a mapping between `field_id` and field name keyed by `app_token` and `table_id`.

#### Scenario: Upsert mapping by field identity
- **WHEN** mapping data for a field is refreshed or updated
- **THEN** the system MUST upsert by unique key (`app_token`, `table_id`, `field_id`) and store latest field name

#### Scenario: Query mapping by table scope
- **WHEN** runtime requests mappings for a specific `app_token` and `table_id`
- **THEN** the system MUST return mappings for that table scope only

### Requirement: Registry SHALL support event-driven incremental synchronization
The system SHALL update field mappings when Feishu field-change events are received.

#### Scenario: Add or rename field
- **WHEN** a field add/edit event includes `field_id` and new field name
- **THEN** the registry MUST create or update the corresponding mapping entry

#### Scenario: Delete field
- **WHEN** a field delete event is received
- **THEN** the registry MUST remove the corresponding mapping entry or mark it unavailable for runtime reads

### Requirement: Registry SHALL expose full refresh capability per table
The system SHALL provide an API-driven refresh mechanism that rebuilds mappings by calling Feishu field metadata API.

#### Scenario: Refresh mappings by app and table
- **WHEN** an operator triggers mapping refresh for a target `app_token` and `table_id`
- **THEN** the system MUST pull current field list from Feishu and persist the full mapping snapshot

#### Scenario: Report refresh result
- **WHEN** refresh finishes
- **THEN** the system MUST return refreshed field count and failure reason on error

### Requirement: Runtime action parameter resolution SHALL consume registry mappings
The runtime SHALL use mapping registry to transform event field identity references into action-usable field keys.

#### Scenario: Resolve event field references for action execution
- **WHEN** an action references fields derived from event payload
- **THEN** the runtime MUST resolve through registry mapping before sending write/search payloads to Feishu

#### Scenario: Handle mapping misses safely
- **WHEN** required field mapping is missing
- **THEN** the runtime MUST return explicit error context and MUST NOT silently write incorrect fields
