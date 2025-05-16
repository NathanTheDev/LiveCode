use axum::{
    Json, Router, Server,
    extract::State,
    routing::{get, put},
};
use serde::{Deserialize, Serialize};
use std::{
    net::SocketAddr,
    sync::{Arc, Mutex},
};
use tower_http::cors::{Any, CorsLayer};

#[derive(Serialize, Deserialize, Clone)]
struct Message {
    content: String,
}

async fn hello_get(State(state): State<Arc<Mutex<Message>>>) -> Json<Message> {
    let message = state.lock().unwrap().clone();
    Json(message)
}

async fn hello_put(
    State(state): State<Arc<Mutex<Message>>>,
    Json(payload): Json<Message>,
) -> Json<Message> {
    let mut message = state.lock().unwrap();
    message.content = payload.content.clone();
    Json(message.clone())
}

#[tokio::main]
async fn main() {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let shared_msg = Arc::new(Mutex::new(Message {
        content: "Enter a message".to_string(),
    }));

    let app = Router::new()
        .route("/api/message", get(hello_get))
        .route("/api/message", put(hello_put))
        .with_state(shared_msg)
        .layer(cors);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    println!("Backend running at http://{}", addr);

    Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}
