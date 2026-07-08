use axum::{
    body::Bytes,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::auth::AuthUser;
use crate::AppState;

#[derive(Serialize, sqlx::FromRow)]
pub struct DocumentSummary {
    id: String,
    title: String,
    updated_at: DateTime<Utc>,
}

// GH issue #2 Phase 4: sign-in is required app-wide now, so every route below
// that's reachable from the browser takes `AuthUser` (rejects with 401 via
// the extractor if the token is missing/invalid) rather than the Phase 1
// `OptionalAuthUser`. `get_document`/`put_document` (raw ydoc bytes) are the
// exception - they're only ever called by ysocket's persistence layer
// server-to-server, never by the browser, so they stay ungated here; treat
// them as an internal-only surface.
pub async fn list_documents(State(state): State<AppState>, _user: AuthUser) -> impl IntoResponse {
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
    user: AuthUser,
    Json(body): Json<CreateDocumentBody>,
) -> impl IntoResponse {
    let id = uuid::Uuid::new_v4().to_string();
    let title = body
        .title
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| "Untitled".to_string());
    let owner_id = user.id;

    let result = sqlx::query_as::<_, DocumentSummary>(
        "INSERT INTO documents (id, title, owner_id) VALUES ($1, $2, $3) RETURNING id, title, updated_at",
    )
    .bind(&id)
    .bind(&title)
    .bind(&owner_id)
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

pub async fn get_document_meta(
    State(state): State<AppState>,
    _user: AuthUser,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let row = sqlx::query_as::<_, DocumentSummary>(
        "SELECT id, title, updated_at FROM documents WHERE id = $1",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(doc)) => Json(doc).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            eprintln!("failed to load document meta {id}: {err}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

#[derive(Deserialize)]
pub struct UpdateTitleBody {
    title: String,
}

pub async fn update_document_title(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<UpdateTitleBody>,
) -> impl IntoResponse {
    let title = body.title.trim();
    if title.is_empty() {
        return StatusCode::BAD_REQUEST.into_response();
    }

    // Owner-gated (GH issue #2 Phase 4): 403, not 404, on a non-owner rename
    // attempt - document existence isn't secret here, it's already visible
    // via the public /documents list to any signed-in user. Documents with
    // no owner (created before ownership was enforced) may be renamed by any
    // signed-in user, since there's no real owner to protect.
    let owner_row: Result<Option<Option<String>>, _> =
        sqlx::query_scalar("SELECT owner_id FROM documents WHERE id = $1")
            .bind(&id)
            .fetch_optional(&state.db)
            .await;

    match owner_row {
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Ok(Some(Some(owner_id))) if owner_id != user.id => {
            return StatusCode::FORBIDDEN.into_response();
        }
        Ok(_) => {}
        Err(err) => {
            eprintln!("failed to load owner for document {id}: {err}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }

    let result = sqlx::query_as::<_, DocumentSummary>(
        "UPDATE documents SET title = $2, updated_at = now() WHERE id = $1
         RETURNING id, title, updated_at",
    )
    .bind(&id)
    .bind(title)
    .fetch_optional(&state.db)
    .await;

    match result {
        Ok(Some(doc)) => Json(doc).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            eprintln!("failed to update title for document {id}: {err}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// Internal-only (see the module-level comment): ysocket's persistence layer
// calls this server-to-server on every doc load, not gated by end-user
// Firebase auth. The actual per-user access-control boundary for live
// editing is ysocket's WS upgrade handler, which verifies the connecting
// user's Firebase ID token before it ever reaches this.
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

// Internal-only, same as get_document above.
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
