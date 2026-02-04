
use axum::{
    extract::ws::{WebSocket, WebSocketUpgrade, Message},
    response::Response,
};
use axum::extract::State;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use std::collections::HashMap;
use futures::{StreamExt, SinkExt};

type Clients = Arc<RwLock<HashMap<String, broadcast::Sender<String>>>>;

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(clients): State<Clients>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, clients))
}

async fn handle_socket(socket: WebSocket, clients: Clients) {
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = broadcast::channel(100);

    let client_id = uuid::Uuid::new_v4().to_string();
    clients.write().await.insert(client_id.clone(), tx.clone());

    // Spawn task to forward broadcast messages to this client
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages
    let clients_clone = clients.clone();
    let client_id_clone = client_id.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            // Broadcast to all clients
            let clients = clients_clone.read().await;
            for (id, tx) in clients.iter() {
                if id != &client_id_clone {
                    let _ = tx.send(text.clone());
                }
            }
        }
    });

    // Clean up when either task completes
    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    };

    clients.write().await.remove(&client_id);
}

