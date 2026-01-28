## ADDED Requirements

### Requirement: Bitable Connection Configuration

The system SHALL store and manage multiple Feishu Bitable connections in Supabase.

#### Scenario: Create bitable connection

- **WHEN** a new bitable connection is created with app_token and optional table_ids
- **THEN** the system SHALL save the connection to the `bitables` table in Supabase
- **AND** return the created connection with generated UUID

#### Scenario: List all connections

- **WHEN** a request is made to list all bitable connections
- **THEN** the system SHALL return all connections from the `bitables` table
- **AND** include app_token, name, table_ids, and timestamps

#### Scenario: Update connection

- **WHEN** a connection's configuration needs to be updated
- **THEN** the system SHALL update the corresponding row in the `bitables` table
- **AND** preserve the original app_token and id

#### Scenario: Delete connection

- **WHEN** a connection is no longer needed
- **THEN** the system SHALL delete the connection from the `bitables` table
- **AND** cascade delete associated rules (or handle via foreign key constraint)

### Requirement: Table Filter Configuration

The system SHALL support optional table-level filtering for each bitable connection.

#### Scenario: Monitor all tables

- **WHEN** a bitable connection is created with empty table_ids array
- **THEN** the system SHALL interpret this as "monitor all tables"
- **AND** match events from any table in that bitable

#### Scenario: Monitor specific tables

- **WHEN** a bitable connection is created with specific table_ids
- **THEN** the system SHALL only match events from those specified tables
- **AND** ignore events from tables not in the list

### Requirement: Connection Validation

The system SHALL validate bitable connections before adding them.

#### Scenario: Validate app_token format

- **WHEN** a bitable connection is submitted
- **THEN** the system SHALL validate the app_token format
- **AND** reject invalid formats with an error

#### Scenario: Check duplicate app_token

- **WHEN** a bitable connection is submitted with an existing app_token
- **THEN** the system SHALL reject the duplicate
- **AND** return an error indicating the app_token already exists
