
mod controllers;
use axum::{Router, routing::get};
use tower_http::cors::{CorsLayer, Any};
use controllers::hello;
use controllers::ws;
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};
use std::collections::HashMap;

type Clients = Arc<RwLock<HashMap<String, broadcast::Sender<String>>>>;

fn init_router() -> Router {
    let clients: Clients = Arc::new(RwLock::new(HashMap::new()));

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/hello", get(hello::hello_world))
        .route("/ws", get(ws::ws_handler))
        .with_state(clients)
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

