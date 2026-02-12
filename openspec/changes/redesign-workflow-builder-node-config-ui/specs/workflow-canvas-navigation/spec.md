## ADDED Requirements

### Requirement: Workflow canvas SHALL support drag, pan, and zoom navigation
The system SHALL provide viewport navigation capabilities so users can operate complex workflows efficiently.

#### Scenario: Drag node to update position
- **WHEN** the user drags a node on the canvas
- **THEN** the system MUST update node position and reflect the latest position in the in-memory workflow graph

#### Scenario: Pan canvas in blank area
- **WHEN** the user drags on blank canvas area
- **THEN** the system MUST move the viewport without changing node data

#### Scenario: Zoom canvas in or out
- **WHEN** the user triggers zoom action from wheel or zoom controls
- **THEN** the system MUST update canvas scale within configured min/max bounds

### Requirement: Workflow canvas SHALL render branch edges as bezier curves
The system SHALL render node edges using bezier curves and MUST provide clear visual distinction for conditional branches.

#### Scenario: Render normal edge as bezier
- **WHEN** two non-conditional nodes are connected
- **THEN** the system MUST render their edge with a bezier curve path

#### Scenario: Render condition edges with branch labels
- **WHEN** a condition node has true/false outgoing branches
- **THEN** the system MUST render both edges as bezier curves and MUST show branch labels to distinguish paths

### Requirement: Workflow canvas SHALL keep interaction state coherent during editing
The system SHALL preserve essential interaction state to avoid disorientation during frequent node operations.

#### Scenario: Keep viewport after node config edit
- **WHEN** the user edits selected node configuration in inspector panel
- **THEN** the system MUST keep current canvas viewport (position and zoom) unchanged

#### Scenario: Keep selection after non-destructive updates
- **WHEN** the user performs non-destructive operations such as renaming node or changing node parameters
- **THEN** the system MUST keep the current node selected until user explicitly changes selection
