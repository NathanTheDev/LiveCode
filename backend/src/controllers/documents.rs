use axum::{
    body::Bytes,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};

use crate::AppState;

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
