
mod controllers;
use axum::{Router, routing::get};
use tower_http::cors::{CorsLayer, Any};
use controllers::hello;

fn init_router() -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/hello", get(hello::hello_world))
        .layer(cors)
}

#[tokio::main]
async fn main() {
    let app = init_router();

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await
        .unwrap();

    println!("Server running on http://localhost:3000");

    axum::serve(listener, app)
        .await
        .unwrap();
}

