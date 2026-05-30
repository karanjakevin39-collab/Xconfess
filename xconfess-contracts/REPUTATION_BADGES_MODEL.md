# ReputationBadges Contract Model

## Overview

The ReputationBadges contract manages user reputation scores and achievement badges on the Xconfess platform. It supports two complementary flows for badge distribution and reputation management:

1. **Self-Service Badge Minting** - Users can mint badges they've earned based on their activity
2. **Admin-Managed Badge Awards** - Administrators can grant badges and adjust reputation for community management

## Authorization Model

### Roles

| Role | Capabilities | Actions |
|------|--------------|---------|
| **Admin** | Full contract management | `initialize`, `transfer_admin`, `create_badge`, `award_badge`, `adjust_reputation`, `recalibrate_epoch` |
| **User** | Self-service minting | `mint_badge`, `transfer_badge`, `revoke_badge`, read operations, `apply_decay` |
| **Public** | Read-only access | `get_badges`, `has_badge`, `get_user_reputation`, `get_badge_count`, `get_total_badges`, `apply_decay` |

### Authorization Rules

- **`initialize(admin: Address)`**
  - Caller: Authorized by `admin` address (self-auth required)
  - Effect: Sets the contract admin (one-time only)
  - Fail if already initialized
  
- **`transfer_admin(new_admin: Address)`**
  - Caller: Current admin ONLY
  - Effect: Transfers admin rights to new address
  - Both current admin and new admin must authorize

- **`create_badge(badge_type, name, description, criteria)`**
  - Caller: Admin only
  - Effect: Creates or updates metadata for a badge type
  - Used to define badge display name, description, and earning criteria

- **`award_badge(recipient: Address, badge_type: BadgeType)`**
  - Caller: Admin only
  - Effect: Grants a badge directly to recipient (does not require recipient auth)
  - Fails if recipient already owns this badge type
  - Returns badge ID

- **`mint_badge(recipient: Address, badge_type: BadgeType)`**
  - Caller: User (self-auth required - recipient must authorize)
  - Effect: User self-mints a badge they've earned
  - Fails if user already owns this badge type
  - Returns badge ID

- **`transfer_badge(badge_id: u64, to: Address)`**
  - Caller: Current badge owner (must authorize)
  - Effect: Transfers badge ownership to new address
  - Fails if recipient already owns this badge type

- **`revoke_badge(badge_id: u64)`**
  - Caller: Badge owner (must authorize)
  - Effect: Permanently deletes the badge
  - Badge cannot be recovered after revocation

- **`adjust_reputation(user: Address, amount: i128, reason: String)`**
  - Caller: Admin only
  - Effect: Adds or subtracts reputation from user
  - Use case: Manual adjustments for community management or corrections
  - Negative amounts reduce reputation; positive increases it
  - Also resets the user's decay timer (reputation considered "fresh"

- **`apply_decay(user: Address)`**
  - Caller: Public (anyone can call for any user)
  - Effect: Explicitly applies pending reputation decay for a user
  - Gas-efficient operation for updating stale reputation scores
  - Returns the new reputation after decay is applied
  - Updates the user's last update timestamp to prevent re-application

- **`recalibrate_epoch(user_batch: Vec<Address>)`**
  - Caller: Admin only
  - Effect: Batch process reputation decay for multiple users
  - Bounded operation: processes only the provided batch of users
  - Increments the global epoch counter
  - Returns the number of users whose reputation was updated
  - Use case: Periodic maintenance to keep reputation scores fresh

- **Read Operations** (no auth required)
  - `get_admin()` - Returns current admin address
  - `get_user_reputation(user)` - Returns user's reputation score
  - `get_badges(owner)` - Returns all badges owned by address
  - `has_badge(owner, badge_type)` - Checks if user owns specific badge type
  - `get_badge_count(owner)` - Returns count of badges owned
  - `get_badge(badge_id)` - Returns badge by ID
  - `get_total_badges()` - Returns total badges minted
  - `get_badge_type_metadata(badge_type)` - Returns display metadata (`BadgeTypeMetadata`) for a badge type, or `None` if not yet defined
  - `has_badge_type_metadata(badge_type)` - Returns `true` if an admin has defined metadata for the badge type
  - `get_user_badge_summary(user)` - Returns `(Vec<u64>, i128)` — badge IDs and reputation score in one call for efficient off-chain queries

## Badge Types

Pre-defined badge types with intended earning criteria:

```rust
pub enum BadgeType {
    ConfessionStarter,   // First confession posted
    PopularVoice,        // 100+ reactions received
    GenerousSoul,        // Tipped 10+ confessions
    CommunityHero,       // 50+ confessions posted
    TopReactor,          // 500+ reactions given
}
```

Badge metadata (name, description, criteria) is stored separately and managed by admins via `create_badge()`.

## Reputation System

### Overview

- **Type**: Signed integer (i128), allowing both positive and negative values
- **Default**: 0 at account creation
- **Purpose**: Track user standing and facilitate community management decisions
- **Range**: -9,223,372,036,854,775,808 to +9,223,372,036,854,775,807
- **Decay Policy**: Time-based exponential decay to prevent stale reputation scores

### Reputation Decay Policy

Reputation scores decay over time to ensure they reflect recent activity rather than permanent historical actions.

#### Decay Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| **Epoch Duration** | 604,800 seconds (7 days) | Time window for one decay cycle |
| **Decay Rate** | 5% per epoch (0.95 multiplier) | Reputation retains 95% per epoch |
| **Decay Floor** | 0 (for positive reputation) | Reputation won't decay below 0 for positive scores |
| **Max Epochs per Calculation** | 52 (1 year) | Bounds gas costs for decay calculation |
| **Negative Reputation** | Also decays | Negative scores become less negative over time (decay toward 0) |

#### Decay Formula

```
reputation_after_decay = floor(reputation × 0.95^epochs_elapsed)
```

Where:
- `epochs_elapsed = floor(time_since_last_update / EPOCH_DURATION)`
- Maximum of 52 epochs applied in a single calculation (gas bounding)
- For positive reputation, decay stops at 0 (floor)
- For negative reputation, decay reduces the magnitude (moves toward 0)

#### Decay Trigger Conditions

Reputation decay is applied automatically when:
1. `get_user_reputation()` is called - decay is applied before returning the value
2. `apply_decay()` is called explicitly - anyone can trigger this for any user
3. `recalibrate_epoch()` is called by admin - batch processing for multiple users

#### Timer Reset

The decay timer is reset (last update timestamp updated to current time) when:
1. `adjust_reputation()` is called by admin - reputation change resets the timer
2. `apply_decay()` successfully applies decay - timestamp updated to prevent re-application

### Reputation Adjustments

Admins can adjust reputation for:

- **Corrections**: Fixing miscalculated or missing adjustments
- **Penalties**: Reducing reputation for policy violations
- **Rewards**: Bonus reputation for exceptional community contributions
- **Off-chain Events**: Adjustments based on external systems (e.g., verified donations)

All reputation adjustments emit events with the reason recorded on-chain.

### Reputation Decay Events

When decay is applied, a `reputation_decayed` event is emitted with:
- `user`: The address whose reputation was decayed
- `old_reputation`: Reputation before decay
- `new_reputation`: Reputation after decay
- `epochs_applied`: Number of epochs that were applied
- `timestamp`: When the decay was applied

## Event Receipts

The contract emits events for all state-changing operations:

| Event | Topics | Data | When |
|-------|--------|------|------|
| `contract_initialized` | `(topic, admin)` | admin address | On contract init |
| `admin_transferred` | `(topic, old_admin)` | `(old_admin, new_admin)` | Admin transfer |
| `badge_type_created` | `(topic, admin)` | badge type | On create_badge |
| `badge_granted` | `(topic, recipient)` | BadgeEvent | On award_badge |
| `badge_minted` | `(topic, owner)` | BadgeEvent | On mint_badge |
| `badge_transferred` | `(topic, badge_id)` | BadgeTransferredData | On transfer_badge |
| `badge_revoked` | `(topic, owner)` | BadgeEvent | On revoke_badge |
| `reputation_adjusted` | `(topic, user)` | ReputationAdjustedData | On adjust_reputation |
| `reputation_decayed` | `(topic, user)` | ReputationDecayedData | On apply_decay |
| `epoch_recalibrated` | `(topic, admin)` | `(epoch, updated_count)` | On recalibrate_epoch |

## Storage Layout

| Key | Type | Purpose |
|-----|------|---------|
| `Admin` | Address | Current contract administrator |
| `BadgeCount` | u64 | Total badges minted (counter) |
| `Badge(id)` | Badge | Badge data by ID |
| `UserBadges(user)` | Vec<u64> | Badge IDs owned by user |
| `TypeOwnership(user, type)` | bool | Has user ever owned this badge type |
| `BadgeTypeMetadata(type)` | BadgeTypeMetadata | Display info for badge type |
| `UserReputation(user)` | i128 | User's current reputation score |
| `ReputationLastUpdate(user)` | u64 | Timestamp of last reputation update (for decay) |
| `CurrentEpoch` | u32 | Global epoch index for recalibration |

## Error Codes

```rust
pub enum Error {
    BadgeAlreadyOwned = 1,           // User/owner already has this badge type
    BadgeNotFound = 2,               // Badge ID does not exist
    BadgeTypeAlreadyOwned = 3,       // Another user has this badge type (transfer)
    NotAuthorized = 4,               // Caller lacks required role/permission
    NotInitialized = 5,              // Contract not initialized or admin not set
    BadgeTypeMetadataNotFound = 6,   // Badge type metadata not yet defined
}
```

## Common Workflows

### Workflow 1: Admin Initialization

```rust
// Deploy contract
let contract_id = deploy_reputation_badges_contract();

// Initialize with admin
contract.initialize(&admin_address);

// Transfer to operations team if needed
contract.transfer_admin(&ops_admin_address);
```

### Workflow 2: Setting Up Badge Definitions

```rust
// Admin creates metadata for badge types
contract.create_badge(
    BadgeType::ConfessionStarter,
    "First Confession",
    "Your first confession was posted",
    "Post at least one confession"
);

contract.create_badge(
    BadgeType::PopularVoice,
    "Popular Voice",
    "Your confessions resonated with 100+ people",
    "Receive 100+ reactions"
);
```

### Workflow 3: User Self-Mints Badge

```rust
// User earns badge through activity (met criteria)
let badge_id = user_contract.mint_badge(&user_address, &BadgeType::ConfessionStarter)?;
// User now owns badge for ConfessionStarter type
```

### Workflow 4: Admin Awards Badge

```rust
// Admin verifies off-chain that user met criteria
// Admin grants badge on-chain
let badge_id = admin_contract.award_badge(&user_address, &BadgeType::CommunityHero)?;
// Recipient is notified of badge award via event
```

### Workflow 5: Reputation Management

```rust
// Admin rewards exceptional posting
admin_contract.adjust_reputation(
    &user_address,
    150,
    "Outstanding community contribution"
)?;

// Admin applies penalty for policy violation
admin_contract.adjust_reputation(
    &reported_user,
    -50,
    "Policy violation: inappropriate content"
)?;
```

### Workflow 6: Reputation Decay (Automatic)

```rust
// When querying reputation, decay is automatically applied
// No explicit action needed - the contract handles it
let current_rep = contract.get_user_reputation(&user_address);
// If epochs have passed, the returned value will reflect decayed reputation
```

### Workflow 7: Explicit Decay Application

```rust
// Anyone can trigger decay for a user (gas-efficient)
// Useful for keeping reputation scores fresh
let updated_rep = contract.apply_decay(&user_address);
// Returns the new reputation after decay is applied
```

### Workflow 8: Batch Epoch Recalibration (Admin)

```rust
// Admin performs periodic maintenance to recalibrate reputations
let mut user_batch = Vec::new(&env);
user_batch.push_back(user1);
user_batch.push_back(user2);
user_batch.push_back(user3);

// Process batch - applies decay and increments global epoch
let updated_count = admin_contract.recalibrate_epoch(&user_batch)?;
// Returns number of users whose reputation was updated
```

### Workflow 9: Reputation Decay Over Time

```rust
// Initial reputation set by admin
admin_contract.adjust_reputation(&user, 1000, "initial")?;
// User reputation: 1000

// After 1 epoch (7 days): reputation decays by 5%
// 1000 * 0.95 = 950
let rep_after_1_epoch = contract.get_user_reputation(&user);
// rep_after_1_epoch = 950

// After 2 more epochs (21 days total): another 5% decay applied twice
// 950 * 0.95 = 902 (after epoch 2)
// 902 * 0.95 = 856 (after epoch 3)
let rep_after_3_epochs = contract.get_user_reputation(&user);
// rep_after_3_epochs = 856
```

## Security Considerations

1. **Initialization Check**: Contract must be initialized before any admin functions work
2. **Single Admin**: Only one admin at a time to ensure clear authorization
3. **One Badge Per Type**: Users can only own one instance of each badge type
4. **Immutable History**: Banged badges/reputation adjustments emit events for audit trail
5. **No Backend Admin**: Admin functions do not require backend involvement; all authorization is on-chain

## Testing

All authorization rules and decay functionality are tested in `contracts/reputation-badges/src/test.rs`:

### Authorization Tests
- `test_initialize_contract` - Initialization flow
- `test_initialize_only_once` - Prevents re-initialization
- `test_transfer_admin` - Admin transfer authorization
- `test_admin_only_functions_require_init` - NotInitialized error handling
- `test_create_badge_metadata` - Metadata creation (admin only)
- `test_award_badge_admin_only` - Admin badge award flow
- `test_adjust_reputation` - Reputation adjustment with pos/neg values
- `test_award_duplicate_badge_fails` - Duplicate prevention
- `test_admin_can_award_different_badge_types` - Multiple badge types
- `test_mint_and_award_can_coexist` - Self-mint + admin-award compatibility

### Reputation Decay Tests
- `test_reputation_decay_basic` - Basic decay over 1 epoch (5% reduction)
- `test_reputation_decay_zero_epochs` - No decay when no time passed
- `test_reputation_decay_multiple_epochs` - Decay over 3 epochs
- `test_reputation_decay_floor` - Reputation decays to 0 (floor test)
- `test_reputation_decay_negative` - Negative reputation also decays (toward 0)
- `test_apply_decay_explicit` - Explicit `apply_decay` function
- `test_adjust_reputation_resets_timer` - Adjusting reputation resets decay timer
- `test_reputation_decay_bounded` - Gas-bounded calculation (max 52 epochs)
- `test_recalibrate_epoch` - Admin batch epoch recalibration
- `test_reputation_decay_fairness_multiple_users` - Proportional decay for multiple users
- `test_reputation_no_decay_when_active` - No decay if less than 1 epoch passed

## Integration Points

### Backend (NestJS)

- Listen to `badge_granted`, `badge_awarded`, `badge_revoked` events
- Trigger notifications when users receive badges
- Sync reputation scores for ranking/leaderboards
- Watch `reputation_adjusted` events for audit logging

### Frontend (Next.js)

- Display user's badge collection
- Show current reputation score
- Query contract for user's badges and reputation
- Emit badge mint/revoke transactions when users earn badges

### Off-Chain Indexer

- Index all badge and reputation events
- Build historical audit trail
- Compute badge ownership statistics
- Track reputation changes over time
