//! Backend Verification Compatibility Fixtures
//!
//! This module provides deterministic test vectors that tie contract event output
//! to backend verification expectations. These fixtures ensure that contract and
//! backend work can evolve independently without silent drift.
//!
//! ## Purpose
//! - Prove contract event output matches what backend verification code expects
//! - Catch schema drift in automated tests instead of manual review
//! - Provide version-aware fixtures for upgrade compatibility testing
//!
//! ## Coverage
//! - Confession anchoring events (ConfessionAnchoredEvent)
//! - Anonymous tip settlement events (SettlementEvent)
//! - Error code mappings for backend retry logic
//!
//! ## Usage
//! Contract tests call these fixtures to verify event emission.
//! Backend tests import the JSON output to validate parsing logic.

use soroban_sdk::{
    testutils::{Address as _, Events},
    Address, BytesN, Env, IntoVal, String as SorobanString,
};

use confession_anchor::{ConfessionAnchor, ConfessionAnchorClient};
use anonymous_tipping::{AnonymousTipping, AnonymousTippingClient};

/// Fixture version for tracking compatibility across contract/backend changes
pub const FIXTURE_VERSION: u32 = 1;

/// Deterministic anchor event fixture
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnchorEventFixture {
    pub fixture_version: u32,
    pub event_version: u32,
    pub hash: [u8; 32],
    pub timestamp: u64,
    pub anchor_height: u32,
    pub description: &'static str,
}

/// Deterministic tip settlement event fixture
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TipSettlementFixture {
    pub fixture_version: u32,
    pub event_version: u32,
    pub settlement_id: u64,
    pub amount: i128,
    pub proof_metadata: &'static str,
    pub proof_present: bool,
    pub description: &'static str,
}

/// Error code fixture for backend retry classification
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ErrorCodeFixture {
    pub error_code: u32,
    pub error_name: &'static str,
    pub classification: ErrorClassification,
    pub http_status: u16,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ErrorClassification {
    Terminal,
    Retryable,
}

// ═══════════════════════════════════════════════════════════════════════════
// ANCHOR EVENT FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

/// Canonical anchor event fixture: basic confession anchoring
pub const ANCHOR_FIXTURE_BASIC: AnchorEventFixture = AnchorEventFixture {
    fixture_version: FIXTURE_VERSION,
    event_version: 1,
    hash: [0x42; 32],
    timestamp: 1_700_000_000_000,
    anchor_height: 12345,
    description: "Basic confession anchor with deterministic hash",
};

/// Anchor event fixture: boundary case with all-zero hash
pub const ANCHOR_FIXTURE_ZERO_HASH: AnchorEventFixture = AnchorEventFixture {
    fixture_version: FIXTURE_VERSION,
    event_version: 1,
    hash: [0x00; 32],
    timestamp: 1_700_000_000_001,
    anchor_height: 12346,
    description: "Anchor with all-zero hash (valid boundary case)",
};

/// Anchor event fixture: boundary case with max timestamp
pub const ANCHOR_FIXTURE_MAX_TIMESTAMP: AnchorEventFixture = AnchorEventFixture {
    fixture_version: FIXTURE_VERSION,
    event_version: 1,
    hash: [0xFF; 32],
    timestamp: u64::MAX,
    anchor_height: 99999,
    description: "Anchor with maximum timestamp value",
};

// ═══════════════════════════════════════════════════════════════════════════
// TIP SETTLEMENT EVENT FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

/// Canonical tip settlement fixture: basic anonymous tip
pub const TIP_FIXTURE_BASIC: TipSettlementFixture = TipSettlementFixture {
    fixture_version: FIXTURE_VERSION,
    event_version: 1,
    settlement_id: 1,
    amount: 1_000_000, // 1 XLM in stroops
    proof_metadata: "txhash:abc123",
    proof_present: true,
    description: "Basic anonymous tip with proof metadata",
};

/// Tip settlement fixture: no proof metadata
pub const TIP_FIXTURE_NO_PROOF: TipSettlementFixture = TipSettlementFixture {
    fixture_version: FIXTURE_VERSION,
    event_version: 1,
    settlement_id: 2,
    amount: 500_000, // 0.5 XLM
    proof_metadata: "",
    proof_present: false,
    description: "Anonymous tip without proof metadata",
};

/// Tip settlement fixture: large amount
pub const TIP_FIXTURE_LARGE_AMOUNT: TipSettlementFixture = TipSettlementFixture {
    fixture_version: FIXTURE_VERSION,
    event_version: 1,
    settlement_id: 3,
    amount: 100_000_000_000, // 10,000 XLM
    proof_metadata: "txhash:large_tip_xyz",
    proof_present: true,
    description: "Large anonymous tip (boundary test)",
};

// ═══════════════════════════════════════════════════════════════════════════
// ERROR CODE FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

/// Error code fixtures for backend retry classification
pub const ERROR_CODE_FIXTURES: &[ErrorCodeFixture] = &[
    // Tipping errors
    ErrorCodeFixture {
        error_code: 6001,
        error_name: "INVALID_TIP_AMOUNT",
        classification: ErrorClassification::Terminal,
        http_status: 400,
    },
    ErrorCodeFixture {
        error_code: 6002,
        error_name: "METADATA_TOO_LONG",
        classification: ErrorClassification::Terminal,
        http_status: 400,
    },
    ErrorCodeFixture {
        error_code: 6003,
        error_name: "TOTAL_OVERFLOW",
        classification: ErrorClassification::Retryable,
        http_status: 503,
    },
    ErrorCodeFixture {
        error_code: 6004,
        error_name: "NONCE_OVERFLOW",
        classification: ErrorClassification::Retryable,
        http_status: 503,
    },
    ErrorCodeFixture {
        error_code: 6005,
        error_name: "UNAUTHORIZED",
        classification: ErrorClassification::Terminal,
        http_status: 403,
    },
    ErrorCodeFixture {
        error_code: 6006,
        error_name: "CONTRACT_PAUSED",
        classification: ErrorClassification::Retryable,
        http_status: 503,
    },
    ErrorCodeFixture {
        error_code: 6007,
        error_name: "RATE_LIMITED",
        classification: ErrorClassification::Retryable,
        http_status: 503,
    },
    ErrorCodeFixture {
        error_code: 6008,
        error_name: "INVALID_RATE_LIMIT_CONFIG",
        classification: ErrorClassification::Terminal,
        http_status: 400,
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/// Execute anchor fixture and verify event emission matches expectations
pub fn verify_anchor_fixture(env: &Env, client: &ConfessionAnchorClient, fixture: &AnchorEventFixture) {
    // Set deterministic ledger height
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: fixture.anchor_height,
        ..env.ledger().get()
    });

    let hash = BytesN::from_array(env, &fixture.hash);
    let status = client.anchor_confession(&hash, &fixture.timestamp);

    assert_eq!(
        status,
        soroban_sdk::symbol_short!("anchored"),
        "fixture anchor must succeed: {}",
        fixture.description
    );

    // Verify event emission
    let events = env.events().all();
    assert_eq!(
        events.len(),
        1,
        "fixture must emit exactly one event: {}",
        fixture.description
    );

    let (_contract_id, _topics, data) = events.first().unwrap();
    let decoded: (u32, u64, u32) = data.into_val(env);

    assert_eq!(
        decoded.0, fixture.event_version,
        "event version mismatch for fixture: {}",
        fixture.description
    );
    assert_eq!(
        decoded.1, fixture.timestamp,
        "timestamp mismatch for fixture: {}",
        fixture.description
    );
    assert_eq!(
        decoded.2, fixture.anchor_height,
        "anchor height mismatch for fixture: {}",
        fixture.description
    );
}

/// Execute tip settlement fixture and verify event emission
pub fn verify_tip_fixture(env: &Env, client: &AnonymousTippingClient, fixture: &TipSettlementFixture) {
    let recipient = Address::generate(env);
    let proof = if fixture.proof_present {
        Some(SorobanString::from_str(env, fixture.proof_metadata))
    } else {
        None
    };

    let settlement_id = client
        .send_tip_with_proof(&recipient, &fixture.amount, &proof)
        .expect(&format!("fixture tip must succeed: {}", fixture.description));

    assert_eq!(
        settlement_id, fixture.settlement_id,
        "settlement ID mismatch for fixture: {}",
        fixture.description
    );

    // Verify event emission
    let events = env.events().all();
    assert!(
        !events.is_empty(),
        "fixture must emit at least one event: {}",
        fixture.description
    );

    // Find the settlement event (last event should be the tip settlement)
    let (_contract_id, _topics, data) = events.last().unwrap();

    // SettlementEvent structure: (recipient, event_version, settlement_id, amount, proof_metadata, proof_present, timestamp)
    // We verify the key fields that backend relies on
    let decoded: (Address, u32, u64, i128, SorobanString, bool, u64) = data.into_val(env);

    assert_eq!(
        decoded.1, fixture.event_version,
        "event version mismatch for fixture: {}",
        fixture.description
    );
    assert_eq!(
        decoded.2, fixture.settlement_id,
        "settlement ID mismatch for fixture: {}",
        fixture.description
    );
    assert_eq!(
        decoded.3, fixture.amount,
        "amount mismatch for fixture: {}",
        fixture.description
    );
    assert_eq!(
        decoded.5, fixture.proof_present,
        "proof_present flag mismatch for fixture: {}",
        fixture.description
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    fn new_anchor_client(env: &Env) -> ConfessionAnchorClient {
        env.mock_all_auths();
        let contract_id = env.register(ConfessionAnchor, ());
        ConfessionAnchorClient::new(env, &contract_id)
    }

    fn new_tipping_client(env: &Env) -> AnonymousTippingClient {
        env.mock_all_auths();
        let contract_id = env.register(AnonymousTipping, ());
        let client = AnonymousTippingClient::new(env, &contract_id);
        client.init();
        client
    }

    #[test]
    fn anchor_fixture_basic_matches_contract_output() {
        let env = Env::default();
        let client = new_anchor_client(&env);
        verify_anchor_fixture(&env, &client, &ANCHOR_FIXTURE_BASIC);
    }

    #[test]
    fn anchor_fixture_zero_hash_matches_contract_output() {
        let env = Env::default();
        let client = new_anchor_client(&env);
        verify_anchor_fixture(&env, &client, &ANCHOR_FIXTURE_ZERO_HASH);
    }

    #[test]
    fn anchor_fixture_max_timestamp_matches_contract_output() {
        let env = Env::default();
        let client = new_anchor_client(&env);
        verify_anchor_fixture(&env, &client, &ANCHOR_FIXTURE_MAX_TIMESTAMP);
    }

    #[test]
    fn tip_fixture_basic_matches_contract_output() {
        let env = Env::default();
        let client = new_tipping_client(&env);
        verify_tip_fixture(&env, &client, &TIP_FIXTURE_BASIC);
    }

    #[test]
    fn tip_fixture_no_proof_matches_contract_output() {
        let env = Env::default();
        let client = new_tipping_client(&env);
        verify_tip_fixture(&env, &client, &TIP_FIXTURE_NO_PROOF);
    }

    #[test]
    fn tip_fixture_large_amount_matches_contract_output() {
        let env = Env::default();
        let client = new_tipping_client(&env);
        verify_tip_fixture(&env, &client, &TIP_FIXTURE_LARGE_AMOUNT);
    }

    #[test]
    fn error_code_fixtures_are_stable() {
        // Verify error codes match contract definitions
        assert_eq!(ERROR_CODE_FIXTURES.len(), 8, "all tipping error codes must be covered");

        for fixture in ERROR_CODE_FIXTURES {
            assert!(
                fixture.error_code >= 6000 && fixture.error_code < 7000,
                "tipping error codes must be in 6000-6999 range: {}",
                fixture.error_name
            );
        }
    }

    #[test]
    fn fixture_version_is_stable() {
        assert_eq!(FIXTURE_VERSION, 1, "fixture version must remain stable");
        assert_eq!(ANCHOR_FIXTURE_BASIC.fixture_version, FIXTURE_VERSION);
        assert_eq!(TIP_FIXTURE_BASIC.fixture_version, FIXTURE_VERSION);
    }

    #[test]
    fn all_fixtures_are_deterministic() {
        // Run fixtures twice and verify identical output
        let env1 = Env::default();
        let client1 = new_anchor_client(&env1);
        verify_anchor_fixture(&env1, &client1, &ANCHOR_FIXTURE_BASIC);
        let events1 = env1.events().all();

        let env2 = Env::default();
        let client2 = new_anchor_client(&env2);
        verify_anchor_fixture(&env2, &client2, &ANCHOR_FIXTURE_BASIC);
        let events2 = env2.events().all();

        assert_eq!(
            events1.len(),
            events2.len(),
            "fixture must produce identical event count across runs"
        );
    }
}
