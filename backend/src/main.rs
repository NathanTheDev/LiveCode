use axum::{
    Json, Router, Server,
    extract::State,
    routing::{get, put},
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    net::SocketAddr,
    process::Command,
    sync::{Arc, Mutex},
};
use tempfile::NamedTempFile;
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

async fn get_run(State(state): State<Arc<Mutex<Message>>>) -> Json<String> {
    let output = run_code(State(state)).await;
    match output {
        Ok(val) => Json(val),
        _ => Json("encountered error".to_string()),
    }
}

async fn run_code(State(state): State<Arc<Mutex<Message>>>) -> std::io::Result<String> {
    // let code = r#"
    // #include <stdio.h>
    // int main() {
    //     printf("Hello World!\n");
    //     return 0;
    // }
    // "#;

    let message = state.lock().unwrap();
    let code = message.content.clone();

    // Create temp file without extension
    let file = NamedTempFile::new()?;

    // Rename to have .c extension
    let path = file.path().with_extension("c");
    std::fs::rename(file.path(), &path)?;

    // Write C code to the renamed file
    fs::write(&path, code)?;

    let _ = fs::read_to_string(&path)?;
    let exe_path = path.with_extension("out");

    // Explicitly specify language is C
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
        .route("/api/run", get(get_run))
        .with_state(shared_msg)
        .layer(cors);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    println!("Backend running at http://{}", addr);

    Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}
