
mod auth;
mod controllers;
use axum::{http::HeaderValue, Router, routing::{get, patch}};
use std::sync::Arc;
use tower_http::cors::{CorsLayer, Any};
use controllers::documents;
use controllers::hello;
use controllers::users;
use sqlx::postgres::PgPoolOptions;

pub type Db = sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub firebase_project_id: String,
    pub jwks: Arc<auth::JwksCache>,
}

async fn init_router() -> Router {
    // GH issue #2 Phase 5: same stub-with-warning pattern as FIREBASE_PROJECT_ID
    // below - keeps bare `cargo run` bootable against the default local
    // Postgres without a `.env`, while anywhere else (Docker, Fly) is expected
    // to set DATABASE_URL explicitly; if it doesn't, connect() below fails
    // loudly rather than silently pointing at the wrong database.
    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
        eprintln!(
            "WARNING: DATABASE_URL not set - defaulting to local Postgres at \
             localhost:5432/livecode (see GH issue #2 Phase 5)."
        );
        "postgres://postgres:postgres@localhost:5432/livecode".to_string()
    });
    let db = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("failed to connect to Postgres");
    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("failed to run migrations");

    // STUB (auth roadmap issue #2, Phase 1): no real Firebase project exists yet
    // (that's Phase 6 - infra provisioning). Falling back to a dev placeholder
    // instead of panicking keeps the server bootable for local work on
    // everything else. Firebase's JWKS endpoint is shared across all projects,
    // so token *signature* verification still works against this placeholder -
    // but no real Firebase ID token will ever match this `aud`/`iss`, so every
    // protected route fails closed until the real project id is set.
    let firebase_project_id = std::env::var("FIREBASE_PROJECT_ID").unwrap_or_else(|_| {
        eprintln!(
            "WARNING: FIREBASE_PROJECT_ID not set - using dev stub. \
             Auth-protected routes will reject all tokens until a real Firebase \
             project exists and FIREBASE_PROJECT_ID is set (see GH issue #2)."
        );
        "livecode-dev-stub".to_string()
    });
    let jwks = Arc::new(auth::JwksCache::new(auth::build_jwks_client()));

    // GH issue #2 Phase 5: CORS is env-driven now instead of the previous
    // wide-open `Any`/`Any`/`Any`. Only `allow_origin` is locked down -
    // `Any` methods/headers is standard practice and isn't itself a
    // cross-origin vector once the origin allow-list is restricted (and this
    // API takes bearer tokens, not cookies, so there's no credentialed-Any
    // footgun here). Falls back to the local Vite dev server origin - not
    // `Any` - if unset, so local dev still boots with no `.env`; any
    // non-local deployment must set this explicitly.
    let cors_allowed_origins = std::env::var("CORS_ALLOWED_ORIGINS").unwrap_or_else(|_| {
        eprintln!(
            "WARNING: CORS_ALLOWED_ORIGINS not set - defaulting to http://localhost:5173 \
             (local dev only). Set a comma-separated allow-list of real frontend origins \
             for any non-local deployment (see GH issue #2 Phase 5)."
        );
        "http://localhost:5173".to_string()
    });
    let allowed_origins: Vec<HeaderValue> = cors_allowed_origins
        .split(',')
        .filter_map(|origin| origin.trim().parse().ok())
        .collect();
    let cors = CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods(Any)
        .allow_headers(Any);

    // Route auth policy (Phase 4 of the auth roadmap, superseding Phase 1's stub):
    // sign-in is required app-wide now — anonymous document viewing/editing is
    // no longer supported (a deliberate GH issue #2 Phase 4 decision).
    //   GET   /hello                  public — unrelated health-check-style endpoint
    //   GET   /documents              requires a valid Firebase ID token
    //   POST  /documents              requires a valid Firebase ID token; owner_id = caller
    //   GET   /documents/:id          internal only — called by ysocket's persistence layer
    //                                 server-to-server, never by the browser; the real
    //                                 per-user gate is ysocket's WS upgrade handler
    //   PUT   /documents/:id          internal only, same as above
    //   GET   /documents/:id/meta     requires a valid Firebase ID token
    //   PATCH /documents/:id/title    requires a valid Firebase ID token; owner-gated (403
    //                                 for a non-owner) once a document has an owner —
    //                                 pre-Phase-4 unowned documents may be renamed by
    //                                 any signed-in user
    //   GET   /me                     requires a valid Firebase ID token
    Router::new()
        .route("/hello", get(hello::hello_world))
        .route(
            "/documents",
            get(documents::list_documents).post(documents::create_document),
        )
        .route(
            "/documents/:id",
            get(documents::get_document).put(documents::put_document),
        )
        .route("/documents/:id/meta", get(documents::get_document_meta))
        .route(
            "/documents/:id/title",
            patch(documents::update_document_title),
        )
        .route("/me", get(users::get_me))
        .with_state(AppState { db, firebase_project_id, jwks })
        .layer(cors)
}

#[tokio::main]
async fn main() {
    // GH issue #2 Phase 5: loads a local `.env` if present, for `cargo run`
    // convenience - never required, since Docker/Fly inject real env vars
    // directly and this silently no-ops if no `.env` file exists.
    dotenvy::dotenv().ok();

    let app = init_router().await;

    // GH issue #2 Phase 5: Fly.io (and most PaaS conventions) assign the
    // listen port via $PORT rather than letting the app hardcode one.
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .unwrap();

    println!("Server running on http://0.0.0.0:{port}");

    axum::serve(listener, app)
        .await
        .unwrap();
}

