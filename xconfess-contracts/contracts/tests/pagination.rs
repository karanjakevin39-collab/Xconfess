#![cfg(test)]

use confession_registry::{ConfessionRegistry, ConfessionRegistryClient};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

// ─── Helpers ────────────────────────────────────────────────────────────────

fn setup() -> (Env, ConfessionRegistryClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(ConfessionRegistry, ());
    let client = ConfessionRegistryClient::new(&env, &id);
    let admin = Address::generate(&env);
    let author = Address::generate(&env);
    client.initialize(&admin);
    (env, client, admin, author)
}

fn hash(env: &Env, seed: u8) -> BytesN<32> {
    let mut b = [0u8; 32];
    b[0] = seed;
    BytesN::from_array(env, &b)
}

/// Seed `n` confessions and return the IDs in insertion order.
fn seed(client: &ConfessionRegistryClient, env: &Env, author: &Address, n: u8) -> Vec<u64> {
    (0..n)
        .map(|i| client.create_confession(author, &hash(env, i), &(1_000 + i as u64)))
        .collect()
}

// ─── Tests ───────────────────────────────────────────────────────────────────

/// First page: cursor=None, more items remain → has_next_page=true, next_cursor=Some.
#[test]
fn first_page_has_next() {
    let (env, client, _admin, author) = setup();
    seed(&client, &env, &author, 7);

    let page = client.list_confessions(&None, &3);

    assert_eq!(page.items.len(), 3);
    assert!(page.has_next_page);
    assert_eq!(page.next_cursor, Some(3));
    // Items are in ascending ID order.
    assert_eq!(page.items.get(0).unwrap().id, 1);
    assert_eq!(page.items.get(2).unwrap().id, 3);
}

/// Middle page: cursor points into the middle, more items remain.
#[test]
fn middle_page_has_next() {
    let (env, client, _admin, author) = setup();
    seed(&client, &env, &author, 7);

    let page = client.list_confessions(&Some(3), &3);

    assert_eq!(page.items.len(), 3);
    assert!(page.has_next_page);
    assert_eq!(page.next_cursor, Some(6));
    assert_eq!(page.items.get(0).unwrap().id, 4);
    assert_eq!(page.items.get(2).unwrap().id, 6);
}

/// Terminal page: cursor points near the end, no more items remain.
#[test]
fn terminal_page_no_next() {
    let (env, client, _admin, author) = setup();
    seed(&client, &env, &author, 7);

    let page = client.list_confessions(&Some(6), &3);

    assert_eq!(page.items.len(), 1);
    assert!(!page.has_next_page);
    assert_eq!(page.next_cursor, None);
    assert_eq!(page.items.get(0).unwrap().id, 7);
}

/// Empty store: first call returns an empty terminal page.
#[test]
fn empty_store_is_terminal() {
    let (_env, client, _admin, _author) = setup();

    let page = client.list_confessions(&None, &10);

    assert_eq!(page.items.len(), 0);
    assert!(!page.has_next_page);
    assert_eq!(page.next_cursor, None);
}

/// Exact-fit page: items == limit with nothing left → terminal.
#[test]
fn exact_fit_is_terminal() {
    let (env, client, _admin, author) = setup();
    seed(&client, &env, &author, 5);

    let page = client.list_confessions(&None, &5);

    assert_eq!(page.items.len(), 5);
    assert!(!page.has_next_page);
    assert_eq!(page.next_cursor, None);
}

/// Full walk: chaining pages collects every confession exactly once.
#[test]
fn full_walk_collects_all() {
    let (env, client, _admin, author) = setup();
    seed(&client, &env, &author, 15);

    let mut cursor = None;
    let mut total = 0u32;

    loop {
        let page = client.list_confessions(&cursor, &4);
        total += page.items.len();
        if !page.has_next_page {
            break;
        }
        cursor = page.next_cursor;
    }

    assert_eq!(total, 15);
}

/// next_cursor is deterministic: same state, same cursor, same result.
#[test]
fn next_cursor_is_deterministic() {
    let (env, client, _admin, author) = setup();
    seed(&client, &env, &author, 10);

    let p1 = client.list_confessions(&None, &3);
    let p2 = client.list_confessions(&None, &3);

    assert_eq!(p1.next_cursor, p2.next_cursor);
    assert_eq!(p1.has_next_page, p2.has_next_page);
}
