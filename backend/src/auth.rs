use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
    Json,
};

use crate::AppState;

// This service is now called only server-to-server (by helm's backend and by
// ysocket), never directly by an end-user browser - Firebase ID token
// verification (and the `users` table it used to upsert into) moved to
// helm/ysocket, which independently gate their own end-user-facing
// surfaces. What's left here is a single shared secret so this service
// isn't wide open on its public Fly.io URL.
pub struct InternalAuth;

pub enum AuthError {
    MissingKey,
    InvalidKey,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, msg) = match self {
            AuthError::MissingKey => (StatusCode::UNAUTHORIZED, "missing internal api key"),
            AuthError::InvalidKey => (StatusCode::UNAUTHORIZED, "invalid internal api key"),
        };
        (status, Json(serde_json::json!({ "error": msg }))).into_response()
    }
}

#[async_trait]
impl FromRequestParts<AppState> for InternalAuth {
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let provided = parts
            .headers
            .get("x-internal-key")
            .and_then(|v| v.to_str().ok())
            .ok_or(AuthError::MissingKey)?;

        if !constant_time_eq(provided.as_bytes(), state.internal_api_key.as_bytes()) {
            return Err(AuthError::InvalidKey);
        }

        Ok(InternalAuth)
    }
}

// Avoids a timing side-channel on the secret compared to `==`.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equal_keys_match() {
        assert!(constant_time_eq(b"same-secret", b"same-secret"));
    }

    #[test]
    fn different_keys_do_not_match() {
        assert!(!constant_time_eq(b"secret-a", b"secret-b"));
    }

    #[test]
    fn different_length_keys_do_not_match() {
        assert!(!constant_time_eq(b"short", b"much-longer-secret"));
    }
}
