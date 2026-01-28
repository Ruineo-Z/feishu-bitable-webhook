# Change: Add Conditional Bitable Record Sync

## Why
Currently the service only logs Bitable record changes. There's a need to automatically sync records to another table when specific field conditions are met, enabling automated workflows based on data changes.

## What Changes
- Add field-level change monitoring with configurable conditions
- Support both exact match and numeric comparison conditions
- Create records in target table when all conditions are satisfied
- Hardcode source/target configuration for initial implementation

## Impact
- Affected code: `src/lark.ts` (event handling), new sync module
- New dependency: None
- Breaking changes: None
