//! Runtime auth state: keeps the token set, refreshes it before expiry and
//! hands the access token to the Innertube client.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::auth::{self, PollOutcome, TokenSet};

pub struct AuthSession {
    dir: PathBuf,
    tokens: Mutex<Option<TokenSet>>,
}

impl AuthSession {
    pub fn load(dir: PathBuf) -> Self {
        let tokens = auth::load_tokens(&dir);
        Self {
            dir,
            tokens: Mutex::new(tokens),
        }
    }

    pub fn tokens(&self) -> Option<TokenSet> {
        self.tokens.lock().expect("auth session lock").clone()
    }

    /// Returns a usable access token, refreshing it when the stored one is
    /// about to expire. `None` means the app is running anonymously.
    pub fn access_token(&self) -> Result<Option<String>, String> {
        let Some(tokens) = self.tokens() else {
            return Ok(None);
        };
        if !auth::needs_refresh(tokens.expires_at, now_epoch()) {
            return Ok(Some(tokens.access_token));
        }
        match auth::refresh(&tokens.refresh_token)? {
            PollOutcome::Token(refreshed) => {
                self.store(refreshed.clone())?;
                Ok(Some(refreshed.access_token))
            }
            _ => Err("refresh returned no token".to_string()),
        }
    }

    pub fn store(&self, tokens: TokenSet) -> Result<(), String> {
        auth::save_tokens(&self.dir, &tokens)?;
        *self.tokens.lock().expect("auth session lock") = Some(tokens);
        Ok(())
    }

    pub fn clear(&self) -> Result<(), String> {
        *self.tokens.lock().expect("auth session lock") = None;
        let path = auth::token_path(&self.dir);
        match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("remove {}: {error}", path.display())),
        }
    }
}

pub fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs() as i64)
        .unwrap_or(0)
}
