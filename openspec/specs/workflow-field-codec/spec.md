# workflow-field-codec Specification

## Purpose
TBD - created by archiving change standardize-feishu-bitable-field-codec. Update Purpose after archive.
## Requirements
### Requirement: Workflow runtime SHALL normalize Feishu field values through a unified codec layer
The system SHALL use a unified field codec abstraction to handle value normalization for workflow event input and bitable action payload output.

#### Scenario: Decode event payload to normalized runtime value
- **WHEN** a bitable record event is parsed for workflow trigger context
- **THEN** the runtime MUST decode field values through codec rules so downstream condition/action logic receives stable normalized values

#### Scenario: Encode write payload by target field type
- **WHEN** a workflow action writes data to a target bitable field
- **THEN** the runtime MUST encode values by target field type before calling Feishu SDK

### Requirement: Workflow bitable actions SHALL apply type-aware write and filter encoding
The system SHALL apply type-aware encoding for create/query/delete action parameters, instead of direct raw value passthrough.

#### Scenario: Encode text-like fields as scalar string
- **WHEN** action payload contains rich-text array value for a text-like target field
- **THEN** the runtime MUST convert it to plain string format required by Feishu API

#### Scenario: Encode user fields with id object list
- **WHEN** action payload targets personnel fields
- **THEN** the runtime MUST encode values to Feishu-compatible user id object list format

#### Scenario: Encode filter values with field-aware strategy
- **WHEN** delete/query actions build filter conditions
- **THEN** the runtime MUST encode filter value shape according to target field type and operator requirements

### Requirement: Field codec failures SHALL be diagnosable at field level
The system SHALL expose structured diagnostics when codec conversion fails.

#### Scenario: Return field-level codec error context
- **WHEN** codec conversion fails during action execution
- **THEN** step result MUST include field identifier, expected value shape, input summary, and standardized codec error code

#### Scenario: Preserve Feishu SDK troubleshooting context
- **WHEN** Feishu SDK returns downstream validation error after codec conversion
- **THEN** execution result MUST retain SDK `code`, `msg`, and `log_id` for troubleshooting

### Requirement: Codec behavior SHALL remain backward compatible by controlled fallback
The system SHALL provide controlled fallback behavior for unsupported field types to avoid accidental global breakage.

#### Scenario: Fallback on unknown field type
- **WHEN** runtime cannot resolve a field type codec
- **THEN** it MUST apply fallback strategy and emit warning telemetry instead of crashing the whole workflow by default

#### Scenario: Keep existing workflow semantics for unaffected types
- **WHEN** existing workflows use already supported scalar fields
- **THEN** codec integration MUST preserve prior successful execution behavior

