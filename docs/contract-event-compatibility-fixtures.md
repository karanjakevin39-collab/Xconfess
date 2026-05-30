# Contract Event Compatibility Fixture Documentation

## Overview
Contract event fixtures are essential for verifying that the Soroban contract events can be successfully parsed and processed by downstream consumers, such as the backend services.

## Fixture Maintenance Guide

### Where Event Fixtures Originate
Fixtures are generated directly from the Soroban contract test suites. During testing, specific contract invocations emit events, which are captured and serialized into JSON or binary formats depending on the test requirements.

### How Fixture Snapshots are Generated
When a contract is modified to change its event schema, the fixtures must be regenerated to reflect these changes. This is typically done by running the contract test suite with an environment variable flag to overwrite existing snapshots.

```bash
# Example: updating snapshots
UPDATE_SNAPSHOTS=1 cargo test --workspace
```

### How Backend Compatibility Tests Consume Fixtures
The backend services (`xconfess-backend`) consume these fixtures within their own test suites. By loading the fixtures, the backend verifies that its parsers can successfully decode and interpret the event data structures emitted by the contract.

## Event Shape Review Workflow

### Schema Changes
Any change to a Soroban event schema (e.g., adding a field, changing a type) must be reviewed carefully.
1. Update the contract code and tests.
2. Regenerate the fixtures.
3. Update the backend parsers to handle the new shape.
4. Verify backend compatibility validation suites pass.

### Compatibility Validation
The backend Stellar event tests rely on these fixtures. If the backend fails to parse the new fixtures, the contract changes cannot be safely deployed without accompanying backend updates.

## References
* Backend Event Tests: Located in the `xconfess-backend/tests` directory.
* Fixture Locations: Stored in `xconfess-contracts/tests/fixtures` (or equivalent snapshot directories).
* [Event Schemas Reference](./event-schemas.md)
