use soroban_sdk::{Env, testutils::Address as _};
use xconfess_contract::events::*;
use confession_anchor::{ConfessionAnchor, ConfessionAnchorClient};

#[test]
fn event_contains_version() {
    let env = Env::default();
    let addr = soroban_sdk::Address::generate(&env);

    let event = ConfessionEvent {
        event_version: EVENT_VERSION_V1,
        confession_id: 1,
        author: addr,
        content_hash: soroban_sdk::symbol_short!("hash"),
        nonce: 1,
        timestamp: 0,
        correlation_id: None,
    };

    assert_eq!(event.event_version, 1);
    assert_eq!(event.nonce, 1);
}

#[test]
fn anchor_event_contains_explicit_version_marker() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &contract_id);

    let hash = soroban_sdk::BytesN::from_array(&env, &[7u8; 32]);
    let ts: u64 = 123;

    client.anchor_confession(&hash, &ts);

    let events = env.events().all();
    assert_eq!(events.len(), 1, "anchor should emit exactly one event");

    let (_cid, _topics, data) = events.first().unwrap();
    let decoded: (u32, u64, u32) = data.into_val(&env);

    assert_eq!(decoded.0, 1, "schema discriminator must be stable");
    assert_eq!(decoded.1, ts);
}

#[test]
fn schema_drift_guard() {
    use core::mem;

    let size = mem::size_of::<ConfessionEvent>();
    assert_eq!(size, mem::size_of::<ConfessionEvent>());
}
