use axum::{Json, Router, Server, routing::get};
use serde::Serialize;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};

#[derive(Serialize)]
struct Message {
    content: String,
}

async fn hello() -> Json<Message> {
    Json(Message {
        content: "It's Working!!!".to_string(),
    })
}

#[tokio::main]
async fn main() {
    // very permissive CORS (dev only)
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new().route("/api/hello", get(hello)).layer(cors);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    println!("Backend running at http://{}", addr);

    Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}
