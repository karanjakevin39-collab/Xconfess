use soroban_sdk::{Env, String};

use crate::emergency_pause::*;
#[path = "../access_control.rs"]
mod access_control;

#[test]
fn test_pause_flow() {
    let env = Env::default();
    env.mock_all_auths();

    // Use shared access control so emergency pause cannot be stranded behind a
    // separate pause-admin key.
    let owner = env.accounts().generate();
    access_control::init_owner(&env, &owner).unwrap();

    assert_eq!(is_paused(&env), false);

    pause(env.clone(), owner.clone(), String::from_str(&env, "incident")).unwrap();

    assert_eq!(is_paused(&env), true);

    let result = assert_not_paused(&env);
    assert!(result.is_err());

    unpause(env.clone(), owner, String::from_str(&env, "resolved")).unwrap();

    assert_eq!(is_paused(&env), false);
}