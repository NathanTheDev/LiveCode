use axum::{
    body::Bytes,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::AppState;

#[derive(Serialize, sqlx::FromRow)]
pub struct DocumentSummary {
    id: String,
    title: String,
    updated_at: DateTime<Utc>,
}

pub async fn list_documents(State(state): State<AppState>) -> impl IntoResponse {
    let rows = sqlx::query_as::<_, DocumentSummary>(
        "SELECT id, title, updated_at FROM documents ORDER BY updated_at DESC",
    )
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(docs) => Json(docs).into_response(),
        Err(err) => {
            eprintln!("failed to list documents: {err}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

#[derive(Deserialize, Default)]
pub struct CreateDocumentBody {
    #[serde(default)]
    title: Option<String>,
}

pub async fn create_document(
    State(state): State<AppState>,
    Json(body): Json<CreateDocumentBody>,
) -> impl IntoResponse {
    let id = uuid::Uuid::new_v4().to_string();
    let title = body
        .title
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| "Untitled".to_string());

    let result = sqlx::query_as::<_, DocumentSummary>(
        "INSERT INTO documents (id, title) VALUES ($1, $2) RETURNING id, title, updated_at",
    )
    .bind(&id)
    .bind(&title)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(doc) => (StatusCode::CREATED, Json(doc)).into_response(),
        Err(err) => {
            eprintln!("failed to create document: {err}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get_document(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let row = sqlx::query_scalar::<_, Option<Vec<u8>>>(
        "SELECT ydoc_state FROM documents WHERE id = $1",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(Some(bytes))) => (StatusCode::OK, bytes).into_response(),
        Ok(Some(None)) => (StatusCode::OK, Vec::new()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            eprintln!("failed to load document {id}: {err}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn put_document(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Bytes,
) -> impl IntoResponse {
    let result = sqlx::query(
        "INSERT INTO documents (id, ydoc_state, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (id) DO UPDATE SET ydoc_state = EXCLUDED.ydoc_state, updated_at = now()",
    )
    .bind(&id)
    .bind(body.as_ref())
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => StatusCode::NO_CONTENT,
        Err(err) => {
            eprintln!("failed to persist document {id}: {err}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}
