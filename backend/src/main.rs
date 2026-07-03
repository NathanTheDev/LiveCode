
mod controllers;
use axum::{Router, routing::{get, patch}};
use tower_http::cors::{CorsLayer, Any};
use controllers::documents;
use controllers::hello;
use sqlx::postgres::PgPoolOptions;

pub type Db = sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
       pub db: Db,
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

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

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
        .with_state(AppState { db })
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

