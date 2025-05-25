use axum::{
    Json, Router, Server,
    extract::State,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    routing::{get, put},
};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json;
use std::{
    fs,
    net::SocketAddr,
    process::Command,
    sync::{Arc, Mutex},
};
use tempfile::NamedTempFile;
use tokio::sync::mpsc::{UnboundedSender, unbounded_channel};
use tower_http::cors::{Any, CorsLayer};

#[derive(Serialize, Deserialize, Clone)]
struct CodeText {
    content: String,
}

#[derive(Clone)]
struct AppState {
    clients: Arc<Mutex<Vec<UnboundedSender<String>>>>,
    code_text: Arc<Mutex<CodeText>>,
}

#[tokio::main]
async fn main() {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let state = AppState {
        clients: Arc::new(Mutex::new(Vec::new())),
        code_text: Arc::new(Mutex::new(CodeText {
            content: r#"
#include <stdio.h>
int main() {
    printf("Hello World!\n");
    return 0;
}
            "#
            .to_string(),
        })),
    };

    let app = Router::new()
        .route("/api/CodeText", get(hello_get))
        .route("/api/CodeText", put(hello_put))
        .route("/api/run", get(get_run))
        .route("/ws", get(handle_socket))
        .with_state(state)
        .layer(cors);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    println!("Backend running at http://{}", addr);

    Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

async fn handle_socket(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl axum::response::IntoResponse {
    ws.on_upgrade(|socket| handle_connection(socket, state))
}

async fn handle_connection(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = unbounded_channel();

    state.clients.lock().unwrap().push(tx.clone());

    // update content on connect
    let code_text = state.code_text.lock().unwrap().clone();
    let msg = serde_json::to_string(&code_text).unwrap();
    tx.send(msg).ok();

    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            sender.send(Message::Text(msg)).await.ok();
        }
    });

    let curr_clients = state.clients.clone();
    let receive_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            let clients = curr_clients.lock().unwrap();
            for client in clients.iter() {
                client.send(text.clone()).ok();
            }
        }
    });

    let _ = tokio::join!(send_task, receive_task);
    state
        .clients
        .lock()
        .unwrap()
        .retain(|c| !c.same_channel(&tx));
}

async fn hello_get(State(state): State<AppState>) -> Json<CodeText> {
    let code_text = state.code_text.lock().unwrap().clone();
    Json(code_text)
}

async fn hello_put(State(state): State<AppState>, Json(payload): Json<CodeText>) -> Json<CodeText> {
    let mut code_text = state.code_text.lock().unwrap();
    code_text.content = payload.content.clone();

    // broadcast
    let msg = serde_json::to_string(&*code_text).unwrap();
    let clients = state.clients.lock().unwrap();
    for client in clients.iter() {
        client.send(msg.clone()).ok();
    }

    Json(code_text.clone())
}

async fn get_run(State(state): State<AppState>) -> Json<String> {
    let output = run_code(State(state)).await;
    match output {
        Ok(val) => Json(val),
        _ => Json("encountered error".to_string()),
    }
}

async fn run_code(State(state): State<AppState>) -> std::io::Result<String> {
    let code_text = state.code_text.lock().unwrap();
    let code_text = code_text.content.clone();

    let file = NamedTempFile::new()?;

    let path = file.path().with_extension("c");
    std::fs::rename(file.path(), &path)?;

    fs::write(&path, code_text)?;

    let _ = fs::read_to_string(&path)?;
    let exe_path = path.with_extension("out");

    let output = Command::new("gcc")
        .arg("-x")
        .arg("c")
        .arg(&path)
        .arg("-o")
        .arg(&exe_path)
        .output()?;

    if !output.status.success() {
        eprintln!(
            "Compilation failed:\n{}",
            String::from_utf8_lossy(&output.stderr)
        );
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!(
                "Compilation failed:\n{}",
                String::from_utf8_lossy(&output.stderr)
            ),
        ));
    }

    let output = Command::new(&exe_path).output()?;
    println!("C output:\n{}", String::from_utf8_lossy(&output.stdout));

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
