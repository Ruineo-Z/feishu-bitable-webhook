## ADDED Requirements

### Requirement: Action Type Registry

The system SHALL maintain a registry of supported action types.

#### Scenario: Register new action type

- **WHEN** a new action type is implemented
- **THEN** the system SHALL register it in the action registry
- **AND** make it available for rule configuration

#### Scenario: Unknown action type

- **WHEN** a rule has an unsupported action type
- **THEN** the system SHALL log an error
- **AND** mark the execution as failed
- **AND** NOT attempt to execute

### Requirement: Send Feishu Message

The system SHALL send Feishu messages to specified recipients.

#### Scenario: Send message to user by open_id

- **WHEN** a rule triggers with action type `send_feishu_message` and receive_id_type is "open_id"
- **THEN** the system SHALL call the Feishu send message API
- **AND** pass the message content
- **AND** return the message ID on success

#### Scenario: Send message to chat

- **WHEN** a rule triggers with action type `send_feishu_message` and receive_id_type is "chat_id"
- **THEN** the system SHALL send the message to the specified chat
- **AND** return the message ID on success

#### Scenario: Message sending fails

- **WHEN** the Feishu send message API returns an error
- **THEN** the system SHALL throw an error with the API response
- **AND** mark the execution as failed

### Requirement: Call External API

The system SHALL call external HTTP APIs.

#### Scenario: Execute HTTP GET request

- **WHEN** a rule triggers with action type `call_api` and method is "GET"
- **THEN** the system SHALL make an HTTP GET request to the specified URL
- **AND** pass headers if configured
- **AND** return the response on success

#### Scenario: Execute HTTP POST request

- **WHEN** a rule triggers with action type `call_api` and method is "POST"
- **THEN** the system SHALL make an HTTP POST request with the specified body
- **AND** set Content-Type header appropriately
- **AND** return the response on success

#### Scenario: API request timeout

- **WHEN** the external API does not respond within the timeout period
- **THEN** the system SHALL abort the request
- **AND** throw a timeout error
- **AND** mark the execution as failed

#### Scenario: API returns error status

- **WHEN** the external API returns a 4xx or 5xx status code
- **THEN** the system SHALL throw an error with the status code
- **AND** mark the execution as failed

### Requirement: Create Record

The system SHALL create new records in Feishu Bitable.

#### Scenario: Create record in bitable

- **WHEN** a rule triggers with action type `create_record`
- **THEN** the system SHALL call the Feishu create record API
- **AND** pass the app_token, table_id, and fields
- **AND** return the created record ID

#### Scenario: Create record with invalid fields

- **WHEN** the specified fields do not exist in the table schema
- **THEN** the system SHALL receive an error from Feishu API
- **AND** mark the execution as failed

### Requirement: Update Record

The system SHALL update existing records in Feishu Bitable.

#### Scenario: Update record fields

- **WHEN** a rule triggers with action type `update_record`
- **THEN** the system SHALL call the Feishu update record API
- **AND** pass the app_token, table_id, record_id, and fields
- **AND** return success on completion

#### Scenario: Update non-existent record

- **WHEN** the specified record_id does not exist
- **THEN** the system SHALL receive a 404 error from Feishu API
- **AND** mark the execution as failed

### Requirement: Delete Record

The system SHALL delete records from Feishu Bitable.

#### Scenario: Delete record

- **WHEN** a rule triggers with action type `delete_record`
- **THEN** the system SHALL call the Feishu delete record API
- **AND** pass the app_token, table_id, and record_id
- **AND** return success on completion

#### Scenario: Delete non-existent record

- **WHEN** the specified record_id does not exist
- **THEN** the system SHALL receive a 404 error from Feishu API
- **AND** mark the execution as failed

### Requirement: Failure Handling

The system SHALL handle action failures according to the rule's on_failure setting.

#### Scenario: Continue on failure

- **WHEN** an action fails and the rule's on_failure is "continue"
- **THEN** the system SHALL log the error
- **AND** mark execution as "failed" in the log
- **AND** NOT throw an exception to the caller

#### Scenario: Stop on failure

- **WHEN** an action fails and the rule's on_failure is "stop"
- **THEN** the system SHALL throw an exception
- **AND** mark execution as "failed" in the log
- **AND** NOT continue with subsequent processing (if multiple actions were possible)
