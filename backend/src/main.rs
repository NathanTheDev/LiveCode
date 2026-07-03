
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

    let firebase_project_id = std::env::var("FIREBASE_PROJECT_ID")
        .expect("FIREBASE_PROJECT_ID must be set");
    let jwks = Arc::new(auth::JwksCache::new(auth::build_jwks_client()));

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Route auth policy (Phase 1 of the auth roadmap):
    //   GET   /hello                  public
    //   GET   /documents              public
    //   POST  /documents              public; attaches owner_id if a valid token is present (optional auth)
    //   GET   /documents/:id          public (ydoc bytes) — anonymous collaborative editing preserved
    //   PUT   /documents/:id          public (ydoc bytes)
    //   GET   /documents/:id/meta     public
    //   PATCH /documents/:id/title    public
    //   GET   /me                     protected — requires a valid Firebase ID token
    // Owner-gated enforcement of the existing /documents routes (and whether anonymous
    // viewing/editing remains allowed at all) is a Phase 4 decision, not made here.
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

