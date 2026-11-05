//! Runtime auth state. Holds the browser cookies that sign every Innertube
//! request and persists them next to the app config (`credentials.json`, 0600).

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::auth::{self, CookieAuth};

pub struct AuthSession {
    dir: PathBuf,
    credentials: Mutex<Option<CookieAuth>>,
}

impl AuthSession {
    pub fn load(dir: PathBuf) -> Self {
        let credentials = auth::load_credentials(&dir);
        Self {
            dir,
            credentials: Mutex::new(credentials),
        }
    }

    pub fn credentials(&self) -> Option<CookieAuth> {
        self.credentials.lock().expect("auth session lock").clone()
    }

    pub fn store(&self, credentials: CookieAuth) -> Result<(), String> {
        auth::save_credentials(&self.dir, &credentials)?;
        *self.credentials.lock().expect("auth session lock") = Some(credentials);
        Ok(())
    }

    pub fn clear(&self) -> Result<(), String> {
        *self.credentials.lock().expect("auth session lock") = None;
        let path = auth::credential_path(&self.dir);
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
