## ADDED Requirements

### Requirement: Node-centric builder SHALL provide a three-pane workflow authoring layout
The system SHALL provide a workflow authoring layout with workflow list sidebar, central node canvas, and contextual node inspector panel that only appears when a node is selected.

#### Scenario: Render default layout without selected node
- **WHEN** the user opens the workflow editor and no node is selected
- **THEN** the system MUST show workflow list sidebar and central canvas, and MUST NOT render the right inspector panel

#### Scenario: Show inspector after node selection
- **WHEN** the user selects a node on the canvas
- **THEN** the system MUST open the right inspector panel and render configuration UI for the selected node type

#### Scenario: Hide inspector after deselection
- **WHEN** the user clears selection from the canvas
- **THEN** the system MUST hide the right inspector panel and keep the canvas in editable state

### Requirement: Node-centric builder SHALL provide add-node catalog with explicit node categories
The system SHALL provide a node catalog entry from `+` action and MUST let users add supported node types from categorized options.

#### Scenario: Open node catalog from plus action
- **WHEN** the user clicks `+` in the editor
- **THEN** the system MUST display an add-node panel listing supported node categories and node types

#### Scenario: Insert node from selected type
- **WHEN** the user chooses a node type from the add-node panel
- **THEN** the system MUST insert the node into the workflow graph with default configuration for that node type

### Requirement: Node-centric builder SHALL render node-type-specific configuration schema
The system SHALL render different configuration forms by node type and MUST enforce field-level validation before save.

#### Scenario: Configure condition node with branch semantics
- **WHEN** the user configures a condition node
- **THEN** the system MUST provide controls for branch behavior and MUST persist true/false branch targets in the workflow model

#### Scenario: Configure action node with typed fields
- **WHEN** the user configures an action node (such as create/query/delete)
- **THEN** the system MUST render action-specific fields and MUST validate required inputs before allowing submit

### Requirement: Node-centric builder SHALL generate API-compatible workflow payload
The system SHALL convert node graph and node configurations to backend-compatible workflow payload without requiring raw JSON editing.

#### Scenario: Save workflow from node editor
- **WHEN** the user submits a workflow configured through node editor
- **THEN** the system MUST generate a valid workflow payload and call existing workflow create/update API successfully
