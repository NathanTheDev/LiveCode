
mod auth;
mod controllers;
use axum::{Router, routing::{get, patch}};
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
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/livecode".to_string());
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

    let cors = CorsLayer::new()
        .allow_origin(Any)
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
    let app = init_router().await;

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await
        .unwrap();

    println!("Server running on http://localhost:3000");

    axum::serve(listener, app)
        .await
        .unwrap();
}

