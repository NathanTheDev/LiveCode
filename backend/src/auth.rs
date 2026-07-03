use std::time::{Duration, Instant};

use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{header, request::Parts, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{
    jwk::JwkSet, Algorithm, DecodingKey, Validation,
};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::AppState;

const GOOGLE_JWKS_URL: &str =
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const DEFAULT_JWKS_TTL: Duration = Duration::from_secs(3600);

#[derive(Deserialize)]
pub struct FirebaseClaims {
    pub sub: String,
    #[allow(dead_code)]
    pub iss: String,
    #[allow(dead_code)]
    pub aud: String,
    #[allow(dead_code)]
    pub exp: usize,
    pub email: Option<String>,
    pub name: Option<String>,
    pub picture: Option<String>,
}

pub enum AuthError {
    MissingToken,
    InvalidToken,
    JwksUnavailable,
    Internal,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, msg) = match self {
            AuthError::MissingToken => (StatusCode::UNAUTHORIZED, "missing bearer token"),
            AuthError::InvalidToken => (StatusCode::UNAUTHORIZED, "invalid token"),
            AuthError::JwksUnavailable => (StatusCode::UNAUTHORIZED, "auth service unavailable"),
            AuthError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "internal error"),
        };
        (status, Json(serde_json::json!({ "error": msg }))).into_response()
    }
}

struct CachedJwks {
    keys: JwkSet,
    expires_at: Instant,
}

pub struct JwksCache {
    client: reqwest::Client,
    url: String,
    inner: RwLock<Option<CachedJwks>>,
}

impl JwksCache {
    pub fn new(client: reqwest::Client) -> Self {
        Self {
            client,
            url: GOOGLE_JWKS_URL.to_string(),
            inner: RwLock::new(None),
        }
    }

    async fn fetch(&self) -> Result<JwkSet, AuthError> {
        let resp = self.client.get(&self.url).send().await.map_err(|err| {
            eprintln!("failed to fetch JWKS: {err}");
            AuthError::JwksUnavailable
        })?;

        if !resp.status().is_success() {
            eprintln!("JWKS endpoint returned status {}", resp.status());
            return Err(AuthError::JwksUnavailable);
        }

        let ttl = resp
            .headers()
            .get(header::CACHE_CONTROL)
            .and_then(|v| v.to_str().ok())
            .and_then(parse_max_age)
            .unwrap_or(DEFAULT_JWKS_TTL);

        let keys: JwkSet = resp.json().await.map_err(|err| {
            eprintln!("failed to parse JWKS response: {err}");
            AuthError::JwksUnavailable
        })?;

        let mut guard = self.inner.write().await;
        *guard = Some(CachedJwks {
            keys: keys.clone(),
            expires_at: Instant::now() + ttl,
        });

        Ok(keys)
    }

    async fn keys(&self) -> Result<JwkSet, AuthError> {
        {
            let guard = self.inner.read().await;
            if let Some(cached) = guard.as_ref() {
                if Instant::now() < cached.expires_at {
                    return Ok(cached.keys.clone());
                }
            }
        }
        self.fetch().await
    }

    pub async fn find_key(&self, kid: &str) -> Result<DecodingKey, AuthError> {
        let keys = self.keys().await?;
        let jwk = keys.find(kid).ok_or(AuthError::InvalidToken)?;
        DecodingKey::from_jwk(jwk).map_err(|err| {
            eprintln!("failed to build decoding key from JWK: {err}");
            AuthError::InvalidToken
        })
    }
}

fn validate_token(
    token: &str,
    key: &DecodingKey,
    project_id: &str,
) -> Result<FirebaseClaims, jsonwebtoken::errors::Error> {
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[project_id]);
    validation.set_issuer(&[format!("https://securetoken.google.com/{project_id}")]);
    jsonwebtoken::decode::<FirebaseClaims>(token, key, &validation).map(|data| data.claims)
}

fn parse_max_age(cache_control: &str) -> Option<Duration> {
    cache_control.split(',').find_map(|part| {
        let part = part.trim();
        let rest = part.strip_prefix("max-age=")?;
        rest.parse::<u64>().ok().map(Duration::from_secs)
    })
}

#[derive(Serialize)]
pub struct AuthUser {
    pub id: String,
    pub firebase_uid: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub photo_url: Option<String>,
}

async fn authenticate(parts: &Parts, state: &AppState) -> Result<AuthUser, AuthError> {
    let header = parts
        .headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or(AuthError::MissingToken)?;
    let token = header
        .strip_prefix("Bearer ")
        .ok_or(AuthError::MissingToken)?;

    let header = jsonwebtoken::decode_header(token).map_err(|_| AuthError::InvalidToken)?;
    let kid = header.kid.ok_or(AuthError::InvalidToken)?;

    let decoding_key = state.jwks.find_key(&kid).await?;
    let claims = validate_token(token, &decoding_key, &state.firebase_project_id)
        .map_err(|_| AuthError::InvalidToken)?;

    let row = sqlx::query_as::<_, UserRow>(
        "INSERT INTO users (id, firebase_uid, email, display_name, photo_url, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (firebase_uid) DO UPDATE SET
             email = EXCLUDED.email,
             display_name = EXCLUDED.display_name,
             photo_url = EXCLUDED.photo_url,
             updated_at = now()
         RETURNING id, firebase_uid, email, display_name, photo_url",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&claims.sub)
    .bind(&claims.email)
    .bind(&claims.name)
    .bind(&claims.picture)
    .fetch_one(&state.db)
    .await
    .map_err(|err| {
        eprintln!("failed to upsert user {}: {err}", claims.sub);
        AuthError::Internal
    })?;

    Ok(AuthUser {
        id: row.id,
        firebase_uid: row.firebase_uid,
        email: row.email,
        display_name: row.display_name,
        photo_url: row.photo_url,
    })
}

#[derive(sqlx::FromRow)]
struct UserRow {
    id: String,
    firebase_uid: String,
    email: Option<String>,
    display_name: Option<String>,
    photo_url: Option<String>,
}

#[async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        authenticate(parts, state).await
    }
}

pub struct OptionalAuthUser(pub Option<AuthUser>);

#[async_trait]
impl FromRequestParts<AppState> for OptionalAuthUser {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        Ok(OptionalAuthUser(authenticate(parts, state).await.ok()))
    }
}

pub fn build_jwks_client() -> reqwest::Client {
    reqwest::Client::builder()
        .build()
        .expect("failed to build reqwest client")
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::jwk::{
        AlgorithmParameters, CommonParameters, Jwk, RSAKeyParameters, RSAKeyType,
    };
    use jsonwebtoken::{EncodingKey, Header};
    use std::time::{SystemTime, UNIX_EPOCH};

    // Throwaway 2048-bit RSA test keypair, generated locally for these tests only
    // (`openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048`). Never used
    // outside this test module, not the production Firebase signing key.
    const TEST_PRIVATE_KEY_PEM: &str = "-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC0hr+jfA86IfWM
Y/ucACRbPuNnPYHLf66JGRSK0zLG0vTG3wjEB6DvuzhVOglOm3Ya6XkHCVdlcpsL
W1EaNbBdPszFvKFX2VOz/XyrjNFpeixg1tvfnHscyqIqDeOufFHjuWCnxU8ITEAH
JcGUIY4zpjC0Ea+3nPt8XXzbofomMRCTjtxy/icYpXwyJfCPgWLJ7YqUJikjhGvX
9n1QTSB9zzI2J+4axZwAQL6stLlJvtA4qPcfMBx/gkLb+F8kx7yL6l4xqsORe3Bv
j5sCaansQIKqawLXsch0VKylhmpfBWM8lYj32UFUlDA8aYDLdm7aGTLzflc7n1Y3
lws4tk9hAgMBAAECggEAUOj36VEIDhj8UdDaC2Aw60hzaWkyzD9MvZulDld8MYqJ
NLzv09RLeEbkB6a8VyPsOkGcAeBY8Fn+TYe/AM1BX3lvE8zoT1RTZJ9fChBSJ0Ef
tMN3xm/+6beUGN8ixahol3UVcfxH4MM0C0AL09V6Q4Hf4ETxCY1tVZ8c/99IG2cu
8EjldOVPt2J3D6dya+XKToidZhEKZyqhDUeqyyPE+nzJQ0yCjMLcwWl9zUbiwE1D
IBnfSpMWnbYcMHgxeJ7a+IQ6HUFGJrkhcnZX23J/vCTngVK1ibHofBt/F4heQSvr
kqbecTlPv+JwmxzhxoVwdIBnFHFAdGTpI13KvRmbRQKBgQDoAoa3HYsqICdHarxI
tWV+H380xuqkUbfZR9CHLExv0ei96z00QMBYSTN2Xcwjy4TCAHKVW9vK33qpagVe
tXDrwXKlCQupWOB96FcZUQka04SqnDEGQ44SX4+naWgSqeckfKKFrF/c+ukHmlbo
q8LctP1u5n6ElLJ1dA3h7xwBIwKBgQDHMWpoD7W53TQGV4BeGTmD8D4jnKp9MRFc
qJkBWbYaGbnirG2A0KyJTkoh0pot333SzY1k1e8CJEE1qkhlhM1yFc14Ljakzlxr
xdxa4Dy8mnDXb05zqd89poBd5+xD6PBcPO8o6PlRcdXBeMY/XtocaG/UkWbvyn+t
UFo+sZWPqwKBgCxEDx/w6xRmfhgKLVJSCcM+jy6qpSokzUcPhKHFue+7xQQ3Vb4a
fJhbnw3+Z2yM8A9ztmj41b6nVOft6ohfZeQVTKJgT3FIG8zp/3Q9Gdecc7t5gYEI
cpre0LHIUqr877TucrO+Z6vp03w33k0WOF+TyKbYI1t4Y3Q1aFCrJlSxAoGAcR0+
r5k8OS/EO1W1L7pjTuk+YDq3FiCnG1cijAHFx0yUooQIKv5U/CPZNRvDMgmYCf1w
LbLO5whvf2oTcpLXl9GJvJWBslT9ZrYVTAXKd8+8BJrQkh4FB51lh+4L3QSKedag
eTrTWcyq9hL/gTz73uXvm2Z2bfUwS9s1ZCS0KcECgYEAxHNH8x7T1+H3KNq/EI9g
/7HPe3/xsXHSpkkyqjbOefZXlVumIRjpda9x7gnwv1d65Dbu2apdJqQmXxOaF4MY
xTpOSo46judCFN4u3/iRo4U8vau/VUM5ne4L9tJb7tPerPljMM7A0SFZB2CySLEb
8WCuaFvqAqxB0xMEDvLMD/M=
-----END PRIVATE KEY-----";
    const TEST_KID: &str = "test-key-1";
    const TEST_N: &str = "tIa_o3wPOiH1jGP7nAAkWz7jZz2By3-uiRkUitMyxtL0xt8IxAeg77s4VToJTpt2Gul5BwlXZXKbC1tRGjWwXT7MxbyhV9lTs_18q4zRaXosYNbb35x7HMqiKg3jrnxR47lgp8VPCExAByXBlCGOM6YwtBGvt5z7fF1826H6JjEQk47ccv4nGKV8MiXwj4Fiye2KlCYpI4Rr1_Z9UE0gfc8yNifuGsWcAEC-rLS5Sb7QOKj3HzAcf4JC2_hfJMe8i-peMarDkXtwb4-bAmmp7ECCqmsC17HIdFSspYZqXwVjPJWI99lBVJQwPGmAy3Zu2hky835XO59WN5cLOLZPYQ";
    const TEST_E: &str = "AQAB";
    const TEST_PROJECT_ID: &str = "test-project";

    fn test_decoding_key() -> DecodingKey {
        let jwk = Jwk {
            common: CommonParameters {
                key_id: Some(TEST_KID.to_string()),
                ..Default::default()
            },
            algorithm: AlgorithmParameters::RSA(RSAKeyParameters {
                key_type: RSAKeyType::RSA,
                n: TEST_N.to_string(),
                e: TEST_E.to_string(),
            }),
        };
        DecodingKey::from_jwk(&jwk).expect("valid test jwk")
    }

    fn sign_token(claims: &FirebaseClaimsOwned) -> String {
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some(TEST_KID.to_string());
        let key = EncodingKey::from_rsa_pem(TEST_PRIVATE_KEY_PEM.as_bytes())
            .expect("valid test private key");
        jsonwebtoken::encode(&header, claims, &key).expect("token signs")
    }

    #[derive(Serialize)]
    struct FirebaseClaimsOwned {
        sub: String,
        iss: String,
        aud: String,
        exp: usize,
        email: Option<String>,
        name: Option<String>,
        picture: Option<String>,
    }

    fn base_claims() -> FirebaseClaimsOwned {
        let exp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as usize
            + 3600;
        FirebaseClaimsOwned {
            sub: "firebase-uid-123".to_string(),
            iss: format!("https://securetoken.google.com/{TEST_PROJECT_ID}"),
            aud: TEST_PROJECT_ID.to_string(),
            exp,
            email: Some("user@example.com".to_string()),
            name: Some("Test User".to_string()),
            picture: None,
        }
    }

    #[test]
    fn valid_token_verifies() {
        let token = sign_token(&base_claims());
        let key = test_decoding_key();
        let claims = validate_token(&token, &key, TEST_PROJECT_ID).expect("should verify");
        assert_eq!(claims.sub, "firebase-uid-123");
    }

    #[test]
    fn tampered_signature_rejected() {
        let mut token = sign_token(&base_claims());
        token.push('x');
        let key = test_decoding_key();
        assert!(validate_token(&token, &key, TEST_PROJECT_ID).is_err());
    }

    #[test]
    fn wrong_audience_rejected() {
        let mut claims = base_claims();
        claims.aud = "some-other-project".to_string();
        let token = sign_token(&claims);
        let key = test_decoding_key();
        assert!(validate_token(&token, &key, TEST_PROJECT_ID).is_err());
    }

    #[test]
    fn wrong_issuer_rejected() {
        let mut claims = base_claims();
        claims.iss = "https://securetoken.google.com/some-other-project".to_string();
        let token = sign_token(&claims);
        let key = test_decoding_key();
        assert!(validate_token(&token, &key, TEST_PROJECT_ID).is_err());
    }

    #[test]
    fn expired_token_rejected() {
        let mut claims = base_claims();
        claims.exp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as usize
            - 3600;
        let token = sign_token(&claims);
        let key = test_decoding_key();
        assert!(validate_token(&token, &key, TEST_PROJECT_ID).is_err());
    }

    #[test]
    fn unknown_kid_rejected() {
        let token = sign_token(&base_claims());
        let header = jsonwebtoken::decode_header(&token).unwrap();
        assert_eq!(header.kid.as_deref(), Some(TEST_KID));
        // A JwkSet without this kid should fail lookup before we ever try to decode.
        let empty_set = JwkSet { keys: vec![] };
        assert!(empty_set.find(TEST_KID).is_none());
    }

    #[test]
    fn parse_max_age_ok() {
        assert_eq!(
            parse_max_age("public, max-age=21600"),
            Some(Duration::from_secs(21600))
        );
    }

    #[test]
    fn parse_max_age_missing() {
        assert_eq!(parse_max_age("no-cache"), None);
    }

    #[test]
    fn parse_max_age_malformed() {
        assert_eq!(parse_max_age("max-age=notanumber"), None);
    }
}
