# Contract Error Code Registry

**Version:** 1  
**Last Updated:** 2026-04-24  
**Status:** Stable (V1)

## Overview

This document defines the stable, backward-compatible error code mapping for Soroban smart contracts used by the xConfess platform. Off-chain services (backend, frontend, monitoring systems) depend on these codes to distinguish retryable failures from terminal ones and to generate appropriate user-facing error messages.

### Problem Statement

Prior to this registry, contract errors were fragmented:
- Error codes were scattered across contract files without centralized versioning
- The anonymous-tipping contract used untyped panic strings instead of numeric codes
- Backend services had no way to distinguish retryable failures (pause, rate limit, cooldown) from terminal ones (invalid input, authorization)
- Adding new errors risked conflicting with existing consumer expectations

This registry solves these problems by:
1. **Centralizing** all contract error definitions in a versioned registry
2. **Classifying** errors as Retryable or Terminal for backend retry strategy
3. **Versioning** the registry to support future additions without breaking consumers
4. **Documenting** each error with its semantics and backend implications

## Error Classification System

### Terminal Errors
**HTTP Status:** 400, 403, 404, 409  
**Retry Strategy:** None — caller must fix the request

Terminal errors indicate problems with the caller's input or permissions. Retrying with the same inputs will fail again. Examples:
- `InvalidInput` (caller provided invalid data)
- `Unauthorized` (caller lacks permission)
- `ConfessionExists` (business logic violation — already exists)

**Backend Handling:**
```typescript
if (classifyContractError(code) === TERMINAL) {
  throw new BadRequestException(getContractErrorMessage(code));
  // Do not retry
}
```

### Retryable Errors
**HTTP Status:** 503 Service Unavailable  
**Retry Strategy:** Exponential backoff with jitter

Retryable errors indicate transient failures that may succeed if retried. Examples:
- `CooldownActive` (caller must wait before retrying)
- `RateLimited` (temporary rate limit; retry later)
- `Overflow` (resource exhaustion; may clear after delay)

**Backend Handling:**
```typescript
if (isRetryableContractError(code)) {
  const delay = getRetryDelayMs(code, attemptNumber);
  await sleep(delay);
  return retry();
}
```

### Unknown Errors
**HTTP Status:** 400 (safe default)  
**Retry Strategy:** None — treat as terminal

Unknown error codes (not in this registry) are treated as terminal failures. This prevents unintended retry loops if a new contract error is introduced before backend is updated.

## Error Code Ranges

| Range | Domain | Status | Notes |
|-------|--------|--------|-------|
| 1000–1099 | Global/Common | Stable | Authorization, validation, overflow |
| 2000–2099 | Confession Module | Stable | Confession CRUD, content validation |
| 3000–3099 | Reaction Module | Stable | Reaction management |
| 4000–4099 | Report/Governance | Stable | Reports, governance proposals |
| 5000–5099 | Governance Module | Stable | Proposals, voting, execution |
| 6000–6099 | Anonymous Tipping | Stable | Tipping, rate limiting, pause |
| 9000–9999 | Metadata/Registry | Reserved | Do not use (compatibility layer) |

## Detailed Error Codes

### Global/Common Errors (1000–1099)

| Code | Name | Classification | Description | HTTP Status |
|------|------|-----------------|-------------|------------|
| 1000 | `UNAUTHORIZED` | Terminal | Caller not authorized to perform action | 403 |
| 1001 | `NOT_FOUND` | Terminal | Requested entity not found | 404 |
| 1002 | `INVALID_INPUT` | Terminal | Input value validation failed | 400 |
| 1003 | `OVERFLOW` | Retryable | Arithmetic overflow on amount/balance | 503 |
| 1004 | `COOLDOWN_ACTIVE` | Retryable | Cooldown period not yet elapsed | 503 |
| 1005 | `PAYLOAD_TOO_LARGE` | Terminal | Emitted data exceeds contract limit | 400 |
| 1006 | `METADATA_TOO_LONG` | Terminal | Metadata field length exceeded | 400 |

### Confession Module Errors (2000–2099)

| Code | Name | Classification | Description | HTTP Status |
|------|------|-----------------|-------------|------------|
| 2000 | `CONFESSION_EXISTS` | Terminal | Attempting to create duplicate confession | 409 |
| 2001 | `CONFESSION_EMPTY` | Terminal | Confession content is empty | 400 |
| 2002 | `CONFESSION_TOO_LONG` | Terminal | Confession content exceeds max length | 400 |

### Reaction Module Errors (3000–3099)

| Code | Name | Classification | Description | HTTP Status |
|------|------|-----------------|-------------|------------|
| 3000 | `REACTION_EXISTS` | Terminal | User already reacted to this confession | 409 |
| 3001 | `INVALID_REACTION_TYPE` | Terminal | Reaction type not recognized | 400 |

### Report/Governance Module Errors (4000–4099)

| Code | Name | Classification | Description | HTTP Status |
|------|------|-----------------|-------------|------------|
| 4000 | `REPORT_EXISTS` | Terminal | User already reported this confession | 409 |
| 4001 | `INVALID_REPORT_REASON` | Terminal | Report reason not in allowed list | 400 |
| 4002 | `REPORT_REASON_TOO_LONG` | Terminal | Report reason text exceeds max length | 400 |

### Governance Module Errors (5000–5099)

| Code | Name | Classification | Description | HTTP Status |
|------|------|-----------------|-------------|------------|
| 5000 | `PROPOSAL_NOT_FOUND` | Terminal | Governance proposal not found | 404 |
| 5001 | `UNAUTHORIZED_APPROVAL` | Terminal | Caller not authorized to approve proposal | 403 |
| 5002 | `QUORUM_NOT_REACHED` | Terminal | Quorum threshold not met for proposal | 400 |
| 5003 | `ALREADY_APPROVED` | Terminal | Caller already approved this proposal | 409 |
| 5004 | `ALREADY_EXECUTED` | Terminal | Proposal already executed | 409 |
| 5005 | `INVALID_ACTION` | Terminal | Invalid governance action type | 400 |

### Anonymous Tipping Errors (6000–6099)

| Code | Name | Classification | Description | HTTP Status |
|------|------|-----------------|-------------|------------|
| 6001 | `INVALID_TIP_AMOUNT` | Terminal | Tip amount must be positive | 400 |
| 6002 | `METADATA_TOO_LONG` | Terminal | Settlement proof metadata exceeds 128 bytes | 400 |
| 6003 | `TOTAL_OVERFLOW` | Retryable | Recipient's total tips would overflow | 503 |
| 6004 | `NONCE_OVERFLOW` | Retryable | Settlement nonce would overflow | 503 |
| 6005 | `UNAUTHORIZED` | Terminal | Caller not authorized (tipping contract) | 403 |
| 6006 | `CONTRACT_PAUSED` | Retryable | Tipping contract is paused | 503 |
| 6007 | `RATE_LIMITED` | Retryable | Rate limit exceeded for this recipient | 503 |
| 6008 | `INVALID_RATE_LIMIT_CONFIG` | Terminal | Invalid rate limit configuration | 400 |

## Backend Integration Guide

### Using Error Classifications

```typescript
import {
  ANCHOR_ERROR_CODES,
  TIPPING_ERROR_CODES,
  classifyContractError,
  isRetryableContractError,
  getHttpStatusForContractError,
  getRetryDelayMs,
  getContractErrorMessage,
} from '@stellar/utils/stellar-contract-errors';

// Example: Handle contract invocation failure
function handleContractError(errorCode: number, attemptNumber: number = 0) {
  // Check if error is retryable
  if (isRetryableContractError(errorCode)) {
    const delay = getRetryDelayMs(errorCode, attemptNumber);
    console.log(`Retryable error ${errorCode}, will retry after ${delay}ms`);
    // Implement exponential backoff
    return { shouldRetry: true, delayMs: delay };
  }

  // Terminal error—fail immediately
  const status = getHttpStatusForContractError(errorCode);
  const message = getContractErrorMessage(errorCode);
  console.error(`Terminal error ${errorCode}: ${message}`);
  return { shouldRetry: false, httpStatus: status, message };
}
```

### Implementing Retry Logic

```typescript
async function invokeContractWithRetry(
  contract: Contract,
  method: string,
  args: any[],
  maxAttempts: number = 3,
) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await contract[method](...args);
    } catch (error) {
      const errorCode = extractContractErrorCode(error); // Implementation-specific
      
      if (!isRetryableContractError(errorCode)) {
        throw new Error(`Terminal error: ${getContractErrorMessage(errorCode)}`);
      }

      if (attempt === maxAttempts - 1) {
        throw new Error(`Max attempts reached for retryable error ${errorCode}`);
      }

      const delayMs = getRetryDelayMs(errorCode, attempt);
      console.log(`Retry ${attempt + 1}/${maxAttempts} after ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
}
```

### Generating API Responses

```typescript
app.get('/api/confessions/:id', async (req, res) => {
  try {
    const confession = await anchorContract.getConfession(req.params.id);
    res.json(confession);
  } catch (error) {
    const errorCode = extractContractErrorCode(error);
    const status = getHttpStatusForContractError(errorCode);
    const message = getContractErrorMessage(errorCode);
    const retryable = isRetryableContractError(errorCode);

    res.status(status).json({
      error: message,
      code: errorCode,
      retryable,
      timestamp: new Date().toISOString(),
    });
  }
});
```

## Versioning & Backward Compatibility

### Current Version
- **ERROR_REGISTRY_VERSION:** 1
- **Status:** Stable
- **Support Window:** All consumers must support at least this version

### Version History

#### Version 1 (Current)
- Initial stable registry
- 21 anchor contract errors (1000–5005)
- 8 tipping contract errors (6001–6008)
- Classification system (Retryable, Terminal, Unknown)

### Future Changes

**Adding a New Error:**
1. Choose an unused code within an appropriate range
2. Document in this registry with classification
3. **Do NOT increment ERROR_REGISTRY_VERSION** (backward compatible)
4. Update tests to pin the new code
5. Notify consumers via changelog

**Breaking Change (requires version bump):**
- Reassigning an existing error code
- Changing classification of an error (Terminal ↔ Retryable)
- Removing an error code that consumers depend on

## Implementation Details

### Confession-Anchor Contract

Error definitions: `xconfess-contracts/contracts/error.rs`

```rust
pub mod codes {
    pub const UNAUTHORIZED: u32 = 1000;
    pub const INVALID_INPUT: u32 = 1002;
    // ... etc
}

impl ContractError {
    pub fn code(&self) -> u32 { /* ... */ }
    pub fn message(&self) -> &'static str { /* ... */ }
    pub fn classification(&self) -> ErrorClassification { /* ... */ }
}
```

### Anonymous-Tipping Contract

Error definitions: `xconfess-contracts/contracts/anonymous-tipping/src/lib.rs`

```rust
pub mod codes {
    pub const INVALID_TIP_AMOUNT: u32 = 6001;
    pub const METADATA_TOO_LONG: u32 = 6002;
    // ... etc
}

impl Error {
    pub fn code(&self) -> u32 { /* maps to stable 6000-series */ }
    pub fn classification(&self) -> ErrorClassification { /* ... */ }
}
```

### Backend Error Handler

Implementation: `xconfess-backend/src/stellar/utils/stellar-contract-errors.ts`

Exports:
- `classifyContractError(code: number): ErrorClassification`
- `isRetryableContractError(code: number): boolean`
- `getHttpStatusForContractError(code: number): number`
- `getRetryDelayMs(code: number, attemptNumber: number): number | null`
- `getContractErrorMessage(code: number): string`

## Testing

### Contract Tests
```bash
npm run contract:test
# Tests error code uniqueness, ranges, classifications, and registry version
```

### Backend Tests
```bash
npm run backend:test -- stellar-contract-errors
# Tests classification logic, retry delays, HTTP status mapping
```

### Integration Tests
```bash
npm run test:integration
# Full stack: trigger contract failures, verify backend handling
```

## Monitoring & Observability

### Recommended Metrics

```typescript
// Log all contract errors for monitoring
logger.info('Contract error', {
  code: errorCode,
  message: getContractErrorMessage(errorCode),
  classification: classifyContractError(errorCode),
  service: 'stellar-invocation',
  timestamp: new Date().toISOString(),
});

// Track retry attempts
if (isRetryableContractError(errorCode)) {
  metrics.increment('stellar.contract.error.retryable', { code: errorCode });
}

// Alert on high terminal error rates
if (terminalErrors > threshold) {
  alerting.critical('High rate of terminal contract errors');
}
```

## FAQ

**Q: What if I encounter an error code not in this registry?**  
A: Treat it as Unknown classification (terminal). Log it as a critical issue—your service may be out-of-date with the contract version.

**Q: How do I decide between retrying and failing?**  
A: Use `isRetryableContractError(code)`. If true, implement exponential backoff. If false, fail immediately with the appropriate HTTP status.

**Q: Can I modify these error codes?**  
A: No—these codes are part of the public contract interface. Adding new errors is fine (use an unused code in the range). Modifying or removing existing codes requires a version bump and is a breaking change.

**Q: What's the maximum error code value?**  
A: 8999. Codes 9000–9999 are reserved for metadata/compatibility issues.

## Support & Questions

For issues or questions about error handling:
1. Check this registry
2. Review backend error handler tests
3. Consult contract error implementations
4. File an issue on GitHub if needed

---

**Maintained by:** xConfess Core Team  
**Last Reviewed:** 2026-04-24  
**Next Review:** Quarterly or when registry version increments
